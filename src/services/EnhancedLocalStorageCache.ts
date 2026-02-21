/**
 * Enhanced Local Storage Cache Service - Position Management with Compression & Encryption
 * Handles caching of position data with validation, cleanup, compression, and optional encryption
 */

import { Position } from '../types/position';
import { SecureStorage } from './SecureStorage';

interface CacheData {
  positions: Position[];
  timestamp: number;
  version: string;
  userAddress: string;
  compressed?: boolean;
}

interface CacheMetadata {
  lastUpdate: number;
  positionCount: number;
  version: string;
  size: number;
  compressed: boolean;
  encrypted: boolean;
}

export class EnhancedLocalStorageCache {
  private static readonly CACHE_KEY_PREFIX = 'pva_positions_v2_';
  private static readonly METADATA_KEY_PREFIX = 'pva_cache_meta_v2_';
  private static readonly CACHE_VERSION = '2.0.0';
  private static readonly CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds
  private static readonly CLEANUP_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
  private static readonly COMPRESSION_THRESHOLD = 1024; // Compress if data > 1KB
  private static readonly ENCRYPTION_THRESHOLD = 5; // Encrypt if more than 5 positions

  /**
   * Compress data using simple string compression
   */
  private static compressData(data: string): string {
    try {
      // Simple compression using JSON minification and basic encoding
      const minified = JSON.stringify(JSON.parse(data));
      
      // Use TextEncoder/TextDecoder for better compression simulation
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      const bytes = encoder.encode(minified);
      
      // Convert to base64 for storage (simulates compression)
      return btoa(String.fromCharCode(...bytes));
    } catch (error) {
      console.warn('Compression failed, using original data');
      return data;
    }
  }

