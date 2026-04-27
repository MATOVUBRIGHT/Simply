import { SupabaseClient } from '@supabase/supabase-js';
import { dataService } from '../lib/database/SupabaseDataService';

class SyncService {
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  /** Background pull + push interval (automatic; no manual sync required). */
  private readonly SYNC_INTERVAL_MS = 30000;
  private currentUserId: string | null = null;
  private currentSchoolId: string | null = null;
  private intervalSchoolId: string | null = null;
  private syncEnabled = false;
  private syncInProgress = false;
  private visibilityHandler: (() => void) | null = null;

  configure(options: { supabaseClient?: SupabaseClient }) {
    // Supabase client is provided through shared singleton in lib/supabase.
    // Keep method for backwards compatibility with existing callers.
    if (options.supabaseClient) {
      void options.supabaseClient;
    }
  }

  setUserId(userId: string) {
    this.currentUserId = userId;
    localStorage.setItem('schofy_current_user_id', userId);
  }

  setSchoolId(schoolId: string) {
    this.currentSchoolId = schoolId;
    localStorage.setItem('schofy_current_school_id', schoolId);
  }

  getUserId(): string | null {
    return this.currentUserId || localStorage.getItem('schofy_current_user_id');
  }

  getSchoolId(): string | null {
    return this.currentSchoolId || localStorage.getItem('schofy_current_school_id');
  }

  enableSync() {
    this.syncEnabled = true;
    this.attachVisibilitySync();
    this.startBackgroundSync();
  }

  disableSync() {
    this.syncEnabled = false;
    this.detachVisibilitySync();
    this.stopBackgroundSync();
  }

  private attachVisibilitySync() {
    if (typeof document === 'undefined' || this.visibilityHandler) return;
    this.visibilityHandler = () => {
      if (document.visibilityState !== 'visible' || !this.syncEnabled || !navigator.onLine) return;
      void this.runFullSyncCycle();
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  private detachVisibilitySync() {
    if (typeof document === 'undefined' || !this.visibilityHandler) return;
    document.removeEventListener('visibilitychange', this.visibilityHandler);
    this.visibilityHandler = null;
  }

  startBackgroundSync() {
    if (!this.syncEnabled) return;

    const schoolId = this.getSchoolId();
    if (!schoolId) return;

    if (this.syncInterval && this.intervalSchoolId === schoolId) {
      return;
    }

    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    this.intervalSchoolId = schoolId;

    dataService.startRealtimeSync(schoolId);
    void this.runFullSyncCycle();

    this.syncInterval = setInterval(() => {
      if (!this.syncEnabled || !navigator.onLine) return;
      void this.runFullSyncCycle();
    }, this.SYNC_INTERVAL_MS);
  }

  stopBackgroundSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    this.intervalSchoolId = null;
    dataService.stopRealtimeSync();
  }

  async runFullSyncCycle(): Promise<{ success: boolean; pushed: number; pulled: number; failed: number; error?: string }> {
    if (!this.syncEnabled) {
      return { success: false, pushed: 0, pulled: 0, failed: 0, error: 'Sync disabled.' };
    }

    const schoolId = this.getSchoolId();
    if (!schoolId) {
      return { success: false, pushed: 0, pulled: 0, failed: 0, error: 'No school selected for sync.' };
    }

    if (this.syncInProgress) {
      return { success: false, pushed: 0, pulled: 0, failed: 0, error: 'Sync already in progress.' };
    }
    this.syncInProgress = true;

    try {
      return await dataService.syncNow(schoolId);
    } finally {
      this.syncInProgress = false;
    }
  }
}

export const syncService = new SyncService();
