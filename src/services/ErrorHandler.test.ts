import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ErrorHandler, ErrorType, ErrorSeverity, RpcProviderConfig } from './ErrorHandler';

describe('ErrorHandler', () => {
  let errorHandler: ErrorHandler;
  let mockRpcProviders: RpcProviderConfig[];

  beforeEach(() => {
    mockRpcProviders = [
      { url: 'https://primary.rpc.com', name: 'Primary RPC', priority: 10, isActive: true },
      { url: 'https://backup.rpc.com', name: 'Backup RPC', priority: 5, isActive: true },
      { url: 'https://fallback.rpc.com', name: 'Fallback RPC', priority: 1, isActive: true }
    ];
    
    errorHandler = new ErrorHandler(mockRpcProviders);
    vi.clearAllMocks();
  });

  afterEach(() => {
    errorHandler.clearErrorLogs();
  });

  describe('classifyError', () => {
    const mockContext = {
      operation: 'test_operation',
      userAddress: '0x123',
      timestamp: Date.now()
    };

    it('should classify network errors correctly', () => {
      const networkError = { code: 'NETWORK_ERROR', message: 'network connection timeout' };
      const result = errorHandler.classifyError(networkError, mockContext);

      expect(result.type).toBe('network');
      expect(result.severity).toBe('medium');
      expect(result.shouldRetry).toBe(true);
      expect(result.userMessage).toContain('Network connection');
    });

    it('should classify user action errors correctly', () => {
      const userError = { code: 'ACTION_REJECTED', message: 'User rejected transaction' };
      const result = errorHandler.classifyError(userError, mockContext);

      expect(result.type).toBe('user_action');
      expect(result.severity).toBe('low');
      expect(result.shouldRetry).toBe(false);
      expect(result.userMessage).toContain('cancelled by user');
    });

    it('should classify gas errors correctly', () => {
      const gasError = { message: 'insufficient funds for gas * price + value' };
      const result = errorHandler.classifyError(gasError, mockContext);

      expect(result.type).toBe('gas');
      expect(result.severity).toBe('medium');
      expect(result.shouldRetry).toBe(false);
      expect(result.userMessage).toContain('Insufficient gas');
    });

    it('should classify contract errors correctly', () => {
      const contractError = { message: 'execution reverted: insufficient balance' };
      const result = errorHandler.classifyError(contractError, mockContext);

      expect(result.type).toBe('contract');
      expect(result.severity).toBe('high');
      expect(result.shouldRetry).toBe(false);
      expect(result.userMessage).toContain('contract conditions');
    });

    it('should classify unknown errors correctly', () => {
      const unknownError = { message: 'some unexpected error' };
      const result = errorHandler.classifyError(unknownError, mockContext);

      expect(result.type).toBe('unknown');
      expect(result.severity).toBe('high');
      expect(result.shouldRetry).toBe(true);
      expect(result.userMessage).toContain('unexpected error');
    });
  });

  describe('handleError', () => {
    const mockContext = {
      operation: 'test_operation',
      userAddress: '0x123',
      timestamp: Date.now()
    };

    it('should handle network errors and switch RPC provider', async () => {
      const networkError = { code: 'NETWORK_ERROR', message: 'connection timeout' };
      const initialProvider = errorHandler.getCurrentProvider();
      
      const result = await errorHandler.handleError(networkError, mockContext);
      
      expect(result.type).toBe('network');
      expect(result.userMessage).toContain('backup network connection');
      
      const newProvider = errorHandler.getCurrentProvider();
      expect(newProvider).not.toBe(initialProvider);
    });

    it('should log errors when handling them', async () => {
      const error = { message: 'test error' };
      
      await errorHandler.handleError(error, mockContext);
      
      const logs = errorHandler.getErrorLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].message).toBe('test error');
      expect(logs[0].context).toEqual(mockContext);
    });
  });

  describe('retryOperation', () => {
    const mockContext = {
      operation: 'retry_test',
      timestamp: Date.now()
    };

    it('should succeed on first attempt', async () => {
      const mockOperation = vi.fn().mockResolvedValue('success');
      
      const result = await errorHandler.retryOperation(mockOperation, mockContext);
      
      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('should retry network errors up to max retries', async () => {
      const networkError = { code: 'NETWORK_ERROR', message: 'timeout' };
      const mockOperation = vi.fn().mockRejectedValue(networkError);
      
      await expect(
        errorHandler.retryOperation(mockOperation, mockContext, { maxRetries: 2 })
      ).rejects.toThrow();
      
      expect(mockOperation).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should not retry user action errors', async () => {
      const userError = { code: 'ACTION_REJECTED', message: 'User rejected' };
      const mockOperation = vi.fn().mockRejectedValue(userError);
      
      await expect(
        errorHandler.retryOperation(mockOperation, mockContext)
      ).rejects.toThrow();
      
      expect(mockOperation).toHaveBeenCalledTimes(1); // No retries
    });

    it('should succeed after retries', async () => {
      const networkError = { code: 'NETWORK_ERROR', message: 'timeout' };
      const mockOperation = vi.fn()
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValue('success');
      
      const result = await errorHandler.retryOperation(mockOperation, mockContext);
      
      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(3);
    });
  });

  describe('RPC provider management', () => {
    it('should switch to next available provider', async () => {
      const initialProvider = errorHandler.getCurrentProvider();
      expect(initialProvider?.name).toBe('Primary RPC');
      
      await errorHandler.switchRpcProvider();
      
      const newProvider = errorHandler.getCurrentProvider();
      expect(newProvider?.name).toBe('Backup RPC');
    });

    it('should cycle through all providers', async () => {
      const providerNames = [];
      
      // Collect provider names through full cycle
      for (let i = 0; i < mockRpcProviders.length; i++) {
        const provider = errorHandler.getCurrentProvider();
        providerNames.push(provider?.name);
        await errorHandler.switchRpcProvider();
      }
      
      expect(providerNames).toEqual(['Primary RPC', 'Backup RPC', 'Fallback RPC']);
    });

    it('should handle single provider gracefully', async () => {
      const singleProviderHandler = new ErrorHandler([mockRpcProviders[0]]);
      const initialProvider = singleProviderHandler.getCurrentProvider();
      
      await singleProviderHandler.switchRpcProvider();
      
      const sameProvider = singleProviderHandler.getCurrentProvider();
      expect(sameProvider).toBe(initialProvider);
    });
  });

  describe('error logging', () => {
    const mockContext = {
      operation: 'logging_test',
      timestamp: Date.now()
    };

    it('should log errors with correct structure', () => {
      const error = { message: 'test error' };
      const errorDetails = errorHandler.classifyError(error, mockContext);
      
      errorHandler.logError(errorDetails);
      
      const logs = errorHandler.getErrorLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toEqual(errorDetails);
    });

    it('should maintain log size limit', () => {
      const smallHandler = new ErrorHandler([], {});
      // Set a small log size for testing
      (smallHandler as any).maxLogSize = 3;
      
      // Add more logs than the limit
      for (let i = 0; i < 5; i++) {
        const error = { message: `error ${i}` };
        const errorDetails = smallHandler.classifyError(error, { ...mockContext, operation: `op_${i}` });
        smallHandler.logError(errorDetails);
      }
      
      const logs = smallHandler.getErrorLogs();
      expect(logs).toHaveLength(3);
      expect(logs[0].message).toBe('error 2'); // Should keep last 3
      expect(logs[2].message).toBe('error 4');
    });

    it('should filter logs correctly', () => {
      // Add different types of errors
      const errors = [
        { message: 'network timeout', type: 'network' as ErrorType },
        { message: 'user rejected', type: 'user_action' as ErrorType },
        { message: 'gas error', type: 'gas' as ErrorType }
      ];
      
      errors.forEach((error, index) => {
        const errorDetails = errorHandler.classifyError(error, { ...mockContext, operation: `op_${index}` });
        errorHandler.logError(errorDetails);
      });
      
      // Filter by type
      const networkLogs = errorHandler.getErrorLogs({ type: 'network' });
      expect(networkLogs).toHaveLength(1);
      expect(networkLogs[0].type).toBe('network');
      
      // Filter by limit
      const limitedLogs = errorHandler.getErrorLogs({ limit: 2 });
      expect(limitedLogs).toHaveLength(2);
    });

    it('should clear logs correctly', () => {
      const error = { message: 'test error' };
      const errorDetails = errorHandler.classifyError(error, mockContext);
      errorHandler.logError(errorDetails);
      
      expect(errorHandler.getErrorLogs()).toHaveLength(1);
      
      errorHandler.clearErrorLogs();
      
      expect(errorHandler.getErrorLogs()).toHaveLength(0);
    });
  });

  describe('error message extraction', () => {
    const mockContext = {
      operation: 'extraction_test',
      timestamp: Date.now()
    };

    it('should extract message from Error objects', () => {
      const error = new Error('test error message');
      const result = errorHandler.classifyError(error, mockContext);
      
      expect(result.message).toBe('test error message');
    });

    it('should handle string errors', () => {
      const error = 'string error';
      const result = errorHandler.classifyError(error, mockContext);
      
      expect(result.message).toBe('string error');
    });

    it('should handle objects without message', () => {
      const error = {};
      const result = errorHandler.classifyError(error, mockContext);
      
      expect(result.message).toBe('Unknown error');
    });

    it('should handle null and undefined', () => {
      const nullResult = errorHandler.classifyError(null, mockContext);
      const undefinedResult = errorHandler.classifyError(undefined, mockContext);
      
      expect(nullResult.message).toBe('Unknown error');
      expect(undefinedResult.message).toBe('Unknown error');
    });
  });
});


