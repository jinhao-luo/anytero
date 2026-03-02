import { config } from "../../../package.json";

const PREF_KEY = "syncState";

interface StateMap {
  [zoteroKey: string]: string; // zoteroKey → anytypeObjectId
}

export class SyncState {
  private _prefKey: string;

  constructor() {
    this._prefKey = `${config.prefsPrefix}.${PREF_KEY}`;
  }

  getObjectId(zoteroKey: string): string | null {
    const map = this._load();
    return map[zoteroKey] ?? null;
  }

  set(zoteroKey: string, objectId: string): void {
    const map = this._load();
    map[zoteroKey] = objectId;
    this._save(map);
  }

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
