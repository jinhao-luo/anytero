/**
 * @file bodyRenderer.ts
 *
 * Pure functions that convert `ZoteroAnnotation` objects into Anytype-ready
 * markdown strings. Each annotation becomes a deep-link back into Zotero's
 * PDF reader (`zotero://open-pdf/…`), optionally followed by a comment block
 * and tag list.
 */

import type { ZoteroAnnotation } from "../zotero/itemReader";


/**
 * Builds a `zotero://open-pdf/…` deep-link URL for the given annotation.
 * Clicking the link opens Zotero's PDF reader and jumps to the exact page and
 * annotation position.
 */
export function buildAnnotationLink(ann: ZoteroAnnotation): string {
  const base = `zotero://open-pdf/library/items/${ann.attachmentKey}`;
  const params = new URLSearchParams();
  if (ann.pageLabel) params.set("page", ann.pageLabel);
  params.set("annotation", ann.key);
  return `${base}?${params.toString()}`;
}

/**
 * Renders a single annotation as a compact markdown block (no `---` separator).
 * Used when appending new annotations to an already-existing Anytype object body.
 *
 * Output format:
 * ```
 * [Highlighted text](zotero://open-pdf/…)
 *
 * 💬 comment (if present)
 *
 * 🏷️ `tag1` `tag2` (if any)
 * ```
 */
export function renderSingleAnnotation(ann: ZoteroAnnotation): string {
  const link = buildAnnotationLink(ann);

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

  const parts: string[] = [`[${linkText}](${link})`];

  if (ann.comment) {
    parts.push("", `💬 ${ann.comment}`);
  }

  if (ann.tags.length > 0) {
    const tagStr = ann.tags.map((t) => `\`${t}\``).join(" ");
    parts.push("", `🏷️ ${tagStr}`);
  }

  return parts.join("\n");
}

/** Separator inserted between annotation blocks in the object body. */
const ANNOTATION_SEPARATOR = "\n\n\n\n";

/**
 * Joins a list of annotations into a single body string, rendering each with
 * `renderSingleAnnotation` and separating them with `ANNOTATION_SEPARATOR`.
 * Returns an empty string when the list is empty.
 */
export function joinAnnotations(annotations: ZoteroAnnotation[]): string {
  return annotations.map(renderSingleAnnotation).join(ANNOTATION_SEPARATOR);
}

/**
 * Appends new annotations to an existing body string. If the body is empty the
 * new chunks are returned as-is; otherwise the separator is inserted between
 * the existing content and the new chunks.
 */
export function appendAnnotations(
  existingBody: string,
  newAnnotations: ZoteroAnnotation[],
): string {
  const newChunks = joinAnnotations(newAnnotations);
  if (existingBody.length === 0) return newChunks;
  return existingBody + ANNOTATION_SEPARATOR + newChunks;
}

