import { supabase, isSupabaseConfigured } from '../supabase';
import { userDBManager } from './UserDatabaseManager';

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

  private mapLocalToSupabase(local: any, tableName: string): any {
    const mapped: any = { ...local };
    
    // Remove local-only fields
    delete mapped.syncStatus;
    delete mapped.deviceId;
    
    // Map common field names
    if (mapped.createdAt) {
      mapped.created_at = mapped.createdAt;
      delete mapped.createdAt;
    }
    if (mapped.updatedAt) {
      mapped.updated_at = mapped.updatedAt;
      delete mapped.updatedAt;
    }
    if (mapped.schoolId) {
      mapped.school_id = mapped.schoolId;
      delete mapped.schoolId;
    }
    
    // Table-specific mappings
    switch (tableName) {
      case 'students':
        if (mapped.firstName) { mapped.first_name = mapped.firstName; delete mapped.firstName; }
        if (mapped.lastName) { mapped.last_name = mapped.lastName; delete mapped.lastName; }
        if (mapped.guardianName) { mapped.guardian_name = mapped.guardianName; delete mapped.guardianName; }
        if (mapped.guardianPhone) { mapped.guardian_phone = mapped.guardianPhone; delete mapped.guardianPhone; }
        if (mapped.guardianEmail) { mapped.guardian_email = mapped.guardianEmail; delete mapped.guardianEmail; }
        if (mapped.admissionNo) { mapped.admission_no = mapped.admissionNo; delete mapped.admissionNo; }
        break;
        
      case 'staff':
        if (mapped.firstName) { mapped.first_name = mapped.firstName; delete mapped.firstName; }
        if (mapped.lastName) { mapped.last_name = mapped.lastName; delete mapped.lastName; }
        if (mapped.employeeId) { mapped.employee_id = mapped.employeeId; delete mapped.employeeId; }
        break;
        
      case 'classes':
        if (mapped.className) { mapped.class_name = mapped.className; delete mapped.className; }
        break;
        
      case 'attendance':
        if (mapped.entityType) { mapped.entity_type = mapped.entityType; delete mapped.entityType; }
        if (mapped.entityId) { mapped.entity_id = mapped.entityId; delete mapped.entityId; }
        break;
        
      case 'fees':
        if (mapped.paidAmount) { mapped.paid_amount = mapped.paidAmount; delete mapped.paidAmount; }
        if (mapped.dueDate) { mapped.due_date = mapped.dueDate; delete mapped.dueDate; }
        break;
        
      case 'payments':
        if (mapped.feeId) { mapped.fee_id = mapped.feeId; delete mapped.feeId; }
        break;
    }
    
    return mapped;
  }

  private mapSupabaseToLocal(supabase: any, tableName: string): any {
    const mapped: any = { ...supabase };
    
    // Map common field names back
    if (mapped.created_at) {
      mapped.createdAt = mapped.created_at;
      delete mapped.created_at;
    }
    if (mapped.updated_at) {
      mapped.updatedAt = mapped.updated_at;
      delete mapped.updated_at;
    }
    if (mapped.school_id) {
      mapped.schoolId = mapped.school_id;
      delete mapped.school_id;
    }
    
    // Table-specific mappings
    switch (tableName) {
      case 'students':
        if (mapped.first_name) { mapped.firstName = mapped.first_name; delete mapped.first_name; }
        if (mapped.last_name) { mapped.lastName = mapped.last_name; delete mapped.last_name; }
        if (mapped.guardian_name) { mapped.guardianName = mapped.guardian_name; delete mapped.guardian_name; }
        if (mapped.guardian_phone) { mapped.guardianPhone = mapped.guardian_phone; delete mapped.guardian_phone; }
        if (mapped.guardian_email) { mapped.guardianEmail = mapped.guardian_email; delete mapped.guardian_email; }
        if (mapped.admission_no) { mapped.admissionNo = mapped.admission_no; delete mapped.admission_no; }
        break;
        
      case 'staff':
        if (mapped.first_name) { mapped.firstName = mapped.first_name; delete mapped.first_name; }
        if (mapped.last_name) { mapped.lastName = mapped.last_name; delete mapped.last_name; }
        if (mapped.employee_id) { mapped.employeeId = mapped.employee_id; delete mapped.employee_id; }
        break;
        
      case 'classes':
        if (mapped.class_name) { mapped.className = mapped.class_name; delete mapped.class_name; }
        break;
        
      case 'attendance':
        if (mapped.entity_type) { mapped.entityType = mapped.entity_type; delete mapped.entity_type; }
        if (mapped.entity_id) { mapped.entityId = mapped.entity_id; delete mapped.entity_id; }
        break;
        
      case 'fees':
        if (mapped.paid_amount) { mapped.paidAmount = mapped.paid_amount; delete mapped.paid_amount; }
        if (mapped.due_date) { mapped.dueDate = mapped.due_date; delete mapped.due_date; }
        break;
        
      case 'payments':
        if (mapped.fee_id) { mapped.feeId = mapped.fee_id; delete mapped.fee_id; }
        break;
    }
    
    mapped.syncStatus = 'synced';
    return mapped;
  }

  async create<T extends SyncableRecord>(
    userId: string,
    tableName: string,
    data: Omit<T, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus' | 'deviceId'>
  ): Promise<SyncResult> {
    const now = new Date().toISOString();
    const localId = crypto.randomUUID();
    
    // Prepare local record
    const localRecord: any = {
      ...data,
      id: localId,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending' as SyncStatus,
      deviceId: this.deviceId,
      schoolId: data.schoolId || userId,
    };

    // OPTIMISTIC: Save locally first
    try {
      await userDBManager.add(userId, tableName, localRecord);
      await this.queueForSync(userId, tableName, localId, 'create', localRecord);
      this.broadcastChange(tableName, 'INSERT', localRecord, userId);
      
      // Try to sync in background if online, but don't wait for it
      if (this.isOnline() && isSupabaseConfigured && supabase) {
        this.processSyncQueue(userId).catch(err => console.error('Background sync failed:', err));
      }

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
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .eq('school_id', userId)
        .is('deleted_at', null);

      if (!error && data && data.length > 0) {
        console.log(`📥 Full pull: importing ${data.length} records for ${tableName}`);
        for (const item of data) {
          const mapped = this.mapSupabaseToLocal(item, tableName);
          mapped.syncStatus = 'synced';
          await userDBManager.put(userId, tableName, mapped);
        }
        window.dispatchEvent(new Event('dataRefresh'));
      }
    } catch (err) {
      console.error(`Full pull error for ${tableName}:`, err);
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
      // Get last updated timestamp from local data
      const localRecords = await userDBManager.getAll(userId, tableName);
      const lastUpdated = localRecords.reduce((max, r) => {
        const current = r.updatedAt ? new Date(r.updatedAt).getTime() : 0;
        return current > max ? current : max;
      }, 0);

      const lastSyncTime = lastUpdated > 0 
        ? new Date(lastUpdated).toISOString() 
        : '1970-01-01T00:00:00Z';

      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .eq('school_id', userId)
        .gt('updated_at', lastSyncTime);

      if (!error && data && data.length > 0) {
        console.log(`📥 Delta pull: found ${data.length} new/updated records for ${tableName}`);
        for (const item of data) {
          const mapped = this.mapSupabaseToLocal(item, tableName);
          await userDBManager.put(userId, tableName, mapped);
        }
        // Notify UI that data has changed
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
        const mapped = this.mapSupabaseToLocal(data, tableName);
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
          const mappedData = data.map(item => this.mapSupabaseToLocal(item, tableName));
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

  async processSyncQueue(userId: string): Promise<{ processed: number; failed: number }> {
    if (!this.isOnline() || !isSupabaseConfigured || !supabase) {
      return { processed: 0, failed: 0 };
    }

    try {
      const pendingItems = await userDBManager.getPendingSyncItems(userId);
      let processed = 0;
      let failed = 0;

      for (const item of pendingItems) {
        try {
          const { table, recordId, operation, data } = item;
          const supabaseData = this.mapLocalToSupabase(data, table);
          // Add school_id to data for Supabase (migrations use school_id, not user_id)
          supabaseData.school_id = userId;

          let error;
          
          switch (operation) {
            case 'create':
              const createResult = await supabase.from(table).upsert(supabaseData);
              error = createResult.error;
              break;
            case 'update':
              const updateResult = await supabase.from(table).update(supabaseData).eq('id', recordId);
              error = updateResult.error;
              break;
            case 'delete':
              const deleteResult = await supabase.from(table).delete().eq('id', recordId);
              error = deleteResult.error;
              break;
          }

          if (error) {
            console.error(`Sync failed for ${table}/${recordId}:`, error);
            failed++;
          } else {
            await userDBManager.markSynced(userId, item.id);
            processed++;
            console.log(`✅ Synced ${operation} for ${table}/${recordId}`);
          }
        } catch (err) {
          console.error(`Sync error for item ${item.id}:`, err);
          failed++;
        }
      }

      console.log(`📤 Sync queue processed: ${processed} succeeded, ${failed} failed`);
      return { processed, failed };
    } catch (err) {
      console.error('Error processing sync queue:', err);
      return { processed: 0, failed: 0 };
    }
  }
}

export const dataService = new DataService();
