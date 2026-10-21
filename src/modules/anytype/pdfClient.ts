/** @file Anytype PDF operations ported from the supplied v0.1.9 XPI. */
import { config } from "../../../package.json";
export interface PdfViewer {
  id: string;
  type: string;
  style?: string;
  object_id?: string;
}

/** Keep the reference build's v1 creation / v2 PDF editing boundary. */
export class PdfClient {
  private _pdfBaseUrl: string;
  private _pdfApiKey: string;
  constructor(port: number, apiKey: string) {
    this._pdfBaseUrl = `http://127.0.0.1:${port}/v1`;
    this._pdfApiKey = apiKey;
  }
  private async errorText(response: Response): Promise<string> {
    const body = await response.text();
    return this._pdfApiKey
      ? body.split(this._pdfApiKey).join("[REDACTED]")
      : body;
  }
  // Anytype API v2: upload bytes and insert a real inline PDF block.
  async uploadAnnotatedPDF(spaceId: string, name: string, bytes: Uint8Array) {
    // Zotero 10's privileged plugin global may not expose browser FormData.
    // Encode RFC 7578 multipart/form-data as UTF-8 + raw PDF bytes instead.
    if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
    if (!bytes.byteLength) throw new Error("Cannot upload an empty PDF");
    const boundary = `----AnyTeroPDF${Date.now()}${Math.floor(Math.random() * 1e9)}`;
    const safeName = String(name).replace(/[\r\n"\\]/g, "_");
    const encoder = new TextEncoder();
    const prefix = encoder.encode(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${safeName}"\r\nContent-Type: application/pdf\r\n\r\n`,
    );
    const suffix = encoder.encode(`\r\n--${boundary}--\r\n`);
    const payload = new Uint8Array(
      prefix.length + bytes.length + suffix.length,
    );
    payload.set(prefix, 0);
    payload.set(bytes, prefix.length);
    payload.set(suffix, prefix.length + bytes.length);
    const port = this._pdfBaseUrl.match(/:(\d+)\/v1$/)![1];
    const url = `http://127.0.0.1:${port}/v2/spaces/${encodeURIComponent(spaceId)}/files`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this._pdfApiKey}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        Accept: "application/json",
      },
      body: payload as unknown as BodyInit,
    });
    if (!response.ok) {
      const errorBody = await this.errorText(response);
      throw new Error(
        `PDF upload HTTP ${response.status}: ${errorBody.slice(0, 600)}`,
      );
    }
    const result: any = await response.json();
    const id = result.id ?? result.object_id;
    if (!id)
      throw new Error(
        "PDF uploaded but no file ID returned: " +
          JSON.stringify(result).slice(0, 300),
      );
    return id;
  }
  // Keep the PDF viewer in Anytype while providing an explicit link to Zotero's
  // original attachment reader (not the exported Anytype PDF copy).
  async insertZoteroReaderLink(
    spaceId: string,
    objectId: string,
    attachmentKey: string,
  ) {
    return this._insertPaperBlocks(spaceId, objectId, [
      this._zoteroReaderBlock(attachmentKey),
    ]);
  }
  _zoteroReaderBlock(attachmentKey: string) {
    if (!/^[A-Z0-9]{8}$/i.test(attachmentKey))
      throw new Error("Invalid Zotero attachment key");
    return {
      type: "paragraph",
      text: `[Open original PDF in Zotero](zotero://open-pdf/library/items/${attachmentKey})`,
    };
  }
  async _insertPaperBlocks(
    spaceId: string,
    objectId: string,
    blocks: unknown[],
  ) {
    const port = this._pdfBaseUrl.match(/:(\d+)\/v1$/)![1];
    const response = await fetch(
      `http://127.0.0.1:${port}/v2/spaces/${encodeURIComponent(spaceId)}/objects/${encodeURIComponent(objectId)}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${this._pdfApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ops: [{ op: "insert_blocks", position: "first", blocks }],
        }),
      },
    );
    if (!response.ok)
      throw new Error(
        `Paper block insertion HTTP ${response.status}: ${(await this.errorText(response)).slice(0, 700)}`,
      );
    return response.json();
  }
  // Read-only inspection of v2's flat document blocks. Never edit handwritten page text.
  async findPDFViewer(
    spaceId: string,
    objectId: string,
    attachmentKey: string,
    freshPage = false,
    expectedFileId?: string,
  ): Promise<{ block: PdfViewer | null; doc: unknown }> {
    const port = this._pdfBaseUrl.match(/:(\d+)\/v1$/)![1];
    const endpoint = `http://127.0.0.1:${port}/v2/spaces/${encodeURIComponent(spaceId)}/objects/${encodeURIComponent(objectId)}`;
    const headers = {
      Authorization: `Bearer ${this._pdfApiKey}`,
      Accept: "application/json",
    };
    // An explicit blocks response avoids mistaking metadata/outline wrappers for content.
    const response = await fetch(`${endpoint}?include=blocks&ids=full`, {
      headers,
    });
    if (!response.ok)
      throw new Error(
        `PDF inspection HTTP ${response.status}: ${(await this.errorText(response)).slice(0, 400)}`,
      );
    const doc: any = await response.json();
    // Versions of the v2 API may wrap the document in object, document, data or result.
    // Only accept a genuine array; never assume that missing data means an empty page.
    const candidates = [
      doc,
      doc?.object,
      doc?.document,
      doc?.data,
      doc?.result,
      doc?.data?.object,
      doc?.data?.document,
      doc?.result?.object,
      doc?.body,
      doc?.object?.body,
      doc?.document?.body,
    ];
    let blocks: PdfViewer[] | null = null;
    for (const candidate of candidates) {
      if (Array.isArray(candidate?.blocks)) {
        blocks = candidate.blocks;
        break;
      }
    }
    if (!blocks) {
      // A newly created page may expose an empty document without a blocks array.
      if (freshPage) return { block: null, doc };
      const keys = candidates
        .filter((x) => x && typeof x === "object" && !Array.isArray(x))
        .slice(0, 4)
        .map((x) => Object.keys(x).slice(0, 15).join(","))
        .join(" | ");
      throw new Error(
        `Existing Anytype page did not return a blocks array (response keys: ${keys}); refusing duplicate insertion`,
      );
    }
    const pdfs = blocks.filter(
      (b) =>
        b && (b.type === "pdf" || (b.type === "file" && b.style === "pdf")),
    );
    if (pdfs.length > 1)
      throw new Error(
        `Found ${pdfs.length} PDF blocks: resolve duplicates manually before syncing; no page content changed`,
      );
    if (pdfs.length === 0) return { block: null, doc };
    const block = pdfs[0];
    if (typeof block.id !== "string" || !block.id)
      throw new Error(
        "PDF block has no editable ID; refusing duplicate insertion",
      );
    const ownerPrefix = `${config.prefsPrefix}.pdfEmbed`;
    const trackedBlock = Zotero.Prefs.get(
      `${ownerPrefix}.block.${spaceId}.${objectId}.${attachmentKey}`,
      true,
    );
    const trackedFile = Zotero.Prefs.get(
      `${ownerPrefix}.file.${spaceId}.${objectId}.${attachmentKey}`,
      true,
    );
    if (
      trackedBlock &&
      (trackedBlock !== block.id ||
        ((expectedFileId ?? trackedFile) &&
          (expectedFileId ?? trackedFile) !== block.object_id))
    ) {
      throw new Error(
        "Managed PDF was changed manually; refusing to replace an unrelated viewer",
      );
    }
    if (!trackedBlock) {
      // Import the reference build's fingerprint as evidence of an earlier PDF sync.
      // Without that or its exact reader marker, a single manual PDF is not ours.
      const marker = `[Open original PDF in Zotero](zotero://open-pdf/library/items/${attachmentKey})`;
      const hasMarker = blocks.some(
        (b: any) => b.type === "paragraph" && b.text === marker,
      );
      const mapping = Zotero.Prefs.get(`${config.prefsPrefix}.syncState`, true);
      let previous = false;
      if (typeof mapping === "string") {
        const entries = JSON.parse(mapping) as Record<string, string>;
        const paperKey = Object.keys(entries).find(
          (key) => entries[key] === objectId,
        );
        if (paperKey) {
          const raw = Zotero.Prefs.get(
            `${ownerPrefix}.${paperKey}.${attachmentKey}`,
            true,
          );
          if (typeof raw === "string") {
            const fingerprint = JSON.parse(raw) as unknown[];
            previous =
              fingerprint[0] === spaceId &&
              fingerprint[1] === objectId &&
              fingerprint[2] === attachmentKey;
          }
        }
      }
      if (!hasMarker && !previous)
        throw new Error(
          "Existing PDF ownership cannot be established from v0.1.9 state or its Zotero reader link; no upload was attempted",
        );
    }
    return { block, doc };
  }
  async updatePDFViewer(
    spaceId: string,
    objectId: string,
    blockId: string,
    newFileId: string,
  ) {
    const port = this._pdfBaseUrl.match(/:(\d+)\/v1$/)![1];
    const base = `http://127.0.0.1:${port}/v2`;
    const headers = {
      Authorization: `Bearer ${this._pdfApiKey}`,
      "Content-Type": "application/json",
    };
    // Get the actual op schema from this installation; don't guess dangerous edit fields.
    const schemaResponse = await fetch(`${base}/schemas/ops/update_block`, {
      headers,
    });
    if (!schemaResponse.ok)
      throw new Error(
        `Cannot retrieve Anytype update_block schema: HTTP ${schemaResponse.status}`,
      );
    const schemaPayload: any = await schemaResponse.json();
    const schema = schemaPayload.schema ?? schemaPayload;
    const fields = schema.properties ?? {};
    // v2 block patches use `id` (or `block_id`) as selector and `set` as field patch.
    const idKey = fields.id
      ? "id"
      : fields.block_id
        ? "block_id"
        : fields.block
          ? "block"
          : null;
    if (!idKey || !fields.set)
      throw new Error(
        "Unsupported update_block schema; refusing to modify page. Fields: " +
          Object.keys(fields).join(", "),
      );
    const op = {
      op: "update_block",
      [idKey]: blockId,
      set: { object_id: newFileId },
    };
    const endpoint = `${base}/spaces/${encodeURIComponent(spaceId)}/objects/${encodeURIComponent(objectId)}`;
    // Preflight does not change the page; a failed validation won't destroy the previous viewer.
    const dry = await fetch(endpoint + "?dry_run=true", {
      method: "PATCH",
      headers,
      body: JSON.stringify({ ops: [op] }),
    });
    if (!dry.ok)
      throw new Error(
        `PDF update validation HTTP ${dry.status}: ${(await this.errorText(dry)).slice(0, 550)}`,
      );
    const result = await fetch(endpoint, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ ops: [op] }),
    });
    if (!result.ok)
      throw new Error(
        `PDF update HTTP ${result.status}: ${(await this.errorText(result)).slice(0, 550)}`,
      );
    return result.json();
  }
  async insertPDFBlock(
    spaceId: string,
    objectId: string,
    fileId: string,
    attachmentKey: string,
  ) {
    // Insert link immediately before the PDF as a single edit.
    return this._insertPaperBlocks(spaceId, objectId, [
      this._zoteroReaderBlock(attachmentKey),
      { type: "pdf", object_id: fileId },
    ]);
  }
}
