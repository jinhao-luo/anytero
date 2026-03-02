import { assert } from "chai";
import { renderAnnotationBody } from "../src/modules/anytype/bodyRenderer";
import type { ZoteroAnnotation } from "../src/modules/zotero/itemReader";

function makeAnnotation(overrides: Partial<ZoteroAnnotation> = {}): ZoteroAnnotation {
  return {
    id: 1,
    key: "ANN001",
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

    it("renders highlight annotation with quoted text", function () {
      const ann = makeAnnotation({ annotationType: "highlight", text: "Hello world", pageLabel: "3" });
      const result = renderAnnotationBody([ann]);
      assert.include(result, "### Page 3 — Highlight");
      assert.include(result, '> "Hello world"');
    });

    it("renders underline annotation", function () {
      const ann = makeAnnotation({ annotationType: "underline", text: "Underlined" });
      const result = renderAnnotationBody([ann]);
      assert.include(result, "### Page 5 — Underline");
      assert.include(result, '> "Underlined"');
    });

    it("renders note annotation", function () {
      const ann = makeAnnotation({ annotationType: "note", text: "A note" });
      const result = renderAnnotationBody([ann]);
      assert.include(result, "### Page 5 — Note");
      assert.include(result, '> "A note"');
    });

    it("renders image annotation as placeholder, not quoted text", function () {
      const ann = makeAnnotation({ annotationType: "image", text: null });
      const result = renderAnnotationBody([ann]);
      assert.include(result, "### Page 5 — Image");
      assert.include(result, "*[Image annotation]*");
      assert.notInclude(result, '> "');
    });

    it("renders ink annotation as placeholder, not quoted text", function () {
      const ann = makeAnnotation({ annotationType: "ink", text: null });
      const result = renderAnnotationBody([ann]);
      assert.include(result, "### Page 5 — Ink");
      assert.include(result, "*[Ink annotation]*");
      assert.notInclude(result, '> "');
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

    it("shows 'Unknown page' when pageLabel is null", function () {
      const ann = makeAnnotation({ pageLabel: null });
      const result = renderAnnotationBody([ann]);
      assert.include(result, "Unknown page");
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
