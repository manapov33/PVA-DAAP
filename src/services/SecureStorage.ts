/**
 * Secure Storage Service - Enhanced data storage with encryption
 * Handles sensitive data with AES encryption and secure key derivation
 */

import { EncryptedData } from '../types/user';

export class SecureStorage {
  private static readonly STORAGE_PREFIX = 'pva_secure_';
  private static readonly CURRENT_VERSION = 1;

  /**
   * Generate a cryptographic key from user address
   */
  private static async deriveKey(userAddress: string, salt: string): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(userAddress.toLowerCase()),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: encoder.encode(salt),
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Encrypt data using AES-GCM
   */
  private static async encryptData(data: string, userAddress: string): Promise<EncryptedData> {
    const encoder = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    const key = await this.deriveKey(userAddress, Array.from(salt).map(b => String.fromCharCode(b)).join(''));
    
    const encryptedBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoder.encode(data)
    );

    return {
      data: btoa(String.fromCharCode(...new Uint8Array(encryptedBuffer))),
      salt: btoa(String.fromCharCode(...salt)),
      iv: btoa(String.fromCharCode(...iv)),
      version: this.CURRENT_VERSION,
    };
  }

  /**
   * Decrypt data using AES-GCM
   */
  private static async decryptData(encryptedData: EncryptedData, userAddress: string): Promise<string> {
    const decoder = new TextDecoder();
    
    const salt = Uint8Array.from(atob(encryptedData.salt), c => c.charCodeAt(0));
    const iv = Uint8Array.from(atob(encryptedData.iv), c => c.charCodeAt(0));
    const data = Uint8Array.from(atob(encryptedData.data), c => c.charCodeAt(0));
    
    const key = await this.deriveKey(userAddress, Array.from(salt).map(b => String.fromCharCode(b)).join(''));
    
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );

    return decoder.decode(decryptedBuffer);
  }

  /**
   * Store encrypted data in localStorage
   */
  static async setSecure<T>(key: string, value: T, userAddress: string): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      const encrypted = await this.encryptData(serialized, userAddress);
      const storageKey = `${this.STORAGE_PREFIX}${key}`;
      
      localStorage.setItem(storageKey, JSON.stringify(encrypted));
    } catch (error) {
      console.error('Failed to store encrypted data:', error);
      throw new Error('Secure storage failed');
    }
  }

  /**
   * Retrieve and decrypt data from localStorage
   */
  static async getSecure<T>(key: string, userAddress: string): Promise<T | null> {
    try {
      const storageKey = `${this.STORAGE_PREFIX}${key}`;
      const stored = localStorage.getItem(storageKey);
      
      if (!stored) {
        return null;
      }

      const encrypted: EncryptedData = JSON.parse(stored);
      
      // Check version compatibility
      if (encrypted.version > this.CURRENT_VERSION) {
        console.warn('Encrypted data version is newer than supported, skipping');
        return null;
      }

      const decrypted = await this.decryptData(encrypted, userAddress);
      return JSON.parse(decrypted);
    } catch (error) {
      console.error('Failed to retrieve encrypted data:', error);
      return null;
    }
  }

  /**
   * Remove encrypted data from localStorage
   */
  static removeSecure(key: string): void {
    const storageKey = `${this.STORAGE_PREFIX}${key}`;
    localStorage.removeItem(storageKey);
  }

  /**
   * Check if Web Crypto API is available
   */
  static isSupported(): boolean {
    return typeof crypto !== 'undefined' && 
           typeof crypto.subtle !== 'undefined' &&
           typeof crypto.getRandomValues !== 'undefined';
  }

  /**
   * Clear all secure storage for a user
   */
  static clearUserData(userAddress: string): void {
    const keys = Object.keys(localStorage);
    const userKeys = keys.filter(key => 
      key.startsWith(this.STORAGE_PREFIX) && 
      key.includes(userAddress.toLowerCase())
    );
    
    userKeys.forEach(key => localStorage.removeItem(key));
  }

  /**
   * Get storage usage statistics
   */
  static getStorageStats(): { used: number; available: number; percentage: number } {
    let used = 0;
    
    for (let key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        used += localStorage[key].length + key.length;
      }
    }

    // Approximate localStorage limit (5MB in most browsers)
    const available = 5 * 1024 * 1024;
    const percentage = (used / available) * 100;

    return { used, available, percentage };
  }
}