/**
 * SupabaseDataService — queries Supabase directly, no IndexedDB, no sync queue.
 */
import { supabase, isSupabaseConfigured } from '../supabase';
import { generateUUID } from '../../utils/uuid';
import { getQueryClient } from '../queryClient';
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
  return query.or(`school_id.eq.${sid},school_id.is.null`);
}

function recycleBinType(t: string): string | null {
  return ({ students:'student', staff:'staff', announcements:'announcement',
    classes:'class', subjects:'subject', fees:'fee', exams:'exam',
    transportRoutes:'transport' } as any)[t] || null;
}

// ── In-memory cache ───────────────────────────────────────────────────────────
const CACHE_TTL = 60_000; // 1 minute
interface CacheEntry { data: any[]; ts: number; }
const memCache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<any[]>>();

function cacheKey(sid: string, table: string) { return `${sid}:${table}`; }

function cacheGet(sid: string, table: string): any[] | null {
  const e = memCache.get(cacheKey(sid, table));
  if (!e) return null;
  if (Date.now() - e.ts > CACHE_TTL) { memCache.delete(cacheKey(sid, table)); return null; }
  return e.data;
}

function cacheSet(sid: string, table: string, data: any[]) {
  memCache.set(cacheKey(sid, table), { data, ts: Date.now() });
}

function cacheDel(sid: string, table: string) {
  memCache.delete(cacheKey(sid, table));
}

