import { ItemReader } from "../zotero/itemReader";
import { AnytypeClient } from "../anytype/client";
import {
  renderAnnotationBody,
  renderSingleAnnotation,
  buildAnnotationLink,
  ensureDoubleNewlineEnding,
} from "../anytype/bodyRenderer";
import { toCreatePayload, toUpdatePayload } from "../anytype/mapper";
import type { SpaceConfig } from "../anytype/mapper";
import { SyncState } from "./syncState";

export interface SyncProgress {
  current: number;
  total: number;
}

export type ProgressCallback = (progress: SyncProgress) => void;

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

  setSpaceConfig(config: SpaceConfig): void {
    this._spaceConfig = config;
  }

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
    const { spaceId } = this._spaceConfig;

    const existingObjectId = this._state.getObjectId(item.key);

    try {
      if (existingObjectId) {
        const existing = await this._client.getObject(
          spaceId,
          existingObjectId,
        );
        const existingBody = existing.body ?? "";

        const newAnnotations = annotations.filter(
          (ann) => !existingBody.includes(ann.text),
        );

        let body: string;
        if (newAnnotations.length === 0) {
          ztoolkit.log("SyncEngine: no new annotations for", item.key);
          return;
        } else {
          const newChunks = newAnnotations
            .map(renderSingleAnnotation)
            .join("\n\n");
          body = ensureDoubleNewlineEnding(existingBody) + newChunks;
        }

        const payload = { markdown: body };
        await this._client.updateObject(spaceId, existingObjectId, payload);
        ztoolkit.log(
          "SyncEngine: updated object",
          existingObjectId,
          "for item",
          item.key,
        );
      } else {
        const body = renderAnnotationBody(annotations);
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
