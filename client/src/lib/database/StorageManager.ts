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
import { decryptJson, encryptJson } from './StorageCrypto';

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
          const s = db.createObjectStore(CACHE_STORE);
          // Add index for faster lookups by key parts if needed
        }

        // v2 stores — offline queue and deleted IDs
        if (!db.objectStoreNames.contains(QUEUE_STORE)) {
          const qs = db.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
          qs.createIndex('by_table', 'tableName', { unique: false });
          qs.createIndex('by_ts', 'ts', { unique: false });
          qs.createIndex('by_user', 'userId', { unique: false });
        }
        
        if (!db.objectStoreNames.contains(DELETED_STORE)) {
          // key = "${sid}:${tableName}", value = string[] of deleted IDs
          db.createObjectStore(DELETED_STORE);
        }
      };

      req.onsuccess = async () => {
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
const QUEUE_BACKUP_KEY = 'schofy_offline_queue';
const DELETED_BACKUP_KEY = 'schofy_deleted_ids';
let queueBackupTimer: ReturnType<typeof setTimeout> | null = null;

/** Load all queue items — IDB primary, localStorage fallback */
export async function loadQueue(): Promise<QueueItem[]> {
  try {
    const db = await getStorageDB();
    return new Promise((resolve) => {
      const tx = db.transaction(QUEUE_STORE, 'readonly');
      const req = tx.objectStore(QUEUE_STORE).getAll();
      req.onsuccess = async () => {
        const rawItems: any[] = req.result || [];
        const idbItems = (await Promise.all(rawItems.map(item => decryptJson<QueueItem>(item))))
          .filter(Boolean) as QueueItem[];
        // Also merge any items still in localStorage (migration path)
        const lsItems = _loadQueueLS();
        if (lsItems.length > 0) {
          // Migrate LS items to IDB and clear LS
          void _migrateQueueFromLS(db, lsItems);
        }
        // Merge, deduplicate by id
        const merged = new Map<string, QueueItem>();
        for (const item of [...idbItems, ...lsItems]) merged.set(item.id, item);
        const final = Array.from(merged.values()).sort((a, b) => a.ts - b.ts);
        if (final.length > 0) {
          void backupQueue(final);
          resolve(final);
          return;
        }

        void readElectronBackup(QUEUE_BACKUP_KEY).then(nativeQueue => {
          resolve(Array.isArray(nativeQueue) ? nativeQueue.sort((a, b) => a.ts - b.ts) : []);
        });
      };
      req.onerror = () => {
        const ls = _loadQueueLS();
        if (ls.length > 0) resolve(ls);
        else void readElectronBackup(QUEUE_BACKUP_KEY).then(nativeQueue => {
          resolve(Array.isArray(nativeQueue) ? nativeQueue.sort((a, b) => a.ts - b.ts) : []);
        });
      };
    });
  } catch {
    const ls = _loadQueueLS();
    if (ls.length > 0) return ls;
    const nativeQueue = await readElectronBackup(QUEUE_BACKUP_KEY);
    return Array.isArray(nativeQueue) ? nativeQueue.sort((a, b) => a.ts - b.ts) : [];
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
    for (const item of items) {
      const encrypted: any = await encryptJson(item);
      if (encrypted?.__schofyEncrypted) {
        encrypted.id = item.id;
        encrypted.tableName = item.tableName;
        encrypted.ts = item.ts;
        encrypted.userId = item.userId;
      }
      store.put(encrypted);
    }
    tx.oncomplete = () => {
      localStorage.removeItem(QUEUE_LS_KEY);
    };
  } catch { /* migration is best-effort */ }
}

/** Add item to queue */
export async function enqueueItem(item: Omit<QueueItem, 'id' | 'ts'> | QueueItem): Promise<void> {
  const incoming = item as Partial<QueueItem>;
  const full: QueueItem = {
    ...(item as Omit<QueueItem, 'id' | 'ts'>),
    id: incoming.id || _uuid(),
    ts: incoming.ts || Date.now(),
  } as QueueItem;
  try {
    const db = await getStorageDB();
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    const encrypted: any = await encryptJson(full);
    if (encrypted?.__schofyEncrypted) {
      encrypted.id = full.id;
      encrypted.tableName = full.tableName;
      encrypted.ts = full.ts;
      encrypted.userId = full.userId;
    }
    tx.objectStore(QUEUE_STORE).put(encrypted);
  } catch {
    // Fallback to localStorage
    const q = _loadQueueLS();
    q.push(full);
    try { localStorage.setItem(QUEUE_LS_KEY, JSON.stringify(q)); } catch {}
  }
  scheduleQueueBackup();
}

export async function enqueueItems(items: Array<Omit<QueueItem, 'id' | 'ts'> | QueueItem>): Promise<void> {
  if (items.length === 0) return;
  const fullItems = items.map((item) => {
    const incoming = item as Partial<QueueItem>;
    return {
      ...(item as Omit<QueueItem, 'id' | 'ts'>),
      id: incoming.id || _uuid(),
      ts: incoming.ts || Date.now(),
    } as QueueItem;
  });

  try {
    const db = await getStorageDB();
    const encryptedItems = await Promise.all(fullItems.map(async (full) => {
      const encrypted: any = await encryptJson(full);
      if (encrypted?.__schofyEncrypted) {
        encrypted.id = full.id;
        encrypted.tableName = full.tableName;
        encrypted.ts = full.ts;
        encrypted.userId = full.userId;
      }
      return encrypted;
    }));
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    const store = tx.objectStore(QUEUE_STORE);
    encryptedItems.forEach((encrypted) => store.put(encrypted));
  } catch {
    const q = _loadQueueLS();
    q.push(...fullItems);
    try { localStorage.setItem(QUEUE_LS_KEY, JSON.stringify(q)); } catch {}
  }
  scheduleQueueBackup();
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
  scheduleQueueBackup();
}

/** Remove multiple queue items in one transaction. */
export async function dequeueItems(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    const db = await getStorageDB();
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    const store = tx.objectStore(QUEUE_STORE);
    ids.forEach(id => store.delete(id));
  } catch {
    try {
      const remove = new Set(ids);
      const q = _loadQueueLS().filter(i => !remove.has(i.id));
      localStorage.setItem(QUEUE_LS_KEY, JSON.stringify(q));
    } catch {}
  }
  scheduleQueueBackup();
}

