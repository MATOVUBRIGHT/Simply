const PREVIEW_ID = 'schofy-print-preview';

export function openPrintPreview(title: string, selector = '.print-area') {
  const source = document.querySelector<HTMLElement>(selector);
  if (!source) {
    window.print();
    return;
  }

  document.getElementById(PREVIEW_ID)?.remove();

  const overlay = document.createElement('div');
  overlay.id = PREVIEW_ID;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.innerHTML = `
    <div class="schofy-print-preview-backdrop"></div>
    <section class="schofy-print-preview-panel">
      <header class="schofy-print-preview-header">
        <div>
          <p>Print Preview</p>
          <h2>${escapeHtml(title)}</h2>
        </div>
        <div class="schofy-print-preview-actions">
          <button type="button" data-print>Print / Save PDF</button>
          <button type="button" data-close>Close</button>
        </div>
      </header>
      <iframe title="${escapeHtml(title)} preview"></iframe>
    </section>
  `;

  const style = document.createElement('style');
  style.textContent = `
    #${PREVIEW_ID} { position: fixed; inset: 0; z-index: 2147483647; display: flex; align-items: center; justify-content: center; padding: 18px; font-family: Inter, Arial, sans-serif; }
    #${PREVIEW_ID} .schofy-print-preview-backdrop { position: absolute; inset: 0; background: rgba(15, 23, 42, 0.62); backdrop-filter: blur(6px); }
    #${PREVIEW_ID} .schofy-print-preview-panel { position: relative; width: min(1120px, 96vw); height: min(880px, 94vh); display: grid; grid-template-rows: auto 1fr; overflow: hidden; border-radius: 14px; background: #f8fafc; box-shadow: 0 24px 80px rgba(2, 6, 23, 0.35); border: 1px solid rgba(148, 163, 184, 0.35); }
    #${PREVIEW_ID} .schofy-print-preview-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 16px; background: #0f172a; color: white; }
    #${PREVIEW_ID} .schofy-print-preview-header p { margin: 0 0 2px; font-size: 11px; color: #94a3b8; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; }
    #${PREVIEW_ID} .schofy-print-preview-header h2 { margin: 0; font-size: 16px; line-height: 1.25; font-weight: 800; }
    #${PREVIEW_ID} .schofy-print-preview-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
    #${PREVIEW_ID} button { border: 0; border-radius: 9px; padding: 9px 13px; font-size: 13px; font-weight: 800; cursor: pointer; }
    #${PREVIEW_ID} button[data-print] { background: #16a34a; color: white; }
    #${PREVIEW_ID} button[data-close] { background: #e2e8f0; color: #0f172a; }
    #${PREVIEW_ID} iframe { width: 100%; height: 100%; border: 0; background: #e5e7eb; }
    @media (max-width: 640px) {
      #${PREVIEW_ID} { padding: 8px; }
      #${PREVIEW_ID} .schofy-print-preview-panel { width: 100vw; height: 100vh; border-radius: 0; }
      #${PREVIEW_ID} .schofy-print-preview-header { align-items: flex-start; flex-direction: column; }
      #${PREVIEW_ID} .schofy-print-preview-actions { width: 100%; }
      #${PREVIEW_ID} button { flex: 1; }
    }
  `;
  overlay.appendChild(style);
  document.body.appendChild(overlay);

  const iframe = overlay.querySelector('iframe') as HTMLIFrameElement | null;
  if (!iframe) {
    overlay.remove();
    window.print();
    return;
  }

  iframe.srcdoc = buildPreviewDocument(title, source.outerHTML);

  const close = () => {
    document.removeEventListener('keydown', onKeyDown);
    overlay.remove();
  };
  const print = () => {
    const win = iframe.contentWindow;
    if (!win) return;
    win.focus();
    setTimeout(() => win.print(), 80);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') close();
  };

  overlay.querySelector('[data-close]')?.addEventListener('click', close);
  overlay.querySelector('[data-print]')?.addEventListener('click', print);
  document.addEventListener('keydown', onKeyDown);
}

function buildPreviewDocument(title: string, content: string) {
  const styles = Array.from(document.querySelectorAll<HTMLLinkElement | HTMLStyleElement>('link[rel="stylesheet"], style'))
    .map((node) => node.outerHTML)
    .join('\n');

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    ${styles}
    <style>
      html, body { min-height: 100%; }
      body { margin: 0; background: #e5e7eb; color: #111827; font-family: Inter, Arial, sans-serif; }
      .preview-page { width: min(210mm, calc(100% - 32px)); min-height: 297mm; margin: 18px auto; background: white; padding: 18mm; box-shadow: 0 18px 50px rgba(15, 23, 42, 0.18); box-sizing: border-box; }
      .print-area, #invoice-print, #report-card-print { display: block !important; visibility: visible !important; }
      @media print {
        @page { size: auto; margin: 12mm; }
        body { background: white !important; }
        .preview-page { width: auto !important; min-height: auto !important; margin: 0 !important; padding: 0 !important; box-shadow: none !important; }
      }
    </style>
  </head>
  <body>
    <main class="preview-page">${content}</main>
  </body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
