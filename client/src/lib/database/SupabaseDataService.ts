/**
 * SupabaseDataService — offline-first with conflict-safe sync.
 * Cache helpers: cacheGet, cacheSet, cacheApplyCreate, cacheApplyUpdate, cacheApplyDelete
 *
 * Strategy:
 * - ALL reads return local cache immediately (works 100% offline)
 * - Writes update local cache optimistically + queue for Supabase sync
 * - When online: flush queue to Supabase, then pull remote changes and MERGE
 *   (remote record only replaces local if remote updatedAt > local updatedAt
 *    AND the record has no pending local queue entry)
 * - On bootstrap: seed cache from Supabase without overriding pending local changes
 */
import { supabase, isSupabaseConfigured } from '../supabase';
import { generateUUID } from '../../utils/uuid';
import { addToRecycleBin } from '../../utils/recycleBin';

export type SyncStatus = 'synced' | 'pending' | 'failed';

export interface SyncResult {
  success: boolean;
  syncedRemotely: boolean;
  savedLocally: boolean;
  error?: string;
  record?: any;
}

export interface SyncHealthStatus {
  schoolId: string;
  pendingSyncItems: number;
  lastSyncAt: string | null;
  lastError: string | null;
  online: boolean;
  configured: boolean;
  missingTables: string[];
}

// ── helpers ───────────────────────────────────────────────────────────────────

function camelToSnake(s: string) {
  return s.replace(/[A-Z]/g, l => `_${l.toLowerCase()}`);
}
function snakeToCamel(s: string) {
  return s.replace(/_([a-z])/g, (_, l) => l.toUpperCase());
}

function getSupabaseTable(t: string): string {
  const m: Record<string, string> = {
    feeStructures: 'fee_structures', examResults: 'exam_results',
    transportRoutes: 'transport_routes', transportAssignments: 'transport_assignments',
    salaryPayments: 'salary_payments', pointTransactions: 'point_transactions',
  };
  return m[t] || (t.includes('_') ? t : camelToSnake(t));
}

function mapToLocal(r: any): any {
  const out: any = {};
  for (const [k, v] of Object.entries(r)) {
    out[k === 'school_id' ? 'schoolId' : snakeToCamel(k)] = v;
  }
  out.syncStatus = 'synced';
  return out;
}

// Allowed columns per Supabase table — keeps payloads clean
const TABLE_COLUMNS: Record<string, string[]> = {
  students: [
    'id','school_id','student_id','first_name','last_name','gender','dob','class_id',
    'stream','address','guardian_name','guardian_phone','guardian_email','medical_info',
    'photo_url','status','admission_no','tuition_fee','boarding_fee',
    'requirements','custom_fields','attachments','completed_term','completed_year',
    'created_at','updated_at',
  ],
  staff: [
    'id','school_id','employee_id','first_name','last_name','role','department',
    'dob','gender','address','phone','email','photo_url','salary','status','subjects',
    'created_at','updated_at',
  ],
  classes: [
    'id','school_id','name','level','stream','capacity','created_at','updated_at',
  ],
  subjects: [
    'id','school_id','name','class_id','teacher_id','created_at','updated_at',
  ],
  fees: [
    'id','school_id','student_id','class_id','description','amount','paid_amount',
    'due_date','term','year','status','fee_type','is_required','created_at','updated_at',
  ],
  fee_structures: [
    'id','school_id','class_id','category','description','amount','term','year',
    'due_date','is_required','name','created_at','updated_at',
  ],
  payments: [
    'id','school_id','fee_id','student_id','amount','method','reference',
    'date','notes','payment_type','created_at','updated_at',
  ],
  salary_payments: [
    'id','school_id','staff_id','staff_name','amount','month','year',
    'status','paid_at','payment_method','notes','created_at','updated_at',
  ],
  announcements: [
    'id','school_id','title','content','priority','type','target_audience',
    'created_by','published_by','published_at','created_at','updated_at',
  ],
  notifications: [
    'id','school_id','user_id','title','message','type','read','link',
    'created_at','updated_at',
  ],
  attendance: [
    'id','school_id','entity_type','entity_id','date','status','created_at','updated_at',
  ],
  exams: [
    'id','school_id','name','class_id','term','year','start_date','end_date',
    'created_at','updated_at',
  ],
  exam_results: [
    'id','school_id','exam_id','student_id','subject_id','subject_name','student_name',
    'class_id','score','max_score','grade','remarks','exam_type','created_at','updated_at',
  ],
  transport_routes: [
    'id','school_id','name','description','driver_name','driver_phone',
    'vehicle_no','capacity','fee','created_at','updated_at',
  ],
  transport_assignments: [
    'id','school_id','student_id','route_id','student_name','route_name',
    'created_at','updated_at',
  ],
  bursaries: [
    'id','school_id','student_id','student_name','amount','term','year','reason',
    'created_at','updated_at',
  ],
  discounts: [
    'id','school_id','class_id','class_name','type','amount','term','year',
    'created_at','updated_at',
  ],
  invoices: [
    'id','school_id','student_id','student_name','description','amount','amount_paid',
    'term','year','status','due_date','issued_at','paid_at','created_at','updated_at',
  ],
  settings: ['id','school_id','key','value','created_at','updated_at'],
  timetable: [
    'id','school_id','class_id','subject_id','teacher_id','day_of_week',
    'start_time','end_time','created_at','updated_at',
  ],
};

