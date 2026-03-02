/**
 * @file notifierListener.ts
 *
 * Registers a `Zotero.Notifier` observer that listens for item events and
 * triggers incremental annotation syncs in realtime. Each listener instance
 * manages its own debounce timers so that rapid consecutive changes (e.g.
 * highlighting several passages in quick succession) are coalesced into a
 * single sync call.
 *
 * Item hierarchy traversal:
 *   annotation item → attachment item → library item
 *
 * The sync callback receives the top-level library item ID because that is
 * the unit of sync in `SyncEngine`.
 */

/** Called with the top-level library item ID when an annotation changes. */
type SyncItemCallback = (itemId: number) => void;
/** Called with the Zotero item key when an item is deleted. */
type DeleteItemCallback = (itemKey: string) => void;

/**
 * Zotero Notifier observer for realtime annotation sync.
 *
 * Call `register()` to start listening and `unregister()` to clean up (both
 * the notifier observer and any pending debounce timers).
 */
export class NotifierListener {
  private _notifierID: string | null = null;
  private _debounceTimers: Map<number, ReturnType<typeof setTimeout>> =
    new Map();
  private _debounceMs = 2000;
  private _onSyncItem: SyncItemCallback;
  private _onDeleteItem: DeleteItemCallback;

  constructor(
    onSyncItem: SyncItemCallback,
    onDeleteItem: DeleteItemCallback,
  ) {
    this._onSyncItem = onSyncItem;
    this._onDeleteItem = onDeleteItem;
  }

  /** Registers the Zotero Notifier observer. Safe to call only once per instance. */
  register(): void {
    const observer = {
      notify: (
        event: string,
        type: string,
        ids: (string | number)[],
        _extraData: Record<string, unknown>,
      ) => {
        if (type !== "item") return;
        this._handleItemEvent(event, ids as number[]);
      },
    };

    this._notifierID = Zotero.Notifier.registerObserver(observer, ["item"]);
    ztoolkit.log("NotifierListener registered, id:", this._notifierID);
  }

  /** Unregisters the observer and cancels all pending debounce timers. */
  unregister(): void {
    if (this._notifierID) {
      Zotero.Notifier.unregisterObserver(this._notifierID);
      this._notifierID = null;
    }
    for (const timer of this._debounceTimers.values()) {
      clearTimeout(timer);
    }
    this._debounceTimers.clear();
  }

  private _handleItemEvent(event: string, ids: number[]): void {
    for (const id of ids) {
      if (event === "delete") {
        // On delete we only have the key via extraData in some versions;
        // attempt a best-effort lookup before item is gone.
        const item = Zotero.Items.get(id);
        const key = item?.key ?? String(id);
        this._onDeleteItem(key);
        return;
      }

      const item = Zotero.Items.get(id);
      if (!item) continue;

      if (item.isAnnotation()) {
        // Sync the parent item (the library item, not just the attachment)
        const parentId = this._resolveLibraryItemId(item);
        if (parentId !== null) this._enqueueSync(parentId);
      } else if (!item.isAttachment() && !item.isNote()) {
        // Direct item modification (e.g. title/authors changed)
        this._enqueueSync(id);
      }
    }
  }

  /**
   * Walks up the item hierarchy from an annotation to its top-level library
   * item: annotation → attachment → library item.
   * Returns `null` if the hierarchy is broken (e.g. orphaned annotation).
   */
  private _resolveLibraryItemId(annotationItem: Zotero.Item): number | null {
    // Annotations are children of attachments, which are children of library items
    const attachmentId = annotationItem.parentID;
    if (!attachmentId) return null;
    const attachment = Zotero.Items.get(attachmentId as number);
    if (!attachment) return null;
    const parentId = attachment.parentID;
    return parentId ? (parentId as number) : null;
  }

  /**
   * Debounces a sync call for the given item. Resets the timer if one is
   * already pending, so only the last event in a burst triggers the sync.
   */
  private _enqueueSync(itemId: number): void {
    const existing = this._debounceTimers.get(itemId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this._debounceTimers.delete(itemId);
      this._onSyncItem(itemId);
    }, this._debounceMs);

    this._debounceTimers.set(itemId, timer);
  }
}
