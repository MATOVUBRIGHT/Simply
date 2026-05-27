/**
 * Global reactive data store — instant reads from cache, background sync from Supabase.
 *
 * Flow:
 * 1. On module load: store is empty
 * 2. bootstrapSession: synchronously pushes all memCache data into store (instant)
 * 3. useTableData subscribe: if store has data → return immediately (no network)
 *                            if store empty → fetch from Supabase
 * 4. Background: _seedFromSupabase merges remote data without overriding pending writes
 */
import { useSyncExternalStore, useCallback } from 'react';
import { dataService } from './database/SupabaseDataService';
import { sortClassesBySectionThenLevel } from '../utils/classroom';

type Listener = () => void;

interface TableState {
  data: any[];
  loading: boolean;
  error: string | null;
  lastFetch: number;
}

const STALE_MS = 4 * 60 * 60_000; // 4 hours — data loaded once stays loaded; realtime + manual refresh keeps it fresh
const FALLBACK_REFRESH_MS = 15 * 60_000; // Safety net only; realtime handles normal updates
const ACTIVE_CATCHUP_MS = 5 * 60_000; // Keep focus/online refreshes within the low-call sync protocol

class DataStore {
  private state = new Map<string, TableState>();
  private listeners = new Map<string, Set<Listener>>();
  private fetching = new Map<string, Promise<void>>();

  private key(sid: string, table: string) { return `${sid}:${table}`; }

  private normalize(table: string, data: any[]) {
    return table === 'classes' ? sortClassesBySectionThenLevel(data) : data;
  }

  private get(sid: string, table: string): TableState {
    const k = this.key(sid, table);
    if (!this.state.has(k)) {
      this.state.set(k, { data: [], loading: false, error: null, lastFetch: 0 });
    }
    return this.state.get(k)!;
  }

  private set(sid: string, table: string, patch: Partial<TableState>) {
    const k = this.key(sid, table);
    const nextPatch = patch.data ? { ...patch, data: this.normalize(table, patch.data) } : patch;
    const next = { ...this.get(sid, table), ...nextPatch };
    this.state.set(k, next);
    this.listeners.get(k)?.forEach(l => l());
  }

  subscribe(sid: string, table: string, listener: Listener): () => void {
    const k = this.key(sid, table);
    if (!this.listeners.has(k)) this.listeners.set(k, new Set());
    this.listeners.get(k)!.add(listener);
    return () => this.listeners.get(k)?.delete(listener);
  }

  getSnapshot(sid: string, table: string): TableState {
    return this.get(sid, table);
  }

  async fetch(sid: string, table: string, force = false): Promise<void> {
    if (!sid) return;
    const k = this.key(sid, table);
    const s = this.get(sid, table);

    // Has fresh data — skip entirely (most common path after bootstrap)
    if (!force && s.data.length > 0 && s.lastFetch > 0 && Date.now() - s.lastFetch < STALE_MS) return;

    // Deduplicate concurrent fetches
    const existing = this.fetching.get(k);
    if (existing) return existing;

    const req = (async () => {
      // NEVER show loading spinner — data either comes from cache instantly or loads silently
      try {
        const data = await dataService.getAll(sid, table, force);
        if (data.length > 0 || s.data.length === 0) {
          this.set(sid, table, { data, loading: false, lastFetch: Date.now() });
        } else {
          this.set(sid, table, { loading: false, lastFetch: Date.now() });
        }
      } catch (e: any) {
        this.set(sid, table, { loading: false, error: e.message });
      } finally {
        this.fetching.delete(k);
      }
    })();

    this.fetching.set(k, req);
    return req;
  }

  invalidate(sid: string, table: string) {
    this.set(sid, table, { lastFetch: 0 });
    void this.fetch(sid, table, true);
  }

  push(sid: string, table: string, data: any[]) {
    this.set(sid, table, { data, loading: false, lastFetch: Date.now() });
  }

  /** Push with a specific timestamp — used by bootstrap to preserve cache age */
  pushWithTs(sid: string, table: string, data: any[], ts: number) {
    this.set(sid, table, { data, loading: false, lastFetch: ts });
  }

  seed(sid: string, table: string, data: any[]) {
    const s = this.get(sid, table);
    if (s.data.length === 0 && data.length > 0) {
      // Seed with slightly stale timestamp so background fetch runs soon
      this.set(sid, table, { data, loading: false, lastFetch: Date.now() - (STALE_MS - 30_000) });
    }
  }

  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  onRemoteChange(sid: string, table: string) {
    const age = Date.now() - this.get(sid, table).lastFetch;
    if (age < 2000) return;

    const k = this.key(sid, table);
    const existing = this.debounceTimers.get(k);
    if (existing) clearTimeout(existing);

    this.debounceTimers.set(k, setTimeout(() => {
      this.debounceTimers.delete(k);
      this.set(sid, table, { lastFetch: 0 });
      void this.fetch(sid, table, true);
    }, 300));
  }

  refreshStale(sid: string, tables: string[]) {
    if (!sid) return;
    for (const table of this.getActiveTables(sid, tables)) {
      const s = this.get(sid, table);
      if (Date.now() - s.lastFetch > FALLBACK_REFRESH_MS) {
        void this.fetch(sid, table, true);
      }
    }
  }

