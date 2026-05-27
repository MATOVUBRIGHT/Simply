import { ReactNode, useLayoutEffect, useMemo, useRef, useState } from 'react';

type FitStatValueProps = {
  children: ReactNode;
  className?: string;
};

export function FitStatValue({ children, className = '' }: FitStatValueProps) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [fontSize, setFontSize] = useState(24);
  const fullValue = useMemo(() => {
    if (typeof children === 'string' || typeof children === 'number') return String(children);
    return '';
  }, [children]);
  const isLongValue = fullValue.replace(/\s/g, '').length >= 9;

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const card = element.closest('[class*="card-solid"], .stat-card');
    card?.classList.toggle('has-long-stat-value', isLongValue);

    const fit = () => {
      let nextSize = 24;
      element.style.fontSize = `${nextSize}px`;
      while (nextSize > 15 && element.scrollWidth > element.clientWidth) {
        nextSize -= 1;
        element.style.fontSize = `${nextSize}px`;
      }
      setFontSize(nextSize);
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => {
      observer.disconnect();
      card?.classList.remove('has-long-stat-value');
    };
  }, [children, isLongValue]);

  return (
    <span className="fit-stat-wrap group relative inline-block max-w-full align-top">
      <p
        ref={ref}
        tabIndex={isLongValue ? 0 : undefined}
        className={`fit-stat-value font-bold leading-tight text-white whitespace-nowrap max-w-full overflow-visible outline-none transition-[font-size] duration-100 group-hover:!text-[24px] group-focus-within:!text-[24px] ${className}`}
        style={{ fontSize }}
      >
        {children}
      </p>
    </span>
  );
}
