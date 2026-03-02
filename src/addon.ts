import { config } from "../package.json";
import hooks from "./hooks";
import { createZToolkit } from "./utils/ztoolkit";
import type { AnytypeClient } from "./modules/anytype/client";
import type { SyncEngine } from "./modules/sync/syncEngine";
import type { NotifierListener } from "./modules/zotero/notifierListener";

class Addon {
  public data: {
    alive: boolean;
    config: typeof config;
    env: "development" | "production";
    ztoolkit: ZToolkit;
    locale?: { current: any };
    // AnyTero-specific runtime state
    client?: AnytypeClient;
    syncEngine?: SyncEngine;
    notifierListener?: NotifierListener;
    prefsWindow?: Window;
  };
  public hooks: typeof hooks;
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
