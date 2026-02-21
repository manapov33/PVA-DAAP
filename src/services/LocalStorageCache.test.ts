/**
 * LocalStorageCache Property Tests - Enhanced Position Management
 * Tests cache persistence and invalidation properties
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fc } from '@fast-check/vitest';
import { LocalStorageCache } from './LocalStorageCache';
import { Position } from '../types/position';
import { positionArb, userAddressArb } from '../test/generators';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('LocalStorageCache Property Tests', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  describe('Property 5: Cache Persistence Round-trip', () => {
    it('should preserve position data through save/load cycle', () => {
      /**
       * Feature: enhanced-position-management, Property 5: Cache Persistence Round-trip
       * Validates: Requirements 2.1, 2.3
       */
      fc.assert(
        fc.property(
          userAddressArb,
          fc.array(positionArb, { minLength: 0, maxLength: 20 }),
          (userAddress: string, originalPositions: Position[]) => {
            // Save positions to cache
            LocalStorageCache.save(userAddress, originalPositions);
            
            // Load positions from cache
            const loadedPositions = LocalStorageCache.load(userAddress);
            
            // Should not be null for fresh data
            expect(loadedPositions).not.toBeNull();
            
            if (loadedPositions) {
              // Should have same length
              expect(loadedPositions).toHaveLength(originalPositions.length);
              
              // Each position should match exactly
              originalPositions.forEach((originalPos, index) => {
                const loadedPos = loadedPositions[index];
                expect(loadedPos.id).toBe(originalPos.id);
                expect(loadedPos.owner).toBe(originalPos.owner);
                expect(loadedPos.amountTokens).toBe(originalPos.amountTokens);
                expect(loadedPos.buyPrice).toBe(originalPos.buyPrice);
                expect(loadedPos.createdAt).toBe(originalPos.createdAt);
                expect(loadedPos.unlockAt).toBe(originalPos.unlockAt);
                expect(loadedPos.partId).toBe(originalPos.partId);
                expect(loadedPos.league).toEqual(originalPos.league);
                expect(loadedPos.closed).toBe(originalPos.closed);
                expect(loadedPos.status).toBe(originalPos.status);
                expect(loadedPos.onChainId).toBe(originalPos.onChainId);
                expect(loadedPos.transactionHash).toBe(originalPos.transactionHash);
              });
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle BigInt serialization correctly', () => {
      /**
       * Feature: enhanced-position-management, Property 5: Cache Persistence Round-trip
       * Validates: Requirements 2.1, 2.3
       */
      fc.assert(
        fc.property(
          userAddressArb,
          positionArb,
          (userAddress: string, position: Position) => {
            // Ensure we have BigInt values
            const positionWithBigInt: Position = {
              ...position,
              amountTokens: BigInt(Math.floor(Math.random() * 1000000)),
              buyPrice: BigInt(Math.floor(Math.random() * 1000000)),
            };
            
            LocalStorageCache.save(userAddress, [positionWithBigInt]);
            const loaded = LocalStorageCache.load(userAddress);
            
            expect(loaded).not.toBeNull();
            if (loaded && loaded.length > 0) {
              expect(typeof loaded[0].amountTokens).toBe('bigint');
              expect(typeof loaded[0].buyPrice).toBe('bigint');
              expect(loaded[0].amountTokens).toBe(positionWithBigInt.amountTokens);
              expect(loaded[0].buyPrice).toBe(positionWithBigInt.buyPrice);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 6: Cache Invalidation by Time', () => {
    it('should return null for expired cache entries', () => {
      /**
       * Feature: enhanced-position-management, Property 6: Cache Invalidation by Time
       * Validates: Requirements 2.4
       */
      fc.assert(
        fc.property(
          userAddressArb,
          fc.array(positionArb, { minLength: 1, maxLength: 10 }),
          (userAddress: string, positions: Position[]) => {
            // Mock Date.now to simulate time passing
            const originalNow = Date.now;
            const baseTime = 1000000000000; // Fixed base time
            
            // Save data at base time
            vi.spyOn(Date, 'now').mockReturnValue(baseTime);
            LocalStorageCache.save(userAddress, positions);
            
            // Try to load immediately - should work
            const freshLoad = LocalStorageCache.load(userAddress);
            expect(freshLoad).not.toBeNull();
            expect(freshLoad).toHaveLength(positions.length);
            
            // Simulate time passing beyond TTL (1 hour + 1 minute)
            const expiredTime = baseTime + (61 * 60 * 1000);
            vi.spyOn(Date, 'now').mockReturnValue(expiredTime);
            
            // Try to load after expiration - should return null
            const expiredLoad = LocalStorageCache.load(userAddress);
            expect(expiredLoad).toBeNull();
            
            // Restore original Date.now
            Date.now = originalNow;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly identify valid vs invalid cache', () => {
      /**
       * Feature: enhanced-position-management, Property 6: Cache Invalidation by Time
       * Validates: Requirements 2.4
       */
      fc.assert(
        fc.property(
          userAddressArb,
          fc.array(positionArb, { minLength: 1, maxLength: 5 }),
          (userAddress: string, positions: Position[]) => {
            const originalNow = Date.now;
            const baseTime = 1000000000000;
            
            // Save data at base time
            vi.spyOn(Date, 'now').mockReturnValue(baseTime);
            LocalStorageCache.save(userAddress, positions);
            
            // Should be valid immediately
            expect(LocalStorageCache.isValid(userAddress)).toBe(true);
            
            // Should be valid within TTL (30 minutes)
            vi.spyOn(Date, 'now').mockReturnValue(baseTime + (30 * 60 * 1000));
            expect(LocalStorageCache.isValid(userAddress)).toBe(true);
            
            // Should be invalid after TTL (1 hour + 1 minute)
            vi.spyOn(Date, 'now').mockReturnValue(baseTime + (61 * 60 * 1000));
            expect(LocalStorageCache.isValid(userAddress)).toBe(false);
            
            Date.now = originalNow;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 7: Data Cleanup by Age', () => {
    it('should remove data older than 7 days during cleanup', () => {
      /**
       * Feature: enhanced-position-management, Property 7: Data Cleanup by Age
       * Validates: Requirements 2.5
       */
      fc.assert(
        fc.property(
          fc.array(userAddressArb, { minLength: 2, maxLength: 5 }),
          fc.array(fc.array(positionArb, { minLength: 1, maxLength: 5 }), { minLength: 2, maxLength: 5 }),
          (userAddresses: string[], positionArrays: Position[][]) => {
            // Ensure we have matching arrays
            fc.pre(userAddresses.length === positionArrays.length);
            // Ensure unique addresses
            const uniqueAddresses = [...new Set(userAddresses.map(addr => addr.toLowerCase()))];
            fc.pre(uniqueAddresses.length === userAddresses.length);
            
            const originalNow = Date.now;
            const baseTime = 1000000000000;
            
            // Save all data at a recent time first to avoid TTL issues during save
            const saveTime = baseTime - (30 * 60 * 1000); // 30 minutes ago
            vi.spyOn(Date, 'now').mockReturnValue(saveTime);
            
            for (let i = 0; i < userAddresses.length; i++) {
              LocalStorageCache.save(userAddresses[i], positionArrays[i]);
            }
            
            // Manually adjust timestamps to simulate different ages
            const allData = JSON.parse(localStorage.getItem('pva_positions_cache') || '{}');
            const oldUserCount = Math.floor(userAddresses.length / 2);
            
            // Make some data old (8 days ago - should be cleaned up)
            for (let i = 0; i < oldUserCount; i++) {
              const userKey = userAddresses[i].toLowerCase();
              if (allData.data && allData.data[userKey]) {
                allData.data[userKey].timestamp = baseTime - (8 * 24 * 60 * 60 * 1000);
              }
            }
            
            // Keep some data recent (6 days ago - should be preserved)
            for (let i = oldUserCount; i < userAddresses.length; i++) {
              const userKey = userAddresses[i].toLowerCase();
              if (allData.data && allData.data[userKey]) {
                allData.data[userKey].timestamp = baseTime - (6 * 24 * 60 * 60 * 1000);
              }
            }
            
            localStorage.setItem('pva_positions_cache', JSON.stringify(allData));
            
            // Move to current time and run cleanup
            vi.spyOn(Date, 'now').mockReturnValue(baseTime);
            LocalStorageCache.cleanupOldData();
            
            // Old data (8 days) should be gone from storage
            for (let i = 0; i < oldUserCount; i++) {
              const lastUpdate = LocalStorageCache.getLastUpdateTime(userAddresses[i]);
              expect(lastUpdate).toBeNull(); // Should be null after cleanup
            }
            
            // Recent data (6 days) should still exist in storage
            // Note: It won't be loadable due to TTL (1 hour), but should exist in storage
            for (let i = oldUserCount; i < userAddresses.length; i++) {
              const lastUpdate = LocalStorageCache.getLastUpdateTime(userAddresses[i]);
              expect(lastUpdate).not.toBeNull(); // Should still exist in storage
              
              // Data exists in storage but is not loadable due to TTL (older than 1 hour)
              const loaded = LocalStorageCache.load(userAddresses[i]);
              expect(loaded).toBeNull(); // Should be null due to TTL, but that's expected
            }
            
            Date.now = originalNow;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve data newer than 7 days during cleanup', () => {
      /**
       * Feature: enhanced-position-management, Property 7: Data Cleanup by Age
       * Validates: Requirements 2.5
       */
      fc.assert(
        fc.property(
          userAddressArb,
          fc.array(positionArb, { minLength: 1, maxLength: 10 }),
          fc.integer({ min: 0, max: 6 }), // Days old (0-6, all should be preserved)
          (userAddress: string, positions: Position[], daysOld: number) => {
            const originalNow = Date.now;
            const baseTime = 1000000000000;
            
            // Save data at a recent time first to avoid TTL issues during save
            const saveTime = baseTime - (30 * 60 * 1000); // 30 minutes ago
            vi.spyOn(Date, 'now').mockReturnValue(saveTime);
            LocalStorageCache.save(userAddress, positions);
            
            // Manually adjust the timestamp in storage to simulate older data
            const allData = JSON.parse(localStorage.getItem('pva_positions_cache') || '{}');
            if (allData.data && allData.data[userAddress.toLowerCase()]) {
              allData.data[userAddress.toLowerCase()].timestamp = baseTime - (daysOld * 24 * 60 * 60 * 1000);
              localStorage.setItem('pva_positions_cache', JSON.stringify(allData));
            }
            
            // Move to current time and run cleanup
            vi.spyOn(Date, 'now').mockReturnValue(baseTime);
            LocalStorageCache.cleanupOldData();
            
            // Data should still exist in storage since it's less than 7 days old
            const lastUpdate = LocalStorageCache.getLastUpdateTime(userAddress);
            expect(lastUpdate).not.toBeNull();
            
            // Note: Data won't be loadable if older than 1 hour due to TTL, but that's expected behavior
            // The cleanup test only verifies storage persistence, not loadability
            
            Date.now = originalNow;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle cleanup with mixed age data correctly', () => {
      /**
       * Feature: enhanced-position-management, Property 7: Data Cleanup by Age
       * Validates: Requirements 2.5
       */
      fc.assert(
        fc.property(
          fc.array(userAddressArb, { minLength: 3, maxLength: 6 }),
          fc.array(fc.array(positionArb, { minLength: 1, maxLength: 3 }), { minLength: 3, maxLength: 6 }),
          (userAddresses: string[], positionArrays: Position[][]) => {
            fc.pre(userAddresses.length === positionArrays.length);
            const uniqueAddresses = [...new Set(userAddresses.map(addr => addr.toLowerCase()))];
            fc.pre(uniqueAddresses.length === userAddresses.length);
            
            const originalNow = Date.now;
            const baseTime = 1000000000000;
            
            // Create data with different ages
            const ages = [10, 5, 8, 3, 12, 1]; // days old
            
            // Save all data at a recent time first
            const saveTime = baseTime - (30 * 60 * 1000); // 30 minutes ago
            vi.spyOn(Date, 'now').mockReturnValue(saveTime);
            
            for (let i = 0; i < userAddresses.length; i++) {
              LocalStorageCache.save(userAddresses[i], positionArrays[i]);
            }
            
            // Manually adjust timestamps to simulate different ages
            const allData = JSON.parse(localStorage.getItem('pva_positions_cache') || '{}');
            for (let i = 0; i < userAddresses.length; i++) {
              const ageInDays = ages[i % ages.length];
              const userKey = userAddresses[i].toLowerCase();
              if (allData.data && allData.data[userKey]) {
                allData.data[userKey].timestamp = baseTime - (ageInDays * 24 * 60 * 60 * 1000);
              }
            }
            localStorage.setItem('pva_positions_cache', JSON.stringify(allData));
            
            // Run cleanup at current time
            vi.spyOn(Date, 'now').mockReturnValue(baseTime);
            LocalStorageCache.cleanupOldData();
            
            // Check results
            for (let i = 0; i < userAddresses.length; i++) {
              const ageInDays = ages[i % ages.length];
              const lastUpdate = LocalStorageCache.getLastUpdateTime(userAddresses[i]);
              
              if (ageInDays >= 7) {
                // Should be cleaned up
                expect(lastUpdate).toBeNull();
              } else {
                // Should still exist
                expect(lastUpdate).not.toBeNull();
              }
            }
            
            Date.now = originalNow;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Multi-user cache isolation', () => {
    it('should isolate cache data between different users', () => {
      fc.assert(
        fc.property(
          userAddressArb,
          userAddressArb,
          fc.array(positionArb, { minLength: 1, maxLength: 10 }),
          fc.array(positionArb, { minLength: 1, maxLength: 10 }),
          (userAddress1: string, userAddress2: string, positions1: Position[], positions2: Position[]) => {
            // Skip if addresses are the same
            fc.pre(userAddress1.toLowerCase() !== userAddress2.toLowerCase());
            
            // Save different positions for each user
            LocalStorageCache.save(userAddress1, positions1);
            LocalStorageCache.save(userAddress2, positions2);
            
            // Load positions for each user
            const loaded1 = LocalStorageCache.load(userAddress1);
            const loaded2 = LocalStorageCache.load(userAddress2);
            
            // Both should exist
            expect(loaded1).not.toBeNull();
            expect(loaded2).not.toBeNull();
            
            // Should have correct lengths
            expect(loaded1).toHaveLength(positions1.length);
            expect(loaded2).toHaveLength(positions2.length);
            
            // Clear one user's cache
            LocalStorageCache.clear(userAddress1);
            
            // First user should have no cache, second should still have cache
            expect(LocalStorageCache.load(userAddress1)).toBeNull();
            expect(LocalStorageCache.load(userAddress2)).not.toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});