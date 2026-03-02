import { assert } from "chai";
import { SyncEngine } from "../src/modules/sync/syncEngine";
import type { ItemReader, ZoteroItem, ZoteroAnnotation } from "../src/modules/zotero/itemReader";
import type { AnytypeClient } from "../src/modules/anytype/client";
import type { SpaceConfig } from "../src/modules/anytype/mapper";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const testConfig: SpaceConfig = {
  spaceId: "space-test",
  typeKey: "zotero_item",
  relations: {
    zoteroLink: "rel_zoteroLink",
  },
};

function makeZoteroItem(overrides: Partial<ZoteroItem> = {}): ZoteroItem {
  return {
    id: 1,
    key: "ITEM001",
    title: "Test Paper",
    itemType: "journalArticle",
    creators: [{ firstName: "John", lastName: "Doe", creatorType: "author" }],
    year: "2023",
    doi: null,
    publication: null,
    tags: [],
    dateModified: "2024-01-01",
    ...overrides,
  };
}

function makeAnnotation(overrides: Partial<ZoteroAnnotation> = {}): ZoteroAnnotation {
  return {
    id: 10,
    key: "ANN001",
    annotationType: "highlight",
    text: "Important passage",
    comment: null,
    color: null,
    pageLabel: "1",
    position: null,
    tags: [],
    dateModified: "2024-01-01",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Minimal mock implementations
// ---------------------------------------------------------------------------

interface CallLog {
  createObject: Array<{ spaceId: string; payload: unknown }>;
  updateObject: Array<{ spaceId: string; objectId: string; payload: unknown }>;
  deleteObject: Array<{ spaceId: string; objectId: string }>;
}

function makeClient(createObjectReturn = "new-obj-id"): [AnytypeClient, CallLog] {
  const calls: CallLog = { createObject: [], updateObject: [], deleteObject: [] };
  const client = {
    async createObject(spaceId: string, payload: unknown): Promise<string> {
      calls.createObject.push({ spaceId, payload });
      return createObjectReturn;
    },
    async updateObject(spaceId: string, objectId: string, payload: unknown): Promise<void> {
      calls.updateObject.push({ spaceId, objectId, payload });
    },
    async deleteObject(spaceId: string, objectId: string): Promise<void> {
      calls.deleteObject.push({ spaceId, objectId });
    },
    listSpaces: async () => [],
    listTypes: async () => [],
    createRelation: async () => "",
  } as unknown as AnytypeClient;
  return [client, calls];
}

interface StateStore {
  [key: string]: string;
}

function makeState(initial: StateStore = {}) {
  const store: StateStore = { ...initial };
  return {
    state: {
      getObjectId: (key: string) => store[key] ?? null,
      set: (key: string, id: string) => { store[key] = id; },
      remove: (key: string) => { delete store[key]; },
      getAll: () => ({ ...store }),
      clear: () => { for (const k of Object.keys(store)) delete store[k]; },
    },
    store,
  };
}

function makeItemReader(
  items: ZoteroItem[],
  annotations: ZoteroAnnotation[] = [makeAnnotation()],
): ItemReader {
  const byId = new Map(items.map((i) => [i.id, i]));
  return {
    getItem: (id: number) => byId.get(id) ?? null,
    getAnnotations: (_item: ZoteroItem) => annotations,
    getAllItemsWithAnnotations: async () => items,
  } as unknown as ItemReader;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SyncEngine", function () {
  describe("syncItem — no space config", function () {
    it("does nothing when spaceConfig is not set", async function () {
      const [client, calls] = makeClient();
      const { state } = makeState();
      const item = makeZoteroItem();
      const engine = new SyncEngine(
        makeItemReader([item]),
        client,
        state as any,
      );
      await engine.syncItem(item.id);
      assert.isEmpty(calls.createObject);
      assert.isEmpty(calls.updateObject);
    });
  });

  describe("syncItem — item not found", function () {
    it("does nothing when getItem returns null", async function () {
      const [client, calls] = makeClient();
      const { state } = makeState();
      const engine = new SyncEngine(
        makeItemReader([]), // no items
        client,
        state as any,
      );
      engine.setSpaceConfig(testConfig);
      await engine.syncItem(999);
      assert.isEmpty(calls.createObject);
      assert.isEmpty(calls.updateObject);
    });
  });

  describe("syncItem — create branch", function () {
    it("calls createObject when item has no existing mapping", async function () {
      const [client, calls] = makeClient("obj-created");
      const { state, store } = makeState(); // empty state
      const item = makeZoteroItem();
      const engine = new SyncEngine(makeItemReader([item]), client, state as any);
      engine.setSpaceConfig(testConfig);

      await engine.syncItem(item.id);

      assert.lengthOf(calls.createObject, 1);
      assert.isEmpty(calls.updateObject);
      assert.strictEqual(calls.createObject[0].spaceId, "space-test");
    });

    it("saves the returned object ID to state after create", async function () {
      const [client] = makeClient("obj-created");
      const { state, store } = makeState();
      const item = makeZoteroItem({ key: "ITEM001" });
      const engine = new SyncEngine(makeItemReader([item]), client, state as any);
      engine.setSpaceConfig(testConfig);

      await engine.syncItem(item.id);

      assert.strictEqual(store["ITEM001"], "obj-created");
    });

    it("passes type_key in the create payload", async function () {
      const [client, calls] = makeClient();
      const { state } = makeState();
      const item = makeZoteroItem();
      const engine = new SyncEngine(makeItemReader([item]), client, state as any);
      engine.setSpaceConfig(testConfig);

      await engine.syncItem(item.id);

      const payload = calls.createObject[0].payload as any;
      assert.strictEqual(payload.type_key, "zotero_item");
    });
  });

  describe("syncItem — update branch", function () {
    it("calls updateObject when item already has a mapping", async function () {
      const [client, calls] = makeClient();
      const item = makeZoteroItem({ key: "ITEM001" });
      const { state } = makeState({ ITEM001: "existing-obj-id" });
      const engine = new SyncEngine(makeItemReader([item]), client, state as any);
      engine.setSpaceConfig(testConfig);

      await engine.syncItem(item.id);

      assert.isEmpty(calls.createObject);
      assert.lengthOf(calls.updateObject, 1);
      assert.strictEqual(calls.updateObject[0].objectId, "existing-obj-id");
      assert.strictEqual(calls.updateObject[0].spaceId, "space-test");
    });

    it("does not overwrite state entry on update", async function () {
      const [client] = makeClient();
      const item = makeZoteroItem({ key: "ITEM001" });
      const { state, store } = makeState({ ITEM001: "existing-obj-id" });
      const engine = new SyncEngine(makeItemReader([item]), client, state as any);
      engine.setSpaceConfig(testConfig);

      await engine.syncItem(item.id);

      assert.strictEqual(store["ITEM001"], "existing-obj-id");
    });

    it("update payload does not include type_key", async function () {
      const [client, calls] = makeClient();
      const item = makeZoteroItem({ key: "ITEM001" });
      const { state } = makeState({ ITEM001: "existing-obj-id" });
      const engine = new SyncEngine(makeItemReader([item]), client, state as any);
      engine.setSpaceConfig(testConfig);

      await engine.syncItem(item.id);

      const payload = calls.updateObject[0].payload as any;
      assert.notProperty(payload, "type_key");
    });
  });

  describe("syncItem — error handling", function () {
    it("does not throw when client.createObject rejects", async function () {
      const failClient = {
        createObject: async () => { throw new Error("API down"); },
        updateObject: async () => {},
        deleteObject: async () => {},
        listSpaces: async () => [],
        searchObjects: async () => [],
        createType: async () => "",
        createRelation: async () => "",
      } as unknown as AnytypeClient;

      const { state } = makeState();
      const item = makeZoteroItem();
      const engine = new SyncEngine(makeItemReader([item]), failClient, state as any);
      engine.setSpaceConfig(testConfig);

      // SyncEngine catches errors internally; the promise should resolve
      await engine.syncItem(item.id);
    });

    it("does not throw when client.updateObject rejects", async function () {
      const failClient = {
        createObject: async () => "id",
        updateObject: async () => { throw new Error("API down"); },
        deleteObject: async () => {},
        listSpaces: async () => [],
        searchObjects: async () => [],
        createType: async () => "",
        createRelation: async () => "",
      } as unknown as AnytypeClient;

      const item = makeZoteroItem({ key: "ITEM001" });
      const { state } = makeState({ ITEM001: "existing-id" });
      const engine = new SyncEngine(makeItemReader([item]), failClient, state as any);
      engine.setSpaceConfig(testConfig);

      // SyncEngine catches errors internally; the promise should resolve
      await engine.syncItem(item.id);
    });
  });

  describe("deleteItem", function () {
    it("does nothing when spaceConfig is not set", async function () {
      const [client, calls] = makeClient();
      const { state } = makeState({ ITEM001: "obj-id" });
      const engine = new SyncEngine(makeItemReader([]), client, state as any);

      await engine.deleteItem("ITEM001");

      assert.isEmpty(calls.deleteObject);
    });

    it("does nothing when item has no state mapping", async function () {
      const [client, calls] = makeClient();
      const { state } = makeState(); // empty
      const engine = new SyncEngine(makeItemReader([]), client, state as any);
      engine.setSpaceConfig(testConfig);

      await engine.deleteItem("ITEM001");

      assert.isEmpty(calls.deleteObject);
    });

    it("calls deleteObject with correct spaceId and objectId", async function () {
      const [client, calls] = makeClient();
      const { state } = makeState({ ITEM001: "obj-to-delete" });
      const engine = new SyncEngine(makeItemReader([]), client, state as any);
      engine.setSpaceConfig(testConfig);

      await engine.deleteItem("ITEM001");

      assert.lengthOf(calls.deleteObject, 1);
      assert.strictEqual(calls.deleteObject[0].spaceId, "space-test");
      assert.strictEqual(calls.deleteObject[0].objectId, "obj-to-delete");
    });

    it("removes the state entry after successful delete", async function () {
      const [client] = makeClient();
      const { state, store } = makeState({ ITEM001: "obj-to-delete" });
      const engine = new SyncEngine(makeItemReader([]), client, state as any);
      engine.setSpaceConfig(testConfig);

      await engine.deleteItem("ITEM001");

      assert.isUndefined(store["ITEM001"]);
    });

    it("does not throw when deleteObject rejects", async function () {
      const failClient = {
        createObject: async () => "id",
        updateObject: async () => {},
        deleteObject: async () => { throw new Error("not found"); },
        listSpaces: async () => [],
        searchObjects: async () => [],
        createType: async () => "",
        createRelation: async () => "",
      } as unknown as AnytypeClient;

      const { state } = makeState({ ITEM001: "obj-id" });
      const engine = new SyncEngine(makeItemReader([]), failClient, state as any);
      engine.setSpaceConfig(testConfig);

      // SyncEngine catches errors internally; the promise should resolve
      await engine.deleteItem("ITEM001");
    });
  });

  describe("fullSync", function () {
    it("returns 0 and does nothing when spaceConfig is not set", async function () {
      const [client, calls] = makeClient();
      const { state } = makeState();
      const item = makeZoteroItem();
      const engine = new SyncEngine(makeItemReader([item]), client, state as any);

      const count = await engine.fullSync();

      assert.strictEqual(count, 0);
      assert.isEmpty(calls.createObject);
    });

    it("returns the number of items synced", async function () {
      const [client] = makeClient();
      const { state } = makeState();
      const items = [makeZoteroItem({ id: 1, key: "K1" }), makeZoteroItem({ id: 2, key: "K2" })];
      const engine = new SyncEngine(makeItemReader(items), client, state as any);
      engine.setSpaceConfig(testConfig);

      const count = await engine.fullSync();

      assert.strictEqual(count, 2);
    });

    it("calls syncItem for each item returned by getAllItemsWithAnnotations", async function () {
      const [client, calls] = makeClient();
      const { state } = makeState();
      const items = [makeZoteroItem({ id: 1, key: "K1" }), makeZoteroItem({ id: 2, key: "K2" })];
      const engine = new SyncEngine(makeItemReader(items), client, state as any);
      engine.setSpaceConfig(testConfig);

      await engine.fullSync();

      assert.lengthOf(calls.createObject, 2);
    });

    it("invokes progress callback for each item", async function () {
      const [client] = makeClient();
      const { state } = makeState();
      const items = [makeZoteroItem({ id: 1, key: "K1" }), makeZoteroItem({ id: 2, key: "K2" })];
      const engine = new SyncEngine(makeItemReader(items), client, state as any);
      engine.setSpaceConfig(testConfig);

      const progressReports: Array<{ current: number; total: number }> = [];
      await engine.fullSync((p) => progressReports.push({ ...p }));

      assert.deepEqual(progressReports, [
        { current: 1, total: 2 },
        { current: 2, total: 2 },
      ]);
    });

    it("prunes state entries for items no longer in Zotero", async function () {
      const [client] = makeClient();
      // State has two entries; only K1 is returned by getAllItemsWithAnnotations
      const { state, store } = makeState({ K1: "obj-1", STALE: "obj-stale" });
      const items = [makeZoteroItem({ id: 1, key: "K1" })];
      const engine = new SyncEngine(makeItemReader(items), client, state as any);
      engine.setSpaceConfig(testConfig);

      await engine.fullSync();

      assert.notProperty(store, "STALE");
    });

    it("keeps state entries for items that are still active", async function () {
      const [client] = makeClient();
      const { state, store } = makeState({ K1: "obj-1" });
      const items = [makeZoteroItem({ id: 1, key: "K1" })];
      const engine = new SyncEngine(makeItemReader(items), client, state as any);
      engine.setSpaceConfig(testConfig);

      await engine.fullSync();

      // K1 should still exist (updated, not pruned)
      assert.property(store, "K1");
    });

    it("handles empty item list gracefully, returning 0", async function () {
      const [client] = makeClient();
      const { state } = makeState({ STALE: "obj-stale" });
      const engine = new SyncEngine(makeItemReader([]), client, state as any);
      engine.setSpaceConfig(testConfig);

      const count = await engine.fullSync();

      assert.strictEqual(count, 0);
      // Stale entry should be pruned since no active items
      assert.notProperty(state.getAll(), "STALE");
    });
  });
});
