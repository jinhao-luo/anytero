# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

AnyTero is a Zotero plugin that syncs Zotero annotations to an Anytype space.

## Tech Stack

- TypeScript + esbuild via `zotero-plugin-scaffold` (wraps build + packaging)
- `zotero-plugin-toolkit` for Zotero notifier, prefs, UI helpers
- Plugin IDs: `addonID: anytero@jinhaoluo.com`, `addonRef: anytero`, `addonInstance: AnyTero`
- Prefs prefix: `extensions.zotero.anytero`

## Commands

- `npm run build` — bundle + type-check (esbuild + `tsc --noEmit`)
- `npm start` — hot-reload dev server (requires Zotero path in `.env`)
- `npm run test:unit` — run unit tests (mocha + tsx, no Zotero needed)
- `npm test` — integration tests via `zotero-plugin test`, requires Zotero running (fails otherwise)
- `npm run lint:check` — check formatting + lint (prettier + eslint)
- `npm run lint:fix` — auto-fix formatting + lint
- `npm run release` — build + package XPI for release
- Output goes to `.scaffold/build/`

## Environment Setup

`npm start` requires a `.env` file (copy `.env.example` → `.env`):

- `ZOTERO_PLUGIN_ZOTERO_BIN_PATH` — path to Zotero binary (`*/Zotero.app/Contents/MacOS/zotero` on macOS)
- `ZOTERO_PLUGIN_PROFILE_PATH` — path to dev profile (create with `zotero -p`)

## Module Layout

```
src/modules/zotero/     — Zotero API wrappers (itemReader, notifierListener)
src/modules/anytype/    — Anytype REST client, body renderer, mapper, spaceBoot
src/modules/sync/       — syncEngine (orchestration), syncState (ID mapping persistence)
src/utils/              — locale, prefs, window helpers, ztoolkit singleton
```

## Zotero API Gotchas

- Use `Zotero.Item` for item types, not `_ZoteroTypes.Item` (doesn't exist)
- `item.getAttachments()` returns `number[]` (IDs), not `Item[]` — cast via `unknown` when treating as `Zotero.Item[]`
- `item.parentID` is `number | false | null` — check truthiness before using as `number`
- `Zotero.Items.getAll()` typed as returning IDs; double-cast via `unknown` when treating as `Zotero.Item[]`

## Zotero URI Schemes

- `zotero://select/library/items/KEY` — opens and selects item in Zotero
- `zotero://open-pdf/library/items/ATTKEY?annotation=ANNKEY` — opens PDF at annotation (no page param)
- `zotero://open-pdf/library/items/ATTKEY?page=PAGE` — opens PDF at a specific page

## Anytype API

- Local REST API at `http://127.0.0.1:<port>/v1` (desktop app must be running); port defaults to `31009`, configurable via `extensions.zotero.anytero.port`
- Required headers: `Authorization: Bearer <key>`, `Anytype-Version: 2025-11-08`
- Auth: API key from Anytype Settings → API Keys, stored in `extensions.zotero.anytero.apiKey`

## Data Model

One Anytype object per Zotero item. Object type is user-selected (stored as `objectTypeKey` pref; e.g. "Book Note"). Object has a `Zotero Link` property (`zotero://select/...`). Body lists annotations as markdown links: `[text](zotero://open-pdf/library/items/ATTKEY?annotation=KEY) - [Page N](zotero://open-pdf/library/items/ATTKEY?page=PAGE)`. Sync state (Zotero key → Anytype object ID) is persisted as JSON in `Zotero.Prefs`.

## Reference Docs

- `architecture.md` — full module breakdown, data flow diagrams, design decisions; read before making architectural changes
- `scaffold.md` — build/release/template docs (original README from zotero-plugin-template)
- `README.md` — project-facing README (installation, setup, features)

## Code Documentation Style

- File-level: `/** @file … */` block at top of every `.ts` file
- Class/function-level: full JSDoc for non-trivial public members; single-line `/** */` for simple ones
- Private helpers that are self-explanatory can be left undocumented
