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

  constructor() {
    this.deviceId = userDBManager.getDeviceId();
  }

  private isOnline(): boolean {
    return navigator.onLine;
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

    // If online and Supabase configured, save to cloud first
    if (this.isOnline() && isSupabaseConfigured && supabase) {
      try {
        const supabaseData = this.mapLocalToSupabase({ ...localRecord }, tableName);
        
        const { error } = await supabase
          .from(tableName)
          .insert(supabaseData)
          .select()
          .single();

        if (error) {
          console.error(`Supabase create error for ${tableName}:`, error);
          // Save locally and queue for sync
          await userDBManager.add(userId, tableName, { ...localRecord, id: localId });
          await this.queueForSync(userId, tableName, localId, 'create', localRecord);
          
          return {
            success: true,
            syncedRemotely: false,
            savedLocally: true,
            error: error.message,
          };
        }

        // Success - save locally with synced status
        localRecord.syncStatus = 'synced';
        await userDBManager.add(userId, tableName, localRecord);
        
        this.broadcastChange(tableName, 'INSERT', localRecord, userId);
        console.log(`✅ Created ${tableName} in Supabase and locally`);
        
        return {
          success: true,
          syncedRemotely: true,
          savedLocally: true,
        };
      } catch (err: any) {
        console.error(`Create error for ${tableName}:`, err);
        // Save locally as fallback
        await userDBManager.add(userId, tableName, { ...localRecord, id: localId });
        await this.queueForSync(userId, tableName, localId, 'create', localRecord);
        
        this.broadcastChange(tableName, 'INSERT', { ...localRecord, id: localId }, userId);
        
        return {
          success: true,
          syncedRemotely: false,
          savedLocally: true,
          error: err.message,
        };
      }
    }

    // Offline - save locally and queue
    await userDBManager.add(userId, tableName, { ...localRecord, id: localId });
    await this.queueForSync(userId, tableName, localId, 'create', localRecord);
    
    this.broadcastChange(tableName, 'INSERT', { ...localRecord, id: localId }, userId);
    
    return {
      success: true,
      syncedRemotely: false,
      savedLocally: true,
    };
  }

  async update<T extends SyncableRecord>(
    userId: string,
    tableName: string,
    id: string,
    data: Partial<T>
  ): Promise<SyncResult> {
    const now = new Date().toISOString();
    
    // Prepare local record
    const localRecord: any = {
      ...data,
      updatedAt: now,
      syncStatus: 'pending' as SyncStatus,
      deviceId: this.deviceId,
    };

    // If online and Supabase configured, update cloud first
    if (this.isOnline() && isSupabaseConfigured && supabase) {
      try {
        const supabaseData = this.mapLocalToSupabase({ ...localRecord }, tableName);
        
        const { error } = await supabase
          .from(tableName)
          .update(supabaseData)
          .eq('id', id);

        if (error) {
          console.error(`Supabase update error for ${tableName}:`, error);
          // Update locally and queue
          const existing = await userDBManager.get(userId, tableName, id);
          if (existing) {
            await userDBManager.put(userId, tableName, { ...existing, ...localRecord, id });
            await this.queueForSync(userId, tableName, id, 'update', { ...existing, ...localRecord });
          }
          
          return {
            success: true,
            syncedRemotely: false,
            savedLocally: true,
            error: error.message,
          };
        }

        // Success - update locally
        const existing = await userDBManager.get(userId, tableName, id);
        if (existing) {
          const updatedRecord = { ...existing, ...localRecord, syncStatus: 'synced', id };
          await userDBManager.put(userId, tableName, updatedRecord);
          this.broadcastChange(tableName, 'UPDATE', updatedRecord, userId);
        }
        
        console.log(`✅ Updated ${tableName}/${id} in Supabase and locally`);
        
        return {
          success: true,
          syncedRemotely: true,
          savedLocally: true,
        };
      } catch (err: any) {
        console.error(`Update error for ${tableName}:`, err);
        const existing = await userDBManager.get(userId, tableName, id);
        if (existing) {
          const updatedRecord = { ...existing, ...localRecord, id };
          await userDBManager.put(userId, tableName, updatedRecord);
          await this.queueForSync(userId, tableName, id, 'update', updatedRecord);
          this.broadcastChange(tableName, 'UPDATE', updatedRecord, userId);
        }
        
        return {
          success: true,
          syncedRemotely: false,
          savedLocally: true,
          error: err.message,
        };
      }
    }

    // Offline - update locally and queue
    const existing = await userDBManager.get(userId, tableName, id);
    if (existing) {
      const updatedRecord = { ...existing, ...localRecord, id };
      await userDBManager.put(userId, tableName, updatedRecord);
      await this.queueForSync(userId, tableName, id, 'update', updatedRecord);
      this.broadcastChange(tableName, 'UPDATE', updatedRecord, userId);
    }
    
    return {
      success: true,
      syncedRemotely: false,
      savedLocally: true,
    };
  }

  async delete(
    userId: string,
    tableName: string,
    id: string
  ): Promise<SyncResult> {
    // If online and Supabase configured, delete from cloud first
    if (this.isOnline() && isSupabaseConfigured && supabase) {
      try {
        const { error } = await supabase
          .from(tableName)
          .delete()
          .eq('id', id);

        if (error) {
          console.error(`Supabase delete error for ${tableName}:`, error);
          // Delete locally and queue
          await userDBManager.delete(userId, tableName, id);
          await this.queueForSync(userId, tableName, id, 'delete', { id });
          
          return {
            success: true,
            syncedRemotely: false,
            savedLocally: true,
            error: error.message,
          };
        }

        // Success - delete locally
        await userDBManager.delete(userId, tableName, id);
        
        this.broadcastChange(tableName, 'DELETE', { id }, userId);
        console.log(`✅ Deleted ${tableName}/${id} from Supabase and locally`);
        
        return {
          success: true,
          syncedRemotely: true,
          savedLocally: true,
        };
      } catch (err: any) {
        console.error(`Delete error for ${tableName}:`, err);
        await userDBManager.delete(userId, tableName, id);
        await this.queueForSync(userId, tableName, id, 'delete', { id });
        this.broadcastChange(tableName, 'DELETE', { id }, userId);
        
        return {
          success: true,
          syncedRemotely: false,
          savedLocally: true,
          error: err.message,
        };
      }
    }

    // Offline - delete locally and queue
    await userDBManager.delete(userId, tableName, id);
    await this.queueForSync(userId, tableName, id, 'delete', { id });
    this.broadcastChange(tableName, 'DELETE', { id }, userId);
    
    return {
      success: true,
      syncedRemotely: false,
      savedLocally: true,
    };
  }

  async getAll(userId: string, tableName: string): Promise<any[]> {
    // If online, try to fetch from cloud
    if (this.isOnline() && isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from(tableName)
          .select('*')
          .order('created_at', { ascending: false });

        if (error) {
          console.error(`Supabase fetch error for ${tableName}:`, error);
          // Fall back to local
          return await userDBManager.getAll(userId, tableName);
        }

        // Got data from cloud - update local cache
        if (data && data.length > 0) {
          const mappedData = data.map(item => this.mapSupabaseToLocal(item, tableName));
          
          // Clear and repopulate local
          await userDBManager.clear(userId, tableName);
          for (const item of mappedData) {
            await userDBManager.put(userId, tableName, item);
          }
        }
        
        console.log(`📥 Loaded ${data?.length || 0} records from cloud for ${tableName}`);
        return data?.map(item => this.mapSupabaseToLocal(item, tableName)) || [];
      } catch (err) {
        console.error(`Fetch error for ${tableName}:`, err);
        return await userDBManager.getAll(userId, tableName);
      }
    }

    // Offline - use local data
    return await userDBManager.getAll(userId, tableName);
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