/**
 * Property-based tests for ErrorHandler
 * Feature: enhanced-position-management
 */

import { fc, test } from '@fast-check/vitest';

describe('ErrorHandler Property Tests', () => {
  describe('Property 10: Network Error Recovery', () => {
    test.prop([
      fc.constantFrom('NETWORK_ERROR', 'ECONNREFUSED', 'ETIMEDOUT', 'timeout', 'connection failed'),
      fc.string({ minLength: 1, maxLength: 50 }),
      fc.integer({ min: 1, max: 5 })
    ], { numRuns: 50 })('**Feature: enhanced-position-management, Property 10: Network Error Recovery** - For any network connectivity issue, the system should attempt recovery and notify the user of the connection status', async (errorCode, operation, maxRetries) => {
      // **Validates: Requirements 4.1, 4.2**
      
      const mockProviders: RpcProviderConfig[] = [
        { url: 'https://primary.rpc.com', name: 'Primary', priority: 10, isActive: true },
        { url: 'https://backup.rpc.com', name: 'Backup', priority: 5, isActive: true }
      ];
      
      const handler = new ErrorHandler(mockProviders, { maxRetries });
      
      try {
        const networkError = { code: errorCode, message: `Network error: ${errorCode}` };
        const context = { operation, timestamp: Date.now() };
        
        // Property: Network errors should be classified correctly
        const errorDetails = handler.classifyError(networkError, context);
        expect(errorDetails.type).toBe('network');
        expect(errorDetails.shouldRetry).toBe(true);
        
        // Property: Network errors should trigger RPC switching
        const initialProvider = handler.getCurrentProvider();
        await handler.handleError(networkError, context);
        const newProvider = handler.getCurrentProvider();
        
        if (mockProviders.length > 1) {
          expect(newProvider).not.toBe(initialProvider);
        }
        
        // Property: User should be notified of connection status
        expect(errorDetails.userMessage).toMatch(/network|connection/i);
        
        // Property: Error should be logged
        const logs = handler.getErrorLogs();
        expect(logs.length).toBeGreaterThan(0);
        expect(logs.some(log => log.type === 'network')).toBe(true);
      } finally {
        handler.clearErrorLogs();
      }
    });
  });

  describe('Property 11: User Action Error Handling', () => {
    test.prop([
      fc.constantFrom('ACTION_REJECTED', 'user rejected', 'User denied', 'cancelled'),
      fc.string({ minLength: 1, maxLength: 50 })
    ], { numRuns: 50 })('**Feature: enhanced-position-management, Property 11: User Action Error Handling** - For any user-rejected transaction, the system should display appropriate messaging without retry attempts', async (errorIndicator, operation) => {
      // **Validates: Requirements 4.3**
      
      const handler = new ErrorHandler();
      
      try {
        const userError = { 
          code: errorIndicator.includes('ACTION_REJECTED') ? errorIndicator : undefined,
          message: `Transaction failed: ${errorIndicator}` 
        };
        const context = { operation, timestamp: Date.now() };
        
        // Property: User action errors should be classified correctly
        const errorDetails = handler.classifyError(userError, context);
        expect(errorDetails.type).toBe('user_action');
        expect(errorDetails.shouldRetry).toBe(false);
        
        // Property: User should receive appropriate messaging
        expect(errorDetails.userMessage).toMatch(/cancelled|rejected|denied/i);
        expect(errorDetails.severity).toBe('low');
        
        // Property: Should provide actionable guidance
        expect(errorDetails.suggestedAction).toBeDefined();
        expect(errorDetails.suggestedAction!.length).toBeGreaterThan(0);
        
        // Property: Error should be logged
        handler.logError(errorDetails);
        const logs = handler.getErrorLogs();
        expect(logs.some(log => log.type === 'user_action')).toBe(true);
      } finally {
        handler.clearErrorLogs();
      }
    });
  });

  describe('Property 12: Gas Error Assistance', () => {
    test.prop([
      fc.constantFrom('insufficient funds', 'gas required exceeds', 'out of gas', 'gas limit'),
      fc.string({ minLength: 1, maxLength: 50 })
    ], { numRuns: 50 })('**Feature: enhanced-position-management, Property 12: Gas Error Assistance** - For any insufficient gas error, the system should provide actionable guidance to resolve the issue', async (gasErrorType, operation) => {
      // **Validates: Requirements 4.4**
      
      const handler = new ErrorHandler();
      
      try {
        const gasError = { message: `Transaction failed: ${gasErrorType} for transaction` };
        const context = { operation, timestamp: Date.now() };
        
        // Property: Gas errors should be classified correctly
        const errorDetails = handler.classifyError(gasError, context);
        expect(errorDetails.type).toBe('gas');
        expect(errorDetails.shouldRetry).toBe(false);
        
        // Property: User should receive gas-specific guidance
        expect(errorDetails.userMessage).toMatch(/gas|insufficient/i);
        expect(errorDetails.suggestedAction).toMatch(/gas|ETH|wallet/i);
        
        // Property: Error severity should be appropriate
        expect(errorDetails.severity).toBe('medium');
        
        // Property: Should provide specific actionable guidance
        expect(errorDetails.suggestedAction).toBeDefined();
        expect(errorDetails.suggestedAction!).toMatch(/increase|add|gas limit|ETH/i);
        
        // Property: Error should be logged
        handler.logError(errorDetails);
        const logs = handler.getErrorLogs();
        expect(logs.some(log => log.type === 'gas')).toBe(true);
      } finally {
        handler.clearErrorLogs();
      }
    });
  });

  describe('Property 13: Error Logging Completeness', () => {
    test.prop([
      fc.constantFrom<ErrorType>('network', 'user_action', 'gas', 'contract', 'unknown'),
      fc.string({ minLength: 1, maxLength: 100 }),
      fc.string({ minLength: 1, maxLength: 50 }),
      fc.string({ minLength: 40, maxLength: 42 }).map(s => '0x' + s.substring(2))
    ], { numRuns: 50 })('**Feature: enhanced-position-management, Property 13: Error Logging Completeness** - For any error that occurs in the system, it should be logged with sufficient context for debugging', async (errorType, errorMessage, operation, userAddress) => {
      // **Validates: Requirements 4.5**
      
      const handler = new ErrorHandler();
      
      try {
        // Create error that will be classified as the specified type
        let error: any;
        switch (errorType) {
          case 'network':
            error = { code: 'NETWORK_ERROR', message: errorMessage };
            break;
          case 'user_action':
            error = { code: 'ACTION_REJECTED', message: errorMessage };
            break;
          case 'gas':
            error = { message: `insufficient funds: ${errorMessage}` };
            break;
          case 'contract':
            error = { message: `execution reverted: ${errorMessage}` };
            break;
          default:
            error = { message: errorMessage };
        }
        
        const context = { 
          operation, 
          userAddress, 
          timestamp: Date.now(),
          additionalData: { testProperty: true }
        };
        
        // Property: All errors should be logged
        const errorDetails = handler.classifyError(error, context);
        handler.logError(errorDetails);
        
        const logs = handler.getErrorLogs();
        expect(logs.length).toBeGreaterThan(0);
        
        // Property: Logged error should contain all required context
        const loggedError = logs[logs.length - 1];
        expect(loggedError.type).toBeDefined();
        expect(loggedError.severity).toBeDefined();
        expect(loggedError.message).toBeDefined();
        expect(loggedError.context).toBeDefined();
        expect(loggedError.context.operation).toBe(operation);
        expect(loggedError.context.userAddress).toBe(userAddress);
        expect(loggedError.context.timestamp).toBeDefined();
        
        // Property: Context should be preserved
        expect(loggedError.context.additionalData).toEqual({ testProperty: true });
        
        // Property: Error should be retrievable by filters
        const filteredLogs = handler.getErrorLogs({ type: errorType });
        expect(filteredLogs.some(log => log.message.includes(errorMessage) || log.message === errorMessage)).toBe(true);
        
        // Property: Timestamp should be reasonable (within last minute)
        const now = Date.now();
        expect(loggedError.context.timestamp).toBeLessThanOrEqual(now);
        expect(loggedError.context.timestamp).toBeGreaterThan(now - 60000);
      } finally {
        handler.clearErrorLogs();
      }
    });
  });
});