const COLUMN_SETS: Record<string, Set<string>> = {};
for (const [t, cols] of Object.entries(TABLE_COLUMNS)) {
  COLUMN_SETS[t] = new Set(cols);
}

function isUUID(v: any): boolean {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

// UUID columns that must be valid UUIDs or null — never plain strings
const UUID_COLUMNS = new Set([
  'id','school_id','class_id','student_id','staff_id','subject_id','exam_id',
  'fee_id','route_id','teacher_id','user_id','published_by','recorded_by',
]);

function toRemote(data: any, remoteTable: string): any {
  const allowed = COLUMN_SETS[remoteTable];
  const out: any = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    const col = k === 'schoolId' ? 'school_id' : camelToSnake(k);
    if (allowed && !allowed.has(col)) continue;
    // Coerce non-UUID values in UUID columns to null
    if (UUID_COLUMNS.has(col) && v !== null && !isUUID(v)) {
      out[col] = null;
      continue;
    }
    out[col] = v;
  }
  delete out.sync_status;
  delete out.device_id;
  return out;
}

const NO_SCHOOL_FILTER = new Set(['schools', 'users']);

function applyScope(query: any, table: string, sid: string): any {
  if (table === 'schools') return query.eq('id', sid);
  if (NO_SCHOOL_FILTER.has(table)) return query;
  return query.eq('school_id', sid);
}

function recycleBinType(t: string): string | null {
  return ({ students:'student', staff:'staff', announcements:'announcement',
    classes:'class', subjects:'subject', fees:'fee', exams:'exam',
    transportRoutes:'transport' } as any)[t] || null;
}

// ── Persistent deleted IDs registry ─────────────────────────────────────────
// Tracks IDs deleted locally so they are NEVER re-added from remote sync.
// Keyed by `${sid}:${tableName}` → Set of deleted IDs.
const DELETED_KEY = 'schofy_deleted_ids';

interface DeletedRegistry { [key: string]: string[] }

function loadDeletedRegistry(): DeletedRegistry {
  try { return JSON.parse(localStorage.getItem(DELETED_KEY) || '{}'); } catch { return {}; }
}
function saveDeletedRegistry(reg: DeletedRegistry) {
  try { localStorage.setItem(DELETED_KEY, JSON.stringify(reg)); } catch {}
}

function markDeleted(sid: string, tableName: string, id: string) {
  const reg = loadDeletedRegistry();
  const key = `${sid}:${tableName}`;
  if (!reg[key]) reg[key] = [];
  if (!reg[key].includes(id)) reg[key].push(id);
  saveDeletedRegistry(reg);
}

function markBatchDeleted(sid: string, tableName: string, ids: string[]) {
  if (!ids.length) return;
  const reg = loadDeletedRegistry();
  const key = `${sid}:${tableName}`;
  if (!reg[key]) reg[key] = [];
  for (const id of ids) {
    if (!reg[key].includes(id)) reg[key].push(id);
  }
  saveDeletedRegistry(reg);
}

function getDeletedIds(sid: string, tableName: string): Set<string> {
  const reg = loadDeletedRegistry();
  return new Set(reg[`${sid}:${tableName}`] || []);
}

// Filter out any records whose IDs are in the deleted registry
function filterDeleted(sid: string, tableName: string, records: any[]): any[] {
  const deleted = getDeletedIds(sid, tableName);
  if (deleted.size === 0) return records;
  return records.filter(r => !deleted.has(r.id));
}

// ── Persistent cache — IndexedDB primary, localStorage fallback ──────────────
const PERSIST_KEY = 'schofy_data_cache';
const IDB_DB_NAME = 'schofy_cache';
const IDB_STORE = 'data';
const IDB_VERSION = 1;

interface CacheEntry { data: any[]; ts: number; }
const memCache = new Map<string, CacheEntry>();

