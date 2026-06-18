
import { useEffect, useRef, useContext } from 'react';
import { useLocation } from 'react-router-dom';
import { NavigationContext } from '../contexts/NavigationContext';

export function TopLoadingProgressBar() {
  const location = useLocation();
  const navigationContext = useContext(NavigationContext);
  const { navigationProgress = 0, isNavigating = false, startNavigation } = navigationContext ?? {};
  const previousLocationRef = useRef<string | null>(null);
  const isInitialMount = useRef(true);

  useEffect(() => {
    const currentLocation = location.pathname + location.search + location.hash;

    // Initialize on first mount
    if (isInitialMount.current) {
      previousLocationRef.current = currentLocation;
      isInitialMount.current = false;
      return;
    }

    // Trigger navigation start on location change
    if (previousLocationRef.current && previousLocationRef.current !== currentLocation && startNavigation) {
      startNavigation(currentLocation);
    }

    previousLocationRef.current = currentLocation;
  }, [location.pathname, location.search, location.hash, startNavigation]);

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[99999] h-1 w-full pointer-events-none overflow-hidden bg-transparent"
      style={{
        opacity: isNavigating ? 1 : 0,
        transition: 'opacity 150ms ease-out',
      }}
    >
      <div
        className="h-full"
        style={{
          width: `${navigationProgress}%`,
          background: 'var(--primary-color)',
          boxShadow: '0 0 10px var(--primary-color)',
          transition: 'width 200ms ease-out',
        }}
      />
    </div>
  );
}
