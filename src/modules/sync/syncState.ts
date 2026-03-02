/**
 * @file syncState.ts
 *
 * Persists the bidirectional mapping between Zotero item keys and Anytype
 * object IDs. The map is stored as a JSON string in `Zotero.Prefs` under
 * `extensions.zotero.anytero.syncState`.
 *
 * This is the single source of truth for knowing whether a Zotero item
 * already has a corresponding Anytype object, enabling incremental updates
 * instead of re-creating objects on every sync.
 */

import { config } from "../../../package.json";

const PREF_KEY = "syncState";

interface StateMap {
  [zoteroKey: string]: string; // zoteroKey → anytypeObjectId
}

/**
 * Persistent key-value store that maps Zotero item keys to Anytype object IDs.
 * Reads and writes atomically to `Zotero.Prefs` on every operation (no
 * in-memory cache) to stay consistent across concurrent updates.
 */
export class SyncState {
  private _prefKey: string;

  constructor() {
    this._prefKey = `${config.prefsPrefix}.${PREF_KEY}`;
  }

  /** Returns the Anytype object ID for a Zotero key, or `null` if unmapped. */
  getObjectId(zoteroKey: string): string | null {
    const map = this._load();
    return map[zoteroKey] ?? null;
  }

  /** Records or updates the mapping from a Zotero key to an Anytype object ID. */
  set(zoteroKey: string, objectId: string): void {
    const map = this._load();
    map[zoteroKey] = objectId;
    this._save(map);
  }

  /** Removes the mapping for a Zotero key (called on item deletion or state pruning). */
  remove(zoteroKey: string): void {
    const map = this._load();
    delete map[zoteroKey];
    this._save(map);
  }

  getAll(): StateMap {
    return this._load();
  }

  clear(): void {
    this._save({});
  }

  private _load(): StateMap {
    try {
      const raw = Zotero.Prefs.get(this._prefKey, true) as string | undefined;
      if (!raw) return {};
      return JSON.parse(raw) as StateMap;
    } catch {
      return {};
    }
  }

  private _save(map: StateMap): void {
    Zotero.Prefs.set(this._prefKey, JSON.stringify(map), true);
  }
}