// ── IndexedDB cache database ──────────────────────────────────────────────────
let _cacheDB: IDBDatabase | null = null;
let _cacheDBReady: Promise<IDBDatabase> | null = null;

function getCacheDB(): Promise<IDBDatabase> {
  if (_cacheDB) return Promise.resolve(_cacheDB);
  if (_cacheDBReady) return _cacheDBReady;
  _cacheDBReady = new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(IDB_DB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(IDB_STORE)) {
          req.result.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => { _cacheDB = req.result; resolve(_cacheDB); };
      req.onerror = () => reject(req.error);
    } catch (e) { reject(e); }
  });
  return _cacheDBReady;
}

// ── Load persisted cache on startup (async, non-blocking) ────────────────────
let resolveCacheReady: () => void;
export const cacheReady = new Promise<void>(r => { resolveCacheReady = r; });

async function loadPersistedCache() {
  try {
    const db = await getCacheDB();
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(PERSIST_KEY);
    req.onsuccess = () => {
      let parsed = req.result;
      if (!parsed) {
        // Migrate from localStorage
        const saved = localStorage.getItem(PERSIST_KEY);
        if (saved) {
          try { parsed = JSON.parse(saved); } catch {}
          localStorage.removeItem(PERSIST_KEY);
        }
      }
      if (parsed) {
        for (const [k, v] of Object.entries(parsed)) {
          memCache.set(k, v as CacheEntry);
        }
      }
      resolveCacheReady();
    };
    req.onerror = () => { resolveCacheReady(); };
  } catch {
    // Fallback to localStorage
    try {
      const saved = localStorage.getItem(PERSIST_KEY);
      if (saved) {
        const parsed: Record<string, CacheEntry> = JSON.parse(saved);
        for (const [k, v] of Object.entries(parsed)) memCache.set(k, v);
      }
    } catch {}
    resolveCacheReady();
  }
}
void loadPersistedCache();

// Debounced persist — write to IndexedDB at most once per 2 seconds
let _persistTimer: ReturnType<typeof setTimeout> | null = null;
function persistCache() {
  if (_persistTimer) return;
  _persistTimer = setTimeout(() => {
    _persistTimer = null;
    _flushCache();
  }, 2000);
}

function _flushCache() {
  try {
    const obj: Record<string, CacheEntry> = {};
    for (const [k, v] of memCache) obj[k] = v;
    
    getCacheDB().then(db => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(obj, PERSIST_KEY);
    }).catch(() => {
      try { localStorage.setItem(PERSIST_KEY, JSON.stringify(obj)); } catch {}
    });
  } catch { /* error building obj */ }
}

// Flush cache immediately on page unload so offline data is always saved
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', _flushCache);
  window.addEventListener('pagehide', _flushCache);
}
// ── Offline queue ─────────────────────────────────────────────────────────────
const QUEUE_KEY = 'schofy_offline_queue';

