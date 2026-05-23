/**
 * Centralized Service Manager
 * Manages the singleton lifecycle and staged initialization of all core services.
 */
import { dataService } from './database/SupabaseDataService';
import { syncService } from '../services/sync';
import { supabase } from './supabase';

export enum InitializationStage {
  STAGE_0_CORE = 0,      // Supabase Client, Local Storage
  STAGE_1_AUTH = 1,      // Auth Session Restoration
  STAGE_2_DATA = 2,      // Local Cache, Shell UI
  STAGE_3_SYNC = 3,      // Background Sync
  STAGE_4_REALTIME = 4,  // Realtime Websockets
}

class ServiceManager {
  private static instance: ServiceManager;
  private currentStage: InitializationStage = InitializationStage.STAGE_0_CORE;
  private initialized = false;

  private constructor() {}

  private _initPromise: Promise<void> | null = null;

  static getInstance(): ServiceManager {
    if (!ServiceManager.instance) {
      ServiceManager.instance = new ServiceManager();
    }
    return ServiceManager.instance;
  }

  async initialize(userId?: string, schoolId?: string) {
    if (this._initPromise) return this._initPromise;
    
    this._initPromise = (async () => {
      try {
        // Stage 1: Auth
        this.currentStage = InitializationStage.STAGE_1_AUTH;
        const session = await this.waitForAuth();
        
        const effectiveUserId = userId || session?.user?.id;
        const effectiveSchoolId = schoolId || effectiveUserId;

        if (!effectiveUserId || !effectiveSchoolId) {
          console.log('[ServiceManager] Missing user/school context, stopping at Auth stage');
          this._initPromise = null; // Allow retry if context was missing
          return;
        }

        // Stage 2: Data (Local Cache)
        this.currentStage = InitializationStage.STAGE_2_DATA;
        await dataService.bootstrapSession(effectiveUserId, effectiveSchoolId);

        // Stage 3: Sync
        this.currentStage = InitializationStage.STAGE_3_SYNC;
        syncService.setUserId(effectiveUserId);
        syncService.setSchoolId(effectiveSchoolId);
        syncService.enableSync();

        // Stage 4: Realtime
        this.currentStage = InitializationStage.STAGE_4_REALTIME;
        dataService.startRealtimeSync(effectiveSchoolId);

        this.initialized = true;
        console.log('[ServiceManager] Full initialization complete');
      } catch (error) {
        console.error('[ServiceManager] Initialization failed:', error);
        this._initPromise = null; // Allow retry on failure
      }
    })();

    return this._initPromise;
  }

  private async waitForAuth(timeout = 10000): Promise<any> {
    if (!supabase) return null;

    // 1. Instant check
    const { data: { session: initialSession } } = await supabase.auth.getSession();
    if (initialSession?.access_token) return initialSession;

    // 2. Poll and listen for auth state change
    return new Promise((resolve) => {
      const start = Date.now();
      let resolved = false;

      const timer = setInterval(async () => {
        if (!supabase) return;
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token && !resolved) {
          resolved = true;
          clearInterval(timer);
          subscription.unsubscribe();
          resolve(session);
        }
        if (Date.now() - start > timeout && !resolved) {
          resolved = true;
          console.warn('[ServiceManager] Auth timeout reached');
          clearInterval(timer);
          subscription.unsubscribe();
          resolve(null);
        }
      }, 500);

      const { data: { subscription } } = supabase!.auth.onAuthStateChange((_event, session) => {
        if (session?.access_token && !resolved) {
          resolved = true;
          clearInterval(timer);
          subscription.unsubscribe();
          resolve(session);
        }
      });
    });
  }

  getStage(): InitializationStage {
    return this.currentStage;
  }

  reset() {
    this.currentStage = InitializationStage.STAGE_0_CORE;
    this.initialized = false;
    this._initPromise = null;
    try { dataService.stopRealtimeSync(); } catch {}
    try { syncService.disableSync(); } catch {}
  }
}

export const serviceManager = ServiceManager.getInstance();
