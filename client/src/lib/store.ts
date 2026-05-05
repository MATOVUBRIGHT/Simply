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

type Listener = () => void;

interface TableState {
  data: any[];
  loading: boolean;
  error: string | null;
  lastFetch: number;
}

const STALE_MS = 4 * 60 * 60_000; // 4 hours — data loaded once stays loaded; realtime + manual refresh keeps it fresh

class DataStore {
  private state = new Map<string, TableState>();
  private listeners = new Map<string, Set<Listener>>();
  private fetching = new Map<string, Promise<void>>();

  private key(sid: string, table: string) { return `${sid}:${table}`; }

  private get(sid: string, table: string): TableState {
    const k = this.key(sid, table);
    if (!this.state.has(k)) {
      this.state.set(k, { data: [], loading: false, error: null, lastFetch: 0 });
    }
    return this.state.get(k)!;
  }

  private set(sid: string, table: string, patch: Partial<TableState>) {
    const k = this.key(sid, table);
    const next = { ...this.get(sid, table), ...patch };
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
        const data = await dataService.getAll(sid, table);
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
    for (const table of tables) {
      const s = this.get(sid, table);
      const k = this.key(sid, table);
      const hasSubscribers = (this.listeners.get(k)?.size ?? 0) > 0;
      if (hasSubscribers && Date.now() - s.lastFetch > 30_000) {
        void this.fetch(sid, table, true);
      }
    }
  }
}

export const store = new DataStore();
(globalThis as any).__schofyStore = store;

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

    const PERSIST_KEY = 'schofy_data_cache';
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return;
    const cache: Record<string, { data: any[]; ts: number }> = JSON.parse(raw);

    for (const [key, entry] of Object.entries(cache)) {
      if (!key.startsWith(sid + ':')) continue;
      const table = key.slice(sid.length + 1);
      if (entry.data.length > 0) {
        store.pushWithTs(sid, table, entry.data, entry.ts);
      }
    }
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
  // Use localStorage sid as fallback so data is available before AuthContext sets schoolId
  const safeSid = sid || localStorage.getItem('schofy_current_school_id') || '';

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