  /**
   * Decompress data
   */
  private static decompressData(compressedData: string): string {
    try {
      // Decode from base64
      const bytes = Uint8Array.from(atob(compressedData), c => c.charCodeAt(0));
      const decoder = new TextDecoder();
      return decoder.decode(bytes);
    } catch (error) {
      console.warn('Decompression failed, trying original data');
      return compressedData;
    }
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

  /**
   * Save positions to localStorage with metadata, compression, and optional encryption
   */
  static async save(userAddress: string, positions: Position[]): Promise<void> {
    try {
      const cacheKey = this.CACHE_KEY_PREFIX + userAddress.toLowerCase();
      const metaKey = this.METADATA_KEY_PREFIX + userAddress.toLowerCase();
      
      const serializedPositions = this.serializePositions(positions);
      
      const cacheData: CacheData = {
        positions: serializedPositions,
        timestamp: Date.now(),
        version: this.CACHE_VERSION,
        userAddress: userAddress.toLowerCase(),
      };

      let dataToStore = JSON.stringify(cacheData);
      let compressed = false;
      let encrypted = false;

      // Compress if data is large
      if (dataToStore.length > this.COMPRESSION_THRESHOLD) {
        const compressedData = this.compressData(dataToStore);
        if (compressedData.length < dataToStore.length) {
          dataToStore = compressedData;
          compressed = true;
          cacheData.compressed = true;
        }
      }

      // Use secure storage for sensitive data (many positions)
      if (SecureStorage.isSupported() && positions.length >= this.ENCRYPTION_THRESHOLD) {
        try {
          await SecureStorage.setSecure(cacheKey, cacheData, userAddress);
          encrypted = true;
          console.log(`Securely cached ${positions.length} positions for user ${userAddress}`);
        } catch (secureError) {
          console.warn('Secure storage failed, falling back to regular storage');
          // Fall through to regular storage
        }
      }

      // Regular localStorage if not encrypted
      if (!encrypted) {
        localStorage.setItem(cacheKey, dataToStore);
      }

      // Always save metadata to regular localStorage
      const metadata: CacheMetadata = {
        lastUpdate: Date.now(),
        positionCount: positions.length,
        version: this.CACHE_VERSION,
        size: dataToStore.length,
        compressed,
        encrypted,
      };

      localStorage.setItem(metaKey, JSON.stringify(metadata));
      
      console.log(`Cached ${positions.length} positions for user ${userAddress} (compressed: ${compressed}, encrypted: ${encrypted})`);
    } catch (error) {
      console.error('Failed to save positions to cache:', error);
      // Don't throw error for cache failures, just log them
    }
  }

  /**
   * Load positions from localStorage with validation, decompression, and decryption
   */
  static async load(userAddress: string): Promise<Position[] | null> {
    try {
      const cacheKey = this.CACHE_KEY_PREFIX + userAddress.toLowerCase();
      const metaKey = this.METADATA_KEY_PREFIX + userAddress.toLowerCase();
      
      // Check metadata first
      const metadataStr = localStorage.getItem(metaKey);
      let metadata: CacheMetadata | null = null;
      
      if (metadataStr) {
        try {
          metadata = JSON.parse(metadataStr);
        } catch (error) {
          console.warn('Failed to parse metadata, clearing cache');
          await this.clear(userAddress);
          return null;
        }
      }

      let cacheData: CacheData | null = null;

      // Try secure storage first if metadata indicates encryption
      if (metadata?.encrypted && SecureStorage.isSupported()) {
        try {
          cacheData = await SecureStorage.getSecure<CacheData>(cacheKey, userAddress);
          if (cacheData) {
            console.log(`Loaded ${cacheData.positions.length} positions from secure cache`);
          }
        } catch (secureError) {
          console.warn('Secure storage read failed, trying regular storage');
        }
      }

      // Fallback to regular localStorage
      if (!cacheData) {
        const stored = localStorage.getItem(cacheKey);
        if (!stored) {
          return null;
        }

        let dataToProcess = stored;

        try {
          // Try to parse as regular JSON first
          cacheData = JSON.parse(dataToProcess);
        } catch (parseError) {
          // If parsing fails, try decompression
          try {
            const decompressed = this.decompressData(stored);
            cacheData = JSON.parse(decompressed);
          } catch (decompressError) {
            console.error('Failed to parse cache data:', decompressError);
            await this.clear(userAddress);
            return null;
          }
        }
      }

      // Validate cache data
      if (!this.validateCacheData(cacheData, userAddress)) {
        await this.clear(userAddress);
        return null;
      }

      // Check if cache is expired
      if (this.isExpired(cacheData.timestamp)) {
        console.log('Cache expired, clearing cache');
        await this.clear(userAddress);
        return null;
      }

      const deserializedPositions = this.deserializePositions(cacheData.positions);
      console.log(`Loaded ${deserializedPositions.length} positions from cache for user ${userAddress}`);
      return deserializedPositions;
    } catch (error) {
      console.error('Failed to load positions from cache:', error);
      // Clear corrupted cache
      await this.clear(userAddress);
      return null;
    }
  }

  /**
   * Validate cache data structure and integrity
   */
  private static validateCacheData(cacheData: any, userAddress: string): boolean {
    // Validate cache structure
    if (!cacheData || !cacheData.positions || !Array.isArray(cacheData.positions)) {
      console.warn('Invalid cache structure, clearing cache');
      return false;
    }

    // Validate version compatibility
    if (cacheData.version && cacheData.version.split('.')[0] !== this.CACHE_VERSION.split('.')[0]) {
      console.log('Cache major version mismatch, clearing cache');
      return false;
    }

    // Validate user address matches
    if (cacheData.userAddress && cacheData.userAddress !== userAddress.toLowerCase()) {
      console.warn('Cache user address mismatch, clearing cache');
      return false;
    }

    return true;
  }

  /**
   * Clear cache for specific user
   */
  static async clear(userAddress: string): Promise<void> {
    try {
      const cacheKey = this.CACHE_KEY_PREFIX + userAddress.toLowerCase();
      const metaKey = this.METADATA_KEY_PREFIX + userAddress.toLowerCase();
      
      // Clear from secure storage
      if (SecureStorage.isSupported()) {
        SecureStorage.removeSecure(cacheKey);
      }
      
      // Clear from regular localStorage
      localStorage.removeItem(cacheKey);
      localStorage.removeItem(metaKey);
      
      console.log(`Cleared cache for user ${userAddress}`);
    } catch (error) {
      console.error('Failed to clear cache:', error);
    }
  }

  /**
   * Check if cache is expired
   */
  static isExpired(timestamp: number): boolean {
    return Date.now() - timestamp > this.CACHE_DURATION;
  }

  /**
   * Get cache metadata
   */
  static getMetadata(userAddress: string): CacheMetadata | null {
    try {
      const metaKey = this.METADATA_KEY_PREFIX + userAddress.toLowerCase();
      const stored = localStorage.getItem(metaKey);
      
      if (!stored) {
        return null;
      }

      return JSON.parse(stored);
    } catch (error) {
      console.error('Failed to get cache metadata:', error);
      return null;
    }
  }

  /**
   * Clean up old cache data across all users
   */
  static async cleanupOldData(): Promise<void> {
    try {
      const keysToRemove: string[] = [];
      const now = Date.now();

      // Iterate through all localStorage keys
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;

        // Check if it's a PVA cache key (both v1 and v2)
        if (key.startsWith('pva_positions_') || key.startsWith('pva_cache_meta_')) {
          try {
            const stored = localStorage.getItem(key);
            if (stored) {
              let data: any;
              
              try {
                data = JSON.parse(stored);
              } catch (parseError) {
                // Try decompression if parsing fails
                try {
                  const decompressed = this.decompressData(stored);
                  data = JSON.parse(decompressed);
                } catch (decompressError) {
                  // Corrupted data, mark for removal
                  keysToRemove.push(key);
                  continue;
                }
              }
              
              const timestamp = data.timestamp || data.lastUpdate || 0;
              
              // Mark for removal if older than cleanup age
              if (now - timestamp > this.CLEANUP_AGE) {
                keysToRemove.push(key);
              }
            }
          } catch (error) {
            // If we can't process the data, it's corrupted - mark for removal
            keysToRemove.push(key);
          }
        }
      }

      // Remove old keys
      keysToRemove.forEach(key => {
        localStorage.removeItem(key);
      });

      if (keysToRemove.length > 0) {
        console.log(`Cleaned up ${keysToRemove.length} old cache entries`);
      }
    } catch (error) {
      console.error('Failed to cleanup old cache data:', error);
    }
  }

