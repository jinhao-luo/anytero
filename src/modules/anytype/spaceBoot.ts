import { AnytypeClient } from "./client";
import type { SpaceConfig } from "./mapper";

const ZOTERO_LINK_RELATION = { name: "Zotero Link", format: "url" } as const;

export class SpaceBoot {
  private _client: AnytypeClient;

  constructor(client: AnytypeClient) {
    this._client = client;
  }

  async run(spaceId: string, typeKey: string): Promise<SpaceConfig> {
    ztoolkit.log("SpaceBoot: ensuring Zotero Link property in space", spaceId);

    const zoteroLinkKey = await this._ensureProperty(spaceId);

    ztoolkit.log(`SpaceBoot: "Zotero Link" property key → "${zoteroLinkKey}"`);

    return {
      spaceId,
      typeKey,
      relations: { zoteroLink: zoteroLinkKey },
    };
  }

  private async _ensureProperty(spaceId: string): Promise<string> {
    const existing = await this._client.listProperties(spaceId, {
      nameContains: ZOTERO_LINK_RELATION.name,
    });
    const found = existing.find((p) => p.name === ZOTERO_LINK_RELATION.name);
    if (found) {
      ztoolkit.log(
        `SpaceBoot: found existing "${ZOTERO_LINK_RELATION.name}" property → "${found.key}"`,
      );
      return found.key;
    }
    return this._client.createProperty(spaceId, {
      name: ZOTERO_LINK_RELATION.name,
      format: ZOTERO_LINK_RELATION.format,
    });
  }
}
