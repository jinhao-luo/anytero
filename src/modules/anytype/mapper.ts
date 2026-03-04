/**
 * @file mapper.ts
 *
 * Maps domain objects (`ZoteroItem` + rendered body) to Anytype API payloads.
 * Also defines `SpaceConfig`, the persisted configuration record that binds a
 * Zotero session to a particular Anytype space, object type, and property keys.
 */

import type { ZoteroItem } from "../zotero/itemReader";
import type { CreateObjectPayload, UpdateObjectPayload } from "./client";

/**
 * Persisted configuration produced by `SpaceBoot.run`. Captures which Anytype
 * space and object type to use, plus the stable property key for the
 * `Zotero Link` relation. Serialised as JSON in `Zotero.Prefs`.
 */
export interface SpaceConfig {
  spaceId: string;
  /** Anytype object type key, e.g. the key for a "Book Note" type. */
  typeKey: string;
  relations: {
    /** Property key for the URL-format "Zotero Link" property. */
    zoteroLink: string;
  };
}

/**
 * Builds a `CreateObjectPayload` for a new Anytype object representing the
 * given Zotero item. Sets the object name, body, type, and `Zotero Link`
 * property.
 */
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

/**
 * Builds an `UpdateObjectPayload` for patching an existing Anytype object.
 * Updates the name, body, and `Zotero Link` property.
 */
export function toUpdatePayload(
  item: ZoteroItem,
  body: string,
  config: SpaceConfig,
): UpdateObjectPayload {
  return {
    name: item.title,
    markdown: body,
    properties: buildProperties(item, config),
  };
}

function buildProperties(item: ZoteroItem, config: SpaceConfig) {
  return [
    {
      key: config.relations.zoteroLink,
      url: `zotero://select/library/items/${item.key}`,
    },
  ];
}
