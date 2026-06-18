import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

export interface NavigationContextType {
  isNavigating: boolean;
  navigationProgress: number;
  previousLocation: string | null;
  currentLocation: string;
  scrollPositions: Record<string, number>;
  saveScrollPosition: (path: string, position: number) => void;
  getScrollPosition: (path: string) => number | null;
  startNavigation: (toPath: string) => void;
  completeNavigation: () => void;
}

export const NavigationContext = createContext<NavigationContextType | undefined>(
  undefined
);

export const NavigationProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const location = useLocation();
  const { schoolId, user } = useAuth();
  const [isNavigating, setIsNavigating] = useState(false);
  const [navigationProgress, setNavigationProgress] = useState(0);
  const [previousLocation, setPreviousLocation] = useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = useState(
    location.pathname + location.search + location.hash
  );
  const [scrollPositions, setScrollPositions] = useState<Record<string, number>>({});
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const scrollPositionsRef = useRef<Record<string, number>>({});

  // Keep ref in sync with state
  useEffect(() => {
    scrollPositionsRef.current = scrollPositions;
  }, [scrollPositions]);

  useEffect(() => {
    const newLocation = location.pathname + location.search + location.hash;
    if (newLocation !== currentLocation) {
      setPreviousLocation(currentLocation);
      setCurrentLocation(newLocation);
    }
  }, [location.pathname, location.search, location.hash, currentLocation]);

  const startNavigation = useCallback((toPath: string) => {
    setIsNavigating(true);
    setNavigationProgress(10);

    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }

    let progress = 10;
    progressIntervalRef.current = setInterval(() => {
      progress += Math.random() * 15;
      if (progress > 90) {
        progress = 90;
        clearInterval(progressIntervalRef.current!);
      }
      setNavigationProgress(progress);
    }, 200);
  }, []);

  const completeNavigation = useCallback(() => {
    setNavigationProgress(100);
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    setTimeout(() => {
      setIsNavigating(false);
      setNavigationProgress(0);
    }, 300);
  }, []);

  const saveScrollPosition = useCallback((path: string, position: number) => {
    setScrollPositions(prev => ({
      ...prev,
      [path]: position,
    }));
  }, []);

  const getScrollPosition = useCallback((path: string) => {
    return scrollPositionsRef.current[path] ?? null;
  }, []);

  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, []);

  return (
    <NavigationContext.Provider
      value={{
        isNavigating,
        navigationProgress,
        previousLocation,
        currentLocation,
        scrollPositions,
        saveScrollPosition,
        getScrollPosition,
        startNavigation,
        completeNavigation,
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
};

export const useNavigation = () => {
  const context = useContext(NavigationContext);
  if (context === undefined) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
};
