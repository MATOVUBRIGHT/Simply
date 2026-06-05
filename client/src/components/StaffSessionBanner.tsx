import { useStaffAuth } from '../contexts/StaffAuthContext';
import { LogOut, Shield, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';

export default function StaffSessionBanner() {
  const { staffSession, staffLogout, isStaffMode } = useStaffAuth();
  const navigate = useNavigate();
  const [hidden, setHidden] = useState(false);
  const lastScrollTopByElementRef = useRef<WeakMap<Element, number>>(new WeakMap());
  const lastWindowScrollTopRef = useRef(0);
  const touchYRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isStaffMode) return;

    const getScrollableTarget = (target?: EventTarget | null): Element | null => {
      if (target instanceof Element && target.scrollHeight > target.clientHeight) return target;
      if (target instanceof Element) return target.closest('.app-page-scroll, [data-scroll-container], .overflow-y-auto, .overflow-auto');
      return document.scrollingElement;
    };

    const handleScroll = (event?: Event) => {
      const target = getScrollableTarget(event?.target);
      const nextTop = target ? target.scrollTop : window.scrollY;
      const previousTop = target
        ? lastScrollTopByElementRef.current.get(target) ?? nextTop
        : lastWindowScrollTopRef.current;
      const scrollingDown = nextTop > previousTop + 8;
      const scrollingUp = nextTop < previousTop - 8;

      if (scrollingDown && nextTop > 24) setHidden(true);
      if (scrollingUp || nextTop <= 24) setHidden(false);
      if (target) lastScrollTopByElementRef.current.set(target, Math.max(0, nextTop));
      else lastWindowScrollTopRef.current = Math.max(0, nextTop);
    };

    const handleWheel = (event: WheelEvent) => {
      if (event.deltaY > 8) setHidden(true);
      if (event.deltaY < -8) setHidden(false);
    };

    const handleTouchStart = (event: TouchEvent) => {
      touchYRef.current = event.touches[0]?.clientY ?? null;
    };

    const handleTouchMove = (event: TouchEvent) => {
      const previousY = touchYRef.current;
      const nextY = event.touches[0]?.clientY ?? null;
      if (previousY === null || nextY === null) return;
      const delta = previousY - nextY;
      if (delta > 8) setHidden(true);
      if (delta < -8) setHidden(false);
      touchYRef.current = nextY;
    };

    const scroller = document.querySelector('.app-page-scroll');
    lastWindowScrollTopRef.current = window.scrollY;
    if (document.scrollingElement) lastScrollTopByElementRef.current.set(document.scrollingElement, document.scrollingElement.scrollTop);
    if (scroller) lastScrollTopByElementRef.current.set(scroller, scroller.scrollTop);
    scroller?.addEventListener('scroll', handleScroll, { passive: true });
    document.addEventListener('scroll', handleScroll, { passive: true, capture: true });
    document.addEventListener('wheel', handleWheel, { passive: true, capture: true });
    document.addEventListener('touchstart', handleTouchStart, { passive: true, capture: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: true, capture: true });
    window.addEventListener('scroll', handleScroll, { passive: true, capture: true });

    return () => {
      scroller?.removeEventListener('scroll', handleScroll);
      document.removeEventListener('scroll', handleScroll, { capture: true });
      document.removeEventListener('wheel', handleWheel, { capture: true });
      document.removeEventListener('touchstart', handleTouchStart, { capture: true });
      document.removeEventListener('touchmove', handleTouchMove, { capture: true });
      window.removeEventListener('scroll', handleScroll, { capture: true });
    };
  }, [isStaffMode]);

  if (!isStaffMode || !staffSession) return null;

  const { staffMember } = staffSession;

  return (
    <div className={`fixed bottom-0 left-0 right-0 z-[9998] border-t border-white/45 bg-white/45 px-4 py-2 text-slate-900 shadow-[0_-10px_30px_rgba(15,23,42,0.10)] backdrop-blur-xl transition-transform duration-200 dark:border-slate-700/45 dark:bg-slate-950/45 dark:text-white ${hidden ? 'translate-y-full' : 'translate-y-0'}`}>
      <div className="flex items-center gap-2 text-sm">
        <Shield size={15} className="text-primary-600 dark:text-primary-300" />
        <span className="font-semibold">{staffMember.firstName} {staffMember.lastName}</span>
        <span className="text-slate-600 text-xs dark:text-slate-300">({staffMember.staffId} · {staffMember.role})</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate('/roles')}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-primary-700 transition-colors hover:bg-white/55 hover:text-primary-900 dark:text-primary-200 dark:hover:bg-slate-800/60 dark:hover:text-white"
        >
          <Eye size={13} /> My Access
        </button>
        <button
          onClick={staffLogout}
          className="flex items-center gap-1.5 rounded-lg border border-white/50 bg-white/45 px-3 py-1.5 text-xs font-semibold text-slate-800 transition-colors hover:bg-white/75 dark:border-slate-700/60 dark:bg-slate-900/45 dark:text-slate-100 dark:hover:bg-slate-800/70"
        >
          <LogOut size={13} /> Sign Out
        </button>
      </div>
    </div>
  );
}
