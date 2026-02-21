/**
 * LocalStorageCache - Enhanced Position Management
 * Implements caching system for position data with TTL support
 */

import { Position } from '../types/position';

interface CacheEntry {
  positions: Position[];
  timestamp: number;
  userAddress: string;
}

interface CacheData {
  [userAddress: string]: CacheEntry;
}

export class LocalStorageCache {
  private static readonly CACHE_KEY = 'pva_positions_cache';
  private static readonly CACHE_VERSION = '1.0.0';
  private static readonly CACHE_TTL = 60 * 60 * 1000; // 1 hour in milliseconds
  private static readonly CLEANUP_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

  /**
   * Save positions to localStorage for a specific user
   */
  static save(userAddress: string, positions: Position[]): void {
    try {
      const existingData = this.loadAllData();
      const cacheEntry: CacheEntry = {
        positions: this.serializePositions(positions),
        timestamp: Date.now(),
        userAddress: userAddress.toLowerCase(),
      };

      existingData[userAddress.toLowerCase()] = cacheEntry;

      const cacheData = {
        version: this.CACHE_VERSION,
        data: existingData,
      };

      localStorage.setItem(this.CACHE_KEY, JSON.stringify(cacheData));
    } catch (error) {
      console.error('Failed to save positions to cache:', error);
    }
  }

  /**
   * Load positions from localStorage for a specific user
   * Returns null if cache is expired or doesn't exist
   */
  static load(userAddress: string): Position[] | null {
    try {
      const allData = this.loadAllData();
      const cacheEntry = allData[userAddress.toLowerCase()];

      if (!cacheEntry) {
        return null;
      }

      // Check if cache is expired (older than 1 hour)
      const now = Date.now();
      if (now - cacheEntry.timestamp > this.CACHE_TTL) {
        // Remove expired entry
        delete allData[userAddress.toLowerCase()];
        this.saveAllData(allData);
        return null;
      }

      return this.deserializePositions(cacheEntry.positions);
    } catch (error) {
      console.error('Failed to load positions from cache:', error);
      return null;
    }
  }

  /**
   * Clear cache for a specific user
   */
  static clear(userAddress: string): void {
    try {
      const allData = this.loadAllData();
      delete allData[userAddress.toLowerCase()];
      this.saveAllData(allData);
    } catch (error) {
      console.error('Failed to clear cache for user:', error);
    }
  }

  /**
   * Clear all cache data
   */
  static clearAll(): void {
    try {
      localStorage.removeItem(this.CACHE_KEY);
    } catch (error) {
      console.error('Failed to clear all cache:', error);
    }
  }

  /**
   * Check if cache exists and is valid for a user
   */
  static isValid(userAddress: string): boolean {
    try {
      const allData = this.loadAllData();
      const cacheEntry = allData[userAddress.toLowerCase()];

      if (!cacheEntry) {
        return false;
      }

      const now = Date.now();
      return now - cacheEntry.timestamp <= this.CACHE_TTL;
    } catch (error) {
      console.error('Failed to check cache validity:', error);
      return false;
    }
  }

  /**
   * Get cache timestamp for a user
   */
  static getLastUpdateTime(userAddress: string): number | null {
    try {
      const allData = this.loadAllData();
      const cacheEntry = allData[userAddress.toLowerCase()];
      return cacheEntry ? cacheEntry.timestamp : null;
    } catch (error) {
      console.error('Failed to get cache timestamp:', error);
      return null;
    }
  }

  /**
   * Clean up old cache entries (older than 7 days)
   */
  static cleanupOldData(): void {
    try {
      const allData = this.loadAllData();
      const now = Date.now();
      let hasChanges = false;

      Object.keys(allData).forEach(userAddress => {
        const cacheEntry = allData[userAddress];
        if (now - cacheEntry.timestamp > this.CLEANUP_AGE) {
          delete allData[userAddress];
          hasChanges = true;
        }
      });

      if (hasChanges) {
        this.saveAllData(allData);
        console.log('Cleaned up old cache entries');
      }
    } catch (error) {
      console.error('Failed to cleanup old cache data:', error);
    }
  }

  /**
   * Get cache statistics
   */
  static getCacheStats(): { totalEntries: number; totalSize: number; oldestEntry: number | null } {
    try {
      const allData = this.loadAllData();
      const entries = Object.values(allData);
      
      const totalEntries = entries.length;
      const totalSize = JSON.stringify(allData).length;
      const oldestEntry = entries.length > 0 
        ? Math.min(...entries.map(entry => entry.timestamp))
        : null;

      return { totalEntries, totalSize, oldestEntry };
    } catch (error) {
      console.error('Failed to get cache stats:', error);
      return { totalEntries: 0, totalSize: 0, oldestEntry: null };
    }
  }

  /**
   * Load all cache data from localStorage
   */
  private static loadAllData(): CacheData {
    try {
      const cached = localStorage.getItem(this.CACHE_KEY);
      if (!cached) {
        return {};
      }

      const parsed = JSON.parse(cached);
      
      // Handle version compatibility
      if (parsed.version !== this.CACHE_VERSION) {
        console.log('Cache version mismatch, clearing cache');
        this.clearAll();
        return {};
      }

      return parsed.data || {};
    } catch (error) {
      console.error('Failed to parse cache data, clearing cache:', error);
      this.clearAll();
      return {};
    }
  }

  /**
   * Save all cache data to localStorage
   */
  private static saveAllData(data: CacheData): void {
    const cacheData = {
      version: this.CACHE_VERSION,
      data,
    };
    localStorage.setItem(this.CACHE_KEY, JSON.stringify(cacheData));
  }

  /**
   * Serialize positions for storage (convert BigInt to string)
   */
  private static serializePositions(positions: Position[]): Position[] {
    return positions.map(position => ({
      ...position,
      amountTokens: position.amountTokens.toString() as any,
      buyPrice: position.buyPrice.toString() as any,
    }));
  }

  /**
   * Deserialize positions from storage (convert string back to BigInt)
   */
  private static deserializePositions(positions: Position[]): Position[] {
    return positions.map(position => ({
      ...position,
      amountTokens: BigInt(position.amountTokens as any),
      buyPrice: BigInt(position.buyPrice as any),
    }));
  }
}