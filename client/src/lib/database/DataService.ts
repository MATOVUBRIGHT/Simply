import { supabase, isSupabaseConfigured } from '../supabase';
import { userDBManager } from './UserDatabaseManager';
import { generateUUID } from '../../utils/uuid';

export type SyncStatus = 'synced' | 'pending' | 'failed';

interface SyncableRecord {
  id: string;
  schoolId?: string;
  createdAt?: string;
  updatedAt?: string;
  syncStatus?: SyncStatus;
  deviceId?: string;
}

interface SyncResult {
  success: boolean;
  syncedRemotely: boolean;
  savedLocally: boolean;
  error?: string;
}

type BroadcastChange = (table: string, type: 'INSERT' | 'UPDATE' | 'DELETE', record: any, userId: string) => void;

declare global {
  interface Window {
    broadcastSchofyChange?: BroadcastChange;
  }
}

class DataService {
  private deviceId: string;
  private attemptedFullSync: Set<string> = new Set();
  
  // Only sync tables that actually exist in Supabase
  private readonly SUPABASE_TABLES = new Set([
    'schools', 'students', 'staff', 'classes', 'subjects',
    'attendance', 'fees', 'fee_structures', 'bursaries', 'discounts',
    'payments', 'exams', 'exam_results', 'timetable',
    'transport_routes', 'transport_assignments', 'announcements', 'users'
  ]);

  constructor() {
    this.deviceId = userDBManager.getDeviceId();
  }

  private isOnline(): boolean {
    return navigator.onLine;
  }

  private shouldSyncTable(tableName: string): boolean {
    // Convert camelCase to snake_case for comparison
    const snakeCase = tableName.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    return this.SUPABASE_TABLES.has(snakeCase) || this.SUPABASE_TABLES.has(tableName);
  }

  private broadcastChange(table: string, type: 'INSERT' | 'UPDATE' | 'DELETE', record: any, userId: string) {
    if (window.broadcastSchofyChange) {
      try {
        window.broadcastSchofyChange(table, type, record, userId);
      } catch (err) {
        console.error('Broadcast error:', err);
      }
    }
  }

