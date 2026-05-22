// client/src/lib/database/OptimizedDataService.ts
// Pagination-aware data service

import { dataService } from './DataService';
import { performanceMonitor } from '../../services/performanceMonitor';
import { queryCache } from '../cache/QueryCache';

export interface PaginationOptions {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

class OptimizedDataService {
  /**
   * Get paginated records - only loads current page
   */
  async getPaginated<T>(
    userId: string,
    table: string,
    options: PaginationOptions
  ): Promise<PaginatedResult<T>> {
    return performanceMonitor.measure(
      `paginated-query-${table}`,
      async () => {
        const cacheKey = `${table}:page:${options.page}:size:${options.pageSize}`;
        
        // Check cache first
        const cached = queryCache.get<PaginatedResult<T>>(cacheKey);
        if (cached) return cached;

        // Use the unified data service
        const { items, total } = await dataService.getPage(
          userId,
          table,
          options.page,
          options.pageSize
        );

        const totalPages = Math.ceil(total / options.pageSize);
        const result = {
          items: items as T[],
          total,
          page: options.page,
          pageSize: options.pageSize,
          totalPages
        };

        queryCache.set(cacheKey, result);
        return result;
      }
    );
  }

  /**
   * Search with pagination and debouncing
   */
  async searchPaginated<T>(
    userId: string,
    table: string,
    searchFields: string[],
    query: string,
    options: PaginationOptions
  ): Promise<PaginatedResult<T>> {
    return performanceMonitor.measure(
      `search-paginated-${table}`,
      async () => {
        const allItems = await dataService.getAll(userId, table) as any[];
        
        // Filter by search query
        const filtered = allItems.filter(item =>
          searchFields.some(field =>
            String(item[field] || '').toLowerCase().includes(query.toLowerCase())
          )
        );

        const total = filtered.length;
        const totalPages = Math.ceil(total / options.pageSize);
        const startIndex = (options.page - 1) * options.pageSize;
        const endIndex = startIndex + options.pageSize;
        const items = filtered.slice(startIndex, endIndex) as T[];

        return {
          items,
          total,
          page: options.page,
          pageSize: options.pageSize,
          totalPages,
        };
      }
    );
  }

  /**
   * Filtered query with pagination
   */
  async filterPaginated<T>(
    userId: string,
    table: string,
    filters: Record<string, any>,
    options: PaginationOptions
  ): Promise<PaginatedResult<T>> {
    return performanceMonitor.measure(
      `filter-paginated-${table}`,
      async () => {
        let allItems = await dataService.getAll(userId, table) as any[];

        // Apply filters
        for (const [key, value] of Object.entries(filters)) {
          if (value !== undefined && value !== null) {
            allItems = allItems.filter(item => item[key] === value);
          }
        }

        const total = allItems.length;
        const totalPages = Math.ceil(total / options.pageSize);
        const startIndex = (options.page - 1) * options.pageSize;
        const endIndex = startIndex + options.pageSize;
        const items = allItems.slice(startIndex, endIndex) as T[];

        return {
          items,
          total,
          page: options.page,
          pageSize: options.pageSize,
          totalPages,
        };
      }
    );
  }

  /**
   * Get specific fields only (projection)
   */
  async getFields<T>(
    userId: string,
    table: string,
    fields: (keyof T)[],
    options?: PaginationOptions
  ): Promise<Partial<T>[]> {
    return performanceMonitor.measure(
      `projection-query-${table}`,
      async () => {
        let allItems = await dataService.getAll(userId, table) as T[];

        // Project only needed fields
        const projected = allItems.map(item =>
          fields.reduce((acc, field) => {
            acc[field] = item[field];
            return acc;
          }, {} as Partial<T>)
        );

        if (options) {
          const startIndex = (options.page - 1) * options.pageSize;
          const endIndex = startIndex + options.pageSize;
          return projected.slice(startIndex, endIndex);
        }

        return projected;
      }
    );
  }

  /**
   * Count records (useful for pagination UI)
   */
  async count(userId: string, table: string): Promise<number> {
    return performanceMonitor.measure(
      `count-${table}`,
      async () => {
        const items = await dataService.getAll(userId, table);
        return items.length;
      }
    );
  }

  /**
   * Get summary statistics
   */
  async getStats(
    userId: string,
    table: string,
    numericFields: string[]
  ): Promise<Record<string, { sum: number; avg: number; min: number; max: number }>> {
    return performanceMonitor.measure(
      `stats-${table}`,
      async () => {
        const items = await dataService.getAll(userId, table) as any[];
        const stats: any = {};

        for (const field of numericFields) {
          const values = items
            .map(item => Number(item[field]))
            .filter(v => !isNaN(v));

          if (values.length === 0) continue;

          stats[field] = {
            sum: values.reduce((a, b) => a + b, 0),
            avg: values.reduce((a, b) => a + b, 0) / values.length,
            min: Math.min(...values),
            max: Math.max(...values),
          };
        }

        return stats;
      }
    );
  }

  /**
   * Clear cache for table
   */
  clearCache(table: string) {
    queryCache.invalidatePattern(`${table}:*`);
  }

  async getAll<T>(userId: string, table: string): Promise<T[]> {
    return dataService.getAll(userId, table);
  }

  async get<T>(userId: string, table: string, id: string): Promise<T | null> {
    return dataService.get(userId, table, id);
  }

  async create<T>(userId: string, table: string, data: any): Promise<any> {
    return dataService.create(userId, table, data);
  }

  async update<T>(userId: string, table: string, id: string, data: any): Promise<any> {
    return dataService.update(userId, table, id, data);
  }

  async delete(userId: string, table: string, id: string): Promise<boolean> {
    const res = await dataService.delete(userId, table, id);
    return res.success;
  }
}

export const optimizedDataService = new OptimizedDataService();
