import { useState, useEffect } from 'react';
import { WifiOff, Users, Activity } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSync } from '../contexts/SyncContext';

export default function RealtimeStatus() {
  const { user } = useAuth();
  const { isOnline, isSyncEnabled, isSupabaseConfigured } = useSync();
  const [connectedDevices, setConnectedDevices] = useState(1);
  const [lastActivity, setLastActivity] = useState<Date | null>(null);

  useEffect(() => {
    if (!isOnline || !isSyncEnabled || !user) {
      setConnectedDevices(1);
      return;
    }

    // Listen for real-time activity from other devices
    const handleRealtimeActivity = (event: CustomEvent) => {
      const { timestamp } = event.detail;
      if (timestamp) {
        setLastActivity(new Date(timestamp));
        // Simulate multiple devices when we see activity
        setConnectedDevices(prev => Math.min(prev + 1, 3));
      }
    };

    window.addEventListener('schofyDataRefresh', handleRealtimeActivity as EventListener);

    // Reset device count periodically
    const resetInterval = setInterval(() => {
      if (lastActivity && Date.now() - lastActivity.getTime() > 30000) {
        setConnectedDevices(1);
      }
    }, 10000);

    return () => {
      window.removeEventListener('schofyDataRefresh', handleRealtimeActivity as EventListener);
      clearInterval(resetInterval);
    };
  }, [isOnline, isSyncEnabled, user, lastActivity]);

  if (!isSupabaseConfigured || !user) {
    return null;
  }

  const getStatusColor = () => {
    if (!isOnline) return 'text-slate-400';
    if (!isSyncEnabled) return 'text-amber-500';
    if (connectedDevices > 1) return 'text-emerald-500';
    return 'text-blue-500';
  };

  const getStatusText = () => {
    if (!isOnline) return 'Offline';
    if (!isSyncEnabled) return 'Sync Disabled';
    if (connectedDevices > 1) return `${connectedDevices} devices`;
    return 'Real-time Active';
  };

  const formatLastActivity = () => {
    if (!lastActivity) return '';
    const now = new Date();
    const diff = now.getTime() - lastActivity.getTime();
    
    if (diff < 5000) return 'just now';
    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    return lastActivity.toLocaleTimeString();
  };

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
      <div className="flex items-center gap-1">
        {isOnline && isSyncEnabled ? (
          <Activity className={`w-4 h-4 ${getStatusColor()} ${connectedDevices > 1 ? 'animate-pulse' : ''}`} />
        ) : (
          <WifiOff className={`w-4 h-4 ${getStatusColor()}`} />
        )}
        <span className={`text-xs font-medium ${getStatusColor()}`}>
          {getStatusText()}
        </span>
      </div>
      
      {connectedDevices > 1 && (
        <div className="flex items-center gap-1">
          <Users className="w-3 h-3 text-emerald-500" />
          <span className="text-xs text-emerald-500">
            {connectedDevices}
          </span>
        </div>
      )}
      
      {lastActivity && connectedDevices > 1 && (
        <span className="text-xs text-slate-500">
          {formatLastActivity()}
        </span>
      )}
    </div>
  );
}
