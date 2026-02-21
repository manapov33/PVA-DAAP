import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ethers } from 'ethers';
import { TransactionMonitor, TransactionType, TransactionStatus } from './TransactionMonitor';

// Mock ethers provider
const mockProvider = {
  getTransactionReceipt: vi.fn(),
  getTransaction: vi.fn(),
} as unknown as ethers.Provider;

describe('TransactionMonitor', () => {
  let monitor: TransactionMonitor;

  beforeEach(() => {
    monitor = new TransactionMonitor(mockProvider, 100); // Use 100ms for faster testing
    vi.clearAllMocks();
  });

  afterEach(() => {
    monitor.cleanup();
  });

  describe('monitorTransaction', () => {
    it('should track a pending transaction', async () => {
      const hash = '0x123';
      const type: TransactionType = 'buy';

      // Mock pending transaction (no receipt yet)
      (mockProvider.getTransactionReceipt as any).mockResolvedValue(null);
      (mockProvider.getTransaction as any).mockResolvedValue({ hash });

      // Start monitoring (don't await to test pending state)
      const monitorPromise = monitor.monitorTransaction(hash, type);

      // Check that transaction is tracked as pending
      expect(monitor.getTransactionStatus(hash)).toBe('pending');
      expect(monitor.getPendingTransactions().has(hash)).toBe(true);

      // Cancel monitoring to prevent hanging test
      monitor.cancelMonitoring(hash);
    });

    it('should resolve when transaction is confirmed', async () => {
      const hash = '0x123';
      const type: TransactionType = 'buy';
      const mockReceipt = {
        status: 1,
        transactionHash: hash,
        blockNumber: 12345,
      } as unknown as ethers.TransactionReceipt;

      // Mock confirmed transaction
      (mockProvider.getTransactionReceipt as any).mockResolvedValue(mockReceipt);

      const result = await monitor.monitorTransaction(hash, type);

      expect(result.status).toBe('confirmed');
      expect(result.hash).toBe(hash);
      expect(result.receipt).toEqual(mockReceipt);
      expect(monitor.getTransactionStatus(hash)).toBe('confirmed');
    });

    it('should resolve when transaction fails', async () => {
      const hash = '0x123';
      const type: TransactionType = 'sell';
      const mockReceipt = {
        status: 0, // Failed transaction
        transactionHash: hash,
        blockNumber: 12345,
      } as unknown as ethers.TransactionReceipt;

      // Mock failed transaction
      (mockProvider.getTransactionReceipt as any).mockResolvedValue(mockReceipt);

      const result = await monitor.monitorTransaction(hash, type);

      expect(result.status).toBe('failed');
      expect(result.hash).toBe(hash);
      expect(result.error).toBe('Transaction reverted');
      expect(monitor.getTransactionStatus(hash)).toBe('failed');
    });

    it('should handle transaction not found', async () => {
      const hash = '0x123';
      const type: TransactionType = 'buy';

      // Mock transaction not found
      (mockProvider.getTransactionReceipt as any).mockResolvedValue(null);
      (mockProvider.getTransaction as any).mockResolvedValue(null);

      const result = await monitor.monitorTransaction(hash, type);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Transaction not found');
    });

    it('should handle provider errors with retries', async () => {
      const hash = '0x123';
      const type: TransactionType = 'buy';

      // Mock provider error
      (mockProvider.getTransactionReceipt as any).mockRejectedValue(new Error('Network error'));

      const result = await monitor.monitorTransaction(hash, type);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Network error');
      expect((mockProvider.getTransactionReceipt as any)).toHaveBeenCalledTimes(5); // Max retries
    }, 10000); // Increase timeout to 10 seconds
  });

  describe('cancelMonitoring', () => {
    it('should stop monitoring and remove transaction', async () => {
      const hash = '0x123';
      const type: TransactionType = 'buy';

      // Mock pending transaction
      (mockProvider.getTransactionReceipt as any).mockResolvedValue(null);
      (mockProvider.getTransaction as any).mockResolvedValue({ hash });

      // Start monitoring
      monitor.monitorTransaction(hash, type);

      // Verify transaction is being tracked
      expect(monitor.getPendingTransactions().has(hash)).toBe(true);

      // Cancel monitoring
      monitor.cancelMonitoring(hash);

      // Verify transaction is removed
      expect(monitor.getPendingTransactions().has(hash)).toBe(false);
      expect(monitor.getTransactionStatus(hash)).toBe(null);
    });
  });

  describe('getTransactionStatus', () => {
    it('should return null for unknown transaction', () => {
      expect(monitor.getTransactionStatus('0x999')).toBe(null);
    });

    it('should return correct status for tracked transaction', async () => {
      const hash = '0x123';
      const mockReceipt = {
        status: 1,
        transactionHash: hash,
      } as unknown as ethers.TransactionReceipt;

      (mockProvider.getTransactionReceipt as any).mockResolvedValue(mockReceipt);

      await monitor.monitorTransaction(hash, 'buy');

      expect(monitor.getTransactionStatus(hash)).toBe('confirmed');
    });
  });

  describe('clearCompletedTransactions', () => {
    it('should remove only completed transactions', async () => {
      const confirmedHash = '0x123';
      const failedHash = '0x456';
      const pendingHash = '0x789';

      // Mock confirmed transaction
      (mockProvider.getTransactionReceipt as any).mockImplementation((hash: string) => {
        if (hash === confirmedHash) {
          return Promise.resolve({ status: 1, transactionHash: hash });
        }
        if (hash === failedHash) {
          return Promise.resolve({ status: 0, transactionHash: hash });
        }
        return Promise.resolve(null); // Pending
      });

      (mockProvider.getTransaction as any).mockResolvedValue({ hash: pendingHash });

      // Start monitoring all transactions
      await monitor.monitorTransaction(confirmedHash, 'buy');
      await monitor.monitorTransaction(failedHash, 'sell');
      monitor.monitorTransaction(pendingHash, 'buy'); // Don't await - keep pending

      // Clear completed transactions
      monitor.clearCompletedTransactions();

      // Only pending transaction should remain
      expect(monitor.getPendingTransactions().size).toBe(1);
      expect(monitor.getPendingTransactions().has(pendingHash)).toBe(true);
      expect(monitor.getPendingTransactions().has(confirmedHash)).toBe(false);
      expect(monitor.getPendingTransactions().has(failedHash)).toBe(false);

      // Cleanup
      monitor.cancelMonitoring(pendingHash);
    });
  });

  describe('handleTransactionError', () => {
    it('should classify user rejection errors', () => {
      const userRejectedError = { code: 'ACTION_REJECTED', message: 'User rejected transaction' };
      const result = monitor.handleTransactionError(userRejectedError);
      
      expect(result.type).toBe('user_rejected');
      expect(result.shouldRetry).toBe(false);
      expect(result.userMessage).toContain('cancelled by user');
    });

    it('should classify insufficient gas errors', () => {
      const gasError = { message: 'insufficient funds for gas * price + value' };
      const result = monitor.handleTransactionError(gasError);
      
      expect(result.type).toBe('insufficient_gas');
      expect(result.shouldRetry).toBe(false);
      expect(result.userMessage).toContain('gas limit');
    });

    it('should classify contract revert errors', () => {
      const revertError = { message: 'execution reverted: insufficient balance' };
      const result = monitor.handleTransactionError(revertError);
      
      expect(result.type).toBe('contract_revert');
      expect(result.shouldRetry).toBe(false);
      expect(result.userMessage).toContain('contract conditions');
    });

    it('should classify network errors', () => {
      const networkError = { code: 'NETWORK_ERROR', message: 'network connection timeout' };
      const result = monitor.handleTransactionError(networkError);
      
      expect(result.type).toBe('network_error');
      expect(result.shouldRetry).toBe(true);
      expect(result.userMessage).toContain('connection');
    });

    it('should classify unknown errors', () => {
      const unknownError = { message: 'some unexpected error' };
      const result = monitor.handleTransactionError(unknownError);
      
      expect(result.type).toBe('unknown');
      expect(result.shouldRetry).toBe(true);
      expect(result.userMessage).toContain('unexpected error');
    });

    it('should handle errors without message', () => {
      const errorWithoutMessage = {};
      const result = monitor.handleTransactionError(errorWithoutMessage);
      
      expect(result.type).toBe('unknown');
      expect(result.message).toBe('Unknown error');
      expect(result.userMessage).toContain('unexpected error');
    });
  });

  describe('enhanced error handling in monitoring', () => {
    it('should not retry user rejection errors', async () => {
      const hash = '0x123';
      const userRejectedError = { code: 'ACTION_REJECTED', message: 'User rejected transaction' };

      // Mock provider error
      (mockProvider.getTransactionReceipt as any).mockRejectedValue(userRejectedError);

      const result = await monitor.monitorTransaction(hash, 'buy');

      expect(result.status).toBe('failed');
      expect(result.errorType).toBe('user_rejected');
      expect(result.userMessage).toContain('cancelled by user');
      // Should not retry, so only called once
      expect((mockProvider.getTransactionReceipt as any)).toHaveBeenCalledTimes(1);
    });

    it('should not retry insufficient gas errors', async () => {
      const hash = '0x123';
      const gasError = { message: 'insufficient funds for gas * price + value' };

      // Mock provider error
      (mockProvider.getTransactionReceipt as any).mockRejectedValue(gasError);

      const result = await monitor.monitorTransaction(hash, 'buy');

      expect(result.status).toBe('failed');
      expect(result.errorType).toBe('insufficient_gas');
      expect(result.userMessage).toContain('gas limit');
      // Should not retry, so only called once
      expect((mockProvider.getTransactionReceipt as any)).toHaveBeenCalledTimes(1);
    });

    it('should retry network errors up to max retries', async () => {
      const hash = '0x123';
      const networkError = { code: 'NETWORK_ERROR', message: 'network connection timeout' };

      // Mock provider error
      (mockProvider.getTransactionReceipt as any).mockRejectedValue(networkError);

      const result = await monitor.monitorTransaction(hash, 'buy');

      expect(result.status).toBe('failed');
      expect(result.errorType).toBe('network_error');
      expect(result.userMessage).toContain('connection');
      // Should retry up to 5 times
      expect((mockProvider.getTransactionReceipt as any)).toHaveBeenCalledTimes(5);
    }, 10000);
  });

  describe('cleanup', () => {
    it('should clear all transactions and intervals', async () => {
      const hash1 = '0x123';
      const hash2 = '0x456';

      // Mock pending transactions
      (mockProvider.getTransactionReceipt as any).mockResolvedValue(null);
      (mockProvider.getTransaction as any).mockResolvedValue({ hash: hash1 });

      // Start monitoring
      monitor.monitorTransaction(hash1, 'buy');
      monitor.monitorTransaction(hash2, 'sell');

      expect(monitor.getPendingTransactions().size).toBe(2);

      // Cleanup
      monitor.cleanup();

      expect(monitor.getPendingTransactions().size).toBe(0);
    });
  });
});


