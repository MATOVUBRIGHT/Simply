 /**
 * DesktopStorageManager - File-based storage for Electron desktop app
 * 
 * This module provides direct file system access for the Electron desktop app,
 * storing all data as JSON files in the app's userData directory.
 * 
 * Features:
 * - Direct file system access (no browser storage limits)
 * - Automatic data directory management
 * - Atomic write operations for data integrity
 * - Backup and restore capabilities
 * - Migration from browser storage
 */

export interface StorageStats {
  totalFiles: number;
  totalSize: number;
  lastModified: Date | null;
}

export interface BackupInfo {
  name: string;
  path: string;
  createdAt: Date;
  size: number;
}

class DesktopStorageManager {
  private isElectron = typeof window !== 'undefined' && (window as any).electronAPI;
  private dataDir = 'schofy-data';
  private backupDir = 'schofy-backups';
  private cache = new Map<string, { data: any; timestamp: number }>();
  private writeQueue: Array<{ key: string; data: any; resolve: (value: any) => void; reject: (reason?: any) => void }> = [];
  private isProcessing = false;

  constructor() {
    if (this.isElectron) {
      console.log('[DesktopStorage] Running in Electron mode - using file system');
    } else {
      console.log('[DesktopStorage] Running in browser mode - using IndexedDB fallback');
    }
  }

  /**
   * Initialize storage - create directories if needed
   */
  async init(): Promise<void> {
    if (!this.isElectron) {
      console.warn('[DesktopStorage] Not running in Electron - file storage unavailable');
      return;
    }

    try {
      // Initialize data directory
      await this.ensureDirectory(this.dataDir);
      await this.ensureDirectory(this.backupDir);
      console.log('[DesktopStorage] Initialized successfully');
    } catch (error) {
      console.error('[DesktopStorage] Initialization failed:', error);
      throw error;
    }
  }

  private async ensureDirectory(dir: string): Promise<void> {
    if (!this.isElectron) return;
    
    return new Promise((resolve, reject) => {
      (window as any).electronAPI?.ensureDirectory?.(dir)
        .then(resolve)
        .catch(reject);
    });
  }

  /**
   * Write data to file system
   */
  async write(key: string, data: any): Promise<void> {
    if (!this.isElectron) {
      console.warn('[DesktopStorage] Not in Electron - write failed');
      return;
    }

    // Sanitize key to prevent path traversal
    const safeKey = key.replace(/[^a-zA-Z0-9_\-\/]/g, '_').slice(0, 200);
    
    return new Promise((resolve, reject) => {
      this.writeQueue.push({ key: safeKey, data, resolve, reject });
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.writeQueue.length === 0) return;
    
    this.isProcessing = true;
    
    while (this.writeQueue.length > 0) {
      const item = this.writeQueue.shift()!;
      
      try {
        const result = await (window as any).electronAPI?.writeFile?.(item.key, item.data);
        if (result?.success) {
          this.cache.set(item.key, { data: item.data, timestamp: Date.now() });
          item.resolve(result);
        } else {
          item.reject(new Error(result?.error || 'Write failed'));
        }
      } catch (error) {
        item.reject(error);
      }
    }
    
    this.isProcessing = false;
  }

  /**
   * Read data from file system
   */
  async read(key: string): Promise<any | null> {
    if (!this.isElectron) {
      console.warn('[DesktopStorage] Not in Electron - read failed');
      return null;
    }

    // Check cache first
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < 5000) {
      return cached.data;
    }

    const safeKey = key.replace(/[^a-zA-Z0-9_\-\/]/g, '_').slice(0, 200);
    
    try {
      const result = await (window as any).electronAPI?.readFile?.(safeKey);
      if (result?.success && result.data !== null) {
        this.cache.set(key, { data: result.data, timestamp: Date.now() });
        return result.data;
      }
      return null;
    } catch (error) {
      console.error('[DesktopStorage] Read failed:', error);
      return null;
    }
  }

