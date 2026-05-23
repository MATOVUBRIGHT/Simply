import { SupabaseClient } from '@supabase/supabase-js';
import { dataService } from '../lib/database/SupabaseDataService';

class SyncService {
  private syncInterval: ReturnType<typeof setTimeout> | null = null;
  /** Background queue-flush interval. Reads are on-demand to protect Supabase limits. */
  private readonly SYNC_INTERVAL_MS = 5 * 60 * 1000;
  /** Maximum backoff interval when repeated failures occur. */
  private readonly MAX_BACKOFF_MS = 10 * 60 * 1000; // 10 minutes (was 30)
  private backoffMs: number | null = null;
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
      clearTimeout(this.syncInterval);
      this.syncInterval = null;
    }
    this.intervalSchoolId = schoolId;

    dataService.startRealtimeSync(schoolId);
    void this.runFullSyncCycle();

    // Adaptive scheduler: use setTimeout so we can apply exponential backoff on failures.
    this.backoffMs = null; // reset any previous backoff
    const scheduleNext = (delayMs: number) => {
      if (this.syncInterval) clearTimeout(this.syncInterval);
      this.syncInterval = setTimeout(async () => {
        if (!this.syncEnabled || !navigator.onLine) return;
        const result = await this.runFullSyncCycle();
        // On success reset backoff; on failure increase it exponentially with jitter
        if (result && result.success) {
          this.backoffMs = null;
          scheduleNext(this.SYNC_INTERVAL_MS);
        } else {
          const prev = this.backoffMs ?? this.SYNC_INTERVAL_MS;
          let next = Math.min(prev * 2, this.MAX_BACKOFF_MS);
          // Add jitter +/- 25%
          const jitter = 1 + (Math.random() * 0.5 - 0.25);
          next = Math.max(1000, Math.round(next * jitter));
          this.backoffMs = next;
          scheduleNext(next);
        }
      }, delayMs);
    };

    scheduleNext(this.SYNC_INTERVAL_MS);
  }

  stopBackgroundSync() {
    if (this.syncInterval) {
      clearTimeout(this.syncInterval);
      this.syncInterval = null;
    }
    this.intervalSchoolId = null;
    dataService.stopRealtimeSync();
  }

  async runFullSyncCycle(): Promise<{ success: boolean; pushed: number; pulled: number; failed: number; error?: string }> {
    if (!this.syncEnabled || !navigator.onLine) {
      return { success: false, pushed: 0, pulled: 0, failed: 0, error: 'Sync unavailable.' };
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
      // Run the lightweight automatic sync cycle.
      return await dataService.syncNow(schoolId);
    } catch (e: any) {
      return { success: false, pushed: 0, pulled: 0, failed: 0, error: e.message };
    } finally {
      this.syncInProgress = false;
    }
  }
}

export const syncService = new SyncService();
