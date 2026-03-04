/**
 * @file bodyRenderer.ts
 *
 * Pure functions that convert `ZoteroAnnotation` objects into Anytype-ready
 * markdown strings. Each annotation becomes a deep-link back into Zotero's
 * PDF reader (`zotero://open-pdf/…?annotation=KEY`) followed by a separate
 * page link (`zotero://open-pdf/…?page=N`). Only the page link carries the
 * page number; the annotation link targets the annotation directly.
 *
 * The full body for N annotations looks like:
 * ```
 * ---
 * <annotation 1>
 *
 * ---
 * <annotation 2>
 *
 * ---
 * ```
 * "---\n<annotation 1>\n\n---\n<annotation 2>\n\n---\n"
 */

import type { ZoteroAnnotation } from "../zotero/itemReader";

/**
 * Builds a `zotero://open-pdf/…` deep-link URL for the given annotation.
 * Clicking the link opens Zotero's PDF reader and jumps to the exact
 * annotation position (no page number; use {@link buildPageLink} for that).
 */
export function buildAnnotationLink(ann: ZoteroAnnotation): string {
  const base = `zotero://open-pdf/library/items/${ann.attachmentKey}`;
  const params = new URLSearchParams();
  params.set("annotation", ann.key);
  return `${base}?${params.toString()}`;
}

/**
 * Builds a `zotero://open-pdf/…` URL that opens the PDF to a specific page
 * without targeting a particular annotation.
 */
export function buildPageLink(ann: ZoteroAnnotation): string {
  const base = `zotero://open-pdf/library/items/${ann.attachmentKey}`;
  if (!ann.pageLabel) return base;
  const params = new URLSearchParams();
  params.set("page", ann.pageLabel);
  return `${base}?${params.toString()}`;
}

/**
 * The horizontal-rule token with no trailing whitespace or newline.
 * Callers must append `"\n"` after it to produce the full fence line.
 */
const FENCE = "---";

/**
 * The full fence line: horizontal rule + newline.
 * Annotation content follows immediately on the next line.
 */
const FENCE_LINE = FENCE + "\n";

/**
 * The separator appended after each annotation's content, before the next
 * fence. A blank line (two newlines: one to end the last content line, one
 * for the blank line itself).
 */
const CONTENT_TAIL = "\n\n";

/**
 * Renders a single annotation's inner content (no fences, no CONTENT_TAIL).
 * The result is `<first-line>\n\n💬 …\n\n🏷️ …\n`.
 *
 * Callers are responsible for appending `CONTENT_TAIL` and wrapping with fences
 * via `appendAnnotations`.
 */
export function renderSingleAnnotation(ann: ZoteroAnnotation): string {
  const annotationLink = buildAnnotationLink(ann);
  const pageLink = buildPageLink(ann);

  let linkText: string;
  if (ann.annotationType === "image") {
    linkText = "Image annotation";
  } else if (ann.annotationType === "ink") {
    linkText = "Ink annotation";
  } else if (ann.text) {
    linkText = ann.text;
  } else {
    linkText = "Note";
  }

  const pageText = ann.pageLabel ? `Page ${ann.pageLabel}` : "Page";
  const firstLine = `[${linkText}](${annotationLink}) - [${pageText}](${pageLink})`;

  const parts: string[] = [firstLine];

  // if (ann.comment) {
  //   parts.push("", `💬 ${ann.comment}`);
  // }

  // if (ann.tags.length > 0) {
  //   const tagStr = ann.tags.map((t) => `\`${t}\``).join(" ");
  //   parts.push("", `🏷️ ${tagStr}`);
  // }

  return parts.join("\n") + "\n";
}

/**
 * Appends new annotations to an existing body string.
 *
 * When `existingBody` is empty the result is a fresh body containing only
 * the new annotations. Otherwise:
 *
 * 1. Trailing whitespace is trimmed from `existingBody`.
 * 2. If the trimmed body ends with bare `---`, `"\n"` is appended to
 *    complete the fence line.
 * 3. If the trimmed body has content after the last fence, `CONTENT_TAIL`
 *    and the fence line are appended.
 * 4. The new annotations are appended, each followed by `CONTENT_TAIL`.
 *
 * Every fence is written as `"---\n"` so that Anytype renders it as a
 * horizontal rule with annotation content immediately following.
 *
 * Returns an empty string when both arguments are empty.
 */
export function appendAnnotations(
  existingBody: string,
  newAnnotations: ZoteroAnnotation[],
): string {
  if (newAnnotations.length === 0) return existingBody;
  let base = existingBody.trimEnd();
  if (base.length === 0) {
    // Fresh body: start with the opening fence line.
    base = FENCE_LINE;
  } else if (base.endsWith(FENCE)) {
    // Trimmed body ends with bare "---": complete the fence line.
    base += "\n";
  } else {
    // Body has content after the last fence: close it off.
    base += CONTENT_TAIL + FENCE_LINE;
  }

  const newContent = newAnnotations
    .map(renderSingleAnnotation)
    .join(CONTENT_TAIL + FENCE_LINE);
  return base + newContent + CONTENT_TAIL + FENCE_LINE;
}
