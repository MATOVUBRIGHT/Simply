/**
 * Recycle Bin — IndexedDB-backed, unlimited capacity.
 *
 * Primary: IndexedDB (schofy_recycle v1) — no size limit beyond available disk.
 * Fallback: localStorage — used only if IndexedDB is unavailable.
 *
 * All public functions keep the same synchronous-looking API via an in-memory
 * cache that is hydrated from IDB on first access. Writes go to both IDB
 * (async, durable) and the in-memory cache (instant, for same-session reads).
 */

export interface DeletedItem {
  id: string;
  type: 'student' | 'staff' | 'announcement' | 'class' | 'subject' | 'fee' | 'exam' | 'transport';
  name: string;
  data: any;
  deletedAt: string;
  userId: string;
}

// ── IndexedDB setup ───────────────────────────────────────────────────────────

const IDB_NAME = 'schofy_recycle';
const IDB_VERSION = 1;
const IDB_STORE = 'items';

let _db: IDBDatabase | null = null;
let _dbReady: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  if (_dbReady) return _dbReady;

  _dbReady = new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          const store = db.createObjectStore(IDB_STORE, { keyPath: 'id' });
          store.createIndex('by_user', 'userId', { unique: false });
          store.createIndex('by_type', 'type', { unique: false });
          store.createIndex('by_deleted', 'deletedAt', { unique: false });
        }
      };
      req.onsuccess = () => { _db = req.result; resolve(_db); };
      req.onerror = () => reject(req.error);
    } catch (e) { reject(e); }
  });

  return _dbReady;
}

// ── In-memory cache (per userId) ─────────────────────────────────────────────
// Hydrated from IDB on first getRecycleBin call. Keeps reads synchronous.

const _memCache = new Map<string, DeletedItem[]>();
const _hydrated = new Set<string>();
const _hydratePromises = new Map<string, Promise<void>>();

async function hydrateUser(userId: string): Promise<void> {
  if (_hydrated.has(userId)) return;
  if (_hydratePromises.has(userId)) return _hydratePromises.get(userId);

  const p = (async () => {
    try {
      const db = await getDB();
      const items = await new Promise<DeletedItem[]>((resolve) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const idx = tx.objectStore(IDB_STORE).index('by_user');
        const req = idx.getAll(userId);
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });

      // Merge with any items still in localStorage (migration)
      const lsItems = _loadLS(userId);
      if (lsItems.length > 0) {
        // Migrate LS → IDB
        void _writeAllToIDB(lsItems);
        localStorage.removeItem(_lsKey(userId));
      }

      const merged = new Map<string, DeletedItem>();
      for (const item of [...items, ...lsItems]) merged.set(item.id, item);
      _memCache.set(userId, Array.from(merged.values()));
    } catch {
      // IDB unavailable — fall back to localStorage only
      _memCache.set(userId, _loadLS(userId));
    }
    _hydrated.add(userId);
    _hydratePromises.delete(userId);
  })();

  _hydratePromises.set(userId, p);
  return p;
}

async function _writeAllToIDB(items: DeletedItem[]): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    for (const item of items) store.put(item);
  } catch { /* best-effort */ }
}

async function _writeToIDB(item: DeletedItem): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(item);
  } catch { /* best-effort */ }
}

async function _deleteFromIDB(itemId: string): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(itemId);
  } catch { /* best-effort */ }
}

async function _clearUserFromIDB(userId: string): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    const idx = store.index('by_user');
    const req = idx.getAllKeys(userId);
    req.onsuccess = () => {
      const keys = req.result || [];
      for (const key of keys) store.delete(key);
    };
  } catch { /* best-effort */ }
}

// ── localStorage helpers (fallback / migration) ───────────────────────────────

function _lsKey(userId: string): string {
  return `schofy_recycle_bin_${userId}`;
}

