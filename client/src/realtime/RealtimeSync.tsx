import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { store } from '../lib/store';

interface RealtimeSyncContextType { isConnected: boolean; }
const RealtimeSyncContext = createContext<RealtimeSyncContextType>({ isConnected: false });
export function useRealtimeSync() { return useContext(RealtimeSyncContext); }

const REALTIME_TABLES = [
  'students', 'staff', 'classes', 'subjects', 'fees', 'fee_structures',
  'payments', 'salary_payments', 'announcements', 'notifications',
  'attendance', 'exams', 'exam_results', 'transport_routes',
  'transport_assignments', 'bursaries', 'discounts', 'invoices', 'settings',
];

const TABLE_NAME_MAP: Record<string, string> = {
  fee_structures: 'feeStructures', exam_results: 'examResults',
  transport_routes: 'transportRoutes', transport_assignments: 'transportAssignments',
  salary_payments: 'salaryPayments',
};
function localName(t: string) { return TABLE_NAME_MAP[t] || t; }

// Only refresh tables with active subscribers and stale data
function refreshStale() {
  const sid = localStorage.getItem('schofy_current_school_id') || '';
  if (!sid) return;
  store.refreshStale(sid, REALTIME_TABLES.map(localName));
}

const POLL_INTERVAL = 30_000; // 30 seconds — only for stale tables

export function RealtimeSyncProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const channelRef = useRef<any>(null);
  const pollRef = useRef<number | null>(null);
  const lastActiveRef = useRef<number>(Date.now());

  // ── Single Supabase channel for all tables ──────────────────────────────────
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;

    // One channel, filter per table — much cheaper than 19 channels
    let ch = supabase.channel('schofy-all');
    for (const table of REALTIME_TABLES) {
      ch = ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        const sid = localStorage.getItem('schofy_current_school_id') || '';
        if (sid) store.onRemoteChange(sid, localName(table));
      }) as any;
    }
    ch.subscribe((status: string) => {
      if (status === 'SUBSCRIBED') setIsConnected(true);
    });

    channelRef.current = ch;
    return () => { if (supabase) supabase.removeChannel(ch); };
  }, []);

  // ── Polling fallback — only refreshes stale tables with active subscribers ──
  useEffect(() => {
    function startPoll() {
      if (pollRef.current) return;
      pollRef.current = window.setInterval(() => {
        if (document.visibilityState === 'visible') refreshStale();
      }, POLL_INTERVAL);
    }
    function stopPoll() {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    }
    function onVisible() {
      const away = Date.now() - lastActiveRef.current;
      // Only refresh if away > 30s
      if (away > 30_000) refreshStale();
      lastActiveRef.current = Date.now();
      startPoll();
    }
    function onHidden() { lastActiveRef.current = Date.now(); stopPoll(); }

    document.addEventListener('visibilitychange', () =>
      document.visibilityState === 'visible' ? onVisible() : onHidden()
    );
    window.addEventListener('focus', onVisible);
    startPoll();

    return () => {
      stopPoll();
      window.removeEventListener('focus', onVisible);
    };
  }, []);

  return (
    <RealtimeSyncContext.Provider value={{ isConnected }}>
      {children}
    </RealtimeSyncContext.Provider>
  );
}
