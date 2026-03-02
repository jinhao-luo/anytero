import type { ZoteroItem } from "../zotero/itemReader";
import type { CreateObjectPayload, UpdateObjectPayload } from "./client";

export interface SpaceConfig {
  spaceId: string;
  typeKey: string;
  relations: {
    zoteroLink: string;
    authors: string;
    year: string;
    doi: string;
    publication: string;
    itemType: string;
    tags: string;
    zoteroKey: string;
    dateSynced: string;
  };
}

export function toCreatePayload(
  item: ZoteroItem,
  body: string,
  config: SpaceConfig,
): CreateObjectPayload {
  return {
    name: item.title,
    body,
    type_key: config.typeKey,
    properties: buildProperties(item, config),
  };
}

export function toUpdatePayload(
  item: ZoteroItem,
  body: string,
  config: SpaceConfig,
): UpdateObjectPayload {
  return {
    name: item.title,
    body,
    properties: buildProperties(item, config),
  };
}

function buildProperties(item: ZoteroItem, config: SpaceConfig): Record<string, unknown> {
  const rel = config.relations;
  const authorStr = item.creators
    .filter((c) => c.creatorType === "author")
    .map((c) => [c.lastName, c.firstName].filter(Boolean).join(", "))
    .join("; ");

  return {
    [rel.zoteroLink]: `zotero://select/library/items/${item.key}`,
    [rel.authors]: authorStr || null,
    [rel.year]: item.year ?? null,
    [rel.doi]: item.doi ?? null,
    [rel.publication]: item.publication ?? null,
    [rel.itemType]: item.itemType,
    [rel.tags]: item.tags.join(", ") || null,
    [rel.zoteroKey]: item.key,
    [rel.dateSynced]: new Date().toISOString(),
  };
}
