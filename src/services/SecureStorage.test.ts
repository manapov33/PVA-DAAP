/**
 * SecureStorage Service Tests
 * Tests for encrypted localStorage functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SecureStorage } from './SecureStorage';

// Mock crypto API for testing
const mockCrypto = {
  subtle: {
    importKey: vi.fn(),
    deriveKey: vi.fn(),
    encrypt: vi.fn(),
    decrypt: vi.fn(),
  },
  getRandomValues: vi.fn(),
};

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
};

describe('SecureStorage', () => {
  beforeEach(() => {
    // Setup crypto mock
    Object.defineProperty(global, 'crypto', {
      value: mockCrypto,
      writable: true,
    });

    // Setup localStorage mock
    Object.defineProperty(global, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
    });

    // Setup TextEncoder/TextDecoder
    global.TextEncoder = vi.fn().mockImplementation(() => ({
      encode: vi.fn().mockReturnValue(new Uint8Array([1, 2, 3])),
    }));

    global.TextDecoder = vi.fn().mockImplementation(() => ({
      decode: vi.fn().mockReturnValue('decoded'),
    }));

    // Setup btoa/atob
    global.btoa = vi.fn().mockReturnValue('base64encoded');
    global.atob = vi.fn().mockReturnValue('decoded');

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('isSupported', () => {
    it('should return true when crypto API is available', () => {
      expect(SecureStorage.isSupported()).toBe(true);
    });

    it('should return false when crypto API is not available', () => {
      Object.defineProperty(global, 'crypto', {
        value: undefined,
        writable: true,
      });

      expect(SecureStorage.isSupported()).toBe(false);
    });
  });

  describe('setSecure and getSecure', () => {
    const testUserAddress = '0x1234567890123456789012345678901234567890';
    const testKey = 'test_key';
    const testData = { message: 'Hello, World!' };

    beforeEach(() => {
      // Mock crypto operations
      mockCrypto.getRandomValues.mockImplementation((array) => {
        for (let i = 0; i < array.length; i++) {
          array[i] = i;
        }
        return array;
      });

      mockCrypto.subtle.importKey.mockResolvedValue('mockKey');
      mockCrypto.subtle.deriveKey.mockResolvedValue('derivedKey');
      mockCrypto.subtle.encrypt.mockResolvedValue(new ArrayBuffer(16));
      mockCrypto.subtle.decrypt.mockResolvedValue(new ArrayBuffer(16));
    });

    it('should store and retrieve encrypted data successfully', async () => {
      // Mock localStorage to return encrypted data
      const mockEncryptedData = {
        data: 'base64encoded',
        salt: 'base64encoded',
        iv: 'base64encoded',
        version: 1,
      };

      mockLocalStorage.setItem.mockImplementation(() => {});
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(mockEncryptedData));

      // Store data
      await SecureStorage.setSecure(testKey, testData, testUserAddress);

      // Verify localStorage.setItem was called
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        `pva_secure_${testKey}`,
        expect.stringContaining('data')
      );

      // Retrieve data
      const retrieved = await SecureStorage.getSecure(testKey, testUserAddress);

      // Should return the decrypted data
      expect(retrieved).toEqual(testData);
    });

    it('should return null when no data exists', async () => {
      mockLocalStorage.getItem.mockReturnValue(null);

      const result = await SecureStorage.getSecure(testKey, testUserAddress);

      expect(result).toBeNull();
    });

    it('should handle encryption errors gracefully', async () => {
      mockCrypto.subtle.encrypt.mockRejectedValue(new Error('Encryption failed'));

      await expect(
        SecureStorage.setSecure(testKey, testData, testUserAddress)
      ).rejects.toThrow('Secure storage failed');
    });

    it('should handle decryption errors gracefully', async () => {
      const mockEncryptedData = {
        data: 'base64encoded',
        salt: 'base64encoded',
        iv: 'base64encoded',
        version: 1,
      };

      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(mockEncryptedData));
      mockCrypto.subtle.decrypt.mockRejectedValue(new Error('Decryption failed'));

      const result = await SecureStorage.getSecure(testKey, testUserAddress);

      expect(result).toBeNull();
    });

    it('should handle version compatibility', async () => {
      const mockEncryptedData = {
        data: 'base64encoded',
        salt: 'base64encoded',
        iv: 'base64encoded',
        version: 999, // Future version
      };

      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(mockEncryptedData));

      const result = await SecureStorage.getSecure(testKey, testUserAddress);

      expect(result).toBeNull();
    });
  });

  describe('removeSecure', () => {
    it('should remove data from localStorage', () => {
      const testKey = 'test_key';

      SecureStorage.removeSecure(testKey);

      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(`pva_secure_${testKey}`);
    });
  });

  describe('clearUserData', () => {
    it('should clear all user-related secure data', () => {
      const testUserAddress = '0x1234567890123456789012345678901234567890';
      
      // Mock Object.keys to return some test keys
      const mockKeys = [
        'pva_secure_user_settings_0x1234567890123456789012345678901234567890',
        'pva_secure_other_key',
        'regular_key',
      ];

      Object.defineProperty(mockLocalStorage, 'length', { value: mockKeys.length });
      mockLocalStorage.key.mockImplementation((index) => mockKeys[index]);

      // Mock Object.keys for localStorage
      Object.keys = vi.fn().mockReturnValue(mockKeys);

      SecureStorage.clearUserData(testUserAddress);

      // Should remove the user-specific key
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(
        'pva_secure_user_settings_0x1234567890123456789012345678901234567890'
      );
    });
  });

  describe('getStorageStats', () => {
    it('should return storage usage statistics', () => {
      // Mock localStorage with some data
      mockLocalStorage.length = 2;
      mockLocalStorage.key.mockImplementation((index) => 
        index === 0 ? 'key1' : 'key2'
      );
      
      Object.defineProperty(mockLocalStorage, 'key1', { value: 'value1' });
      Object.defineProperty(mockLocalStorage, 'key2', { value: 'value2' });
      
      // Mock hasOwnProperty
      mockLocalStorage.hasOwnProperty = vi.fn().mockReturnValue(true);

      const stats = SecureStorage.getStorageStats();

      expect(stats).toHaveProperty('used');
      expect(stats).toHaveProperty('available');
      expect(stats).toHaveProperty('percentage');
      expect(typeof stats.used).toBe('number');
      expect(typeof stats.available).toBe('number');
      expect(typeof stats.percentage).toBe('number');
    });
  });
});