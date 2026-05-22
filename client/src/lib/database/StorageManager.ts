/**
 * StorageManager — Persistent, quota-safe storage for offline queue and deleted IDs.
 *
 * Strategy:
 * - Primary: IndexedDB (schofy_cache v2) — no size limit beyond available disk
 * - Fallback: localStorage — used only if IndexedDB is unavailable
 * - Persistent storage: requests navigator.storage.persist() so browser never evicts data
 * - Quota monitoring: warns when storage is > 80% full
 * - Electron backup: writes a JSON backup to userData path via IPC (native file system)
 *
 * This module is a drop-in replacement for the localStorage-based queue/deleted-ids
 * helpers in SupabaseDataService. All existing callers keep the same sync API.
 */

// ── IndexedDB setup ───────────────────────────────────────────────────────────

const IDB_DB_NAME = 'schofy_cache';
const IDB_VERSION = 3; // bumped to 3 to ensure all stores are created
const CACHE_STORE = 'data';
const QUEUE_STORE = 'offline_queue';
const DELETED_STORE = 'deleted_ids';

let _db: IDBDatabase | null = null;
let _dbReady: Promise<IDBDatabase> | null = null;

export function getStorageDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  if (_dbReady) return _dbReady;

  _dbReady = new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(IDB_DB_NAME, IDB_VERSION);

      req.onupgradeneeded = (event) => {
        const db = req.result;

        // v1 store (cache data)
        if (!db.objectStoreNames.contains(CACHE_STORE)) {
          db.createObjectStore(CACHE_STORE);
        }

        // v2 stores — offline queue and deleted IDs
        if (!db.objectStoreNames.contains(QUEUE_STORE)) {
          const qs = db.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
          qs.createIndex('by_table', 'tableName', { unique: false });
          qs.createIndex('by_ts', 'ts', { unique: false });
        }
        
        if (!db.objectStoreNames.contains(DELETED_STORE)) {
          // key = "${sid}:${tableName}", value = string[] of deleted IDs
          db.createObjectStore(DELETED_STORE);
        }
      };

      req.onsuccess = () => {
        _db = req.result;

        // Handle unexpected version changes (e.g. another tab upgraded)
        _db.onversionchange = () => {
          _db?.close();
          _db = null;
          _dbReady = null;
        };

        resolve(_db);
      };

      req.onerror = () => reject(req.error);
      req.onblocked = () => {
        // Another tab has the DB open at an older version — wait
        console.warn('[StorageManager] IDB upgrade blocked by another tab');
      };
    } catch (e) {
      reject(e);
    }
  });

  return _dbReady;
}

// ── Persistent storage request ────────────────────────────────────────────────

let _persistRequested = false;

export async function requestPersistentStorage(): Promise<boolean> {
  if (_persistRequested) return true;
  _persistRequested = true;

  try {
    if (navigator.storage?.persist) {
      const granted = await navigator.storage.persist();
      if (granted) {
        console.log('[StorageManager] Persistent storage granted');
      }
      // Not granted is normal on non-installed PWAs — no warning needed
      return granted;
    }
  } catch {
    // Silently ignore — persistent storage is a best-effort enhancement
  }
  return false;
}

// ── Quota monitoring ──────────────────────────────────────────────────────────

export interface StorageQuota {
  usedMB: number;
  quotaMB: number;
  percentUsed: number;
  isPersisted: boolean;
}

export async function getStorageQuota(): Promise<StorageQuota | null> {
  try {
    if (!navigator.storage?.estimate) return null;
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    const isPersisted = navigator.storage.persisted ? await navigator.storage.persisted() : false;
    return {
      usedMB: Math.round(usage / 1024 / 1024 * 10) / 10,
      quotaMB: Math.round(quota / 1024 / 1024 * 10) / 10,
      percentUsed: quota > 0 ? Math.round((usage / quota) * 100) : 0,
      isPersisted,
    };
  } catch {
    return null;
  }
}

/** Check quota and fire a custom event if > 80% full */
export async function checkStorageQuota(): Promise<void> {
  const q = await getStorageQuota();
  if (!q) return;
  if (q.percentUsed > 80) {
    window.dispatchEvent(new CustomEvent('schofy:storage-warning', {
      detail: { ...q, message: `Storage ${q.percentUsed}% full (${q.usedMB}MB / ${q.quotaMB}MB)` }
    }));
    console.warn(`[StorageManager] Storage ${q.percentUsed}% full — ${q.usedMB}MB used of ${q.quotaMB}MB`);
  }
}

