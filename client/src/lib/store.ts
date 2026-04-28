/**
 * Global reactive data store.
 * - One Supabase fetch per table per session (cached in memory)
 * - All components share the same data — no duplicate fetches
 * - Writes update the store immediately (optimistic) then confirm from Supabase
 * - Realtime events refresh the store so all devices stay in sync
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

const STALE_MS = 30_000; // re-fetch if data is older than 30s

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
    const prev = this.get(sid, table);
    this.state.set(k, { ...prev, ...patch });
    this.notify(k);
  }

  private notify(k: string) {
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
    const k = this.key(sid, table);
    const s = this.get(sid, table);

    // Return if fresh and not forced
    if (!force && s.lastFetch > 0 && Date.now() - s.lastFetch < STALE_MS) return;

    // Deduplicate concurrent fetches
    if (this.fetching.has(k)) return this.fetching.get(k);

    const req = (async () => {
      this.set(sid, table, { loading: true, error: null });
      try {
        const data = await dataService.getAll(sid, table);
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

  /** Optimistically update local state, then re-fetch to confirm */
  optimisticUpdate(sid: string, table: string, updater: (prev: any[]) => any[]) {
    const s = this.get(sid, table);
    this.set(sid, table, { data: updater(s.data) });
  }

  /** Invalidate and re-fetch a table */
  invalidate(sid: string, table: string) {
    this.set(sid, table, { lastFetch: 0 });
    void this.fetch(sid, table, true);
  }

  /** Called by realtime listener — bust and refresh, then notify all pages */
  onRemoteChange(sid: string, table: string) {
    this.set(sid, table, { lastFetch: 0 });
    // Fire events immediately so pages using local state start reloading now
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(`${table}Updated`));
      window.dispatchEvent(new CustomEvent('dataRefresh', { detail: { table } }));
      window.dispatchEvent(new CustomEvent('schofyDataRefresh', { detail: { table } }));
    }
    // Then fetch fresh data — useTableData subscribers re-render when done
    void this.fetch(sid, table, true);
  }
}

export const store = new DataStore();

// ── React hook ────────────────────────────────────────────────────────────────

export function useTableData(sid: string | null | undefined, table: string) {
  const safeSid = sid || '';

  const subscribe = useCallback(
    (listener: Listener) => {
      if (!safeSid) return () => {};
      // Trigger fetch when first subscriber attaches
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