async function backupQueue(queue: QueueItem[]): Promise<void> {
  await writeElectronBackup(QUEUE_BACKUP_KEY, queue);
}

function scheduleQueueBackup(): void {
  if (!isElectron) return;
  if (queueBackupTimer) clearTimeout(queueBackupTimer);
  queueBackupTimer = setTimeout(() => {
    queueBackupTimer = null;
    void loadQueue().then(backupQueue);
  }, 1500);
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
      req.onsuccess = async () => {
        const decrypted = await decryptJson<string[]>(req.result);
        const idbIds: string[] = decrypted || [];
        // Also check localStorage (migration)
        const lsReg = _loadDeletedLS();
        const lsIds: string[] = lsReg[key] || [];
        let merged = new Set([...idbIds, ...lsIds]);
        if (lsIds.length > 0) {
          // Migrate to IDB
          void _migrateDeletedFromLS(db, lsReg);
        }
        if (merged.size === 0) {
          const nativeReg = await readElectronBackup(DELETED_BACKUP_KEY) as DeletedRegistry | null;
          merged = new Set(nativeReg?.[key] || []);
        }
        resolve(merged);
      };
      req.onerror = () => {
        const reg = _loadDeletedLS();
        if (reg[key]?.length) {
          resolve(new Set(reg[key]));
        } else {
          void readElectronBackup(DELETED_BACKUP_KEY).then((nativeReg: DeletedRegistry | null) => {
            resolve(new Set(nativeReg?.[key] || []));
          });
        }
      };
    });
  } catch {
    const reg = _loadDeletedLS();
    if (reg[key]?.length) return new Set(reg[key]);
    const nativeReg = await readElectronBackup(DELETED_BACKUP_KEY) as DeletedRegistry | null;
    return new Set(nativeReg?.[key] || []);
  }
}

