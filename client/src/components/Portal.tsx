/**
 * Portal — renders children directly into document.body via createPortal.
 * Bypasses any CSS stacking context (overflow, transform, isolation) so
 * modals always cover the full viewport including sidebar and navbar.
 */
import { createPortal } from 'react-dom';

interface PortalProps {
  children: React.ReactNode;
}

export function Portal({ children }: PortalProps) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}
