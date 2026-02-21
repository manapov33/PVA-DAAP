/**
 * Data Manager Hook - Multi-layered data architecture
 * Implements the three-tier storage system: Memory → Cache → Blockchain
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Position } from '../types/position';
import { UserSettings } from '../types/user';
import { EnhancedLocalStorageCache } from '../services/EnhancedLocalStorageCache';
import { useUserSettings } from './useUserSettings';

interface DataLayer {
  name: 'memory' | 'cache' | 'blockchain';
  priority: number;
  available: boolean;
}

interface DataSyncStatus {
  lastSync: number;
  syncInProgress: boolean;
  syncError: string | null;
  nextSyncAt: number;
}

interface UseDataManagerReturn {
  // Data
  positions: Position[];
  
  // Data layers status
  dataLayers: DataLayer[];
  syncStatus: DataSyncStatus;
  
  // Actions
  refreshFromBlockchain: () => Promise<void>;
  refreshFromCache: () => Promise<void>;
  saveToCache: () => Promise<void>;
  clearCache: () => Promise<void>;
  
  // State
  loading: boolean;
  error: string | null;
  
  // Statistics
  cacheStats: {
    totalUsers: number;
    totalSize: number;
    compressedEntries: number;
    encryptedEntries: number;
    oldestEntry: number | null;
    averageCompressionRatio: number;
  };
  
  // Settings integration
  settings: UserSettings;
  updateSettings: (settings: Partial<UserSettings>) => Promise<void>;
}

export const useDataManager = (
  userAddress?: string,
  blockchainSyncFunction?: (address: string) => Promise<Position[]>
): UseDataManagerReturn => {
  // State for positions (Memory layer)
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  // Sync status
  const [syncStatus, setSyncStatus] = useState<DataSyncStatus>({
    lastSync: 0,
    syncInProgress: false,
    syncError: null,
    nextSyncAt: 0,
  });

  // Cache statistics
  const [cacheStats, setCacheStats] = useState({
    totalUsers: 0,
    totalSize: 0,
    compressedEntries: 0,
    encryptedEntries: 0,
    oldestEntry: null as number | null,
    averageCompressionRatio: 0,
  });

  // User settings integration
  const userSettingsHook = useUserSettings(userAddress);
  
  // Refs for cleanup and current user tracking
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const currentUserRef = useRef<string | undefined>(userAddress);
  currentUserRef.current = userAddress;

  // Data layers status
  const dataLayers: DataLayer[] = [
    {
      name: 'memory',
      priority: 1,
      available: true,
    },
    {
      name: 'cache',
      priority: 2,
      available: typeof localStorage !== 'undefined',
    },
    {
      name: 'blockchain',
      priority: 3,
      available: !!blockchainSyncFunction,
    },
  ];

  // Initialize data when user changes
  useEffect(() => {
    if (userAddress) {
      initializeUserData(userAddress);
      setupAutoSync(userAddress);
    } else {
      cleanup();
    }

    return cleanup;
  }, [userAddress]);

  // Update cache stats periodically
  useEffect(() => {
    updateCacheStats();
    const interval = setInterval(updateCacheStats, 60000); // Every minute
    return () => clearInterval(interval);
  }, []);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = null;
    }
    
    setPositions([]);
    setError(null);
    setSyncStatus({
      lastSync: 0,
      syncInProgress: false,
      syncError: null,
      nextSyncAt: 0,
    });
  }, []);

  // Initialize user data from cache first, then sync with blockchain
  const initializeUserData = useCallback(async (address: string): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      // Step 1: Try to load from cache (fast)
      const cachedPositions = await EnhancedLocalStorageCache.load(address);
      if (cachedPositions && currentUserRef.current === address) {
        setPositions(cachedPositions);
        console.log(`Loaded ${cachedPositions.length} positions from cache`);
      }

      // Step 2: Sync with blockchain (slower, but authoritative)
      if (blockchainSyncFunction) {
        await refreshFromBlockchain();
      }
    } catch (err) {
      if (currentUserRef.current === address) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to initialize data';
        setError(errorMessage);
        console.error('Failed to initialize user data:', err);
      }
    } finally {
      if (currentUserRef.current === address) {
        setLoading(false);
      }
    }
  }, [blockchainSyncFunction]);

  // Setup automatic sync based on user settings
  const setupAutoSync = useCallback((address: string): void => {
    // Clear existing interval
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
    }

    // Setup new interval based on user settings
    const syncInterval = (userSettingsHook.settings.trading.refreshInterval || 30) * 1000;
    
    if (userSettingsHook.settings.trading.autoRefresh && blockchainSyncFunction) {
      syncIntervalRef.current = setInterval(() => {
        if (currentUserRef.current === address && !syncStatus.syncInProgress) {
          refreshFromBlockchain();
        }
      }, syncInterval);

      // Set next sync time
      setSyncStatus(prev => ({
        ...prev,
        nextSyncAt: Date.now() + syncInterval,
      }));
    }
  }, [userSettingsHook.settings, blockchainSyncFunction, syncStatus.syncInProgress]);

  // Refresh data from blockchain
  const refreshFromBlockchain = useCallback(async (): Promise<void> => {
    if (!userAddress || !blockchainSyncFunction) {
      throw new Error('Blockchain sync not available');
    }

    setSyncStatus(prev => ({ ...prev, syncInProgress: true, syncError: null }));

    try {
      const blockchainPositions = await blockchainSyncFunction(userAddress);
      
      // Only update if this is still the current user
      if (currentUserRef.current === userAddress) {
        setPositions(blockchainPositions);
        
        // Save to cache
        await EnhancedLocalStorageCache.save(userAddress, blockchainPositions);
        
        setSyncStatus(prev => ({
          ...prev,
          lastSync: Date.now(),
          syncInProgress: false,
          syncError: null,
          nextSyncAt: Date.now() + (userSettingsHook.settings.trading.refreshInterval * 1000),
        }));

        console.log(`Synced ${blockchainPositions.length} positions from blockchain`);
      }
    } catch (err) {
      if (currentUserRef.current === userAddress) {
        const errorMessage = err instanceof Error ? err.message : 'Blockchain sync failed';
        setSyncStatus(prev => ({
          ...prev,
          syncInProgress: false,
          syncError: errorMessage,
        }));
        
        // Don't throw error, just log it - we can still use cached data
        console.error('Blockchain sync failed:', err);
      }
    }
  }, [userAddress, blockchainSyncFunction, userSettingsHook.settings.trading.refreshInterval]);

  // Refresh data from cache
  const refreshFromCache = useCallback(async (): Promise<void> => {
    if (!userAddress) {
      throw new Error('No user address provided');
    }

    try {
      const cachedPositions = await EnhancedLocalStorageCache.load(userAddress);
      if (cachedPositions) {
        setPositions(cachedPositions);
        console.log(`Refreshed ${cachedPositions.length} positions from cache`);
      } else {
        console.log('No cached data found');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to refresh from cache';
      setError(errorMessage);
      throw err;
    }
  }, [userAddress]);

  // Save current positions to cache
  const saveToCache = useCallback(async (): Promise<void> => {
    if (!userAddress) {
      throw new Error('No user address provided');
    }

    try {
      await EnhancedLocalStorageCache.save(userAddress, positions);
      console.log(`Saved ${positions.length} positions to cache`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save to cache';
      setError(errorMessage);
      throw err;
    }
  }, [userAddress, positions]);

  // Clear cache for current user
  const clearCache = useCallback(async (): Promise<void> => {
    if (!userAddress) {
      throw new Error('No user address provided');
    }

    try {
      await EnhancedLocalStorageCache.clear(userAddress);
      console.log('Cache cleared for current user');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to clear cache';
      setError(errorMessage);
      throw err;
    }
  }, [userAddress]);

  // Update cache statistics
  const updateCacheStats = useCallback((): void => {
    try {
      const stats = EnhancedLocalStorageCache.getStats();
      setCacheStats(stats);
    } catch (err) {
      console.error('Failed to update cache stats:', err);
    }
  }, []);

  // Update user settings with data manager integration
  const updateSettings = useCallback(async (newSettings: Partial<UserSettings>): Promise<void> => {
    await userSettingsHook.updateSettings(newSettings);
    
    // Restart auto-sync if refresh settings changed
    if (userAddress && (newSettings.trading?.autoRefresh !== undefined || newSettings.trading?.refreshInterval !== undefined)) {
      setupAutoSync(userAddress);
    }
  }, [userSettingsHook.updateSettings, userAddress, setupAutoSync]);

  return {
    // Data
    positions,
    
    // Data layers status
    dataLayers,
    syncStatus,
    
    // Actions
    refreshFromBlockchain,
    refreshFromCache,
    saveToCache,
    clearCache,
    
    // State
    loading,
    error,
    
    // Statistics
    cacheStats,
    
    // Settings integration
    settings: userSettingsHook.settings,
    updateSettings,
  };
};