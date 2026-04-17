import { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { syncService } from '../services/sync';
import { userDBManager } from '../lib/database/UserDatabaseManager';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

interface SyncContextType {
  isSyncing: boolean;
  isOnline: boolean;
  lastSyncTime: Date | null;
  pendingChanges: number;
  /** @deprecated Automatic sync runs on a timer; kept for rare programmatic refresh. */
  syncNow: (showNotifications?: boolean) => Promise<void>;
  exportBackup: () => Promise<void>;
  importBackup: (file: File) => Promise<boolean>;
  enableSync: () => Promise<void>;
  disableSync: () => void;
  isSyncEnabled: boolean;
  isSupabaseConfigured: boolean;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

export function SyncProvider({ children }: { children: ReactNode }) {
  const { isOnline, user, schoolId } = useAuth();
  const { addToast } = useToast();
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(
    localStorage.getItem('schofy_last_sync') ? new Date(localStorage.getItem('schofy_last_sync')!) : null
  );
  const [pendingChanges, setPendingChanges] = useState(0);
  const [syncEnabled, setSyncEnabled] = useState(localStorage.getItem('schofy_sync_enabled') !== 'false');

  useEffect(() => {
    if (localStorage.getItem('schofy_sync_enabled') === null) {
      localStorage.setItem('schofy_sync_enabled', 'true');
    }
  }, []);

  useEffect(() => {
    const onLifecycle = (e: Event) => {
      const d = (e as CustomEvent<{ inProgress?: boolean }>).detail;
      if (d && typeof d.inProgress === 'boolean') {
        setIsSyncing(d.inProgress);
      }
    };
    window.addEventListener('schofySyncLifecycle', onLifecycle as EventListener);
    return () => window.removeEventListener('schofySyncLifecycle', onLifecycle as EventListener);
  }, []);

  useEffect(() => {
    if (isSupabaseConfigured && supabase) {
      syncService.configure({ supabaseClient: supabase });
      if (syncEnabled) {
        syncService.enableSync();
      }
    }
  }, [syncEnabled]);

  useEffect(() => {
    const sid = schoolId || user?.id;
    if (!sid) return;

    if (user?.id) {
      syncService.setUserId(user.id);
    }
    syncService.setSchoolId(sid);

    if (syncEnabled && isOnline) {
      syncService.startBackgroundSync();
    }
  }, [schoolId, user?.id, syncEnabled, isOnline]);

  const loadPendingCount = useCallback(async () => {
    const sid = schoolId || user?.id;
    if (!sid || !syncEnabled) {
      setPendingChanges(0);
      return;
    }
    try {
      const pending = await userDBManager.getPendingSyncItems(sid);
      setPendingChanges(pending.length);
    } catch {
      setPendingChanges(0);
    }
  }, [schoolId, user?.id, syncEnabled]);

  useEffect(() => {
    void loadPendingCount();
    const interval = setInterval(() => void loadPendingCount(), 12000);
    return () => clearInterval(interval);
  }, [loadPendingCount]);

  const syncNow = useCallback(
    async (showNotifications = true) => {
      const sid = schoolId || user?.id;
      if (!isOnline || !syncEnabled || !sid) {
        if (!syncEnabled && showNotifications) {
          addToast('Enable cloud sync first', 'warning');
        }
        return;
      }
      try {
        const result = await syncService.runFullSyncCycle();
        await loadPendingCount();
        if (result.success) {
          setLastSyncTime(new Date());
          if (showNotifications) {
            addToast('Data synced', 'success');
          }
        } else if (showNotifications) {
          addToast(result.error || 'Sync will retry automatically', 'error');
        }
      } catch (error) {
        if (showNotifications) {
          addToast('Sync will retry automatically', 'error');
        }
      }
    },
    [isOnline, syncEnabled, schoolId, user?.id, addToast, loadPendingCount]
  );

  const wasOnlineRef = useRef(isOnline);
  useEffect(() => {
    if (isOnline && !wasOnlineRef.current && syncEnabled && (schoolId || user?.id)) {
      void syncNow(false);
    }
    wasOnlineRef.current = isOnline;
  }, [isOnline, schoolId, user?.id, syncEnabled, syncNow]);

  const exportBackup = useCallback(async () => {
    const sid = schoolId || user?.id;
    if (!sid || !user?.id) return;

    try {
      const tables = [
        'students',
        'staff',
        'classes',
        'subjects',
        'attendance',
        'fees',
        'payments',
        'announcements',
        'exams',
        'examResults',
        'transportRoutes',
        'transportAssignments',
      ];

      const data: Record<string, any[]> = {};

      for (const table of tables) {
        try {
          const tableData = await userDBManager.getAll(sid, table);
          data[table] = tableData;
        } catch {
          // Table might not exist
        }
      }

      const backup = {
        version: 1,
        exportedAt: new Date().toISOString(),
        userId: user.id,
        data,
      };

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `schofy-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      addToast('📦 Backup exported', 'success');
    } catch (error) {
      console.error('Backup export failed:', error);
      addToast('Failed to export backup', 'error');
    }
  }, [user, schoolId, addToast]);

  const importBackup = useCallback(
    async (file: File): Promise<boolean> => {
      const sid = schoolId || user?.id;
      if (!sid || !user?.id) return false;

      try {
        const text = await file.text();
        const backup = JSON.parse(text);

        if (backup.version !== 1) {
          addToast('Unsupported backup version', 'error');
          return false;
        }

        for (const [table, records] of Object.entries(backup.data)) {
          try {
            await userDBManager.clear(sid, table);
            if (Array.isArray(records)) {
              for (const record of records as { id?: string }[]) {
                if (record?.id) {
                  await userDBManager.put(sid, table, record as { id: string });
                } else {
                  await userDBManager.add(sid, table, record);
                }
              }
            }
          } catch {
            // Table might not exist
          }
        }

        window.dispatchEvent(new Event('schofyDataRefresh'));
        addToast('📦 Backup imported', 'success');
        return true;
      } catch (error) {
        console.error('Backup import failed:', error);
        addToast('Failed to import backup', 'error');
        return false;
      }
    },
    [user, schoolId, addToast]
  );

  const enableSync = useCallback(async () => {
    try {
      if (!isSupabaseConfigured || !supabase) {
        addToast('Cloud sync is not configured', 'error');
        return;
      }

      if (!user) {
        addToast('Please login to enable cloud sync', 'error');
        return;
      }

      const sid = schoolId || user.id;
      localStorage.setItem('schofy_sync_enabled', 'true');
      setSyncEnabled(true);
      syncService.configure({ supabaseClient: supabase });
      syncService.setUserId(user.id);
      syncService.setSchoolId(sid);
      syncService.enableSync();
      syncService.startBackgroundSync();

      await syncNow(false);
      addToast('Cloud sync enabled', 'success');
    } catch (error) {
      console.error('Enable sync error:', error);
      addToast('Failed to enable cloud sync', 'error');
    }
  }, [addToast, user, schoolId, syncNow]);

  const disableSync = useCallback(() => {
    localStorage.setItem('schofy_sync_enabled', 'false');
    setSyncEnabled(false);
    syncService.stopBackgroundSync();
    addToast('Cloud sync paused', 'info');
  }, [addToast]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail as any;
      if (!detail) return;
      if (typeof detail.pendingSyncItems === 'number') {
        setPendingChanges(detail.pendingSyncItems);
      }
      if (detail.lastSyncAt) {
        setLastSyncTime(new Date(detail.lastSyncAt));
      }
    };

    window.addEventListener('schofySyncStatus', handler as EventListener);
    return () => window.removeEventListener('schofySyncStatus', handler as EventListener);
  }, []);

  return (
    <SyncContext.Provider
      value={{
        isSyncing,
        isOnline,
        lastSyncTime,
        pendingChanges,
        syncNow,
        exportBackup,
        importBackup,
        enableSync,
        disableSync,
        isSyncEnabled: syncEnabled,
        isSupabaseConfigured,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  const context = useContext(SyncContext);
  if (context === undefined) {
    throw new Error('useSync must be used within a SyncProvider');
  }
  return context;
}

/** Read-only sync status for header / toolbar (no manual sync actions). */
export function SyncStatusIndicator() {
  const { isOnline, isSyncing, pendingChanges, lastSyncTime, isSyncEnabled } = useSync();

  if (!isSyncEnabled) {
    return null;
  }

  const getStatusColor = () => {
    if (!isOnline) return 'bg-slate-400';
    if (isSyncing) return 'bg-amber-500 animate-pulse';
    if (pendingChanges > 0) return 'bg-orange-500';
    return 'bg-emerald-500';
  };

  const getStatusText = () => {
    if (!isOnline) return 'Offline — local only';
    if (isSyncing) return 'Syncing...';
    if (pendingChanges > 0) return `${pendingChanges} to upload`;
    return 'All data up to date';
  };

  const formatLastSync = () => {
    if (!lastSyncTime) return 'Never';
    const now = new Date();
    const diff = now.getTime() - lastSyncTime.getTime();

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return lastSyncTime.toLocaleDateString();
  };

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
      title={`Last cloud merge: ${formatLastSync()}`}
    >
      <div className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
      <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{getStatusText()}</span>
    </div>
  );
}
