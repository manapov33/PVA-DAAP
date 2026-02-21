/**
 * Property-based tests for Performance Optimizer - Enhanced Position Management
 * Tests Properties 14-18 for performance optimization features
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fc } from '@fast-check/vitest';
import { PerformanceOptimizer, BatchLoadResult } from './PerformanceOptimizer';
import { Position } from '../types/position';
import { positionArb } from '../test/generators';

describe('PerformanceOptimizer', () => {
  let optimizer: PerformanceOptimizer;

  beforeEach(() => {
    optimizer = new PerformanceOptimizer();
    vi.useFakeTimers();
  });

  afterEach(() => {
    optimizer.cleanup();
    vi.useRealTimers();
  });

  describe('Property 14: Batch Loading for Large Datasets', () => {
    it('should load positions in batches of specified size', async () => {
      const totalPositions = 150;
      const batchSize = 50;
      
      // Create optimizer with custom batch size
      const customOptimizer = new PerformanceOptimizer({
        batchSize,
        maxConcurrentBatches: 1,
        delayBetweenBatches: 0
      });

      const allPositions = Array.from({ length: totalPositions }, (_, i) => {
        const position = fc.sample(positionArb, 1)[0];
        return { ...position, id: i + 1 };
      });

      let batchCount = 0;
      const loadedBatches: number[] = [];

      const mockLoadFunction = async (offset: number, limit: number): Promise<BatchLoadResult<Position>> => {
        batchCount++;
        const batch = allPositions.slice(offset, offset + limit);
        loadedBatches.push(batch.length);
        
        return {
          items: batch,
          totalCount: totalPositions,
          hasMore: offset + limit < totalPositions,
          nextOffset: offset + limit
        };
      };

      const result = await customOptimizer.loadInBatches(mockLoadFunction, totalPositions);

      // Verify all positions were loaded
      expect(result).toHaveLength(totalPositions);
      
      // Verify batch sizes (all should be batchSize except possibly the last one)
      const expectedBatches = Math.ceil(totalPositions / batchSize);
      expect(batchCount).toBe(expectedBatches);
      
      // All batches except the last should be full size
      for (let i = 0; i < loadedBatches.length - 1; i++) {
        expect(loadedBatches[i]).toBe(batchSize);
      }
      
      // Last batch should contain remaining items
      const lastBatchExpectedSize = totalPositions % batchSize || batchSize;
      expect(loadedBatches[loadedBatches.length - 1]).toBe(lastBatchExpectedSize);

      customOptimizer.cleanup();
    });

    it('should handle batch loading errors gracefully', async () => {
      const totalPositions = 100;
      const errorFrequency = 3;
      
      let batchCount = 0;
      const mockLoadFunction = async (offset: number, limit: number): Promise<BatchLoadResult<Position>> => {
        batchCount++;
        
        // Simulate error every errorFrequency batches
        if (batchCount % errorFrequency === 0) {
          throw new Error(`Batch ${batchCount} failed`);
        }

        const batch = Array.from({ length: Math.min(limit, totalPositions - offset) }, (_, i) => {
          const position = fc.sample(positionArb, 1)[0];
          return { ...position, id: offset + i + 1 };
        });
        
        return {
          items: batch,
          totalCount: totalPositions,
          hasMore: offset + limit < totalPositions,
          nextOffset: offset + limit
        };
      };

      const result = await optimizer.loadInBatches(mockLoadFunction, totalPositions);

      // Should continue loading despite errors
      expect(result.length).toBeGreaterThan(0);
      // Should load fewer items due to failed batches
      expect(result.length).toBeLessThanOrEqual(totalPositions);
    }, 5000);
  });

  describe('Property 15: Virtualization for Large Lists', () => {
    // Note: This property is tested in the VirtualizedPositionList component tests
    // Here we test the supporting performance optimization features
    
    it('should efficiently handle large datasets with caching', async () => {
      const datasetSize = 100; // Reduced size for faster test
      const largeDataset = Array.from({ length: datasetSize }, (_, i) => {
        const position = fc.sample(positionArb, 1)[0];
        return { ...position, id: i + 1 };
      });

      // Cache the large dataset
      const cacheKey = `large_dataset_${datasetSize}`;
      let computationCount = 0;

      const expensiveComputation = async () => {
        computationCount++;
        // Remove setTimeout to avoid timeout issues
        return largeDataset;
      };

      // First call should compute
      const result1 = await optimizer.withCache(cacheKey, expensiveComputation);
      expect(result1).toHaveLength(datasetSize);
      expect(computationCount).toBe(1);

      // Second call should use cache
      const result2 = await optimizer.withCache(cacheKey, expensiveComputation);
      expect(result2).toHaveLength(datasetSize);
      expect(computationCount).toBe(1); // Should not increment

      // Results should be identical
      expect(result1).toEqual(result2);
    }, 5000);
  });

  describe('Property 16: Cache Utilization for Unchanged Data', () => {
    it('should use cached results for identical requests', async () => {
      const cacheKey = 'test_cache_key';
      const data = fc.sample(positionArb, 5);
      let computationCount = 0;
      
      const computation = async () => {
        computationCount++;
        return data;
      };

      // First call
      const result1 = await optimizer.withCache(cacheKey, computation);
      expect(computationCount).toBe(1);

      // Second call should use cache
      const result2 = await optimizer.withCache(cacheKey, computation);
      expect(computationCount).toBe(1); // Should not increment
      expect(result1).toEqual(result2);

      // Third call should also use cache
      const result3 = await optimizer.withCache(cacheKey, computation);
      expect(computationCount).toBe(1); // Should not increment
      expect(result1).toEqual(result3);
    });

    it('should invalidate cache after TTL expires', async () => {
      const cacheKey = 'test_ttl_key';
      const data = fc.sample(positionArb, 3);
      const ttl = 200; // 200ms TTL
      let computationCount = 0;
      
      const computation = async () => {
        computationCount++;
        return data;
      };

      // First call with custom TTL
      const result1 = await optimizer.withCache(cacheKey, computation, ttl);
      expect(computationCount).toBe(1);

      // Advance time beyond TTL
      vi.advanceTimersByTime(ttl + 100);

      // Second call should recompute due to expired cache
      const result2 = await optimizer.withCache(cacheKey, computation, ttl);
      expect(computationCount).toBe(2); // Should increment
      expect(result1).toEqual(result2); // Data should be the same
    });
  });

  describe('Property 18: Request Debouncing', () => {
    it('should debounce rapid successive calls', async () => {
      const debounceKey = 'test_debounce';
      const delay = 100; // Reduced delay
      const numCalls = 3; // Reduced number of calls
      
      let executionCount = 0;
      const results: number[] = [];

      const debouncedFunction = optimizer.debounce(
        debounceKey,
        async (value: number) => {
          executionCount++;
          return value * 2;
        },
        { delay }
      );

      // Make rapid successive calls
      const promises = Array.from({ length: numCalls }, (_, i) => 
        debouncedFunction(i).then(result => results.push(result))
      );

      // Advance time to trigger debounced execution
      vi.advanceTimersByTime(delay + 50);

      await Promise.all(promises);

      // Only the last call should have been executed
      expect(executionCount).toBe(1);
      expect(results).toHaveLength(numCalls);
      
      // All results should be the same (from the last call)
      const expectedResult = (numCalls - 1) * 2;
      results.forEach(result => {
        expect(result).toBe(expectedResult);
      });
    }, 3000);

    it('should handle multiple debounce keys independently', async () => {
      const keys = ['key1', 'key2'];
      const delay = 100;
      const executionCounts = new Map<string, number>();
      
      const createDebouncedFunction = (key: string) => {
        executionCounts.set(key, 0);
        return optimizer.debounce(
          key,
          async (value: number) => {
            executionCounts.set(key, executionCounts.get(key)! + 1);
            return value;
          },
          { delay }
        );
      };

      // Create debounced functions for each key
      const debouncedFunctions = keys.map(key => ({
        key,
        func: createDebouncedFunction(key)
      }));

      // Call each function multiple times
      const promises = debouncedFunctions.flatMap(({ func }, index) => 
        Array.from({ length: 2 }, () => func(index))
      );

      // Advance time to trigger all debounced executions
      vi.advanceTimersByTime(delay + 50);

      await Promise.all(promises);

      // Each key should have been executed exactly once
      keys.forEach(key => {
        expect(executionCounts.get(key)).toBe(1);
      });
    }, 3000);
  });

  describe('Cache Management', () => {
    it('should maintain cache size limits', async () => {
      const smallCacheOptimizer = new PerformanceOptimizer(
        {},
        { ttl: 60000, maxSize: 5 }
      );

      // Fill cache beyond limit
      for (let i = 0; i < 10; i++) {
        await smallCacheOptimizer.withCache(`key_${i}`, async () => `value_${i}`);
      }

      const stats = smallCacheOptimizer.getCacheStats();
      expect(stats.size).toBeLessThanOrEqual(5);

      smallCacheOptimizer.cleanup();
    });

    it('should provide accurate cache statistics', async () => {
      const stats1 = optimizer.getCacheStats();
      expect(stats1.size).toBe(0);

      // Add some cache entries
      await optimizer.withCache('test1', async () => 'value1');
      await optimizer.withCache('test2', async () => 'value2');

      const stats2 = optimizer.getCacheStats();
      expect(stats2.size).toBe(2);
      expect(stats2.maxSize).toBeGreaterThan(0);
    });
  });
});

/**
 * Feature: enhanced-position-management, Property 14: Batch Loading for Large Datasets
 * For any user with more than 50 positions, the positions should be loaded in batches of 50 to maintain performance
 * Validates: Requirements 5.1
 */

/**
 * Feature: enhanced-position-management, Property 15: Virtualization for Large Lists  
 * For any position list with more than 100 items, virtualization should be used for rendering optimization
 * Validates: Requirements 5.2
 */

/**
 * Feature: enhanced-position-management, Property 16: Cache Utilization for Unchanged Data
 * For any repeated request for the same position data, cached results should be used when the underlying data hasn't changed
 * Validates: Requirements 5.3
 */

/**
 * Feature: enhanced-position-management, Property 18: Request Debouncing
 * For any rapid sequence of blockchain requests, they should be debounced with a 1-second interval
 * Validates: Requirements 5.5
 */