  /**
   * Get comprehensive cache statistics
   */
  static getStats(): { 
    totalUsers: number; 
    totalSize: number; 
    compressedEntries: number;
    encryptedEntries: number;
    oldestEntry: number | null;
    averageCompressionRatio: number;
  } {
    let totalUsers = 0;
    let totalSize = 0;
    let compressedEntries = 0;
    let encryptedEntries = 0;
    let oldestEntry: number | null = null;
    let totalOriginalSize = 0;
    let totalCompressedSize = 0;

    try {
      const userAddresses = new Set<string>();

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;

        if (key.startsWith(this.METADATA_KEY_PREFIX)) {
          const stored = localStorage.getItem(key);
          if (stored) {
            try {
              const metadata: CacheMetadata = JSON.parse(stored);
              const userAddress = key.replace(this.METADATA_KEY_PREFIX, '');
              userAddresses.add(userAddress);
              
              totalSize += metadata.size;
              
              if (metadata.compressed) {
                compressedEntries++;
                totalCompressedSize += metadata.size;
                // Estimate original size
                totalOriginalSize += metadata.size * 1.5; // Rough estimate
              } else {
                totalOriginalSize += metadata.size;
              }
              
              if (metadata.encrypted) {
                encryptedEntries++;
              }
              
              if (oldestEntry === null || metadata.lastUpdate < oldestEntry) {
                oldestEntry = metadata.lastUpdate;
              }
            } catch (error) {
              // Skip corrupted entries
            }
          }
        }
      }

      totalUsers = userAddresses.size;
    } catch (error) {
      console.error('Failed to get cache stats:', error);
    }

    const averageCompressionRatio = totalOriginalSize > 0 ? 
      (totalOriginalSize - totalCompressedSize) / totalOriginalSize : 0;

    return { 
      totalUsers, 
      totalSize, 
      compressedEntries,
      encryptedEntries,
      oldestEntry, 
      averageCompressionRatio 
    };
  }

  /**
   * Clear all cache data (for debugging/maintenance)
   */
  static async clearAll(): Promise<void> {
    try {
      const keysToRemove: string[] = [];

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('pva_positions_') || key.startsWith('pva_cache_meta_'))) {
          keysToRemove.push(key);
        }
      }

      keysToRemove.forEach(key => {
        localStorage.removeItem(key);
      });

      console.log(`Cleared all cache data (${keysToRemove.length} entries)`);
    } catch (error) {
      console.error('Failed to clear all cache data:', error);
    }
  }

  /**
   * Migrate old cache format to new format
   */
  static async migrateFromV1(): Promise<void> {
    try {
      let migratedCount = 0;
      const oldCacheKey = 'pva_positions_cache';
      
      const oldData = localStorage.getItem(oldCacheKey);
      if (oldData) {
        try {
          const parsed = JSON.parse(oldData);
          if (parsed.data) {
            // Migrate each user's data
            for (const [userAddress, cacheEntry] of Object.entries(parsed.data as any)) {
              if (cacheEntry && (cacheEntry as any).positions) {
                await this.save(userAddress, (cacheEntry as any).positions);
                migratedCount++;
              }
            }
            
            // Remove old cache
            localStorage.removeItem(oldCacheKey);
          }
        } catch (error) {
          console.error('Failed to migrate old cache format:', error);
        }
      }

      if (migratedCount > 0) {
        console.log(`Migrated ${migratedCount} cache entries from v1 to v2 format`);
      }
    } catch (error) {
      console.error('Failed to migrate cache:', error);
    }
  }

  /**
   * Export cache data for backup
   */
  static async exportUserCache(userAddress: string): Promise<string | null> {
    try {
      const positions = await this.load(userAddress);
      const metadata = this.getMetadata(userAddress);
      
      if (!positions) {
        return null;
      }

      const exportData = {
        userAddress: userAddress.toLowerCase(),
        positions,
        metadata,
        exportedAt: Date.now(),
        version: this.CACHE_VERSION,
      };

      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      console.error('Failed to export cache data:', error);
      return null;
    }
  }

  /**
   * Import cache data from backup
   */
  static async importUserCache(userAddress: string, data: string): Promise<void> {
    try {
      const importData = JSON.parse(data);
      
      if (importData.positions && Array.isArray(importData.positions)) {
        await this.save(userAddress, importData.positions);
        console.log(`Imported ${importData.positions.length} positions for user ${userAddress}`);
      }
    } catch (error) {
      console.error('Failed to import cache data:', error);
      throw new Error('Failed to import cache data');
    }
  }
}