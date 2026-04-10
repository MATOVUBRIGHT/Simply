import { userDBManager } from '../lib/database/UserDatabaseManager';
import { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';

class SyncService {
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private readonly SYNC_INTERVAL = 120000; // Increased to 2 minutes
  private readonly MIN_SYNC_INTERVAL = 10000; // Minimum 10s between syncs
  private lastSyncTime = 0;
  private supabase: SupabaseClient | null = null;
  private currentUserId: string | null = null;
  private currentSchoolId: string | null = null;
  private syncEnabled = false;
  private isSyncing = false;
  private realtimeChannels: Map<string, RealtimeChannel> = new Map();

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
  }

  setSchoolId(schoolId: string) {
    this.currentSchoolId = schoolId;
    localStorage.setItem('schofy_current_school_id', schoolId);
    if (this.syncEnabled) {
      this.restartSync();
    }
  }

  getUserId(): string | null {
    return this.currentUserId || localStorage.getItem('schofy_current_user_id');
  }

  getSchoolId(): string | null {
    return this.currentSchoolId || localStorage.getItem('schofy_current_school_id');
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
    
    // Trigger an immediate sync to pull initial data
    setTimeout(() => {
      if (Date.now() - this.lastSyncTime >= this.MIN_SYNC_INTERVAL) {
        this.runFullSyncCycle();
      }
    }, 1000);

    this.syncInterval = setInterval(async () => {
      if (!navigator.onLine || !this.getUserId() || this.isSyncing) return;
      
      const now = Date.now();
      // Skip if minimum interval hasn't passed
      if (now - this.lastSyncTime < this.MIN_SYNC_INTERVAL) return;
      
      this.runFullSyncCycle();
    }, this.SYNC_INTERVAL);

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
    const schoolId = this.getSchoolId();
    if (!userId || !schoolId || !this.supabase) return;

    this.isSyncing = true;
    this.lastSyncTime = Date.now();
    console.log('🔄 Starting full sync cycle...');

    try {
      // 1. Upload Phase (Local -> Supabase)
      await this.uploadPendingChanges(userId);

      // 2. Download Phase (Supabase -> Local)
      await this.downloadRemoteChanges(userId, schoolId);

      // 3. Verification Phase
      await this.verifyConsistency(userId, schoolId);

      localStorage.setItem(`last_sync_${userId}`, new Date().toISOString());
      console.log('✅ Sync cycle completed');
      
      // Clear cache and trigger UI refresh to show new data immediately
      try {
        const { queryCache } = await import('../lib/cache/QueryCache');
        queryCache.clear();
      } catch (e) {
         console.warn("Could not clear cache", e);
      }
      window.dispatchEvent(new CustomEvent('schofyDataRefresh'));
      window.dispatchEvent(new CustomEvent('dataRefresh'));
      
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
    const pendingItems = await userDBManager.getPendingSyncItems(userId);
    if (pendingItems.length === 0) return;

    console.log(`📤 Uploading ${pendingItems.length} pending records...`);

    for (const item of pendingItems) {
      const { table, recordId, operation, data } = item;
      const remoteTable = this.camelToSnake(table);
      const remoteData = this.formatForRemote(data, userId, remoteTable);

      try {
        if (operation === 'delete') {
          let deleteQuery = this.supabase!
            .from(remoteTable)
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', recordId);
          
          if (remoteTable !== 'schools' && remoteTable !== 'users') {
            deleteQuery = deleteQuery.eq('school_id', userId);
          }
          
          const { error } = await deleteQuery;
          if (error) throw error;
        } else {
          const { error } = await this.supabase!
            .from(remoteTable)
            .upsert(remoteData, { onConflict: 'id' });
          if (error) throw error;
        }

        // Mark as synced
        await userDBManager.markSynced(userId, item.id);
        console.log(`✅ Synced ${operation} for ${table}/${recordId}`);
      } catch (error) {
        console.error(`❌ Failed to sync ${table}/${recordId}:`, error);
      }
    }
  }

  /**
   * DOWNLOAD PHASE: Fetch remote changes and merge locally
   */
  private async downloadRemoteChanges(userId: string, schoolId: string): Promise<void> {
    const lastSync = localStorage.getItem(`last_sync_${userId}`) || '1970-01-01T00:00:00Z';
    console.log(`📥 Pulling changes since ${lastSync} for school ${schoolId} (user ${userId})`);
    
    for (const remoteTable of this.SYNCABLE_TABLES) {
      try {
        let query = this.supabase!
          .from(remoteTable)
          .select('*');

        // Logic for identifying records belonging to this school
        if (remoteTable === 'schools') {
          query = query.eq('id', schoolId);
        } else {
          query = query.eq('school_id', schoolId);
        }
        
        query = query.gt('updated_at', lastSync);
        const { data, error } = await query;

        if (error) {
          console.error(`❌ Error pulling ${remoteTable}:`, error.message);
          continue;
        }

        if (data && data.length > 0) {
          console.log(`📥 Received ${data.length} records from ${remoteTable}`);
          await this.mergeRemoteRecords(userId, remoteTable, data);
        } else {
          // console.log(`✓ ${remoteTable} is up to date.`);
        }
      } catch (error) {
        console.error(`❌ Failed to download ${remoteTable}:`, error);
      }
    }
    
    localStorage.setItem(`last_sync_${userId}`, new Date().toISOString());
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
  private async verifyConsistency(userId: string, schoolId: string): Promise<void> {
    for (const remoteTable of this.SYNCABLE_TABLES) {
      try {
        let query = this.supabase!
          .from(remoteTable)
          .select('*', { count: 'exact', head: true });

        // Schools table uses 'id' instead of 'school_id'
        if (remoteTable === 'schools') {
          query = query.eq('id', schoolId);
        } else {
          query = query.eq('school_id', schoolId);
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
            repairQuery = repairQuery.eq('id', schoolId);
          } else {
            repairQuery = repairQuery.eq('school_id', schoolId);
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
    const schoolId = this.getSchoolId();
    if (!userId || !schoolId) return;

    this.SYNCABLE_TABLES.forEach(table => {
      // Schools table uses 'id' instead of 'school_id'
      const filterField = table === 'schools' ? 'id' : 'school_id';
      const channelId = schoolId;
      const channel = this.supabase!
        .channel(`sync:${table}:${channelId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: table, filter: `${filterField}=eq.${channelId}` },
          async (payload: any) => {
            const schoolField = table === 'schools' ? 'id' : 'school_id';
            
            // Handle different event types
            if (payload.eventType === 'INSERT' && payload.new && payload.new[schoolField] === channelId) {
              console.log(`📡 Real-time INSERT in ${table}:`, payload.new.id);
              await this.mergeRemoteRecords(userId, table, [payload.new]);
              this.triggerUIRefresh(table, 'INSERT', payload.new);
            } else if (payload.eventType === 'UPDATE' && payload.new && payload.new[schoolField] === channelId) {
              console.log(`📡 Real-time UPDATE in ${table}:`, payload.new.id);
              await this.mergeRemoteRecords(userId, table, [payload.new]);
              this.triggerUIRefresh(table, 'UPDATE', payload.new);
            } else if (payload.eventType === 'DELETE' && payload.old && payload.old[schoolField] === channelId) {
              console.log(`📡 Real-time DELETE in ${table}:`, payload.old.id);
              await this.handleRemoteDelete(userId, table, payload.old.id);
              this.triggerUIRefresh(table, 'DELETE', payload.old);
            }
          }
        )
        .subscribe();
      
      this.realtimeChannels.set(table, channel);
    });
    
    console.log(`📡 Subscribed to real-time updates for ${this.SYNCABLE_TABLES.length} tables`);
  }

  private unsubscribeFromRealtime() {
    this.realtimeChannels.forEach(c => c.unsubscribe());
    this.realtimeChannels.clear();
  }

  /**
   * Handle remote DELETE events
   */
  private async handleRemoteDelete(userId: string, table: string, recordId: string): Promise<void> {
    const localTable = this.snakeToCamel(table);
    try {
      // Mark as deleted locally instead of removing to maintain sync state
      const existingRecord = await userDBManager.get(userId, localTable, recordId);
      if (existingRecord) {
        existingRecord.deletedAt = new Date().toISOString();
        existingRecord.syncStatus = 'synced';
        await userDBManager.put(userId, localTable, existingRecord);
        console.log(`🗑️ Remote delete handled for ${localTable}:${recordId}`);
      }
    } catch (error) {
      console.error(`Failed to handle remote delete for ${localTable}:${recordId}:`, error);
    }
  }

  /**
   * Trigger UI refresh events for real-time updates
   */
  private triggerUIRefresh(table: string, eventType: 'INSERT' | 'UPDATE' | 'DELETE', record: any): void {
    const localTable = this.snakeToCamel(table);
    
    // Trigger table-specific event
    const tableName = localTable.charAt(0).toUpperCase() + localTable.slice(1);
    const eventName = `${tableName}Updated`;
    window.dispatchEvent(new CustomEvent(eventName, { 
      detail: { type: eventType, record, table: localTable } 
    }));
    
    // Trigger general data refresh event
    window.dispatchEvent(new CustomEvent('schofyDataRefresh', { 
      detail: { type: eventType, table: localTable, record } 
    }));
    
    // Trigger specific table refresh for components listening
    window.dispatchEvent(new CustomEvent(`${localTable}DataChanged`, { 
      detail: { type: eventType, record, table: localTable } 
    }));
    
    console.log(`🔄 UI refresh triggered for ${eventType} on ${localTable}`);
  }

  // Helper: CamelCase -> snake_case
  private camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, (letter: string) => `_${letter.toLowerCase()}`);
  }

  // Helper: snake_case -> CamelCase
  private snakeToCamel(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  private formatForRemote(record: any, userId: string, remoteTable: string): any {
    const formatted: any = { ...record };
    // Remove client-only fields
    delete formatted.syncStatus;
    delete formatted.deviceId;
    // Convert field names to snake_case
    const result: any = {};
    for (const [key, value] of Object.entries(formatted)) {
      const snakeKey = key === 'schoolId' ? 'school_id' : this.camelToSnake(key);
      result[snakeKey] = value;
    }
    
    // Only add school_id if the table supports it
    if (remoteTable !== 'schools' && remoteTable !== 'users') {
      const schoolId = this.getSchoolId();
      result.school_id = schoolId || userId;
    }
    
    result.id = record.id;
    return result;
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
