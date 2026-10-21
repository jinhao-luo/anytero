/** @file Production diagnostics for the PDF-only v0.1.9 source port. */
export const PdfStatus = {
  current: "Ready. Select a Zotero paper and click Test Selected PDF.",
  errors: 0,
  history: [] as string[],
  report(message: string, failed = false): void {
    this.current = message;
    if (failed) this.errors++;
    if (failed) {
      try {
        Zotero.logError(new Error(`[AnyTero PDF] ${message}`));
      } catch {
        /* Node test runtime */
      }
    }
    this.history.push(`${new Date().toLocaleTimeString()} ${message}`);
    if (this.history.length > 500) this.history.shift();
    try {
      Zotero.debug(`[AnyTero PDF] ${message}`);
    } catch {
      /* Node test runtime */
    }
    const doc =
      typeof addon !== "undefined"
        ? addon.data.prefsWindow?.document
        : undefined;
    const field = doc?.getElementById(
      "anytero-pdf-status",
    ) as HTMLTextAreaElement | null;
    if (field) field.value = this.history.join("\n");
  },
};
