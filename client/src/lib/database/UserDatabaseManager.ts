const DB_NAME_PREFIX = 'schofy_user_db_';
const DB_VERSION = 6;

export interface SyncMeta {
  id: string;
  tableName: string;
  lastSyncedAt: string | null;
  pendingChanges: number;
}

export interface UserDBSchema {
  schools: {
    id: string;
    name: string;
    settings: any;
    createdAt: string;
    updatedAt: string;
  };
  students: {
    id: string;
    schoolId: string;
    admissionNo: string;
    studentId: string;
    firstName: string;
    lastName: string;
    gender: string;
    dob: string;
    classId: string;
    address: string;
    guardianName: string;
    guardianPhone: string;
    guardianEmail?: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    syncStatus: 'pending' | 'synced';
    deviceId: string;
  };
  staff: {
    id: string;
    schoolId: string;
    employeeId: string;
    firstName: string;
    lastName: string;
    role: string;
    phone: string;
    email?: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    syncStatus: 'pending' | 'synced';
    deviceId: string;
  };
  classes: {
    id: string;
    schoolId: string;
    name: string;
    level: number;
    stream?: string;
    capacity: number;
    createdAt: string;
    updatedAt: string;
    syncStatus: 'pending' | 'synced';
    deviceId: string;
  };
  subjects: {
    id: string;
    schoolId: string;
    name: string;
    classId: string;
    createdAt: string;
    updatedAt: string;
    syncStatus: 'pending' | 'synced';
    deviceId: string;
  };
  attendance: {
    id: string;
    schoolId: string;
    entityType: string;
    entityId: string;
    date: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    syncStatus: 'pending' | 'synced';
    deviceId: string;
  };
  fees: {
    id: string;
    schoolId: string;
    studentId: string;
    description: string;
    amount: number;
    paidAmount: number;
    dueDate: string;
    term: string;
    year: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    syncStatus: 'pending' | 'synced';
    deviceId: string;
  };
  payments: {
    id: string;
    schoolId: string;
    feeId: string;
    studentId: string;
    amount: number;
    method: string;
    date: string;
    createdAt: string;
    updatedAt: string;
    syncStatus: 'pending' | 'synced';
    deviceId: string;
  };
  announcements: {
    id: string;
    schoolId: string;
    title: string;
    content: string;
    priority: string;
    createdAt: string;
    updatedAt: string;
    syncStatus: 'pending' | 'synced';
    deviceId: string;
  };
  settings: {
    id: string;
    key: string;
    value: any;
  };
  invoices: any;
  profiles: any;
  follows: any;
  messages: any;
  subscriptions: any;
  pointTransactions: any;
  instructors: any;
  syncQueue: {
    id: string;
    table: string;
    recordId: string;
    operation: 'create' | 'update' | 'delete';
    data: any;
    timestamp: string;
    synced: boolean;
    retryCount: number;
    nextRetryAt?: string | null;
    lastError?: string | null;
    verifiedAt?: string | null;
  };
  syncMeta: {
    id: string;
    tableName: string;
    lastSyncedAt: string | null;
    pendingChanges: number;
  };
}

class UserDatabaseManager {
  private databases: Map<string, IDBDatabase> = new Map();
  private deviceId: string;

  constructor() {
    this.deviceId = this.getOrCreateDeviceId();
  }

  private getOrCreateDeviceId(): string {
    let deviceId = localStorage.getItem('schofy_device_id');
    if (!deviceId) {
      deviceId = this.generateUUID();
      localStorage.setItem('schofy_device_id', deviceId);
    }
    return deviceId;
  }

