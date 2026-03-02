# AnyTero

**AnyTero** is a [Zotero 7](https://www.zotero.org) plugin that syncs your PDF annotations from Zotero into an [Anytype](https://anytype.io) space.

Each Zotero library item that has annotations is mirrored as a single Anytype object (e.g. a "Book Note"). The object body lists all annotations as deep-links back to the exact page in Zotero's PDF reader. A `Zotero Link` property on each object lets you jump straight from Anytype to the source item in Zotero.

## Features

- **Realtime sync** — annotations are pushed to Anytype within ~2 seconds of being added or modified.
- **Manual full sync** — sync all annotated items at once from the preferences pane.
- **Incremental updates** — only new annotations are appended; existing Anytype content is preserved.
- **Deep-links** — every annotation is a clickable `zotero://open-pdf/…` link that opens the PDF at the exact page and position.
- **Tag + comment support** — comments and tags are included below each annotation.

## Requirements

- [Zotero 7](https://www.zotero.org/support/beta_builds)
- [Anytype desktop app](https://anytype.io) running locally
- An Anytype API key (Settings → API Keys)

## Installation

1. Download the latest `.xpi` from the [Releases](https://github.com/jinhao-luo/anytero/releases) page.
2. In Zotero, go to **Tools → Add-ons → Install Add-on From File** and select the `.xpi`.
3. Restart Zotero if prompted.

## Setup

1. Open **Zotero → Edit → Settings → AnyTero** (or **Zotero → Preferences → AnyTero** on macOS).
2. Enter your **Anytype API key** (from Anytype → Settings → API Keys).
3. Select the **Anytype space** and the **object type** you want synced items to use (e.g. a "Book Note" type).
4. Click **Setup** — this ensures the required `Zotero Link` property exists in your space.
5. Optionally click **Sync Now** to perform an immediate full sync of all annotated items.

From this point, new annotations will be pushed to Anytype automatically (realtime mode).

## Sync Modes

| Mode | Behaviour |
|---|---|
| `realtime` | Only realtime sync; no full sync on startup |
| `manual` | Only syncs when you click "Sync Now" |
| `both` _(default)_ | Realtime sync enabled; manual sync also available |

## Data Model

Each Zotero item with annotations maps to one Anytype object:

| Anytype field | Value |
|---|---|
| Name | Zotero item title |
| Body | Markdown list of annotation deep-links |
| `Zotero Link` | `zotero://select/library/items/<KEY>` |

Annotation body format:

```
## Annotations

[Highlighted text](zotero://open-pdf/library/items/ATTKEY?page=5&annotation=ANNKEY)

💬 My comment

🏷️ `tag1` `tag2`
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

## License

[AGPL-3.0](LICENSE) — Jinhao Luo
