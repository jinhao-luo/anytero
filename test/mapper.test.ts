import { assert } from "chai";
import { toCreatePayload, toUpdatePayload } from "../src/modules/anytype/mapper";
import type { SpaceConfig } from "../src/modules/anytype/mapper";
import type { ZoteroItem } from "../src/modules/zotero/itemReader";

const testConfig: SpaceConfig = {
  spaceId: "space-abc",
  typeKey: "book_note",
  relations: {
    zoteroLink: "rel_zoteroLink",
    authors: "rel_authors",
    year: "rel_year",
    doi: "rel_doi",
    publication: "rel_publication",
    itemType: "rel_itemType",
    tags: "rel_tags",
    zoteroKey: "rel_zoteroKey",
    dateSynced: "rel_dateSynced",
  },
};

function makeItem(overrides: Partial<ZoteroItem> = {}): ZoteroItem {
  return {
    id: 1,
    key: "ITEM001",
    title: "Test Article",
    itemType: "journalArticle",
    creators: [
      { firstName: "John", lastName: "Doe", creatorType: "author" },
      { firstName: "Jane", lastName: "Smith", creatorType: "author" },
    ],
    year: "2023",
    doi: "10.1234/test",
    publication: "Test Journal",
    tags: ["tag1", "tag2"],
    dateModified: "2024-01-01",
    ...overrides,
  };
}

