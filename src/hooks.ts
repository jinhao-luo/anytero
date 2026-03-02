import { config } from "../package.json";
import { getString, initLocale } from "./utils/locale";
import { ItemReader } from "./modules/zotero/itemReader";
import { NotifierListener } from "./modules/zotero/notifierListener";
import { AnytypeClient } from "./modules/anytype/client";
import { SpaceBoot } from "./modules/anytype/spaceBoot";
import { SyncEngine } from "./modules/sync/syncEngine";
import { SyncState } from "./modules/sync/syncState";
import { createZToolkit } from "./utils/ztoolkit";

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  initLocale();

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  addon.data.ztoolkit = createZToolkit();

  win.MozXULElement.insertFTLIfNeeded(`${config.addonRef}-mainWindow.ftl`);

  await Zotero.PreferencePanes.register({
    pluginID: config.addonID,
    src: rootURI + "content/preferences.xhtml",
    label: "AnyTero",
    image: `chrome://${config.addonRef}/content/icons/favicon@0.5x.png`,
    defaultXUL: true,
  });

  await _initSyncIfConfigured();
}

async function onMainWindowUnload(_win: Window): Promise<void> {
  addon.data.notifierListener?.unregister();
  ztoolkit.unregisterAll();
}

function onShutdown(): void {
  addon.data.notifierListener?.unregister();
  ztoolkit.unregisterAll();
  addon.data.alive = false;
  // @ts-expect-error - Plugin instance is not typed
  delete Zotero[config.addonInstance];
}

async function onNotify(
  _event: string,
  _type: string,
  _ids: Array<string | number>,
  _extraData: { [key: string]: unknown },
) {
  // Annotation events are handled by NotifierListener directly
}

async function onPrefsEvent(type: string, data: { [key: string]: unknown }) {
  switch (type) {
    case "load":
      addon.data.prefsWindow = data.window as Window;
      await _populateSpaceDropdown();
      await _populateObjectTypeDropdown();
      break;
    case "spaceChange":
      await _populateObjectTypeDropdown();
      break;
    case "syncNow":
      await _runFullSync();
      break;
    case "setup":
      await _runSetupWizard();
      break;
  }
}

// ── Internal helpers ────────────────────────────────────────────────────────

async function _initSyncIfConfigured(): Promise<void> {
  const apiKey = Zotero.Prefs.get(
    `${config.prefsPrefix}.apiKey`,
    true,
  ) as string;
  const spaceId = Zotero.Prefs.get(
    `${config.prefsPrefix}.spaceId`,
    true,
  ) as string;
  const spaceConfigRaw = Zotero.Prefs.get(
    `${config.prefsPrefix}.spaceConfig`,
    true,
  ) as string;

  if (!apiKey || !spaceId || !spaceConfigRaw) {
    ztoolkit.log("AnyTero: not configured, skipping sync init");
    return;
  }

  const port =
    (Zotero.Prefs.get(`${config.prefsPrefix}.port`, true) as number) || 31009;
  const syncMode =
    (Zotero.Prefs.get(`${config.prefsPrefix}.syncMode`, true) as string) ||
    "both";

  const client = new AnytypeClient(port, apiKey);
  const itemReader = new ItemReader();
  const state = new SyncState();
  const engine = new SyncEngine(itemReader, client, state);

  try {
    engine.setSpaceConfig(JSON.parse(spaceConfigRaw));
  } catch {
    ztoolkit.log("AnyTero: failed to parse persisted space config");
    return;
  }

  addon.data.client = client;
  addon.data.syncEngine = engine;

  if (syncMode === "realtime" || syncMode === "both") {
    const listener = new NotifierListener(
      (itemId) => engine.syncItem(itemId),
      (itemKey) => engine.deleteItem(itemKey),
    );
    listener.register();
    addon.data.notifierListener = listener;
  }

  ztoolkit.log("AnyTero: sync system initialized, mode:", syncMode);
}

async function _populateSpaceDropdown(): Promise<void> {
  ztoolkit.log(
    "AnyTero: _populateSpaceDropdown called, client:",
    addon.data.client ? "present" : "null",
  );
  const apiKey = Zotero.Prefs.get(
    `${config.prefsPrefix}.apiKey`,
    true,
  ) as string;
  if (!apiKey) {
    ztoolkit.log("AnyTero: no apiKey set, skipping dropdown population");
    return;
  }
  const port =
    (Zotero.Prefs.get(`${config.prefsPrefix}.port`, true) as number) || 31009;
  const client = addon.data.client ?? new AnytypeClient(port, apiKey);

  try {
    ztoolkit.log("AnyTero: fetching spaces from API…");
    const spaces = await client.listSpaces();
    ztoolkit.log(
      "AnyTero: listSpaces returned",
      spaces.length,
      "spaces:",
      JSON.stringify(spaces),
    );

    const doc = (addon.data.prefsWindow as any)?.document;
    ztoolkit.log("AnyTero: prefsWindow doc:", doc ? "present" : "null");
    if (!doc) return;

    const popup = doc.getElementById("anytero-pref-space-popup");
    ztoolkit.log(
      "AnyTero: anytero-pref-space-popup element:",
      popup ? "found" : "not found",
    );
    if (!popup) return;

    while (popup.firstChild) popup.removeChild(popup.firstChild);

    const ns = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
    for (const space of spaces) {
      const item = doc.createElementNS(ns, "menuitem");
      item.setAttribute("value", space.id);
      item.setAttribute("label", space.name);
      popup.appendChild(item);
    }
    ztoolkit.log("AnyTero: dropdown populated with", spaces.length, "items");
  } catch (e) {
    ztoolkit.log("AnyTero: failed to load spaces for dropdown", e);
  }
}

