/**
 * UserSettingsService Tests
 * Tests for user settings management functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UserSettingsService } from './UserSettingsService';
import { SecureStorage } from './SecureStorage';
import { DEFAULT_USER_SETTINGS } from '../types/user';

// Mock SecureStorage
vi.mock('./SecureStorage', () => ({
  SecureStorage: {
    isSupported: vi.fn(),
    setSecure: vi.fn(),
    getSecure: vi.fn(),
    removeSecure: vi.fn(),
    clearUserData: vi.fn(),
    getStorageStats: vi.fn(),
  },
}));

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

describe('UserSettingsService', () => {
  const testUserAddress = '0x1234567890123456789012345678901234567890';

  beforeEach(() => {
    Object.defineProperty(global, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
    });

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getUserSettings', () => {
    it('should return default settings when no stored settings exist', async () => {
      (SecureStorage.isSupported as any).mockReturnValue(true);
      (SecureStorage.getSecure as any).mockResolvedValue(null);
      mockLocalStorage.getItem.mockReturnValue(null);

      const settings = await UserSettingsService.getUserSettings(testUserAddress);

      expect(settings).toEqual(DEFAULT_USER_SETTINGS);
    });

    it('should load settings from secure storage when available', async () => {
      const mockSettings = {
        ...DEFAULT_USER_SETTINGS,
        theme: 'dark' as const,
      };

      (SecureStorage.isSupported as any).mockReturnValue(true);
      (SecureStorage.getSecure as any).mockResolvedValue(mockSettings);

      const settings = await UserSettingsService.getUserSettings(testUserAddress);

      expect(settings).toEqual(mockSettings);
      expect(SecureStorage.getSecure).toHaveBeenCalledWith(
        `user_settings_${testUserAddress.toLowerCase()}`,
        testUserAddress
      );
    });

    it('should fallback to localStorage when secure storage fails', async () => {
      const mockSettings = {
        ...DEFAULT_USER_SETTINGS,
        language: 'en' as const,
      };

      (SecureStorage.isSupported as any).mockReturnValue(true);
      (SecureStorage.getSecure as any).mockResolvedValue(null);
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(mockSettings));

      const settings = await UserSettingsService.getUserSettings(testUserAddress);

      expect(settings).toEqual(mockSettings);
    });

    it('should merge partial settings with defaults', async () => {
      const partialSettings = {
        theme: 'dark' as const,
        // Missing other properties
      };

      (SecureStorage.isSupported as any).mockReturnValue(true);
      (SecureStorage.getSecure as any).mockResolvedValue(partialSettings);

      const settings = await UserSettingsService.getUserSettings(testUserAddress);

      expect(settings.theme).toBe('dark');
      expect(settings.language).toBe(DEFAULT_USER_SETTINGS.language);
      expect(settings.notifications).toEqual(DEFAULT_USER_SETTINGS.notifications);
    });

    it('should handle corrupted localStorage data gracefully', async () => {
      (SecureStorage.isSupported as any).mockReturnValue(false);
      mockLocalStorage.getItem.mockReturnValue('invalid json');

      const settings = await UserSettingsService.getUserSettings(testUserAddress);

      expect(settings).toEqual(DEFAULT_USER_SETTINGS);
    });
  });

  describe('saveUserSettings', () => {
    it('should save settings to secure storage when available', async () => {
      const testSettings = {
        ...DEFAULT_USER_SETTINGS,
        theme: 'dark' as const,
      };

      (SecureStorage.isSupported as any).mockReturnValue(true);
      (SecureStorage.setSecure as any).mockResolvedValue(undefined);

      await UserSettingsService.saveUserSettings(testUserAddress, testSettings);

      expect(SecureStorage.setSecure).toHaveBeenCalledWith(
        `user_settings_${testUserAddress.toLowerCase()}`,
        testSettings,
        testUserAddress
      );
    });

    it('should fallback to localStorage when secure storage not available', async () => {
      const testSettings = {
        ...DEFAULT_USER_SETTINGS,
        theme: 'dark' as const,
      };

      (SecureStorage.isSupported as any).mockReturnValue(false);

      await UserSettingsService.saveUserSettings(testUserAddress, testSettings);

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        `pva_settings_${testUserAddress.toLowerCase()}`,
        JSON.stringify(testSettings)
      );
    });

    it('should validate settings before saving', async () => {
      const invalidSettings = {
        ...DEFAULT_USER_SETTINGS,
        theme: 'invalid' as any,
        trading: {
          ...DEFAULT_USER_SETTINGS.trading,
          defaultAmount: 5, // Below minimum
          refreshInterval: 1, // Below minimum
        },
      };

      (SecureStorage.isSupported as any).mockReturnValue(true);
      (SecureStorage.setSecure as any).mockResolvedValue(undefined);

      await UserSettingsService.saveUserSettings(testUserAddress, invalidSettings);

      // Should have been called with validated settings
      const savedSettings = (SecureStorage.setSecure as any).mock.calls[0][1];
      expect(savedSettings.theme).toBe(DEFAULT_USER_SETTINGS.theme); // Reset to default
      expect(savedSettings.trading.defaultAmount).toBe(20); // Corrected to minimum
      expect(savedSettings.trading.refreshInterval).toBe(5); // Corrected to minimum
    });

    it('should handle save errors gracefully', async () => {
      const testSettings = DEFAULT_USER_SETTINGS;

      (SecureStorage.isSupported as any).mockReturnValue(true);
      (SecureStorage.setSecure as any).mockRejectedValue(new Error('Save failed'));

      await expect(
        UserSettingsService.saveUserSettings(testUserAddress, testSettings)
      ).rejects.toThrow('Failed to save settings');
    });
  });

  describe('getUserProfile', () => {
    it('should create new profile when none exists', async () => {
      (SecureStorage.isSupported as any).mockReturnValue(true);
      (SecureStorage.getSecure as any).mockResolvedValue(null);
      (SecureStorage.setSecure as any).mockResolvedValue(undefined);

      const profile = await UserSettingsService.getUserProfile(testUserAddress);

      expect(profile.address).toBe(testUserAddress.toLowerCase());
      expect(profile.settings).toEqual(DEFAULT_USER_SETTINGS);
      expect(typeof profile.createdAt).toBe('number');
      expect(typeof profile.lastActive).toBe('number');
    });

    it('should update lastActive time for existing profile', async () => {
      const existingProfile = {
        address: testUserAddress.toLowerCase(),
        settings: DEFAULT_USER_SETTINGS,
        createdAt: Date.now() - 86400000, // 1 day ago
        lastActive: Date.now() - 3600000, // 1 hour ago
        version: '1.0.0',
      };

      (SecureStorage.isSupported as any).mockReturnValue(true);
      (SecureStorage.getSecure as any).mockResolvedValue(existingProfile);
      (SecureStorage.setSecure as any).mockResolvedValue(undefined);

      const profile = await UserSettingsService.getUserProfile(testUserAddress);

      expect(profile.lastActive).toBeGreaterThan(existingProfile.lastActive);
    });
  });

  describe('clearUserData', () => {
    it('should clear all user data from all storage systems', async () => {
      await UserSettingsService.clearUserData(testUserAddress);

      expect(SecureStorage.clearUserData).toHaveBeenCalledWith(testUserAddress);
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(
        `pva_settings_${testUserAddress.toLowerCase()}`
      );
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(
        `pva_positions_${testUserAddress.toLowerCase()}`
      );
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(
        `pva_cache_${testUserAddress.toLowerCase()}`
      );
    });

    it('should handle clear errors gracefully', async () => {
      (SecureStorage.clearUserData as any).mockImplementation(() => {
        throw new Error('Clear failed');
      });

      await expect(
        UserSettingsService.clearUserData(testUserAddress)
      ).rejects.toThrow('Failed to clear user data');
    });
  });

  describe('exportUserData', () => {
    it('should export user data as JSON string', async () => {
      const mockProfile = {
        address: testUserAddress.toLowerCase(),
        settings: DEFAULT_USER_SETTINGS,
        createdAt: Date.now(),
        lastActive: Date.now(),
        version: '1.0.0',
      };

      const mockAnalytics = {
        totalTrades: 10,
        totalVolume: 1000,
        totalProfit: 100,
        averageHoldTime: 3600,
        favoriteLeague: 'Gold' as const,
        riskProfile: 'moderate' as const,
      };

      // Mock the methods that exportUserData calls
      vi.spyOn(UserSettingsService, 'getUserProfile').mockResolvedValue(mockProfile);
      vi.spyOn(UserSettingsService, 'getUserAnalytics').mockResolvedValue(mockAnalytics);

      const exportedData = await UserSettingsService.exportUserData(testUserAddress);

      const parsed = JSON.parse(exportedData);
      expect(parsed.profile).toEqual(mockProfile);
      expect(parsed.analytics).toEqual(mockAnalytics);
      expect(typeof parsed.exportedAt).toBe('number');
      expect(parsed.version).toBe('1.0.0');
    });
  });

  describe('importUserData', () => {
    it('should import user data from JSON string', async () => {
      const mockData = {
        profile: {
          address: testUserAddress.toLowerCase(),
          settings: DEFAULT_USER_SETTINGS,
          createdAt: Date.now(),
          lastActive: Date.now(),
          version: '1.0.0',
        },
        analytics: {
          totalTrades: 10,
          totalVolume: 1000,
          totalProfit: 100,
          averageHoldTime: 3600,
          favoriteLeague: 'Gold' as const,
          riskProfile: 'moderate' as const,
        },
      };

      // Mock the methods that importUserData calls
      vi.spyOn(UserSettingsService, 'saveUserProfile').mockResolvedValue(undefined);
      vi.spyOn(UserSettingsService, 'updateUserAnalytics').mockResolvedValue(undefined);

      await UserSettingsService.importUserData(testUserAddress, JSON.stringify(mockData));

      expect(UserSettingsService.saveUserProfile).toHaveBeenCalledWith(
        testUserAddress,
        mockData.profile
      );
      expect(UserSettingsService.updateUserAnalytics).toHaveBeenCalledWith(
        testUserAddress,
        mockData.analytics
      );
    });

    it('should handle invalid JSON gracefully', async () => {
      await expect(
        UserSettingsService.importUserData(testUserAddress, 'invalid json')
      ).rejects.toThrow('Failed to import user data');
    });
  });

  describe('getStorageStats', () => {
    it('should return storage statistics', () => {
      const mockStats = {
        used: 1024,
        available: 5242880,
        percentage: 0.02,
      };

      (SecureStorage.getStorageStats as any).mockReturnValue(mockStats);

      const stats = UserSettingsService.getStorageStats();

      expect(stats).toEqual(mockStats);
    });
  });
});