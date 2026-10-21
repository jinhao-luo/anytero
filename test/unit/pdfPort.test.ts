import { assert } from "chai";
import { PdfClient } from "../../src/modules/anytype/pdfClient";
import { PdfSync } from "../../src/modules/sync/pdfSync";
import { ItemReader } from "../../src/modules/zotero/itemReader";
import { AnyTeroCollectionFilter } from "../../src/modules/zotero/collectionFilter";

const attachmentKey = "PDF00001";
const marker = `[Open original PDF in Zotero](zotero://open-pdf/library/items/${attachmentKey})`;
const blocks = [
  { id: "reader", type: "paragraph", text: marker },
  { id: "pdf", type: "pdf", object_id: "old-file" },
  { id: "summary", type: "paragraph", text: "Keep my **summary**" },
];

describe("custom v0.1.9 PDF behavior", function () {
  let originalFetch: typeof fetch;
  let preferences: Map<string, unknown>;

  beforeEach(function () {
    originalFetch = globalThis.fetch;
    preferences = new Map();
    (globalThis as any).Zotero = {
      Prefs: {
        get: (k: string) => preferences.get(k),
        set: (k: string, v: unknown) => preferences.set(k, v),
      },
      debug: () => {},
    };
  });

  afterEach(function () {
    globalThis.fetch = originalFetch;
  });

  it("uploads binary multipart bytes without FormData and accepts object_id responses", async function () {
    const bytes = new Uint8Array([37, 80, 68, 70, 45, 0, 128, 255]);
    globalThis.fetch = (async (url: string, options: any) => {
      assert.include(url, "/v2/spaces/space/files");
      assert.equal(options.headers.Authorization, "Bearer secret");
      assert.instanceOf(options.body, Uint8Array);
      const body = options.body as Uint8Array;
      const start = new TextDecoder().decode(body).indexOf("\r\n\r\n") + 4;
      assert.deepEqual(body.subarray(start, start + bytes.length), bytes);
      return { ok: true, json: async () => ({ object_id: "uploaded" }) };
    }) as any;
    assert.equal(
      await new PdfClient(31009, "secret").uploadAnnotatedPDF(
        "space",
        "paper.pdf",
        bytes,
      ),
      "uploaded",
    );
  });

  it("redacts the API key from upload errors", async function () {
    globalThis.fetch = (async () => ({
      ok: false,
      status: 400,
      text: async () => "Rejected secret-token",
    })) as any;
    try {
      await new PdfClient(31009, "secret-token").uploadAnnotatedPDF(
        "space",
        "p.pdf",
        new Uint8Array([1]),
      );
      assert.fail();
    } catch (error) {
      assert.include(String(error), "HTTP 400");
      assert.notInclude(String(error), "secret-token");
    }
  });

  it("accepts the reference build's explicit wrapper document shapes", async function () {
    for (const doc of [
      { blocks },
      { object: { blocks } },
      { document: { blocks } },
      { data: { document: { blocks } } },
      { result: { object: { blocks } } },
      { object: { body: { blocks } } },
    ]) {
      globalThis.fetch = (async () => ({
        ok: true,
        json: async () => doc,
      })) as any;
      assert.equal(
        (
          await new PdfClient(31009, "key").findPDFViewer(
            "space",
            "paper",
            attachmentKey,
          )
        ).block?.id,
        "pdf",
      );
    }
  });

  it("refuses ambiguous and unrelated manual PDFs before modifying anything", async function () {
    for (const doc of [
      { blocks: [blocks[0], blocks[1], { id: "other", type: "pdf" }] },
      { blocks: [blocks[1]] },
    ]) {
      globalThis.fetch = (async () => ({
        ok: true,
        json: async () => doc,
      })) as any;
      try {
        await new PdfClient(31009, "key").findPDFViewer(
          "space",
          "paper",
          attachmentKey,
        );
        assert.fail();
      } catch (error) {
        assert.match(
          String(error),
          /resolve duplicates|ownership cannot be established/,
        );
      }
    }
  });

  it("imports a reference fingerprint as ownership evidence", async function () {
    preferences.set(
      "extensions.zotero.anytero.syncState",
      JSON.stringify({ PAPER001: "paper" }),
    );
    preferences.set(
      `extensions.zotero.anytero.pdfEmbed.PAPER001.${attachmentKey}`,
      JSON.stringify(["space", "paper", attachmentKey, 100, 1]),
    );
    globalThis.fetch = (async () => ({
      ok: true,
      json: async () => ({ blocks: [blocks[1]] }),
    })) as any;
    assert.equal(
      (
        await new PdfClient(31009, "key").findPDFViewer(
          "space",
          "paper",
          attachmentKey,
        )
      ).block?.id,
      "pdf",
    );
  });

  it("does not treat missing blocks on an existing page as empty", async function () {
    globalThis.fetch = (async () => ({
      ok: true,
      json: async () => ({
        $schema: "schema",
        formatVersion: "2.0",
        id: "paper",
        type: "page",
      }),
    })) as any;
    const client = new PdfClient(31009, "key");
    try {
      await client.findPDFViewer("space", "paper", attachmentKey);
      assert.fail();
    } catch (error) {
      assert.include(String(error), "did not return a blocks array");
    }
    assert.isNull(
      (await client.findPDFViewer("space", "paper", attachmentKey, true)).block,
    );
  });

  it("discovers the update selector, dry-runs, then patches only the PDF file reference", async function () {
    const requests: any[] = [];
    globalThis.fetch = (async (url: string, options: any) => {
      if (url.includes("schemas/ops"))
        return {
          ok: true,
          json: async () => ({
            schema: { properties: { block_id: {}, set: {} } },
          }),
        };
      requests.push({ url, payload: JSON.parse(options.body) });
      return { ok: true, json: async () => ({}) };
    }) as any;
    await new PdfClient(31009, "key").updatePDFViewer(
      "space",
      "paper",
      "pdf",
      "new-file",
    );
    assert.lengthOf(requests, 2);
    assert.include(requests[0].url, "dry_run=true");
    assert.deepEqual(requests[1].payload, {
      ops: [
        { op: "update_block", block_id: "pdf", set: { object_id: "new-file" } },
      ],
    });
    assert.equal(blocks[2].text, "Keep my **summary**");
  });

  it("never commits a patch when the dry run fails", async function () {
    let patches = 0;
    globalThis.fetch = (async (url: string) => {
      if (url.includes("schemas/ops"))
        return {
          ok: true,
          json: async () => ({ properties: { id: {}, set: {} } }),
        };
      patches++;
      return { ok: false, status: 422, text: async () => "Invalid update" };
    }) as any;
    try {
      await new PdfClient(31009, "key").updatePDFViewer(
        "space",
        "paper",
        "pdf",
        "file",
      );
      assert.fail();
    } catch (error) {
      assert.include(String(error), "validation HTTP 422");
    }
    assert.equal(patches, 1);
  });

  it("inserts a reader link directly before a new viewer in one operation", async function () {
    globalThis.fetch = (async (_url: string, options: any) => {
      assert.deepEqual(JSON.parse(options.body), {
        ops: [
          {
            op: "insert_blocks",
            position: "first",
            blocks: [
              { type: "paragraph", text: marker },
              { type: "pdf", object_id: "file" },
            ],
          },
        ],
      });
      return { ok: true, json: async () => ({}) };
    }) as any;
    await new PdfClient(31009, "key").insertPDFBlock(
      "space",
      "paper",
      "file",
      attachmentKey,
    );
  });

  it("filters nested collections and includes PDFs without annotations", async function () {
    preferences.set("extensions.zotero.anytero.collectionId", "10");
    const paper: any = {
      id: 1,
      key: "PAPER001",
      libraryID: 1,
      isAttachment: () => false,
      isAnnotation: () => false,
      isNote: () => false,
      getCollections: () => [12],
      isFileAttachment: () => false,
      getAttachments: () => [2],
      getCreators: () => [],
      getField: () => "Paper",
      getTags: () => [],
    };
    const attachment: any = {
      id: 2,
      isFileAttachment: () => true,
      attachmentContentType: "application/pdf",
    };
    Object.assign((globalThis as any).Zotero, {
      Libraries: { userLibraryID: 1 },
      Collections: {
        get: () => ({ libraryID: 1 }),
        getByParent: (id: number) =>
          id === 10 ? [{ id: 11 }] : id === 11 ? [{ id: 12 }] : [],
      },
      Items: {
        get: (id: number) => (id === 1 ? paper : attachment),
        getAll: async () => [paper],
      },
    });
    assert.deepEqual(
      [...AnyTeroCollectionFilter.collectionIds()!],
      [10, 11, 12],
    );
    assert.lengthOf(await new ItemReader().getAllItemsWithAnnotations(), 1);
    preferences.set("extensions.zotero.anytero.collectionId", "");
    assert.isNull(AnyTeroCollectionFilter.collectionIds());
  });

  it("exports annotated copies and commits fingerprints only after verified updates", async function () {
    const removed: string[] = [];
    const exports: any[] = [];
    let currentFile = "old";
    let uploads = 0;
    let updates = 0;
    const attachment: any = {
      id: 2,
      key: attachmentKey,
      isFileAttachment: () => true,
      attachmentContentType: "application/pdf",
      getFilePathAsync: async () => "original.pdf",
      getAnnotations: () => [],
    };
    Object.assign((globalThis as any).Zotero, {
      Items: {
        get: (id: number) =>
          id === 1 ? { getAttachments: () => [2] } : attachment,
      },
      Utilities: { randomString: () => "unique" },
      getTempDirectory: () => ({
        path: "temp",
        append(name: string) {
          this.path += "/" + name;
        },
      }),
      PDFWorker: { export: async (...args: any[]) => exports.push(args) },
    });
    (globalThis as any).IOUtils = {
      exists: async () => true,
      stat: async () => ({ size: 100, lastModified: 1 }),
      read: async () => new TextEncoder().encode("%PDF-1.7\n%%EOF"),
      remove: async (path: string) => removed.push(path),
    };
    const client: any = {
      findPDFViewer: async () => ({
        block: { id: "pdf", object_id: currentFile },
      }),
      uploadAnnotatedPDF: async () => {
        uploads++;
        return "new";
      },
      updatePDFViewer: async () => {
        updates++;
        currentFile = "new";
      },
      insertPDFBlock: async () => assert.fail("must update existing viewer"),
    };
    const sync = new PdfSync();
    const item: any = { id: 1, key: "PAPER001" };
    await sync.sync(item, client, "space", "paper");
    await sync.sync(item, client, "space", "paper");
    assert.equal(uploads, 1);
    assert.equal(updates, 1);
    assert.deepEqual(exports[0], [2, removed[0], true]);
    assert.lengthOf(removed, 2);
    assert.equal(
      preferences.get(
        `extensions.zotero.anytero.pdfEmbed.file.space.paper.${attachmentKey}`,
      ),
      "new",
    );
  });
});
