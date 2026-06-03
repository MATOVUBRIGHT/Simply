import { useEffect, useMemo, useState } from 'react';

export function useTypewriterText(messages: string[], options: { holdMs?: number; typeMs?: number; eraseMs?: number } = {}) {
  const messageKey = messages.join('\u0001');
  const stableMessages = useMemo(() => messages.filter(Boolean), [messageKey]);
  const holdMs = options.holdMs ?? 5000;
  const typeMs = options.typeMs ?? 28;
  const eraseMs = options.eraseMs ?? 18;
  const [messageIndex, setMessageIndex] = useState(0);
  const [visibleCount, setVisibleCount] = useState(0);
  const [erasing, setErasing] = useState(false);

  useEffect(() => {
    if (stableMessages.length === 0) return;
    const current = stableMessages[messageIndex % stableMessages.length] || '';
    let timer: number;

    if (!erasing && visibleCount < current.length) {
      timer = window.setTimeout(() => setVisibleCount((count) => count + 1), typeMs);
    } else if (!erasing) {
      timer = window.setTimeout(() => setErasing(true), holdMs);
    } else if (visibleCount > 0) {
      timer = window.setTimeout(() => setVisibleCount((count) => Math.max(0, count - 1)), eraseMs);
    } else {
      timer = window.setTimeout(() => {
        setErasing(false);
        setMessageIndex((index) => (index + 1) % stableMessages.length);
      }, 180);
    }

    return () => window.clearTimeout(timer);
  }, [eraseMs, erasing, holdMs, messageIndex, stableMessages, typeMs, visibleCount]);

  if (stableMessages.length === 0) return '';
  return (stableMessages[messageIndex % stableMessages.length] || '').slice(0, visibleCount);
}
