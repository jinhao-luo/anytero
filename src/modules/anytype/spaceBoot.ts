import { AnytypeClient } from "./client";
import type { SpaceConfig } from "./mapper";

const ZOTERO_TYPE_NAME = "Zotero Item";
const ZOTERO_TYPE_KEY_HINT = "zotero_item";

const RELATIONS_TO_CREATE = [
  { name: "Authors", format: "text", key: "authors" },
  { name: "Year", format: "text", key: "year" },
  { name: "DOI", format: "url", key: "doi" },
  { name: "Publication", format: "text", key: "publication" },
  { name: "Item Type", format: "text", key: "itemType" },
  { name: "Tags", format: "text", key: "tags" },
  { name: "Zotero Key", format: "text", key: "zoteroKey" },
  { name: "Date Synced", format: "date", key: "dateSynced" },
] as const;

type RelationKeys = (typeof RELATIONS_TO_CREATE)[number]["key"];

export class SpaceBoot {
  private _client: AnytypeClient;

  constructor(client: AnytypeClient) {
    this._client = client;
  }

  async run(spaceId: string): Promise<SpaceConfig> {
    ztoolkit.log("SpaceBoot: creating type and relations in space", spaceId);

    const typeKey = await this._ensureType(spaceId);
    const relationKeys = await this._ensureRelations(spaceId);

    const config: SpaceConfig = {
      spaceId,
      typeKey,
      relations: {
        authors: relationKeys.authors,
        year: relationKeys.year,
        doi: relationKeys.doi,
        publication: relationKeys.publication,
        itemType: relationKeys.itemType,
        tags: relationKeys.tags,
        zoteroKey: relationKeys.zoteroKey,
        dateSynced: relationKeys.dateSynced,
      },
    };

    return config;
  }

  private async _ensureType(spaceId: string): Promise<string> {
    // Search for existing type first
    const existing = await this._client.searchObjects(spaceId, {
      object_type: "type",
      query: ZOTERO_TYPE_NAME,
    });

    if (existing.length > 0) {
      ztoolkit.log("SpaceBoot: found existing type", existing[0]);
      return ZOTERO_TYPE_KEY_HINT;
    }

    const key = await this._client.createType(spaceId, {
      name: ZOTERO_TYPE_NAME,
      icon: "📚",
    });

    ztoolkit.log("SpaceBoot: created type with key", key);
    return key || ZOTERO_TYPE_KEY_HINT;
  }

  private async _ensureRelations(
    spaceId: string,
  ): Promise<Record<RelationKeys, string>> {
    const keys = {} as Record<RelationKeys, string>;

    for (const rel of RELATIONS_TO_CREATE) {
      const key = await this._client.createRelation(spaceId, {
        name: rel.name,
        format: rel.format,
      });
      keys[rel.key] = key || rel.key;
      ztoolkit.log(`SpaceBoot: relation "${rel.name}" → key "${keys[rel.key]}"`);
    }

    return keys;
  }
}