  private generateUUID(): string {
    // Fallback UUID generation for browsers that don't support crypto.randomUUID
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    
    // Simple UUID v4 fallback
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  getDeviceId(): string {
    return this.deviceId;
  }

  private getDBName(userId: string): string {
    return `${DB_NAME_PREFIX}${userId}`;
  }

  async openDatabase(userId: string): Promise<IDBDatabase> {
    if (this.databases.has(userId)) {
      return this.databases.get(userId)!;
    }

    return new Promise((resolve, reject) => {
      const dbName = this.getDBName(userId);
      const request = indexedDB.open(dbName, DB_VERSION);

      request.onerror = () => reject(request.error);

      request.onsuccess = () => {
        const db = request.result;
        this.databases.set(userId, db);
        resolve(db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const oldVersion = event.oldVersion;

        if (oldVersion > 0 && oldVersion < 5 && db.objectStoreNames.contains('settings')) {
          const tx = (event.target as IDBOpenDBRequest).transaction!;
          const settingsStore = tx.objectStore('settings');
          if (settingsStore.indexNames.contains('key')) {
            settingsStore.deleteIndex('key');
          }
          settingsStore.createIndex('key', 'key', { unique: false });
        }

        const stores = [
          { name: 'schools', indexes: [{ name: 'name', keyPath: 'name' }] },
          { name: 'students', indexes: [
            { name: 'admissionNo', keyPath: 'admissionNo' },
            { name: 'schoolId', keyPath: 'schoolId' },
            { name: 'classId', keyPath: 'classId' },
            { name: 'status', keyPath: 'status' },
            { name: 'updatedAt', keyPath: 'updatedAt' },
            { name: 'syncStatus', keyPath: 'syncStatus' }
          ]},
          { name: 'staff', indexes: [
            { name: 'employeeId', keyPath: 'employeeId' },
            { name: 'schoolId', keyPath: 'schoolId' },
            { name: 'status', keyPath: 'status' },
            { name: 'updatedAt', keyPath: 'updatedAt' },
            { name: 'syncStatus', keyPath: 'syncStatus' }
          ]},
          { name: 'classes', indexes: [
            { name: 'schoolId', keyPath: 'schoolId' },
            { name: 'level', keyPath: 'level' },
            { name: 'updatedAt', keyPath: 'updatedAt' }
          ]},
          { name: 'subjects', indexes: [
            { name: 'schoolId', keyPath: 'schoolId' },
            { name: 'classId', keyPath: 'classId' },
            { name: 'updatedAt', keyPath: 'updatedAt' }
          ]},
          { name: 'attendance', indexes: [
            { name: 'schoolId', keyPath: 'schoolId' },
            { name: 'date', keyPath: 'date' },
            { name: 'entityId', keyPath: 'entityId' },
            { name: 'updatedAt', keyPath: 'updatedAt' }
          ]},
          { name: 'fees', indexes: [
            { name: 'schoolId', keyPath: 'schoolId' },
            { name: 'studentId', keyPath: 'studentId' },
            { name: 'term', keyPath: 'term' },
            { name: 'year', keyPath: 'year' },
            { name: 'updatedAt', keyPath: 'updatedAt' }
          ]},
          { name: 'feeStructures', indexes: [
            { name: 'schoolId', keyPath: 'schoolId' },
            { name: 'classId', keyPath: 'classId' },
            { name: 'updatedAt', keyPath: 'updatedAt' }
          ]},
          { name: 'bursaries', indexes: [
            { name: 'schoolId', keyPath: 'schoolId' },
            { name: 'studentId', keyPath: 'studentId' },
            { name: 'updatedAt', keyPath: 'updatedAt' }
          ]},
          { name: 'discounts', indexes: [
            { name: 'schoolId', keyPath: 'schoolId' },
            { name: 'classId', keyPath: 'classId' },
            { name: 'updatedAt', keyPath: 'updatedAt' }
          ]},
          { name: 'payments', indexes: [
            { name: 'schoolId', keyPath: 'schoolId' },
            { name: 'feeId', keyPath: 'feeId' },
            { name: 'studentId', keyPath: 'studentId' },
            { name: 'date', keyPath: 'date' },
            { name: 'updatedAt', keyPath: 'updatedAt' }
          ]},
          { name: 'announcements', indexes: [
            { name: 'schoolId', keyPath: 'schoolId' },
            { name: 'priority', keyPath: 'priority' },
            { name: 'createdAt', keyPath: 'createdAt' },
            { name: 'updatedAt', keyPath: 'updatedAt' }
          ]},
          { name: 'notifications', indexes: [
            { name: 'read', keyPath: 'read' },
            { name: 'createdAt', keyPath: 'createdAt' },
            { name: 'updatedAt', keyPath: 'updatedAt' }
          ]},
          { name: 'exams', indexes: [
            { name: 'schoolId', keyPath: 'schoolId' },
            { name: 'classId', keyPath: 'classId' },
            { name: 'term', keyPath: 'term' },
            { name: 'updatedAt', keyPath: 'updatedAt' }
          ]},
          { name: 'examResults', indexes: [
            { name: 'examId', keyPath: 'examId' },
            { name: 'studentId', keyPath: 'studentId' },
            { name: 'updatedAt', keyPath: 'updatedAt' }
          ]},
          { name: 'timetable', indexes: [
            { name: 'schoolId', keyPath: 'schoolId' },
            { name: 'classId', keyPath: 'classId' },
            { name: 'dayOfWeek', keyPath: 'dayOfWeek' },
            { name: 'updatedAt', keyPath: 'updatedAt' }
          ]},
          { name: 'transportRoutes', indexes: [
            { name: 'schoolId', keyPath: 'schoolId' },
            { name: 'updatedAt', keyPath: 'updatedAt' }
          ]},
          { name: 'transportAssignments', indexes: [
            { name: 'schoolId', keyPath: 'schoolId' },
            { name: 'studentId', keyPath: 'studentId' },
            { name: 'routeId', keyPath: 'routeId' },
            { name: 'updatedAt', keyPath: 'updatedAt' }
          ]},
          { name: 'salaryPayments', indexes: [
            { name: 'schoolId', keyPath: 'schoolId' },
            { name: 'staffId', keyPath: 'staffId' },
            { name: 'month', keyPath: 'month' },
            { name: 'updatedAt', keyPath: 'updatedAt' }
          ]},
          { name: 'invoices', indexes: [
            { name: 'schoolId', keyPath: 'schoolId' },
            { name: 'studentId', keyPath: 'studentId' },
            { name: 'status', keyPath: 'status' },
            { name: 'updatedAt', keyPath: 'updatedAt' }
          ]},
          { name: 'profiles', indexes: [
            { name: 'schoolId', keyPath: 'schoolId' },
            { name: 'userId', keyPath: 'userId' },
            { name: 'updatedAt', keyPath: 'updatedAt' }
          ]},
          { name: 'follows', indexes: [
            { name: 'schoolId', keyPath: 'schoolId' },
            { name: 'followerId', keyPath: 'followerId' },
            { name: 'followingId', keyPath: 'followingId' },
            { name: 'updatedAt', keyPath: 'updatedAt' }
          ]},
          { name: 'messages', indexes: [
            { name: 'schoolId', keyPath: 'schoolId' },
            { name: 'senderId', keyPath: 'senderId' },
            { name: 'recipientId', keyPath: 'recipientId' },
            { name: 'conversationId', keyPath: 'conversationId' },
            { name: 'updatedAt', keyPath: 'updatedAt' }
          ]},
          { name: 'subscriptions', indexes: [
            { name: 'schoolId', keyPath: 'schoolId' },
            { name: 'userId', keyPath: 'userId' },
            { name: 'status', keyPath: 'status' },
            { name: 'updatedAt', keyPath: 'updatedAt' }
          ]},
          { name: 'pointTransactions', indexes: [
            { name: 'schoolId', keyPath: 'schoolId' },
            { name: 'userId', keyPath: 'userId' },
            { name: 'direction', keyPath: 'direction' },
            { name: 'updatedAt', keyPath: 'updatedAt' }
          ]},
          { name: 'instructors', indexes: [
            { name: 'schoolId', keyPath: 'schoolId' },
            { name: 'staffId', keyPath: 'staffId' },
            { name: 'employeeId', keyPath: 'employeeId' },
            { name: 'updatedAt', keyPath: 'updatedAt' }
          ]},
          { name: 'settings', indexes: [{ name: 'key', keyPath: 'key' }] },
          { name: 'syncQueue', indexes: [
            { name: 'synced', keyPath: 'synced' },
            { name: 'timestamp', keyPath: 'timestamp' },
            { name: 'retryCount', keyPath: 'retryCount' },
            { name: 'nextRetryAt', keyPath: 'nextRetryAt' }
          ]},
          { name: 'syncMeta', indexes: [{ name: 'tableName', keyPath: 'tableName', unique: true }] }
        ];

        for (const store of stores) {
          if (!db.objectStoreNames.contains(store.name)) {
            const objectStore = db.createObjectStore(store.name, { keyPath: 'id' });
            for (const index of store.indexes) {
              objectStore.createIndex(index.name, index.keyPath, {
                unique: (index as { unique?: boolean }).unique === true,
              });
            }
          }
        }
      };
    });
  }

  async closeDatabase(userId: string): Promise<void> {
    const db = this.databases.get(userId);
    if (db) {
      db.close();
      this.databases.delete(userId);
    }
  }

  async closeAllDatabases(): Promise<void> {
    for (const [userId] of this.databases) {
      await this.closeDatabase(userId);
    }
  }

  private getStore(userId: string, storeName: string, mode: IDBTransactionMode = 'readonly'): IDBObjectStore {
    const db = this.databases.get(userId);
    if (!db) {
      throw new Error(`Database not open for user ${userId}. Call openDatabase first.`);
    }
    const transaction = db.transaction(storeName, mode);
    return transaction.objectStore(storeName);
  }

  async ensureDatabaseOpen(userId: string): Promise<void> {
    if (!this.databases.has(userId)) {
      await this.openDatabase(userId);
    }
  }

  async add<T extends { id?: string; createdAt?: string; updatedAt?: string; syncStatus?: 'pending' | 'synced' }>(
    userId: string,
    storeName: string,
    data: T
  ): Promise<string> {
    await this.ensureDatabaseOpen(userId);
    const now = new Date().toISOString();
    const record: any = {
      ...data,
      id: data.id || this.generateUUID(),
      createdAt: data.createdAt || now,
      updatedAt: data.updatedAt || now,
      syncStatus: data.syncStatus || 'pending',
      deviceId: this.deviceId,
    };

    return new Promise((resolve, reject) => {
      const store = this.getStore(userId, storeName, 'readwrite');
      const request = store.add(record);
      request.onsuccess = () => resolve(record.id);
      request.onerror = () => reject(request.error);
    });
  }

  async put<T extends { id: string; updatedAt?: string; syncStatus?: 'pending' | 'synced' }>(
    userId: string,
    storeName: string,
    data: T
  ): Promise<string> {
    await this.ensureDatabaseOpen(userId);
    const now = new Date().toISOString();
    const record = {
      ...data,
      updatedAt: data.updatedAt || now,
      syncStatus: data.syncStatus || 'pending',
      deviceId: this.deviceId,
    };

    return new Promise((resolve, reject) => {
      const store = this.getStore(userId, storeName, 'readwrite');
      const request = store.put(record);
      request.onsuccess = () => resolve(record.id);
      request.onerror = () => reject(request.error);
    });
  }

  async get(userId: string, storeName: string, id: string): Promise<any | null> {
    await this.ensureDatabaseOpen(userId);
    return new Promise((resolve, reject) => {
      const store = this.getStore(userId, storeName);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async getAll(userId: string, storeName: string): Promise<any[]> {
    await this.ensureDatabaseOpen(userId);
    return new Promise((resolve, reject) => {
      const store = this.getStore(userId, storeName);
      const request = store.getAll();
      request.onsuccess = () => {
        const items = request.result || [];
        const deduped = this.deduplicateById(items);
        resolve(deduped);
      };
      request.onerror = () => reject(request.error);
    });
  }

  private deduplicateById(items: any[]): any[] {
    const seen = new Map();
    for (const item of items) {
      if (item?.id && !seen.has(item.id)) {
        seen.set(item.id, item);
      }
    }
    return Array.from(seen.values());
  }

  async cleanupDuplicates(userId: string, storeName: string): Promise<number> {
    await this.ensureDatabaseOpen(userId);
    const items = await this.getAll(userId, storeName);
    const seen = new Map<string, any>();
    let removed = 0;
    for (const item of items) {
      if (item?.id) {
        if (seen.has(item.id)) {
          await this.delete(userId, storeName, item.id);
          removed++;
        } else {
          seen.set(item.id, item);
        }
      }
    }
    return removed;
  }

  async where(
    userId: string,
    storeName: string,
    indexName: string,
    value: any
  ): Promise<any[]> {
    await this.ensureDatabaseOpen(userId);
    return new Promise((resolve, reject) => {
      const store = this.getStore(userId, storeName);
      const index = store.index(indexName);
      const request = index.getAll(value);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async delete(userId: string, storeName: string, id: string): Promise<void> {
    await this.ensureDatabaseOpen(userId);
    return new Promise((resolve, reject) => {
      const store = this.getStore(userId, storeName, 'readwrite');
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clear(userId: string, storeName: string): Promise<void> {
    await this.ensureDatabaseOpen(userId);
    return new Promise((resolve, reject) => {
      const store = this.getStore(userId, storeName, 'readwrite');
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async count(userId: string, storeName: string): Promise<number> {
    await this.ensureDatabaseOpen(userId);
    return new Promise((resolve, reject) => {
      const store = this.getStore(userId, storeName);
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getPage(
    userId: string,
    storeName: string,
    page: number,
    pageSize: number,
    filter?: (item: any) => boolean,
    sortField: string = 'createdAt',
    sortDir: 'next' | 'prev' = 'prev'
  ): Promise<{ items: any[]; total: number }> {
    await this.ensureDatabaseOpen(userId);
    const skip = (page - 1) * pageSize;
    let items: any[] = [];
    let total = 0;

    return new Promise((resolve, reject) => {
      const store = this.getStore(userId, storeName);
      
      // If there is an index for sorting, use it
      let cursorRequest;
      try {
        const index = store.index(sortField);
        cursorRequest = index.openCursor(null, sortDir);
      } catch {
        cursorRequest = store.openCursor(null, sortDir);
      }

      let count = 0;
      let skipped = 0;

      cursorRequest.onsuccess = (event: any) => {
        const cursor = event.target.result;
        if (cursor) {
          const item = cursor.value;
          if (!filter || filter(item)) {
            total++;
            if (skipped < skip) {
              skipped++;
            } else if (count < pageSize) {
              items.push(item);
              count++;
            }
          }
          cursor.continue();
        } else {
          resolve({ items, total });
        }
      };
      cursorRequest.onerror = () => reject(cursorRequest.error);
    });
  }

  async search(
    userId: string,
    storeName: string,
    query: string,
    fields: string[]
  ): Promise<any[]> {
    await this.ensureDatabaseOpen(userId);
    const lowercaseQuery = query.toLowerCase();
    const results: any[] = [];

    return new Promise((resolve, reject) => {
      const store = this.getStore(userId, storeName);
      const request = store.openCursor();

      request.onsuccess = (event: any) => {
        const cursor = event.target.result;
        if (cursor) {
          const item = cursor.value;
          const matches = fields.some(field => {
            const value = item[field];
            return value && String(value).toLowerCase().includes(lowercaseQuery);
          });

          if (matches) {
            results.push(item);
          }

          if (results.length < 50) { // Cap search results for performance
            cursor.continue();
          } else {
            resolve(results);
          }
        } else {
          resolve(results);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  async batchDelete(userId: string, storeName: string, ids: string[]): Promise<void> {
    await this.ensureDatabaseOpen(userId);
    return new Promise((resolve, reject) => {
      const db = this.databases.get(userId);
      if (!db) return reject(new Error('Database not open'));
      
      const transaction = db.transaction([storeName, 'syncQueue'], 'readwrite');
      const store = transaction.objectStore(storeName);
      const queueStore = transaction.objectStore('syncQueue');

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);

      for (const id of ids) {
        store.delete(id);
        
        // Add delete operation to sync queue within the same transaction
        const syncItem = {
          id: this.generateUUID(),
          table: storeName,
          recordId: id,
          operation: 'delete' as const,
          data: { id },
          timestamp: new Date().toISOString(),
          synced: 0,
          retryCount: 0,
        };
        queueStore.add(syncItem);
      }
    });
  }

  async getPendingSyncItems(userId: string): Promise<any[]> {
    await this.ensureDatabaseOpen(userId);
    return new Promise((resolve, reject) => {
      const db = this.databases.get(userId);
      if (!db) {
        resolve([]);
        return;
      }
      const transaction = db.transaction(['syncQueue'], 'readonly');
      const store = transaction.objectStore('syncQueue');
      const index = store.index('synced');
      const request = index.getAll(IDBKeyRange.only(0));
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async markSynced(userId: string, itemId: string): Promise<void> {
    await this.ensureDatabaseOpen(userId);
    return new Promise((resolve, reject) => {
      const db = this.databases.get(userId);
      if (!db) {
        reject(new Error('Database not open'));
        return;
      }
      const transaction = db.transaction(['syncQueue'], 'readwrite');
      const store = transaction.objectStore('syncQueue');
      
      const getRequest = store.get(itemId);
      getRequest.onsuccess = () => {
        const record = getRequest.result;
        if (record) {
          record.synced = 1;
          const putRequest = store.put(record);
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(putRequest.error);
        } else {
          resolve();
        }
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async addToSyncQueue(
    userId: string,
    table: string,
    recordId: string,
    operation: 'create' | 'update' | 'delete',
    data: any
  ): Promise<void> {
    await this.ensureDatabaseOpen(userId);
    const item = {
      id: this.generateUUID(),
      table,
      recordId,
      operation,
      data,
      timestamp: new Date().toISOString(),
      synced: 0,
      retryCount: 0,
      nextRetryAt: null,
      lastError: null,
      verifiedAt: null,
    };

    return new Promise((resolve, reject) => {
      const db = this.databases.get(userId);
      if (!db) {
        reject(new Error('Database not open'));
        return;
      }
      const transaction = db.transaction(['syncQueue'], 'readwrite');
      const store = transaction.objectStore('syncQueue');
      const request = store.add(item);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async updateSyncQueueItem(
    userId: string,
    itemId: string,
    updates: Record<string, any>
  ): Promise<void> {
    await this.ensureDatabaseOpen(userId);
    return new Promise((resolve, reject) => {
      const db = this.databases.get(userId);
      if (!db) {
        reject(new Error('Database not open'));
        return;
      }

      const transaction = db.transaction(['syncQueue'], 'readwrite');
      const store = transaction.objectStore('syncQueue');
      const getRequest = store.get(itemId);

      getRequest.onsuccess = () => {
        const existing = getRequest.result;
        if (!existing) {
          resolve();
          return;
        }

        const updated = { ...existing, ...updates };
        const putRequest = store.put(updated);
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
      };

      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async removeSyncQueueItem(userId: string, itemId: string): Promise<void> {
    await this.ensureDatabaseOpen(userId);
    return new Promise((resolve, reject) => {
      const db = this.databases.get(userId);
      if (!db) {
        reject(new Error('Database not open'));
        return;
      }
      const transaction = db.transaction(['syncQueue'], 'readwrite');
      const store = transaction.objectStore('syncQueue');
      const request = store.delete(itemId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clearSyncQueue(userId: string): Promise<void> {
    await this.ensureDatabaseOpen(userId);
    return new Promise((resolve, reject) => {
      const db = this.databases.get(userId);
      if (!db) {
        reject(new Error('Database not open'));
        return;
      }
      const transaction = db.transaction(['syncQueue'], 'readwrite');
      const store = transaction.objectStore('syncQueue');
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async deleteDatabase(userId: string): Promise<void> {
    await this.closeDatabase(userId);
    
    return new Promise((resolve, reject) => {
      const dbName = this.getDBName(userId);
      const request = indexedDB.deleteDatabase(dbName);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

export const userDBManager = new UserDatabaseManager();
