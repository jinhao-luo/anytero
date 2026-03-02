export interface ZoteroCreator {
  firstName: string;
  lastName: string;
  creatorType: string;
}

export interface ZoteroAnnotation {
  id: number;
  key: string;
  attachmentKey: string;
  annotationType: "highlight" | "note" | "image" | "ink" | "underline";
  text: string | null;
  comment: string | null;
  color: string | null;
  pageLabel: string | null;
  position: string | null;
  tags: string[];
  dateModified: string;
}

export interface ZoteroItem {
  id: number;
  key: string;
  title: string;
  itemType: string;
  creators: ZoteroCreator[];
  year: string | null;
  doi: string | null;
  publication: string | null;
  tags: string[];
  dateModified: string;
}

export class ItemReader {
  getItem(itemId: number): ZoteroItem | null {
    const item = Zotero.Items.get(itemId);
    if (!item || item.isAnnotation() || item.isAttachment()) return null;
    return this._toZoteroItem(item);
  }

  getAnnotations(item: ZoteroItem): ZoteroAnnotation[] {
    const zItem = Zotero.Items.get(item.id);
    if (!zItem) return [];

    const attachmentIds = zItem.getAttachments() as number[];
    const annotations: ZoteroAnnotation[] = [];

    for (const attId of attachmentIds) {
      const att = Zotero.Items.get(attId);
      if (!att || !att.isPDFAttachment()) continue;
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

  async getAllItemsWithAnnotations(): Promise<ZoteroItem[]> {
    const results: ZoteroItem[] = [];
    const allItems = (await Zotero.Items.getAll(
      Zotero.Libraries.userLibraryID,
      false,
      false,
      true,
    )) as unknown as Zotero.Item[];

    for (const item of allItems) {
      if (
        (item as any).isAnnotation?.() ||
        item.isAttachment() ||
        item.isNote()
      ) {
        continue;
      }
      const zoteroItem = this._toZoteroItem(item);
      const annotations = this.getAnnotations(zoteroItem);
      if (annotations.length > 0) {
        results.push(zoteroItem);
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

  private _toZoteroAnnotation(ann: Zotero.Item, attachmentKey: string): ZoteroAnnotation {
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
