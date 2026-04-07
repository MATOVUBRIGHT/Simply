import { userDBManager } from '../lib/database/UserDatabaseManager';
import { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';

class SyncService {
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private readonly SYNC_INTERVAL = 120000; // Increased to 2 minutes
  private readonly MIN_SYNC_INTERVAL = 10000; // Minimum 10s between syncs
  private lastSyncTime = 0;
  private supabase: SupabaseClient | null = null;
  private currentUserId: string | null = null;
  private syncEnabled = false;
  private isSyncing = false;
  private realtimeChannels: Map<string, RealtimeChannel> = new Map();
  private lastSyncChanges = 0;

  // Only tables that actually exist in Supabase
  private readonly SYNCABLE_TABLES = [
    'schools', 'students', 'staff', 'classes', 'subjects',
    'attendance', 'fees', 'fee_structures', 'bursaries', 'discounts',
    'payments', 'exams', 'exam_results', 'timetable',
    'transport_routes', 'transport_assignments', 'announcements', 'users'
  ];

  configure(options: { supabaseClient?: SupabaseClient }) {
    if (options.supabaseClient) {
      this.supabase = options.supabaseClient;
    }
  }

  setUserId(userId: string) {
    this.currentUserId = userId;
    localStorage.setItem('schofy_current_user_id', userId);
    if (this.syncEnabled) {
      this.restartSync();
    }
  }

  getUserId(): string | null {
    return this.currentUserId || localStorage.getItem('schofy_current_user_id');
  }

  enableSync() {
    this.syncEnabled = true;
    this.startBackgroundSync();
  }

  disableSync() {
    this.syncEnabled = false;
    this.stopBackgroundSync();
  }

  private restartSync() {
    this.stopBackgroundSync();
    this.startBackgroundSync();
  }

  startBackgroundSync() {
    if (!this.syncEnabled || this.syncInterval) return;

    this.subscribeToRealtime();

    this.syncInterval = setInterval(async () => {
      if (!navigator.onLine || !this.getUserId() || this.isSyncing) return;
      
      const now = Date.now();
      // Skip if minimum interval hasn't passed
      if (now - this.lastSyncTime < this.MIN_SYNC_INTERVAL) return;
      
      this.runFullSyncCycle();
    }, this.SYNC_INTERVAL);

    // Initial sync
    if (this.getUserId() && navigator.onLine) {
      this.runFullSyncCycle();
    }
  }

  stopBackgroundSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    this.unsubscribeFromRealtime();
  }

  async runFullSyncCycle(): Promise<void> {
    if (this.isSyncing || !this.syncEnabled) return;
    
    const userId = this.getUserId();
    if (!userId || !this.supabase) return;

    this.isSyncing = true;
    this.lastSyncTime = Date.now();
    console.log('🔄 Starting full sync cycle...');

    try {
      // 1. Upload Phase (Local -> Supabase)
      await this.uploadPendingChanges(userId);

      // 2. Download Phase (Supabase -> Local)
      await this.downloadRemoteChanges(userId);

      // 3. Verification Phase
      await this.verifyConsistency(userId);

      localStorage.setItem(`last_sync_${userId}`, new Date().toISOString());
      console.log('✅ Sync cycle completed');
    } catch (error) {
      console.error('❌ Sync cycle failed:', error);
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * UPLOAD PHASE: Push all pending local changes to Supabase
   */
  private async uploadPendingChanges(userId: string): Promise<void> {
    const pendingRecords = await userDBManager.getAllPendingRecords(userId);
    if (pendingRecords.length === 0) return;

    console.log(`📤 Uploading ${pendingRecords.length} pending records...`);

    // Group by table for batching
    const tableGroups = pendingRecords.reduce((acc, item) => {
      if (!acc[item.table]) acc[item.table] = [];
      acc[item.table].push(item.record);
      return acc;
    }, {} as Record<string, any[]>);

    for (const [localTable, records] of Object.entries(tableGroups)) {
      const remoteTable = this.camelToSnake(localTable);
      
      // Convert to remote format (snake_case)
      const remoteRecords = records.map(r => this.formatForRemote(r, userId));

      try {
        const { error } = await this.supabase!
          .from(remoteTable)
          .upsert(remoteRecords, { onConflict: 'id' });

        if (error) throw error;

        // Mark as synced locally
        for (const record of records) {
          await userDBManager.setSyncStatus(userId, localTable, record.id, 'synced');
        }
        console.log(`✅ Uploaded ${records.length} records to ${remoteTable}`);
      } catch (error) {
        console.error(`❌ Failed to upload ${localTable}:`, error);
        for (const record of records) {
          await userDBManager.setSyncStatus(userId, localTable, record.id, 'failed');
        }
      }
    }
  }

  /**
   * DOWNLOAD PHASE: Fetch remote changes and merge locally
   */
  private async downloadRemoteChanges(userId: string): Promise<void> {
    const lastSync = localStorage.getItem(`last_sync_${userId}`) || '1970-01-01T00:00:00Z';
    
    for (const remoteTable of this.SYNCABLE_TABLES) {
      try {
        let query = this.supabase!
          .from(remoteTable)
          .select('*');

        // Schools table uses 'id' instead of 'school_id'
        if (remoteTable === 'schools') {
          query = query.eq('id', userId);
        } else {
          query = query.eq('school_id', userId);
        }
        
        query = query.gt('updated_at', lastSync);
        const { data, error } = await query;

        if (error) throw error;

        if (data && data.length > 0) {
          console.log(`📥 Downloaded ${data.length} records from ${remoteTable}`);
          await this.mergeRemoteRecords(userId, remoteTable, data);
        }
      } catch (error) {
        console.error(`❌ Failed to download ${remoteTable}:`, error);
      }
    }
  }

  /**
   * MERGE LOGIC: Resolve conflicts using updated_at (Latest Update Wins)
   */
  private async mergeRemoteRecords(userId: string, remoteTable: string, remoteRecords: any[]): Promise<void> {
    const localTable = this.snakeToCamel(remoteTable);

    for (const remoteRecord of remoteRecords) {
      const localRecord = await userDBManager.get(userId, localTable, remoteRecord.id);
      const formattedRemote = this.formatForLocal(remoteRecord);

      if (!localRecord) {
        // New record from remote
        formattedRemote.syncStatus = 'synced';
        await userDBManager.put(userId, localTable, formattedRemote);
      } else {
        // Conflict check
        const remoteUpdatedAt = new Date(remoteRecord.updated_at).getTime();
        const localUpdatedAt = new Date(localRecord.updatedAt).getTime();

        if (remoteUpdatedAt > localUpdatedAt) {
          // Remote is newer, overwrite local
          formattedRemote.syncStatus = 'synced';
          await userDBManager.put(userId, localTable, formattedRemote);
          console.log(`🔄 Conflict resolved: Remote won for ${localTable}:${remoteRecord.id}`);
        } else if (localRecord.syncStatus === 'synced') {
          // Local is same as remote but marked as synced, no action needed
        } else {
          // Local is newer and pending, will be uploaded in next cycle
          console.log(`⏳ Conflict: Local is newer for ${localTable}:${remoteRecord.id}, waiting for upload`);
        }
      }
    }
  }

  /**
   * VERIFICATION: Compare counts and trigger repair if needed
   */
  private async verifyConsistency(userId: string): Promise<void> {
    for (const remoteTable of this.SYNCABLE_TABLES) {
      try {
        let query = this.supabase!
          .from(remoteTable)
          .select('*', { count: 'exact', head: true });

        // Schools table uses 'id' instead of 'school_id'
        if (remoteTable === 'schools') {
          query = query.eq('id', userId);
        } else {
          query = query.eq('school_id', userId);
        }
        
        query = query.is('deleted_at', null);
        const { count, error } = await query;

        if (error) continue;

        const localTable = this.snakeToCamel(remoteTable);
        const localAll = await userDBManager.getAll(userId, localTable);
        const localCount = localAll.filter(r => !r.deletedAt).length;

        if (count !== localCount) {
          console.warn(`⚠️ Inconsistency detected in ${remoteTable}: Remote=${count}, Local=${localCount}. Triggering repair...`);
          
          // REPAIR: Pull all active records for this table regardless of updated_at
          let repairQuery = this.supabase!
            .from(remoteTable)
            .select('*');

          if (remoteTable === 'schools') {
            repairQuery = repairQuery.eq('id', userId);
          } else {
            repairQuery = repairQuery.eq('school_id', userId);
          }
          
          repairQuery = repairQuery.is('deleted_at', null);
          const { data: remoteData, error: pullError } = await repairQuery;

          if (!pullError && remoteData) {
            await this.mergeRemoteRecords(userId, remoteTable, remoteData);
            console.log(`✨ Auto-repaired ${remoteTable}: ${remoteData.length} records synced.`);
          }
        }
      } catch (err) {
        console.error(`Verification failed for ${remoteTable}:`, err);
      }
    }
  }

  /**
   * REAL-TIME: Listen for changes from other devices
   */
  private subscribeToRealtime() {
    if (!this.supabase || !this.syncEnabled) return;

    const userId = this.getUserId();
    if (!userId) return;

    this.SYNCABLE_TABLES.forEach(table => {
      // Schools table uses 'id' instead of 'school_id'
      const filterField = table === 'schools' ? 'id' : 'school_id';
      const channel = this.supabase!
        .channel(`sync:${table}:${userId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: table, filter: `${filterField}=eq.${userId}` },
          async (payload: any) => {
            const schoolField = table === 'schools' ? 'id' : 'school_id';
            if (payload.new && payload.new[schoolField] === userId) {
              console.log(`📡 Real-time change in ${table}`);
              await this.mergeRemoteRecords(userId, table, [payload.new]);
            }
          }
        )
        .subscribe();
      
      this.realtimeChannels.set(table, channel);
    });
  }

  private unsubscribeFromRealtime() {
    this.realtimeChannels.forEach(c => c.unsubscribe());
    this.realtimeChannels.clear();
  }

  // Helper: CamelCase -> snake_case
  private camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, (letter: string) => `_${letter.toLowerCase()}`);
  }

  // Helper: snake_case -> CamelCase
  private snakeToCamel(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  private formatForRemote(record: any, userId: string): any {
    const formatted: any = {};
    for (const [key, value] of Object.entries(record)) {
      if (['syncStatus', 'deviceId'].includes(key)) continue;
      const remoteKey = key === 'schoolId' ? 'school_id' : this.camelToSnake(key);
      formatted[remoteKey] = value;
    }
    formatted.school_id = userId;
    return formatted;
  }

  private formatForLocal(record: any): any {
    const formatted: any = {};
    for (const [key, value] of Object.entries(record)) {
      const localKey = key === 'school_id' ? 'schoolId' : this.snakeToCamel(key);
      formatted[localKey] = value;
    }
    return formatted;
  }
}

export const syncService = new SyncService();
