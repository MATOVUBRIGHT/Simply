/**
 * Global reactive data store — fast, minimal Supabase requests.
 * - One fetch per table, shared across all components
 * - 5-minute cache: no re-fetch unless data is stale or explicitly invalidated
 * - Writes invalidate only the affected table
 * - Realtime events invalidate only the changed table
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

const STALE_MS = 5 * 60_000; // 5 minutes — only re-fetch when truly stale

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
    this.state.set(k, { ...this.get(sid, table), ...patch });
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

    // Skip if fresh
    if (!force && s.lastFetch > 0 && Date.now() - s.lastFetch < STALE_MS) return;

    // Deduplicate concurrent fetches for the same table
    const existing = this.fetching.get(k);
    if (existing) return existing;

    const req = (async () => {
      this.set(sid, table, { loading: true, error: null });
      try {
        const data = await dataService.getAll(sid, table);
        // Mark as fresh — if data came from cache, it's already fresh
        this.set(sid, table, { data, loading: false, lastFetch: Date.now() });
      } catch (e: any) {
        this.set(sid, table, { loading: false, error: e.message });
      } finally {
        this.fetching.delete(k);
      }
    })();

    this.fetching.set(k, req);
    return req;
  }

  /** Called after a write — invalidate only this table */
  invalidate(sid: string, table: string) {
    this.set(sid, table, { lastFetch: 0 });
    void this.fetch(sid, table, true);
  }

  /** Seed store from cache without triggering a network fetch */
  seed(sid: string, table: string, data: any[]) {
    const s = this.get(sid, table);
    if (s.data.length === 0 && s.lastFetch === 0 && data.length > 0) {
      this.set(sid, table, { data, loading: false, lastFetch: Date.now() - 4 * 60_000 }); // mark as slightly stale so it refreshes soon
    }
  }

  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /** Called by realtime — debounced to prevent duplicate fetches from rapid events */
  onRemoteChange(sid: string, table: string) {
    const age = Date.now() - this.get(sid, table).lastFetch;
    if (age < 2000) return; // skip echo from own writes

    const k = this.key(sid, table);
    const existing = this.debounceTimers.get(k);
    if (existing) clearTimeout(existing);

    this.debounceTimers.set(k, setTimeout(() => {
      this.debounceTimers.delete(k);
      this.set(sid, table, { lastFetch: 0 });
      void this.fetch(sid, table, true);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(`${table}Updated`));
        window.dispatchEvent(new CustomEvent('dataRefresh', { detail: { table } }));
      }
    }, 300));
  }

  /** Refresh only tables that are actually stale (used by polling) */
  refreshStale(sid: string, tables: string[]) {
    if (!sid) return;
    for (const table of tables) {
      const s = this.get(sid, table);
      // Only re-fetch if data is older than 30s AND there are active subscribers
      const k = this.key(sid, table);
      const hasSubscribers = (this.listeners.get(k)?.size ?? 0) > 0;
      if (hasSubscribers && Date.now() - s.lastFetch > 30_000) {
        void this.fetch(sid, table, true);
      }
    }
  }
}

export const store = new DataStore();

// Register globally so SupabaseDataService can call onRemoteChange without circular import
(globalThis as any).__schofyStore = store;

// ── React hook ────────────────────────────────────────────────────────────────

export function useTableData(sid: string | null | undefined, table: string) {
  const safeSid = sid || '';

  const subscribe = useCallback(
    (listener: Listener) => {
      if (!safeSid) return () => {};
      // Seed from localStorage cache immediately (synchronous, no network)
      const snap = store.getSnapshot(safeSid, table);
      if (snap.data.length === 0 && snap.lastFetch === 0) {
        void dataService.getAll(safeSid, table).then(data => {
          store.seed(safeSid, table, data);
        });
      }
      // Trigger background fetch (won't re-fetch if data is fresh)
      void store.fetch(safeSid, table);
      return store.subscribe(safeSid, table, listener);
    },
    [safeSid, table]
  );

  const getSnapshot = useCallback(
    () => store.getSnapshot(safeSid, table),
    [safeSid, table]
  );

  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const refresh = useCallback(() => {
    if (safeSid) store.invalidate(safeSid, table);
  }, [safeSid, table]);

  return { data: state.data, loading: state.loading, error: state.error, refresh };
}