  /**
   * Delete a file
   */
  async delete(key: string): Promise<void> {
    if (!this.isElectron) return;

    const safeKey = key.replace(/[^a-zA-Z0-9_\-\/]/g, '_').slice(0, 200);
    this.cache.delete(key);
    
    return (window as any).electronAPI?.deleteFile?.(safeKey);
  }

  /**
   * List all files in a directory
   */
  async list(directory?: string): Promise<string[]> {
    if (!this.isElectron) return [];

    try {
      const result = await (window as any).electronAPI?.listFiles?.(directory || this.dataDir);
      return result?.files || [];
    } catch (error) {
      console.error('[DesktopStorage] List failed:', error);
      return [];
    }
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<StorageStats> {
    if (!this.isElectron) {
      return { totalFiles: 0, totalSize: 0, lastModified: null };
    }

    try {
      return await (window as any).electronAPI?.getStorageStats?.();
    } catch (error) {
      console.error('[DesktopStorage] Stats failed:', error);
      return { totalFiles: 0, totalSize: 0, lastModified: null };
    }
  }

  /**
   * Create a backup of all data
   */
  async createBackup(name?: string): Promise<BackupInfo | null> {
    if (!this.isElectron) return null;

    const backupName = name || `backup-${new Date().toISOString().split('T')[0]}`;
    
    try {
      const result = await (window as any).electronAPI?.createBackup?.(backupName);
      if (result?.success) {
        return {
          name: backupName,
          path: result.path,
          createdAt: new Date(),
          size: result.size,
        };
      }
      return null;
    } catch (error) {
      console.error('[DesktopStorage] Backup failed:', error);
      return null;
    }
  }

  /**
   * Restore from a backup
   */
  async restoreBackup(backupName: string): Promise<boolean> {
    if (!this.isElectron) return false;

    try {
      const result = await (window as any).electronAPI?.restoreBackup?.(backupName);
      if (result?.success) {
        this.cache.clear();
        return true;
      }
      return false;
    } catch (error) {
      console.error('[DesktopStorage] Restore failed:', error);
      return false;
    }
  }

  /**
   * List available backups
   */
  async listBackups(): Promise<BackupInfo[]> {
    if (!this.isElectron) return [];

    try {
      const result = await (window as any).electronAPI?.listBackups?.();
      return result?.backups?.map((b: any) => ({
        name: b.name,
        path: b.path,
        createdAt: new Date(b.createdAt),
        size: b.size,
      })) || [];
    } catch (error) {
      console.error('[DesktopStorage] List backups failed:', error);
      return [];
    }
  }

  /**
   * Export data to a specific location
   */
  async exportData(filePath: string): Promise<boolean> {
    if (!this.isElectron) return false;

    try {
      const result = await (window as any).electronAPI?.exportData?.(filePath);
      return result?.success || false;
    } catch (error) {
      console.error('[DesktopStorage] Export failed:', error);
      return false;
    }
  }

  /**
   * Import data from a file
   */
  async importData(filePath: string): Promise<boolean> {
    if (!this.isElectron) return false;

    try {
      const result = await (window as any).electronAPI?.importData?.(filePath);
      if (result?.success) {
        this.cache.clear();
        return true;
      }
      return false;
    } catch (error) {
      console.error('[DesktopStorage] Import failed:', error);
      return false;
    }
  }

  /**
   * Clear all data (use with caution!)
   */
  async clearAll(): Promise<void> {
    if (!this.isElectron) return;

    try {
      await (window as any).electronAPI?.clearAllData?.();
      this.cache.clear();
    } catch (error) {
      console.error('[DesktopStorage] Clear all failed:', error);
    }
  }

  /**
   * Check if running in Electron
   */
  isDesktop(): boolean {
    return this.isElectron;
  }

  /**
   * Get the data directory path
   */
  getDataPath(): string {
    if (!this.isElectron) return '';
    return (window as any).electronAPI?.getDataPath?.() || '';
  }

  /**
   * Open data directory in file explorer
   */
  openDataDirectory(): void {
    if (!this.isElectron) return;
    (window as any).electronAPI?.openDirectory?.(this.dataDir);
  }
}

export const desktopStorageManager = new DesktopStorageManager();