interface QueueItem {
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

function loadQueue(): QueueItem[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; }
}
function saveQueue(q: QueueItem[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}
function enqueue(item: Omit<QueueItem, 'id' | 'ts'>) {
  const q = loadQueue();
  q.push({ ...item, id: generateUUID(), ts: Date.now() });
  saveQueue(q);
}
function dequeue(id: string) {
  saveQueue(loadQueue().filter(i => i.id !== id));
}

function isOnline() { return navigator.onLine; }
// ── Cache helpers ─────────────────────────────────────────────────────────────
function cacheKey(sid: string, table: string) { return `${sid}:${table}`; }

function cacheGet(sid: string, table: string): any[] | null {
  const e = memCache.get(cacheKey(sid, table));
  return e ? e.data : null;
}

function cacheGetAny(sid: string, table: string): any[] | null {
  return cacheGet(sid, table);
}

function cacheSet(sid: string, table: string, data: any[]) {
  memCache.set(cacheKey(sid, table), { data, ts: Date.now() });
  persistCache();
}

// In-flight deduplication for concurrent getAll calls
const inflight = new Map<string, Promise<any[]>>();


// Update in-memory cache optimistically for offline writes
function cacheApplyCreate(sid: string, tableName: string, record: any) {
  const existing = cacheGet(sid, tableName) || [];
  const idx = existing.findIndex(r => r.id === record.id);
  if (idx >= 0) existing[idx] = record;
  else existing.unshift(record);
  cacheSet(sid, tableName, existing);
}
function cacheApplyUpdate(sid: string, tableName: string, id: string, data: any) {
  const existing = cacheGet(sid, tableName) || [];
  const idx = existing.findIndex(r => r.id === id);
  if (idx >= 0) existing[idx] = { ...existing[idx], ...data };
  cacheSet(sid, tableName, existing);
}
function cacheApplyDelete(sid: string, tableName: string, id: string) {
  const existing = cacheGet(sid, tableName) || [];
  cacheSet(sid, tableName, existing.filter(r => r.id !== id));
}

function notifyUI(table: string) {
  // Push updated cache data directly into the store — instant UI update
  const sid = localStorage.getItem('schofy_current_school_id') || '';
  const storeRef = (globalThis as any).__schofyStore;
  if (sid && storeRef) {
    const cached = memCache.get(cacheKey(sid, table));
    if (cached) {
      storeRef.push(sid, table, cached.data);
    } else {
      storeRef.invalidate(sid, table);
    }
  }
  // Fire a single lightweight event for any legacy listeners
  window.dispatchEvent(new CustomEvent('dataRefresh', { detail: { table } }));
}

// ── service ───────────────────────────────────────────────────────────────────

class SupabaseDataService {
  private sid(userOrSchoolId: string | null | undefined): string {
    if (!userOrSchoolId) return localStorage.getItem('schofy_current_school_id') || '';
    const school = localStorage.getItem('schofy_current_school_id');
    const user   = localStorage.getItem('schofy_current_user_id');
    if (userOrSchoolId === user && school) return school;
    return userOrSchoolId;
  }

  private get db() { return supabase!; }
  private get ok() { return isSupabaseConfigured && !!supabase; }

  async bootstrapSession(userId: string, schoolId: string) {
    localStorage.setItem('schofy_current_user_id', userId);
    const sid = schoolId || userId;
    localStorage.setItem('schofy_current_school_id', sid);

    const ALL_TABLES = [
      'students', 'staff', 'classes', 'subjects', 'fees', 'payments',
      'announcements', 'attendance', 'feeStructures',
      'exams', 'examResults', 'transportRoutes', 'salaryPayments',
      'bursaries', 'discounts', 'notifications',
    ];

    // Step 1: Synchronously push ALL cached data into the store — instant, zero network
    const storeRef = (globalThis as any).__schofyStore;
    if (storeRef) {
      for (const table of ALL_TABLES) {
        const entry = memCache.get(cacheKey(sid, table));
        if (entry && entry.data.length > 0) {
          // Use the actual cache timestamp so staleness is correctly tracked
          storeRef.pushWithTs(sid, table, entry.data, entry.ts);
        }
      }
    }

    if (!isOnline() || !this.ok) {
      console.log('[bootstrap] Offline — using cached data');
      return;
    }

    // Step 2: Flush offline queue (push local changes to Supabase)
    void this.flushOfflineQueue();

    // Step 3: Fetch ALL tables from Supabase in parallel — no sequential awaiting
    // Use Promise.allSettled so one failure doesn't block others
    void Promise.allSettled(ALL_TABLES.map(t => this._seedFromSupabase(sid, t)));
  }

  /**
   * Fetch a table from Supabase and merge into local cache.
   * Used on bootstrap — seeds data for first-time use, doesn't override pending local changes.
   */
  private async _seedFromSupabase(sid: string, tableName: string): Promise<void> {
    if (!isOnline() || !this.ok) return;
    const rt = getSupabaseTable(tableName);
    try {
      // Add a 10-second timeout so slow tables don't block the UI
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);

      let q = this.db.from(rt).select('*');
      q = applyScope(q, rt, sid);
      const { data, error } = await q;
      clearTimeout(timeout);

      if (error || !data) return;

      const remoteRecords = filterDeleted(sid, tableName, data.map(mapToLocal));
      const local = cacheGet(sid, tableName) || cacheGetAny(sid, tableName) || [];

      if (local.length === 0) {
        cacheSet(sid, tableName, remoteRecords);
        notifyUI(tableName);
        return;
      }

      const pendingIds = new Set(
        loadQueue()
          .filter(q => q.tableName === tableName)
          .map(q => q.recordId || q.data?.id)
          .filter(Boolean)
      );

      const localMap = new Map(local.map(r => [r.id, r]));
      let changed = false;

      for (const remote of remoteRecords) {
        if (pendingIds.has(remote.id)) continue;
        const localRecord = localMap.get(remote.id);
        if (!localRecord) {
          localMap.set(remote.id, remote);
          changed = true;
        } else {
          const remoteTs = new Date(remote.updatedAt || remote.createdAt || 0).getTime();
          const localTs = new Date(localRecord.updatedAt || localRecord.createdAt || 0).getTime();
          if (remoteTs > localTs) {
            localMap.set(remote.id, remote);
            changed = true;
          }
        }
      }

      if (changed) {
        cacheSet(sid, tableName, Array.from(localMap.values()));
        notifyUI(tableName);
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.warn(`[seed] ${rt}:`, e.message);
      }
    }
  }

  startRealtimeSync(_: string) {}
  restartRealtimeSync(_: string) {}
  stopRealtimeSync() {}

  /** Public: merge a single table from Supabase into local cache (conflict-safe) */
  async syncTable(sid: string, tableName: string): Promise<void> {
    return this._seedFromSupabase(sid, tableName);
  }

  // ── reads ─────────────────────────────────────────────────────────────────

  async getAll(userId: string, tableName: string): Promise<any[]> {
    const sid = this.sid(userId);

    // Always return cached data immediately — instant UI, works offline
    const cached = cacheGet(sid, tableName);
    if (cached && cached.length > 0) {
      // Only trigger background merge if cache is older than 10 minutes
      if (isOnline() && this.ok) {
        const entry = memCache.get(cacheKey(sid, tableName));
        if (entry && Date.now() - entry.ts > 10 * 60_000) {
          void this._backgroundMerge(sid, tableName);
        }
      }
      return cached;
    }

    // No cache at all — if offline return empty array
    if (!isOnline() || !this.ok) return [];

    // No cache and online — fetch from Supabase
    const key = cacheKey(sid, tableName);
    const existing = inflight.get(key);
    if (existing) return existing;

    const rt = getSupabaseTable(tableName);
    const req = (async () => {
      try {
        let q = this.db.from(rt).select('*');
        q = applyScope(q, rt, sid);
        const { data, error } = await q;
        if (error) { console.error(`[getAll] ${rt}:`, error.message); return []; }
        const result = (data || []).map(mapToLocal);
        cacheSet(sid, tableName, result);
        return result;
      } catch (e: any) {
        console.error(`[getAll] ${rt}:`, e.message);
        return [];
      } finally {
        inflight.delete(key);
      }
    })();

    inflight.set(key, req);
    return req;
  }

  /**
   * Fetch from Supabase and merge into local cache without overriding pending local changes.
   * Remote record wins only if:
   *   - remote updatedAt > local updatedAt  (remote is newer)
   *   - AND the record has no pending queue entry (not modified locally while offline)
   */
  private _mergeTimers = new Map<string, ReturnType<typeof setTimeout>>();

  private _backgroundMerge(sid: string, tableName: string): void {
    // Settings have their own dedicated save path — skip background merge
    if (tableName === 'settings') return;

    const key = cacheKey(sid, tableName);

    // Already scheduled or running — skip
    if (this._mergeTimers.has(key)) return;

    // Only merge if cache is older than 10 minutes
    const entry = memCache.get(key);
    if (entry && Date.now() - entry.ts < 10 * 60_000) return;

    this._mergeTimers.set(key, setTimeout(async () => {
      this._mergeTimers.delete(key);
      if (!isOnline() || !this.ok) return;
      const rt = getSupabaseTable(tableName);
      try {
        let q = this.db.from(rt).select('*');
        q = applyScope(q, rt, sid);
        const { data, error } = await q;
        if (error || !data) return;

        const remoteRecords = filterDeleted(sid, tableName, data.map(mapToLocal));
        const local = cacheGet(sid, tableName) || [];

        // Build set of IDs with pending local queue entries — don't overwrite these
        const pendingIds = new Set(
          loadQueue()
            .filter(q => q.tableName === tableName && q.userId === sid)
            .map(q => q.recordId || q.data?.id)
            .filter(Boolean)
        );

        // Merge: for each remote record, update local only if remote is newer and not pending
        const localMap = new Map(local.map(r => [r.id, r]));
        let changed = false;

        for (const remote of remoteRecords) {
          if (pendingIds.has(remote.id)) continue; // local has pending changes — skip
          const localRecord = localMap.get(remote.id);
          if (!localRecord) {
            // New record from remote — add it
            localMap.set(remote.id, remote);
            changed = true;
          } else {
            // Compare updatedAt — remote wins only if newer
            const remoteTs = new Date(remote.updatedAt || remote.createdAt || 0).getTime();
            const localTs = new Date(localRecord.updatedAt || localRecord.createdAt || 0).getTime();
            if (remoteTs > localTs) {
              localMap.set(remote.id, remote);
              changed = true;
            }
          }
        }

        // Also remove local records that were deleted remotely (not in remote AND not pending)
        const remoteIds = new Set(remoteRecords.map(r => r.id));
        for (const [id, localRecord] of localMap) {
          if (!remoteIds.has(id) && !pendingIds.has(id)) {
            // Record deleted remotely — remove from local cache
            localMap.delete(id);
            changed = true;
          }
        }

        if (changed) {
          const merged = Array.from(localMap.values());
          cacheSet(sid, tableName, merged);
          notifyUI(tableName);
        }
      } catch (e: any) {
        console.warn(`[merge] ${rt}:`, e.message);
      }
    }, 100));
  }

  async get(userId: string, tableName: string, id: string): Promise<any | null> {
    const sid = this.sid(userId);
    // Check cache first (works offline)
    const cached = cacheGet(sid, tableName);
    if (cached) {
      const found = cached.find(r => r.id === id);
      if (found) return found;
    }
    if (!isOnline() || !this.ok) return null;
    const rt = getSupabaseTable(tableName);
    try {
      let q = this.db.from(rt).select('*').eq('id', id);
      q = applyScope(q, rt, sid);
      const { data, error } = await (q as any).maybeSingle();
      if (error || !data) return null;
      return mapToLocal(data);
    } catch { return null; }
  }

  async getPage(userId: string, tableName: string, page: number, pageSize: number, filter?: (i: any) => boolean) {
    const all = await this.getAll(userId, tableName);
    const filtered = filter ? all.filter(filter) : all;
    const start = (page - 1) * pageSize;
    return { items: filtered.slice(start, start + pageSize), total: filtered.length };
  }

  async search(userId: string, tableName: string, query: string, fields: string[]) {
    if (!query) return [];
    const all = await this.getAll(userId, tableName);
    const q = query.toLowerCase();
    return all.filter(item => fields.some(f => String(item[f] ?? '').toLowerCase().includes(q)));
  }

  async where(userId: string, tableName: string, fieldName: string, value: any) {
    const sid = this.sid(userId);
    // Always check cache first — works offline and is instant
    const cached = cacheGet(sid, tableName) || [];
    if (cached.length > 0 || !isOnline() || !this.ok) {
      return cached.filter((item: any) => item[fieldName] === value || item[camelToSnake(fieldName)] === value);
    }
    const rt = getSupabaseTable(tableName);
    const col = fieldName === 'schoolId' ? 'school_id' : camelToSnake(fieldName);
    try {
      let q = this.db.from(rt).select('*').eq(col, value);
      q = applyScope(q, rt, sid);
      const { data, error } = await q;
      if (error) {
        // Fall back to cache on error
        const cached = cacheGet(sid, tableName) || [];
        return cached.filter(item => item[fieldName] === value);
      }
      return (data || []).map(mapToLocal);
    } catch {
      const cached = cacheGet(sid, tableName) || [];
      return cached.filter(item => item[fieldName] === value);
    }
  }

  // ── writes ────────────────────────────────────────────────────────────────

  async create<T extends { id?: string }>(userId: string, tableName: string, data: any): Promise<SyncResult> {
    const sid = this.sid(userId);
    const now = new Date().toISOString();
    const id = isUUID(data.id) ? data.id : generateUUID();

    // Ensure required NOT NULL fields have defaults so queue items don't fail permanently
    let safeData = { ...data };
    if (tableName === 'fees') {
      if (!safeData.dueDate && !safeData.due_date) {
        const d = new Date(); d.setMonth(d.getMonth() + 1);
        safeData.dueDate = d.toISOString().split('T')[0];
      }
      if (!safeData.year) safeData.year = new Date().getFullYear();
    }
    if (tableName === 'exams') {
      if (!safeData.startDate && !safeData.start_date) safeData.startDate = now.split('T')[0];
      if (!safeData.endDate && !safeData.end_date) safeData.endDate = now.split('T')[0];
    }

    const record = { ...safeData, id, schoolId: safeData.schoolId || sid, createdAt: now, updatedAt: now, syncStatus: 'pending' };

    // Always update cache optimistically
    cacheApplyCreate(sid, tableName, record);
    notifyUI(tableName);

    // If offline, queue for later
    if (!isOnline() || !this.ok) {
      enqueue({ op: 'create', userId, tableName, data: record });
      return { success: true, syncedRemotely: false, savedLocally: true, record };
    }

    const rt = getSupabaseTable(tableName);
    const payload = toRemote(record, rt);
    try {
      const { error } = await this.db.from(rt).upsert(payload, { onConflict: 'id' });
      if (error) {
        console.error(`[create] ${rt}:`, error.code, error.message, error.details, error.hint);
        // Queue for retry even on error
        enqueue({ op: 'create', userId, tableName, data: record });
        return { success: true, syncedRemotely: false, savedLocally: true, record };
      }
      // Don't bust cache — optimistic data is already correct, background merge will reconcile
      return { success: true, syncedRemotely: true, savedLocally: true, record };
    } catch (e: any) {
      enqueue({ op: 'create', userId, tableName, data: record });
      return { success: true, syncedRemotely: false, savedLocally: true, record };
    }
  }

  async update<T>(userId: string, tableName: string, id: string, data: Partial<T>): Promise<SyncResult> {
    const sid = this.sid(userId);
    const record = { ...data, updatedAt: new Date().toISOString() };

    // Optimistic cache update
    cacheApplyUpdate(sid, tableName, id, record);
    notifyUI(tableName);

    if (!isOnline() || !this.ok) {
      enqueue({ op: 'update', userId, tableName, recordId: id, data: record });
      return { success: true, syncedRemotely: false, savedLocally: true, record };
    }

    const rt = getSupabaseTable(tableName);
    const payload = toRemote(record, rt);
    delete payload.id;
    delete payload.created_at;
    try {
      const { error } = await this.db.from(rt).update(payload).eq('id', id);
      if (error) {
        console.error(`[update] ${rt}:`, error.code, error.message, error.details, error.hint);
        enqueue({ op: 'update', userId, tableName, recordId: id, data: record });
        return { success: true, syncedRemotely: false, savedLocally: true, record };
      }
      return { success: true, syncedRemotely: true, savedLocally: true, record };
    } catch (e: any) {
      enqueue({ op: 'update', userId, tableName, recordId: id, data: record });
      return { success: true, syncedRemotely: false, savedLocally: true, record };
    }
  }

  async delete(userId: string, tableName: string, id: string): Promise<SyncResult> {
    const sid = this.sid(userId);

    // Register as deleted FIRST — prevents re-appearing from any future sync
    markDeleted(sid, tableName, id);

    // Optimistic cache delete
    const record = cacheGet(sid, tableName)?.find(r => r.id === id);
    const rtype = recycleBinType(tableName);
    if (record && rtype) {
      addToRecycleBin(sid, {
        id: `recycle-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        type: rtype as any,
        name: record.name || `${record.firstName || ''} ${record.lastName || ''}`.trim() || 'Unknown',
        data: record, deletedAt: new Date().toISOString(),
      });
    }
    cacheApplyDelete(sid, tableName, id);
    notifyUI(tableName);

    if (!isOnline() || !this.ok) {
      enqueue({ op: 'delete', userId, tableName, recordId: id });
      return { success: true, syncedRemotely: false, savedLocally: true };
    }

    const rt = getSupabaseTable(tableName);
    try {
      const { error } = await this.db.from(rt).delete().eq('id', id);
      if (error) {
        enqueue({ op: 'delete', userId, tableName, recordId: id });
        return { success: true, syncedRemotely: false, savedLocally: true };
      }
      return { success: true, syncedRemotely: true, savedLocally: true };
    } catch (e: any) {
      enqueue({ op: 'delete', userId, tableName, recordId: id });
      return { success: true, syncedRemotely: false, savedLocally: true };
    }
  }

  async batchDelete(userId: string, tableName: string, ids: string[]): Promise<SyncResult> {
    if (!ids.length) return { success: true, syncedRemotely: true, savedLocally: true };
    const sid = this.sid(userId);

    // Register all as deleted FIRST — prevents re-appearing from any future sync
    markBatchDeleted(sid, tableName, ids);

    // Optimistic cache delete
    const existing = cacheGet(sid, tableName) || [];
    cacheSet(sid, tableName, existing.filter(r => !ids.includes(r.id)));
    notifyUI(tableName);

    if (!isOnline() || !this.ok) {
      // Queue each delete individually
      for (const id of ids) {
        enqueue({ op: 'delete', userId, tableName, recordId: id });
      }
      return { success: true, syncedRemotely: false, savedLocally: true };
    }

    const rt = getSupabaseTable(tableName);
    try {
      const { error } = await this.db.from(rt).delete().in('id', ids);
      if (error) {
        for (const id of ids) enqueue({ op: 'delete', userId, tableName, recordId: id });
        return { success: true, syncedRemotely: false, savedLocally: true };
      }
      return { success: true, syncedRemotely: true, savedLocally: true };
    } catch (e: any) {
      for (const id of ids) enqueue({ op: 'delete', userId, tableName, recordId: id });
      return { success: false, syncedRemotely: false, savedLocally: true, error: e.message };
    }
  }

  async saveSettings(userId: string, settings: Record<string, any>): Promise<SyncResult> {
    const sid = this.sid(userId);
    const now = new Date().toISOString();

    // Update settings cache optimistically
    const existing = cacheGet(sid, 'settings') || [];
    const updated = [...existing];
    for (const [key, value] of Object.entries(settings)) {
      const idx = updated.findIndex(s => s.key === key);
      if (idx >= 0) updated[idx] = { ...updated[idx], value, updatedAt: now };
      else updated.push({ id: `${sid}:${key}`, schoolId: sid, key, value, createdAt: now, updatedAt: now });
    }
    cacheSet(sid, 'settings', updated);
    notifyUI('settings');

    if (!isOnline() || !this.ok) {
      enqueue({ op: 'saveSettings', userId, tableName: 'settings', settings });
      return { success: true, syncedRemotely: false, savedLocally: true };
    }

    try {
      for (const [key, value] of Object.entries(settings)) {
        await this.db.from('settings').upsert(
          { school_id: sid, key, value, updated_at: now, created_at: now },
          { onConflict: 'school_id,key' }
        );
      }
      return { success: true, syncedRemotely: true, savedLocally: true };
    } catch (e: any) {
      enqueue({ op: 'saveSettings', userId, tableName: 'settings', settings });
      return { success: true, syncedRemotely: false, savedLocally: true };
    }
  }

  // ── stubs ─────────────────────────────────────────────────────────────────
  async syncNow(_: string) { return { success: true, pushed: 0, pulled: 0, failed: 0 }; }
  async forcePush(_: string) { return { success: true, pushed: 0, failed: 0 }; }
  async forcePull(_: string) { return { success: true, pulled: 0, failed: 0 }; }
  async getSyncStatus(schoolId: string): Promise<SyncHealthStatus> {
    return { schoolId, pendingSyncItems: 0, lastSyncAt: null, lastError: null, online: navigator.onLine, configured: this.ok, missingTables: [] };
  }
  async cleanupDuplicates(_: string) { return {}; }
  async clear(_u: string, _t: string) {}

  // ── Offline queue flush with exponential backoff ─────────────────────────
  async flushOfflineQueue(): Promise<void> {
    if (!isOnline() || !this.ok) return;
    const queue = loadQueue();
    if (queue.length === 0) return;
    console.log(`[offline] Flushing ${queue.length} queued operations`);

    const MAX_RETRIES = 3;

    // Errors that will never succeed on retry — discard immediately
    const isUnrecoverable = (msg: string) =>
      msg.includes('violates not-null constraint') ||
      msg.includes('violates foreign key constraint') ||
      msg.includes('duplicate key value') ||
      msg.includes('invalid input syntax') ||
      msg.includes('column') && msg.includes('does not exist');

    for (const item of queue) {
      let lastError: any = null;
      let succeeded = false;
      let unrecoverable = false;

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        if (attempt > 0) {
          await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt - 1)));
        }
        try {
          if (item.op === 'create' && item.data) {
            const rt = getSupabaseTable(item.tableName);
            const payload = toRemote(item.data, rt);
            const { error } = await this.db.from(rt).upsert(payload, { onConflict: 'id' });
            if (error) throw error;
          } else if (item.op === 'update' && item.recordId && item.data) {
            const rt = getSupabaseTable(item.tableName);
            const payload = toRemote(item.data, rt);
            delete payload.id; delete payload.created_at;
            const { error } = await this.db.from(rt).update(payload).eq('id', item.recordId);
            if (error) throw error;
          } else if (item.op === 'delete' && item.recordId) {
            const rt = getSupabaseTable(item.tableName);
            const { error } = await this.db.from(rt).delete().eq('id', item.recordId);
            if (error) throw error;
          } else if (item.op === 'saveSettings' && item.settings) {
            const sid = this.sid(item.userId);
            const now = new Date().toISOString();
            for (const [key, value] of Object.entries(item.settings)) {
              const { error } = await this.db.from('settings').upsert(
                { school_id: sid, key, value, updated_at: now, created_at: now },
                { onConflict: 'school_id,key' }
              );
              if (error) throw error;
            }
          }
          succeeded = true;
          break;
        } catch (e: any) {
          lastError = e;
          const msg = e.message || '';
          if (isUnrecoverable(msg)) {
            // No point retrying — discard this item
            unrecoverable = true;
            console.warn(`[offline] Discarding unrecoverable ${item.op} on ${item.tableName}:`, msg);
            break;
          }
          console.warn(`[offline] Attempt ${attempt + 1} failed for ${item.op} on ${item.tableName}:`, msg);
        }
      }

      if (succeeded || unrecoverable) {
        // Remove from queue — either it worked or it can never work
        dequeue(item.id);
        if (succeeded) {
          void this._seedFromSupabase(this.sid(item.userId), item.tableName);
        }
      } else {
        console.error(`[offline] Will retry later: ${item.op} on ${item.tableName}:`, lastError?.message);
      }
    }

    // Notify UI after flush
    const tables = [...new Set(queue.map(i => i.tableName))];
    tables.forEach(t => notifyUI(t));
  }
}

export const dataService = new SupabaseDataService();
