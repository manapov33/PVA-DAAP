/**
 * User Settings Hook - Manages user preferences and profile data
 * Provides reactive interface for user settings with automatic persistence
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { UserSettings, UserProfile, UserAnalytics, DEFAULT_USER_SETTINGS } from '../types/user';
import { UserSettingsService } from '../services/UserSettingsService';

interface UseUserSettingsReturn {
  // Settings
  settings: UserSettings;
  updateSettings: (newSettings: Partial<UserSettings>) => Promise<void>;
  resetSettings: () => Promise<void>;
  
  // Profile
  profile: UserProfile | null;
  
  // Analytics
  analytics: UserAnalytics | null;
  updateAnalytics: (analytics: UserAnalytics) => Promise<void>;
  
  // State
  loading: boolean;
  error: string | null;
  
  // Actions
  exportData: () => Promise<string>;
  importData: (data: string) => Promise<void>;
  clearAllData: () => Promise<void>;
  
  // Storage stats
  storageStats: {
    used: number;
    available: number;
    percentage: number;
  };
}

export const useUserSettings = (userAddress?: string): UseUserSettingsReturn => {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [analytics, setAnalytics] = useState<UserAnalytics | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [storageStats, setStorageStats] = useState({
    used: 0,
    available: 0,
    percentage: 0,
  });

  // Use ref to track the current user address to avoid stale closures
  const currentUserRef = useRef<string | undefined>(userAddress);
  currentUserRef.current = userAddress;

  // Load user data when user address changes
  useEffect(() => {
    if (userAddress) {
      loadUserData(userAddress);
      updateStorageStats();
    } else {
      // Reset to defaults when no user
      setSettings(DEFAULT_USER_SETTINGS);
      setProfile(null);
      setAnalytics(null);
      setError(null);
    }
  }, [userAddress]);

  // Update storage stats periodically
  useEffect(() => {
    const interval = setInterval(updateStorageStats, 30000); // Every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const loadUserData = useCallback(async (address: string): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      // Load settings and profile in parallel
      const [userSettings, userProfile, userAnalytics] = await Promise.all([
        UserSettingsService.getUserSettings(address),
        UserSettingsService.getUserProfile(address),
        UserSettingsService.getUserAnalytics(address),
      ]);

      // Only update state if this is still the current user
      if (currentUserRef.current === address) {
        setSettings(userSettings);
        setProfile(userProfile);
        setAnalytics(userAnalytics);
      }
    } catch (err) {
      if (currentUserRef.current === address) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load user data';
        setError(errorMessage);
        console.error('Failed to load user data:', err);
      }
    } finally {
      if (currentUserRef.current === address) {
        setLoading(false);
      }
    }
  }, []);

  const updateSettings = useCallback(async (newSettings: Partial<UserSettings>): Promise<void> => {
    if (!userAddress) {
      throw new Error('No user address provided');
    }

    setError(null);

    try {
      const updatedSettings = { ...settings, ...newSettings };
      
      // Optimistically update UI
      setSettings(updatedSettings);
      
      // Save to storage
      await UserSettingsService.saveUserSettings(userAddress, updatedSettings);
      
      // Update profile with new settings
      if (profile) {
        const updatedProfile = { ...profile, settings: updatedSettings };
        await UserSettingsService.saveUserProfile(userAddress, updatedProfile);
        setProfile(updatedProfile);
      }
    } catch (err) {
      // Revert optimistic update on error
      setSettings(settings);
      
      const errorMessage = err instanceof Error ? err.message : 'Failed to update settings';
      setError(errorMessage);
      throw err;
    }
  }, [userAddress, settings, profile]);

  const resetSettings = useCallback(async (): Promise<void> => {
    if (!userAddress) {
      throw new Error('No user address provided');
    }

    try {
      await updateSettings(DEFAULT_USER_SETTINGS);
    } catch (err) {
      console.error('Failed to reset settings:', err);
      throw err;
    }
  }, [userAddress, updateSettings]);

  const updateAnalytics = useCallback(async (newAnalytics: UserAnalytics): Promise<void> => {
    if (!userAddress) {
      throw new Error('No user address provided');
    }

    setError(null);

    try {
      await UserSettingsService.updateUserAnalytics(userAddress, newAnalytics);
      setAnalytics(newAnalytics);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update analytics';
      setError(errorMessage);
      throw err;
    }
  }, [userAddress]);

  const exportData = useCallback(async (): Promise<string> => {
    if (!userAddress) {
      throw new Error('No user address provided');
    }

    try {
      return await UserSettingsService.exportUserData(userAddress);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to export data';
      setError(errorMessage);
      throw err;
    }
  }, [userAddress]);

  const importData = useCallback(async (data: string): Promise<void> => {
    if (!userAddress) {
      throw new Error('No user address provided');
    }

    try {
      await UserSettingsService.importUserData(userAddress, data);
      // Reload user data after import
      await loadUserData(userAddress);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to import data';
      setError(errorMessage);
      throw err;
    }
  }, [userAddress, loadUserData]);

  const clearAllData = useCallback(async (): Promise<void> => {
    if (!userAddress) {
      throw new Error('No user address provided');
    }

    try {
      await UserSettingsService.clearUserData(userAddress);
      
      // Reset state
      setSettings(DEFAULT_USER_SETTINGS);
      setProfile(null);
      setAnalytics(null);
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to clear data';
      setError(errorMessage);
      throw err;
    }
  }, [userAddress]);

  const updateStorageStats = useCallback((): void => {
    try {
      const stats = UserSettingsService.getStorageStats();
      setStorageStats(stats);
    } catch (err) {
      console.error('Failed to get storage stats:', err);
    }
  }, []);

  return {
    // Settings
    settings,
    updateSettings,
    resetSettings,
    
    // Profile
    profile,
    
    // Analytics
    analytics,
    updateAnalytics,
    
    // State
    loading,
    error,
    
    // Actions
    exportData,
    importData,
    clearAllData,
    
    // Storage stats
    storageStats,
  };
};