function _loadLS(userId: string): DeletedItem[] {
  try {
    const raw = localStorage.getItem(_lsKey(userId));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function _saveLS(userId: string, items: DeletedItem[]): void {
  try {
    localStorage.setItem(_lsKey(userId), JSON.stringify(items));
  } catch { /* quota exceeded — IDB is the real store */ }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get all recycle bin items for a user.
 * Returns from in-memory cache (instant). Triggers IDB hydration if needed.
 */
export function getRecycleBin(userId: string): DeletedItem[] {
  if (!_hydrated.has(userId)) {
    // Kick off hydration in background; return LS data for this call
    void hydrateUser(userId);
    return _loadLS(userId);
  }
  return _memCache.get(userId) || [];
}

/**
 * Replace the entire recycle bin for a user.
 */
export function setRecycleBin(userId: string, items: DeletedItem[]): void {
  _memCache.set(userId, items);
  _hydrated.add(userId);
  // Async IDB write
  void _clearUserFromIDB(userId).then(() => _writeAllToIDB(items));
  // LS fallback (best-effort)
  _saveLS(userId, items);
  window.dispatchEvent(new Event('recycleBinUpdated'));
}

/**
 * Add a single item to the recycle bin.
 */
export function addToRecycleBin(userId: string, item: Omit<DeletedItem, 'userId'>): void {
  const full: DeletedItem = { ...item, userId };

  // Ensure hydrated before writing
  if (!_hydrated.has(userId)) {
    hydrateUser(userId).then(() => addToRecycleBin(userId, item));
    return;
  }

  const items = _memCache.get(userId) || [];

  // Deduplicate by original data ID + type
  const originalId = item.data?.id;
  if (originalId && items.some(e => e.data?.id === originalId && e.type === item.type)) return;

  const updated = [...items, full];
  _memCache.set(userId, updated);

  // Async IDB write (primary)
  void _writeToIDB(full);
  // LS fallback (best-effort)
  _saveLS(userId, updated);

  window.dispatchEvent(new Event('recycleBinUpdated'));
}

/**
 * Add multiple items to the recycle bin in one operation.
 */
export function addBatchToRecycleBin(userId: string, newItems: Omit<DeletedItem, 'userId'>[]): void {
  if (!newItems.length) return;

  if (!_hydrated.has(userId)) {
    hydrateUser(userId).then(() => addBatchToRecycleBin(userId, newItems));
    return;
  }

  const items = _memCache.get(userId) || [];
  const toAdd: DeletedItem[] = [];

  for (const item of newItems) {
    const full: DeletedItem = { ...item, userId };
    const originalId = item.data?.id;
    if (originalId && items.some(e => e.data?.id === originalId && e.type === item.type)) continue;
    toAdd.push(full);
  }

  if (!toAdd.length) return;

  const updated = [...items, ...toAdd];
  _memCache.set(userId, updated);

  // Async IDB write (primary)
  void _writeAllToIDB(toAdd);
  // LS fallback (best-effort)
  _saveLS(userId, updated);

  window.dispatchEvent(new Event('recycleBinUpdated'));
}

/**
 * Remove a single item from the recycle bin by its recycle bin entry ID.
 */
export function removeFromRecycleBin(userId: string, itemId: string): void {
  const items = _memCache.get(userId) || _loadLS(userId);
  const updated = items.filter(i => i.id !== itemId);
  _memCache.set(userId, updated);

  void _deleteFromIDB(itemId);
  _saveLS(userId, updated);

  window.dispatchEvent(new Event('recycleBinUpdated'));
}

/**
 * Empty the entire recycle bin for a user.
 */
export function clearRecycleBin(userId: string): void {
  _memCache.set(userId, []);
  void _clearUserFromIDB(userId);
  localStorage.removeItem(_lsKey(userId));
  window.dispatchEvent(new Event('recycleBinUpdated'));
}

/**
 * Pre-hydrate the recycle bin for a user (call on login for instant reads).
 */
export async function hydrateRecycleBin(userId: string): Promise<void> {
  return hydrateUser(userId);
}