// ── Offline queue (IndexedDB-backed) ─────────────────────────────────────────

export interface QueueItem {
  id: string;
  op: 'create' | 'update' | 'delete' | 'batchDelete' | 'saveSettings';
  userId: string;
  tableName: string;
  recordId?: string;
  data?: any;
  ids?: string[];
  settings?: Record<string, any>;
  ts: number;
}

const QUEUE_LS_KEY = 'schofy_offline_queue'; // legacy localStorage key

/** Load all queue items — IDB primary, localStorage fallback */
export async function loadQueue(): Promise<QueueItem[]> {
  try {
    const db = await getStorageDB();
    return new Promise((resolve) => {
      const tx = db.transaction(QUEUE_STORE, 'readonly');
      const req = tx.objectStore(QUEUE_STORE).getAll();
      req.onsuccess = () => {
        const idbItems: QueueItem[] = req.result || [];
        // Also merge any items still in localStorage (migration path)
        const lsItems = _loadQueueLS();
        if (lsItems.length > 0) {
          // Migrate LS items to IDB and clear LS
          void _migrateQueueFromLS(db, lsItems);
        }
        // Merge, deduplicate by id
        const merged = new Map<string, QueueItem>();
        for (const item of [...idbItems, ...lsItems]) merged.set(item.id, item);
        resolve(Array.from(merged.values()).sort((a, b) => a.ts - b.ts));
      };
      req.onerror = () => resolve(_loadQueueLS());
    });
  } catch {
    return _loadQueueLS();
  }
}

/** Synchronous load from localStorage (fallback / migration) */
function _loadQueueLS(): QueueItem[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_LS_KEY) || '[]'); } catch { return []; }
}

async function _migrateQueueFromLS(db: IDBDatabase, items: QueueItem[]): Promise<void> {
  try {
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    const store = tx.objectStore(QUEUE_STORE);
    for (const item of items) store.put(item);
    tx.oncomplete = () => {
      localStorage.removeItem(QUEUE_LS_KEY);
    };
  } catch { /* migration is best-effort */ }
}

/** Add item to queue */
export async function enqueueItem(item: Omit<QueueItem, 'id' | 'ts'>): Promise<void> {
  const full: QueueItem = { ...item, id: _uuid(), ts: Date.now() };
  try {
    const db = await getStorageDB();
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    tx.objectStore(QUEUE_STORE).put(full);
  } catch {
    // Fallback to localStorage
    const q = _loadQueueLS();
    q.push(full);
    try { localStorage.setItem(QUEUE_LS_KEY, JSON.stringify(q)); } catch {}
  }
}

/** Remove item from queue by id */
export async function dequeueItem(id: string): Promise<void> {
  try {
    const db = await getStorageDB();
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    tx.objectStore(QUEUE_STORE).delete(id);
  } catch {
    try {
      const q = _loadQueueLS().filter(i => i.id !== id);
      localStorage.setItem(QUEUE_LS_KEY, JSON.stringify(q));
    } catch {}
  }
}

// ── Deleted IDs registry (IndexedDB-backed) ───────────────────────────────────

const DELETED_LS_KEY = 'schofy_deleted_ids'; // legacy localStorage key

interface DeletedRegistry { [key: string]: string[] }

function _loadDeletedLS(): DeletedRegistry {
  try { return JSON.parse(localStorage.getItem(DELETED_LS_KEY) || '{}'); } catch { return {}; }
}

/** Load deleted IDs for a specific table */
export async function getDeletedIds(sid: string, tableName: string): Promise<Set<string>> {
  const key = `${sid}:${tableName}`;
  try {
    const db = await getStorageDB();
    return new Promise((resolve) => {
      const tx = db.transaction(DELETED_STORE, 'readonly');
      const req = tx.objectStore(DELETED_STORE).get(key);
      req.onsuccess = () => {
        const idbIds: string[] = req.result || [];
        // Also check localStorage (migration)
        const lsReg = _loadDeletedLS();
        const lsIds: string[] = lsReg[key] || [];
        const merged = new Set([...idbIds, ...lsIds]);
        if (lsIds.length > 0) {
          // Migrate to IDB
          void _migrateDeletedFromLS(db, lsReg);
        }
        resolve(merged);
      };
      req.onerror = () => {
        const reg = _loadDeletedLS();
        resolve(new Set(reg[key] || []));
      };
    });
  } catch {
    const reg = _loadDeletedLS();
    return new Set(reg[key] || []);
  }
}

