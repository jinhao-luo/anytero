/** @file Annotated PDF export and fingerprints compatible with the v0.1.9 XPI. */
import { config } from "../../../package.json";
import { PdfStatus } from "./pdfStatus";
import type { AnytypeClient } from "../anytype/client";
import type { ZoteroItem } from "../zotero/itemReader";

/** The reference build's preference names are retained to reuse its uploaded PDFs. */
export class PdfSync {
  async sync(
    item: ZoteroItem,
    client: AnytypeClient,
    spaceId: string,
    objectId: string,
    freshPage = false,
  ): Promise<void> {
    const parent = Zotero.Items.get(item.id);
    const attachments = parent
      .getAttachments()
      .map((id) => Zotero.Items.get(id))
      .filter(
        (a) =>
          a &&
          !a.deleted &&
          a.isFileAttachment() &&
          a.attachmentContentType === "application/pdf",
      );
    if (!attachments.length)
      throw new Error(`No PDF attachment found for ${item.key}`);
    // v0.1.9 has one viewer per paper; multiple source PDFs must not overwrite each other.
    if (attachments.length > 1)
      throw new Error(
        "This paper has multiple PDF attachments. This port supports one PDF per paper; separate the attachments before syncing. No viewer was modified.",
      );
    const attachment = attachments[0];
    const prefix = `${config.prefsPrefix}.pdfEmbed`;
    const pref = `${prefix}.${item.key}.${attachment.key}`;
    let phase = "locating PDF";
    const temporary = Zotero.getTempDirectory();
    temporary.append(
      `anytero-${attachment.key}-${Zotero.Utilities.randomString(20)}.pdf`,
    );
    try {
      const source = await attachment.getFilePathAsync();
      if (!source || !(await IOUtils.exists(source)))
        throw new Error("PDF not downloaded locally");
      const info = await IOUtils.stat(source);
      const fingerprint = JSON.stringify([
        spaceId,
        objectId,
        attachment.key,
        info.size,
        info.lastModified,
        ...attachment
          .getAnnotations()
          .map((a) => `${a.key}:${a.dateModified}`)
          .sort(),
      ]);
      phase = "inspecting existing PDF viewer";
      const viewer = await client.findPDFViewer(
        spaceId,
        objectId,
        attachment.key,
        freshPage,
      );
      if (Zotero.Prefs.get(pref, true) === fingerprint && viewer.block) {
        PdfStatus.report(
          `PDF unchanged; existing viewer preserved: ${attachment.key}`,
        );
        return;
      }
      phase = "exporting PDF with markings";
      PdfStatus.report(`Exporting annotated PDF: ${attachment.key}`);
      await Zotero.PDFWorker.export(attachment.id, temporary.path, true);
      const bytes = await IOUtils.read(temporary.path);
      if (
        !bytes.length ||
        new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-"
      )
        throw new Error("Export is empty or not a PDF");
      phase = "uploading PDF";
      PdfStatus.report(
        `Uploading PDF (${bytes.length} bytes): ${attachment.key}`,
      );
      const fileId = await client.uploadAnnotatedPDF(
        spaceId,
        `${attachment.key}-annotated.pdf`,
        bytes,
      );
      phase = "updating PDF viewer";
      if (viewer.block)
        await client.updatePDFViewer(
          spaceId,
          objectId,
          viewer.block.id,
          fileId,
        );
      else
        await client.insertPDFBlock(spaceId, objectId, fileId, attachment.key);
      // Do not commit the reference fingerprint until a read-back confirms the viewer.
      const verified = await client.findPDFViewer(
        spaceId,
        objectId,
        attachment.key,
        false,
        fileId,
      );
      if (!verified.block || verified.block.object_id !== fileId)
        throw new Error(
          "Updated PDF viewer could not be verified; fingerprint was not saved",
        );
      Zotero.Prefs.set(
        `${prefix}.block.${spaceId}.${objectId}.${attachment.key}`,
        verified.block.id,
        true,
      );
      Zotero.Prefs.set(
        `${prefix}.file.${spaceId}.${objectId}.${attachment.key}`,
        fileId,
        true,
      );
      Zotero.Prefs.set(
        `${prefix}.readerLink.${spaceId}.${objectId}.${attachment.key}`,
        true,
        true,
      );
      Zotero.Prefs.set(pref, fingerprint, true);
      PdfStatus.report(
        `SUCCESS: annotated PDF embedded for ${item.key} (${attachment.key})`,
      );
    } catch (error) {
      const message = `FAILED ${phase} for ${item.key} (${attachment.key}): ${error instanceof Error ? error.message : "PDF synchronization failed"}`;
      PdfStatus.report(message, true);
      throw new Error(message);
    } finally {
      await IOUtils.remove(temporary.path, { ignoreAbsent: true });
    }
  }
}
