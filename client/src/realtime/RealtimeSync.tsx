import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { store } from '../lib/store';

interface RealtimeSyncContextType {
  isConnected: boolean;
}

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

function refreshAll() {
  const sid = localStorage.getItem('schofy_current_school_id') || '';
  if (!sid) return;
  for (const t of REALTIME_TABLES) {
    store.onRemoteChange(sid, localName(t));
  }
}

const POLL_INTERVAL = 8000; // 8 seconds

export function RealtimeSyncProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const channelRef = useRef<any>(null);
  const pollRef = useRef<number | null>(null);
  const lastActiveRef = useRef<number>(Date.now());

  // ── Supabase Postgres Changes (fires instantly when replication is enabled) ──
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;

    const channel = supabase
      .channel('schofy-realtime-all')
      .on('postgres_changes', { event: '*', schema: 'public' }, (payload: any) => {
        const table = payload.table as string;
        if (!REALTIME_TABLES.includes(table)) return;
        const sid = localStorage.getItem('schofy_current_school_id') || '';
        if (sid) store.onRemoteChange(sid, localName(table));
      })
      .subscribe((status: string) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    channelRef.current = channel;
    return () => {
      if (supabase && channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, []);

  // ── Polling fallback — refreshes all tables every 8s when tab is visible ──
  useEffect(() => {
    function startPoll() {
      if (pollRef.current) return;
      pollRef.current = window.setInterval(() => {
        if (document.visibilityState === 'visible') refreshAll();
      }, POLL_INTERVAL);
    }

    function stopPoll() {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    }

    // On tab focus/visibility — refresh immediately if away > 5s
    function onVisible() {
      const away = Date.now() - lastActiveRef.current;
      if (away > 5000) refreshAll();
      lastActiveRef.current = Date.now();
      startPoll();
    }

    function onHidden() {
      lastActiveRef.current = Date.now();
      stopPoll();
    }

    function onFocus() { onVisible(); }

    document.addEventListener('visibilitychange', () => {
      document.visibilityState === 'visible' ? onVisible() : onHidden();
    });
    window.addEventListener('focus', onFocus);

    // Start polling immediately
    startPoll();

    return () => {
      stopPoll();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  return (
    <RealtimeSyncContext.Provider value={{ isConnected }}>
      {children}
    </RealtimeSyncContext.Provider>
  );
}
