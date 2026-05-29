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
import { matchesTextSearch } from '../../utils/searchMatch';
import { addToRecycleBin } from '../../utils/recycleBin';
import { isCloudSyncEnabled, isDesktopApp } from '../../utils/desktopSyncPreference';
import {
  getStorageDB,
  enqueueItem,
  dequeueItem,
  loadQueue,
  markDeleted as _markDeleted,
  markBatchDeleted as _markBatchDeleted,
  filterDeleted as _filterDeleted,
  getDeletedIds as _getDeletedIds,
  writeElectronBackup,
  readElectronBackup,
} from './StorageManager';
import { decryptJson, encryptJson } from './StorageCrypto';
import { userDBManager } from './UserDatabaseManager';

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
    schools: 'schools', subscriptions: 'subscriptions', users: 'users', plans: 'plans'
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
    'photo_url','status','admission_no','boarding_status','tuition_fee','boarding_fee',
    'requirements','custom_fields','attachments','completed_term','completed_year',
    'created_at','updated_at',
  ],
  staff: [
    'id','school_id','employee_id','first_name','last_name','role','department',
    'dob','gender','address','phone','email','photo_url','salary','status','subjects',
    'custom_fields','created_at','updated_at',
  ],
  classes: [
    'id','school_id','name','level','stream','capacity','created_at','updated_at',
  ],
  subjects: [
    'id','school_id','name','code','class_id','teacher_id','created_at','updated_at',
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
    'id','school_id','student_id','student_name','amount','is_full','term','year','reason',
    'created_at','updated_at',
  ],
  discounts: [
    'id','school_id','class_id','class_name','student_id','student_name','type','amount','term','year',
    'created_at','updated_at',
  ],
  invoices: [
    'id','school_id','student_id','student_name','description','amount','amount_paid',
    'term','year','status','due_date','issued_at','paid_at','created_at','updated_at',
  ],
  settings: ['id','school_id','key','value','created_at','updated_at'],
  timetable: [
    'id','school_id','class_id','subject_id','teacher_id','day_of_week','period',
    'entry_type','exam_id','custom_name','room','start_time','end_time','created_at','updated_at',
  ],
  schools: [
    'id','name','registration_number','address','phone','email','logo_url',
    'settings','plan','max_students','max_staff','created_at','updated_at',
  ],
  subscriptions: [
    'id','school_id','user_id','plan','status','starts_at','ends_at',
    'metadata','created_at','updated_at',
  ],
  users: [
    'id','school_id','email','first_name','last_name','phone','avatar_url',
    'role','is_active','last_login_at','created_at','updated_at',
  ],
  plans: ['id','name','price','student_limit','features','created_at','updated_at'],
  inventory: [
    'id','school_id','name','category','quantity','unit','min_stock',
    'price','supplier','created_at','updated_at',
  ],
  expenses: [
    'id','school_id','title','category','amount','date','recorded_by',
    'payment_method','notes','created_at','updated_at',
  ],
  audit_logs: [
    'id','school_id','user_id','action','resource','details','created_at',
  ],
  library_books: [
    'id','school_id','title','author','isbn','category','total_copies',
    'available_copies','created_at','updated_at',
  ],
  library_issues: [
    'id','school_id','book_id','student_id','issue_date','due_date',
    'return_date','status','created_at','updated_at',
  ],
  homework: [
    'id','school_id','title','description','class_id','subject_id',
    'due_date','created_at','updated_at',
  ],
  behavior_logs: [
    'id','school_id','student_id','type','points','reason','date',
    'recorded_by','created_at','updated_at',
  ],
  parent_messages: [
    'id','school_id','parent_id','student_id','message','direction',
    'created_at',
  ],
  student_attendance: [
    'id','school_id','student_id','class_id','date','status','remarks',
    'created_at','updated_at',
  ],
  staff_attendance: [
    'id','school_id','staff_id','date','status','remarks','created_at','updated_at',
  ],
  exam_timetable: [
    'id','school_id','exam_id','subject_id','date','start_time','end_time',
    'room','created_at','updated_at',
  ],
  lesson_plans: [
    'id','school_id','teacher_id','subject_id','class_id','title',
    'content','date','created_at','updated_at',
  ],
  student_resources: [
    'id','school_id','title','description','class_id','subject_id',
    'file_url','created_at','updated_at',
  ],
  hostel_rooms: [
    'id','school_id','name','block','capacity','created_at','updated_at',
  ],
  hostel_assignments: [
    'id','school_id','student_id','room_id','start_date','end_date',
    'created_at','updated_at',
  ],
  events: [
    'id','school_id','title','description','date','location','created_at','updated_at',
  ],
  visitor_logs: [
    'id','school_id','name','purpose','phone','entry_time','exit_time',
    'created_at','updated_at',
  ],
  certificates: [
    'id','school_id','student_id','type','issue_date','template_id',
    'created_at','updated_at',
  ],
};

const COLUMN_SETS: Record<string, Set<string>> = {};
for (const [t, cols] of Object.entries(TABLE_COLUMNS)) {
  COLUMN_SETS[t] = new Set(cols);
}

const SCHEMA_DISABLED_COLUMNS_KEY = 'schofy_disabled_remote_columns';
const DEFAULT_DISABLED_REMOTE_COLUMNS: Record<string, string[]> = {
  timetable: ['entry_type', 'exam_id', 'custom_name'],
  expenses: ['payment_method'],
};
const disabledRemoteColumns: Record<string, Set<string>> = {};

function loadDisabledRemoteColumns() {
  if (Object.keys(disabledRemoteColumns).length > 0) return;
  Object.entries(DEFAULT_DISABLED_REMOTE_COLUMNS).forEach(([table, columns]) => {
    disabledRemoteColumns[table] = new Set(columns);
  });
  try {
    const parsed = JSON.parse(localStorage.getItem(SCHEMA_DISABLED_COLUMNS_KEY) || '{}') as Record<string, string[]>;
    Object.entries(parsed).forEach(([table, columns]) => {
      disabledRemoteColumns[table] = new Set([...(disabledRemoteColumns[table] || []), ...columns]);
    });
  } catch { /* ignore */ }
}

function saveDisabledRemoteColumns() {
  try {
    const serializable = Object.fromEntries(Object.entries(disabledRemoteColumns).map(([table, columns]) => [table, Array.from(columns)]));
    localStorage.setItem(SCHEMA_DISABLED_COLUMNS_KEY, JSON.stringify(serializable));
  } catch { /* ignore */ }
}

function isRemoteColumnDisabled(remoteTable: string, column: string) {
  loadDisabledRemoteColumns();
  return disabledRemoteColumns[remoteTable]?.has(column) || false;
}

function markRemoteColumnDisabled(remoteTable: string, column: string) {
  if (!remoteTable || !column) return;
  loadDisabledRemoteColumns();
  if (!disabledRemoteColumns[remoteTable]) disabledRemoteColumns[remoteTable] = new Set();
  if (disabledRemoteColumns[remoteTable].has(column)) return;
  disabledRemoteColumns[remoteTable].add(column);
  saveDisabledRemoteColumns();
  console.debug(`[schema] ${remoteTable}.${column} is missing remotely; syncing without it until the database migration is applied.`);
}

function parseMissingRemoteColumn(error: any, remoteTable: string) {
  const msg = String(error?.message || error || '');
  const tableColumn = msg.match(/column\s+([a-z0-9_]+)\.([a-z0-9_]+)\s+does not exist/i);
  if (tableColumn) return { table: tableColumn[1], column: tableColumn[2] };
  const schemaCache = msg.match(/Could not find the '([^']+)' column of '([^']+)'/i);
  if (schemaCache) return { table: schemaCache[2], column: schemaCache[1] };
  return null;
}

function getRemoteSelectColumns(remoteTable: string) {
  const cols = (TABLE_COLUMNS as any)[remoteTable] || ['*'];
  if (cols[0] === '*') return '*';
  loadDisabledRemoteColumns();
  const disabled = disabledRemoteColumns[remoteTable];
  return (disabled ? cols.filter((col: string) => !disabled.has(col)) : cols).join(',');
}

