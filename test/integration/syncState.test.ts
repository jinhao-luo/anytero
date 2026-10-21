import { assert } from "chai";
import { SyncState } from "../../src/modules/sync/syncState";

// SyncState uses Zotero.Prefs for persistence (available in the Zotero test environment).
// Each test clears state before and after to avoid interference with real prefs.

describe("SyncState", function () {
  let state: SyncState;
  let prefKey: string;

  beforeEach(function () {
    prefKey = `extensions.zotero.anytero.testState.${Zotero.Utilities.randomString(20)}`;
    state = new SyncState(prefKey);
    state.clear();
  });

  afterEach(function () {
    state.clear();
  });

  describe("getObjectId", function () {
    it("returns null for an unknown key", function () {
      assert.isNull(state.getObjectId("MISSING"));
    });

    it("returns the stored object ID after set", function () {
      state.set("KEY1", "obj-abc");
      assert.strictEqual(state.getObjectId("KEY1"), "obj-abc");
    });

    it("returns null after the key has been removed", function () {
      state.set("KEY1", "obj-abc");
      state.remove("KEY1");
      assert.isNull(state.getObjectId("KEY1"));
    });
  });

  describe("set", function () {
    it("stores a new key-value mapping", function () {
      state.set("KEY1", "obj-111");
      assert.strictEqual(state.getObjectId("KEY1"), "obj-111");
    });

    it("overwrites an existing mapping", function () {
      state.set("KEY1", "obj-111");
      state.set("KEY1", "obj-222");
      assert.strictEqual(state.getObjectId("KEY1"), "obj-222");
    });

    it("stores multiple independent mappings", function () {
      state.set("KEY1", "obj-1");
      state.set("KEY2", "obj-2");
      assert.strictEqual(state.getObjectId("KEY1"), "obj-1");
      assert.strictEqual(state.getObjectId("KEY2"), "obj-2");
    });
  });

  describe("remove", function () {
    it("deletes an existing key", function () {
      state.set("KEY1", "obj-abc");
      state.remove("KEY1");
      assert.isNull(state.getObjectId("KEY1"));
    });

    it("does not throw when removing a non-existent key", function () {
      assert.doesNotThrow(() => state.remove("NONEXISTENT"));
    });

    it("only removes the targeted key, leaving others intact", function () {
      state.set("KEY1", "obj-1");
      state.set("KEY2", "obj-2");
      state.remove("KEY1");
      assert.isNull(state.getObjectId("KEY1"));
      assert.strictEqual(state.getObjectId("KEY2"), "obj-2");
    });
  });

  describe("getAll", function () {
    it("returns an empty object when no mappings exist", function () {
      assert.deepEqual(state.getAll(), {});
    });

    it("returns all stored mappings", function () {
      state.set("KEY1", "obj-1");
      state.set("KEY2", "obj-2");
      assert.deepEqual(state.getAll(), { KEY1: "obj-1", KEY2: "obj-2" });
    });

    it("reflects removals", function () {
      state.set("KEY1", "obj-1");
      state.set("KEY2", "obj-2");
      state.remove("KEY1");
      assert.deepEqual(state.getAll(), { KEY2: "obj-2" });
    });
  });

  describe("clear", function () {
    it("removes all stored mappings", function () {
      state.set("KEY1", "obj-1");
      state.set("KEY2", "obj-2");
      state.clear();
      assert.deepEqual(state.getAll(), {});
    });

    it("makes all keys return null after clearing", function () {
      state.set("KEY1", "obj-1");
      state.clear();
      assert.isNull(state.getObjectId("KEY1"));
    });

    it("is idempotent on an already-empty state", function () {
      assert.doesNotThrow(() => state.clear());
      assert.deepEqual(state.getAll(), {});
    });
  });

  describe("malformed mappings", function () {
    it("fails closed instead of discarding mappings and duplicating pages", function () {
      Zotero.Prefs.set(prefKey, "not-valid-json", true);
      assert.throws(() => state.getAll(), "mapping preference is malformed");
    });
  });
});
