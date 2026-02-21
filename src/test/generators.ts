/**
 * Test data generators for property-based testing
 * Used to generate random test data for positions and related entities
 */

import { fc } from '@fast-check/vitest';
import { Position, League, PendingTransaction, TransactionType } from '../types/position';

// League generator
export const leagueArb = fc.constantFrom(
  { name: 'Silver' as const, min: 0.01, max: 0.1, profit: 0.1 },
  { name: 'Gold' as const, min: 0.1, max: 1, profit: 0.075 },
  { name: 'Diamond' as const, min: 1, max: 10, profit: 0.05 }
);

// Ethereum address generator (non-zero addresses)
export const addressArb = fc.array(fc.integer({ min: 0, max: 15 }), { minLength: 40, maxLength: 40 })
  .map(arr => '0x' + arr.map(n => n.toString(16).padStart(1, '0')).join(''))
  .filter(addr => {
    // Filter out zero address and addresses that are too close to zero
    const addressNum = BigInt(addr);
    return addressNum > BigInt('0x1000000000000000000000000000000000000000');
  });

// Non-zero address generator specifically for ownership tests
export const nonZeroAddressArb = addressArb.filter(addr => 
  addr !== '0x0000000000000000000000000000000000000000'
);

// Zero address for testing edge cases
export const zeroAddressArb = fc.constant('0x0000000000000000000000000000000000000000');

// BigInt generator for token amounts and prices
export const bigIntArb = fc.integer({ min: 1, max: 1000000 })
  .map(n => BigInt(n));

// Timestamp generator (Unix timestamp in milliseconds)
export const timestampArb = fc.integer({ 
  min: Date.now() - 86400000, // 24 hours ago
  max: Date.now() + 86400000  // 24 hours from now
});

// Position status generator
export const positionStatusArb = fc.constantFrom('active', 'locked', 'ready', 'closed');

// Transaction hash generator
export const transactionHashArb = fc.array(fc.integer({ min: 0, max: 15 }), { minLength: 64, maxLength: 64 })
  .map(arr => '0x' + arr.map(n => n.toString(16)).join(''));

// Position generator with proper timestamp ordering
export const positionArb = fc.record({
  id: fc.integer({ min: 0, max: 10000 }),
  owner: nonZeroAddressArb, // Use non-zero addresses for valid positions
  amountTokens: bigIntArb,
  buyPrice: bigIntArb,
  createdAt: timestampArb,
  partId: fc.integer({ min: 1, max: 100 }),
  league: leagueArb,
  closed: fc.boolean(),
  onChainId: fc.option(fc.integer({ min: 0, max: 10000 })),
  transactionHash: fc.option(transactionHashArb),
  status: positionStatusArb,
}).chain(basePosition => 
  fc.integer({ min: 1, max: 86400000 }) // 1ms to 24 hours (ensure unlockAt > createdAt)
    .map(unlockDelay => ({
      ...basePosition,
      unlockAt: basePosition.createdAt + unlockDelay
    }))
) as fc.Arbitrary<Position>;

// Array of positions generator
export const positionsArrayArb = fc.array(positionArb, { minLength: 0, maxLength: 50 });

// Transaction type generator
export const transactionTypeArb = fc.constantFrom('buy', 'sell') as fc.Arbitrary<TransactionType>;

// Pending transaction generator
export const pendingTransactionArb = fc.record({
  hash: transactionHashArb,
  type: transactionTypeArb,
  timestamp: timestampArb,
  retryCount: fc.integer({ min: 0, max: 5 }),
  status: fc.constantFrom('pending', 'confirmed', 'failed'),
}) as fc.Arbitrary<PendingTransaction>;

// User address generator (for testing different users)
export const userAddressArb = addressArb;

// USD amount generator (for buy operations)
export const usdAmountArb = fc.float({ min: 20, max: 10000, noNaN: true });

// Position ID generator
export const positionIdArb = fc.integer({ min: 0, max: 10000 });

// Error message generator
export const errorMessageArb = fc.string({ minLength: 1, maxLength: 200 });

// Network error generator
export const networkErrorArb = fc.record({
  message: errorMessageArb,
  code: fc.integer({ min: 4000, max: 5000 }),
  data: fc.option(fc.object()),
});

// Cache data generator
export const cacheDataArb = fc.record({
  positions: fc.dictionary(userAddressArb, positionsArrayArb),
  lastUpdate: fc.dictionary(userAddressArb, timestampArb),
  version: fc.string({ minLength: 5, maxLength: 10 }),
});

// Whitespace string generator (for testing empty input validation)
export const whitespaceStringArb = fc.string()
  .filter(s => s.trim().length === 0 && s.length > 0);

// Valid non-empty string generator
export const nonEmptyStringArb = fc.string({ minLength: 1 })
  .filter(s => s.trim().length > 0);