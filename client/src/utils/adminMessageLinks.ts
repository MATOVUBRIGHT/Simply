export interface AdminMessageLinkMeta {
  messageId: string;
  allowReply: boolean;
  actionUrl: string;
  imageUrl: string;
  attachmentUrl: string;
  attachmentName: string;
  attachmentType: string;
  attachmentSize: number;
}

export function buildAdminMessageLink(meta: {
  messageId: string;
  allowReply?: boolean;
  actionUrl?: string;
  imageUrl?: string;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentType?: string;
  attachmentSize?: number;
}) {
  const params = new URLSearchParams();
  params.set('reply', meta.allowReply === false ? '0' : '1');
  if (meta.actionUrl?.trim()) params.set('url', meta.actionUrl.trim());
  if (meta.imageUrl?.trim()) params.set('image', meta.imageUrl.trim());
  if (meta.attachmentUrl?.trim()) params.set('attachment', meta.attachmentUrl.trim());
  if (meta.attachmentName?.trim()) params.set('attachmentName', meta.attachmentName.trim());
  if (meta.attachmentType?.trim()) params.set('attachmentType', meta.attachmentType.trim());
  if (meta.attachmentSize) params.set('attachmentSize', String(meta.attachmentSize));
  const query = params.toString();
  return `admin-message:${meta.messageId}${query ? `?${query}` : ''}`;
}

export function parseAdminMessageLink(link?: string | null): AdminMessageLinkMeta | null {
  const value = String(link || '');
  if (!value.startsWith('admin-message:')) return null;

  const raw = value.slice('admin-message:'.length);
  const [messageId, query = ''] = raw.split('?');
  if (!messageId) return null;

  const params = new URLSearchParams(query);
  return {
    messageId,
    allowReply: params.get('reply') !== '0',
    actionUrl: params.get('url') || '',
    imageUrl: params.get('image') || '',
    attachmentUrl: params.get('attachment') || '',
    attachmentName: params.get('attachmentName') || 'attachment',
    attachmentType: params.get('attachmentType') || '',
    attachmentSize: Number(params.get('attachmentSize') || 0),
  };
}

export function normalizeExternalUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}
