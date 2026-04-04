import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { supabase, isSupabaseConfigured } from '../supabase';
import { userDBManager } from '../database/UserDatabaseManager';

export interface RealtimeChange {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  record: any;
  userId: string;
  deviceId: string;
  timestamp: string;
}

export interface RealtimeSyncContextType {
  isConnected: boolean;
  subscribeToTable: (table: string, callback: (change: RealtimeChange) => void) => () => void;
  broadcastChange: (table: string, type: 'INSERT' | 'UPDATE' | 'DELETE', record: any, userId: string) => void;
  lastChange: RealtimeChange | null;
}

const RealtimeSyncContext = createContext<RealtimeSyncContextType | null>(null);

const DEVICE_ID_KEY = 'schofy_device_id';
const CHANNEL_NAME = 'schofy-sync';

function getDeviceId(): string {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

export function RealtimeSyncProvider({ children }: { children: ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastChange, setLastChange] = useState<RealtimeChange | null>(null);
  const [subscriptions, setSubscriptions] = useState<Map<string, (change: RealtimeChange) => void>>(new Map());
  const [channel, setChannel] = useState<any>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      console.log('Realtime: Supabase not configured');
      return;
    }

    const deviceId = getDeviceId();
    console.log('Realtime: Connecting with device ID:', deviceId);

    const supabaseChannel = supabase.channel(CHANNEL_NAME, {
      config: {
        broadcast: { self: false },
        presence: { key: deviceId },
      },
    });

    supabaseChannel
      .on('broadcast', { event: 'sync' }, (payload) => {
        const change = payload.payload as RealtimeChange;
        if (change.deviceId === deviceId) {
          return;
        }
        console.log('Realtime: Received change from another device:', change);
        setLastChange(change);
        
        subscriptions.forEach((callback) => {
          try {
            callback(change);
          } catch (err) {
            console.error('Realtime: Callback error:', err);
          }
        });

        handleRemoteChange(change);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Realtime: Connected');
          setIsConnected(true);
        } else if (status === 'CHANNEL_ERROR') {
          console.error('Realtime: Channel error');
          setIsConnected(false);
        } else if (status === 'TIMED_OUT') {
          console.log('Realtime: Timed out');
          setIsConnected(false);
        }
      });

    setChannel(supabaseChannel);

    return () => {
      supabaseChannel.unsubscribe();
      setIsConnected(false);
    };
  }, []);

  const handleRemoteChange = useCallback(async (change: RealtimeChange) => {
    const { type, table, record, userId } = change;

    try {
      switch (type) {
        case 'INSERT':
          await userDBManager.put(userId, table, record);
          break;
        case 'UPDATE':
          const existing = await userDBManager.get(userId, table, record.id);
          if (existing) {
            await userDBManager.put(userId, table, { ...existing, ...record, syncStatus: 'synced' });
          } else {
            await userDBManager.put(userId, table, { ...record, syncStatus: 'synced' });
          }
          break;
        case 'DELETE':
          await userDBManager.delete(userId, table, record.id);
          break;
      }

      window.dispatchEvent(new CustomEvent('realtimeChange', { detail: change }));
    } catch (err) {
      console.error('Realtime: Failed to apply remote change:', err);
    }
  }, []);

  const subscribeToTable = useCallback((table: string, callback: (change: RealtimeChange) => void) => {
    setSubscriptions((prev) => {
      const next = new Map(prev);
      next.set(table, callback);
      return next;
    });

    return () => {
      setSubscriptions((prev) => {
        const next = new Map(prev);
        next.delete(table);
        return next;
      });
    };
  }, []);

  const broadcastChange = useCallback((table: string, type: 'INSERT' | 'UPDATE' | 'DELETE', record: any, userId: string) => {
    if (!channel || !isConnected) {
      console.log('Realtime: Not connected, skipping broadcast');
      return;
    }

    const deviceId = getDeviceId();
    const change: RealtimeChange = {
      type,
      table,
      record,
      userId,
      deviceId,
      timestamp: new Date().toISOString(),
    };

    console.log('Realtime: Broadcasting change:', change);
    channel.send({
      type: 'broadcast',
      event: 'sync',
      payload: change,
    });
  }, [channel, isConnected]);

  return (
    <RealtimeSyncContext.Provider value={{ isConnected, subscribeToTable, broadcastChange, lastChange }}>
      {children}
    </RealtimeSyncContext.Provider>
  );
}

export function useRealtimeSync() {
  const context = useContext(RealtimeSyncContext);
  if (!context) {
    throw new Error('useRealtimeSync must be used within RealtimeSyncProvider');
  }
  return context;
}

export function useRealtimeTable(table: string, callback: (change: RealtimeChange) => void) {
  const { subscribeToTable } = useRealtimeSync();

  useEffect(() => {
    return subscribeToTable(table, callback);
  }, [table, callback, subscribeToTable]);
}