async function _populateObjectTypeDropdown(): Promise<void> {
  const doc = (addon.data.prefsWindow as any)?.document;
  if (!doc) return;

  const spaceMenulist = doc.getElementById("anytero-pref-space") as any;
  const spaceId =
    (spaceMenulist?.value as string) ||
    (Zotero.Prefs.get(`${config.prefsPrefix}.spaceId`, true) as string);
  if (!spaceId) return;

  const apiKey = Zotero.Prefs.get(
    `${config.prefsPrefix}.apiKey`,
    true,
  ) as string;
  if (!apiKey) return;

  const port =
    (Zotero.Prefs.get(`${config.prefsPrefix}.port`, true) as number) || 31009;
  const client = addon.data.client ?? new AnytypeClient(port, apiKey);

  try {
    const types = await client.listTypes(spaceId);

    const popup = doc.getElementById("anytero-pref-object-type-popup");
    if (!popup) return;

    while (popup.firstChild) popup.removeChild(popup.firstChild);

    const ns = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
    for (const type of types) {
      const item = doc.createElementNS(ns, "menuitem");
      item.setAttribute("value", type.id);
      item.setAttribute("label", type.name);
      popup.appendChild(item);
    }
    ztoolkit.log("AnyTero: object type dropdown populated with", types.length, "types");
  } catch (e) {
    ztoolkit.log("AnyTero: failed to load types for dropdown", e);
  }
}

async function _runSetupWizard(): Promise<void> {
  const apiKey = Zotero.Prefs.get(
    `${config.prefsPrefix}.apiKey`,
    true,
  ) as string;
  const port =
    (Zotero.Prefs.get(`${config.prefsPrefix}.port`, true) as number) || 31009;
  const spaceId = Zotero.Prefs.get(
    `${config.prefsPrefix}.spaceId`,
    true,
  ) as string;
  const objectTypeKey = Zotero.Prefs.get(
    `${config.prefsPrefix}.objectTypeKey`,
    true,
  ) as string;

  if (!apiKey || !spaceId || !objectTypeKey) {
    ztoolkit.log(
      "AnyTero: API key, space ID, or object type not set, cannot run setup",
    );
    return;
  }

  const client = new AnytypeClient(port, apiKey);
  const boot = new SpaceBoot(client);

  const progressWin = new ztoolkit.ProgressWindow(
    getString("sync-progress-title"),
    {
      closeOnClick: false,
      closeTime: -1,
    },
  )
    .createLine({
      text: "Setting up Anytype space…",
      type: "default",
      progress: 0,
    })
    .show();

  try {
    const spaceConfig = await boot.run(spaceId, objectTypeKey);
    Zotero.Prefs.set(
      `${config.prefsPrefix}.spaceConfig`,
      JSON.stringify(spaceConfig),
      true,
    );

    addon.data.notifierListener?.unregister();
    await _initSyncIfConfigured();

    progressWin.changeLine({ progress: 100, text: "Setup complete!" });
    progressWin.startCloseTimer(3000);
  } catch (e) {
    progressWin.changeLine({
      progress: 100,
      text: `Setup failed: ${e}`,
      type: "fail",
    });
    progressWin.startCloseTimer(5000);
    ztoolkit.log("AnyTero: setup wizard failed", e);
  }
}

async function _runFullSync(): Promise<void> {
  const engine = addon.data.syncEngine;
  if (!engine) {
    ztoolkit.log("AnyTero: sync engine not ready, configure the plugin first");
    return;
  }

  const progressWin = new ztoolkit.ProgressWindow(
    getString("sync-progress-title"),
    {
      closeOnClick: true,
      closeTime: -1,
    },
  )
    .createLine({
      text: getString("sync-progress-start"),
      type: "default",
      progress: 0,
    })
    .show();

  try {
    const count = await engine.fullSync(({ current, total }) => {
      const pct = total > 0 ? Math.round((current / total) * 100) : 0;
      progressWin.changeLine({
        progress: pct,
        text: `[${pct}%] Syncing ${current}/${total}…`,
      });
    });

    progressWin.changeLine({
      progress: 100,
      text: `Done — ${count} items synced`,
    });
    progressWin.startCloseTimer(5000);
  } catch (e) {
    progressWin.changeLine({
      progress: 100,
      text: `Sync error: ${e}`,
      type: "fail",
    });
    progressWin.startCloseTimer(8000);
    ztoolkit.log("AnyTero: full sync failed", e);
  }
}

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onNotify,
  onPrefsEvent,
};
