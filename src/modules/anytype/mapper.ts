import type { ZoteroItem } from "../zotero/itemReader";
import type { CreateObjectPayload, UpdateObjectPayload } from "./client";

export interface SpaceConfig {
  spaceId: string;
  typeKey: string;
  relations: {
    zoteroLink: string;
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

function buildProperties(item: ZoteroItem, config: SpaceConfig) {
  return [
    { key: config.relations.zoteroLink, url: `zotero://select/library/items/${item.key}` },
  ];
}