describe("mapper", function () {
  describe("toCreatePayload", function () {
    it("includes type_key from config", function () {
      const payload = toCreatePayload(makeItem(), "body", testConfig);
      assert.strictEqual(payload.type_key, "book_note");
    });

    it("sets name from item title", function () {
      const payload = toCreatePayload(makeItem({ title: "My Paper" }), "", testConfig);
      assert.strictEqual(payload.name, "My Paper");
    });

    it("sets body", function () {
      const payload = toCreatePayload(makeItem(), "## Annotations\ntext", testConfig);
      assert.strictEqual(payload.body, "## Annotations\ntext");
    });

    it("maps zoteroLink relation key as zotero://select URL", function () {
      const payload = toCreatePayload(makeItem({ key: "ITEM001" }), "", testConfig);
      assert.strictEqual(payload.properties!["rel_zoteroLink"], "zotero://select/library/items/ITEM001");
    });

    it("maps authors relation key with 'LastName, FirstName' format", function () {
      const payload = toCreatePayload(makeItem(), "", testConfig);
      assert.strictEqual(payload.properties!["rel_authors"], "Doe, John; Smith, Jane");
    });

    it("only includes creators of type 'author'", function () {
      const item = makeItem({
        creators: [
          { firstName: "John", lastName: "Doe", creatorType: "author" },
          { firstName: "Ed", lastName: "Itor", creatorType: "editor" },
        ],
      });
      const payload = toCreatePayload(item, "", testConfig);
      assert.strictEqual(payload.properties!["rel_authors"], "Doe, John");
      assert.notInclude(payload.properties!["rel_authors"] as string, "Itor");
    });

    it("sets authors to null when no authors exist", function () {
      const payload = toCreatePayload(makeItem({ creators: [] }), "", testConfig);
      assert.isNull(payload.properties!["rel_authors"]);
    });

    it("sets authors to null when all creators are non-author roles", function () {
      const item = makeItem({
        creators: [{ firstName: "Ed", lastName: "Itor", creatorType: "editor" }],
      });
      const payload = toCreatePayload(item, "", testConfig);
      assert.isNull(payload.properties!["rel_authors"]);
    });

    it("maps year relation key", function () {
      const payload = toCreatePayload(makeItem({ year: "2023" }), "", testConfig);
      assert.strictEqual(payload.properties!["rel_year"], "2023");
    });

    it("sets year to null when missing", function () {
      const payload = toCreatePayload(makeItem({ year: null }), "", testConfig);
      assert.isNull(payload.properties!["rel_year"]);
    });

    it("maps doi relation key", function () {
      const payload = toCreatePayload(makeItem({ doi: "10.1234/abc" }), "", testConfig);
      assert.strictEqual(payload.properties!["rel_doi"], "10.1234/abc");
    });

    it("sets doi to null when missing", function () {
      const payload = toCreatePayload(makeItem({ doi: null }), "", testConfig);
      assert.isNull(payload.properties!["rel_doi"]);
    });

    it("maps publication relation key", function () {
      const payload = toCreatePayload(makeItem({ publication: "Nature" }), "", testConfig);
      assert.strictEqual(payload.properties!["rel_publication"], "Nature");
    });

    it("sets publication to null when missing", function () {
      const payload = toCreatePayload(makeItem({ publication: null }), "", testConfig);
      assert.isNull(payload.properties!["rel_publication"]);
    });

    it("maps itemType relation key", function () {
      const payload = toCreatePayload(makeItem({ itemType: "book" }), "", testConfig);
      assert.strictEqual(payload.properties!["rel_itemType"], "book");
    });

    it("maps tags relation key as comma-separated string", function () {
      const payload = toCreatePayload(makeItem({ tags: ["alpha", "beta"] }), "", testConfig);
      assert.strictEqual(payload.properties!["rel_tags"], "alpha, beta");
    });

    it("sets tags to null when empty", function () {
      const payload = toCreatePayload(makeItem({ tags: [] }), "", testConfig);
      assert.isNull(payload.properties!["rel_tags"]);
    });

    it("maps zoteroKey relation key", function () {
      const payload = toCreatePayload(makeItem({ key: "ITEM999" }), "", testConfig);
      assert.strictEqual(payload.properties!["rel_zoteroKey"], "ITEM999");
    });

    it("sets dateSynced as a valid ISO 8601 date string near now", function () {
      const before = Date.now();
      const payload = toCreatePayload(makeItem(), "", testConfig);
      const after = Date.now();
      const synced = new Date(payload.properties!["rel_dateSynced"] as string).getTime();
      assert.isAtLeast(synced, before);
      assert.isAtMost(synced, after);
    });

    it("uses custom relation keys from config", function () {
      const customConfig: SpaceConfig = {
        ...testConfig,
        relations: { ...testConfig.relations, authors: "custom_authors_key" },
      };
      const payload = toCreatePayload(makeItem(), "", customConfig);
      assert.property(payload.properties!, "custom_authors_key");
      assert.notProperty(payload.properties!, "rel_authors");
    });
  });

  describe("toUpdatePayload", function () {
    it("does not include type_key", function () {
      const payload = toUpdatePayload(makeItem(), "", testConfig);
      assert.notProperty(payload, "type_key");
    });

    it("sets name from item title", function () {
      const payload = toUpdatePayload(makeItem({ title: "Updated Title" }), "", testConfig);
      assert.strictEqual(payload.name, "Updated Title");
    });

    it("sets body", function () {
      const payload = toUpdatePayload(makeItem(), "new body", testConfig);
      assert.strictEqual(payload.body, "new body");
    });

    it("includes all relation properties", function () {
      const payload = toUpdatePayload(makeItem(), "", testConfig);
      const props = payload.properties!;
      assert.property(props, "rel_zoteroLink");
      assert.property(props, "rel_authors");
      assert.property(props, "rel_year");
      assert.property(props, "rel_doi");
      assert.property(props, "rel_publication");
      assert.property(props, "rel_itemType");
      assert.property(props, "rel_tags");
      assert.property(props, "rel_zoteroKey");
      assert.property(props, "rel_dateSynced");
    });

    it("produces same properties as toCreatePayload (minus type_key)", function () {
      const item = makeItem();
      const create = toCreatePayload(item, "body", testConfig);
      const update = toUpdatePayload(item, "body", testConfig);
      // All property keys should match
      const createKeys = Object.keys(create.properties!).sort();
      const updateKeys = Object.keys(update.properties!).sort();
      assert.deepEqual(createKeys, updateKeys);
    });
  });
});