function isUUID(v: any): boolean {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

// UUID columns that must be valid UUIDs or null — never plain strings
// NOTE: student_id in 'students' table is VARCHAR, but in others it's a UUID foreign key.
const UUID_COLUMNS = new Set([
  'id','school_id','class_id','student_id','staff_id','subject_id','exam_id',
  'fee_id','route_id','teacher_id','user_id','published_by','recorded_by',
]);

function toRemote(data: any, remoteTable: string, contextSchoolId?: string): any {
  const allowed = COLUMN_SETS[remoteTable];
  const out: any = {};
  
  // 1. Map existing fields
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    const col = k === 'schoolId' ? 'school_id' : camelToSnake(k);
    if (allowed && !allowed.has(col)) continue;
    if (isRemoteColumnDisabled(remoteTable, col)) continue;

    // UUID Validation with table-specific overrides
    if (UUID_COLUMNS.has(col) && v !== null) {
      const isActuallyVarchar = (col === 'student_id' && remoteTable === 'students');
      if (!isActuallyVarchar && !isUUID(v)) {
        // If it's school_id and it's invalid, we'll try to fix it later from contextSchoolId
        if (col === 'school_id') {
          out[col] = null;
        } else {
          // For other UUID columns, null is the safest fallback to avoid DB errors
          out[col] = null;
        }
        continue;
      }
    }
    
    out[col] = v;
  }

  // 2. Ensure school_id is present and valid for non-school/non-special tables
  const needsSchoolId = !NO_SCHOOL_FILTER.has(remoteTable) && remoteTable !== 'schools';
  if (needsSchoolId && allowed && allowed.has('school_id')) {
    // If missing or not a valid UUID, use the contextSchoolId
    if (!out.school_id || !isUUID(out.school_id)) {
      if (contextSchoolId && isUUID(contextSchoolId)) {
        out.school_id = contextSchoolId;
      } else {
        // Last resort: default school ID from migrations
        out.school_id = '00000000-0000-0000-0000-000000000001';
      }
    }
  }

  delete out.sync_status;
  delete out.device_id;
  return out;
}

const NO_SCHOOL_FILTER = new Set(['schools', 'plans']);

// Optional/local-only modules that are not present in the current Supabase
// schema. Keep them available in local cache, but never spend cloud calls on
// tables that would only return 404/schema-cache errors.
const LOCAL_ONLY_REMOTE_TABLES = new Set([
  'homework',
  'parent_messages',
  'behavior_logs',
  'staff_attendance',
  'lesson_plans',
  'student_resources',
  'student_attendance',
  'certificates',
  'visitor_logs',
  'exam_timetable',
  'plans',
  'hostel_rooms',
  'hostel_assignments',
  'events',
]);

function canUseRemoteTable(tableName: string): boolean {
  return !LOCAL_ONLY_REMOTE_TABLES.has(getSupabaseTable(tableName));
}

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
// Now backed by IndexedDB via StorageManager (localStorage fallback retained).
const DELETED_KEY = 'schofy_deleted_ids';

interface DeletedRegistry { [key: string]: string[] }

// In-memory set for instant filtering — prevents any race with background merge
const _deletedMemory = new Map<string, Set<string>>();

function loadDeletedRegistry(): DeletedRegistry {
  try { return JSON.parse(localStorage.getItem(DELETED_KEY) || '{}'); } catch { return {}; }
}
function saveDeletedRegistry(reg: DeletedRegistry) {
  try { localStorage.setItem(DELETED_KEY, JSON.stringify(reg)); } catch {}
}

function markDeleted(sid: string, tableName: string, id: string) {
  // 1. In-memory (instant — prevents race with background merge)
  const memKey = `${sid}:${tableName}`;
  if (!_deletedMemory.has(memKey)) _deletedMemory.set(memKey, new Set());
  _deletedMemory.get(memKey)!.add(id);
  // 2. Async IDB write (primary)
  void _markDeleted(sid, tableName, id);
  // 3. Sync localStorage write (fallback)
  const reg = loadDeletedRegistry();
  if (!reg[memKey]) reg[memKey] = [];
  if (!reg[memKey].includes(id)) { reg[memKey].push(id); saveDeletedRegistry(reg); }
}

function markBatchDeleted(sid: string, tableName: string, ids: string[]) {
  if (!ids.length) return;
  // 1. In-memory (instant)
  const memKey = `${sid}:${tableName}`;
  if (!_deletedMemory.has(memKey)) _deletedMemory.set(memKey, new Set());
  const memSet = _deletedMemory.get(memKey)!;
  for (const id of ids) memSet.add(id);
  // 2. Async IDB write (primary)
  void _markBatchDeleted(sid, tableName, ids);
  // 3. Sync localStorage write (fallback)
  const reg = loadDeletedRegistry();
  if (!reg[memKey]) reg[memKey] = [];
  for (const id of ids) {
    if (!reg[memKey].includes(id)) reg[memKey].push(id);
  }
  saveDeletedRegistry(reg);
}

function getDeletedIds(sid: string, tableName: string): Set<string> {
  const memKey = `${sid}:${tableName}`;
  // Check in-memory first (fastest, always up-to-date after any delete)
  if (_deletedMemory.has(memKey)) return _deletedMemory.get(memKey)!;
  // Fall back to localStorage and populate memory cache
  const reg = loadDeletedRegistry();
  const ids = new Set<string>(reg[memKey] || []);
  _deletedMemory.set(memKey, ids);
  return ids;
}

// Filter out any records whose IDs are in the deleted registry
function filterDeleted(sid: string, tableName: string, records: any[]): any[] {
  const deleted = getDeletedIds(sid, tableName);
  if (deleted.size === 0) return records;
  return records.filter(r => !deleted.has(r.id));
}

// ── Persistent cache — IndexedDB primary, localStorage fallback ──────────────
const PERSIST_KEY = 'schofy_data_cache';
const SID_CACHE_PREFIX = `${PERSIST_KEY}:`;
const MAX_LOCALSTORAGE_CACHE_BYTES = 1_500_000;

interface CacheEntry { data: any[]; ts: number; }
const memCache = new Map<string, CacheEntry>();

function currentCacheSid(): string {
  try {
    return localStorage.getItem('schofy_current_school_id')
      || localStorage.getItem('schofy_current_user_id')
      || '';
  } catch {
    return '';
  }
}

function sidCacheKey(sid: string) {
  return `${SID_CACHE_PREFIX}${sid}`;
}

function sidFromCacheKey(key: string) {
  const index = key.indexOf(':');
  return index > 0 ? key.slice(0, index) : '';
}

function loadEntriesIntoMemory(parsed: Record<string, CacheEntry> | null | undefined, sid = currentCacheSid()) {
  if (!parsed) return;
  for (const [k, v] of Object.entries(parsed)) {
    if (sid && !k.startsWith(`${sid}:`)) continue;
    memCache.set(k, { ...(v as CacheEntry), data: removeSmokeRecords((v as CacheEntry).data) });
  }
}

function groupCacheBySid(entries: Iterable<[string, CacheEntry]>) {
  const groups: Record<string, Record<string, CacheEntry>> = {};
  for (const [key, value] of entries) {
    const sid = sidFromCacheKey(key);
    if (!sid) continue;
    if (!groups[sid]) groups[sid] = {};
    groups[sid][key] = { ...value, data: removeSmokeRecords(value.data) };
  }
  return groups;
}

async function putCacheObject(db: IDBDatabase, key: string, obj: Record<string, CacheEntry>) {
  const encrypted = await encryptJson(obj);
  const tx = db.transaction('data', 'readwrite');
  tx.objectStore('data').put(encrypted, key);
  return encrypted;
}

async function migrateLegacyCacheToSidStores(parsed: Record<string, CacheEntry>) {
  try {
    const db = await getCacheDB();
    const groups = groupCacheBySid(Object.entries(parsed));
    await Promise.allSettled(Object.entries(groups).map(([sid, group]) => putCacheObject(db, sidCacheKey(sid), group)));
    const tx = db.transaction('data', 'readwrite');
    tx.objectStore('data').delete(PERSIST_KEY);
  } catch {
    // Best effort migration. The legacy cache can still be read if needed.
  }
}

// ── IndexedDB cache database ──────────────────────────────────────────────────
function getCacheDB(): Promise<IDBDatabase> {
  // Delegate to StorageManager which owns the DB lifecycle
  return getStorageDB();
}

// ── Load persisted cache on startup (async, non-blocking) ────────────────────
let resolveCacheReady: () => void;
export const cacheReady = new Promise<void>(r => { resolveCacheReady = r; });

async function loadPersistedCache() {
  try {
    const db = await getCacheDB();
    const tx = db.transaction('data', 'readonly');
    const sid = currentCacheSid();
    const req = tx.objectStore('data').get(sid ? sidCacheKey(sid) : PERSIST_KEY);
    req.onsuccess = async () => {
      let parsed = await decryptJson<Record<string, CacheEntry>>(req.result);
      if (!parsed) {
        const legacyReq = db.transaction('data', 'readonly').objectStore('data').get(PERSIST_KEY);
        parsed = await new Promise<Record<string, CacheEntry> | null>((resolve) => {
          legacyReq.onsuccess = async () => resolve(await decryptJson<Record<string, CacheEntry>>(legacyReq.result));
          legacyReq.onerror = () => resolve(null);
        });
        if (parsed) void migrateLegacyCacheToSidStores(parsed);
      }
      if (!parsed) {
        // Fallback to legacy localStorage cache
        const saved = localStorage.getItem(PERSIST_KEY);
        if (saved) {
          try { parsed = await decryptJson<Record<string, CacheEntry>>(JSON.parse(saved)); } catch {}
          if (parsed) void migrateLegacyCacheToSidStores(parsed);
        }
      }
      if (!parsed) {
        parsed = await decryptJson<Record<string, CacheEntry>>(await readElectronBackup(PERSIST_KEY));
      }
      loadEntriesIntoMemory(parsed);
      
      // Load critical fallbacks (ensures settings are always available)
      await _loadCriticalFallbacks();
      resolveCacheReady();
    };
    req.onerror = async () => { 
      const native = await decryptJson<Record<string, CacheEntry>>(await readElectronBackup(PERSIST_KEY));
      loadEntriesIntoMemory(native);
      await _loadCriticalFallbacks();
      resolveCacheReady(); 
    };
  } catch {
    const native = await decryptJson<Record<string, CacheEntry>>(await readElectronBackup(PERSIST_KEY));
    loadEntriesIntoMemory(native);
    await _loadCriticalFallbacks();
    resolveCacheReady();
  }
}

