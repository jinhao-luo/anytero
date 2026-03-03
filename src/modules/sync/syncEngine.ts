/**
 * @file syncEngine.ts
 *
 * Central sync orchestrator for AnyTero. Coordinates between the Zotero item
 * reader, the Anytype REST client, and the sync state store to create, update,
 * and delete Anytype objects that mirror Zotero library items.
 *
 * Sync strategies:
 * - **Create**: when no Anytype object exists yet for a Zotero item, a new
 *   object is created with the full annotation body.
 * - **Incremental update**: when an object already exists, only annotations
 *   whose text is not found in the current body are appended. This preserves
 *   any manual edits the user has made in Anytype.
 * - **Delete**: removes the Anytype object and the corresponding sync state
 *   entry.
 * - **Full sync**: iterates all items with annotations, calls `syncItem` for
 *   each, then prunes stale state entries for items no longer in Zotero.
 */

import { ItemReader } from "../zotero/itemReader";
import { AnytypeClient } from "../anytype/client";
import { joinAnnotations, appendAnnotations } from "../anytype/bodyRenderer";
import { toCreatePayload, toUpdatePayload } from "../anytype/mapper";
import type { SpaceConfig } from "../anytype/mapper";
import { SyncState } from "./syncState";

/** Progress snapshot passed to `ProgressCallback` during a full sync. */
export interface SyncProgress {
  current: number;
  total: number;
}

/** Callback invoked after each item is processed during `fullSync`. */
export type ProgressCallback = (progress: SyncProgress) => void;

/**
 * Orchestrates annotation sync between Zotero and Anytype.
 *
 * Must be configured with a `SpaceConfig` (via `setSpaceConfig`) before any
 * sync operations are called.
 */
export class SyncEngine {
  private _itemReader: ItemReader;
  private _client: AnytypeClient;
  private _state: SyncState;
  private _spaceConfig: SpaceConfig | null = null;

  constructor(itemReader: ItemReader, client: AnytypeClient, state: SyncState) {
    this._itemReader = itemReader;
    this._client = client;
    this._state = state;
  }

  /** Sets the Anytype space configuration. Must be called before syncing. */
  setSpaceConfig(config: SpaceConfig): void {
    this._spaceConfig = config;
  }

  /**
   * Syncs a single Zotero item to Anytype.
   *
   * - If no Anytype object exists: creates one with the full annotation body.
   * - If an object exists: fetches the current body, finds annotations not yet
   *   present (by text), and appends them. No-ops if nothing new.
   *
   * Errors are logged and swallowed so a single failure doesn't abort a full
   * sync batch.
   */
  async syncItem(zoteroItemId: number): Promise<void> {
    if (!this._spaceConfig) {
      ztoolkit.log(
        "SyncEngine: no space config, skipping sync for",
        zoteroItemId,
      );
      return;
    }

    const item = this._itemReader.getItem(zoteroItemId);
    if (!item) {
      ztoolkit.log("SyncEngine: item not found", zoteroItemId);
      return;
    }

    const annotations = this._itemReader.getAnnotations(item);
    const { spaceId, relations } = this._spaceConfig;
    // TODO: extract zotero URL construction into helper functions
    const expectedZoteroLink = `zotero://select/library/items/${item.key}`;

    // Validate the tracked Anytype object (if any): it must exist, not be
    // archived, and have the correct Zotero Link property. If any check
    // fails, discard the stale state entry and fall through to create.
    let trackedObjectId = this._state.getObjectId(item.key);
    let existingBody = "";

    if (trackedObjectId) {
      try {
        const existing = await this._client.getObject(spaceId, trackedObjectId);
        const isArchived = existing.archived;
        const zoteroLinkProp = existing.properties.find(
          (p) => p.key === relations.zoteroLink,
        );
        const hasCorrectLink = zoteroLinkProp?.url === expectedZoteroLink;

        if (isArchived || !hasCorrectLink) {
          ztoolkit.log(
            "SyncEngine: tracked object invalid for",
            item.key,
            "(archived:",
            isArchived,
            ", correct link:",
            hasCorrectLink,
            ") — recreating",
          );
          this._state.remove(item.key);
          trackedObjectId = null;
        } else {
          existingBody = existing.markdown.trimEnd();
        }
      } catch (e) {
        ztoolkit.log(
          "SyncEngine: failed to fetch tracked object for",
          item.key,
          "— recreating:",
          e,
        );
        this._state.remove(item.key);
        trackedObjectId = null;
      }
    }

    try {
      if (trackedObjectId !== null) {
        // Incremental update: append only annotations not yet in the body.
        // Key-based detection is reliable for all annotation types (including
        // image/ink which have no text) since each key appears in its link URL.
        const newAnnotations = annotations.filter(
          (ann) => !existingBody.includes(ann.key),
        );

        if (newAnnotations.length === 0) {
          ztoolkit.log("SyncEngine: no new annotations for", item.key);
          return;
        }

        const body = appendAnnotations(existingBody, newAnnotations);
        await this._client.updateObject(spaceId, trackedObjectId, {
          markdown: body,
        });
        ztoolkit.log(
          "SyncEngine: updated object",
          trackedObjectId,
          "for item",
          item.key,
        );
      } else {
        const body = joinAnnotations(annotations);
        const payload = toCreatePayload(item, body, this._spaceConfig);
        const objectId = await this._client.createObject(spaceId, payload);
        this._state.set(item.key, objectId);
        ztoolkit.log(
          "SyncEngine: created object",
          objectId,
          "for item",
          item.key,
        );
      }
    } catch (e) {
      ztoolkit.log("SyncEngine: error syncing item", item.key, e);
    }
  }

  /**
   * Deletes the Anytype object for a removed Zotero item and clears the sync
   * state entry. No-ops if no object is tracked for the given key.
   */
  async deleteItem(zoteroItemKey: string): Promise<void> {
    if (!this._spaceConfig) return;

    const objectId = this._state.getObjectId(zoteroItemKey);
    if (!objectId) return;

    try {
      await this._client.deleteObject(this._spaceConfig.spaceId, objectId);
      this._state.remove(zoteroItemKey);
      ztoolkit.log(
        "SyncEngine: deleted object",
        objectId,
        "for item",
        zoteroItemKey,
      );
    } catch (e) {
      ztoolkit.log("SyncEngine: error deleting item", zoteroItemKey, e);
    }
  }

  /**
   * Syncs all Zotero items with annotations. After syncing, prunes sync state
   * entries for items that no longer exist in the Zotero library.
   *
   * @param onProgress - Optional callback invoked after each item with the
   *   current and total counts.
   * @returns The number of items processed.
   */
  async fullSync(onProgress?: ProgressCallback): Promise<number> {
    if (!this._spaceConfig) {
      ztoolkit.log("SyncEngine: no space config, skipping full sync");
      return 0;
    }

    const items = await this._itemReader.getAllItemsWithAnnotations();
    const total = items.length;
    let current = 0;

    for (const item of items) {
      await this.syncItem(item.id);
      current++;
      onProgress?.({ current, total });
    }

    // Prune state entries for items no longer in Zotero
    const allState = this._state.getAll();
    const activeKeys = new Set(items.map((i) => i.key));
    for (const key of Object.keys(allState)) {
      if (!activeKeys.has(key)) {
        ztoolkit.log("SyncEngine: pruning stale state entry for", key);
        this._state.remove(key);
      }
    }

    return current;
  }
}
