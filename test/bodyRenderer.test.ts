import { assert } from "chai";
import { renderAnnotationBody } from "../src/modules/anytype/bodyRenderer";
import type { ZoteroAnnotation } from "../src/modules/zotero/itemReader";

function makeAnnotation(overrides: Partial<ZoteroAnnotation> = {}): ZoteroAnnotation {
  return {
    id: 1,
    key: "ANN001",
    attachmentKey: "ATT001",
    annotationType: "highlight",
    text: "Sample text",
    comment: null,
    color: null,
    pageLabel: "5",
    position: null,
    tags: [],
    dateModified: "2024-01-01",
    ...overrides,
  };
}

describe("bodyRenderer", function () {
  describe("renderAnnotationBody", function () {
    it("returns empty string for empty annotations", function () {
      assert.strictEqual(renderAnnotationBody([]), "");
    });

    it("starts with '## Annotations' heading", function () {
      const result = renderAnnotationBody([makeAnnotation()]);
      assert.match(result, /^## Annotations/);
    });

    it("renders highlight annotation as markdown link with text", function () {
      const ann = makeAnnotation({ annotationType: "highlight", text: "Hello world", pageLabel: "3", attachmentKey: "ATT123" });
      const result = renderAnnotationBody([ann]);
      assert.include(result, "[Hello world](zotero://open-pdf/library/items/ATT123?page=3&annotation=ANN001)");
    });

    it("renders underline annotation as markdown link with text", function () {
      const ann = makeAnnotation({ annotationType: "underline", text: "Underlined", attachmentKey: "ATT123" });
      const result = renderAnnotationBody([ann]);
      assert.include(result, "[Underlined](zotero://open-pdf/library/items/ATT123?page=5&annotation=ANN001)");
    });

    it("renders note annotation with text as markdown link", function () {
      const ann = makeAnnotation({ annotationType: "note", text: "A note", attachmentKey: "ATT123" });
      const result = renderAnnotationBody([ann]);
      assert.include(result, "[A note](zotero://open-pdf/library/items/ATT123?page=5&annotation=ANN001)");
    });

    it("renders note annotation without text using 'Note' as link text", function () {
      const ann = makeAnnotation({ annotationType: "note", text: null, attachmentKey: "ATT123" });
      const result = renderAnnotationBody([ann]);
      assert.include(result, "[Note](zotero://open-pdf/library/items/ATT123?page=5&annotation=ANN001)");
    });

    it("renders image annotation as markdown link with 'Image annotation' text", function () {
      const ann = makeAnnotation({ annotationType: "image", text: null, attachmentKey: "ATT123" });
      const result = renderAnnotationBody([ann]);
      assert.include(result, "[Image annotation](zotero://open-pdf/library/items/ATT123?page=5&annotation=ANN001)");
    });

    it("renders ink annotation as markdown link with 'Ink annotation' text", function () {
      const ann = makeAnnotation({ annotationType: "ink", text: null, attachmentKey: "ATT123" });
      const result = renderAnnotationBody([ann]);
      assert.include(result, "[Ink annotation](zotero://open-pdf/library/items/ATT123?page=5&annotation=ANN001)");
    });

    it("link omits page param when pageLabel is null", function () {
      const ann = makeAnnotation({ pageLabel: null, attachmentKey: "ATT123" });
      const result = renderAnnotationBody([ann]);
      assert.include(result, "zotero://open-pdf/library/items/ATT123?annotation=ANN001");
      assert.notInclude(result, "page=");
    });

    it("includes comment when present", function () {
      const ann = makeAnnotation({ comment: "My comment" });
      const result = renderAnnotationBody([ann]);
      assert.include(result, "💬 My comment");
    });

    it("omits comment section when comment is null", function () {
      const ann = makeAnnotation({ comment: null });
      const result = renderAnnotationBody([ann]);
      assert.notInclude(result, "💬");
    });

    it("includes tags in backticks when tags are present", function () {
      const ann = makeAnnotation({ tags: ["important", "todo"] });
      const result = renderAnnotationBody([ann]);
      assert.include(result, "🏷️");
      assert.include(result, "`important`");
      assert.include(result, "`todo`");
    });

    it("omits tags section when tags is empty", function () {
      const ann = makeAnnotation({ tags: [] });
      const result = renderAnnotationBody([ann]);
      assert.notInclude(result, "🏷️");
    });

    it("does not end with trailing '---' separator", function () {
      const result = renderAnnotationBody([makeAnnotation()]);
      assert.notMatch(result, /---\s*$/);
    });

    it("does not end with trailing blank line", function () {
      const result = renderAnnotationBody([makeAnnotation()]);
      assert.notMatch(result, /\n\s*$/);
    });

    it("separates multiple annotations with '---'", function () {
      const ann1 = makeAnnotation({ key: "A1", pageLabel: "1", text: "First" });
      const ann2 = makeAnnotation({ key: "A2", pageLabel: "2", text: "Second" });
      const result = renderAnnotationBody([ann1, ann2]);
      assert.include(result, "First");
      assert.include(result, "Second");
      assert.include(result, "\n---\n");
    });

    it("trailing separator is removed even with multiple annotations", function () {
      const ann1 = makeAnnotation({ key: "A1" });
      const ann2 = makeAnnotation({ key: "A2" });
      const result = renderAnnotationBody([ann1, ann2]);
      assert.notMatch(result, /---\s*$/);
    });

    it("renders annotation with both comment and tags", function () {
      const ann = makeAnnotation({ comment: "Note this", tags: ["key"] });
      const result = renderAnnotationBody([ann]);
      assert.include(result, "💬 Note this");
      assert.include(result, "🏷️");
      assert.include(result, "`key`");
    });
  });
});