async function _migrateDeletedFromLS(db: IDBDatabase, reg: DeletedRegistry): Promise<void> {
  try {
    const tx = db.transaction(DELETED_STORE, 'readwrite');
    const store = tx.objectStore(DELETED_STORE);
    for (const [key, ids] of Object.entries(reg)) store.put(ids, key);
    tx.oncomplete = () => {
      localStorage.removeItem(DELETED_LS_KEY);
    };
  } catch { /* best-effort */ }
}

/** Mark a single ID as deleted */
export async function markDeleted(sid: string, tableName: string, id: string): Promise<void> {
  const key = `${sid}:${tableName}`;
  try {
    const db = await getStorageDB();
    const tx = db.transaction(DELETED_STORE, 'readwrite');
    const store = tx.objectStore(DELETED_STORE);
    const getReq = store.get(key);
    getReq.onsuccess = () => {
      const existing: string[] = getReq.result || [];
      if (!existing.includes(id)) {
        store.put([...existing, id], key);
      }
    };
  } catch {
    // Fallback to localStorage
    const reg = _loadDeletedLS();
    if (!reg[key]) reg[key] = [];
    if (!reg[key].includes(id)) reg[key].push(id);
    try { localStorage.setItem(DELETED_LS_KEY, JSON.stringify(reg)); } catch {}
  }
}

/** Mark multiple IDs as deleted */
export async function markBatchDeleted(sid: string, tableName: string, ids: string[]): Promise<void> {
  if (!ids.length) return;
  const key = `${sid}:${tableName}`;
  try {
    const db = await getStorageDB();
    const tx = db.transaction(DELETED_STORE, 'readwrite');
    const store = tx.objectStore(DELETED_STORE);
    const getReq = store.get(key);
    getReq.onsuccess = () => {
      const existing: string[] = getReq.result || [];
      const merged = [...new Set([...existing, ...ids])];
      store.put(merged, key);
    };
  } catch {
    const reg = _loadDeletedLS();
    if (!reg[key]) reg[key] = [];
    for (const id of ids) {
      if (!reg[key].includes(id)) reg[key].push(id);
    }
    try { localStorage.setItem(DELETED_LS_KEY, JSON.stringify(reg)); } catch {}
  }
}

/** Filter records, removing any whose IDs are in the deleted registry */
export async function filterDeleted(sid: string, tableName: string, records: any[]): Promise<any[]> {
  const deleted = await getDeletedIds(sid, tableName);
  if (deleted.size === 0) return records;
  return records.filter(r => !deleted.has(r.id));
}

// ── Electron native file backup ───────────────────────────────────────────────

const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;

/**
 * In Electron, write a JSON backup of the cache to the userData directory.
 * This gives the app a true native file-system footprint like a desktop app.
 * Falls back silently if not in Electron or IPC not available.
 */
export async function writeElectronBackup(key: string, data: any): Promise<void> {
  if (!isElectron) return;
  try {
    const api = (window as any).electronAPI;
    if (api?.writeBackup) {
      await api.writeBackup(key, JSON.stringify(data));
    }
  } catch { /* non-critical */ }
}

export async function readElectronBackup(key: string): Promise<any | null> {
  if (!isElectron) return null;
  try {
    const api = (window as any).electronAPI;
    if (api?.readBackup) {
      const raw = await api.readBackup(key);
      if (raw) return JSON.parse(raw);
    }
  } catch { /* non-critical */ }
  return null;
}

// ── Initialise on module load ─────────────────────────────────────────────────

if (typeof window !== 'undefined') {
  // Request persistent storage as early as possible
  void requestPersistentStorage();

  // Check quota after a short delay (non-blocking)
  setTimeout(() => void checkStorageQuota(), 5000);

  // Re-check quota periodically (every 30 minutes)
  setInterval(() => void checkStorageQuota(), 30 * 60 * 1000);
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function _uuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}
