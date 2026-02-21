/**
 * Test to verify the testing setup is working correctly
 */

import { describe, it, expect } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { positionArb, addressArb, bigIntArb } from './generators';

describe('Testing Setup Verification', () => {
  it('should have vitest working', () => {
    expect(true).toBe(true);
  });

  it('should have localStorage mock working', () => {
    localStorage.setItem('test', 'value');
    expect(localStorage.getItem('test')).toBe('value');
  });

  it('should have ethers mock working', async () => {
    const { ethers } = await import('ethers');
    expect(ethers.formatUnits).toBeDefined();
    expect(ethers.parseUnits).toBeDefined();
  });

  test.prop([fc.integer()])('should run property-based tests', (num) => {
    expect(typeof num).toBe('number');
  });

  test.prop([positionArb])('should generate valid position objects', (position) => {
    expect(position).toHaveProperty('id');
    expect(position).toHaveProperty('owner');
    expect(position).toHaveProperty('amountTokens');
    expect(position).toHaveProperty('buyPrice');
    expect(typeof position.id).toBe('number');
    expect(typeof position.owner).toBe('string');
    expect(typeof position.amountTokens).toBe('bigint');
    expect(typeof position.buyPrice).toBe('bigint');
  });

  test.prop([addressArb])('should generate valid Ethereum addresses', (address) => {
    expect(address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  test.prop([bigIntArb])('should generate valid BigInt values', (value) => {
    expect(typeof value).toBe('bigint');
    expect(value > 0n).toBe(true);
  });
});