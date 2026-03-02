import type { ZoteroAnnotation } from "../zotero/itemReader";

function buildAnnotationLink(ann: ZoteroAnnotation): string {
  const base = `zotero://open-pdf/library/items/${ann.attachmentKey}`;
  const params = new URLSearchParams();
  if (ann.pageLabel) params.set("page", ann.pageLabel);
  params.set("annotation", ann.key);
  return `${base}?${params.toString()}`;
}

export function renderAnnotationBody(annotations: ZoteroAnnotation[]): string {
  if (annotations.length === 0) return "";

  const lines: string[] = ["## Annotations", ""];

  for (const ann of annotations) {
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

    lines.push(`[${linkText}](${link})`);

    if (ann.comment) {
      lines.push("");
      lines.push(`💬 ${ann.comment}`);
    }

    if (ann.tags.length > 0) {
      const tagStr = ann.tags.map((t) => `\`${t}\``).join(" ");
      lines.push("");
      lines.push(`🏷️ ${tagStr}`);
    }

    lines.push("");
    lines.push("---");
    lines.push("");
  }

  // Remove trailing separator
  while (lines.length > 0 && (lines[lines.length - 1] === "---" || lines[lines.length - 1] === "")) {
    lines.pop();
  }

  return lines.join("\n");
}