function notifyUI(table: string) {
  const detail = { table };
  window.dispatchEvent(new CustomEvent(`${table}Updated`, { detail }));
  window.dispatchEvent(new CustomEvent('schofyDataRefresh', { detail }));
  window.dispatchEvent(new CustomEvent('dataRefresh', { detail }));
  // Invalidate store so all useTableData hooks re-render immediately
  const sid = localStorage.getItem('schofy_current_school_id') || '';
  if (sid) {
    import('./store').then(({ store }) => store.onRemoteChange(sid, table)).catch(() => {});
  }
  try {
    const qc = getQueryClient();
    void qc.invalidateQueries({ predicate: q => String(q.queryKey[0] ?? '').includes(table) });
  } catch { /* ignore */ }
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
    localStorage.setItem('schofy_current_school_id', schoolId || userId);
  }

  startRealtimeSync(_: string) {}
  restartRealtimeSync(_: string) {}
  stopRealtimeSync() {}

  // ── reads ─────────────────────────────────────────────────────────────────

  async getAll(userId: string, tableName: string): Promise<any[]> {
    if (!this.ok) return [];
    const sid = this.sid(userId);
    const rt = getSupabaseTable(tableName);

    // Return cached data immediately
    const cached = cacheGet(sid, tableName);
    if (cached) return cached;

    // Deduplicate concurrent requests for the same table
    const key = cacheKey(sid, tableName);
    const existing = inflight.get(key);
    if (existing) return existing;

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

  async get(userId: string, tableName: string, id: string): Promise<any | null> {
    if (!this.ok) return null;
    const sid = this.sid(userId);
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
    if (!this.ok) return [];
    const sid = this.sid(userId);
    const rt = getSupabaseTable(tableName);
    const col = fieldName === 'schoolId' ? 'school_id' : camelToSnake(fieldName);
    try {
      let q = this.db.from(rt).select('*').eq(col, value);
      q = applyScope(q, rt, sid);
      const { data, error } = await q;
      if (error) return [];
      return (data || []).map(mapToLocal);
    } catch { return []; }
  }

  // ── writes ────────────────────────────────────────────────────────────────

  async create<T extends { id?: string }>(userId: string, tableName: string, data: any): Promise<SyncResult> {
    if (!this.ok) return { success: false, syncedRemotely: false, savedLocally: false, error: 'Supabase not configured.' };
    const sid = this.sid(userId);
    const rt = getSupabaseTable(tableName);
    const now = new Date().toISOString();
    const id = isUUID(data.id) ? data.id : generateUUID();
    const record = { ...data, id, schoolId: data.schoolId || sid, createdAt: now, updatedAt: now };
    const payload = toRemote(record, rt);
    console.log(`[create] ${rt}`, payload);
    try {
      const { error } = await this.db.from(rt).upsert(payload, { onConflict: 'id' });
      if (error) {
        console.error(`[create] ${rt}:`, error.code, error.message, error.details, error.hint);
        return { success: false, syncedRemotely: false, savedLocally: false, error: `${error.message} — ${error.details}` };
      }
      cacheDel(sid, tableName);
      notifyUI(tableName);
      return { success: true, syncedRemotely: true, savedLocally: true, record };
    } catch (e: any) {
      console.error(`[create] ${rt} exception:`, e);
      return { success: false, syncedRemotely: false, savedLocally: false, error: e.message };
    }
  }

  async update<T>(userId: string, tableName: string, id: string, data: Partial<T>): Promise<SyncResult> {
    if (!this.ok) return { success: false, syncedRemotely: false, savedLocally: false, error: 'Supabase not configured.' };
    const sid = this.sid(userId);
    const rt = getSupabaseTable(tableName);
    const record = { ...data, updatedAt: new Date().toISOString() };
    const payload = toRemote(record, rt);
    delete payload.id;
    delete payload.created_at;
    console.log(`[update] ${rt}/${id}`, payload);
    try {
      const { error } = await this.db.from(rt).update(payload).eq('id', id);
      if (error) {
        console.error(`[update] ${rt}:`, error.code, error.message, error.details, error.hint);
        return { success: false, syncedRemotely: false, savedLocally: false, error: `${error.message} — ${error.details}` };
      }
      cacheDel(sid, tableName);
      notifyUI(tableName);
      return { success: true, syncedRemotely: true, savedLocally: true, record };
    } catch (e: any) {
      console.error(`[update] ${rt} exception:`, e);
      return { success: false, syncedRemotely: false, savedLocally: false, error: e.message };
    }
  }

  async delete(userId: string, tableName: string, id: string): Promise<SyncResult> {
    if (!this.ok) return { success: false, syncedRemotely: false, savedLocally: false, error: 'Supabase not configured.' };
    const sid = this.sid(userId);
    const rt = getSupabaseTable(tableName);
    try {
      const record = await this.get(userId, tableName, id);
      const rtype = recycleBinType(tableName);
      if (record && rtype) {
        addToRecycleBin(sid, {
          id: `recycle-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: rtype as any,
          name: record.name || `${record.firstName || ''} ${record.lastName || ''}`.trim() || 'Unknown',
          data: record, deletedAt: new Date().toISOString(),
        });
      }
      const { error } = await this.db.from(rt).delete().eq('id', id);
      if (error) {
        console.error(`[delete] ${rt}:`, error.message);
        return { success: false, syncedRemotely: false, savedLocally: false, error: error.message };
      }
      cacheDel(sid, tableName);
      notifyUI(tableName);
      return { success: true, syncedRemotely: true, savedLocally: true };
    } catch (e: any) {
      return { success: false, syncedRemotely: false, savedLocally: false, error: e.message };
    }
  }

  async batchDelete(userId: string, tableName: string, ids: string[]): Promise<SyncResult> {
    if (!this.ok) return { success: false, syncedRemotely: false, savedLocally: false, error: 'Supabase not configured.' };
    const rt = getSupabaseTable(tableName);
    try {
      const { error } = await this.db.from(rt).delete().in('id', ids);
      if (error) return { success: false, syncedRemotely: false, savedLocally: false, error: error.message };
      cacheDel(this.sid(userId), tableName);
      notifyUI(tableName);
      return { success: true, syncedRemotely: true, savedLocally: true };
    } catch (e: any) {
      return { success: false, syncedRemotely: false, savedLocally: false, error: e.message };
    }
  }

  async saveSettings(userId: string, settings: Record<string, any>): Promise<SyncResult> {
    if (!this.ok) return { success: false, syncedRemotely: false, savedLocally: false, error: 'Supabase not configured.' };
    const sid = this.sid(userId);
    const now = new Date().toISOString();
    try {
      for (const [key, value] of Object.entries(settings)) {
        await this.db.from('settings').upsert(
          { school_id: sid, key, value, updated_at: now, created_at: now },
          { onConflict: 'school_id,key' }
        );
      }
      cacheDel(sid, 'settings');
      notifyUI('settings');
      return { success: true, syncedRemotely: true, savedLocally: true };
    } catch (e: any) {
      return { success: false, syncedRemotely: false, savedLocally: false, error: e.message };
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
}

export const dataService = new SupabaseDataService();
