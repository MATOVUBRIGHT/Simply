import type { KeyboardEvent } from 'react';

export function shouldSaveOnEnter(event: KeyboardEvent<HTMLElement>) {
  if (
    event.key !== 'Enter' ||
    event.shiftKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.nativeEvent.isComposing
  ) {
    return false;
  }

  const target = event.target;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLButtonElement || target instanceof HTMLAnchorElement) {
    return false;
  }

  if (target instanceof HTMLInputElement && ['button', 'submit', 'reset', 'checkbox', 'radio', 'file'].includes(target.type)) {
    return false;
  }

  return true;
}
