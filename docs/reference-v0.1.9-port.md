# Source port of the customized v0.1.9 XPI

Reference: `AnyTero-Zotero10-PDF-ExistingPagesFix-v0.1.9.xpi`, supplied by the user.
SHA-256: `1d28a58186945fba91980061e0dc54a7da7b8d0621dfd6f46e16f6943d492627`.
Source-port version: `0.1.10`. The AGPL license, plugin ID, authentication configuration and scaffold remain unchanged.

## Implementation map

| Reference bundle component                                                     | TypeScript source                                 |
| ------------------------------------------------------------------------------ | ------------------------------------------------- |
| Collection filter                                                              | `src/modules/zotero/collectionFilter.ts`          |
| Binary PDF upload, document inspection, schema discovery and viewer operations | `src/modules/anytype/pdfClient.ts`                |
| Annotated PDF export, fingerprint checks and cleanup                           | `src/modules/sync/pdfSync.ts`                     |
| PDF diagnostics                                                                | `src/modules/sync/pdfStatus.ts`                   |
| Empty-page creation and PDF-only synchronization                               | `src/modules/sync/syncEngine.ts`                  |
| Collection settings and Test Selected PDF                                      | `src/hooks.ts`, `addon/content/preferences.xhtml` |

The source client creates paper pages through API v1 using `type_key`, an empty body, and the Zotero Link relation. PDF uploads and block edits use API v2. An existing viewer is updated with `update_block`, using the installed API's operation schema and a dry run before committing. No synchronization path writes annotation text or replaces a page body.

Existing `syncState`, `collectionId`, `pdfEmbed.<paper>.<attachment>` and reader-link preferences are retained for compatibility with installed reference builds. Fingerprints are saved only after a read-back verifies the uploaded file reference. Managed block/file IDs are additionally retained to detect manual viewer replacement.

## Deliberate safety differences

- Setup and collection changes preserve mappings. Zotero item deletion never deletes an Anytype research page.
- HTTP status codes determine deletion recovery; error-message substrings do not. A missing destination space cannot be mistaken for a missing paper.
- Malformed mappings stop synchronization rather than being silently reset.
- A single unrelated manual PDF is protected. Legacy ownership requires the reference fingerprint or the exact Zotero reader marker. Multiple PDF viewers remain an actionable error.
- Papers with multiple source PDFs stop before exporting, because the reference loop would replace the same viewer repeatedly. This port supports one source PDF per paper.
- Manual and automatic synchronization share a queue. Attachment changes are included. Automatic mode retains the two-second event debounce; it is not a periodic collection scan.
- Diagnostics use a red, selectable text field with a Copy messages action. API-key values are redacted from server errors.

## Reference limitations retained

The v0.1.9 package does not provide old uploaded-file cleanup or a file-backed sync database. This source port retains its preference storage and does not bulk-delete historical file objects. Existing documents that return no blocks array are still rejected; the parser does not pretend those documents are empty. Only a page just created by the current synchronization may use the reference fresh-page exception.

The operation schema is discovered at runtime; an unsupported schema or failed preflight stops the update. Source-level tests do not establish compatibility with every installed Anytype build. Runtime annotation rendering, real API response captures, and installation in Zotero still require acceptance testing.

## Verification and build

63 unit tests pass, including binary-byte preservation, supported wrappers, reference preference compatibility, ownership checks, dry-run refusal, update-only payloads, temporary-file cleanup, annotation-free PDF discovery, filtering, and page preservation. TypeScript and targeted ESLint checks pass. Tests were executed using a local TypeScript loader because the sandbox blocks tsx's Windows user-information lookup.

```powershell
npm.cmd run test:unit
npm.cmd run build
```

The standard scaffold writes `.scaffold/build/any-tero.xpi`. Packaging was attempted but blocked by the sandbox's SWC native-cache permissions; permission to run the scaffold outside the sandbox was declined. No newly packaged XPI has been validated in this session.
