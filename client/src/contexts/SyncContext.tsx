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
  syncNow: () => Promise<void>;
  forceFullSync: () => Promise<void>;
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
    localStorage.getItem('schofy_last_sync') 
      ? new Date(localStorage.getItem('schofy_last_sync')!) 
      : null
  );
  const [pendingChanges, setPendingChanges] = useState(0);
  const [syncEnabled, setSyncEnabled] = useState(true); // Always enable sync by default

  // Set default sync enabled in localStorage
  useEffect(() => {
    localStorage.setItem('schofy_sync_enabled', 'true');
  }, []);
  const lastManualSyncRef = useRef<number>(0);
  const syncInProgressRef = useRef(false);

  // Configure sync service with Supabase
  useEffect(() => {
    if (isSupabaseConfigured && supabase) {
      syncService.configure({ supabaseClient: supabase });
      if (syncEnabled) {
        syncService.enableSync();
      }
    }
  }, [syncEnabled]);

  // Set user ID when schoolId changes
  useEffect(() => {
    if (schoolId) {
      syncService.setUserId(schoolId);
      if (syncEnabled && isOnline) {
        syncService.startBackgroundSync();
      }
    }
  }, [schoolId, syncEnabled, isOnline]);

  // Load pending count periodically
  const loadPendingCount = useCallback(async () => {
    if (!schoolId || !syncEnabled) {
      setPendingChanges(0);
      return;
    }
    try {
      const pending = await userDBManager.getPendingSyncItems(schoolId);
      setPendingChanges(pending.length);
    } catch (error) {
      console.error('Failed to load pending count:', error);
      setPendingChanges(0);
    }
  }, [schoolId, syncEnabled]);

  useEffect(() => {
    loadPendingCount();
    const interval = setInterval(loadPendingCount, 5000);
    return () => clearInterval(interval);
  }, [loadPendingCount]);

  const syncNow = useCallback(async (showNotifications = true) => {
    // Prevent multiple concurrent syncs
    if (syncInProgressRef.current || !isOnline || !syncEnabled || !schoolId) {
      if (!syncEnabled && showNotifications) {
        addToast('Enable cloud sync first', 'warning');
      }
      return;
    }

    // Debounce manual syncs - prevent spamming sync button
    const now = Date.now();
    if (showNotifications && now - lastManualSyncRef.current < 3000) {
      return;
    }
    if (showNotifications) {
      lastManualSyncRef.current = now;
    }

    syncInProgressRef.current = true;
    setIsSyncing(true);
    try {
      const pendingBefore = pendingChanges;
      await syncService.runFullSyncCycle();
      await loadPendingCount();
      setLastSyncTime(new Date());
      
      // Only show success toast if user manually triggered sync or if there were pending changes
      if (showNotifications && (pendingBefore > 0 || pendingChanges > 0)) {
        addToast('✅ Data synced', 'success');
      }
    } catch (error) {
      console.error('Sync failed:', error);
      if (showNotifications) {
        addToast('Sync failed - will retry automatically', 'error');
      }
    } finally {
      syncInProgressRef.current = false;
      setIsSyncing(false);
    }
  }, [isOnline, syncEnabled, schoolId, addToast, loadPendingCount, pendingChanges]);

  // Auto-sync only when coming back online (not on every dependency change)
  const wasOnlineRef = useRef(isOnline);
  useEffect(() => {
    if (isOnline && !wasOnlineRef.current && syncEnabled && schoolId) {
      // Just came back online
      syncNow(false);
    }
    wasOnlineRef.current = isOnline;
  }, [isOnline, schoolId, syncEnabled, syncNow]);

  const forceFullSync = useCallback(async () => {
    if (!schoolId) return;
    setIsSyncing(true);
    try {
      // For full sync, we reset the last sync time to 1970
      localStorage.removeItem(`last_sync_${schoolId}`);
      await syncService.runFullSyncCycle();
      setLastSyncTime(new Date());
      await loadPendingCount();
      addToast('✅ Full sync completed', 'success');
    } catch (error) {
      addToast('Full sync failed', 'error');
    } finally {
      setIsSyncing(false);
    }
  }, [schoolId, addToast, loadPendingCount]);

  const exportBackup = useCallback(async () => {
    if (!user?.id) return;
    
    try {
      const tables = [
        'students', 'staff', 'classes', 'subjects',
        'attendance', 'fees', 'payments',
        'announcements', 'exams', 'exam_results',
        'transport_routes', 'transport_assignments'
      ];

      const data: Record<string, any[]> = {};
      
      for (const table of tables) {
        try {
          const tableData = await userDBManager.getAll(user.id, table);
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
  }, [user, addToast]);

  const importBackup = useCallback(async (file: File): Promise<boolean> => {
    if (!user?.id) return false;
    
    try {
      const text = await file.text();
      const backup = JSON.parse(text);

      if (backup.version !== 1) {
        addToast('Unsupported backup version', 'error');
        return false;
      }

      for (const [table, records] of Object.entries(backup.data)) {
        try {
          await userDBManager.clear(user.id, table);
          if (Array.isArray(records)) {
            for (const record of records) {
              await userDBManager.add(user.id, table, record);
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
  }, [user, addToast]);

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
      
      localStorage.setItem('schofy_sync_enabled', 'true');
      setSyncEnabled(true);
      syncService.configure({ supabaseClient: supabase });
      syncService.setUserId(user.id);
      syncService.enableSync();
      syncService.startBackgroundSync();
      
      // Do initial sync (no notifications on startup)
      await syncNow(false);
      addToast('☁️ Cloud sync enabled', 'success');
    } catch (error) {
      console.error('Enable sync error:', error);
      addToast('Failed to enable cloud sync', 'error');
    }
  }, [addToast, user, syncNow]);

  const disableSync = useCallback(() => {
    localStorage.setItem('schofy_sync_enabled', 'false');
    setSyncEnabled(false);
    syncService.stopBackgroundSync();
    addToast('☁️ Cloud sync disabled', 'info');
  }, [addToast]);

  return (
    <SyncContext.Provider value={{
      isSyncing,
      isOnline,
      lastSyncTime,
      pendingChanges,
      syncNow,
      forceFullSync,
      exportBackup,
      importBackup,
      enableSync,
      disableSync,
      isSyncEnabled: syncEnabled,
      isSupabaseConfigured
    }}>
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

export function SyncStatusIndicator() {
  const { isOnline, isSyncing, pendingChanges, lastSyncTime, syncNow, forceFullSync, isSyncEnabled } = useSync();

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
    if (!isOnline) return 'Offline';
    if (isSyncing) return 'Syncing...';
    if (pendingChanges > 0) return `${pendingChanges} pending`;
    return 'Synced';
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
    <div className="flex items-center gap-2">
      <button
        onClick={syncNow}
        disabled={!isOnline || isSyncing}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
        title={`Last sync: ${formatLastSync()}`}
      >
        <div className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
          {getStatusText()}
        </span>
      </button>
      
      <button
        onClick={forceFullSync}
        disabled={isSyncing}
        className="p-1.5 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
        title="Force full sync from cloud"
      >
        <svg className={`w-4 h-4 text-slate-600 dark:text-slate-300 ${isSyncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>
    </div>
  );
}
