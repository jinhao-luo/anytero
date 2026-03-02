/**
 * @file index.ts
 *
 * Plugin bootstrap entry point. This file is loaded by Zotero's `bootstrap.js`
 * when the plugin is enabled or Zotero starts.
 *
 * Responsibilities:
 * - Creates the `Addon` singleton (idempotent — safe to call multiple times).
 * - Registers the instance as `Zotero.AnyTero`.
 * - Exposes `ztoolkit` as a lazy global property.
 */

import { BasicTool } from "zotero-plugin-toolkit";
import Addon from "./addon";
import { config } from "../package.json";

const basicTool = new BasicTool();

// @ts-expect-error - Plugin instance is not typed
if (!basicTool.getGlobal("Zotero")[config.addonInstance]) {
  _globalThis.addon = new Addon();
  defineGlobal("ztoolkit", () => {
    return _globalThis.addon.data.ztoolkit;
  });
  // @ts-expect-error - Plugin instance is not typed
  Zotero[config.addonInstance] = addon;
}

function defineGlobal(name: Parameters<BasicTool["getGlobal"]>[0]): void;
function defineGlobal(name: string, getter: () => any): void;
/**
 * Registers a named property on the plugin's global scope.
 *
 * When called with a `getter`, the property is defined lazily via
 * `Object.defineProperty`. When called without one, the value is proxied
 * from `BasicTool.getGlobal` (e.g. for Zotero built-ins like `window`).
 */
function defineGlobal(name: string, getter?: () => any) {
  Object.defineProperty(_globalThis, name, {
    get() {
      return getter ? getter() : basicTool.getGlobal(name);
    },
  });
}
