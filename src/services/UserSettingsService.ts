/**
 * User Settings Service - Manages user preferences and profile data
 * Handles settings persistence, validation, and synchronization
 */

import { UserSettings, UserProfile, UserAnalytics, DEFAULT_USER_SETTINGS } from '../types/user';
import { SecureStorage } from './SecureStorage';

export class UserSettingsService {
  private static readonly SETTINGS_KEY = 'user_settings';
  private static readonly PROFILE_KEY = 'user_profile';
  private static readonly ANALYTICS_KEY = 'user_analytics';
  private static readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

  private static settingsCache = new Map<string, { settings: UserSettings; timestamp: number }>();
  private static profileCache = new Map<string, { profile: UserProfile; timestamp: number }>();

  /**
   * Load user settings with fallback to defaults
   */
  static async getUserSettings(userAddress: string): Promise<UserSettings> {
    try {
      // Check cache first
      const cached = this.settingsCache.get(userAddress.toLowerCase());
      if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
        return cached.settings;
      }

      // Try to load from secure storage
      let settings: UserSettings | null = null;
      
      if (SecureStorage.isSupported()) {
        settings = await SecureStorage.getSecure<UserSettings>(
          `${this.SETTINGS_KEY}_${userAddress.toLowerCase()}`,
          userAddress
        );
      }

      // Fallback to regular localStorage
      if (!settings) {
        const stored = localStorage.getItem(`pva_settings_${userAddress.toLowerCase()}`);
        if (stored) {
          try {
            settings = JSON.parse(stored);
          } catch (error) {
            console.warn('Failed to parse stored settings, using defaults');
          }
        }
      }

      // Merge with defaults to ensure all properties exist
      const finalSettings = this.mergeWithDefaults(settings || {});
      
      // Update cache
      this.settingsCache.set(userAddress.toLowerCase(), {
        settings: finalSettings,
        timestamp: Date.now(),
      });

      return finalSettings;
    } catch (error) {
      console.error('Failed to load user settings:', error);
      return DEFAULT_USER_SETTINGS;
    }
  }

  /**
   * Save user settings
   */
  static async saveUserSettings(userAddress: string, settings: UserSettings): Promise<void> {
    try {
      // Validate settings
      const validatedSettings = this.validateSettings(settings);

      // Save to secure storage if available
      if (SecureStorage.isSupported()) {
        await SecureStorage.setSecure(
          `${this.SETTINGS_KEY}_${userAddress.toLowerCase()}`,
          validatedSettings,
          userAddress
        );
      } else {
        // Fallback to regular localStorage
        localStorage.setItem(
          `pva_settings_${userAddress.toLowerCase()}`,
          JSON.stringify(validatedSettings)
        );
      }

      // Update cache
      this.settingsCache.set(userAddress.toLowerCase(), {
        settings: validatedSettings,
        timestamp: Date.now(),
      });

      console.log('User settings saved successfully');
    } catch (error) {
      console.error('Failed to save user settings:', error);
      throw new Error('Failed to save settings');
    }
  }

  /**
   * Get user profile
   */
  static async getUserProfile(userAddress: string): Promise<UserProfile> {
    try {
      // Check cache first
      const cached = this.profileCache.get(userAddress.toLowerCase());
      if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
        return cached.profile;
      }

      let profile: UserProfile | null = null;

      if (SecureStorage.isSupported()) {
        profile = await SecureStorage.getSecure<UserProfile>(
          `${this.PROFILE_KEY}_${userAddress.toLowerCase()}`,
          userAddress
        );
      }

      if (!profile) {
        // Create new profile
        const settings = await this.getUserSettings(userAddress);
        profile = {
          address: userAddress.toLowerCase(),
          settings,
          createdAt: Date.now(),
          lastActive: Date.now(),
          version: '1.0.0',
        };

        // Save the new profile
        await this.saveUserProfile(userAddress, profile);
      } else {
        // Update last active time
        profile.lastActive = Date.now();
        await this.saveUserProfile(userAddress, profile);
      }

      // Update cache
      this.profileCache.set(userAddress.toLowerCase(), {
        profile,
        timestamp: Date.now(),
      });

      return profile;
    } catch (error) {
      console.error('Failed to load user profile:', error);
      throw new Error('Failed to load profile');
    }
  }

  /**
   * Save user profile
   */
  static async saveUserProfile(userAddress: string, profile: UserProfile): Promise<void> {
    try {
      if (SecureStorage.isSupported()) {
        await SecureStorage.setSecure(
          `${this.PROFILE_KEY}_${userAddress.toLowerCase()}`,
          profile,
          userAddress
        );
      }

      // Update cache
      this.profileCache.set(userAddress.toLowerCase(), {
        profile,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('Failed to save user profile:', error);
      throw new Error('Failed to save profile');
    }
  }

  /**
   * Get user analytics
   */
  static async getUserAnalytics(userAddress: string): Promise<UserAnalytics | null> {
    try {
      if (SecureStorage.isSupported()) {
        return await SecureStorage.getSecure<UserAnalytics>(
          `${this.ANALYTICS_KEY}_${userAddress.toLowerCase()}`,
          userAddress
        );
      }
      return null;
    } catch (error) {
      console.error('Failed to load user analytics:', error);
      return null;
    }
  }

  /**
   * Update user analytics
   */
  static async updateUserAnalytics(userAddress: string, analytics: UserAnalytics): Promise<void> {
    try {
      if (SecureStorage.isSupported()) {
        await SecureStorage.setSecure(
          `${this.ANALYTICS_KEY}_${userAddress.toLowerCase()}`,
          analytics,
          userAddress
        );
      }
    } catch (error) {
      console.error('Failed to save user analytics:', error);
    }
  }

  /**
   * Clear all user data
   */
  static async clearUserData(userAddress: string): Promise<void> {
    try {
      // Clear secure storage
      SecureStorage.clearUserData(userAddress);

      // Clear regular localStorage
      const keys = [
        `pva_settings_${userAddress.toLowerCase()}`,
        `pva_positions_${userAddress.toLowerCase()}`,
        `pva_cache_${userAddress.toLowerCase()}`,
      ];

      keys.forEach(key => localStorage.removeItem(key));

      // Clear caches
      this.settingsCache.delete(userAddress.toLowerCase());
      this.profileCache.delete(userAddress.toLowerCase());

      console.log('User data cleared successfully');
    } catch (error) {
      console.error('Failed to clear user data:', error);
      throw new Error('Failed to clear user data');
    }
  }

  /**
   * Merge settings with defaults to ensure all properties exist
   */
  private static mergeWithDefaults(settings: Partial<UserSettings>): UserSettings {
    return {
      theme: settings.theme || DEFAULT_USER_SETTINGS.theme,
      language: settings.language || DEFAULT_USER_SETTINGS.language,
      notifications: {
        ...DEFAULT_USER_SETTINGS.notifications,
        ...settings.notifications,
      },
      trading: {
        ...DEFAULT_USER_SETTINGS.trading,
        ...settings.trading,
      },
      privacy: {
        ...DEFAULT_USER_SETTINGS.privacy,
        ...settings.privacy,
      },
    };
  }

  /**
   * Validate settings object
   */
  private static validateSettings(settings: UserSettings): UserSettings {
    const validated = { ...settings };

    // Validate theme
    if (!['light', 'dark', 'auto'].includes(validated.theme)) {
      validated.theme = DEFAULT_USER_SETTINGS.theme;
    }

    // Validate language
    if (!['en', 'ru'].includes(validated.language)) {
      validated.language = DEFAULT_USER_SETTINGS.language;
    }

    // Validate trading settings
    if (validated.trading.defaultAmount < 20) {
      validated.trading.defaultAmount = 20;
    }

    if (validated.trading.refreshInterval < 5) {
      validated.trading.refreshInterval = 5;
    }

    return validated;
  }

  /**
   * Export user data for backup
   */
  static async exportUserData(userAddress: string): Promise<string> {
    try {
      const profile = await this.getUserProfile(userAddress);
      const analytics = await this.getUserAnalytics(userAddress);

      const exportData = {
        profile,
        analytics,
        exportedAt: Date.now(),
        version: '1.0.0',
      };

      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      console.error('Failed to export user data:', error);
      throw new Error('Failed to export user data');
    }
  }

  /**
   * Import user data from backup
   */
  static async importUserData(userAddress: string, data: string): Promise<void> {
    try {
      const importData = JSON.parse(data);

      if (importData.profile) {
        await this.saveUserProfile(userAddress, importData.profile);
      }

      if (importData.analytics) {
        await this.updateUserAnalytics(userAddress, importData.analytics);
      }

      console.log('User data imported successfully');
    } catch (error) {
      console.error('Failed to import user data:', error);
      throw new Error('Failed to import user data');
    }
  }

  /**
   * Get storage usage statistics
   */
  static getStorageStats() {
    return SecureStorage.getStorageStats();
  }
}