async function _migrateDeletedFromLS(db: IDBDatabase, reg: DeletedRegistry): Promise<void> {
  try {
    const tx = db.transaction(DELETED_STORE, 'readwrite');
    const store = tx.objectStore(DELETED_STORE);
    for (const [key, ids] of Object.entries(reg)) store.put(await encryptJson(ids), key);
    tx.oncomplete = () => {
      localStorage.removeItem(DELETED_LS_KEY);
    };
  } catch { /* best-effort */ }
}

/** Mark a single ID as deleted */
export async function markDeleted(sid: string, tableName: string, id: string): Promise<void> {
  const key = `${sid}:${tableName}`;
  const reg = _loadDeletedLS();
  if (!reg[key]) reg[key] = [];
  if (!reg[key].includes(id)) reg[key].push(id);
  try { localStorage.setItem(DELETED_LS_KEY, JSON.stringify(reg)); } catch {}
  void writeElectronBackup(DELETED_BACKUP_KEY, reg);

  try {
    const db = await getStorageDB();
    const existing = await new Promise<string[]>((resolve) => {
      const tx = db.transaction(DELETED_STORE, 'readonly');
      const getReq = tx.objectStore(DELETED_STORE).get(key);
      getReq.onsuccess = async () => resolve(await decryptJson<string[]>(getReq.result) || []);
      getReq.onerror = () => resolve([]);
    });
    if (!existing.includes(id)) {
      const tx = db.transaction(DELETED_STORE, 'readwrite');
      tx.objectStore(DELETED_STORE).put(await encryptJson([...existing, id]), key);
    }
  } catch {
    // localStorage/native backup already updated above
  }
}

/** Mark multiple IDs as deleted */
export async function markBatchDeleted(sid: string, tableName: string, ids: string[]): Promise<void> {
  if (!ids.length) return;
  const key = `${sid}:${tableName}`;
  const reg = _loadDeletedLS();
  if (!reg[key]) reg[key] = [];
  for (const id of ids) {
    if (!reg[key].includes(id)) reg[key].push(id);
  }
  try { localStorage.setItem(DELETED_LS_KEY, JSON.stringify(reg)); } catch {}
  void writeElectronBackup(DELETED_BACKUP_KEY, reg);

  try {
    const db = await getStorageDB();
    const existing = await new Promise<string[]>((resolve) => {
      const tx = db.transaction(DELETED_STORE, 'readonly');
      const getReq = tx.objectStore(DELETED_STORE).get(key);
      getReq.onsuccess = async () => resolve(await decryptJson<string[]>(getReq.result) || []);
      getReq.onerror = () => resolve([]);
    });
    const merged = [...new Set([...existing, ...ids])];
    const tx = db.transaction(DELETED_STORE, 'readwrite');
    tx.objectStore(DELETED_STORE).put(await encryptJson(merged), key);
  } catch {
    // localStorage/native backup already updated above
  }
}

/** Remove a single ID from the deleted registry so restored records can appear again */
export async function unmarkDeleted(sid: string, tableName: string, id: string): Promise<void> {
  const key = `${sid}:${tableName}`;
  const reg = _loadDeletedLS();
  if (reg[key]) {
    reg[key] = reg[key].filter(existingId => existingId !== id);
    if (reg[key].length === 0) delete reg[key];
    try { localStorage.setItem(DELETED_LS_KEY, JSON.stringify(reg)); } catch {}
    void writeElectronBackup(DELETED_BACKUP_KEY, reg);
  }

  try {
    const db = await getStorageDB();
    const existing = await new Promise<string[]>((resolve) => {
      const tx = db.transaction(DELETED_STORE, 'readonly');
      const getReq = tx.objectStore(DELETED_STORE).get(key);
      getReq.onsuccess = async () => resolve(await decryptJson<string[]>(getReq.result) || []);
      getReq.onerror = () => resolve([]);
    });
    const updated = existing.filter(existingId => existingId !== id);
    const tx = db.transaction(DELETED_STORE, 'readwrite');
    if (updated.length > 0) {
      tx.objectStore(DELETED_STORE).put(await encryptJson(updated), key);
    } else {
      tx.objectStore(DELETED_STORE).delete(key);
    }
  } catch {
    // localStorage/native backup already updated above
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
