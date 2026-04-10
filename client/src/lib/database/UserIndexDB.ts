const DB_NAME = 'schofy_user_index';
const DB_VERSION = 1;

import { generateUUID } from '../utils/uuid';

export interface UserAccount {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  databasePath: string;
  lastLogin: string | null;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}

export interface Session {
  lastUserId: string | null;
  sessionStart: string | null;
}

class UserIndexDB {
  private db: IDBDatabase | null = null;
  private dbReady: Promise<void>;

  constructor() {
    this.dbReady = this.init();
  }

  private async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains('users')) {
          const usersStore = db.createObjectStore('users', { keyPath: 'id' });
          usersStore.createIndex('email', 'email', { unique: true });
          usersStore.createIndex('lastLogin', 'lastLogin', { unique: false });
        }

        if (!db.objectStoreNames.contains('session')) {
          db.createObjectStore('session', { keyPath: 'id' });
        }
      };
    });
  }

  async waitForDb(): Promise<void> {
    await this.dbReady;
  }

  private getStore(storeName: string, mode: IDBTransactionMode = 'readonly'): IDBObjectStore {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    const transaction = this.db.transaction(storeName, mode);
    return transaction.objectStore(storeName);
  }

  async createUser(user: Omit<UserAccount, 'id' | 'createdAt' | 'updatedAt' | 'lastLogin'>): Promise<UserAccount> {
    await this.waitForDb();

    const now = new Date().toISOString();
    const newUser: UserAccount = {
      ...user,
      id: generateUUID(),
      lastLogin: null,
      createdAt: now,
      updatedAt: now,
    };

    return new Promise((resolve, reject) => {
      const store = this.getStore('users', 'readwrite');
      const request = store.add(newUser);
      request.onsuccess = () => resolve(newUser);
      request.onerror = () => reject(request.error);
    });
  }

  async getUserByEmail(email: string): Promise<UserAccount | null> {
    await this.waitForDb();

    return new Promise((resolve, reject) => {
      const store = this.getStore('users');
      const index = store.index('email');
      const request = index.get(email);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async getUserById(id: string): Promise<UserAccount | null> {
    await this.waitForDb();

    return new Promise((resolve, reject) => {
      const store = this.getStore('users');
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async updateUser(id: string, updates: Partial<UserAccount>): Promise<UserAccount | null> {
    await this.waitForDb();

    const existing = await this.getUserById(id);
    if (!existing) return null;

    const updated: UserAccount = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    return new Promise((resolve, reject) => {
      const store = this.getStore('users', 'readwrite');
      const request = store.put(updated);
      request.onsuccess = () => resolve(updated);
      request.onerror = () => reject(request.error);
    });
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.waitForDb();

    const now = new Date().toISOString();
    await this.updateUser(id, { lastLogin: now });
  }

  async getAllUsers(): Promise<UserAccount[]> {
    await this.waitForDb();

    return new Promise((resolve, reject) => {
      const store = this.getStore('users');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteUser(id: string): Promise<void> {
    await this.waitForDb();

    return new Promise((resolve, reject) => {
      const store = this.getStore('users', 'readwrite');
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async saveSession(session: Session): Promise<void> {
    await this.waitForDb();

    return new Promise((resolve, reject) => {
      const store = this.getStore('session', 'readwrite');
      const request = store.put({ id: 'current', ...session });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getSession(): Promise<Session | null> {
    await this.waitForDb();

    return new Promise((resolve, reject) => {
      const store = this.getStore('session');
      const request = store.get('current');
      request.onsuccess = () => {
        const result = request.result;
        if (result) {
          delete result.id;
          resolve(result as Session);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  async clearSession(): Promise<void> {
    await this.waitForDb();

    return new Promise((resolve, reject) => {
      const store = this.getStore('session', 'readwrite');
      const request = store.delete('current');
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

export const userIndexDB = new UserIndexDB();
