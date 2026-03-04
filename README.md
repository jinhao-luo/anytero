# AnyTero

Inspired by [notero](https://github.com/dvanoni/notero)✨.

**AnyTero** is a [Zotero 7+](https://www.zotero.org) plugin that syncs your PDF annotations from Zotero into an [Anytype](https://anytype.io) space.

Each Zotero library item that has annotations is mirrored as a single Anytype object (e.g. a "Book Note"). The object body lists all annotations as deep-links back to the annotation in Zotero's PDF reader. A `Zotero Link` property on each object lets you jump straight from Anytype to the library item in Zotero.

## Features

- **Realtime sync** — annotations are pushed to Anytype immediately after being added or modified.
- **Manual full sync** — sync all annotated items at once from the preferences pane.
- **Incremental updates** — only new annotations are appended; existing Anytype content is preserved.
- **Deep-links** — every annotation is a clickable `zotero://open-pdf/…` link that opens the PDF at the position of the annotation.

## Requirements

- [Zotero 7+](https://www.zotero.org/download/)
- [Anytype desktop app](https://anytype.io) running locally
- An Anytype API key (Settings → API Keys)

## Installation

1. Download the latest `.xpi` from the [Releases](https://github.com/jinhao-luo/anytero/releases) page.
2. In Zotero, go to **Plugins → Install Add-on From File** and select the `.xpi`.
3. Restart Zotero.

## Setup

1. In Zotero, Open **Settings → AnyTero**.
2. Enter your **Anytype API key** (from Anytype → Settings → API Keys).
3. Select the **Anytype Space**, the **Object Type** you want synced items to use (e.g. a "Book Note" type) and [**Sync Mode**](#sync-modes).
4. Click **Re-run Setup Wizard** — this ensures the required `Zotero Link` property exists in your space. **Re-run whenever you change the above settings**.
5. Optionally click **Sync Now** to perform an immediate full sync of all annotated items.

## Sync Modes

| Mode                   | Behaviour                                                           |
| ---------------------- | ------------------------------------------------------------------- |
| `realtime` _(default)_ | Syncs annotations automatically as they are added/edited in Zotero. |
| `manual`               | Only syncs when you click "Sync Now"                                |

## Data Model

Each Zotero item with annotations maps to one Anytype object:

| Anytype field | Value                                  |
| ------------- | -------------------------------------- |
| Name          | Zotero item title                      |
| Body          | Markdown list of annotation deep-links |
| `Zotero Link` | `zotero://select/library/items/<KEY>`  |

Annotation body format:

```
---
[Highlighted text 1](zotero://open-pdf/library/items/ATTKEY?&annotation=ANNKEY1)

---
[Highlighted text 2](zotero://open-pdf/library/items/ATTKEY?page=5&annotation=ANNKEY2)

---
```

## Development

See [scaffold.md](scaffold.md) for the full scaffold / build / release documentation inherited from [zotero-plugin-template](https://github.com/windingwind/zotero-plugin-template).

Quick start:

```sh
npm install
cp .env.example .env   # set ZOTERO_PLUGIN_ZOTERO_BIN_PATH
npm start              # hot-reload dev server
```

For architecture and module documentation, see [architecture.md](architecture.md).
