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

  addon.data.initialized = true;
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  addon.data.ztoolkit = createZToolkit();

  win.MozXULElement.insertFTLIfNeeded(
    `${config.addonRef}-mainWindow.ftl`,
  );

  await _initSyncIfConfigured();

  addon.data.initialized = true;
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
  const apiKey = Zotero.Prefs.get(`${config.prefsPrefix}.apiKey`, true) as string;
  const spaceId = Zotero.Prefs.get(`${config.prefsPrefix}.spaceId`, true) as string;
  const isInitialized = Zotero.Prefs.get(`${config.prefsPrefix}.initialized`, true) as boolean;

  if (!apiKey || !spaceId || !isInitialized) {
    ztoolkit.log("AnyTero: not configured, skipping sync init");
    return;
  }

  const port = (Zotero.Prefs.get(`${config.prefsPrefix}.port`, true) as number) || 31009;
  const syncMode = (Zotero.Prefs.get(`${config.prefsPrefix}.syncMode`, true) as string) || "both";

  const client = new AnytypeClient(port, apiKey);
  const itemReader = new ItemReader();
  const state = new SyncState();
  const engine = new SyncEngine(itemReader, client, state);

  const spaceConfigRaw = Zotero.Prefs.get(`${config.prefsPrefix}.spaceConfig`, true) as string;
  if (spaceConfigRaw) {
    try {
      engine.setSpaceConfig(JSON.parse(spaceConfigRaw));
    } catch {
      ztoolkit.log("AnyTero: failed to parse persisted space config");
      return;
    }
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
  const client = addon.data.client;
  if (!client) return;

  try {
    const spaces = await client.listSpaces();
    const doc = (addon.data.prefsWindow as any)?.document;
    if (!doc) return;

    const popup = doc.getElementById("anytero-pref-space-popup");
    if (!popup) return;

    while (popup.firstChild) popup.removeChild(popup.firstChild);

    const ns = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
    for (const space of spaces) {
      const item = doc.createElementNS(ns, "menuitem");
      item.setAttribute("value", space.id);
      item.setAttribute("label", space.name);
      popup.appendChild(item);
    }
  } catch (e) {
    ztoolkit.log("AnyTero: failed to load spaces for dropdown", e);
  }
}

async function _runSetupWizard(): Promise<void> {
  const apiKey = Zotero.Prefs.get(`${config.prefsPrefix}.apiKey`, true) as string;
  const port = (Zotero.Prefs.get(`${config.prefsPrefix}.port`, true) as number) || 31009;
  const spaceId = Zotero.Prefs.get(`${config.prefsPrefix}.spaceId`, true) as string;

  if (!apiKey || !spaceId) {
    ztoolkit.log("AnyTero: API key or space ID not set, cannot run setup");
    return;
  }

  const client = new AnytypeClient(port, apiKey);
  const boot = new SpaceBoot(client);

  const progressWin = new ztoolkit.ProgressWindow(getString("sync-progress-title"), {
    closeOnClick: false,
    closeTime: -1,
  })
    .createLine({ text: "Setting up AnyType space…", type: "default", progress: 0 })
    .show();

  try {
    const spaceConfig = await boot.run(spaceId);
    Zotero.Prefs.set(`${config.prefsPrefix}.spaceConfig`, JSON.stringify(spaceConfig), true);
    Zotero.Prefs.set(`${config.prefsPrefix}.initialized`, true, true);

    addon.data.notifierListener?.unregister();
    await _initSyncIfConfigured();

    progressWin.changeLine({ progress: 100, text: "Setup complete!" });
    progressWin.startCloseTimer(3000);
  } catch (e) {
    progressWin.changeLine({ progress: 100, text: `Setup failed: ${e}`, type: "fail" });
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

  const progressWin = new ztoolkit.ProgressWindow(getString("sync-progress-title"), {
    closeOnClick: true,
    closeTime: -1,
  })
    .createLine({ text: getString("sync-progress-start"), type: "default", progress: 0 })
    .show();

  try {
    const count = await engine.fullSync(({ current, total }) => {
      const pct = total > 0 ? Math.round((current / total) * 100) : 0;
      progressWin.changeLine({
        progress: pct,
        text: `[${pct}%] Syncing ${current}/${total}…`,
      });
    });

    progressWin.changeLine({ progress: 100, text: `Done — ${count} items synced` });
    progressWin.startCloseTimer(5000);
  } catch (e) {
    progressWin.changeLine({ progress: 100, text: `Sync error: ${e}`, type: "fail" });
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
