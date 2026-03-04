/**
 * @file itemReader.ts
 *
 * Typed facade over the Zotero JavaScript API for reading library items and
 * their PDF annotations. Converts raw `Zotero.Item` objects into plain
 * TypeScript interfaces (`ZoteroItem`, `ZoteroAnnotation`) so that the rest of
 * the codebase remains independent of Zotero internals.
 *
 * Notable Zotero API quirks handled here:
 * - `getAttachments()` returns `number[]` (IDs), not `Item[]`.
 * - `parentID` is `number | false | null` — truthy check required.
 * - `Zotero.Items.getAll()` is typed as returning IDs; double-cast needed.
 */

/** Author / editor / translator metadata for a Zotero library item. */
export interface ZoteroCreator {
  firstName: string;
  lastName: string;
  creatorType: string;
}

/**
 * A single PDF annotation normalised from `Zotero.Item` fields.
 * `attachmentKey` links back to the parent PDF so a `zotero://open-pdf/…` URL
 * can be constructed.
 */
export interface ZoteroAnnotation {
  id: number;
  /** Zotero item key (e.g. `"ABCD1234"`). */
  key: string;
  /** Key of the parent PDF attachment item. */
  attachmentKey: string;
  annotationType: "highlight" | "note" | "image" | "ink" | "underline";
  /** Highlighted / selected text. Null for image / ink annotations. */
  text: string | null;
  comment: string | null;
  color: string | null;
  /** Human-readable page label (e.g. `"5"`, `"xii"`). */
  pageLabel: string | null;
  /** Serialised position data (JSON string from Zotero internals). */
  position: string | null;
  tags: string[];
  dateModified: string;
}

/** A Zotero library item (journal article, book, etc.) normalised for AnyTero's use. */
// TODO: can we use the Item class from Zotero instead of creating a new class
export interface ZoteroItem {
  id: number;
  /** Zotero item key (e.g. `"ABCD1234"`). Used as the sync state key. */
  key: string;
  title: string;
  itemType: string;
  creators: ZoteroCreator[];
  year: string | null;
  doi: string | null;
  /** Publication title or publisher, whichever is available. */
  publication: string | null;
  tags: string[];
  dateModified: string;
}

/**
 * Reads Zotero library items and their annotations, normalising the raw
 * Zotero API objects into plain TypeScript interfaces.
 */
export class ItemReader {
  /**
   * Fetches a single library item by numeric ID.
   * Returns `null` for unknown IDs.
   */
  getItem(itemId: number): ZoteroItem | null {
    const item = Zotero.Items.get(itemId);
    if (!item) return null;
    return this._toZoteroItem(item);
  }

  /**
   * Returns all annotations for the given item ID, sorted by page number
   * (ascending). Skips non-PDF attachments.
   */
  // TODO maybe sort by reverse creation date
  getAnnotations(itemId: number): ZoteroAnnotation[] {
    const zItem = Zotero.Items.get(itemId);
    if (!zItem) return [];

    const attachmentIds = zItem.isAttachment()
      ? [zItem.id]
      : zItem.getAttachments();
    const annotations: ZoteroAnnotation[] = [];

    for (const attId of attachmentIds) {
      const att = Zotero.Items.get(attId);
      if (!att || !att.isFileAttachment()) continue;
      for (const ann of att.getAnnotations() as Zotero.Item[]) {
        annotations.push(this._toZoteroAnnotation(ann, att.key));
      }
    }

    return annotations.sort((a, b) => {
      const pageA = parseInt(a.pageLabel ?? "0") || 0;
      const pageB = parseInt(b.pageLabel ?? "0") || 0;
      return pageA - pageB;
    });
  }

  /**
   * Returns all items in the user's library that have at least one PDF
   * annotation. Skips attachments, notes, and standalone annotation items.
   * Used by `SyncEngine.fullSync`.
   */
  async getAllItemsWithAnnotations(): Promise<ZoteroItem[]> {
    const results: ZoteroItem[] = [];
    const allItems = await Zotero.Items.getAll(
      Zotero.Libraries.userLibraryID,
      true,
      false,
      false,
    );

    for (const item of allItems) {
      const attachments = item.isFileAttachment()
        ? [item.id]
        : item.getAttachments();
      for (const attId of attachments) {
        const att = Zotero.Items.get(attId);
        if (att.isFileAttachment() && att.numAnnotations() > 0) {
          results.push(this._toZoteroItem(item));

          break;
        }
      }
    }
    return results;
  }

  private _toZoteroItem(item: Zotero.Item): ZoteroItem {
    const creators = (item.getCreators() as any[]).map((c) => ({
      firstName: c.firstName ?? "",
      lastName: c.lastName ?? "",
      creatorType: c.creatorType ?? "author",
    }));

    return {
      id: item.id,
      key: item.key,
      title: item.getField("title") as string,
      itemType: item.itemType,
      creators,
      year: (item.getField("year") as string) || null,
      doi: (item.getField("DOI") as string) || null,
      publication:
        ((item.getField("publicationTitle") ||
          item.getField("publisher")) as string) || null,
      tags: item.getTags().map((t: any) => t.tag),
      dateModified: item.dateModified,
    };
  }

  private _toZoteroAnnotation(
    ann: Zotero.Item,
    attachmentKey: string,
  ): ZoteroAnnotation {
    return {
      id: ann.id,
      key: ann.key,
      attachmentKey,
      annotationType: ann.annotationType as ZoteroAnnotation["annotationType"],
      text: ann.annotationText ?? null,
      comment: ann.annotationComment ?? null,
      color: ann.annotationColor ?? null,
      pageLabel: ann.annotationPageLabel ?? null,
      position: ann.annotationPosition ?? null,
      tags: ann.getTags().map((t: any) => t.tag),
      dateModified: ann.dateModified,
    };
  }
}
