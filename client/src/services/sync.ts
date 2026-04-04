import { userDBManager } from '../lib/database/UserDatabaseManager';
import { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';

class SyncService {
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private readonly SYNC_INTERVAL = 60000;
  private supabase: SupabaseClient | null = null;
  private currentUserId: string | null = null;
  private syncEnabled = false;
  private realtimeChannels: Map<string, RealtimeChannel> = new Map();
  private realtimeUnsubscribers: Function[] = [];

  configure(options: { supabaseClient?: SupabaseClient }) {
    if (options.supabaseClient) {
      this.supabase = options.supabaseClient;
    }
  }

  enableSync() {
    this.syncEnabled = true;
    this.subscribeToRealtime();
  }

  disableSync() {
    this.syncEnabled = false;
    this.stopBackgroundSync();
    this.unsubscribeFromRealtime();
  }

  isSyncEnabled(): boolean {
    return this.syncEnabled;
  }

  setUserId(userId: string) {
    this.currentUserId = userId;
    localStorage.setItem('schofy_current_user_id', userId);
    
    // Re-subscribe to realtime when user changes
    if (this.syncEnabled) {
      this.unsubscribeFromRealtime();
      this.subscribeToRealtime();
    }
  }

  getUserId(): string | null {
    if (this.currentUserId) return this.currentUserId;
    return localStorage.getItem('schofy_current_user_id');
  }

  /**
   * Subscribe to real-time changes from Supabase
   * When any device updates data, all devices get instant notifications
   */
  private subscribeToRealtime() {
    if (!this.supabase || !this.syncEnabled) return;

    const userId = this.getUserId();
    if (!userId) return;

    console.log('🔄 Subscribing to real-time updates for user:', userId);

    // Watch all relevant tables for changes
    const tables = [
      'students', 'staff', 'classes', 'subjects',
      'attendance', 'fees', 'fee_structures', 'payments',
      'announcements', 'exams', 'exam_results', 'timetable',
      'transport_routes', 'transport_assignments'
    ];

    tables.forEach(table => {
      try {
        const channel = this.supabase!
          .channel(`${table}:${userId}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: table,
              filter: `user_id=eq.${userId}`
            },
            async (payload: any) => {
              console.log(`📡 Real-time update for ${table}:`, payload);
              
              try {
                // Handle INSERT and UPDATE events
                if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                  await this.applyRemoteChange(userId, table, payload.new);
                }
                // Handle DELETE events (soft delete)
                else if (payload.eventType === 'DELETE') {
                  await this.applyRemoteChange(userId, table, payload.old);
                }
              } catch (error) {
                console.error(`Failed to apply realtime change for ${table}:`, error);
              }
            }
          )
          .subscribe((status: any) => {
            if (status === 'SUBSCRIBED') {
              console.log(`✅ Real-time subscribed to ${table}`);
            } else if (status === 'CHANNEL_ERROR') {
              console.error(`❌ Real-time error on ${table}`);
            }
          });

        this.realtimeChannels.set(table, channel);
      } catch (error) {
        console.error(`Failed to subscribe to ${table}:`, error);
      }
    });
  }

  /**
   * Unsubscribe from all real-time channels
   */
  private unsubscribeFromRealtime() {
    if (!this.supabase) return;

    console.log('🔌 Unsubscribing from real-time updates');
    
    this.realtimeChannels.forEach((channel) => {
      this.supabase!.removeChannel(channel);
    });
    
    this.realtimeChannels.clear();
    this.realtimeUnsubscribers.forEach(unsub => unsub?.());
    this.realtimeUnsubscribers = [];
  }

  /**
   * Apply a real-time change to local database
   */
  private async applyRemoteChange(userId: string, tableName: string, record: any): Promise<void> {
    try {
      const camelTable = this.snakeToCamel(tableName);
      const formattedRecord = this.formatRecordForLocal(record);
      formattedRecord.userId = userId;
      formattedRecord.syncStatus = 'synced';
      formattedRecord.deviceId = userDBManager.getDeviceId();
      
      await userDBManager.put(userId, camelTable, formattedRecord);
      console.log(`✨ Applied real-time change to ${camelTable}`);
    } catch (error) {
      console.error(`Failed to apply real-time change for ${tableName}:`, error);
    }
  }

  startBackgroundSync() {
    if (!this.syncEnabled || this.syncInterval) return;

    // Subscribe to real-time changes
    try {
      this.subscribeToRealtime();
    } catch (error) {
      console.error('Failed to subscribe to realtime:', error);
    }

    // Also do periodic sync as fallback (every 60 seconds)
    this.syncInterval = setInterval(() => {
      if (navigator.onLine && this.currentUserId) {
        this.syncIncremental();
      }
    }, this.SYNC_INTERVAL);

    // Do initial sync
    if (this.currentUserId && navigator.onLine) {
      try {
        this.syncIncremental();
      } catch (error) {
        console.error('Initial sync failed:', error);
      }
    }
  }

  stopBackgroundSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    this.unsubscribeFromRealtime();
  }

  async syncIncremental(): Promise<void> {
    if (!this.syncEnabled) return;
    
    const userId = this.getUserId();
    if (!userId || !this.supabase) return;

    try {
      await this.pushPendingChanges(userId);
      await this.pullRemoteChanges(userId);
      localStorage.setItem('lastSyncTime', new Date().toISOString());
      console.log('✅ Sync completed successfully');
    } catch (error) {
      console.error('Sync failed:', error);
    }
  }

  async pushPendingChanges(userId: string): Promise<void> {
    if (!this.supabase || !this.syncEnabled) return;

    const pendingItems = await userDBManager.getPendingSyncItems(userId);
    
    if (pendingItems.length === 0) return;
    
    console.log(`📤 Pushing ${pendingItems.length} pending changes...`);

    for (const item of pendingItems) {
      try {
        const tableName = this.camelToSnake(item.table);
        const dataWithUser = {
          ...item.data,
          user_id: userId,
        };

        if (item.operation === 'delete') {
          await this.supabase
            .from(tableName)
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', item.recordId)
            .eq('user_id', userId);
        } else {
          await this.supabase
            .from(tableName)
            .upsert(dataWithUser);
        }

        await userDBManager.markSynced(userId, item.id);
        console.log(`✅ Synced ${item.table} - ${item.operation}`);
      } catch (error) {
        console.error('Failed to push item:', item, error);
      }
    }
  }

  async pullRemoteChanges(userId: string): Promise<void> {
    if (!this.supabase || !this.syncEnabled) return;

    const lastSync = localStorage.getItem('lastSyncTime') || '1970-01-01T00:00:00Z';

    const tables = [
      'students', 'staff', 'classes', 'subjects',
      'attendance', 'fees', 'fee_structures', 'payments',
      'announcements', 'exams', 'exam_results', 'timetable',
      'transport_routes', 'transport_assignments'
    ];

    for (const table of tables) {
      try {
        const { data, error } = await this.supabase
          .from(table)
          .select('*')
          .eq('user_id', userId)
          .eq('deleted_at', null)
          .gt('updated_at', lastSync);

        if (!error && data && data.length > 0) {
          await this.applyRemoteChanges(userId, table, data);
          console.log(`📥 Pulled ${data.length} changes from ${table}`);
        }
      } catch (error) {
        console.error(`Failed to pull ${table}:`, error);
      }
    }
  }

  private async applyRemoteChanges(userId: string, tableName: string, records: any[]): Promise<void> {
    const camelTable = this.snakeToCamel(tableName);

    for (const record of records) {
      const formattedRecord = this.formatRecordForLocal(record);
      formattedRecord.userId = userId;
      formattedRecord.syncStatus = 'synced';
      formattedRecord.deviceId = userDBManager.getDeviceId();
      
      await userDBManager.put(userId, camelTable, formattedRecord);
    }
  }

  private formatRecordForLocal(record: any): any {
    const formatted: any = {};
    for (const [key, value] of Object.entries(record)) {
      formatted[this.snakeToCamel(key)] = value;
    }
    return formatted;
  }

  private camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, (letter: string) => `_${letter.toLowerCase()}`);
  }

  private snakeToCamel(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }
}

export const syncService = new SyncService();
