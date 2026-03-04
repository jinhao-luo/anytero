/**
 * @file client.test.ts
 *
 * Unit tests for pure helpers exported from `client.ts` that do not require a
 * running Anytype instance.
 */

import { assert } from "chai";
import { patchMarkdown } from "../../src/modules/anytype/client";

describe("patchMarkdown", function () {
  // ── No separator present ──────────────────────────────────────────────────

  it("returns the string unchanged when no --- separator is present", function () {
    const input = "## Title\n\nSome text without a separator.";
    assert.strictEqual(patchMarkdown(input), input);
  });

  it("returns an empty string unchanged", function () {
    assert.strictEqual(patchMarkdown(""), "");
  });

  // ── Already-canonical separator ───────────────────────────────────────────

  it("leaves an already-canonical \\n\\n---\\n separator untouched", function () {
    const input = "section one\n\n---\nsection two";
    assert.strictEqual(patchMarkdown(input), input);
  });

  // ── Leading/trailing spaces on the --- line ───────────────────────────────

  it("strips leading spaces from a --- line", function () {
    const input = "a\n\n   ---\nb";
    assert.strictEqual(patchMarkdown(input), "a\n\n---\nb");
  });

  it("strips trailing spaces from a --- line", function () {
    const input = "a\n\n---   \nb";
    assert.strictEqual(patchMarkdown(input), "a\n\n---\nb");
  });

  // ── Extra blank lines around the separator ────────────────────────────────

  it("collapses multiple blank lines before ---", function () {
    const input = "a\n\n\n\n---\nb";
    assert.strictEqual(patchMarkdown(input), "a\n\n---\nb");
  });

  it("collapses multiple blank lines after ---", function () {
    const input = "a\n\n---\n\n\nb";
    assert.strictEqual(patchMarkdown(input), "a\n\n---\nb");
  });

  it("collapses extra blank lines on both sides of ---", function () {
    const input = "a\n\n\n---\n\n\nb";
    assert.strictEqual(patchMarkdown(input), "a\n\n---\nb");
  });

  // ── Spaces on blank lines ─────────────────────────────────────────────────

  it("handles blank lines that contain only spaces before ---", function () {
    const input = "a\n  \n  \n---\nb";
    assert.strictEqual(patchMarkdown(input), "a\n\n---\nb");
  });

  it("handles blank lines that contain only spaces after ---", function () {
    const input = "a\n---\n  \n  \nb";
    assert.strictEqual(patchMarkdown(input), "a\n\n---\nb");
  });

  // ── Multiple separators ───────────────────────────────────────────────────

  it("normalises every separator in a document with multiple ---", function () {
    const input = "a\n\n\n---\n\n\nb\n\n\n---\n\n\nc";
    assert.strictEqual(patchMarkdown(input), "a\n\n---\nb\n\n---\nc");
  });

  // ── Content is preserved ──────────────────────────────────────────────────

  it("preserves surrounding content when normalising", function () {
    const input = "## Annotations\n\n  \n---\n  \n[highlight](zotero://...)";
    assert.strictEqual(
      patchMarkdown(input),
      "## Annotations\n\n---\n[highlight](zotero://...)",
    );
  });

  it("normalises --- inside a fenced code block (known limitation of the simple regex)", function () {
    // The regex cannot distinguish a separator from one inside a code fence;
    // both are flanked by newlines.  Document the actual behaviour so any
    // future change to the implementation is caught.
    const input = "```\n---\n```";
    assert.strictEqual(patchMarkdown(input), "```\n\n---\n```");
  });
});
