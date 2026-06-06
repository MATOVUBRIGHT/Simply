import { dataService } from '../lib/database/SupabaseDataService';

export type BatchTask<T = unknown> = () => Promise<T>;

export function chunkThirtyPercent<T>(items: T[]) {
  return chunkByPercent(items, 0.3);
}

export function chunkFortyPercent<T>(items: T[]) {
  return chunkByPercent(items, 0.4);
}

export function chunkByPercent<T>(items: T[], percent: number) {
  if (items.length === 0) return [];
  const safePercent = Number.isFinite(percent) && percent > 0 ? percent : 0.3;
  const size = Math.max(1, Math.ceil(items.length * safePercent));
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export async function processInThirtyPercentBatches<T>(
  items: T[],
  processBatch: (batch: T[], startIndex: number) => Promise<void>,
  onProgress?: (progress: number, processed: number, total: number) => void,
) {
  const total = items.length;
  if (total === 0) {
    onProgress?.(100, 0, 0);
    return 0;
  }

  let processed = 0;
  for (const batch of chunkThirtyPercent(items)) {
    await processBatch(batch, processed);
    processed += batch.length;
    onProgress?.(Math.round((processed / total) * 100), processed, total);
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return processed;
}

export async function processInPercentBatches<T>(
  items: T[],
  percent: number,
  processBatch: (batch: T[], startIndex: number) => Promise<void>,
  onProgress?: (progress: number, processed: number, total: number) => void,
) {
  const total = items.length;
  if (total === 0) {
    onProgress?.(100, 0, 0);
    return 0;
  }

  let processed = 0;
  for (const batch of chunkByPercent(items, percent)) {
    await processBatch(batch, processed);
    processed += batch.length;
    onProgress?.(Math.round((processed / total) * 100), processed, total);
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return processed;
}

export async function runTasksInThirtyPercentBatches<T>(
  tasks: BatchTask<T>[],
  onProgress?: (progress: number, processed: number, total: number) => void,
) {
  const results: T[] = [];
  await processInThirtyPercentBatches(
    tasks,
    async batch => {
      const batchResults = await Promise.all(batch.map(task => task()));
      results.push(...batchResults);
    },
    onProgress,
  );
  return results;
}

export async function runTasksInPercentBatches<T>(
  tasks: BatchTask<T>[],
  percent: number,
  onProgress?: (progress: number, processed: number, total: number) => void,
) {
  const results: T[] = [];
  await processInPercentBatches(
    tasks,
    percent,
    async batch => {
      const batchResults = await Promise.all(batch.map(task => task()));
      results.push(...batchResults);
    },
    onProgress,
  );
  return results;
}

export async function deleteInThirtyPercentBatches(
  userId: string,
  tableName: string,
  ids: string[],
  onBatchDeleted?: (deletedIds: string[], deletedTotal: number) => void,
) {
  let deletedTotal = 0;
  for (const chunk of chunkThirtyPercent(ids)) {
    const result = await dataService.batchDelete(userId, tableName, chunk);
    if (!result.success) throw new Error(result.error || `Failed to delete ${tableName}`);
    deletedTotal += chunk.length;
    onBatchDeleted?.(chunk, deletedTotal);
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return deletedTotal;
}

export async function deleteInFortyPercentBatches(
  userId: string,
  tableName: string,
  ids: string[],
  onBatchDeleted?: (deletedIds: string[], deletedTotal: number, total: number) => void,
) {
  let deletedTotal = 0;
  for (const chunk of chunkFortyPercent(ids)) {
    const result = await dataService.batchDelete(userId, tableName, chunk);
    if (!result.success) throw new Error(result.error || `Failed to delete ${tableName}`);
    deletedTotal += chunk.length;
    onBatchDeleted?.(chunk, deletedTotal, ids.length);
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return deletedTotal;
}