  refreshActive(sid: string, tables: string[]) {
    if (!sid) return;
    for (const table of this.getActiveTables(sid, tables)) {
      const s = this.get(sid, table);
      if (Date.now() - s.lastFetch > ACTIVE_CATCHUP_MS) {
        this.set(sid, table, { lastFetch: 0 });
        void this.fetch(sid, table, true);
      }
    }
  }

  async refreshCurrentPage(sid: string, force = false): Promise<void> {
    if (!sid) return;
    const activeTables = this.getActiveTables(sid);
    if (!force) {
      this.refreshActive(sid, activeTables);
      return;
    }
    const refreshes = activeTables.map(table => {
      this.set(sid, table, { lastFetch: 0 });
      return this.fetch(sid, table, true);
    });
    await Promise.allSettled(refreshes);
  }

  getActiveTables(sid: string, tables?: string[]): string[] {
    if (!sid) return [];
    const scopedTables = tables ?? Array.from(this.listeners.keys())
      .filter(k => k.startsWith(`${sid}:`))
      .map(k => k.slice(sid.length + 1));

    return Array.from(new Set(scopedTables)).filter(table => {
      const k = this.key(sid, table);
      return (this.listeners.get(k)?.size ?? 0) > 0;
    });
  }

  clearAll() {
    this.state.clear();
    this.fetching.clear();
    this.debounceTimers.forEach(timer => clearTimeout(timer));
    this.debounceTimers.clear();
    this.listeners.forEach(listeners => listeners.forEach(listener => listener()));
  }
}

export const store = new DataStore();
(globalThis as any).__schofyStore = store;

// ── Instant bootstrap from localStorage cache ─────────────────────────────────
// Runs synchronously at module load — data is in store before first React render
// ── Instant bootstrap from localStorage cache ─────────────────────────────────
// Runs synchronously at module load — data is in store before first React render
;(() => {
  try {
    const session = localStorage.getItem('schofy_session');
    if (!session) return;
    const user = JSON.parse(session);
    const sid = user?.schoolId || user?.id;
    if (!sid) return;

    // Ensure current school ID is set so useTableData fallback works
    if (!localStorage.getItem('schofy_current_school_id')) {
      localStorage.setItem('schofy_current_school_id', sid);
    }

    // Try localStorage cache first (synchronous, instant)
    const PERSIST_KEY = 'schofy_data_cache';
    const raw = localStorage.getItem(PERSIST_KEY);
    if (raw) {
      const cache: Record<string, { data: any[]; ts: number }> = JSON.parse(raw);
      for (const [key, entry] of Object.entries(cache)) {
        if (!key.startsWith(sid + ':')) continue;
        const table = key.slice(sid.length + 1);
        if (entry.data.length > 0) store.pushWithTs(sid, table, entry.data, entry.ts);
      }
      return; // localStorage had data — done
    }

    // Try IndexedDB (async — will update store when ready)
    const IDB_DB_NAME = 'schofy_cache';
    const IDB_STORE = 'data';
    try {
      const req = indexedDB.open(IDB_DB_NAME, 1);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(IDB_STORE, 'readonly');
        const getReq = tx.objectStore(IDB_STORE).get(PERSIST_KEY);
        getReq.onsuccess = () => {
          const cache = getReq.result;
          if (!cache) return;
          for (const [key, entry] of Object.entries(cache as Record<string, { data: any[]; ts: number }>)) {
            if (!key.startsWith(sid + ':')) continue;
            const table = key.slice(sid.length + 1);
            if ((entry as any).data?.length > 0) {
              store.pushWithTs(sid, table, (entry as any).data, (entry as any).ts);
            }
          }
        };
      };
    } catch { /* IndexedDB not available */ }
  } catch { /* ignore */ }
})();

// Prefetch critical tables as soon as the store is ready
export function prefetchCriticalTables(sid: string) {
  if (!sid) return;
  const CRITICAL = ['students', 'classes', 'subjects', 'fees', 'payments', 'exams', 'examResults'];
  for (const table of CRITICAL) {
    const snap = store.getSnapshot(sid, table);
    if (snap.data.length === 0) void store.fetch(sid, table);
  }
}

// ── React hook ────────────────────────────────────────────────────────────────

export function useTableData(sid: string | null | undefined, table: string) {
  const safeSid = sid || '';

  const subscribe = useCallback(
    (listener: Listener) => {
      if (!safeSid) return () => {};
      const snap = store.getSnapshot(safeSid, table);
      if (snap.data.length === 0) {
        void store.fetch(safeSid, table);
      }
      return store.subscribe(safeSid, table, listener);
    },
    [safeSid, table]
  );

  const getSnapshot = useCallback(
    () => store.getSnapshot(safeSid, table),
    [safeSid, table]
  );

  // Server snapshot = same as client (SSR not used, but required by useSyncExternalStore)
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const refresh = useCallback(() => {
    if (safeSid) store.invalidate(safeSid, table);
  }, [safeSid, table]);

  return { data: state.data, loading: state.loading, error: state.error, refresh };
}