async function _loadCriticalFallbacks() {
  try {
    const sid = localStorage.getItem('schofy_current_school_id');
    if (!sid) return;
    
    for (const table of ['settings', 'schools', 'users']) {
      const key = `schofy_critical_${sid}_${table}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        try {
          const data = await decryptJson<any[]>(JSON.parse(saved));
          if (!data) return;
          const k = cacheKey(sid, table);
          // Only overwrite if not already in memCache or if memCache is older
          if (!memCache.has(k)) {
            memCache.set(k, { data: removeSmokeRecords(data), ts: Date.now() });
          }
        } catch {}
      }
    }
  } catch {}
}
void loadPersistedCache();

// Debounced persist — write to IndexedDB at most once per 1 second
let _persistTimer: ReturnType<typeof setTimeout> | null = null;
function persistCache() {
  if (_persistTimer) clearTimeout(_persistTimer);
  _persistTimer = setTimeout(() => {
    _persistTimer = null;
    _flushCache();
  }, 1000);
}

function _flushCache() {
  try {
    const obj: Record<string, CacheEntry> = {};
    for (const [k, v] of memCache) obj[k] = { ...v, data: removeSmokeRecords(v.data) };
    const groups = groupCacheBySid(Object.entries(obj));
    
    getCacheDB().then(db => {
      void (async () => {
        let currentEncrypted: any = null;
        for (const [sid, group] of Object.entries(groups)) {
          const encrypted = await putCacheObject(db, sidCacheKey(sid), group);
          if (sid === currentCacheSid()) currentEncrypted = encrypted;
        }
        const tx = db.transaction('data', 'readwrite');
        tx.objectStore('data').delete(PERSIST_KEY);
        try { localStorage.removeItem(PERSIST_KEY); } catch {}
        // Also write Electron native backup (no-op in browser)
        if (currentEncrypted) void writeElectronBackup('schofy_data_cache', currentEncrypted);
      })();
    }).catch(() => {
      void encryptJson(obj).then(encrypted => {
        try {
          const payload = JSON.stringify(encrypted);
          if (payload.length <= MAX_LOCALSTORAGE_CACHE_BYTES) localStorage.setItem(PERSIST_KEY, payload);
          else localStorage.removeItem(PERSIST_KEY);
        } catch {}
      });
    });
  } catch { /* error building obj */ }
}

// Flush cache immediately on page unload so offline data is always saved
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', _flushCache);
  window.addEventListener('pagehide', _flushCache);
}
// ── Offline queue ─────────────────────────────────────────────────────────────
// Now backed by IndexedDB via StorageManager. localStorage retained as fallback.
const QUEUE_KEY = 'schofy_offline_queue';
const DEAD_LETTER_KEY = 'schofy_sync_dead_letter';

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

function loadQueueSync(): QueueItem[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; }
}
function saveQueueSync(q: QueueItem[]) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch {}
}
function enqueue(item: Omit<QueueItem, 'id' | 'ts'>) {
  const queued = { ...item, id: generateUUID(), ts: Date.now() } as QueueItem;
  // Primary: async IDB write
  void enqueueItem(queued);
  // Fallback: sync localStorage write
  const q = loadQueueSync();
  q.push(queued);
  saveQueueSync(q);
}
function dequeue(id: string) {
  // Primary: async IDB delete
  void dequeueItem(id);
  // Fallback: sync localStorage delete
  saveQueueSync(loadQueueSync().filter(i => i.id !== id));
}

function deadLetter(item: QueueItem, reason: string) {
  try {
    const existing = JSON.parse(localStorage.getItem(DEAD_LETTER_KEY) || '[]');
    const next = [
      ...existing.filter((x: any) => x.queueId !== item.id),
      {
        queueId: item.id,
        op: item.op,
        tableName: item.tableName,
        recordId: item.recordId || item.data?.id || null,
        reason,
        failedAt: new Date().toISOString(),
      },
    ].slice(-200);
    localStorage.setItem(DEAD_LETTER_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('schofySyncDeadLetter', { detail: next[next.length - 1] }));
  } catch {
    /* best effort */
  }
}

function isOnline() { return navigator.onLine; }

function isRecoverableCloudProblem(error: any): boolean {
  const message = String(error?.message || error?.details || error || '').toLowerCase();
  const status = Number(error?.status || error?.code || 0);
  return (
    status === 402 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    message.includes('failed to fetch') ||
    message.includes('quota') ||
    message.includes('too many requests') ||
    message.includes('resource exhausted') ||
    message.includes('service unavailable') ||
    message.includes('exceed_egress_quota')
  );
}

function notifyCloudProblem(error: any) {
  if (!isRecoverableCloudProblem(error)) return;
  window.dispatchEvent(new CustomEvent('schofyCloudProblem', {
    detail: {
      message: 'Cloud space is unavailable or your free-tier limit may be reached. You can keep working locally on this desktop.',
    },
  }));
}
// ── Cache helpers ─────────────────────────────────────────────────────────────
function cacheKey(sid: string, table: string) { return `${sid}:${table}`; }

function recordBelongsToSchool(record: any, schoolId: string, tableName: string): boolean {
  if (!record || !schoolId) return false;
  if (tableName === 'schools') return record.id === schoolId || record.schoolId === schoolId || record.school_id === schoolId;
  if (tableName === 'plans') return false;
  return record.schoolId === schoolId || record.school_id === schoolId;
}

function cacheGet(sid: string, table: string): any[] | null {
  const e = memCache.get(cacheKey(sid, table));
  if (!e) return null;
  return removeSmokeRecords(e.data);
}

function cacheGetAny(sid: string, table: string): any[] | null {
  return cacheGet(sid, table);
}

function cacheSet(sid: string, table: string, data: any[]) {
  const cleanData = removeSmokeRecords(data);
  memCache.set(cacheKey(sid, table), { data: cleanData, ts: Date.now() });
  persistCache();
  void mirrorTableToDesktopDB(sid, table, cleanData);
  
  // Critical tables: Save to localStorage immediately (no debounce, sync)
  // This ensures that even if the page is refreshed or crashed, 
  // subscription and identity data are never lost.
  if (table === 'settings' || table === 'schools' || table === 'users') {
    try {
      const key = `schofy_critical_${sid}_${table}`;
      void encryptJson(cleanData).then(encrypted => {
        try { localStorage.setItem(key, JSON.stringify(encrypted)); } catch {}
      });
    } catch {}
  }
}

function isSmokeRecord(record: any): boolean {
  if (!record || typeof record !== 'object') return false;
  const fields = [
    record.name,
    record.title,
    record.subjectName,
    record.subject_name,
    record.description,
    record.code,
    record.id,
  ];
  return fields.some(value => typeof value === 'string' && /\bsmoke\b/i.test(value));
}

function removeSmokeRecords(data: any[]): any[] {
  if (!Array.isArray(data)) return [];
  return data.filter(record => !isSmokeRecord(record));
}

async function mirrorTableToDesktopDB(sid: string, table: string, data: any[]): Promise<void> {
  if (!isDesktopApp() || !sid || !table) return;
  try {
    await userDBManager.ensureDatabaseOpen(sid);
    try {
      const existing = await userDBManager.getAll(sid, table);
      await Promise.all(
        existing
          .filter(isSmokeRecord)
          .map(record => record?.id ? userDBManager.delete(sid, table, record.id) : Promise.resolve())
      );
    } catch {
      // Store not present for this table.
    }
    for (const record of data) {
      if (record?.id) {
        await userDBManager.put(sid, table, record);
      }
    }
  } catch {
    // Some sync-cache tables do not have a dedicated local DB store yet.
  }
}

async function deleteFromDesktopDB(sid: string, table: string, id: string): Promise<void> {
  if (!isDesktopApp() || !sid || !table || !id) return;
  try {
    await userDBManager.delete(sid, table, id);
  } catch {
    // Store not present or record already gone.
  }
}

async function hydrateCacheFromDesktopDB(sid: string): Promise<void> {
  if (!isDesktopApp() || !sid) return;
  try {
    await userDBManager.ensureDatabaseOpen(sid);
  } catch {
    return;
  }

  for (const table of ALL_SYNC_TABLES) {
    if (memCache.has(cacheKey(sid, table))) continue;
    try {
      const rows = await userDBManager.getAll(sid, table);
      const cleanRows = removeSmokeRecords(rows);
      if (cleanRows.length !== rows.length) {
        await Promise.all(rows.filter(isSmokeRecord).map(row => row?.id ? userDBManager.delete(sid, table, row.id) : Promise.resolve()));
      }
      if (cleanRows.length > 0) {
        memCache.set(cacheKey(sid, table), { data: cleanRows, ts: Date.now() });
      }
    } catch {
      // Store not present for this table in the local desktop DB.
    }
  }
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
  const cached = cacheGet(sid, tableName);
  if (!cached) return false;
  const existing = cached;
  const idx = existing.findIndex(r => r.id === id);
  if (idx < 0) return false;
  existing[idx] = { ...existing[idx], ...data };
  cacheSet(sid, tableName, existing);
  return true;
}
function cacheApplyDelete(sid: string, tableName: string, id: string) {
  const existing = cacheGet(sid, tableName) || [];
  cacheSet(sid, tableName, existing.filter(r => r.id !== id));
  void deleteFromDesktopDB(sid, tableName, id);
}

function notifyUI(table: string, options: { forceRefresh?: boolean } = {}) {
  // Push updated cache data directly into the store — instant UI update
  const sid = localStorage.getItem('schofy_current_school_id') || '';
  const storeRef = (globalThis as any).__schofyStore;
  if (sid && storeRef) {
    const cached = memCache.get(cacheKey(sid, table));
    if (cached && !options.forceRefresh) {
      storeRef.push(sid, table, cached.data);
    } else {
      storeRef.invalidate(sid, table);
    }
  }
  // Fire lightweight events for legacy listeners and realtime indicators.
  window.dispatchEvent(new CustomEvent('dataRefresh', { detail: { table } }));
  window.dispatchEvent(new CustomEvent('schofyDataRefresh', { detail: { table } }));
}

// ── service ───────────────────────────────────────────────────────────────────

const ALL_SYNC_TABLES = [
  'students', 'staff', 'classes', 'subjects', 'fees', 'payments',
  'announcements', 'attendance', 'feeStructures',
  'exams', 'examResults', 'transportRoutes', 'transportAssignments', 'salaryPayments',
  'pointTransactions', 'bursaries', 'discounts', 'notifications', 'invoices', 'settings', 'timetable',
  'inventory', 'expenses', 'auditLogs', 'libraryBooks', 'libraryIssues', 'homework', 'behaviorLogs', 'parentMessages', 'studentAttendance',
  'staffAttendance', 'examTimetable', 'lessonPlans', 'studentResources', 'hostelRooms', 'hostelAssignments', 'events', 'visitorLogs', 'certificates',
  'schools', 'subscriptions', 'users', 'plans'
];

const REALTIME_REMOTE_TABLES = Array.from(new Set(
  ALL_SYNC_TABLES
    .map(getSupabaseTable)
    .filter(table => TABLE_COLUMNS[table])
    .filter(table => !LOCAL_ONLY_REMOTE_TABLES.has(table))
));

function getRealtimeFilter(table: string, sid: string): string | undefined {
  if (table === 'schools') return `id=eq.${sid}`;
  if (COLUMN_SETS[table]?.has('school_id')) return `school_id=eq.${sid}`;
  if (NO_SCHOOL_FILTER.has(table)) return undefined;
  return undefined;
}

const BOOTSTRAP_PULL_TABLES = ['settings', 'schools', 'users', 'subscriptions'];
const REMOTE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const FORCED_REMOTE_FETCH_MIN_MS = 5 * 60 * 1000;

class SupabaseDataService {
  private static instance: SupabaseDataService;
  private _realtimeStarted = false;
  private _realtimeStarting = false;
  private _realtimeChannel: any = null;
  private _realtimeSid: string | null = null;
  private _realtimeReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _realtimeStopTimer: ReturnType<typeof setTimeout> | null = null;
  private _isInitialized = false;
  private _syncInProgress = false;
  private _lastSyncAttempt = 0;
  private _backoffDelay = 1000;

  constructor() {
    if (SupabaseDataService.instance) return SupabaseDataService.instance;
    SupabaseDataService.instance = this;
  }

  static getInstance(): SupabaseDataService {
    if (!SupabaseDataService.instance) {
      SupabaseDataService.instance = new SupabaseDataService();
    }
    return SupabaseDataService.instance;
  }

  private sid(userOrSchoolId: string | null | undefined): string {
    if (!userOrSchoolId) return localStorage.getItem('schofy_current_school_id') || '';
    const school = localStorage.getItem('schofy_current_school_id');
    const user   = localStorage.getItem('schofy_current_user_id');
    if (userOrSchoolId === user && school) return school;
    return userOrSchoolId;
  }

  private get db() { return supabase!; }
  private get ok() { return isSupabaseConfigured && !!supabase; }

  /**
   * Returns an auth session when Supabase Auth is in use.
   *
   * Schofy currently logs users in through the public `users` table instead of
   * Supabase Auth, so the anon client is the expected write path. Do not block
   * reads/writes just because there is no auth session; RLS/policy failures are
   * handled by the actual Supabase request and queued for retry.
   */
  private async waitForSession(_timeoutMs = 5000): Promise<any> {
    if (!this.ok) return null;
    
    // 1. Check if we already have a session
    const { data: { session: initialSession } } = await this.db.auth.getSession();
    if (initialSession?.access_token) return initialSession;

    return { isAnonClient: true };
  }

  async bootstrapSession(userId: string, schoolId: string, options: { wait?: boolean } = {}) {
    if (this._isInitialized && !options.wait) return;
    
    localStorage.setItem('schofy_current_user_id', userId);
    const sid = schoolId || userId;
    localStorage.setItem('schofy_current_school_id', sid);

    // Step 0: One-time migration from legacy databases
    await this._migrateLegacyData(userId, sid);
    await hydrateCacheFromDesktopDB(sid);

    // Step 1: Instant load from cache (Stage 1)
    const storeRef = (globalThis as any).__schofyStore;
    if (storeRef) {
      for (const table of ALL_SYNC_TABLES) {
        const entry = memCache.get(cacheKey(sid, table));
        if (entry && entry.data.length > 0) {
          storeRef.pushWithTs(sid, table, entry.data, entry.ts);
        }
      }
    }

    if (!isCloudSyncEnabled() || !isOnline() || !this.ok) return;

    // Step 2: Request persistence and flush queue (Stage 2)
    const { requestPersistentStorage } = await import('./StorageManager');
    void requestPersistentStorage();

    const initTask = (async () => {
      // Flush offline queue first to ensure consistency
      await this.flushOfflineQueue();

      // Only seed identity/subscription tables at startup. Feature pages fetch
      // their own table when opened, which keeps Supabase free-tier usage low.
      const syncPromises = BOOTSTRAP_PULL_TABLES.map(t => {
        const entry = memCache.get(cacheKey(sid, t));
        const isStale = !entry || (Date.now() - entry.ts > REMOTE_CACHE_TTL_MS);
        if (isStale) {
          return this._seedFromSupabase(sid, t);
        }
        return Promise.resolve();
      });
      
      await Promise.allSettled(syncPromises);
      this.startRealtimeSync(sid);
      this._isInitialized = true;
    })();

    if (options.wait) {
      await initTask;
    }
  }

  /** One-time migration from schofy_user_db_* databases to the new sync cache */
  private async _migrateLegacyData(userId: string, schoolId: string): Promise<void> {
    const migrationFlag = `schofy_migrated_${userId}`;
    if (localStorage.getItem(migrationFlag)) return;

    try {
      const dbName = `schofy_user_db_${userId}`;
      console.log(`[Migration] Checking for legacy data in ${dbName}...`);
      
      const db = await new Promise<IDBDatabase | null>((resolve) => {
        const req = indexedDB.open(dbName);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      });

      if (!db) return;

      let migratedCount = 0;
      const stores = Array.from(db.objectStoreNames);
      
      for (const storeName of stores) {
        if (storeName === 'syncQueue' || storeName === 'syncMeta') continue;
        
        const data = await new Promise<any[]>((resolve) => {
          const tx = db.transaction(storeName, 'readonly');
          const req = tx.objectStore(storeName).getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => resolve([]);
        });

        if (data.length > 0) {
          const tableName = storeName; // assuming names match
          const existing = cacheGet(schoolId, tableName) || [];
          const merged = [...existing];
          
          for (const item of data) {
            if (!merged.find(r => r.id === item.id)) {
              merged.push(item);
              migratedCount++;
            }
          }
          cacheSet(schoolId, tableName, merged);
        }
      }

      db.close();
      if (migratedCount > 0) {
        console.log(`[Migration] Successfully migrated ${migratedCount} records from legacy database`);
      }
      localStorage.setItem(migrationFlag, 'true');
    } catch (e) {
      console.warn('[Migration] Legacy migration failed:', e);
    }
  }

  /**
   * Fetch a table from Supabase and merge into local cache.
   * Used on bootstrap — seeds data for first-time use, doesn't override pending local changes.
  */
  private async _seedFromSupabase(sid: string, tableName: string): Promise<void> {
    if (!canUseRemoteTable(tableName)) return;
    if (!isCloudSyncEnabled() || !isOnline() || !this.ok) return;

    // Use Supabase Auth session when available, but allow anon-table auth too.
    const session = await this.waitForSession();
    if (!session) return;

    const rt = getSupabaseTable(tableName);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);

      // DELTA SYNC: Only fetch what we need (specific columns + school filter)
      let q = this.db.from(rt).select(getRemoteSelectColumns(rt));
      
      if (!NO_SCHOOL_FILTER.has(rt) && rt !== 'schools') {
        q = applyScope(q, rt, sid);
      } else if (rt === 'schools') {
        q = q.eq('id', sid);
      }
      
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
        loadQueueSync()
          .filter(q => q.tableName === tableName)
          .map(q => q.recordId || q.data?.id)
          .filter(Boolean)
      );

      const localMap = new Map(local.map(r => [r.id, r]));
      let changed = false;

      for (const remote of remoteRecords) {
        if (pendingIds.has(remote.id)) continue;
        const localRec = localMap.get(remote.id);
        if (!localRec) {
          localMap.set(remote.id, remote);
          changed = true;
        } else {
          const remoteTs = new Date(remote.updatedAt || remote.createdAt || 0).getTime();
          const localTs = new Date(localRec.updatedAt || localRec.createdAt || 0).getTime();
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
      notifyCloudProblem(e);
      if (e.name !== 'AbortError') {
        console.warn(`[seed] ${rt}:`, e.message);
      }
    }
  }

  startRealtimeSync(sid: string) {
    if (!isCloudSyncEnabled() || !this.ok || !isOnline()) return;
    if (this._realtimeStopTimer) {
      clearTimeout(this._realtimeStopTimer);
      this._realtimeStopTimer = null;
    }
    if ((this._realtimeStarted || this._realtimeStarting) && this._realtimeSid === sid) {
      console.debug('[Realtime] Already started, skipping duplicate initialization');
      return;
    }
    
    // 1. Cleanup existing channel before starting a new one
    this.stopRealtimeSync();

    console.log(`[Realtime] Starting sync for school: ${sid}`);
    this._realtimeStarting = true;
    this._realtimeSid = sid;

    // 2. Use Supabase Auth session when available, but allow anon-table auth too.
    this.waitForSession().then(session => {
      this._realtimeStarting = false;
      if (this._realtimeSid !== sid) return;
      if (!session) {
        console.warn('[Realtime] Postponing connection: Supabase unavailable');
        this._realtimeStarted = false;
        return;
      }

      this._realtimeStarted = true;
      this._realtimeSid = sid;

      let ch = this.db.channel(`school-sync-${sid}`);
      
      for (const table of REALTIME_REMOTE_TABLES) {
        const filter = getRealtimeFilter(table, sid);
        const subscription: any = { 
          event: '*', 
          schema: 'public', 
          table,
        };
        if (filter) subscription.filter = filter;
        
        ch = ch.on('postgres_changes', subscription, (payload: any) => {
          const tableName = snakeToCamel(table);
          const { eventType, new: newRecord, old: oldRecord } = payload;
          const record = (newRecord && Object.keys(newRecord).length > 0) ? newRecord : oldRecord;
          
          if (!record) return;
          const localRecord = mapToLocal(record);

          let needsRefresh = false;

          if (eventType === 'INSERT' || eventType === 'UPDATE') {
            const pendingIds = new Set(
              loadQueueSync()
                .filter(q => q.tableName === tableName)
                .map(q => q.recordId || q.data?.id)
                .filter(Boolean)
            );

            if (pendingIds.has(localRecord.id)) return;

            if (eventType === 'INSERT') {
              cacheApplyCreate(sid, tableName, localRecord);
            } else {
              const applied = cacheApplyUpdate(sid, tableName, localRecord.id, localRecord);
              needsRefresh = !applied;
            }
          } else if (eventType === 'DELETE') {
            markDeleted(sid, tableName, localRecord.id);
            cacheApplyDelete(sid, tableName, localRecord.id);
          }

          notifyUI(tableName, { forceRefresh: needsRefresh });
          console.debug(`[Realtime] ${eventType} on ${table} processed`);
        }) as any;
      }

      ch.subscribe((status) => {
        if (this._realtimeSid !== sid) return;
        if (status === 'SUBSCRIBED') {
          console.log('[Realtime] Connected to school sync channel');
          this._backoffDelay = 1000; // Reset backoff on success
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          console.warn(`[Realtime] Channel ${status}. Restarting with backoff...`);
          const backoff = Math.min(this._backoffDelay * 2, 30000);
          this._backoffDelay = backoff;
          if (this._realtimeReconnectTimer) clearTimeout(this._realtimeReconnectTimer);
          this._realtimeReconnectTimer = setTimeout(() => this.restartRealtimeSync(sid), backoff);
        } else if (status === 'TIMED_OUT') {
          console.warn('[Realtime] Channel timed out. Reconnecting...');
          this.restartRealtimeSync(sid);
        }
      });

      this._realtimeChannel = ch;
    }).catch((error) => {
      if (this._realtimeSid !== sid) return;
      this._realtimeStarting = false;
      this._realtimeStarted = false;
      console.warn('[Realtime] Failed to start sync channel:', error?.message || error);
    });
  }

  restartRealtimeSync(sid: string) {
    this.stopRealtimeSync();
    this.startRealtimeSync(sid);
  }

  stopRealtimeSync() {
    this._realtimeStarted = false;
    this._realtimeStarting = false;
    this._realtimeSid = null;
    if (this._realtimeReconnectTimer) {
      clearTimeout(this._realtimeReconnectTimer);
      this._realtimeReconnectTimer = null;
    }
    if (this._realtimeChannel) {
      void this.db.removeChannel(this._realtimeChannel);
      this._realtimeChannel = null;
      console.log('[Realtime] Disconnected from school sync channel');
    }
  }

  scheduleRealtimeStop(delayMs = 750) {
    if (this._realtimeStopTimer) clearTimeout(this._realtimeStopTimer);
    this._realtimeStopTimer = setTimeout(() => {
      this._realtimeStopTimer = null;
      this.stopRealtimeSync();
    }, delayMs);
  }

  /** Public: merge a single table from Supabase into local cache (conflict-safe) */
  async syncTable(sid: string, tableName: string): Promise<void> {
    if (!canUseRemoteTable(tableName)) return;
    return this._seedFromSupabase(sid, tableName);
  }

  async refreshNotifications(userOrSchoolId: string): Promise<any[]> {
    const sid = this.sid(userOrSchoolId);
    if (!this.ok || !isOnline()) return cacheGet(sid, 'notifications') || [];
    return this._fetchAndMerge(sid, 'notifications');
  }

  // ── reads ─────────────────────────────────────────────────────────────────

  async getAll(userId: string, tableName: string, forceRefresh = false): Promise<any[]> {
    const sid = this.sid(userId);

    // 1. Instant Return from Cache (Offline-Ready)
    const cached = cacheGet(sid, tableName);
    
    // 2. Fetch only when needed. Realtime handles cross-device changes, so
    // cached data can live for hours without repeatedly spending API quota.
    if (isCloudSyncEnabled() && isOnline() && this.ok) {
      const entry = memCache.get(cacheKey(sid, tableName));
      const hasCacheEntry = Boolean(entry);
      const isStale = !entry || (Date.now() - entry.ts > REMOTE_CACHE_TTL_MS);
      const shouldFetch = forceRefresh || !hasCacheEntry || isStale;

      if (shouldFetch) {
        // Trigger background fetch immediately
        // For cloud-first, if we have never checked this table, wait for the fetch.
        if (!hasCacheEntry) {
          return await this._fetchAndMerge(sid, tableName, forceRefresh);
        } else {
          // If we have cache, return it but kick off a background refresh
          void this._fetchAndMerge(sid, tableName, forceRefresh);
        }
      }
    }

    return cached || [];
  }

  /** Internal helper for cloud-first fetching with delta sync and conflict resolution */
  private async _fetchAndMerge(sid: string, tableName: string, fullRefresh = false): Promise<any[]> {
    if (!canUseRemoteTable(tableName)) {
      return cacheGet(sid, tableName) || [];
    }
    const key = `${cacheKey(sid, tableName)}:${fullRefresh ? 'full' : 'delta'}`;
    const existingInflight = inflight.get(key);
    if (existingInflight) return existingInflight;

    // Ensure session is available for online fetch
    const session = await this.waitForSession();
    if (!session) return cacheGet(sid, tableName) || [];

    const rt = getSupabaseTable(tableName);

    const req = (async () => {
      try {
        const local = cacheGet(sid, tableName) || [];
        
        // 1. Delta Sync: Only fetch what changed since our last record
        const lastModified = local.reduce((max: string, r: any) => {
          const ts = r.updatedAt || r.updated_at || '';
          return ts > max ? ts : max;
        }, '');

        let q = this.db.from(rt).select(getRemoteSelectColumns(rt));
        if (!NO_SCHOOL_FILTER.has(rt) && rt !== 'schools') {
          q = applyScope(q, rt, sid);
        } else if (rt === 'schools') {
          q = q.eq('id', sid);
        }

        if (!fullRefresh && lastModified && local.length > 0) {
          q = q.gt('updated_at', lastModified);
        }

        const { data, error } = await q;
        if (error) {
          const missing = parseMissingRemoteColumn(error, rt);
          if (missing?.table === rt) {
            markRemoteColumnDisabled(rt, missing.column);
            inflight.delete(key);
            return this.getAll(sid, tableName, fullRefresh);
          }
          throw error;
        }

        const pendingIds = new Set(
          loadQueueSync()
            .filter(q => q.tableName === tableName)
            .map(q => q.recordId || q.data?.id)
            .filter(Boolean)
        );

        if (!data || data.length === 0) {
          if (fullRefresh) {
            const pendingLocal = local.filter(record => pendingIds.has(record.id));
            cacheSet(sid, tableName, pendingLocal);
            notifyUI(tableName);
            return pendingLocal;
          }
          cacheSet(sid, tableName, local);
          return local;
        }

        const remoteRecords = filterDeleted(sid, tableName, data.map(mapToLocal));
        
        // 2. Conflict Resolution: Use updated_at to merge
        const localMap = new Map(local.map(r => [r.id, r]));
        let changed = false;

        if (fullRefresh) {
          const remoteMap = new Map(remoteRecords.map(r => [r.id, r]));
          const pendingLocalById = new Map(local.filter(record => pendingIds.has(record.id)).map(record => [record.id, record]));
          const mergedRemote = remoteRecords.map(record => pendingLocalById.get(record.id) || record);
          const pendingOnlyLocal = Array.from(pendingLocalById.values()).filter(record => !remoteMap.has(record.id));
          const final = [...mergedRemote, ...pendingOnlyLocal];
          const beforeIds = local.map(record => record.id).sort().join('|');
          const afterIds = final.map(record => record.id).sort().join('|');
          const beforeTs = local.map(record => `${record.id}:${record.updatedAt || record.updated_at || record.createdAt || ''}`).sort().join('|');
          const afterTs = final.map(record => `${record.id}:${record.updatedAt || record.updated_at || record.createdAt || ''}`).sort().join('|');
          if (beforeIds !== afterIds || beforeTs !== afterTs) {
            cacheSet(sid, tableName, final);
            notifyUI(tableName);
          }
          return final;
        }

        for (const remote of remoteRecords) {
          // Never overwrite pending local changes
          if (pendingIds.has(remote.id)) continue;

          const existing = localMap.get(remote.id);
          if (!existing) {
            localMap.set(remote.id, remote);
            changed = true;
          } else {
            const remoteTs = new Date(remote.updatedAt || 0).getTime();
            const localTs = new Date(existing.updatedAt || 0).getTime();
            if (remoteTs > localTs) {
              localMap.set(remote.id, remote);
              changed = true;
            }
          }
        }

        if (changed) {
          const final = Array.from(localMap.values());
          cacheSet(sid, tableName, final);
          notifyUI(tableName);
          return final;
        }

        return local;
      } catch (e: any) {
        notifyCloudProblem(e);
        console.warn(`[cloud-fetch] ${rt}:`, e.message);
        return cacheGet(sid, tableName) || [];
      } finally {
        inflight.delete(key);
      }
    })();

    inflight.set(key, req);
    return req;
  }

  async get(userId: string, tableName: string, id: string): Promise<any | null> {
    const sid = this.sid(userId);
    // Check cache first (works offline)
    const cached = cacheGet(sid, tableName);
    if (cached) {
      const found = cached.find(r => r.id === id);
      if (found) return found;
    }
    if (!isCloudSyncEnabled() || !isOnline() || !this.ok) return null;
    if (!canUseRemoteTable(tableName)) return null;
    const rt = getSupabaseTable(tableName);
    try {
      let q = this.db.from(rt).select('*').eq('id', id);
      // Only apply school filter if it's not a special table
      if (!NO_SCHOOL_FILTER.has(rt) && rt !== 'schools') {
        q = applyScope(q, rt, sid);
      } else if (rt === 'schools') {
        q = q.eq('id', sid);
      }
      
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
    const searchFields = [...fields];
    if (tableName === 'students') searchFields.push('firstName', 'lastName', 'studentId', 'admissionNo');
    if (tableName === 'staff') searchFields.push('firstName', 'lastName', 'employeeId', 'id');
    return all.filter(item => matchesTextSearch(searchFields.map(f => item[f]), query));
  }

  async where(userId: string, tableName: string, fieldName: string, value: any) {
    const sid = this.sid(userId);
    // Always check cache first — works offline and is instant
    const cached = cacheGet(sid, tableName) || [];
    if (cached.length > 0 || !canUseRemoteTable(tableName) || !isCloudSyncEnabled() || !isOnline() || !this.ok) {
      return cached.filter((item: any) => item[fieldName] === value || item[camelToSnake(fieldName)] === value);
    }
    const rt = getSupabaseTable(tableName);
    const col = fieldName === 'schoolId' ? 'school_id' : camelToSnake(fieldName);
    try {
      let q = this.db.from(rt).select('*').eq(col, value);
      // Only apply school filter if it's not a special table
      if (!NO_SCHOOL_FILTER.has(rt) && rt !== 'schools') {
        q = applyScope(q, rt, sid);
      } else if (rt === 'schools') {
        q = q.eq('id', sid);
      }
      
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

  async create(userId: string, tableName: string, data: any): Promise<SyncResult> {
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
    if (!isCloudSyncEnabled()) {
      return { success: true, syncedRemotely: false, savedLocally: true, record };
    }

    if (!canUseRemoteTable(tableName)) {
      return { success: true, syncedRemotely: false, savedLocally: true, record };
    }

    if (!isOnline() || !this.ok) {
      enqueue({ op: 'create', userId, tableName, data: record });
      return { success: true, syncedRemotely: false, savedLocally: true, record };
    }

    // Ensure session is available before attempting to push
    const session = await this.waitForSession();
    if (!session) {
      console.warn('[create] Skipping remote write: No authenticated session');
      enqueue({ op: 'create', userId, tableName, data: record });
      return { success: true, syncedRemotely: false, savedLocally: true, record };
    }

    const rt = getSupabaseTable(tableName);
    const payload = toRemote(record, rt, sid);
    try {
      // 1. Attempt upsert
      const { error: upsertError } = await this.db.from(rt).upsert(payload, { onConflict: 'id' });
      
      if (upsertError) {
        console.error(`[create] ${rt} upsert failed:`, upsertError.code, upsertError.message);
        enqueue({ op: 'create', userId, tableName, data: record });
        return { success: true, syncedRemotely: false, savedLocally: true, record };
      }

      // 2. Attempt select to get the final server state (with triggers/defaults)
      const { data: remoteData } = await applyScope(this.db.from(rt).select('*').eq('id', id), rt, sid).maybeSingle();
      
      const finalRecord = remoteData ? mapToLocal(remoteData) : record;
      
      // Update cache with the best available record
      cacheApplyCreate(sid, tableName, finalRecord);
      notifyUI(tableName);
      
      return { success: true, syncedRemotely: true, savedLocally: true, record: finalRecord };
    } catch (e: any) {
      notifyCloudProblem(e);
      enqueue({ op: 'create', userId, tableName, data: record });
      return { success: true, syncedRemotely: false, savedLocally: true, record };
    }
  }

  async update(userId: string, tableName: string, id: string, data: Partial<any>): Promise<SyncResult> {
    const sid = this.sid(userId);
    const record = { ...data, updatedAt: new Date().toISOString() };

    // Optimistic cache update
    const appliedOptimisticUpdate = cacheApplyUpdate(sid, tableName, id, record);
    notifyUI(tableName, { forceRefresh: !appliedOptimisticUpdate });

    if (!isCloudSyncEnabled()) {
      return { success: true, syncedRemotely: false, savedLocally: true, record };
    }

    if (!canUseRemoteTable(tableName)) {
      return { success: true, syncedRemotely: false, savedLocally: true, record };
    }

    if (!isOnline() || !this.ok) {
      enqueue({ op: 'update', userId, tableName, recordId: id, data: record });
      return { success: true, syncedRemotely: false, savedLocally: true, record };
    }

    // Ensure session is available before attempting to push
    const session = await this.waitForSession();
    if (!session) {
      console.warn('[update] Skipping remote write: No authenticated session');
      enqueue({ op: 'update', userId, tableName, recordId: id, data: record });
      return { success: true, syncedRemotely: false, savedLocally: true, record };
    }

    const rt = getSupabaseTable(tableName);
    const payload = toRemote(record, rt, sid);
    delete payload.id;
    delete payload.created_at;
    try {
      // 1. Attempt update
      const { error: updateError } = await applyScope(this.db.from(rt).update(payload).eq('id', id), rt, sid);
      
      if (updateError) {
        console.error(`[update] ${rt} failed:`, updateError.code, updateError.message);
        enqueue({ op: 'update', userId, tableName, recordId: id, data: record });
        return { success: true, syncedRemotely: false, savedLocally: true, record };
      }

      // 2. Attempt select
      const { data: remoteData } = await applyScope(this.db.from(rt).select('*').eq('id', id), rt, sid).maybeSingle();
      const finalRecord = remoteData ? mapToLocal(remoteData) : { ...record, id };

      // Update cache
      const appliedRemoteUpdate = cacheApplyUpdate(sid, tableName, id, finalRecord);
      notifyUI(tableName, { forceRefresh: !appliedRemoteUpdate });

      return { success: true, syncedRemotely: true, savedLocally: true, record: finalRecord };
    } catch (e: any) {
      notifyCloudProblem(e);
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

    if (!isCloudSyncEnabled()) {
      return { success: true, syncedRemotely: false, savedLocally: true };
    }

    if (!canUseRemoteTable(tableName)) {
      return { success: true, syncedRemotely: false, savedLocally: true };
    }

    if (!isOnline() || !this.ok) {
      enqueue({ op: 'delete', userId, tableName, recordId: id });
      return { success: true, syncedRemotely: false, savedLocally: true };
    }

    // Ensure session is available before attempting to push
    const session = await this.waitForSession();
    if (!session) {
      console.warn('[delete] Skipping remote write: No authenticated session');
      enqueue({ op: 'delete', userId, tableName, recordId: id });
      return { success: true, syncedRemotely: false, savedLocally: true };
    }

    const rt = getSupabaseTable(tableName);
    try {
      const { error } = await applyScope(this.db.from(rt).delete().eq('id', id), rt, sid);
      if (error) {
        enqueue({ op: 'delete', userId, tableName, recordId: id });
        return { success: true, syncedRemotely: false, savedLocally: true };
      }
      return { success: true, syncedRemotely: true, savedLocally: true };
    } catch (e: any) {
      notifyCloudProblem(e);
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
    for (const id of ids) {
      void deleteFromDesktopDB(sid, tableName, id);
    }
    notifyUI(tableName);

    if (!isCloudSyncEnabled()) {
      return { success: true, syncedRemotely: false, savedLocally: true };
    }

    if (!canUseRemoteTable(tableName)) {
      return { success: true, syncedRemotely: false, savedLocally: true };
    }

    if (!isOnline() || !this.ok) {
      // Queue each delete individually
      for (const id of ids) {
        enqueue({ op: 'delete', userId, tableName, recordId: id });
      }
      return { success: true, syncedRemotely: false, savedLocally: true };
    }

    // Ensure session is available before attempting to push
    const session = await this.waitForSession();
    if (!session) {
      console.warn('[batchDelete] Skipping remote write: No authenticated session');
      for (const id of ids) enqueue({ op: 'delete', userId, tableName, recordId: id });
      return { success: true, syncedRemotely: false, savedLocally: true };
    }

    const rt = getSupabaseTable(tableName);
    try {
      const { error } = await applyScope(this.db.from(rt).delete().in('id', ids), rt, sid);
      if (error) {
        for (const id of ids) enqueue({ op: 'delete', userId, tableName, recordId: id });
        return { success: true, syncedRemotely: false, savedLocally: true };
      }
      return { success: true, syncedRemotely: true, savedLocally: true };
    } catch (e: any) {
      notifyCloudProblem(e);
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

    if (!isCloudSyncEnabled()) {
      return { success: true, syncedRemotely: false, savedLocally: true };
    }

    if (!isOnline() || !this.ok) {
      enqueue({ op: 'saveSettings', userId, tableName: 'settings', settings });
      return { success: true, syncedRemotely: false, savedLocally: true };
    }

    // Ensure session is available before attempting to push
    const session = await this.waitForSession();
    if (!session) {
      console.warn('[saveSettings] Skipping remote write: No authenticated session');
      enqueue({ op: 'saveSettings', userId, tableName: 'settings', settings });
      return { success: true, syncedRemotely: false, savedLocally: true };
    }

    try {
      // BATCH UPSERT: Send all settings in a single API call to save limits
      const payloads = Object.entries(settings).map(([key, value]) => ({
        school_id: sid,
        key,
        value,
        updated_at: now,
        created_at: now
      }));

      const { data, error } = await this.db.from('settings').upsert(
        payloads,
        { onConflict: 'school_id,key' }
      ).select();

      if (error) throw error;
      
      if (data && data.length > 0) {
        const results = data.map(mapToLocal);
        const current = cacheGet(sid, 'settings') || [];
        const merged = [...current];
        for (const res of results) {
          const idx = merged.findIndex(s => s.key === res.key);
          if (idx >= 0) merged[idx] = res;
          else merged.push(res);
        }
        cacheSet(sid, 'settings', merged);
        notifyUI('settings');
      }

      if (settings.schoolName) {
        await this.db.from('schools').upsert(
          { id: sid, name: settings.schoolName, updated_at: now },
          { onConflict: 'id' }
        );
      }
      return { success: true, syncedRemotely: true, savedLocally: true };
    } catch (e: any) {
      notifyCloudProblem(e);
      enqueue({ op: 'saveSettings', userId, tableName: 'settings', settings });
      return { success: true, syncedRemotely: false, savedLocally: true };
    }
  }

  // ── Sync Control ──────────────────────────────────────────────────────────
  
  /**
   * Performs the automatic sync cycle.
   * Automatic sync is push-first to protect Supabase free-tier limits:
   * queued local writes are flushed, while broad table pulls are manual/on-demand.
   */
  async syncNow(schoolId: string): Promise<{ success: boolean; pushed: number; pulled: number; failed: number; error?: string }> {
    if (!isCloudSyncEnabled() || !isOnline() || !this.ok) {
      return { success: false, pushed: 0, pulled: 0, failed: 0, error: 'Offline or cloud space is not configured' };
    }

    try {
      const sid = schoolId;
      console.log(`[Sync] Starting automatic push sync for ${sid}...`);

      // 1. Flush Queue
      const initialQueue = await loadQueue();
      await this.flushOfflineQueue();
      const finalQueue = await loadQueue();
      const pushed = initialQueue.length - finalQueue.length;
      const failed = finalQueue.length;

      const pulled = 0;
      console.log(`[Sync] Finished: pushed ${pushed}, pulled ${pulled}, failed ${failed}`);
      return { success: true, pushed, pulled, failed };
    } catch (e: any) {
      console.error('[Sync] Automatic sync failed:', e.message);
      return { success: false, pushed: 0, pulled: 0, failed: 0, error: e.message };
    }
  }

  async forcePush(schoolId: string): Promise<{ success: boolean; pushed: number; failed: number; error?: string }> {
    if (!isCloudSyncEnabled() || !isOnline() || !this.ok) return { success: false, pushed: 0, failed: 0, error: 'Cloud sync disabled or offline' };
    
    try {
      console.log(`[Sync] Starting deep force push for ${schoolId}...`);
      await cacheReady; // Ensure local data is loaded from IndexedDB first
      
      // 1. Ensure school exists and flush existing queue first
      await this.ensureSchoolExists(schoolId);
      await this.flushOfflineQueue();

      // 2. Push only records from the active school's cache namespace.
      // Never rewrite tenant ownership during sync.
      let pushedCount = 0;
      let failedCount = 0;

      for (const tableName of ALL_SYNC_TABLES) {
        if (!canUseRemoteTable(tableName)) continue;
        const allLocalRecords: any[] = [];
        for (const [key, entry] of memCache.entries()) {
          const [_, table] = key.split(':');
          if (!key.startsWith(`${schoolId}:`)) continue;
          if (table === tableName && entry.data && entry.data.length > 0) {
            allLocalRecords.push(
              ...entry.data.filter(record => recordBelongsToSchool(record, schoolId, tableName))
            );
          }
        }

        // Deduplicate by ID
        const uniqueRecords = Array.from(new Map(allLocalRecords.map(r => [r.id, r])).values());

        if (uniqueRecords.length === 0) {
          continue;
        }

        const rt = getSupabaseTable(tableName);
        console.log(`[Sync] Pushing ${uniqueRecords.length} unique records for ${rt}...`);
        
        // Chunk records to avoid large payloads
        const chunkSize = 50;
        for (let i = 0; i < uniqueRecords.length; i += chunkSize) {
          const chunk = uniqueRecords.slice(i, i + chunkSize);
          const payloads = chunk.map(r => toRemote(r, rt, schoolId));

          const { error } = await this.db.from(rt).upsert(payloads, { onConflict: 'id' });
          if (error) {
            console.error(`[forcePush] Failed to push ${rt} chunk:`, error.message, error.details);
            failedCount += chunk.length;
          } else {
            pushedCount += chunk.length;
          }
        }
      }

      console.log(`[Sync] Deep force push finished: pushed ${pushedCount}, failed ${failedCount}`);
      return { success: true, pushed: pushedCount, failed: failedCount };
    } catch (e: any) {
      console.error('[Sync] Deep force push failed:', e.message);
      return { success: false, pushed: 0, failed: 0, error: e.message };
    }
  }

  async forcePull(schoolId: string, fullRefresh = false): Promise<{ success: boolean; pulled: number; failed: number; error?: string }> {
    if (!isCloudSyncEnabled() || !isOnline() || !this.ok) return { success: false, pulled: 0, failed: 0, error: 'Cloud sync disabled or offline' };
    
    let pulled = 0;
    let failed = 0;
    
    const results = await Promise.allSettled(ALL_SYNC_TABLES.map(async (t) => {
      if (!canUseRemoteTable(t)) return;
      const records = await this._fetchAndMerge(schoolId, t, fullRefresh);
      pulled += records.length;
    }));

    failed = results.filter(result => result.status === 'rejected').length;
    return { success: failed === 0, pulled, failed };
  }

  async getSyncStatus(schoolId: string): Promise<SyncHealthStatus> {
    const queue = await loadQueue();
    const entry = memCache.get(cacheKey(schoolId, 'students')); // Use students as a proxy for last sync
    
    return {
      schoolId,
      pendingSyncItems: queue.length,
      lastSyncAt: entry ? new Date(entry.ts).toISOString() : null,
      lastError: null,
      online: isOnline(),
      configured: this.ok,
      missingTables: []
    };
  }
  async cleanupDuplicates(_: string) { return {}; }
  async clear(_u: string, _t: string) {}

  /** Ensures the school record exists in Supabase so foreign keys don't fail */
  private async ensureSchoolExists(sid: string): Promise<void> {
    if (!isCloudSyncEnabled() || !isOnline() || !this.ok) return;
    try {
      const { data } = await this.db.from('schools').select('id').eq('id', sid).single();
      if (!data) {
        console.log(`[Sync] Creating missing school record for ${sid}`);
        await this.db.from('schools').upsert({
          id: sid,
          name: 'My School', // Placeholder name
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' });
      }
    } catch (e) {
      // If .single() fails it might just be missing
      try {
        await this.db.from('schools').upsert({
          id: sid,
          name: 'My School',
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' });
      } catch { /* ignore */ }
    }
  }

  // ── Offline queue flush with exponential backoff ─────────────────────────
  async flushOfflineQueue(): Promise<void> {
    if (!isCloudSyncEnabled() || !isOnline() || !this.ok) return;
    if (this._syncInProgress) {
      console.log('[offline] Sync already in progress, skipping');
      return;
    }

    // Rate limiting: prevent flushing too frequently
    const now = Date.now();
    if (now - this._lastSyncAttempt < this._backoffDelay) {
      return;
    }
    this._lastSyncAttempt = now;

    // Ensure session is available before attempting to push
    const session = await this.waitForSession();
    if (!session) {
      console.warn('[offline] Skipping flush: No authenticated session');
      return;
    }

    // Load from IDB (primary) — falls back to localStorage automatically
    const queue = await loadQueue() as QueueItem[];
    if (queue.length === 0) {
      this._backoffDelay = 1000; // Reset backoff on empty queue
      return;
    }

    this._syncInProgress = true;
    console.log(`[offline] Flushing ${queue.length} queued operations`);

    const MAX_RETRIES = 3;

    // Errors that will never succeed on retry — discard immediately
    const isUnrecoverable = (msg: string) =>
      msg.includes('violates not-null constraint') ||
      msg.includes('violates foreign key constraint') ||
      msg.includes('duplicate key value') ||
      msg.includes('invalid input syntax') ||
      msg.includes('column') && msg.includes('does not exist') ||
      msg.includes('401') || msg.includes('Unauthorized');

    try {
      // Deduplicate queue: only process the LATEST operation for each record
      // to save API calls and prevent race conditions.
      const dedupedQueue = this._deduplicateQueue(queue);

      for (const item of dedupedQueue) {
        if (!canUseRemoteTable(item.tableName)) {
          dequeue(item.id);
          continue;
        }

        let succeeded = false;
        let unrecoverable = false;

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
          if (attempt > 0) {
            await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
          }
          try {
            const sid = this.sid(item.userId);
            const rt = getSupabaseTable(item.tableName);
            
            if (item.op === 'create' && item.data) {
              const payload = toRemote(item.data, rt, sid);
              const { error: upsertError } = await this.db.from(rt).upsert(payload, { onConflict: 'id' });
              if (upsertError) throw upsertError;
              
              const { data: remoteData } = await applyScope(this.db.from(rt).select('*').eq('id', item.data.id), rt, sid).maybeSingle();
              if (remoteData) {
                cacheApplyCreate(sid, item.tableName, mapToLocal(remoteData));
              }
            } else if (item.op === 'update' && item.recordId && item.data) {
              const payload = toRemote(item.data, rt, sid);
              delete payload.id; delete payload.created_at;
              const { error: updateError } = await applyScope(this.db.from(rt).update(payload).eq('id', item.recordId), rt, sid);
              if (updateError) throw updateError;
              
              const { data: remoteData } = await applyScope(this.db.from(rt).select('*').eq('id', item.recordId), rt, sid).maybeSingle();
              if (remoteData) {
                cacheApplyUpdate(sid, item.tableName, item.recordId, mapToLocal(remoteData));
              }
            } else if (item.op === 'delete' && item.recordId) {
              const { error } = await applyScope(this.db.from(rt).delete().eq('id', item.recordId), rt, sid);
              if (error) throw error;
            } else if (item.op === 'saveSettings' && item.settings) {
              for (const [key, value] of Object.entries(item.settings)) {
                const { error } = await this.db.from('settings').upsert(
                  { school_id: sid, key, value, updated_at: new Date().toISOString() },
                  { onConflict: 'school_id,key' }
                );
                if (error) throw error;
              }
              if (item.settings.schoolName) {
                await this.db.from('schools').upsert({ id: sid, name: item.settings.schoolName }, { onConflict: 'id' });
              }
            }
            succeeded = true;
            break;
          } catch (e: any) {
            const msg = e.message || '';
            const missing = parseMissingRemoteColumn(e, getSupabaseTable(item.tableName));
            if (missing?.table === getSupabaseTable(item.tableName)) {
              markRemoteColumnDisabled(missing.table, missing.column);
              console.warn(`[offline] Remote schema is missing ${missing.table}.${missing.column}; retrying ${item.op} without that column.`);
              continue;
            }
            if (isUnrecoverable(msg)) {
              unrecoverable = true;
              deadLetter(item, msg);
              console.warn(`[offline] Sync item moved to failed review ${item.op} on ${item.tableName}:`, msg);
              break;
            }
            console.warn(`[offline] Attempt ${attempt + 1} failed for ${item.op} on ${item.tableName}:`, msg);
          }
        }

        if (succeeded || unrecoverable) {
          dequeue(item.id);
          // If we had many failures before, slowly decrease backoff on success
          this._backoffDelay = Math.max(1000, this._backoffDelay - 1000);
        } else {
          // Increase backoff on persistent failure
          this._backoffDelay = Math.min(this._backoffDelay * 2, 60000);
          console.error(`[offline] Will retry later: ${item.op} on ${item.tableName}`);
          break; // Stop processing queue if we hit a persistent error
        }
      }
    } finally {
      this._syncInProgress = false;
      const tables = [...new Set(queue.map(i => i.tableName))];
      tables.forEach(t => notifyUI(t));
    }
  }

  private _deduplicateQueue(queue: QueueItem[]): QueueItem[] {
    const latestOps = new Map<string, QueueItem>();
    
    for (const item of queue) {
      const key = item.recordId || item.data?.id || `settings-${item.userId}`;
      if (!key) {
        latestOps.set(`op-${item.id}`, item);
        continue;
      }
      
      const existing = latestOps.get(key);
      if (!existing) {
        latestOps.set(key, item);
      } else {
        // Create always wins over subsequent updates
        if (existing.op === 'create' && item.op === 'update') {
          existing.data = { ...existing.data, ...item.data };
        } 
        // Delete cancels everything before it
        else if (item.op === 'delete') {
          latestOps.set(key, item);
        }
        // Latest operation wins for same types
        else {
          latestOps.set(key, item);
        }
      }
    }
    
    return Array.from(latestOps.values()).sort((a, b) => a.ts - b.ts);
  }
}

export const dataService = new SupabaseDataService();
