import React, { createContext, useContext, useEffect, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

interface RealtimeChange {
  table: string;
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  record: any;
  userId: string;
  timestamp: number;
}

interface RealtimeSyncContextType {
  isConnected: boolean;
  lastChange: RealtimeChange | null;
}

const RealtimeSyncContext = createContext<RealtimeSyncContextType>({
  isConnected: false,
  lastChange: null,
});

export function useRealtimeSync() {
  return useContext(RealtimeSyncContext);
}

const CHANNEL_NAME = 'schofy-sync';
const SYNC_EVENT = 'sync-change';

export function RealtimeSyncProvider({ children }: { children: React.ReactNode }) {
  const supabaseClient = supabase!;
  const channelRef = useRef<ReturnType<typeof supabaseClient.channel> | null>(null);
  const isConnectedRef = useRef(false);
  const lastChangeRef = useRef<RealtimeChange | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !supabase.channel) {
      console.log('Supabase not configured, skipping realtime sync');
      return;
    }

    const channel = supabase.channel(CHANNEL_NAME, {
      config: {
        broadcast: { self: false },
      },
    });

    channel.on('broadcast', { event: SYNC_EVENT }, async (payload) => {
      const change = payload.payload as RealtimeChange;
      if (change && change.table) {
        lastChangeRef.current = change;
        
        try {
          const { userDBManager } = await import('../lib/database/UserDatabaseManager');
          const { queryCache } = await import('../lib/cache/QueryCache');
          
          if (change.type === 'DELETE') {
            await userDBManager.delete(change.userId, change.table, change.record.id);
          } else if (change.type === 'INSERT' || change.type === 'UPDATE') {
            const existing = await userDBManager.get(change.userId, change.table, change.record.id);
            if (change.type === 'UPDATE' && existing) {
              await userDBManager.put(change.userId, change.table, { ...existing, ...change.record, syncStatus: 'synced' });
            } else {
              await userDBManager.put(change.userId, change.table, { ...change.record, syncStatus: 'synced' });
            }
          }
          
          // Clear cache so the UI doesn't render stale data!
          queryCache.invalidatePattern(`${change.table}:*`);
        } catch (err) {
          console.error('Failed to merge realtime change:', err);
        }

        const eventName = `${change.table}Updated`;
        window.dispatchEvent(new CustomEvent(eventName, { detail: change }));
        window.dispatchEvent(new CustomEvent('schofyDataRefresh', { detail: change }));
        window.dispatchEvent(new CustomEvent('dataRefresh'));
        
        console.log(`📡 Realtime: ${change.type} on ${change.table}`, change.record?.id);
      }
    });

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        isConnectedRef.current = true;
        console.log('📡 Realtime sync connected');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        isConnectedRef.current = false;
        console.log('📡 Realtime sync error, will retry...');
      } else if (status === 'CLOSED') {
        isConnectedRef.current = false;
      }
    });

    channelRef.current = channel;

    window.broadcastSchofyChange = (table: string, type: 'INSERT' | 'UPDATE' | 'DELETE', record: any, userId: string) => {
      if (channelRef.current && isConnectedRef.current) {
        const change: RealtimeChange = {
          table,
          type,
          record,
          userId,
          timestamp: Date.now(),
        };
        channelRef.current.send({
          type: 'broadcast',
          event: SYNC_EVENT,
          payload: change,
        }).catch((err) => {
          console.error('Failed to broadcast change:', err);
        });
      }
    };

    return () => {
      if (channelRef.current) {
        if (supabase && supabase.removeChannel) {
          supabase.removeChannel(channelRef.current);
        }
        channelRef.current = null;
      }
      window.broadcastSchofyChange = undefined as any;
    };
  }, []);

  const contextValue = {
    isConnected: isConnectedRef.current,
    lastChange: lastChangeRef.current,
  };

  return (
    <RealtimeSyncContext.Provider value={contextValue}>
      {children}
    </RealtimeSyncContext.Provider>
  );
}
