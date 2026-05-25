export async function openExternalLink(url: string): Promise<boolean> {
  const target = url.trim();
  if (!target) return false;

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return false;
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return false;
  }

  const safeTarget = parsed.toString();

  if (window.electronAPI?.openExternal) {
    const result = await window.electronAPI.openExternal(safeTarget);
    return Boolean(result?.success);
  }

  const opened = window.open(safeTarget, '_blank', 'noopener,noreferrer');
  return Boolean(opened);
}

export function downloadDataUrl(dataUrl: string, filename = 'attachment') {
  const [header, payload] = dataUrl.split(',');
  if (!header || !payload || !header.startsWith('data:')) {
    openExternalLink(dataUrl);
    return;
  }

  const mime = header.match(/^data:([^;]+)/)?.[1] || 'application/octet-stream';
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadAttachment(url: string, filename?: string) {
  if (url.startsWith('data:')) {
    downloadDataUrl(url, filename || 'attachment');
    return;
  }

  void openExternalLink(url);
}
