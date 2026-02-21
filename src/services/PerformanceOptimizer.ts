/**
 * Performance Optimizer Service - Enhanced Position Management
 * Implements batch loading, request debouncing, and caching optimizations
 */

export interface BatchLoadConfig {
  batchSize: number;
  maxConcurrentBatches: number;
  delayBetweenBatches: number;
}

export interface DebounceConfig {
  delay: number;
  maxWait?: number;
}

export interface CacheConfig {
  ttl: number; // Time to live in milliseconds
  maxSize: number; // Maximum number of cached items
}

export interface BatchLoadResult<T> {
  items: T[];
  totalCount: number;
  hasMore: boolean;
  nextOffset?: number;
}

export class PerformanceOptimizer {
  private requestCache: Map<string, { data: any; timestamp: number; ttl: number }> = new Map();
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private batchConfig: BatchLoadConfig;
  private cacheConfig: CacheConfig;

  constructor(
    batchConfig: Partial<BatchLoadConfig> = {},
    cacheConfig: Partial<CacheConfig> = {}
  ) {
    this.batchConfig = {
      batchSize: 50,
      maxConcurrentBatches: 3,
      delayBetweenBatches: 100,
      ...batchConfig
    };

    this.cacheConfig = {
      ttl: 5 * 60 * 1000, // 5 minutes default
      maxSize: 1000,
      ...cacheConfig
    };
  }

  /**
   * Load data in batches with configurable batch size and concurrency
   */
  async loadInBatches<T>(
    loadFunction: (offset: number, limit: number) => Promise<BatchLoadResult<T>>,
    totalCount?: number
  ): Promise<T[]> {
    const allItems: T[] = [];
    let offset = 0;
    let hasMore = true;
    let activeBatches = 0;

    while (hasMore) {
      // Limit concurrent batches
      if (activeBatches >= this.batchConfig.maxConcurrentBatches) {
        await this.delay(this.batchConfig.delayBetweenBatches);
        continue;
      }

      activeBatches++;

      try {
        const result = await loadFunction(offset, this.batchConfig.batchSize);
        
        allItems.push(...result.items);
        hasMore = result.hasMore;
        offset = result.nextOffset || (offset + this.batchConfig.batchSize);

        // If we know the total count, check if we've loaded everything
        if (totalCount && allItems.length >= totalCount) {
          hasMore = false;
        }
      } catch (error) {
        console.error(`Batch loading failed at offset ${offset}:`, error);
        // Continue with next batch on error
        offset += this.batchConfig.batchSize;
      } finally {
        activeBatches--;
      }

      // Add delay between batches to prevent overwhelming the server
      if (hasMore && this.batchConfig.delayBetweenBatches > 0) {
        await this.delay(this.batchConfig.delayBetweenBatches);
      }
    }

    return allItems;
  }

  /**
   * Debounce function calls to prevent excessive requests
   */
  debounce<T extends (...args: any[]) => any>(
    key: string,
    func: T,
    config: DebounceConfig
  ): (...args: Parameters<T>) => Promise<ReturnType<T>> {
    return (...args: Parameters<T>): Promise<ReturnType<T>> => {
      return new Promise((resolve, reject) => {
        // Clear existing timer
        const existingTimer = this.debounceTimers.get(key);
        if (existingTimer) {
          clearTimeout(existingTimer);
        }

        // Set new timer
        const timer = setTimeout(async () => {
          try {
            const result = await func(...args);
            resolve(result);
          } catch (error) {
            reject(error);
          } finally {
            this.debounceTimers.delete(key);
          }
        }, config.delay);

        this.debounceTimers.set(key, timer);
      });
    };
  }

  /**
   * Cache function results with TTL
   */
  async withCache<T>(
    key: string,
    func: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    const cacheKey = this.generateCacheKey(key);
    const cached = this.requestCache.get(cacheKey);
    const now = Date.now();

    // Return cached data if valid
    if (cached && (now - cached.timestamp) < cached.ttl) {
      return cached.data;
    }

    // Execute function and cache result
    try {
      const result = await func();
      
      // Clean cache if it's getting too large
      if (this.requestCache.size >= this.cacheConfig.maxSize) {
        this.cleanupCache();
      }

      // Cache the result
      this.requestCache.set(cacheKey, {
        data: result,
        timestamp: now,
        ttl: ttl || this.cacheConfig.ttl
      });

      return result;
    } catch (error) {
      // Remove invalid cache entry on error
      this.requestCache.delete(cacheKey);
      throw error;
    }
  }

  /**
   * Memoize function results for unchanged inputs
   */
  memoize<T extends (...args: any[]) => any>(
    func: T,
    keyGenerator?: (...args: Parameters<T>) => string
  ): T {
    const cache = new Map<string, ReturnType<T>>();

    return ((...args: Parameters<T>): ReturnType<T> => {
      const key = keyGenerator ? keyGenerator(...args) : JSON.stringify(args);
      
      if (cache.has(key)) {
        return cache.get(key)!;
      }

      const result = func(...args);
      cache.set(key, result);
      
      return result;
    }) as T;
  }

  /**
   * Check if data should use cached version
   */
  shouldUseCache(key: string): boolean {
    const cacheKey = this.generateCacheKey(key);
    const cached = this.requestCache.get(cacheKey);
    
    if (!cached) return false;
    
    const now = Date.now();
    return (now - cached.timestamp) < cached.ttl;
  }

  /**
   * Invalidate cache for specific key or pattern
   */
  invalidateCache(keyPattern?: string): void {
    if (!keyPattern) {
      this.requestCache.clear();
      return;
    }

    for (const key of this.requestCache.keys()) {
      if (key.includes(keyPattern)) {
        this.requestCache.delete(key);
      }
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    oldestEntry: number | null;
  } {
    const now = Date.now();
    let oldestTimestamp: number | null = null;
    
    for (const entry of this.requestCache.values()) {
      if (oldestTimestamp === null || entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
      }
    }

    return {
      size: this.requestCache.size,
      maxSize: this.cacheConfig.maxSize,
      hitRate: 0, // Would need to track hits/misses for accurate calculation
      oldestEntry: oldestTimestamp ? now - oldestTimestamp : null
    };
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    const entriesToDelete: string[] = [];

    for (const [key, entry] of this.requestCache.entries()) {
      if ((now - entry.timestamp) >= entry.ttl) {
        entriesToDelete.push(key);
      }
    }

    // Remove expired entries
    entriesToDelete.forEach(key => this.requestCache.delete(key));

    // If still too large, remove oldest entries
    if (this.requestCache.size >= this.cacheConfig.maxSize) {
      const entries = Array.from(this.requestCache.entries())
        .sort(([, a], [, b]) => a.timestamp - b.timestamp);
      
      const toRemove = entries.slice(0, Math.floor(this.cacheConfig.maxSize * 0.2));
      toRemove.forEach(([key]) => this.requestCache.delete(key));
    }
  }

  /**
   * Generate consistent cache key
   */
  private generateCacheKey(key: string): string {
    return `perf_cache_${key}`;
  }

  /**
   * Delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup all timers and cache
   */
  cleanup(): void {
    // Clear all debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    // Clear cache
    this.requestCache.clear();
  }
}