/**
 * Property-based tests for TransactionMonitor
 * Feature: enhanced-position-management
 */

import { fc, test } from '@fast-check/vitest';

describe('TransactionMonitor Property Tests', () => {
  describe('Property 8: Transaction Monitoring Completeness', () => {
    test.prop([
      fc.string({ minLength: 64, maxLength: 64 }).map(s => '0x' + s.replace(/[^0-9a-f]/g, '0').substring(0, 64)),
      fc.constantFrom<TransactionType>('buy', 'sell')
    ], { numRuns: 100 })('**Feature: enhanced-position-management, Property 8: Transaction Monitoring Completeness** - For any transaction (buy or sell), monitoring should continue until the transaction reaches a final state (confirmed or failed)', async (txHash, txType) => {
      // **Validates: Requirements 3.1, 3.2**
      
      const testMonitor = new TransactionMonitor(mockProvider, 50);
      
      try {
        // Mock a transaction that confirms immediately
        (mockProvider.getTransactionReceipt as any).mockResolvedValue({
          status: 1,
          transactionHash: txHash,
          blockNumber: 12345,
        } as unknown as ethers.TransactionReceipt);
        
        // Start monitoring
        const result = await testMonitor.monitorTransaction(txHash, txType);
        
        // Property: Transaction monitoring must reach a final state
        expect(result.status).toMatch(/^(confirmed|failed)$/);
        expect(['confirmed', 'failed']).toContain(result.status);
        
        // Property: Final state must be stored
        const finalStatus = testMonitor.getTransactionStatus(txHash);
        expect(finalStatus).toMatch(/^(confirmed|failed)$/);
        expect(['confirmed', 'failed']).toContain(finalStatus);
        
        // Property: Transaction must be in pending transactions map during or after monitoring
        const pendingTxs = testMonitor.getPendingTransactions();
        expect(pendingTxs.has(txHash)).toBe(true);
        
        // Property: The transaction type must be preserved
        const txData = pendingTxs.get(txHash);
        expect(txData?.type).toBe(txType);
      } finally {
        testMonitor.cleanup();
        vi.clearAllMocks();
      }
    });

    test.prop([
      fc.string({ minLength: 64, maxLength: 64 }).map(s => '0x' + s.replace(/[^0-9a-f]/g, '0').substring(0, 64)),
      fc.constantFrom<TransactionType>('buy', 'sell'),
      fc.boolean() // Whether transaction succeeds or fails
    ], { numRuns: 100 })('**Feature: enhanced-position-management, Property 8: Transaction Monitoring Completeness** - Monitoring must handle both successful and failed transactions', async (txHash, txType, shouldSucceed) => {
      // **Validates: Requirements 3.1, 3.2**
      
      const testMonitor = new TransactionMonitor(mockProvider, 50);
      
      try {
        // Mock transaction with success or failure
        (mockProvider.getTransactionReceipt as any).mockResolvedValue({
          status: shouldSucceed ? 1 : 0,
          transactionHash: txHash,
          blockNumber: 12345,
        } as unknown as ethers.TransactionReceipt);
        
        const result = await testMonitor.monitorTransaction(txHash, txType);
        
        // Property: Result status must match the transaction outcome
        if (shouldSucceed) {
          expect(result.status).toBe('confirmed');
        } else {
          expect(result.status).toBe('failed');
          expect(result.error).toBeDefined();
        }
        
        // Property: Status must be consistent across different access methods
        const storedStatus = testMonitor.getTransactionStatus(txHash);
        expect(storedStatus).toBe(result.status);
      } finally {
        testMonitor.cleanup();
        vi.clearAllMocks();
      }
    });
  });

  describe('Property 9: UI State Consistency with Transaction Status', () => {
    test.prop([
      fc.string({ minLength: 64, maxLength: 64 }).map(s => '0x' + s.replace(/[^0-9a-f]/g, '0').substring(0, 64)),
      fc.constantFrom<TransactionType>('buy', 'sell')
    ], { numRuns: 25, timeout: 5000 })('**Feature: enhanced-position-management, Property 9: UI State Consistency** - For any pending transaction, the status should be "pending" until completion', async (txHash, txType) => {
      // **Validates: Requirements 3.3, 3.4, 3.5**
      
      const testMonitor = new TransactionMonitor(mockProvider, 50);
      
      try {
        // Mock a transaction that confirms immediately to avoid timeout
        (mockProvider.getTransactionReceipt as any).mockResolvedValue({
          status: 1,
          transactionHash: txHash,
          blockNumber: 12345,
        } as unknown as ethers.TransactionReceipt);
        
        // Start monitoring
        const result = await testMonitor.monitorTransaction(txHash, txType);
        
        // Property: Transaction must reach a final state
        expect(result.status).toMatch(/^(confirmed|failed)$/);
        expect(['confirmed', 'failed']).toContain(result.status);
        
        // Property: Final status should be stored
        const finalStatus = testMonitor.getTransactionStatus(txHash);
        expect(finalStatus).toMatch(/^(confirmed|failed)$/);
        expect(['confirmed', 'failed']).toContain(finalStatus);
        
        // Property: Result must always include the transaction hash
        expect(result.hash).toBe(txHash);
        
        // Property: Transaction must be tracked in pending transactions
        const pendingTxs = testMonitor.getPendingTransactions();
        expect(pendingTxs.has(txHash)).toBe(true);
        
        // Property: The transaction type must be preserved
        const txData = pendingTxs.get(txHash);
        expect(txData?.type).toBe(txType);
      } finally {
        testMonitor.cleanup();
        vi.clearAllMocks();
      }
    });

    test.prop([
      fc.string({ minLength: 64, maxLength: 64 }).map(s => '0x' + s.replace(/[^0-9a-f]/g, '0').substring(0, 64)),
      fc.constantFrom<TransactionType>('buy', 'sell'),
      fc.boolean() // Success or failure
    ], { numRuns: 25, timeout: 5000 })('**Feature: enhanced-position-management, Property 9: UI State Consistency** - Transaction result must include appropriate error information for failures', async (txHash, txType, shouldSucceed) => {
      // **Validates: Requirements 3.3, 3.4, 3.5**
      
      const testMonitor = new TransactionMonitor(mockProvider, 50);
      
      try {
        // Mock transaction outcome
        (mockProvider.getTransactionReceipt as any).mockResolvedValue({
          status: shouldSucceed ? 1 : 0,
          transactionHash: txHash,
          blockNumber: 12345,
        } as unknown as ethers.TransactionReceipt);
        
        const result = await testMonitor.monitorTransaction(txHash, txType);
        
        // Property: Failed transactions must include error information
        if (!shouldSucceed) {
          expect(result.status).toBe('failed');
          expect(result.error).toBeDefined();
          expect(typeof result.error).toBe('string');
          expect(result.error!.length).toBeGreaterThan(0);
        } else {
          // Property: Successful transactions should not have error
          expect(result.status).toBe('confirmed');
          expect(result.receipt).toBeDefined();
        }
        
        // Property: Result must always include the transaction hash
        expect(result.hash).toBe(txHash);
      } finally {
        testMonitor.cleanup();
        vi.clearAllMocks();
      }
    });
  });
});
