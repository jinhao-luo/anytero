/**
 * @file addon.ts
 *
 * Defines the `Addon` singleton that acts as the runtime state container for
 * the AnyTero plugin. An instance is created in `index.ts` and attached to
 * `Zotero.AnyTero`. All other modules reference long-lived objects (client,
 * engine, listener) through `addon.data`.
 */

import { config } from "../package.json";
import hooks from "./hooks";
import { createZToolkit } from "./utils/ztoolkit";
import type { AnytypeClient } from "./modules/anytype/client";
import type { SyncEngine } from "./modules/sync/syncEngine";
import type { NotifierListener } from "./modules/zotero/notifierListener";

/**
 * Root plugin class. Holds the mutable runtime state that is shared across
 * all modules for the lifetime of the plugin.
 *
 * Only one instance exists per Zotero session (guarded by the idempotency
 * check in `index.ts`).
 */
class Addon {
  /**
   * Mutable runtime state. Fields that are optional are initialised lazily
   * after the user completes the setup wizard.
   */
  public data: {
    /** `false` after `onShutdown` — guards against in-flight callbacks. */
    alive: boolean;
    /** Static plugin metadata from `package.json`. */
    config: typeof config;
    /** `"development"` or `"production"`, injected at build time. */
    env: "development" | "production";
    /** Zotero Plugin Toolkit instance, re-created on each window load. */
    ztoolkit: ZToolkit;
    /** Fluent locale instance, set by `initLocale()`. */
    locale?: { current: any };
    // AnyTero-specific runtime state
    /** HTTP client for the Anytype local REST API. */
    client?: AnytypeClient;
    /** Orchestrates create / update / delete / full-sync operations. */
    syncEngine?: SyncEngine;
    /** Listens for Zotero item events and triggers realtime syncs. */
    notifierListener?: NotifierListener;
    /** Reference to the currently open preferences window, if any. */
    prefsWindow?: Window;
  };
  /** Lifecycle hook handlers exported from `hooks.ts`. */
  public hooks: typeof hooks;
  /** Public API surface exposed on `Zotero.AnyTero.api`. Currently empty. */
  public api: object;

  constructor() {
    this.data = {
      alive: true,
      config,
      env: __env__,
      ztoolkit: createZToolkit(),
    };
    this.hooks = hooks;
    this.api = {};
  }
}

export default Addon;
