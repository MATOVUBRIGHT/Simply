// Recycle Bin utilities - user-specific storage

export interface DeletedItem {
  id: string;
  type: 'student' | 'staff' | 'announcement' | 'class' | 'subject' | 'fee' | 'exam' | 'transport';
  name: string;
  data: any;
  deletedAt: string;
  userId: string;
}

function getRecycleBinKey(userId: string): string {
  return `schofy_recycle_bin_${userId}`;
}

export function getRecycleBin(userId: string): DeletedItem[] {
  try {
    const stored = localStorage.getItem(getRecycleBinKey(userId));
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('Failed to load recycle bin:', error);
  }
  return [];
}

export function setRecycleBin(userId: string, items: DeletedItem[]): void {
  localStorage.setItem(getRecycleBinKey(userId), JSON.stringify(items));
  window.dispatchEvent(new Event('recycleBinUpdated'));
}

export function addToRecycleBin(userId: string, item: Omit<DeletedItem, 'userId'>): void {
  const items = getRecycleBin(userId);
  const originalId = item.data?.id;
  if (originalId) {
    const alreadyExists = items.some(existing => existing.data?.id === originalId && existing.type === item.type);
    if (alreadyExists) return;
  }
  items.push({ ...item, userId } as DeletedItem);
  setRecycleBin(userId, items);
}

export function removeFromRecycleBin(userId: string, itemId: string): void {
  const items = getRecycleBin(userId);
  const filtered = items.filter(i => i.id !== itemId);
  setRecycleBin(userId, filtered);
}

export function clearRecycleBin(userId: string): void {
  setRecycleBin(userId, []);
}
