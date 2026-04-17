import { useState, useEffect, useRef } from 'react';
import { WifiOff, Activity } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSync } from '../contexts/SyncContext';

const RECENT_MS = 30_000;

export default function RealtimeStatus() {
  const { user } = useAuth();
  const { isOnline, isSyncEnabled, isSupabaseConfigured } = useSync();
  const [lastActivity, setLastActivity] = useState<Date | null>(null);
  const lastActivityRef = useRef<Date | null>(null);
  lastActivityRef.current = lastActivity;

  useEffect(() => {
    if (!isOnline || !isSyncEnabled || !user) {
      setLastActivity(null);
      return;
    }

    const handleRealtimeActivity = () => {
      setLastActivity(new Date());
    };

    window.addEventListener('schofyDataRefresh', handleRealtimeActivity);

    const resetInterval = setInterval(() => {
      const la = lastActivityRef.current;
      if (la && Date.now() - la.getTime() > RECENT_MS) {
        setLastActivity(null);
      }
    }, 10_000);

    return () => {
      window.removeEventListener('schofyDataRefresh', handleRealtimeActivity);
      clearInterval(resetInterval);
    };
  }, [isOnline, isSyncEnabled, user]);

  if (!isSupabaseConfigured || !user) {
    return null;
  }

  const recentlyActive =
    lastActivity != null && Date.now() - lastActivity.getTime() < RECENT_MS;

  const getStatusColor = () => {
    if (!isOnline) return 'text-slate-400';
    if (!isSyncEnabled) return 'text-amber-500';
    if (recentlyActive) return 'text-emerald-500';
    return 'text-blue-500';
  };

  const getStatusText = () => {
    if (!isOnline) return 'Offline';
    if (!isSyncEnabled) return 'Sync Disabled';
    if (recentlyActive) return 'Updated';
    return 'Real-time Active';
  };

  const formatLastActivity = () => {
    if (!lastActivity) return '';
    const now = new Date();
    const diff = now.getTime() - lastActivity.getTime();

    if (diff < 5000) return 'just now';
    if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    return lastActivity.toLocaleTimeString();
  };

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
      <div className="flex items-center gap-1">
        {isOnline && isSyncEnabled ? (
          <Activity
            className={`w-4 h-4 ${getStatusColor()} ${recentlyActive ? 'animate-pulse' : ''}`}
          />
        ) : (
          <WifiOff className={`w-4 h-4 ${getStatusColor()}`} />
        )}
        <span className={`text-xs font-medium ${getStatusColor()}`}>{getStatusText()}</span>
      </div>

      {recentlyActive && lastActivity && (
        <span className="text-xs text-slate-500">{formatLastActivity()}</span>
      )}
    </div>
  );
}
