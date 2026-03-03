import { assert } from "chai";
import {
  buildAnnotationLink,
  renderSingleAnnotation,
  joinAnnotations,
  appendAnnotations,
} from "../src/modules/anytype/bodyRenderer";
import type { ZoteroAnnotation } from "../src/modules/zotero/itemReader";

function makeAnnotation(overrides: Partial<ZoteroAnnotation> = {}): ZoteroAnnotation {
  return {
    id: 1,
    key: "ANN0001",
    attachmentKey: "ATT0001",
    annotationType: "highlight",
    text: "some highlighted text",
    comment: null,
    color: "#ffff00",
    pageLabel: "5",
    position: null,
    tags: [],
    dateModified: "2024-01-01",
    ...overrides,
  };
}

describe("bodyRenderer", function () {
  describe("buildAnnotationLink", function () {
    it("builds a zotero://open-pdf URL with page and annotation params", function () {
      const ann = makeAnnotation({ attachmentKey: "ATT001", key: "ANN001", pageLabel: "3" });
      const url = buildAnnotationLink(ann);
      assert.match(url, /^zotero:\/\/open-pdf\/library\/items\/ATT001\?/);
      assert.include(url, "page=3");
      assert.include(url, "annotation=ANN001");
    });

    it("omits page param when pageLabel is null", function () {
      const ann = makeAnnotation({ pageLabel: null });
      const url = buildAnnotationLink(ann);
      assert.notInclude(url, "page=");
      assert.include(url, "annotation=ANN0001");
    });

    it("uses the attachmentKey in the URL path", function () {
      const ann = makeAnnotation({ attachmentKey: "XYZABC" });
      const url = buildAnnotationLink(ann);
      assert.include(url, "/library/items/XYZABC?");
    });
  });

  describe("renderSingleAnnotation", function () {
    it("renders highlighted text as a markdown link", function () {
      const ann = makeAnnotation({ text: "Hello world", pageLabel: "1" });
      const result = renderSingleAnnotation(ann);
      assert.match(result, /^\[Hello world\]\(zotero:\/\/open-pdf\//);
    });

    it("uses 'Image annotation' for image type", function () {
      const ann = makeAnnotation({ annotationType: "image", text: null });
      const result = renderSingleAnnotation(ann);
      assert.match(result, /^\[Image annotation\]\(/);
    });

    it("uses 'Ink annotation' for ink type", function () {
      const ann = makeAnnotation({ annotationType: "ink", text: null });
      const result = renderSingleAnnotation(ann);
      assert.match(result, /^\[Ink annotation\]\(/);
    });

    it("uses 'Note' when text is null and type is note", function () {
      const ann = makeAnnotation({ annotationType: "note", text: null });
      const result = renderSingleAnnotation(ann);
      assert.match(result, /^\[Note\]\(/);
    });

    it("appends comment block when comment is present", function () {
      const ann = makeAnnotation({ comment: "interesting point" });
      const result = renderSingleAnnotation(ann);
      assert.include(result, "\n\n💬 interesting point");
    });

    it("omits comment block when comment is null", function () {
      const ann = makeAnnotation({ comment: null });
      assert.notInclude(renderSingleAnnotation(ann), "💬");
    });

    it("appends tag line when tags are present", function () {
      const ann = makeAnnotation({ tags: ["important", "todo"] });
      const result = renderSingleAnnotation(ann);
      assert.include(result, "🏷️ `important` `todo`");
    });

    it("omits tag line when tags list is empty", function () {
      const ann = makeAnnotation({ tags: [] });
      assert.notInclude(renderSingleAnnotation(ann), "🏷️");
    });

    it("renders comment and tags together in order", function () {
      const ann = makeAnnotation({ comment: "my note", tags: ["key"] });
      const result = renderSingleAnnotation(ann);
      const commentIdx = result.indexOf("💬");
      const tagIdx = result.indexOf("🏷️");
      assert.isAbove(tagIdx, commentIdx);
    });
  });

  describe("joinAnnotations", function () {
    it("returns empty string for empty list", function () {
      assert.strictEqual(joinAnnotations([]), "");
    });

    it("returns single annotation for one-element list", function () {
      const ann = makeAnnotation();
      assert.strictEqual(joinAnnotations([ann]), renderSingleAnnotation(ann));
    });

    it("joins multiple annotations with the separator", function () {
      const a = makeAnnotation({ key: "A", text: "first" });
      const b = makeAnnotation({ key: "B", text: "second" });
      const result = joinAnnotations([a, b]);
      assert.include(result, renderSingleAnnotation(a));
      assert.include(result, renderSingleAnnotation(b));
      // Separator is four newlines between blocks
      const sep = "\n\n\n\n";
      assert.include(result, sep);
    });
  });

  describe("appendAnnotations", function () {
    it("returns just new annotations when existingBody is empty", function () {
      const ann = makeAnnotation();
      const result = appendAnnotations("", [ann]);
      assert.strictEqual(result, joinAnnotations([ann]));
    });

    it("appends with separator when existingBody is non-empty", function () {
      const existing = "existing content";
      const ann = makeAnnotation({ text: "new highlight" });
      const result = appendAnnotations(existing, [ann]);
      assert.isTrue(result.startsWith("existing content"));
      assert.include(result, joinAnnotations([ann]));
      // Separator is present between old and new content
      assert.include(result, "\n\n\n\n");
    });

    it("returns empty string when both body and annotations are empty", function () {
      assert.strictEqual(appendAnnotations("", []), "");
    });
  });
});
