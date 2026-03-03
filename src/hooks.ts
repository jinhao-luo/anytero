/**
 * @file hooks.ts
 *
 * Zotero lifecycle hook handlers and preference-pane event handlers for
 * AnyTero. This is the primary orchestration layer: it wires Zotero startup /
 * shutdown events to the sync subsystem, and routes user actions from the
 * preferences pane (setup wizard, manual sync, dropdown population) to the
 * appropriate module.
 *
 * Exported object is consumed by `bootstrap.js` via `addon.hooks.*`.
 */

import { config } from "../package.json";
import { getString, initLocale } from "./utils/locale";
import { ItemReader } from "./modules/zotero/itemReader";
import { NotifierListener } from "./modules/zotero/notifierListener";
import { AnytypeClient } from "./modules/anytype/client";
import { SpaceBoot } from "./modules/anytype/spaceBoot";
import { SyncEngine } from "./modules/sync/syncEngine";
import { SyncState } from "./modules/sync/syncState";
import { createZToolkit } from "./utils/ztoolkit";

/**
 * Called by `bootstrap.js` once Zotero is fully initialised.
 * Waits for Zotero's own async readiness promises, initialises locale, then
 * runs `onMainWindowLoad` for every already-open main window.
 */
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

/**
 * Called each time a Zotero main window opens (including on startup).
 * Registers the AnyTero preferences pane and, if the plugin is already
 * configured, initialises the sync stack.
 */
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

/** Called when a main window is closing. Cleans up the notifier and toolkit registrations. */
async function onMainWindowUnload(_win: Window): Promise<void> {
  addon.data.notifierListener?.unregister();
  ztoolkit.unregisterAll();
}

/**
 * Called when the plugin is disabled or Zotero is shutting down.
 * Unregisters all listeners, marks the addon as dead, and removes the
 * `Zotero.AnyTero` global.
 */
function onShutdown(): void {
  addon.data.notifierListener?.unregister();
  ztoolkit.unregisterAll();
  addon.data.alive = false;
  // @ts-expect-error - Plugin instance is not typed
  delete Zotero[config.addonInstance];
}

/**
 * Global Zotero notifier callback (routed from `bootstrap.js`).
 * AnyTero does not use this hook — annotation events are handled directly
 * inside `NotifierListener` which registers its own observer.
 */
async function onNotify(
  _event: string,
  _type: string,
  _ids: Array<string | number>,
  _extraData: { [key: string]: unknown },
) {
  // Annotation events are handled by NotifierListener directly
}

/**
 * Routes events emitted by the preference pane XUL script.
 *
 * | `type`        | Triggered by                                      |
 * |---------------|---------------------------------------------------|
 * | `"load"`      | Preferences pane opening                          |
 * | `"spaceChange"` | User changing the space dropdown selection      |
 * | `"syncNow"`   | User clicking the "Sync Now" button               |
 * | `"setup"`     | User clicking the "Setup" / "Re-setup" button     |
 */
async function onPrefsEvent(type: string, data: { [key: string]: unknown }) {
  switch (type) {
    case "load":
      addon.data.prefsWindow = data.window as Window;
      await _populateSpaceDropdown();
      await _populateObjectTypeDropdown();
      break;
    case "spaceChange": {
      // Clear the stale object type selection so the user must re-pick one for
      // the newly selected space.
      Zotero.Prefs.set(`${config.prefsPrefix}.objectTypeKey`, "", true);
      const doc = (addon.data.prefsWindow as any)?.document;
      const typeMenulist = doc?.getElementById(
        "anytero-pref-object-type",
      ) as any;
      if (typeMenulist) typeMenulist.value = "";
      await _populateObjectTypeDropdown();
      break;
    }
    case "syncNow":
      await _runFullSync();
      break;
    case "setup":
      await _runSetupWizard();
      break;
  }
}

// ── Internal helpers ────────────────────────────────────────────────────────

/**
 * Reads persisted prefs and, when the plugin is fully configured, constructs
 * and wires up the sync stack: `AnytypeClient` → `SyncEngine` → optionally
 * `NotifierListener` (for realtime mode). Idempotent — safe to call multiple
 * times; a new stack replaces the old one.
 */
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

/**
 * Fetches the user's Anytype spaces and populates the space `<menulist>` in
 * the preferences pane. No-ops if no API key is set or the pane isn't open.
 */
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

/**
 * Fetches the object types available in the currently selected Anytype space
 * and populates the object type `<menulist>`. Called on pane load and whenever
 * the space selection changes.
 */
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
    ztoolkit.log(
      "AnyTero: object type dropdown populated with",
      types.length,
      "types",
    );
  } catch (e) {
    ztoolkit.log("AnyTero: failed to load types for dropdown", e);
  }
}

/**
 * Runs the one-time space setup wizard: ensures the `Zotero Link` property
 * exists in the chosen space, persists the resulting `SpaceConfig`, and
 * reinitialises the sync stack. Shows a progress window throughout.
 */
async function _runSetupWizard(): Promise<void> {
  const win = addon.data.prefsWindow as any;
  const confirmed = win?.confirm(
    'The Setup Wizard will create a "Zotero Link" property in the selected Anytype Space if it does not exist.',
    "Continue?",
  );
  if (!confirmed) return;

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

    // Clear sync state so stale Anytype object IDs from a previous setup
    // (possibly a different space or object type) don't linger. A subsequent
    // full sync will repopulate the state from scratch.
    new SyncState().clear();

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

/**
 * Triggers `SyncEngine.fullSync` and displays a progress window with a live
 * percentage counter. The window stays open after completion so the user can
 * see the final count or any error message.
 */
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
