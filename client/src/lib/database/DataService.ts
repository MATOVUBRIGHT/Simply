/**
 * Unified DataService Bridge
 * This file redirects all data operations to SupabaseDataService, 
 * which is our primary cloud-first, offline-sync engine.
 */

import { dataService as supabaseDataService } from './SupabaseDataService';

// Re-export types for compatibility
export type { SyncResult, SyncHealthStatus } from './SupabaseDataService';

// The singleton instance used by the rest of the app
export const dataService = supabaseDataService;

// Ensure window globals are set for dev debugging
if (typeof window !== 'undefined') {
  (window as any).dataService = dataService;
  (window as any).forcePush = () => {
    const sid = localStorage.getItem('schofy_current_school_id') || '';
    return dataService.forcePush(sid);
  };
  (window as any).forcePull = () => {
    const sid = localStorage.getItem('schofy_current_school_id') || '';
    return dataService.forcePull(sid);
  };
}
