/**
 * @file spaceBoot.ts
 *
 * One-time space initialisation logic. `SpaceBoot.run` ensures the Anytype
 * space contains the required `Zotero Link` (URL format) property before any
 * objects are created, creating it if necessary. The returned `SpaceConfig` is
 * persisted to `Zotero.Prefs` and reused on subsequent startups.
 */

import { AnytypeClient } from "./client";
import type { SpaceConfig } from "./mapper";

const ZOTERO_LINK_RELATION = { name: "Zotero Link", format: "url" } as const;

/**
 * Bootstraps an Anytype space for use with AnyTero.
 *
 * Invoked once through the setup wizard in the preferences pane. After a
 * successful run the returned config is stored in prefs and the full sync
 * stack is (re-)initialised.
 */
export class SpaceBoot {
  private _client: AnytypeClient;

  constructor(client: AnytypeClient) {
    this._client = client;
  }

  /**
   * Ensures the required `Zotero Link` property exists in the space, then
   * returns a fully populated `SpaceConfig` ready for use by `SyncEngine`.
   *
   * @param spaceId - ID of the target Anytype space.
   * @param typeKey - Key of the Anytype object type to assign to synced objects.
   */
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

  /**
   * Looks up the `Zotero Link` property in the space. Returns its key if
   * found, otherwise creates the property and returns the new key.
   */
  // TODO: let's allow user to configure the property in pref pane. With a recommendation for creating a Zotero Link
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
