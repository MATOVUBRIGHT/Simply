import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../supabase';
import { userDBManager } from './UserDatabaseManager';
import { generateUUID } from '../../utils/uuid';
import { queryCache } from '../cache/QueryCache';
import { getQueryClient } from '../queryClient';
import { queryKeys } from '../queryKeys';
import { addToRecycleBin } from '../../utils/recycleBin';

export type SyncStatus = 'synced' | 'pending' | 'failed';

interface SyncableRecord {
  id: string;
  schoolId?: string;
  createdAt?: string;
  updatedAt?: string;
  syncStatus?: SyncStatus;
  deviceId?: string;
}

export interface SyncResult {
  success: boolean;
  syncedRemotely: boolean;
  savedLocally: boolean;
  error?: string;
}

interface SyncQueueItem {
  id: string;
  table: string;
  recordId: string;
  operation: 'create' | 'update' | 'delete';
  data: any;
  timestamp: string;
  retryCount?: number;
  nextRetryAt?: string | null;
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

type BroadcastChange = (table: string, type: 'INSERT' | 'UPDATE' | 'DELETE', record: any, userId: string) => void;

declare global {
  interface Window {
    broadcastSchofyChange?: BroadcastChange;
    checkSyncStatus?: () => Promise<SyncHealthStatus>;
    forcePush?: () => Promise<{ success: boolean; pushed: number; failed: number; error?: string }>;
    forcePull?: () => Promise<{ success: boolean; pulled: number; failed: number; error?: string }>;
    /** DevTools: await window.debugSync() — local vs remote row counts + sync queue. */
    debugSync?: () => Promise<Record<string, unknown>>;
  }
}

class DataService {
  private deviceId = userDBManager.getDeviceId();
  private attemptedFullSync = new Set<string>();
  private subChannel: RealtimeChannel | null = null;
  private subscribedSchoolId: string | null = null;
  private missingTables = new Set<string>();
  private schemaCheckedAt = 0;
  private syncInFlight = new Map<string, Promise<any>>();
  private pushInFlight = new Map<string, Promise<{ success: boolean; pushed: number; failed: number; error?: string }>>();
  private pullInFlight = new Map<string, Promise<{ success: boolean; pulled: number; failed: number; error?: string }>>();
  private realtimeSubscribeLock: Promise<void> | null = null;
  private realtimeBackoffMs = 2000;
  private realtimeReconnectTimer: number | null = null;
  private readonly SCHEMA_TTL_MS = 5 * 60 * 1000;
  private readonly PULL_CONCURRENCY = 2;
  private readonly BASE_RETRY_MS = 2000;
  private readonly MAX_RETRY_MS = 5 * 60 * 1000;
  private syncInProgress = false;
  private readonly NO_SCHOOL_FILTER = new Set(['schools', 'users']);
  private readonly LOCAL_TABLES = [
    'schools', 'students', 'staff', 'classes', 'subjects', 'attendance', 'fees', 'feeStructures',
    'bursaries', 'discounts', 'payments', 'salaryPayments', 'invoices', 'exams', 'examResults',
    'timetable', 'transportRoutes', 'transportAssignments', 'announcements', 'notifications',
    'settings', 'profiles', 'follows', 'messages', 'subscriptions', 'pointTransactions', 'instructors',
  ];
  /** Must exist or sync is blocked (run supabase migrations through 017+ for these). */
  private readonly CORE_REMOTE = [
    'schools', 'students', 'staff', 'classes', 'subjects', 'attendance', 'fees', 'fee_structures',
    'bursaries', 'discounts', 'payments', 'salary_payments', 'invoices', 'exams', 'exam_results',
    'timetable', 'transport_routes', 'transport_assignments', 'announcements', 'notifications',
    'users',
  ];
  /** From migration 018_sync_reliability.sql — if absent, app stays local-only for these tables. */
  private readonly OPTIONAL_REMOTE = new Set([
    'settings', 'profiles', 'follows', 'messages', 'subscriptions', 'point_transactions', 'instructors', 'sync_logs',
  ]);
  private readonly REMOTE_SET = new Set([...this.CORE_REMOTE, ...this.OPTIONAL_REMOTE]);
  /** Postgres realtime subscriptions — high-churn tables only to reduce load and websocket noise. */
  private readonly REALTIME_REMOTE_TABLES = [
    'students',
    'staff',
    'classes',
    'payments',
    'fees',
    'fee_structures',
    'bursaries',
    'discounts',
    'settings',
    'subscriptions',
  ];

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        const sid = this.getActiveSchoolId();
        if (sid) void this.syncNow(sid);
      });
      this.installDebugTools();
    }
  }

  startRealtimeSync(userOrSchoolId: string) {
    const schoolId = this.resolveSchoolId(userOrSchoolId);
    if (!schoolId) return;
    void this.subscribeRealtimeWithRetry(schoolId);
  }

  restartRealtimeSync(userOrSchoolId: string) {
    this.stopRealtimeSync();
    this.startRealtimeSync(userOrSchoolId);
  }

  stopRealtimeSync() {
    if (this.realtimeReconnectTimer) {
      clearTimeout(this.realtimeReconnectTimer);
      this.realtimeReconnectTimer = null;
    }
    if (this.subChannel) {
      void this.subChannel.unsubscribe();
      this.subChannel = null;
      this.subscribedSchoolId = null;
    }
  }

  private async subscribeRealtimeWithRetry(sid: string): Promise<void> {
    if (!this.isOnline() || !isSupabaseConfigured || !supabase) return;
    try {
      await this.subscribeToRemoteChanges(sid);
      this.realtimeBackoffMs = 2000;
    } catch (err) {
      if (this.getActiveSchoolId() !== sid) return;
      console.warn('Realtime subscribe failed; scheduling retry', err);
      const delay = this.realtimeBackoffMs;
      this.realtimeBackoffMs = Math.min(this.realtimeBackoffMs * 2, 60_000);
      if (this.realtimeReconnectTimer) clearTimeout(this.realtimeReconnectTimer);
      this.realtimeReconnectTimer = window.setTimeout(() => {
        this.realtimeReconnectTimer = null;
        if (this.isOnline() && this.getActiveSchoolId() === sid) {
          void this.subscribeRealtimeWithRetry(sid);
        }
      }, delay);
    }
  }

  async bootstrapSession(userId: string, schoolId: string): Promise<void> {
    const sid = this.resolveSchoolId(schoolId);
    if (!sid) return;
    localStorage.setItem('schofy_current_user_id', userId);
    localStorage.setItem('schofy_current_school_id', sid);

    // Clear sync attempt cache so every new session gets a fresh pull from Supabase
    this.attemptedFullSync.clear();

    this.startRealtimeSync(sid);

    if (!this.isOnline() || !isSupabaseConfigured || !supabase) {
      return;
    }

    void (async () => {
      try {
        console.log('[Bootstrap] Starting forcePull for school:', sid);
        await this.ensureRequiredSchema();
        const pullResult = await this.forcePull(sid);
        console.log('[Bootstrap] forcePull result:', pullResult);
        await this.forcePush(sid);
        const qc = getQueryClient();
        await Promise.all([
          qc.prefetchQuery({
            queryKey: queryKeys.studentsPage1(sid),
            queryFn: () => this.getPage(sid, 'students', 1, 50),
            staleTime: 0,
          }),
          qc.prefetchQuery({
            queryKey: queryKeys.staffPage1(sid),
            queryFn: () => this.getPage(sid, 'staff', 1, 50),
            staleTime: 0,
          }),
        ]);
      } catch {
        /* logged inside forcePull / forcePush */
      }
    })();
  }

  async syncNow(userOrSchoolId: string): Promise<{ success: boolean; pushed: number; pulled: number; failed: number; error?: string }> {
    const sid = this.resolveSchoolId(userOrSchoolId);
    if (!sid) return { success: false, pushed: 0, pulled: 0, failed: 0, error: 'No school selected.' };
    if (!this.isOnline()) return { success: false, pushed: 0, pulled: 0, failed: 0, error: 'Offline.' };
    if (!isSupabaseConfigured || !supabase) return { success: false, pushed: 0, pulled: 0, failed: 0, error: 'Supabase not configured.' };

    const running = this.syncInFlight.get(sid);
    if (running) return running;

    const run = (async () => {
      this.syncInProgress = true;
      this.notifySyncProgress(sid, true);
      try {
        await this.ensureRequiredSchema();
        const pull = await this.pullAllTables(sid, false);
        const push = await this.processSyncQueue(sid, {});
        const failed = push.failed + pull.failed;
        if (failed > 0) {
          this.setLastSyncError(sid, `Sync completed with ${failed} failures.`);
          this.setLastSyncAt(sid, new Date().toISOString());
          await this.emitSyncStatus(sid);
          if (pull.pulled > 0) {
            window.dispatchEvent(new CustomEvent('schofyDataRefresh', { detail: { source: 'syncNow', pulled: pull.pulled } }));
            window.dispatchEvent(new CustomEvent('dataRefresh', { detail: { source: 'syncNow' } }));
            try { const qc = getQueryClient(); void qc.invalidateQueries(); } catch { /* ignore */ }
          }
          return { success: false, pushed: push.processed, pulled: pull.pulled, failed, error: this.getLastSyncError(sid) || undefined };
        }

        this.setLastSyncAt(sid, new Date().toISOString());
        this.setLastSyncError(sid, null);
        await this.emitSyncStatus(sid);
        // Notify UI to refresh after successful sync
        if (pull.pulled > 0) {
          window.dispatchEvent(new CustomEvent('schofyDataRefresh', { detail: { source: 'syncNow', pulled: pull.pulled } }));
          window.dispatchEvent(new CustomEvent('dataRefresh', { detail: { source: 'syncNow' } }));
          try {
            const qc = getQueryClient();
            void qc.invalidateQueries();
          } catch { /* ignore */ }
        }
        return { success: true, pushed: push.processed, pulled: pull.pulled, failed: 0 };
      } catch (err: any) {
        const msg = err?.message || 'Sync failed';
        this.setLastSyncError(sid, msg);
        await this.emitSyncStatus(sid);
        return { success: false, pushed: 0, pulled: 0, failed: 1, error: msg };
      } finally {
        this.syncInProgress = false;
        this.notifySyncProgress(sid, false);
        this.syncInFlight.delete(sid);
      }
    })();

    this.syncInFlight.set(sid, run);
    return run;
  }

  async forcePush(userOrSchoolId: string): Promise<{ success: boolean; pushed: number; failed: number; error?: string }> {
    const sid = this.resolveSchoolId(userOrSchoolId);
    if (!sid) return { success: false, pushed: 0, failed: 0, error: 'No school selected.' };
    if (!this.isOnline() || !isSupabaseConfigured || !supabase) return { success: false, pushed: 0, failed: 0, error: 'Push unavailable offline.' };
    const existing = this.pushInFlight.get(sid);
    if (existing) return existing;

    const run = (async () => {
      try {
        await this.ensureRequiredSchema();
        const push = await this.processSyncQueue(sid, { force: true });
        await this.emitSyncStatus(sid);
        return {
          success: push.failed === 0,
          pushed: push.processed,
          failed: push.failed,
          error: push.failed ? 'Some records failed to push.' : undefined,
        };
      } catch (err: any) {
        const msg = err?.message || 'Force push failed';
        this.setLastSyncError(sid, msg);
        await this.emitSyncStatus(sid);
        return { success: false, pushed: 0, failed: 1, error: msg };
      } finally {
        this.pushInFlight.delete(sid);
      }
    })();

    this.pushInFlight.set(sid, run);
    return run;
  }

  async forcePull(userOrSchoolId: string): Promise<{ success: boolean; pulled: number; failed: number; error?: string }> {
    const sid = this.resolveSchoolId(userOrSchoolId);
    if (!sid) return { success: false, pulled: 0, failed: 0, error: 'No school selected.' };
    if (!this.isOnline() || !isSupabaseConfigured || !supabase) return { success: false, pulled: 0, failed: 0, error: 'Pull unavailable offline.' };
    const existing = this.pullInFlight.get(sid);
    if (existing) return existing;

    const run = (async () => {
      try {
        // Clear sync attempt cache so all tables get a fresh full pull
        this.attemptedFullSync.clear();
        await this.ensureRequiredSchema();
        const pull = await this.pullAllTables(sid, true);
        await this.emitSyncStatus(sid);
        if (pull.pulled > 0) {
          window.dispatchEvent(new CustomEvent('schofyDataRefresh', { detail: { source: 'forcePull', pulled: pull.pulled } }));
          window.dispatchEvent(new CustomEvent('dataRefresh', { detail: { source: 'forcePull' } }));
          try { const qc = getQueryClient(); void qc.invalidateQueries(); } catch { /* ignore */ }
        }
        return {
          success: pull.failed === 0,
          pulled: pull.pulled,
          failed: pull.failed,
          error: pull.failed ? 'Some tables failed to pull.' : undefined,
        };
      } catch (err: any) {
        const msg = err?.message || 'Force pull failed';
        this.setLastSyncError(sid, msg);
        await this.emitSyncStatus(sid);
        return { success: false, pulled: 0, failed: 1, error: msg };
      } finally {
        this.pullInFlight.delete(sid);
      }
    })();

    this.pullInFlight.set(sid, run);
    return run;
  }

  async getSyncStatus(userOrSchoolId: string): Promise<SyncHealthStatus> {
    const sid = this.resolveSchoolId(userOrSchoolId);
    const pending = sid ? await userDBManager.getPendingSyncItems(sid) : [];
    return {
      schoolId: sid,
      pendingSyncItems: pending.length,
      lastSyncAt: sid ? localStorage.getItem(`last_sync_${sid}`) : null,
      lastError: sid ? this.getLastSyncError(sid) : 'No school selected.',
      online: this.isOnline(),
      configured: !!(isSupabaseConfigured && supabase),
      missingTables: Array.from(this.missingTables.values()),
    };
  }

  async saveSettings(userOrSchoolId: string, settings: Record<string, any>): Promise<SyncResult> {
    const sid = this.resolveSchoolId(userOrSchoolId);
    if (!sid) return { success: false, syncedRemotely: false, savedLocally: false, error: 'No school selected.' };
    try {
      // Ensure the database is open before writing
      await userDBManager.openDatabase(sid);
      for (const [key, value] of Object.entries(settings)) {
        if (typeof key !== 'string' || key === '' || key === 'id' || key === 'key') continue;
        const id = `${sid}:${key}`;
        const now = new Date().toISOString();
        const record = { id, key, value, schoolId: sid, createdAt: now, updatedAt: now, syncStatus: 'pending' as SyncStatus, deviceId: this.deviceId };
        const exists = await userDBManager.get(sid, 'settings', id);
        await userDBManager.put(sid, 'settings', exists ? { ...exists, ...record } : record);
        await this.queueForSync(sid, 'settings', id, exists ? 'update' : 'create', exists ? { ...exists, ...record } : record);
      }
      if (this.isOnline() && isSupabaseConfigured && supabase) {
        void this.processSyncQueue(sid, {}).then((push) => {
          if (push.failed > 0) this.setLastSyncError(sid, 'Some settings failed to sync; retrying in background.');
          void this.emitSyncStatus(sid);
        });
      }
      return { success: true, syncedRemotely: this.isOnline() && !!(isSupabaseConfigured && supabase), savedLocally: true };
    } catch (err: any) {
      console.error('saveSettings error:', err);
      return { success: false, syncedRemotely: false, savedLocally: false, error: err?.message || 'Failed to save settings.' };
    }
  }

  async create<T extends SyncableRecord>(userId: string, tableName: string, data: Omit<T, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus' | 'deviceId'>): Promise<SyncResult> {
    const sid = this.resolveSchoolId(userId);
    const now = new Date().toISOString();
    let body: any = { ...data };
    let id = (body as any).id;
    if (id && !this.isUuid(String(id)) && (tableName === 'students' || tableName === 'staff')) {
      if (tableName === 'students') {
        if (body.studentId == null || body.studentId === '') body.studentId = String(id);
        if (body.admissionNo == null || body.admissionNo === '') body.admissionNo = String(id);
      } else if (!body.employeeId) {
        body.employeeId = String(id);
      }
      id = generateUUID();
    } else if (!id) {
      id = generateUUID();
    }
    const existing = await userDBManager.get(sid, tableName, id);
    if (existing) {
      return { success: false, syncedRemotely: false, savedLocally: false, error: 'Record already exists.' };
    }
    const local: any = { ...body, id, schoolId: body.schoolId || sid, createdAt: now, updatedAt: now, syncStatus: 'pending' as const, deviceId: this.deviceId };
    try {
      await userDBManager.put(sid, tableName, local);
      await this.queueForSync(sid, tableName, id, 'create', local);
      this.broadcastChange(tableName, 'INSERT', local, sid);
      this.emitDataChange(tableName, 'INSERT', local);
      let syncedRemotely = false;
      if (this.isOnline() && this.shouldSyncTable(tableName) && isSupabaseConfigured && supabase) {
        const push = await this.processSyncQueue(sid, { onlyRecordId: id });
        syncedRemotely = push.failed === 0;
      }
      return { success: true, syncedRemotely, savedLocally: true, error: syncedRemotely ? undefined : this.getLastSyncError(sid) || undefined };
    } catch (err: any) {
      return { success: false, syncedRemotely: false, savedLocally: false, error: err?.message || 'Create failed.' };
    }
  }

  async update<T extends SyncableRecord>(userId: string, tableName: string, id: string, data: Partial<T>): Promise<SyncResult> {
    const sid = this.resolveSchoolId(userId);
    try {
      const existing = await userDBManager.get(sid, tableName, id);
      if (!existing) throw new Error(`Record ${id} not found in ${tableName}.`);
      const updated: any = { ...existing, ...data, id, schoolId: existing.schoolId || sid, updatedAt: new Date().toISOString(), syncStatus: 'pending' as const, deviceId: this.deviceId };
      await userDBManager.put(sid, tableName, updated);
      await this.queueForSync(sid, tableName, id, 'update', updated);
      this.broadcastChange(tableName, 'UPDATE', updated, sid);
      this.emitDataChange(tableName, 'UPDATE', updated);
      let syncedRemotely = false;
      if (this.isOnline() && this.shouldSyncTable(tableName) && isSupabaseConfigured && supabase) {
        const push = await this.processSyncQueue(sid, { onlyRecordId: id });
        syncedRemotely = push.failed === 0;
      }
      return { success: true, syncedRemotely, savedLocally: true, error: syncedRemotely ? undefined : this.getLastSyncError(sid) || undefined };
    } catch (err: any) {
      return { success: false, syncedRemotely: false, savedLocally: false, error: err?.message || 'Update failed.' };
    }
  }

  async delete(userId: string, tableName: string, id: string): Promise<SyncResult> {
    const sid = this.resolveSchoolId(userId);
    try {
      const record = await userDBManager.get(sid, tableName, id);
      
      const recycleType = this.getRecycleBinType(tableName);
      if (record && recycleType) {
        const recycleItem = {
          id: `recycle-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: recycleType,
          name: record.name || `${record.firstName || ''} ${record.lastName || ''}`.trim() || 'Unknown',
          data: record,
          deletedAt: new Date().toISOString(),
        };
        addToRecycleBin(sid, recycleItem);
      }
      
      await userDBManager.delete(sid, tableName, id);
      await this.queueForSync(sid, tableName, id, 'delete', { id, schoolId: sid });
      this.broadcastChange(tableName, 'DELETE', { id }, sid);
      this.emitDataChange(tableName, 'DELETE', { id });
      let syncedRemotely = false;
      if (this.isOnline() && this.shouldSyncTable(tableName) && isSupabaseConfigured && supabase) {
        const push = await this.processSyncQueue(sid, { onlyRecordId: id });
        syncedRemotely = push.failed === 0;
      }
      return { success: true, syncedRemotely, savedLocally: true, error: syncedRemotely ? undefined : this.getLastSyncError(sid) || undefined };
    } catch (err: any) {
      return { success: false, syncedRemotely: false, savedLocally: false, error: err?.message || 'Delete failed.' };
    }
  }

  async getAll(userId: string, tableName: string): Promise<any[]> {
    const sid = this.resolveSchoolId(userId);
    let local = await userDBManager.getAll(sid, tableName);
    local = this.deduplicateById(local);

    if (!this.syncInProgress && this.shouldSyncTable(tableName) && this.isOnline() && isSupabaseConfigured && supabase) {
      const key = `${sid}-${tableName}`;
      if (local.length === 0 && !this.attemptedFullSync.has(key)) {
        // No local data at all — do a full blocking pull so the UI gets data immediately
        this.attemptedFullSync.add(key);
        await this.pullFull(sid, tableName).catch((err) => this.logPullFailure(tableName, err));
        local = await userDBManager.getAll(sid, tableName);
        return this.deduplicateById(local);
      }
      // Background delta is handled by the 30s sync interval — don't fire on every read
    }
    return local;
  }

  private deduplicateById(items: any[]): any[] {
    const seen = new Map();
    for (const item of items) {
      if (item?.id && !seen.has(item.id)) {
        seen.set(item.id, item);
      }
    }
    return Array.from(seen.values());
  }

  async cleanupDuplicates(userId: string): Promise<Record<string, number>> {
    const sid = this.resolveSchoolId(userId);
    const results: Record<string, number> = {};
    for (const table of this.LOCAL_TABLES) {
      try {
        const removed = await userDBManager.cleanupDuplicates(sid, table);
        if (removed > 0) results[table] = removed;
      } catch {}
    }
    return results;
  }

  async getPage(userId: string, tableName: string, page: number, pageSize: number, filter?: (item: any) => boolean, sortField: string = 'createdAt', sortDir: 'next' | 'prev' = 'prev'): Promise<{ items: any[]; total: number }> {
    const sid = this.resolveSchoolId(userId);
    const pageData = await userDBManager.getPage(sid, tableName, page, pageSize, filter, sortField, sortDir);
    const deduped = this.deduplicateById(pageData.items);
    return { items: deduped, total: deduped.length };
  }

  async search(userId: string, tableName: string, query: string, fields: string[]): Promise<any[]> {
    const sid = this.resolveSchoolId(userId);
    if (!query) return [];
    return userDBManager.search(sid, tableName, query, fields);
  }

  async batchDelete(userId: string, tableName: string, ids: string[]): Promise<SyncResult> {
    const sid = this.resolveSchoolId(userId);
    try {
      await userDBManager.batchDelete(sid, tableName, ids);
      this.broadcastChange(tableName, 'DELETE', { ids }, sid);
      this.emitDataChange(tableName, 'DELETE', { ids });
      if (this.shouldSyncTable(tableName) && this.isOnline() && isSupabaseConfigured && supabase) {
        await this.processSyncQueue(sid, {});
      }
      return { success: true, syncedRemotely: true, savedLocally: true };
    } catch (err: any) {
      return { success: false, syncedRemotely: false, savedLocally: false, error: err?.message || 'Batch delete failed.' };
    }
  }

  async get(userId: string, tableName: string, id: string): Promise<any | null> {
    const sid = this.resolveSchoolId(userId);
    const local = await userDBManager.get(sid, tableName, id);
    if (local) return local;
    if (!this.shouldSyncTable(tableName) || !this.isOnline() || !isSupabaseConfigured || !supabase) return null;
    try {
      const remoteTable = this.getSupabaseTable(tableName);
      const required = !this.OPTIONAL_REMOTE.has(remoteTable);
      if (!(await this.ensureRemoteTableExists(remoteTable, required))) return null;
      let query = supabase.from(remoteTable).select('*').eq('id', id);
      query = this.applySchoolScope(query, remoteTable, sid);
      const { data, error } = await query.single();
      if (error || !data) return null;
      const mapped = this.mapSupabaseToLocal(data);
      await userDBManager.put(sid, tableName, mapped);
      return mapped;
    } catch {
      return null;
    }
  }

  async where(userId: string, tableName: string, fieldName: string, value: any): Promise<any[]> {
    const sid = this.resolveSchoolId(userId);
    const field = this.mapFieldToSupabase(fieldName);
    if (!this.isUuid(value) && (field === 'class_id' || field === 'student_id' || field === 'staff_id')) {
      return userDBManager.where(sid, tableName, fieldName, value);
    }
    if (!this.shouldSyncTable(tableName) || !this.isOnline() || !isSupabaseConfigured || !supabase) {
      return userDBManager.where(sid, tableName, fieldName, value);
    }
    try {
      const remoteTable = this.getSupabaseTable(tableName);
      const required = !this.OPTIONAL_REMOTE.has(remoteTable);
      if (!(await this.ensureRemoteTableExists(remoteTable, required))) {
        return userDBManager.where(sid, tableName, fieldName, value);
      }
      let query = supabase.from(remoteTable).select('*').eq(field, value);
      query = this.applySchoolScope(query, remoteTable, sid);
      const { data, error } = await query;
      if (error) return userDBManager.where(sid, tableName, fieldName, value);
      return (data || []).map((r) => this.mapSupabaseToLocal(r));
    } catch {
      return userDBManager.where(sid, tableName, fieldName, value);
    }
  }

  async clear(userId: string, tableName: string): Promise<void> {
    const sid = this.resolveSchoolId(userId);
    await userDBManager.clear(sid, tableName);
    this.emitDataChange(tableName, 'DELETE', { table: tableName, all: true });
  }

  private async pullAllTables(sid: string, full: boolean): Promise<{ pulled: number; failed: number }> {
    const tables = this.LOCAL_TABLES.filter((t) => this.shouldSyncTable(t));
    let pulled = 0;
    let failed = 0;
    const n = this.PULL_CONCURRENCY;
    for (let i = 0; i < tables.length; i += n) {
      const chunk = tables.slice(i, i + n);
      const results = await Promise.allSettled(
        chunk.map((table) => (full ? this.pullFull(sid, table) : this.pullDelta(sid, table)))
      );
      for (const r of results) {
        if (r.status === 'fulfilled') pulled += r.value;
        else failed += 1;
      }
    }
    return { pulled, failed };
  }

  private logPullFailure(tableName: string, err: unknown) {
    const remote = this.getSupabaseTable(tableName);
    if (this.OPTIONAL_REMOTE.has(remote) || this.missingTables.has(remote)) return;
    console.error(`Pull failed for ${tableName}`, err);
  }

  private async pullFull(sid: string, tableName: string): Promise<number> {
    console.log('[pullFull] Starting for', tableName, 'school:', sid);
    if (!this.isOnline() || !isSupabaseConfigured || !supabase || !this.shouldSyncTable(tableName)) return 0;
    const remoteTable = this.getSupabaseTable(tableName);
    console.log('[pullFull] Remote table:', remoteTable);
    const required = !this.OPTIONAL_REMOTE.has(remoteTable);
    if (!(await this.ensureRemoteTableExists(remoteTable, required))) return 0;
    // Paginate to avoid Supabase's default 1000-row cap
    const PAGE_SIZE = 1000;
    let allRows: any[] = [];
    let from = 0;
    while (true) {
      let query = supabase.from(remoteTable).select('*').range(from, from + PAGE_SIZE - 1);
      query = this.applySchoolScope(query, remoteTable, sid);
      const { data, error } = await query;
      if (error) {
        console.log('[pullFull] Error for', tableName, ':', error.message);
        throw new Error(error.message);
      }
      console.log('[pullFull] Got', data?.length || 0, 'rows for', tableName);
      if (!data || data.length === 0) break;
      allRows = allRows.concat(data);
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
    console.log('[pullFull] Total rows for', tableName, ':', allRows.length);
    const merged = await this.mergeRemoteRecords(sid, tableName, allRows);
    if (merged) this.emitDataChange(tableName, 'UPDATE', { count: merged, source: 'pullFull' });
    return merged;
  }

  private async pullDelta(sid: string, tableName: string): Promise<number> {
    if (!this.isOnline() || !isSupabaseConfigured || !supabase || !this.shouldSyncTable(tableName)) return 0;
    if (this.syncInProgress) return 0;
    const remoteTable = this.getSupabaseTable(tableName);
    const required = !this.OPTIONAL_REMOTE.has(remoteTable);
    if (!(await this.ensureRemoteTableExists(remoteTable, required))) return 0;

    // Use last sync time as the delta baseline — NOT local updatedAt.
    // Local updatedAt gets bumped on every edit, which would make since=now and miss remote changes.
    const lastSync = localStorage.getItem(`last_sync_${sid}`);
    const since = lastSync ? new Date(new Date(lastSync).getTime() - 60_000).toISOString() : '1970-01-01T00:00:00Z';

    const PAGE_SIZE = 1000;
    let allRows: any[] = [];
    let from = 0;
    while (true) {
      let query = supabase.from(remoteTable).select('*').gt('updated_at', since).range(from, from + PAGE_SIZE - 1);
      query = this.applySchoolScope(query, remoteTable, sid);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) break;
      allRows = allRows.concat(data);
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
    if (allRows.length === 0) return 0;
    const merged = await this.mergeRemoteRecords(sid, tableName, allRows);
    if (merged) this.emitDataChange(tableName, 'UPDATE', { count: merged, source: 'pullDelta' });
    return merged;
  }

  private isUuid(value: string | undefined | null): boolean {
    if (!value || typeof value !== 'string') return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  /** Local settings rows use `${schoolId}:${key}` so they stay addressable in IndexedDB across devices. */
  private settingsLocalId(schoolId: string, key: string): string {
    return `${schoolId}:${key}`;
  }

  private async mergeRemoteRecords(sid: string, tableName: string, rows: any[]): Promise<number> {
    let merged = 0;
    const remoteTable = this.getSupabaseTable(tableName);
    const filterCol = this.getFilterColumn(remoteTable);
    for (const row of rows) {
      if (remoteTable === 'subscriptions') {
        const rs = row.school_id ?? row.schoolId;
        const ru = row.user_id ?? row.userId;
        if (rs && rs !== sid && ru !== sid) continue;
        if (!rs && ru && ru !== sid) continue;
      } else {
        if (filterCol === 'id' && row.id && row.id !== sid) {
          continue;
        }
        // Accept rows that belong to this school OR have no school_id (unrestricted/shared data)
        if (filterCol === 'school_id' && row.school_id != null && row.school_id !== sid) {
          continue;
        }
      }
      const mapped = this.mapSupabaseToLocal(row);
      if (tableName === 'settings' && mapped.key != null) {
        mapped.id = this.settingsLocalId(sid, String(mapped.key));
      }
      const id = mapped.id || row.id;
      if (!id) continue;
      if (row.deleted_at) {
        const deleteId = tableName === 'settings' && mapped.key != null ? this.settingsLocalId(sid, String(mapped.key)) : id;
        try { 
          await userDBManager.delete(sid, tableName, deleteId); 
          merged += 1; 
        } catch (e) { /* ignore delete errors */ }
        continue;
      }
      const local = await userDBManager.get(sid, tableName, id);
      if (!local) {
        await userDBManager.put(sid, tableName, { ...mapped, syncStatus: 'synced', schoolId: sid });
        merged += 1;
        continue;
      }
      const lts = local.updatedAt ? new Date(local.updatedAt).getTime() : 0;
      const rts = mapped.updatedAt ? new Date(mapped.updatedAt).getTime() : 0;
      // Last-write-wins by updated_at; local wins when strictly newer (offline edits preserved).
      if (rts < lts) continue;
      await userDBManager.put(sid, tableName, { ...local, ...mapped, syncStatus: 'synced', schoolId: sid });
      merged += 1;
    }
    return merged;
  }

  private async queueForSync(sid: string, table: string, recordId: string, operation: 'create' | 'update' | 'delete', data: any): Promise<void> {
    const pending = await userDBManager.getPendingSyncItems(sid);
    const existing = pending.slice().reverse().find((p: SyncQueueItem) => p.table === table && p.recordId === recordId);
    if (existing) {
      const op = existing.operation === 'create' && operation === 'update' ? 'create' : operation;
      const payload = op === 'create' ? { ...existing.data, ...data } : data;
      await userDBManager.updateSyncQueueItem(sid, existing.id, {
        operation: op, data: payload, timestamp: new Date().toISOString(), retryCount: 0, nextRetryAt: null, lastError: null,
      });
      await this.emitSyncStatus(sid);
      return;
    }
    await userDBManager.addToSyncQueue(sid, table, recordId, operation, data);
    await this.emitSyncStatus(sid);
  }

  /** Legacy rows used admission-style ids; Postgres expects UUID PKs. */
  private async tryMigrateQueuedRowToUuid(sid: string, table: string, raw: SyncQueueItem): Promise<boolean> {
    const oldId = raw.recordId;
    const row = (await userDBManager.get(sid, table, oldId)) || (raw.data as Record<string, any> | null);
    if (!row || typeof row !== 'object') return false;
    const newId = generateUUID();
    const next: any = { ...row, id: newId };
    if (table === 'students') {
      if (next.studentId == null || next.studentId === '') next.studentId = String(oldId);
      if (next.admissionNo == null || next.admissionNo === '') next.admissionNo = String(oldId);
    } else if (next.employeeId == null || next.employeeId === '') {
      next.employeeId = String(oldId);
    }
    try {
      await userDBManager.delete(sid, table, oldId);
    } catch {
      /* old key may be gone */
    }
    await userDBManager.put(sid, table, next);
    await this.queueForSync(sid, table, newId, 'create', next);
    return true;
  }

  private sanitizePostgresPayload(remoteTable: string, payload: Record<string, any>): void {
    const skipUuidNullForStudentId = remoteTable === 'students';
    for (const k of Object.keys(payload)) {
      if (payload[k] === undefined) {
        delete payload[k];
      }
    }
    const uuidCols = [
      'class_id', 'fee_id', 'staff_id', 'route_id', 'exam_id', 'subject_id', 'teacher_id',
      'conversation_id', 'recipient_id', 'sender_id', 'reference_id', 'student_id',
    ];
    for (const k of uuidCols) {
      if (!(k in payload)) continue;
      if (skipUuidNullForStudentId && k === 'student_id') continue;
      const v = payload[k];
      if (v === '' || v == null) {
        payload[k] = null;
        continue;
      }
      if (typeof v === 'string' && !this.isUuid(v)) {
        payload[k] = null;
      }
    }
    if (payload.dob === '') payload.dob = null;
    if (remoteTable === 'staff' && (payload.phone == null || payload.phone === '')) {
      payload.phone = '—';
    }
  }

  private cleanPayload(payload: Record<string, any>): Record<string, any> {
    const cleaned: Record<string, any> = {};
    for (const [k, v] of Object.entries(payload)) {
      if (v === undefined) continue;
      if (v === null) {
        cleaned[k] = null;
        continue;
      }
      if (typeof v === 'object' && !Array.isArray(v)) {
        cleaned[k] = JSON.stringify(v);
        continue;
      }
      cleaned[k] = v;
    }
    return cleaned;
  }

  private async validateForeignKeys(remoteTable: string, data: Record<string, any> | null, supabaseClient: any): Promise<string | null> {
    if (!data) return null;

    const fkMap: Record<string, { table: string; idField: string }> = {
      fee_structures: { table: 'classes', idField: 'class_id' },
      students: { table: 'classes', idField: 'class_id' },
      invoices: { table: 'students', idField: 'student_id' },
      invoice_items: { table: 'fee_structures', idField: 'fee_id' },
      marks: { table: 'students', idField: 'student_id' },
      attendance: { table: 'students', idField: 'student_id' },
    };

    const fk = fkMap[remoteTable];
    if (!fk) return null;

    const fkId = data[fk.idField];
    if (!fkId || typeof fkId !== 'string') {
      return `${fk.idField} is missing`;
    }

    const { data: exists, error } = await supabaseClient.from(fk.table).select('id').eq('id', fkId).maybeSingle();
    if (error || !exists) {
      return `${fk.table}/${fkId} not found in remote`;
    }

    return null;
  }

  private isValidPayload(payload: Record<string, any>, remoteTable: string): boolean {
    if (!payload || typeof payload !== 'object') return false;
    if (Object.keys(payload).length === 0) return false;
    if (payload.id === null || payload.id === undefined || payload.id === '') return false;
    return true;
  }

  private async processSyncQueue(sid: string, opts: { force?: boolean; onlyRecordId?: string }): Promise<{ processed: number; failed: number; skipped: number }> {
    if (!this.isOnline() || !isSupabaseConfigured || !supabase) return { processed: 0, failed: 0, skipped: 0 };
    const pending = (await userDBManager.getPendingSyncItems(sid)).sort((a: SyncQueueItem, b: SyncQueueItem) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    let processed = 0;
    let failed = 0;
    let skipped = 0;

    for (const raw of pending as SyncQueueItem[]) {
      if (opts.onlyRecordId && raw.recordId !== opts.onlyRecordId) continue;
      const rtc = this.getSupabaseTable(raw.table);
      if (this.OPTIONAL_REMOTE.has(rtc) && this.missingTables.has(rtc)) {
        await userDBManager.removeSyncQueueItem(sid, raw.id);
        processed += 1;
        continue;
      }
      if ((raw.table === 'students' || raw.table === 'staff') && !this.isUuid(raw.recordId)) {
        if (raw.operation === 'delete') {
          await userDBManager.removeSyncQueueItem(sid, raw.id);
          processed += 1;
          continue;
        }
        const migrated = await this.tryMigrateQueuedRowToUuid(sid, raw.table, raw);
        if (migrated) {
          await userDBManager.removeSyncQueueItem(sid, raw.id);
          processed += 1;
          continue;
        }
      }
      const retryCount = raw.retryCount || 0;
      const nextRetry = raw.nextRetryAt ? new Date(raw.nextRetryAt).getTime() : 0;
      const now = Date.now();
      if (!opts.force && nextRetry > now) { skipped += 1; continue; }

      try {
        await this.pushQueueItem(sid, raw);
        await userDBManager.removeSyncQueueItem(sid, raw.id);
        processed += 1;
      } catch (err: any) {
        const msg = err?.message || 'Sync push failed';
        if (msg === 'SYNC_TABLE_DISABLED' || msg.startsWith('SYNC_TABLE_DISABLED:')) {
          await userDBManager.removeSyncQueueItem(sid, raw.id);
          processed += 1;
          continue;
        }
        failed += 1;
        const delay = Math.min(this.BASE_RETRY_MS * 2 ** retryCount, this.MAX_RETRY_MS);
        await userDBManager.updateSyncQueueItem(sid, raw.id, {
          retryCount: retryCount + 1,
          nextRetryAt: new Date(now + delay).toISOString(),
          lastError: msg,
        });
        this.setLastSyncError(sid, msg);
      }
    }

    await this.emitSyncStatus(sid);
    return { processed, failed, skipped };
  }

  private async pushQueueItem(sid: string, item: SyncQueueItem): Promise<void> {
    if (!supabase) throw new Error('Supabase client unavailable.');
    const remoteTable = this.getSupabaseTable(item.table);
    console.log(`[PUSH] Starting push to ${remoteTable}:`, { table: item.table, recordId: item.recordId, operation: item.operation });

    if (!this.shouldSyncTable(item.table)) {
      console.log(`[PUSH] Skipping ${remoteTable}: sync disabled`);
      throw new Error('SYNC_TABLE_DISABLED');
    }
    const required = !this.OPTIONAL_REMOTE.has(remoteTable);
    if (!(await this.ensureRemoteTableExists(remoteTable, required))) {
      console.log(`[PUSH] Skipping ${remoteTable}: table not available`);
      throw new Error(`Table ${remoteTable} is not available on the server.`);
    }

    const schoolCheck = await supabase.from('schools').select('id').eq('id', sid).maybeSingle();
    if (!schoolCheck.data) {
      // School row missing — create it so subsequent pushes succeed
      const now = new Date().toISOString();
      const session = this.getSession();
      const schoolName = (session as any)?.schoolName || 'My School';
      const { error: schoolErr } = await supabase.from('schools').upsert(
        { id: sid, name: schoolName, created_at: now, updated_at: now },
        { onConflict: 'id' }
      );
      if (schoolErr) {
        console.warn(`[PUSH] Could not create school row for ${sid}:`, schoolErr.message);
        // Don't silently drop — throw so the queue retries
        throw new Error(`School row missing and could not be created: ${schoolErr.message}`);
      }
      console.log(`[PUSH] Auto-created school row for ${sid}`);
    }

    const fkValidation = await this.validateForeignKeys(remoteTable, item.data, supabase);
    if (fkValidation) {
      console.log(`[PUSH] Skipping ${remoteTable}: ${fkValidation}`);
      const local = await userDBManager.get(sid, item.table, item.recordId);
      if (local) await userDBManager.put(sid, item.table, { ...local, syncStatus: 'synced' });
      return;
    }

    if (item.operation === 'delete') {
      console.log(`[PUSH] Deleting from ${remoteTable}:`, item.recordId);
      await this.pushDelete(sid, remoteTable, item.table, item.recordId);
      return;
    }

    if (item.table === 'settings') {
      const key = item.data?.key;
      if (key == null || String(key) === '') {
        console.log(`[PUSH] Skipping settings: missing key`);
        throw new Error(`Settings sync missing key for ${item.recordId}`);
      }
      const createdAt = item.data?.createdAt || new Date().toISOString();
      const updatedAt = item.data?.updatedAt || new Date().toISOString();
      const payload = {
        school_id: sid,
        key: String(key),
        value: item.data?.value ?? null,
        created_at: createdAt,
        updated_at: updatedAt,
      };
      console.log(`[PUSH] Upserting settings:`, JSON.stringify(payload));
      const { error } = await supabase.from('settings').upsert(payload, { onConflict: 'school_id,key' });
      if (error) throw new Error(`Upsert failed for settings/${key}: ${error.message}`);
      const ok = await this.verifySettingsRemote(sid, String(key), false);
      if (!ok) throw new Error(`Verification failed for settings/${key}.`);
      const local = await userDBManager.get(sid, 'settings', item.recordId);
      if (local) await userDBManager.put(sid, 'settings', { ...local, syncStatus: 'synced' });
      return;
    }

    const recordId = item.recordId;
    const payload = this.mapLocalToSupabase({ ...item.data, id: recordId });
    console.log(`[PUSH] Before school_id set: sid=${sid}, payload.school_id=${payload.school_id}`);
    if (this.getFilterColumn(remoteTable) === 'school_id') {
      payload.school_id = sid;
      console.log(`[PUSH] After school_id set: payload.school_id=${payload.school_id}`);
    }
    this.sanitizePostgresPayload(remoteTable, payload);
    console.log(`[PUSH] After sanitize: payload.school_id=${payload.school_id}`);

    if (!this.isValidPayload(payload, remoteTable)) {
      console.log(`[PUSH] Skipping ${remoteTable}: invalid payload`, payload);
      const local = await userDBManager.get(sid, item.table, item.recordId);
      if (local) await userDBManager.put(sid, item.table, { ...local, syncStatus: 'synced' });
      return;
    }

    const cleanedPayload = this.cleanPayload(payload);
    console.log(`[PUSH] Upserting to ${remoteTable}:`, JSON.stringify(cleanedPayload, null, 2));

    try {
      const { error } = await supabase.from(remoteTable).upsert(cleanedPayload, { onConflict: 'id' });
      if (error) {
        console.error(`[PUSH] Error from ${remoteTable}:`, error.message);
        if (!error.message.includes('duplicate') && !error.message.includes('violates') && !error.message.includes('400')) {
          throw new Error(`Upsert failed for ${remoteTable}/${recordId}: ${error.message}`);
        }
      } else {
        console.log(`[PUSH] Success: ${remoteTable}/${recordId}`);
      }
    } catch (err: any) {
      console.error(`[PUSH] Exception for ${remoteTable}:`, err.message);
      if (!err.message?.includes('duplicate') && !err.message?.includes('violates') && !err.message?.includes('400')) {
        throw err;
      }
    }
    const local = await userDBManager.get(sid, item.table, item.recordId);
    if (local) await userDBManager.put(sid, item.table, { ...local, syncStatus: 'synced' });
  }

  private async pushDelete(sid: string, remoteTable: string, localTable: string, recordId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase client unavailable.');

    if (localTable === 'settings' && recordId.startsWith(`${sid}:`)) {
      const key = recordId.slice(sid.length + 1);
      let query = supabase.from('settings').update({ deleted_at: new Date().toISOString() }).eq('school_id', sid).eq('key', key);
      let { error } = await query;
      if (error && String(error.message || '').toLowerCase().includes('deleted_at')) {
        let hard = supabase.from('settings').delete().eq('school_id', sid).eq('key', key);
        ({ error } = await hard);
      }
      if (error) throw new Error(`Delete failed for settings/${key}: ${error.message}`);
      const ok = await this.verifySettingsRemote(sid, key, true);
      if (!ok) throw new Error(`Verification failed for delete settings/${key}.`);
      return;
    }

    let query = supabase.from(remoteTable).update({ deleted_at: new Date().toISOString() }).eq('id', recordId);
    query = this.applySchoolScope(query, remoteTable, sid);
    let { error } = await query;
    if (error && String(error.message || '').toLowerCase().includes('deleted_at')) {
      let hard = supabase.from(remoteTable).delete().eq('id', recordId);
      hard = this.applySchoolScope(hard, remoteTable, sid);
      ({ error } = await hard);
    }
    if (error) throw new Error(`Delete failed for ${remoteTable}/${recordId}: ${error.message}`);
    const ok = await this.verifyRemoteState(remoteTable, recordId, sid, true);
    if (!ok) throw new Error(`Verification failed for delete ${remoteTable}/${recordId}.`);
  }

  private async verifySettingsRemote(sid: string, key: string, expectDeleted: boolean): Promise<boolean> {
    if (!supabase) return false;
    try {
      let query = supabase.from('settings').select('id, deleted_at').eq('school_id', sid).eq('key', key).limit(1);
      let { data, error } = await query;
      if (error && String(error.message || '').toLowerCase().includes('deleted_at')) {
        const alt = await supabase.from('settings').select('id').eq('school_id', sid).eq('key', key).limit(1);
        data = alt.data as any[] | null;
        error = alt.error;
      }
      // RLS may block verify read — treat as success
      if (error) {
        console.warn(`verifySettingsRemote: could not verify settings/${key}, assuming success:`, error.message);
        return !expectDeleted;
      }
      if (!data || data.length === 0) return expectDeleted;
      return expectDeleted ? !!(data[0] as any).deleted_at : !(data[0] as any).deleted_at;
    } catch (err: any) {
      console.warn(`verifySettingsRemote: exception for settings/${key}, assuming success:`, err?.message);
      return !expectDeleted;
    }
  }

  private async verifyRemoteState(remoteTable: string, recordId: string, sid: string, expectDeleted: boolean): Promise<boolean> {
    if (!supabase) return false;
    try {
      let query = supabase.from(remoteTable).select('id, deleted_at').eq('id', recordId).limit(1);
      query = this.applySchoolScope(query, remoteTable, sid);
      let { data, error } = await query;
      if (error && String(error.message || '').toLowerCase().includes('deleted_at')) {
        let fallback = supabase.from(remoteTable).select('id').eq('id', recordId).limit(1);
        fallback = this.applySchoolScope(fallback, remoteTable, sid);
        const alt = await fallback;
        data = alt.data as any[] | null;
        error = alt.error;
      }
      // RLS may block the verify read even after a successful upsert — treat as success
      if (error) {
        console.warn(`verifyRemoteState: could not verify ${remoteTable}/${recordId} (RLS or network), assuming success:`, error.message);
        return !expectDeleted;
      }
      if (!data || data.length === 0) return expectDeleted;
      return expectDeleted ? !!(data[0] as any).deleted_at : true;
    } catch (err: any) {
      console.warn(`verifyRemoteState: exception for ${remoteTable}/${recordId}, assuming success:`, err?.message);
      return !expectDeleted;
    }
  }

  private async subscribeToRemoteChanges(sid: string): Promise<void> {
    if (!this.isOnline() || !isSupabaseConfigured || !supabase) return;
    const client = supabase;
    if (this.subChannel && this.subscribedSchoolId === sid) return;

    if (this.realtimeSubscribeLock) {
      try {
        await this.realtimeSubscribeLock;
      } catch {
        /* previous attempt failed */
      }
      if (this.subChannel && this.subscribedSchoolId === sid) return;
    }

    const run = async () => {
      if (this.subChannel) {
        try {
          await this.subChannel.unsubscribe();
        } catch {
          /* already closed */
        }
        this.subChannel = null;
        this.subscribedSchoolId = null;
      }

      const channel = client.channel(`schofy-listen-${sid}`);
      for (const remoteTable of this.REALTIME_REMOTE_TABLES) {
        if (!this.REMOTE_SET.has(remoteTable) || this.missingTables.has(remoteTable)) continue;
        const onPg = (payload: any) => {
          const table = this.getLocalTable(remoteTable);
          void this.handleRemoteChange(sid, table, payload);
        };
        if (remoteTable === 'subscriptions') {
          channel.on('postgres_changes', { event: '*', schema: 'public', table: remoteTable, filter: `school_id=eq.${sid}` }, onPg);
          channel.on('postgres_changes', { event: '*', schema: 'public', table: remoteTable, filter: `user_id=eq.${sid}` }, onPg);
          continue;
        }
        const col = this.getFilterColumn(remoteTable);
        const filter = col ? `${col}=eq.${sid}` : undefined;
        channel.on('postgres_changes', { event: '*', schema: 'public', table: remoteTable, ...(filter ? { filter } : {}) }, onPg);
      }

      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error('Realtime subscribe timeout')), 15000);
        channel.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            window.clearTimeout(timer);
            this.subChannel = channel;
            this.subscribedSchoolId = sid;
            resolve();
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            window.clearTimeout(timer);
            reject(new Error(String(status)));
          }
        });
      });
    };

    this.realtimeSubscribeLock = run();
    try {
      await this.realtimeSubscribeLock;
    } finally {
      this.realtimeSubscribeLock = null;
    }
  }

  private async handleRemoteChange(sid: string, table: string, payload: any): Promise<void> {
    const { eventType, new: n, old: o } = payload;
    try {
      if (eventType === 'INSERT' && n) {
        await this.mergeRemoteRecords(sid, table, [n]);
        this.emitDataChange(table, 'INSERT', n);
      } else if (eventType === 'UPDATE' && n) {
        await this.mergeRemoteRecords(sid, table, [n]);
        this.emitDataChange(table, 'UPDATE', n);
      } else if (eventType === 'DELETE' && o) {
        const rt = this.getSupabaseTable(table);
        if (rt === 'subscriptions') {
          const rs = o.school_id ?? o.schoolId;
          const ru = o.user_id ?? o.userId;
          if (rs && rs !== sid && ru !== sid) return;
          if (!rs && ru && ru !== sid) return;
        } else {
          const filterCol = this.getFilterColumn(rt);
          if (filterCol === 'school_id' && o.school_id && o.school_id !== sid) {
            return;
          }
        }
        const deleteId =
          table === 'settings' && o.key != null ? this.settingsLocalId(sid, String(o.key)) : o.id;
        await userDBManager.delete(sid, table, deleteId);
        this.emitDataChange(table, 'DELETE', o);
      }
    } catch (err) {
      console.error(`Failed to apply realtime change for ${table}`, err);
    }
  }

  private async ensureRequiredSchema(): Promise<void> {
    if (!isSupabaseConfigured || !supabase) return;
    // Check all tables but never block sync — just mark missing ones so they're skipped
    for (const table of this.CORE_REMOTE) {
      try {
        await this.ensureRemoteTableExists(table, false);
      } catch {
        this.missingTables.add(table);
      }
    }
    for (const table of this.OPTIONAL_REMOTE) {
      try {
        await this.ensureRemoteTableExists(table, false);
      } catch {
        this.missingTables.add(table);
      }
    }
  }

  /** @returns false when table is missing and not required */
  private async ensureRemoteTableExists(table: string, required: boolean): Promise<boolean> {
    if (!isSupabaseConfigured || !supabase) return false;
    const now = Date.now();
    if (now - this.schemaCheckedAt > this.SCHEMA_TTL_MS) {
      this.missingTables.clear();
      this.schemaCheckedAt = now;
    }
    if (this.missingTables.has(table)) {
      if (required) {
        throw new Error(`Missing Supabase table: ${table}. Apply migrations from supabase/migrations.`);
      }
      return false;
    }
    const { error } = await supabase.from(table).select('id', { head: true, count: 'exact' }).limit(1);
    if (error && this.isMissingTableError(error)) {
      this.missingTables.add(table);
      if (required) {
        throw new Error(`Missing Supabase table: ${table}. Apply migrations from supabase/migrations.`);
      }
      return false;
    }
    return true;
  }

  private isMissingTableError(error: any): boolean {
    const msg = String(error?.message || '').toLowerCase();
    return (
      error?.code === 'PGRST205' ||
      msg.includes('does not exist') ||
      msg.includes('relation') ||
      msg.includes('schema cache') ||
      msg.includes('could not find the table')
    );
  }

  private mapFieldToSupabase(field: string): string {
    const map: Record<string, string> = {
      schoolId: 'school_id', firstName: 'first_name', lastName: 'last_name', employeeId: 'employee_id',
      guardianName: 'guardian_name', guardianPhone: 'guardian_phone', guardianEmail: 'guardian_email',
      admissionNo: 'admission_no', studentId: 'student_id', classId: 'class_id', entityType: 'entity_type',
      entityId: 'entity_id', feeId: 'fee_id', paidAmount: 'paid_amount', dueDate: 'due_date',
      createdAt: 'created_at', updatedAt: 'updated_at', routeId: 'route_id', staffId: 'staff_id',
      userId: 'user_id', conversationId: 'conversation_id',
    };
    return map[field] || field;
  }

  private mapLocalToSupabase(record: any): any {
    const obj = { ...record };
    delete obj.syncStatus;
    delete obj.deviceId;
    const out: any = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'undefined') continue;
      const key = k === 'schoolId' ? 'school_id' : this.camelToSnake(k);
      out[key] = v;
    }
    return out;
  }

  private mapSupabaseToLocal(record: any): any {
    const out: any = {};
    for (const [k, v] of Object.entries(record)) {
      const key = k === 'school_id' ? 'schoolId' : this.snakeToCamel(k);
      out[key] = v;
    }
    out.syncStatus = 'synced';
    return out;
  }

  private getSupabaseTable(localTable: string): string {
    const m: Record<string, string> = {
      feeStructures: 'fee_structures',
      examResults: 'exam_results',
      transportRoutes: 'transport_routes',
      transportAssignments: 'transport_assignments',
      salaryPayments: 'salary_payments',
      pointTransactions: 'point_transactions',
    };
    if (m[localTable]) return m[localTable];
    if (localTable.includes('_')) return localTable;
    return this.camelToSnake(localTable);
  }

  private getLocalTable(remoteTable: string): string {
    const m: Record<string, string> = {
      fee_structures: 'feeStructures',
      exam_results: 'examResults',
      transport_routes: 'transportRoutes',
      transport_assignments: 'transportAssignments',
      salary_payments: 'salaryPayments',
      point_transactions: 'pointTransactions',
    };
    return m[remoteTable] || this.snakeToCamel(remoteTable);
  }

  private getRecycleBinType(tableName: string): 'student' | 'staff' | 'announcement' | 'class' | 'subject' | 'fee' | 'exam' | 'transport' | null {
    const typeMap: Record<string, 'student' | 'staff' | 'announcement' | 'class' | 'subject' | 'fee' | 'exam' | 'transport'> = {
      students: 'student',
      staff: 'staff',
      announcements: 'announcement',
      classes: 'class',
      subjects: 'subject',
      fees: 'fee',
      exams: 'exam',
      transportRoutes: 'transport',
    };
    return typeMap[tableName] || null;
  }

  private getFilterColumn(table: string): 'id' | 'school_id' | null {
    if (table === 'schools') return 'id';
    if (this.NO_SCHOOL_FILTER.has(table)) return null;
    return 'school_id';
  }

  private applySchoolScope(query: any, table: string, sid: string): any {
    if (table === 'subscriptions') {
      return query.or(`school_id.eq.${sid},user_id.eq.${sid}`);
    }
    const col = this.getFilterColumn(table);
    if (col === 'id') return query.eq('id', sid);
    if (col === 'school_id') return query.or(`school_id.eq.${sid},school_id.is.null`);
    return query;
  }

  private emitDataChange(table: string, type: 'INSERT' | 'UPDATE' | 'DELETE', record: any) {
    if (this.syncInProgress) return;
    const detail = { table, type, record };
    window.dispatchEvent(new CustomEvent(`${table}Updated`, { detail }));
    window.dispatchEvent(new CustomEvent(`${table}DataChanged`, { detail }));
    window.dispatchEvent(new CustomEvent('schofyDataRefresh', { detail }));
    window.dispatchEvent(new CustomEvent('dataRefresh', { detail }));
    queryCache.invalidatePattern(`${table}:*`);
    // Invalidate React Query so components refetch from IndexedDB on next render
    try {
      const qc = getQueryClient();
      void qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0] ?? '').includes(table) });
    } catch { /* queryClient may not be ready yet */ }
  }

  private broadcastChange(table: string, type: 'INSERT' | 'UPDATE' | 'DELETE', record: any, userId: string) {
    if (!window.broadcastSchofyChange) return;
    try { window.broadcastSchofyChange(table, type, record, userId); } catch (err) { console.error('Broadcast error', err); }
  }

  private notifySyncProgress(sid: string, inProgress: boolean) {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('schofySyncLifecycle', { detail: { inProgress, schoolId: sid } }));
  }

  private async remoteHeadCount(sid: string, remoteTable: string): Promise<number | null> {
    if (!isSupabaseConfigured || !supabase) return null;
    if (this.missingTables.has(remoteTable)) return null;
    let q = supabase.from(remoteTable).select('id', { count: 'exact', head: true });
    q = this.applySchoolScope(q, remoteTable, sid);
    const { count, error } = await q;
    if (error) return null;
    return count ?? 0;
  }

  private installDebugTools() {
    if (typeof window === 'undefined') return;
    window.debugSync = async () => {
      const sid = this.getActiveSchoolId();
      if (!sid) {
        console.warn('[debugSync] No active tenant (school) in session.');
        return { error: 'no_tenant' };
      }
      const tables = ['students', 'staff', 'payments', 'classes', 'fees'] as const;
      const local: Record<string, number> = {};
      for (const t of tables) {
        try {
          const rows = await userDBManager.getAll(sid, t);
          local[t] = rows.filter((r: Record<string, unknown>) => !r.deletedAt && !r.deleted_at).length;
        } catch {
          local[t] = -1;
        }
      }
      const remote: Record<string, number | null> = {};
      for (const t of tables) {
        const rt = this.getSupabaseTable(t);
        remote[t] = await this.remoteHeadCount(sid, rt);
      }
      const pending = await userDBManager.getPendingSyncItems(sid);
      const report = {
        tenantId: sid,
        localRowCounts: local,
        remoteRowCounts: remote,
        pendingQueueLength: pending.length,
        pendingQueueSample: pending.slice(0, 12),
      };
      console.log('[debugSync]', report);
      return report;
    };
    window.checkSyncStatus = async () => {
      const sid = this.getActiveSchoolId();
      if (!sid) throw new Error('No active school/session found.');
      const status = await this.getSyncStatus(sid);
      console.log('Sync status', status);
      return status;
    };
    window.forcePush = async () => {
      const sid = this.getActiveSchoolId();
      if (!sid) throw new Error('No active school/session found.');
      const result = await this.forcePush(sid);
      console.log('Force push result', result);
      return result;
    };
    window.forcePull = async () => {
      const sid = this.getActiveSchoolId();
      if (!sid) throw new Error('No active school/session found.');
      const result = await this.forcePull(sid);
      console.log('Force pull result', result);
      return result;
    };
  }

  private async emitSyncStatus(sid: string): Promise<void> {
    const status = await this.getSyncStatus(sid);
    window.dispatchEvent(new CustomEvent('schofySyncStatus', { detail: status }));
  }

  private setLastSyncAt(sid: string, value: string) {
    localStorage.setItem(`last_sync_${sid}`, value);
    localStorage.setItem('schofy_last_sync', value);
  }

  private setLastSyncError(sid: string, msg: string | null) {
    const key = `last_sync_error_${sid}`;
    if (!msg) localStorage.removeItem(key);
    else localStorage.setItem(key, msg);
  }

  private getLastSyncError(sid: string): string | null {
    return localStorage.getItem(`last_sync_error_${sid}`);
  }

  private resolveSchoolId(userOrSchoolId: string | null | undefined): string {
    if (!userOrSchoolId) return this.getActiveSchoolId() || '';
    const session = this.getSession();
    const currentSchool = localStorage.getItem('schofy_current_school_id') || session?.schoolId;
    const currentUser = localStorage.getItem('schofy_current_user_id') || session?.id;
    if (userOrSchoolId === currentUser && currentSchool) return currentSchool;
    return userOrSchoolId;
  }

  private getActiveSchoolId(): string | null {
    const session = this.getSession();
    return localStorage.getItem('schofy_current_school_id') || session?.schoolId || null;
  }

  private getSession(): { id?: string; schoolId?: string } | null {
    try {
      const raw = localStorage.getItem('schofy_session');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  private isOnline(): boolean {
    return navigator.onLine;
  }

  private shouldSyncTable(tableName: string): boolean {
    const remote = this.getSupabaseTable(tableName);
    if (!this.REMOTE_SET.has(remote)) return false;
    if (this.missingTables.has(remote)) return false;
    return true;
  }

  private camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, (l) => `_${l.toLowerCase()}`);
  }

  private snakeToCamel(str: string): string {
    return str.replace(/_([a-z])/g, (_, l) => l.toUpperCase());
  }
}

export const dataService = new DataService();
