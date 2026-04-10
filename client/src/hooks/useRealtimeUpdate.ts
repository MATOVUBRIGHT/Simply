import { useEffect, useState, useCallback } from 'react';

interface RealtimeUpdate {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  record: any;
  timestamp: number;
}

export function useRealtimeUpdate(table?: string) {
  const [lastUpdate, setLastUpdate] = useState<RealtimeUpdate | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const handleUpdate = useCallback((event: CustomEvent) => {
    const update = event.detail as RealtimeUpdate;
    
    // Filter by table if specified
    if (table && update.table !== table) {
      return;
    }
    
    console.log(`🔄 Real-time update received for ${update.type} on ${update.table}`);
    setLastUpdate(update);
  }, [table]);

  useEffect(() => {
    // Listen for general data refresh events
    window.addEventListener('schofyDataRefresh', handleUpdate as EventListener);
    
    // Listen for table-specific events if table is specified
    if (table) {
      const tableName = table.charAt(0).toUpperCase() + table.slice(1);
      const specificEvent = `${tableName}Updated`;
      window.addEventListener(specificEvent, handleUpdate as EventListener);
      
      const dataChangedEvent = `${table}DataChanged`;
      window.addEventListener(dataChangedEvent, handleUpdate as EventListener);
    }

    // Check connection status
    const checkConnection = () => {
      const syncEnabled = localStorage.getItem('schofy_sync_enabled') === 'true';
      setIsConnected(syncEnabled && navigator.onLine);
    };

    checkConnection();
    window.addEventListener('online', checkConnection);
    window.addEventListener('offline', checkConnection);

    return () => {
      window.removeEventListener('schofyDataRefresh', handleUpdate as EventListener);
      window.removeEventListener('online', checkConnection);
      window.removeEventListener('offline', checkConnection);
      
      if (table) {
        const tableName = table.charAt(0).toUpperCase() + table.slice(1);
        const specificEvent = `${tableName}Updated`;
        window.removeEventListener(specificEvent, handleUpdate as EventListener);
        
        const dataChangedEvent = `${table}DataChanged`;
        window.removeEventListener(dataChangedEvent, handleUpdate as EventListener);
      }
    };
  }, [handleUpdate, table]);

  const clearUpdate = useCallback(() => {
    setLastUpdate(null);
  }, []);

  return {
    lastUpdate,
    isConnected,
    clearUpdate,
  };
}

// Hook for components that need to refresh data when real-time updates occur
export function useRealtimeRefresh(refreshCallback: () => void | Promise<void>, table?: string) {
  const { lastUpdate } = useRealtimeUpdate(table);

  useEffect(() => {
    if (lastUpdate) {
      console.log(`🔄 Triggering data refresh for ${lastUpdate.table}`);
      refreshCallback();
    }
  }, [lastUpdate, refreshCallback]);
}