  private camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  }

  private getSupabaseTable(localTable: string): string {
    const snake = this.camelToSnake(localTable);
    if (this.SUPABASE_TABLES.has(snake)) return snake;
    if (this.SUPABASE_TABLES.has(localTable)) return localTable;
    return snake;
  }

  private mapLocalToSupabase(local: any): any {
    const formatted: any = { ...local };
    // Remove client-only fields
    delete formatted.syncStatus;
    delete formatted.deviceId;
    
    // Convert field names to snake_case
    const result: any = {};
    for (const [key, value] of Object.entries(formatted)) {
      const snakeKey = key === 'schoolId' ? 'school_id' : this.camelToSnake(key);
      result[snakeKey] = value;
    }
    
    return result;
  }

  private mapSupabaseToLocal(remote: any): any {
    const formatted: any = {};
    for (const [key, value] of Object.entries(remote)) {
      const localKey = key === 'school_id' ? 'schoolId' : this.snakeToCamel(key);
      formatted[localKey] = value;
    }
    
    formatted.syncStatus = 'synced';
    return formatted;
  }

  private snakeToCamel(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  async create<T extends SyncableRecord>(
    userId: string,
    tableName: string,
    data: Omit<T, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus' | 'deviceId'>
  ): Promise<SyncResult> {
    const now = new Date().toISOString();
    const localId = generateUUID();
    
    // CLOUD-FIRST: Try Supabase first when online
    if (this.isOnline() && isSupabaseConfigured && supabase && this.shouldSyncTable(tableName)) {
      try {
        const remoteTable = this.getSupabaseTable(tableName);
        const formatted = this.mapLocalToSupabase({
          ...data,
          id: localId,
          school_id: userId,
          created_at: now,
          updated_at: now,
        });
        
        const { data: remoteResult, error } = await supabase
          .from(remoteTable)
          .insert(formatted)
          .select()
          .single();

        if (!error && remoteResult) {
          // Success in cloud, save locally with synced status
          const localRecord: any = {
            ...data,
            id: localId,
            createdAt: now,
            updatedAt: now,
            syncStatus: 'synced' as SyncStatus,
            deviceId: this.deviceId,
            schoolId: data.schoolId || userId,
          };
          await userDBManager.add(userId, tableName, localRecord);
          this.broadcastChange(tableName, 'INSERT', localRecord, userId);
          
          return {
            success: true,
            syncedRemotely: true,
            savedLocally: true,
          };
        }
      } catch (cloudError) {
        console.error(`Cloud create error for ${tableName}:`, cloudError);
      }
    }

    // OFFLINE FALLBACK: Save locally and queue for sync
    const localRecord: any = {
      ...data,
      id: localId,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending' as SyncStatus,
      deviceId: this.deviceId,
      schoolId: data.schoolId || userId,
    };

    try {
      await userDBManager.add(userId, tableName, localRecord);
      await this.queueForSync(userId, tableName, localId, 'create', localRecord);
      this.broadcastChange(tableName, 'INSERT', localRecord, userId);

      return {
        success: true,
        syncedRemotely: false,
        savedLocally: true,
      };
    } catch (err: any) {
      console.error(`Local create error for ${tableName}:`, err);
      return {
        success: false,
        syncedRemotely: false,
        savedLocally: false,
        error: err.message,
      };
    }
  }

  async update<T extends SyncableRecord>(
    userId: string,
    tableName: string,
    id: string,
    data: Partial<T>
  ): Promise<SyncResult> {
    const now = new Date().toISOString();
    
    // Prepare local record
    const localUpdate: any = {
      ...data,
      updatedAt: now,
      syncStatus: 'pending' as SyncStatus,
      deviceId: this.deviceId,
    };

    // OPTIMISTIC: Update locally first
    try {
      const existing = await userDBManager.get(userId, tableName, id);
      if (!existing) {
        throw new Error(`Record ${id} not found in ${tableName}`);
      }

      const updatedRecord = { ...existing, ...localUpdate, id };
      await userDBManager.put(userId, tableName, updatedRecord);
      await this.queueForSync(userId, tableName, id, 'update', updatedRecord);
      this.broadcastChange(tableName, 'UPDATE', updatedRecord, userId);

      // Try to sync in background if online
      if (this.isOnline() && isSupabaseConfigured && supabase) {
        this.processSyncQueue(userId).catch(err => console.error('Background sync failed:', err));
      }

      return {
        success: true,
        syncedRemotely: false,
        savedLocally: true,
      };
    } catch (err: any) {
      console.error(`Local update error for ${tableName}:`, err);
      return {
        success: false,
        syncedRemotely: false,
        savedLocally: false,
        error: err.message,
      };
    }
  }

  async delete(
    userId: string,
    tableName: string,
    id: string
  ): Promise<SyncResult> {
    // OPTIMISTIC: Delete locally first
    try {
      await userDBManager.delete(userId, tableName, id);
      await this.queueForSync(userId, tableName, id, 'delete', { id });
      this.broadcastChange(tableName, 'DELETE', { id }, userId);

      // Try to sync in background if online
      if (this.isOnline() && isSupabaseConfigured && supabase) {
        this.processSyncQueue(userId).catch(err => console.error('Background sync failed:', err));
      }

      return {
        success: true,
        syncedRemotely: false,
        savedLocally: true,
      };
    } catch (err: any) {
      console.error(`Local delete error for ${tableName}:`, err);
      return {
        success: false,
        syncedRemotely: false,
        savedLocally: false,
        error: err.message,
      };
    }
  }

  async getAll(userId: string, tableName: string): Promise<any[]> {
    // ALWAYS return local data first for speed
    const localData = await userDBManager.getAll(userId, tableName);
    
    // If local data is empty and this is a syncable table, do a full pull (but only once)
    const syncKey = `${userId}-${tableName}`;
    if (
      localData.length === 0 && 
      this.shouldSyncTable(tableName) &&
      !this.attemptedFullSync.has(syncKey) &&
      this.isOnline() && 
      isSupabaseConfigured && 
      supabase
    ) {
      this.attemptedFullSync.add(syncKey);
      console.log(`📥 Full sync for ${tableName} (new device detected)`);
      await this.pullFull(userId, tableName).catch(err => {
        // Log error but don't break the app
        console.error(`Full sync failed for ${tableName}:`, err);
      });
      return await userDBManager.getAll(userId, tableName);
    }
    
    // In background, if online, pull changes from cloud (Delta Sync)
    if (this.isOnline() && this.shouldSyncTable(tableName) && isSupabaseConfigured && supabase) {
      this.pullDelta(userId, tableName).catch(err => console.error(`Delta pull failed for ${tableName}:`, err));
    }

    return localData;
  }
  
  private async pullFull(userId: string, tableName: string): Promise<void> {
    if (!this.isOnline() || !isSupabaseConfigured || !supabase) return;

    try {
      const remoteTable = this.getSupabaseTable(tableName);
      console.log(`📥 PullFull for ${tableName} (mapped to ${remoteTable}) for user ${userId}`);
      
      let query = supabase.from(remoteTable).select('*');
      
      // Handle tables where ID is the school identifier
      if (remoteTable === 'schools') {
        query = query.eq('id', userId);
      } else {
        query = query.eq('school_id', userId);
      }

      const { data, error } = await query.is('deleted_at', null);

      if (error) {
        console.error(`❌ PullFull error for ${tableName}:`, error.message);
        return;
      }

      if (data && data.length > 0) {
        console.log(`📥 Full pull: found ${data.length} records for ${tableName}`);
        for (const item of data) {
          const mapped = this.mapSupabaseToLocal(item);
          mapped.syncStatus = 'synced';
          await userDBManager.put(userId, tableName, mapped);
        }
        window.dispatchEvent(new Event('dataRefresh'));
      } else {
        console.log(`✓ Full pull: No records found for ${tableName} in Supabase.`);
      }
    } catch (err) {
      console.error(`Full pull exception for ${tableName}:`, err);
    }
  }

  async getPage(
    userId: string,
    tableName: string,
    page: number,
    pageSize: number,
    filter?: (item: any) => boolean,
    sortField: string = 'createdAt',
    sortDir: 'next' | 'prev' = 'prev'
  ): Promise<{ items: any[]; total: number }> {
    // Get from local DB (efficient with cursor)
    const result = await userDBManager.getPage(userId, tableName, page, pageSize, filter, sortField, sortDir);
    
    // Background delta sync
    if (this.isOnline() && isSupabaseConfigured && supabase) {
      this.pullDelta(userId, tableName).catch(err => console.error(`Delta pull failed for ${tableName}:`, err));
    }

    return result;
  }

  async search(
    userId: string,
    tableName: string,
    query: string,
    fields: string[]
  ): Promise<any[]> {
    if (!query) return [];
    return await userDBManager.search(userId, tableName, query, fields);
  }

  async batchDelete(userId: string, tableName: string, ids: string[]): Promise<SyncResult> {
    try {
      await userDBManager.batchDelete(userId, tableName, ids);
      this.broadcastChange(tableName, 'DELETE', { ids }, userId);

      if (this.isOnline() && isSupabaseConfigured && supabase) {
        this.processSyncQueue(userId).catch(err => console.error('Background sync failed:', err));
      }

      return {
        success: true,
        syncedRemotely: false,
        savedLocally: true,
      };
    } catch (err: any) {
      console.error(`Batch delete error for ${tableName}:`, err);
      return {
        success: false,
        syncedRemotely: false,
        savedLocally: false,
        error: err.message,
      };
    }
  }

  private async pullDelta(userId: string, tableName: string): Promise<void> {
    if (!this.isOnline() || !isSupabaseConfigured || !supabase) return;

    try {
      const remoteTable = this.getSupabaseTable(tableName);
      // Get last updated timestamp from local data
      const localRecords = await userDBManager.getAll(userId, tableName);
      const lastUpdated = localRecords.reduce((max, r) => {
        const current = r.updatedAt ? new Date(r.updatedAt).getTime() : 0;
        return current > max ? current : max;
      }, 0);

      const lastSyncTime = lastUpdated > 0 
        ? new Date(lastUpdated).toISOString() 
        : '1970-01-01T00:00:00Z';

      let query = supabase.from(remoteTable).select('*');
      
      // Handle tables where ID is the school identifier
      if (remoteTable === 'schools') {
        query = query.eq('id', userId);
      } else {
        query = query.eq('school_id', userId);
      }

      const { data, error } = await query.gt('updated_at', lastSyncTime);

      if (error) {
        console.error(`❌ Delta pull error for ${tableName}:`, error.message);
        return;
      }

      if (data && data.length > 0) {
        console.log(`📥 Delta pull: found ${data.length} records for ${tableName}`);
        for (const item of data) {
          const mapped = this.mapSupabaseToLocal(item);
          mapped.syncStatus = 'synced';
          await userDBManager.put(userId, tableName, mapped);
        }
        window.dispatchEvent(new Event('dataRefresh'));
      }
    } catch (err) {
      console.error(`Delta pull error for ${tableName}:`, err);
    }
  }

  async get(userId: string, tableName: string, id: string): Promise<any | null> {
    // Try local first (faster)
    const local = await userDBManager.get(userId, tableName, id);
    
    if (local) {
      return local;
    }

    // If online, try cloud
    if (this.isOnline() && isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from(tableName)
          .select('*')
          .eq('id', id)
          .single();

        if (error || !data) {
          return null;
        }

        // Cache locally
        const mapped = this.mapSupabaseToLocal(data);
        await userDBManager.put(userId, tableName, mapped);
        
        return mapped;
      } catch (err) {
        console.error(`Get error for ${tableName}/${id}:`, err);
        return null;
      }
    }

    return null;
  }

  async where(userId: string, tableName: string, fieldName: string, value: any): Promise<any[]> {
    // Map local field name to supabase column name
    const supabaseField = this.mapFieldNameToSupabase(fieldName);
    
    // If online, try to fetch from cloud
    if (this.isOnline() && isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from(tableName)
          .select('*')
          .eq(supabaseField, value);

        if (error) {
          console.error(`Supabase where error for ${tableName}.${fieldName}:`, error);
          // Fall back to local
          return await userDBManager.where(userId, tableName, fieldName, value);
        }

        if (data && data.length > 0) {
          const mappedData = data.map(item => this.mapSupabaseToLocal(item));
          return mappedData;
        }
        
        return [];
      } catch (err) {
        console.error(`Where error for ${tableName}.${fieldName}:`, err);
        return await userDBManager.where(userId, tableName, fieldName, value);
      }
    }

    // Offline - use local data
    return await userDBManager.where(userId, tableName, fieldName, value);
  }

  private mapFieldNameToSupabase(fieldName: string): string {
    // Map camelCase to snake_case for Supabase
    const mappings: Record<string, string> = {
      'schoolId': 'school_id',
      'firstName': 'first_name',
      'lastName': 'last_name',
      'employeeId': 'employee_id',
      'guardianName': 'guardian_name',
      'guardianPhone': 'guardian_phone',
      'guardianEmail': 'guardian_email',
      'admissionNo': 'admission_no',
      'studentId': 'student_id',
      'classId': 'class_id',
      'entityType': 'entity_type',
      'entityId': 'entity_id',
      'feeId': 'fee_id',
      'paidAmount': 'paid_amount',
      'dueDate': 'due_date',
      'createdAt': 'created_at',
      'updatedAt': 'updated_at',
    };
    return mappings[fieldName] || fieldName;
  }

  private async queueForSync(
    userId: string,
    table: string,
    recordId: string,
    operation: 'create' | 'update' | 'delete',
    data: any
  ): Promise<void> {
    try {
      await userDBManager.addToSyncQueue(userId, table, recordId, operation, data);
      console.log(`📤 Queued ${operation} for ${table}/${recordId}`);
    } catch (err) {
      console.error('Failed to queue for sync:', err);
    }
  }

  async clear(userId: string, tableName: string): Promise<void> {
    try {
      await userDBManager.clear(userId, tableName);
    } catch (err) {
      console.error(`Failed to clear ${tableName}:`, err);
    }
  }

  private async processSyncQueue(userId: string): Promise<void> {
    if (!this.isOnline() || !isSupabaseConfigured || !supabase) return;

    try {
      const pendingItems = await userDBManager.getPendingSyncItems(userId);
      if (pendingItems.length === 0) return;

      console.log(`📤 Processing sync queue: ${pendingItems.length} items to upload...`);

      for (const item of pendingItems) {
        try {
          const { table, recordId, operation, data } = item;
          const remoteTable = this.getSupabaseTable(table);
          const supabaseData = this.mapLocalToSupabase(data);
          
          // Add school_id to data for Supabase if the table supports it
          if (remoteTable !== 'schools' && remoteTable !== 'users') {
            supabaseData.school_id = userId;
          }

          console.log(`📤 Syncing ${operation} on ${table}/${recordId} (remote: ${remoteTable})`);

          let error;
          if (operation === 'delete') {
            let deleteQuery = supabase.from(remoteTable).update({ deleted_at: new Date().toISOString() }).eq('id', recordId);
            
            if (remoteTable !== 'schools') {
              deleteQuery = deleteQuery.eq('school_id', userId);
            }
            
            const { error: err } = await deleteQuery;
            error = err;
          } else {
            const { error: err } = await supabase
              .from(remoteTable)
              .upsert(supabaseData);
            error = err;
          }

          if (error) {
            console.error(`❌ Sync failed for ${table}/${recordId}:`, error.message);
            // Don't mark as synced, so it stays in queue
          } else {
            console.log(`✅ Synced ${table}/${recordId}`);
            await userDBManager.markSynced(userId, item.id);
          }
        } catch (itemErr) {
          console.error(`❌ Sync exception for item:`, itemErr);
        }
      }
    } catch (err) {
      console.error('❌ Sync queue processing failed:', err);
    }
  }
}

export const dataService = new DataService();
