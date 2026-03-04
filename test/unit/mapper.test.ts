import { assert } from "chai";
import { toCreatePayload, toUpdatePayload } from "../../src/modules/anytype/mapper";
import type { SpaceConfig } from "../../src/modules/anytype/mapper";
import type { ZoteroItem } from "../../src/modules/zotero/itemReader";

const testConfig: SpaceConfig = {
  spaceId: "space-abc",
  typeKey: "book_note",
  relations: {
    zoteroLink: "rel_zoteroLink",
  },
};

function makeItem(overrides: Partial<ZoteroItem> = {}): ZoteroItem {
  return {
    id: 1,
    key: "ITEM001",
    title: "Test Article",
    itemType: "journalArticle",
    creators: [{ firstName: "John", lastName: "Doe", creatorType: "author" }],
    year: "2023",
    doi: "10.1234/test",
    publication: "Test Journal",
    tags: ["tag1"],
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

    it("includes zoteroLink property with zotero://select URL", function () {
      const payload = toCreatePayload(makeItem({ key: "ITEM001" }), "", testConfig);
      const prop = payload.properties!.find((p) => p.key === "rel_zoteroLink") as any;
      assert.isDefined(prop);
      assert.strictEqual(prop.url, "zotero://select/library/items/ITEM001");
    });

    it("uses zoteroLink relation key from config", function () {
      const customConfig: SpaceConfig = {
        ...testConfig,
        relations: { zoteroLink: "custom_link_key" },
      };
      const payload = toCreatePayload(makeItem(), "", customConfig);
      const prop = payload.properties!.find((p) => p.key === "custom_link_key");
      assert.isDefined(prop);
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

    it("sets markdown body", function () {
      const payload = toUpdatePayload(makeItem(), "new body", testConfig);
      assert.strictEqual(payload.markdown, "new body");
    });

    it("includes zoteroLink property with zotero://select URL", function () {
      const payload = toUpdatePayload(makeItem({ key: "ITEM001" }), "", testConfig);
      const prop = payload.properties!.find((p) => p.key === "rel_zoteroLink") as any;
      assert.isDefined(prop);
      assert.strictEqual(prop.url, "zotero://select/library/items/ITEM001");
    });
  });
});
