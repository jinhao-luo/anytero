/** @file Collection filtering ported from the supplied v0.1.9 XPI. */
import { config } from "../../../package.json";
export const AnyTeroCollectionFilter = {
  pref: `${config.prefsPrefix}.collectionId`,
  selectedId(): number | null {
    const raw = Zotero.Prefs.get(this.pref, true);
    const id = Number(raw);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  },
  collectionIds(): Set<number> | null {
    const root = this.selectedId();
    if (!root) return null;
    const collection = Zotero.Collections.get(root);
    if (!collection || collection.libraryID !== Zotero.Libraries.userLibraryID)
      return null;
    const ids = new Set<number>();
    const visit = (id: number) => {
      if (ids.has(id)) return;
      ids.add(id);
      const children = Zotero.Collections.getByParent(id) || [];
      for (const child of children) visit(child.id);
    };
    visit(root);
    return ids;
  },
  allows(item: Zotero.Item | null | undefined, allowedIds: Set<number> | null) {
    if (
      !item ||
      !allowedIds ||
      item.libraryID !== Zotero.Libraries.userLibraryID
    )
      return false;
    if (item.isAttachment() || item.isAnnotation() || item.isNote())
      return false;
    return (item.getCollections() || []).some((id) =>
      allowedIds.has(Number(id)),
    );
  },
};
