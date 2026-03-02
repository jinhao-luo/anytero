import type { ZoteroAnnotation } from "../zotero/itemReader";

const TYPE_LABEL: Record<ZoteroAnnotation["annotationType"], string> = {
  highlight: "Highlight",
  underline: "Underline",
  note: "Note",
  image: "Image",
  ink: "Ink",
};

export function renderAnnotationBody(annotations: ZoteroAnnotation[]): string {
  if (annotations.length === 0) return "";

  const lines: string[] = ["## Annotations", ""];

  for (const ann of annotations) {
    const label = TYPE_LABEL[ann.annotationType] ?? ann.annotationType;
    const page = ann.pageLabel ? `Page ${ann.pageLabel}` : "Unknown page";

    lines.push(`### ${page} — ${label}`);

    if (ann.annotationType === "image") {
      lines.push(`*[Image annotation]*`);
    } else if (ann.annotationType === "ink") {
      lines.push(`*[Ink annotation]*`);
    } else if (ann.text) {
      lines.push(`> "${ann.text}"`);
    }

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
