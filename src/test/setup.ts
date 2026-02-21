/**
 * Test setup file for Vitest
 * Configures mocks for ethers.js and localStorage
 */

import '@testing-library/jest-dom';
import { vi, beforeEach } from 'vitest';
import React from 'react';

// Ensure React is available globally for testing
global.React = React;

// Mock ethers.js
vi.mock('ethers', () => ({
  ethers: {
    BrowserProvider: vi.fn(),
    Contract: vi.fn(),
    formatUnits: vi.fn((value: bigint, decimals: number) => '1000.00'),
    parseUnits: vi.fn((value: string, decimals: number) => BigInt('1000000000')),
  },
}));

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn((key: string) => localStorageMock.store[key] || null),
  setItem: vi.fn((key: string, value: string) => {
    localStorageMock.store[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete localStorageMock.store[key];
  }),
  clear: vi.fn(() => {
    localStorageMock.store = {};
  }),
  length: 0,
  key: vi.fn(),
  store: {} as Record<string, string>,
};

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock window.ethereum
Object.defineProperty(window, 'ethereum', {
  value: {
    request: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
    isMetaMask: true,
  },
});

// Reset all mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
});