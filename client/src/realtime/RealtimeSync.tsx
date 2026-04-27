import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { getQueryClient } from '../lib/queryClient';
import { store } from '../lib/store';

interface RealtimeSyncContextType {
  isConnected: boolean;
}

const RealtimeSyncContext = createContext<RealtimeSyncContextType>({ isConnected: false });

export function useRealtimeSync() {
  return useContext(RealtimeSyncContext);
}

// Tables to subscribe to for realtime changes
const REALTIME_TABLES = [
  'students', 'staff', 'classes', 'subjects', 'fees', 'fee_structures',
  'payments', 'salary_payments', 'announcements', 'notifications',
  'attendance', 'exams', 'exam_results', 'transport_routes',
  'transport_assignments', 'bursaries', 'discounts', 'invoices', 'settings',
];

// Map remote table name back to local event name
function localName(remoteTable: string): string {
  const m: Record<string, string> = {
    fee_structures: 'feeStructures', exam_results: 'examResults',
    transport_routes: 'transportRoutes', transport_assignments: 'transportAssignments',
    salary_payments: 'salaryPayments',
  };
  return m[remoteTable] || remoteTable;
}

function notifyUI(remoteTable: string) {
  const local = localName(remoteTable);
  window.dispatchEvent(new CustomEvent(`${local}Updated`));
  window.dispatchEvent(new CustomEvent('schofyDataRefresh', { detail: { table: local } }));
  window.dispatchEvent(new CustomEvent('dataRefresh', { detail: { table: local } }));
  try {
    const qc = getQueryClient();
    void qc.invalidateQueries({ predicate: q => String(q.queryKey[0] ?? '').includes(local) });
  } catch { /* ignore */ }
}

export function RealtimeSyncProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const channelRef = useRef<any>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;

    // Subscribe to all tables with Postgres Changes
    const channel = supabase
      .channel('schofy-realtime-all')
      .on('postgres_changes', { event: '*', schema: 'public' }, (payload: any) => {
        const table = payload.table as string;
        if (REALTIME_TABLES.includes(table)) {
          const local = localName(table);
          // Update store for all active sessions
          const sid = localStorage.getItem('schofy_current_school_id') || '';
          if (sid) store.onRemoteChange(sid, local);
          // Also notify via events for pages not yet using the store
          window.dispatchEvent(new CustomEvent(`${local}Updated`));
          window.dispatchEvent(new CustomEvent('schofyDataRefresh', { detail: { table: local } }));
          window.dispatchEvent(new CustomEvent('dataRefresh', { detail: { table: local } }));
          try {
            const qc = getQueryClient();
            void qc.invalidateQueries({ predicate: q => String(q.queryKey[0] ?? '').includes(local) });
          } catch { /* ignore */ }
        }
      })
      .subscribe((status: string) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current && supabase) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, []);

  return (
    <RealtimeSyncContext.Provider value={{ isConnected }}>
      {children}
    </RealtimeSyncContext.Provider>
  );
}
