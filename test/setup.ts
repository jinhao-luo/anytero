// Shims for globals available in the Zotero runtime but not in Node.
// Only used when running tests outside of Zotero (e.g. mocha + tsx).

// @ts-ignore
globalThis.ztoolkit = {
  log: (..._args: unknown[]) => {},
};
