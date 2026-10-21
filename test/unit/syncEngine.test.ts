import { assert } from "chai";
import { SyncEngine } from "../../src/modules/sync/syncEngine";
import { AnytypeHttpError } from "../../src/modules/anytype/client";

function harness() {
  const data: Record<string, string> = {};
  const item: any = {
    id: 1,
    key: "PAPER001",
    title: "Paper",
    libraryID: 1,
    isAttachment: () => false,
    isAnnotation: () => false,
    isNote: () => false,
    getCollections: () => [10],
  };
  const calls = { creates: [] as any[], pdf: [] as any[], deleted: 0 };
  (globalThis as any).Zotero = {
    Libraries: { userLibraryID: 1 },
    Prefs: { get: () => "10" },
    Collections: { get: () => ({ libraryID: 1 }), getByParent: () => [] },
    Items: { get: () => item },
    debug: () => {},
  };
  const state: any = {
    getObjectId: (k: string) => data[k] ?? null,
    set: (k: string, id: string) => {
      data[k] = id;
    },
    remove: (k: string) => {
      delete data[k];
    },
  };
  const client: any = {
    getObject: async () => ({
      archived: false,
      properties: [
        { key: "zotero", url: "zotero://select/library/items/PAPER001" },
      ],
    }),
    listSpaces: async () => [{ id: "space" }],
    createObject: async (_space: string, payload: any) => {
      calls.creates.push(payload);
      return "new-page";
    },
    updateObject: async () => assert.fail("Whole-body updates are forbidden"),
    deleteObject: async () => {
      calls.deleted++;
    },
  };
  const reader: any = {
    getItem: () => item,
    getAllItemsWithAnnotations: async () => [item],
    getAnnotations: () => assert.fail("Annotation text must never be read"),
  };
  const pdf: any = {
    sync: async (...args: any[]) => {
      calls.pdf.push(args);
    },
  };
  const engine = new SyncEngine(reader, client, state, pdf);
  engine.setSpaceConfig({
    spaceId: "space",
    typeKey: "paper",
    relations: { zoteroLink: "zotero" },
  });
  return { engine, calls, data, client, reader, item, pdf };
}

describe("v0.1.9 PDF-only engine port", function () {
  it("creates an empty page through v1 and delegates PDF rendering", async function () {
    const h = harness();
    await h.engine.syncItem(1);
    assert.equal(h.calls.creates[0].body, "");
    assert.equal(h.calls.creates[0].type_key, "paper");
    assert.equal(h.data.PAPER001, "new-page");
    assert.isTrue(h.calls.pdf[0][4]);
  });

  it("preserves existing pages and serializes concurrent events", async function () {
    const h = harness();
    h.data.PAPER001 = "existing";
    await Promise.all([h.engine.syncItem(1), h.engine.syncItem(1)]);
    assert.isEmpty(h.calls.creates);
    assert.equal(h.calls.pdf[0][3], "existing");
    assert.isFalse(h.calls.pdf[0][4]);
  });

  it("recreates a definitively deleted page", async function () {
    const h = harness();
    h.data.PAPER001 = "gone";
    h.client.getObject = async () => {
      throw new AnytypeHttpError(410);
    };
    await h.engine.syncItem(1);
    assert.lengthOf(h.calls.creates, 1);
  });

  it("never creates duplicates on API failure or relation mismatch", async function () {
    const h = harness();
    h.data.PAPER001 = "existing";
    h.client.getObject = async () => {
      throw new AnytypeHttpError(500);
    };
    try {
      await h.engine.syncItem(1);
      assert.fail();
    } catch (error) {
      assert.include(String(error), "500");
    }
    assert.isEmpty(h.calls.creates);
    assert.equal(h.data.PAPER001, "existing");
    h.client.getObject = async () => ({ archived: false, properties: [] });
    try {
      await h.engine.syncItem(1);
      assert.fail();
    } catch (error) {
      assert.include(String(error), "unexpected Zotero link");
    }
    assert.isEmpty(h.calls.creates);
  });

  it("does not recreate a page when its destination space is inaccessible", async function () {
    const h = harness();
    h.data.PAPER001 = "existing";
    h.client.getObject = async () => {
      throw new AnytypeHttpError(404);
    };
    h.client.listSpaces = async () => [];
    try {
      await h.engine.syncItem(1);
      assert.fail();
    } catch (error) {
      assert.include(String(error), "space is unavailable");
    }
    assert.equal(h.data.PAPER001, "existing");
    assert.isEmpty(h.calls.creates);
  });

  it("skips items outside the collection and preserves mappings on source deletion", async function () {
    const h = harness();
    h.item.getCollections = () => [99];
    h.data.PAPER001 = "existing";
    await h.engine.syncItem(1);
    await h.engine.deleteItem("PAPER001");
    assert.isEmpty(h.calls.pdf);
    assert.equal(h.calls.deleted, 0);
    assert.equal(h.data.PAPER001, "existing");
  });

  it("continues collection sync after a paper failure without pruning old mappings", async function () {
    const h = harness();
    h.data.UNRELATED = "keep";
    h.pdf.sync = async () => {
      throw new Error("PDF error");
    };
    assert.equal(await h.engine.fullSync(), 1);
    assert.equal(h.data.UNRELATED, "keep");
  });
});
