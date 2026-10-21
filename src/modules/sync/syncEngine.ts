/** @file PDF-only orchestration ported from the supplied v0.1.9 XPI. */
import { ItemReader } from "../zotero/itemReader";
import { AnyTeroCollectionFilter } from "../zotero/collectionFilter";
import { AnytypeClient, AnytypeHttpError } from "../anytype/client";
import { toCreatePayload, type SpaceConfig } from "../anytype/mapper";
import { SyncState } from "./syncState";
import { PdfSync } from "./pdfSync";
import { PdfStatus } from "./pdfStatus";

export interface SyncProgress {
  current: number;
  total: number;
}
export type ProgressCallback = (progress: SyncProgress) => void;
let queue: Promise<unknown> = Promise.resolve();

export class SyncEngine {
  private spaceConfig: SpaceConfig | null = null;
  constructor(
    private reader: ItemReader,
    private client: AnytypeClient,
    private state: SyncState,
    private pdfSync = new PdfSync(),
  ) {}
  setSpaceConfig(config: SpaceConfig): void {
    this.spaceConfig = config;
  }

  /** Serialize manual and event-driven sync to avoid competing creates. */
  async syncItem(id: number): Promise<void> {
    const run = queue.catch(() => {}).then(() => this.sync(id));
    queue = run;
    return run;
  }

  private async sync(id: number): Promise<void> {
    if (!this.spaceConfig) throw new Error("Configure AnyTero before syncing");
    const raw = Zotero.Items.get(id);
    if (
      !AnyTeroCollectionFilter.allows(
        raw,
        AnyTeroCollectionFilter.collectionIds(),
      )
    )
      return;
    const item = this.reader.getItem(id);
    if (!item) return;
    const { spaceId, relations } = this.spaceConfig;
    let objectId = this.state.getObjectId(item.key);
    let fresh = false;
    try {
      if (objectId) {
        try {
          const existing = await this.client.getObject(spaceId, objectId);
          if (existing.archived === true) {
            this.state.remove(item.key);
            objectId = null;
          } else {
            if (!Array.isArray(existing.properties))
              throw new Error(
                "Existing page response did not return properties; mapping retained",
              );
            const relation = existing.properties.find(
              (p) => p.key === relations.zoteroLink,
            );
            if (relation?.url !== `zotero://select/library/items/${item.key}`)
              throw new Error(
                "Tracked Anytype paper has an unexpected Zotero link; refusing to create another page",
              );
          }
        } catch (error) {
          if (
            !(error instanceof AnytypeHttpError) ||
            ![404, 410].includes(error.status)
          )
            throw error;
          // A missing space must not be mistaken for a missing paper.
          const spaces = await this.client.listSpaces();
          if (!spaces.some((space) => space.id === spaceId))
            throw new Error(
              "Destination space is unavailable; mapping retained",
            );
          this.state.remove(item.key);
          objectId = null;
        }
      }
      if (!objectId) {
        objectId = await this.client.createObject(
          spaceId,
          toCreatePayload(item, "", this.spaceConfig),
        );
        this.state.set(item.key, objectId);
        fresh = true;
        PdfStatus.report(`Created empty Anytype paper: ${item.title}`);
      }
      await this.pdfSync.sync(item, this.client, spaceId, objectId, fresh);
    } catch (error) {
      PdfStatus.report(
        `${item.title}: ${error instanceof Error ? error.message : "Synchronization failed"}`,
        true,
      );
      throw error;
    }
  }

  /** Never delete research pages in response to Zotero deletion. */
  async deleteItem(_key: string): Promise<void> {}

  async fullSync(onProgress?: ProgressCallback): Promise<number> {
    if (!this.spaceConfig) throw new Error("Configure AnyTero before syncing");
    const items = await this.reader.getAllItemsWithAnnotations();
    let current = 0;
    let failures = 0;
    for (const item of items) {
      try {
        await this.syncItem(item.id);
      } catch {
        failures++;
      }
      current++;
      onProgress?.({ current, total: items.length });
    }
    PdfStatus.report(
      `Batch finished: ${current} paper(s), ${failures} failure(s).`,
      failures > 0,
    );
    return current;
  }
}
