import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { store } from '../lib/store';
import { dataService } from '../lib/database/SupabaseDataService';
import { isCloudSyncEnabled } from '../utils/desktopSyncPreference';

import { useAuth } from '../contexts/AuthContext';

interface RealtimeSyncContextType { isConnected: boolean; }
const RealtimeSyncContext = createContext<RealtimeSyncContextType>({ isConnected: false });
export function useRealtimeSync() { return useContext(RealtimeSyncContext); }

const REALTIME_TABLES = [
  'students', 'staff', 'classes', 'subjects', 'fees', 'fee_structures',
  'payments', 'salary_payments', 'announcements', 'notifications',
  'attendance', 'exams', 'exam_results', 'transport_routes',
  'transport_assignments', 'bursaries', 'discounts', 'invoices', 'settings',
  'timetable', 'point_transactions', 'inventory', 'expenses', 'audit_logs', 'library_books', 'library_issues',
  'homework', 'behavior_logs', 'parent_messages', 'student_attendance',
  'staff_attendance', 'exam_timetable', 'lesson_plans', 'student_resources',
  'hostel_rooms', 'hostel_assignments', 'events', 'visitor_logs',
  'certificates', 'schools', 'subscriptions', 'users', 'plans',
];

const TABLE_NAME_MAP: Record<string, string> = {
  fee_structures: 'feeStructures', exam_results: 'examResults',
  transport_routes: 'transportRoutes', transport_assignments: 'transportAssignments',
  salary_payments: 'salaryPayments', point_transactions: 'pointTransactions',
  audit_logs: 'auditLogs',
  library_books: 'libraryBooks', library_issues: 'libraryIssues',
  behavior_logs: 'behaviorLogs', parent_messages: 'parentMessages',
  student_attendance: 'studentAttendance', staff_attendance: 'staffAttendance',
  exam_timetable: 'examTimetable', lesson_plans: 'lessonPlans',
  student_resources: 'studentResources', hostel_rooms: 'hostelRooms',
  hostel_assignments: 'hostelAssignments',
};
function localName(t: string) { return TABLE_NAME_MAP[t] || t; }

// Only refresh tables with active subscribers and stale data
function refreshStale(sid: string) {
  if (!sid) return;
  store.refreshStale(sid, store.getActiveTables(sid, REALTIME_TABLES.map(localName)));
}

const POLL_INTERVAL = 10 * 60_000; // Safety net only; realtime handles normal updates

function refreshActive(sid: string) {
  if (!sid) return;
  store.refreshCurrentPage(sid);
}

export function RealtimeSyncProvider({ children }: { children: React.ReactNode }) {
  const { schoolId, user } = useAuth();
  const sid = schoolId || user?.id || '';
  
  const [isConnected, setIsConnected] = useState(false);

  // ── Delegation to dataService for all realtime logic ────────────────────────
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !sid || !user || !isCloudSyncEnabled()) {
      setIsConnected(false);
      return;
    }

    // We don't call it here directly if serviceManager is handling it.
    // But for safety and consistency with current architecture:
    dataService.startRealtimeSync(sid);
    setIsConnected(isCloudSyncEnabled());

    const handleOnline = () => {
      if (!isCloudSyncEnabled()) {
        setIsConnected(false);
        return;
      }
      dataService.startRealtimeSync(sid);
      refreshActive(sid);
      setIsConnected(true);
    };

    const handleVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (!isCloudSyncEnabled()) {
        setIsConnected(false);
        return;
      }
      dataService.startRealtimeSync(sid);
      refreshActive(sid);
      setIsConnected(true);
    };

    const handleSyncPreference = () => {
      if (!isCloudSyncEnabled()) {
        dataService.stopRealtimeSync();
        setIsConnected(false);
      } else {
        dataService.startRealtimeSync(sid);
        setIsConnected(true);
      }
    };

    const interval = window.setInterval(() => refreshStale(sid), POLL_INTERVAL);
    window.addEventListener('online', handleOnline);
    window.addEventListener('schofyCloudSyncPreferenceChanged', handleSyncPreference);
    document.addEventListener('visibilitychange', handleVisible);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('schofyCloudSyncPreferenceChanged', handleSyncPreference);
      document.removeEventListener('visibilitychange', handleVisible);
      setIsConnected(false);
      dataService.scheduleRealtimeStop();
    };
  }, [sid, user]);

  return (
    <RealtimeSyncContext.Provider value={{ isConnected }}>
      {children}
    </RealtimeSyncContext.Provider>
  );
}
