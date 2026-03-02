# AnyTero Architecture

AnyTero is a Zotero 7 plugin that mirrors PDF annotations from Zotero into an [Anytype](https://anytype.io) space. Each Zotero library item that has annotations is represented as a single Anytype object ("Book Note") whose body lists the annotations as deep-link markdown. A `Zotero Link` property on the object lets users navigate back to the source item in Zotero.

## Source Tree

```
src/
├── index.ts                     # Plugin bootstrap entry point
├── addon.ts                     # Addon singleton — runtime state container
├── hooks.ts                     # Zotero lifecycle hooks + prefs event handlers
│
├── modules/
│   ├── zotero/
│   │   ├── itemReader.ts        # Read items & annotations from Zotero APIs
│   │   └── notifierListener.ts  # Zotero Notifier observer — debounced realtime sync
│   │
│   ├── anytype/
│   │   ├── client.ts            # HTTP client for the Anytype local REST API
│   │   ├── spaceBoot.ts         # One-time space setup (ensures required property exists)
│   │   ├── mapper.ts            # Maps ZoteroItem → Anytype create/update payloads
│   │   └── bodyRenderer.ts      # Renders annotation lists as markdown
│   │
│   └── sync/
│       ├── syncEngine.ts        # Orchestrates create / incremental-update / delete / full sync
│       └── syncState.ts         # Persists Zotero key → Anytype object ID mapping in Zotero.Prefs
│
└── utils/
    ├── locale.ts                # Fluent (FTL) locale helpers
    ├── prefs.ts                 # Typed wrappers for Zotero.Prefs get/set/clear
    ├── window.ts                # Window liveness check
    └── ztoolkit.ts              # ZoteroToolkit initialisation
```

---

## Module Breakdown

### Entry Point — `index.ts`

`index.ts` is the Zotero bootstrap entry point. It instantiates the `Addon` singleton once (idempotent guard), registers it as `Zotero.AnyTero`, and exposes `ztoolkit` as a lazy global via `Object.defineProperty`.

### Runtime Container — `addon.ts`

`Addon` is a plain data bag that owns mutable plugin-lifetime state:

| Field | Type | Purpose |
|---|---|---|
| `alive` | `boolean` | Set to `false` on shutdown to prevent in-flight callbacks |
| `client` | `AnytypeClient?` | HTTP client (created once, reused across operations) |
| `syncEngine` | `SyncEngine?` | Core sync orchestrator |
| `notifierListener` | `NotifierListener?` | Zotero change observer (realtime mode only) |
| `prefsWindow` | `Window?` | Reference to the open preferences window |

### Lifecycle Hooks — `hooks.ts`

Zotero calls lifecycle hooks; `hooks.ts` wires them to AnyTero behaviour:

| Hook | When called | What it does |
|---|---|---|
| `onStartup` | Plugin enabled | Waits for Zotero ready, calls `onMainWindowLoad` for each open window |
| `onMainWindowLoad` | Each main window opens | Registers the preference pane, calls `_initSyncIfConfigured` |
| `onMainWindowUnload` | Window closes | Unregisters the notifier listener and toolkit elements |
| `onShutdown` | Plugin disabled/uninstalled | Same as unload + sets `alive = false`, deletes `Zotero.AnyTero` |
| `onPrefsEvent` | User interacts with the prefs pane | Routes `load`, `spaceChange`, `syncNow`, `setup` events |

`_initSyncIfConfigured` reads the stored prefs and conditionally boots the full sync stack. It is called both on startup and after the setup wizard completes.

---

## Anytype Module

### `client.ts` — REST HTTP Client

Wraps the Anytype local API (`http://127.0.0.1:<port>/v1`) behind typed methods:

```
listSpaces()           GET  /spaces
createObject()         POST /spaces/:id/objects
updateObject()         PATCH /spaces/:id/objects/:objectId
getObject()            GET  /spaces/:id/objects/:objectId
deleteObject()         DELETE /spaces/:id/objects/:objectId
listTypes()            GET  /spaces/:id/types
listProperties()       GET  /spaces/:id/properties
createProperty()       POST /spaces/:id/properties
```

All requests carry `Authorization: Bearer <apiKey>` and `Anytype-Version: 2025-11-08`.

### `spaceBoot.ts` — Space Initialisation

Runs once when the user clicks "Setup" in the preference pane. Ensures the `Zotero Link` (URL-format) property exists in the chosen Anytype space, creating it if absent. Returns a `SpaceConfig` that is serialised to `Zotero.Prefs` and reused on every subsequent startup.

### `mapper.ts` — Payload Builder

Converts a `ZoteroItem` + rendered body string + `SpaceConfig` into Anytype API payloads:

- `toCreatePayload` → `CreateObjectPayload` (used for new objects)
- `toUpdatePayload` → `UpdateObjectPayload` (used for existing objects)

Both include the item title as `name` and the `zoteroLink` property set to `zotero://select/library/items/<KEY>`.

### `bodyRenderer.ts` — Markdown Body

Renders a list of `ZoteroAnnotation` objects into a markdown string suitable for Anytype's body field:

```markdown
## Annotations

[Highlighted text](zotero://open-pdf/library/items/ATTKEY?page=5&annotation=ANNKEY)

💬 My comment

🏷️ `tag1` `tag2`

---
```

Each annotation becomes a deep-link back to the exact page and annotation in Zotero's PDF reader.

---

## Zotero Module

### `itemReader.ts` — Zotero Data Access

Provides a stable, typed facade over the Zotero JavaScript API:

- `getItem(id)` — fetches a single library item (skips attachments/annotations)
- `getAnnotations(item)` — returns all PDF annotations for an item, sorted by page number
- `getAllItemsWithAnnotations()` — enumerates the entire user library and returns items that have at least one annotation

The module also defines the two core domain types used throughout the codebase:
- `ZoteroItem` — normalised item fields (title, creators, year, DOI, etc.)
- `ZoteroAnnotation` — normalised annotation fields (type, text, comment, page, tags, etc.)

### `notifierListener.ts` — Realtime Change Observer

Registers a `Zotero.Notifier` observer for `item` events. When an annotation is added/modified, it walks up the item hierarchy (annotation → attachment → library item) and enqueues a debounced sync (2 s delay) to coalesce rapid consecutive edits. On item deletion, it immediately delegates to `SyncEngine.deleteItem`.

---

## Sync Module

### `syncState.ts` — Persistent ID Mapping

Maintains a JSON map of `zoteroKey → anytypeObjectId` persisted in `Zotero.Prefs` under `extensions.zotero.anytero.syncState`. Provides `get`, `set`, `remove`, `getAll`, and `clear` operations. This is the single source of truth for whether a Zotero item has a corresponding Anytype object.

### `syncEngine.ts` — Sync Orchestration

The central sync logic:

| Method | Behaviour |
|---|---|
| `syncItem(id)` | If no Anytype object exists → create. If it exists → fetch current body, find new annotations (those whose text is not yet in the body), append them. No-ops if nothing new. |
| `deleteItem(key)` | Deletes the Anytype object and removes the state entry. |
| `fullSync(onProgress?)` | Iterates all items with annotations, calls `syncItem` for each, then prunes state entries for items no longer present in Zotero. |

The incremental update strategy for `syncItem` appends only new annotation text blocks to the existing body rather than overwriting it. This preserves any edits the user may have made in Anytype.

---

## Data Flow

### Startup / Full Sync

```
onMainWindowLoad
  └─ _initSyncIfConfigured
       ├─ read prefs (apiKey, spaceId, spaceConfig, syncMode)
       ├─ new AnytypeClient(port, apiKey)
       ├─ new ItemReader()
       ├─ new SyncState()
       ├─ new SyncEngine(reader, client, state)
       ├─ engine.setSpaceConfig(parsedSpaceConfig)
       └─ if syncMode ∈ {realtime, both}:
            new NotifierListener(engine.syncItem, engine.deleteItem).register()

onPrefsEvent("syncNow")
  └─ engine.fullSync(progressCallback)
       ├─ itemReader.getAllItemsWithAnnotations() → ZoteroItem[]
       ├─ for each item: engine.syncItem(item.id)
       └─ prune stale syncState entries
```

### Realtime Annotation Sync

```
User highlights text in Zotero PDF reader
  └─ Zotero.Notifier fires "modify" event for annotation item
       └─ NotifierListener._handleItemEvent
            └─ annotation → attachment → library item ID
                 └─ _enqueueSync(libraryItemId)  [2 s debounce]
                      └─ engine.syncItem(libraryItemId)
                           ├─ itemReader.getItem(id)
                           ├─ itemReader.getAnnotations(item)
                           ├─ client.getObject(spaceId, existingId) → existingBody
                           ├─ filter annotations not in existingBody
                           └─ client.updateObject(spaceId, id, { markdown: appendedBody })
```

### Setup Wizard

```
onPrefsEvent("setup")
  └─ SpaceBoot(client).run(spaceId, objectTypeKey)
       ├─ client.listProperties(spaceId, { nameContains: "Zotero Link" })
       ├─ if not found: client.createProperty(spaceId, { name, format: "url" })
       └─ return SpaceConfig { spaceId, typeKey, relations: { zoteroLink } }
  └─ Zotero.Prefs.set("spaceConfig", JSON.stringify(spaceConfig))
  └─ _initSyncIfConfigured()   ← reinitialises sync with new config
```

---

## Configuration / Preferences

All preferences are stored under the `extensions.zotero.anytero` prefix:

| Key | Type | Description |
|---|---|---|
| `apiKey` | `string` | Anytype API key (from Anytype Settings → API Keys) |
| `port` | `number` | Anytype local API port (default: 31009) |
| `spaceId` | `string` | ID of the chosen Anytype space |
| `objectTypeKey` | `string` | Key of the Anytype object type to use (e.g. a "Book Note" type) |
| `spaceConfig` | `string` (JSON) | Serialised `SpaceConfig` (set by the setup wizard) |
| `syncMode` | `string` | `"realtime"` \| `"manual"` \| `"both"` |
| `syncState` | `string` (JSON) | Serialised `{ [zoteroKey]: anytypeObjectId }` map |

---

## Key Design Decisions

**One Anytype object per Zotero item.** Rather than one object per annotation, all annotations for a library item are grouped into a single "Book Note" object. This keeps the Anytype space tidy and makes manual editing more practical.

**Append-only incremental updates.** When syncing an existing object, the engine appends only annotations whose text is not already present in the body. This is a heuristic — it avoids overwriting user edits in Anytype at the cost of potentially missing re-added annotations or updated annotation text. Full syncs do not reset bodies.

**Debounced realtime sync.** The notifier listener waits 2 seconds after the last annotation event before triggering a sync. This coalesces bursts of changes (e.g. adding several highlights in quick succession) into a single API call.

**SpaceConfig persisted to prefs.** The property key for `Zotero Link` is discovered/created during setup and then cached in prefs. This avoids a round-trip to the Anytype API on every startup just to look up a property key.

**No Zotero database writes.** AnyTero only reads from Zotero. All plugin state is stored in `Zotero.Prefs` (the Firefox preferences store), never in Zotero's SQLite database.
