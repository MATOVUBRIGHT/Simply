
import { useEffect, useContext, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { NavigationContext } from '../contexts/NavigationContext';

export function PageTransition({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigationContext = useContext(NavigationContext);
  const { saveScrollPosition, getScrollPosition, completeNavigation, isNavigating, previousLocation } = navigationContext ?? {};
  const currentKey = location.pathname + location.search + location.hash;
  const previousKeyRef = useRef<string>(currentKey);

  // Only call completeNavigation when location actually changes
  useEffect(() => {
    if (previousKeyRef.current !== currentKey) {
      completeNavigation?.();
      previousKeyRef.current = currentKey;
    }
  }, [currentKey, completeNavigation]);

  useEffect(() => {
    const savedPosition = getScrollPosition?.(currentKey);
    if (savedPosition !== null) {
      window.scrollTo({ top: savedPosition, left: 0, behavior: 'instant' });
    } else {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }

    document.body.classList.remove('modal-open');

    return () => {
      saveScrollPosition?.(currentKey, window.scrollY);
    };
  }, [location.pathname, location.search, location.hash, currentKey, saveScrollPosition, getScrollPosition]);

  return <>{children}</>;
}
