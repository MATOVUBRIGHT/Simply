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
      let nextSize = isLongValue ? 21 : 24;
      element.style.fontSize = `${nextSize}px`;
      element.style.whiteSpace = isLongValue ? 'normal' : 'nowrap';
      const overflows = () => {
        const maxTwoLineHeight = nextSize * 2.45;
        return element.scrollWidth > element.clientWidth || element.scrollHeight > maxTwoLineHeight;
      };
      while (nextSize > 14 && overflows()) {
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
    <span className="fit-stat-wrap relative block max-w-full align-top">
      <p
        ref={ref}
        tabIndex={isLongValue ? 0 : undefined}
        className={`fit-stat-value max-w-full overflow-visible font-bold leading-tight text-white outline-none ${isLongValue ? 'whitespace-normal break-words' : 'whitespace-nowrap'} ${className}`}
        style={{ fontSize }}
      >
        {children}
      </p>
    </span>
  );
}
