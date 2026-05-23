import { useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { dataService } from '../lib/database/SupabaseDataService';
import { isCloudSyncEnabled } from '../utils/desktopSyncPreference';

/** Re-subscribe postgres realtime for the active tenant (e.g. after CHANNEL_ERROR). */
export function useRealtimeSync() {
  const { schoolId, user } = useAuth();
  const tenantId = schoolId || user?.id || null;

  const reconnect = useCallback(() => {
    if (tenantId && isCloudSyncEnabled()) {
      dataService.restartRealtimeSync(tenantId);
    }
  }, [tenantId]);

  return { tenantId, reconnect };
}
