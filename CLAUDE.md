# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

AnyTero is a Zotero plugin that syncs Zotero annotations to an Anytype space.

## Development Environment

The project uses [direnv](https://direnv.net/) with an Anaconda layout:

```
layout anaconda zotero
```

Run `direnv allow` after cloning to activate the environment. The `zotero` layout name suggests a custom direnv layout for local Zotero plugin development.

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
- Output goes to `.scaffold/build/`

## Module Layout

```
src/modules/zotero/     — Zotero API wrappers (itemReader, notifierListener)
src/modules/anytype/    — Anytype REST client, body renderer, mapper, spaceBoot
src/modules/sync/       — syncEngine (orchestration), syncState (ID mapping persistence)
```

## Zotero API Gotchas

- Use `Zotero.Item` for item types, not `_ZoteroTypes.Item` (doesn't exist)
- `item.getAttachments()` returns `number[]` (IDs), not `Item[]` — cast via `unknown` when treating as `Zotero.Item[]`
- `item.parentID` is `number | false | null` — check truthiness before using as `number`
- `Zotero.Items.getAll()` typed as returning IDs; double-cast via `unknown` when treating as `Zotero.Item[]`

## Zotero URI Schemes

- `zotero://select/library/items/KEY` — opens and selects item in Zotero
- `zotero://open-pdf/library/items/ATTKEY?page=PAGE&annotation=ANNKEY` — opens PDF at annotation

## Anytype API

- Local REST API at `http://127.0.0.1:31009/v1` (desktop app must be running)
- Required headers: `Authorization: Bearer <key>`, `Anytype-Version: 2025-11-08`
- Auth: API key from Anytype Settings → API Keys, stored in `extensions.zotero.anytero.apiKey`

## Data Model

Anytype object type: `Book Note` (one per Zotero item). Object has a `Zotero Link` property (`zotero://select/...`). Body lists annotations as markdown links: `[text](zotero://open-pdf/library/items/ATTKEY?page=PAGE&annotation=KEY)`. Sync state (Zotero key → Anytype object ID) is persisted as JSON in `Zotero.Prefs`.
