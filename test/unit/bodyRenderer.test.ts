import { assert } from "chai";
import {
  buildAnnotationLink,
  buildPageLink,
  renderSingleAnnotation,
  appendAnnotations,
} from "../../src/modules/anytype/bodyRenderer";
import type { ZoteroAnnotation } from "../../src/modules/zotero/itemReader";

function makeAnnotation(
  overrides: Partial<ZoteroAnnotation> = {},
): ZoteroAnnotation {
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

const FENCE = "---";
const FENCE_LINE = FENCE + "\n";
const CONTENT_TAIL = "\n\n";

describe("bodyRenderer", function () {
  describe("buildAnnotationLink", function () {
    it("builds a zotero://open-pdf URL with only the annotation param (no page)", function () {
      const ann = makeAnnotation({
        attachmentKey: "ATT001",
        key: "ANN001",
        pageLabel: "3",
      });
      const url = buildAnnotationLink(ann);
      assert.match(url, /^zotero:\/\/open-pdf\/library\/items\/ATT001\?/);
      assert.notInclude(url, "page=");
      assert.include(url, "annotation=ANN001");
    });

    it("omits page param even when pageLabel is present", function () {
      const ann = makeAnnotation({ pageLabel: "7" });
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

  describe("buildPageLink", function () {
    it("builds a zotero://open-pdf URL with only the page param", function () {
      const ann = makeAnnotation({
        attachmentKey: "ATT001",
        key: "ANN001",
        pageLabel: "7",
      });
      const url = buildPageLink(ann);
      assert.match(url, /^zotero:\/\/open-pdf\/library\/items\/ATT001\?/);
      assert.include(url, "page=7");
      assert.notInclude(url, "annotation=");
    });

    it("returns base URL without query string when pageLabel is null", function () {
      const ann = makeAnnotation({ attachmentKey: "ATT001", pageLabel: null });
      const url = buildPageLink(ann);
      assert.strictEqual(url, "zotero://open-pdf/library/items/ATT001");
    });
  });

  describe("renderSingleAnnotation", function () {
    it("renders highlighted text as a markdown link with page link", function () {
      const ann = makeAnnotation({ text: "Hello world", pageLabel: "1" });
      const result = renderSingleAnnotation(ann);
      assert.include(result, "[Hello world](zotero://open-pdf/");
      assert.include(result, "- [Page 1](zotero://open-pdf/");
    });

    it("ends with a single newline (no CONTENT_TAIL)", function () {
      const ann = makeAnnotation();
      const result = renderSingleAnnotation(ann);
      assert.isTrue(result.endsWith("\n"));
      assert.isFalse(result.endsWith(CONTENT_TAIL));
    });

    it("does not include the fence (---)", function () {
      const ann = makeAnnotation();
      assert.notInclude(renderSingleAnnotation(ann), "---");
    });

    it("uses 'Image annotation' for image type", function () {
      const ann = makeAnnotation({ annotationType: "image", text: null });
      assert.include(renderSingleAnnotation(ann), "[Image annotation](");
    });

    it("uses 'Ink annotation' for ink type", function () {
      const ann = makeAnnotation({ annotationType: "ink", text: null });
      assert.include(renderSingleAnnotation(ann), "[Ink annotation](");
    });

    it("uses 'Note' when text is null and type is note", function () {
      const ann = makeAnnotation({ annotationType: "note", text: null });
      assert.include(renderSingleAnnotation(ann), "[Note](");
    });

    it("shows 'Page' without number when pageLabel is null", function () {
      const ann = makeAnnotation({ pageLabel: null });
      const result = renderSingleAnnotation(ann);
      assert.include(result, "- [Page](zotero://open-pdf/");
      assert.notMatch(result, /\[Page \d/);
    });

    it("appends comment block when comment is present", function () {
      const ann = makeAnnotation({ comment: "interesting point" });
      assert.include(renderSingleAnnotation(ann), "\n\n💬 interesting point");
    });

    it("omits comment block when comment is null", function () {
      assert.notInclude(
        renderSingleAnnotation(makeAnnotation({ comment: null })),
        "💬",
      );
    });

    it("appends tag line when tags are present", function () {
      const ann = makeAnnotation({ tags: ["important", "todo"] });
      assert.include(renderSingleAnnotation(ann), "🏷️ `important` `todo`");
    });

    it("omits tag line when tags list is empty", function () {
      assert.notInclude(
        renderSingleAnnotation(makeAnnotation({ tags: [] })),
        "🏷️",
      );
    });

    it("renders comment before tags", function () {
      const ann = makeAnnotation({ comment: "my note", tags: ["key"] });
      const result = renderSingleAnnotation(ann);
      assert.isAbove(result.indexOf("🏷️"), result.indexOf("💬"));
    });
  });

  describe("appendAnnotations", function () {
    // Fixed annotation used across exact-string tests.
    const ann = makeAnnotation({ text: "hello", pageLabel: "3" });
    // Pre-computed pieces to keep expected strings readable.
    // renderSingleAnnotation no longer includes CONTENT_TAIL; appendAnnotations adds it.
    const ANN_CONTENT = renderSingleAnnotation(ann); // "<firstLine>\n"

    it("returns empty string for empty list", function () {
      assert.strictEqual(appendAnnotations("", []), "");
    });

    it("wraps a single annotation with fences on both sides when body is empty", function () {
      const result = appendAnnotations("", [makeAnnotation()]);
      assert.isTrue(
        result.startsWith(FENCE_LINE),
        "should start with ' ---  \\n   \\n'",
      );
      assert.isTrue(
        result.endsWith(FENCE_LINE),
        "should end with ' ---  \\n   \\n'",
      );
      assert.strictEqual((result.match(/---/g) ?? []).length, 2);
    });

    it("wraps two annotations with three fences when body is empty", function () {
      const a = makeAnnotation({ key: "A", text: "first" });
      const b = makeAnnotation({ key: "B", text: "second" });
      const result = appendAnnotations("", [a, b]);
      // 3 fences total: before A, between A and B, after B
      assert.strictEqual((result.match(/---/g) ?? []).length, 3);
      assert.isTrue(result.startsWith(FENCE_LINE));
      assert.isTrue(result.endsWith(FENCE_LINE));
      assert.include(result, renderSingleAnnotation(a));
      assert.include(result, renderSingleAnnotation(b));
    });

    it("returns just new annotations when existingBody is empty", function () {
      assert.strictEqual(
        appendAnnotations("", [ann]),
        FENCE_LINE + ANN_CONTENT + CONTENT_TAIL + FENCE_LINE,
      );
    });

    it("returns existingBody unchanged when newAnnotations is empty", function () {
      assert.strictEqual(
        appendAnnotations("---\nabc\n\n---\n", []),
        "---\nabc\n\n---\n",
      );
    });

    // existing body without trailing fence: trimEnd strips whitespace, adds CONTENT_TAIL + FENCE_LINE
    it("trims trailing whitespace and adds fence when missing: '---\\nabc\\n'", function () {
      const existing = "---\nabc\n";
      assert.strictEqual(
        appendAnnotations(existing, [ann]),
        "---\nabc" +
          CONTENT_TAIL +
          FENCE_LINE +
          ANN_CONTENT +
          CONTENT_TAIL +
          FENCE_LINE,
      );
    });

    // same result when extra blank lines trail: trimEnd collapses to the same base
    it("trims trailing whitespace and adds fence when missing: '---\\nabc\\n\\n'", function () {
      const existing = "---\nabc\n\n";
      assert.strictEqual(
        appendAnnotations(existing, [ann]),
        "---\nabc" +
          CONTENT_TAIL +
          FENCE_LINE +
          ANN_CONTENT +
          CONTENT_TAIL +
          FENCE_LINE,
      );
    });

    // existing ends with "---" (no newline): trimEnd is a no-op, "\n" is added to complete the fence line
    it("adds '\\n' after bare fence when already ends with '---': '---\\nabc\\n\\n---'", function () {
      const existing = "---\nabc\n\n---";
      assert.strictEqual(
        appendAnnotations(existing, [ann]),
        "---\nabc\n\n" + FENCE_LINE + ANN_CONTENT + CONTENT_TAIL + FENCE_LINE,
      );
    });

    // existing ends with complete FENCE_LINE ("---\n"): trimEnd removes trailing newline, then re-adds "\n"
    it("handles complete fence ending '---\\n': trimEnd then re-adds '\\n'", function () {
      const existing = "---\nabc\n\n---\n";
      assert.strictEqual(
        appendAnnotations(existing, [ann]),
        "---\nabc\n\n" + FENCE_LINE + ANN_CONTENT + CONTENT_TAIL + FENCE_LINE,
      );
    });
  });
});
