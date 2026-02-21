/**
 * Error Handler Service - Enhanced Position Management
 * Implements comprehensive error handling with retry logic, RPC switching, and logging
 */

import { ethers } from 'ethers';

export type ErrorType = 'network' | 'user_action' | 'gas' | 'contract' | 'unknown';
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface ErrorContext {
  operation: string;
  userAddress?: string;
  contractAddress?: string;
  transactionHash?: string;
  timestamp: number;
  additionalData?: Record<string, any>;
}

export interface ErrorDetails {
  type: ErrorType;
  severity: ErrorSeverity;
  message: string;
  userMessage: string;
  shouldRetry: boolean;
  retryDelay?: number;
  suggestedAction?: string;
  context: ErrorContext;
}

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  backoffMultiplier: number;
  maxDelay: number;
}

export interface RpcProviderConfig {
  url: string;
  name: string;
  priority: number;
  isActive: boolean;
}

export class ErrorHandler {
  private rpcProviders: RpcProviderConfig[] = [];
  private currentProviderIndex: number = 0;
  private errorLog: ErrorDetails[] = [];
  private maxLogSize: number = 1000;
  private retryConfig: RetryConfig;

  constructor(
    rpcProviders: RpcProviderConfig[] = [],
    retryConfig: Partial<RetryConfig> = {}
  ) {
    this.rpcProviders = rpcProviders.sort((a, b) => b.priority - a.priority);
    this.retryConfig = {
      maxRetries: 3,
      baseDelay: 1000,
      backoffMultiplier: 2,
      maxDelay: 10000,
      ...retryConfig
    };
  }

  /**
   * Classify error and provide detailed information
   */
  classifyError(error: any, context: ErrorContext): ErrorDetails {
    const errorMessage = this.extractErrorMessage(error);
    const errorCode = error?.code;

    // Network errors
    if (this.isNetworkError(error, errorMessage)) {
      return {
        type: 'network',
        severity: 'medium',
        message: errorMessage,
        userMessage: 'Network connection issue. Trying alternative connection...',
        shouldRetry: true,
        retryDelay: this.retryConfig.baseDelay,
        suggestedAction: 'Check your internet connection and try again',
        context
      };
    }

    // User action errors (rejection, cancellation)
    if (this.isUserActionError(error, errorMessage)) {
      return {
        type: 'user_action',
        severity: 'low',
        message: errorMessage,
        userMessage: 'Transaction was cancelled by user',
        shouldRetry: false,
        suggestedAction: 'Click the transaction button again if you want to proceed',
        context
      };
    }

    // Gas-related errors
    if (this.isGasError(error, errorMessage)) {
      return {
        type: 'gas',
        severity: 'medium',
        message: errorMessage,
        userMessage: 'Insufficient gas to complete transaction',
        shouldRetry: false,
        suggestedAction: 'Increase gas limit or add more ETH to your wallet',
        context
      };
    }

    // Contract errors
    if (this.isContractError(error, errorMessage)) {
      return {
        type: 'contract',
        severity: 'high',
        message: errorMessage,
        userMessage: 'Transaction failed due to contract conditions',
        shouldRetry: false,
        suggestedAction: 'Check your transaction parameters and contract state',
        context
      };
    }

    // Unknown errors
    return {
      type: 'unknown',
      severity: 'high',
      message: errorMessage,
      userMessage: 'An unexpected error occurred',
      shouldRetry: true,
      retryDelay: this.retryConfig.baseDelay,
      suggestedAction: 'Please try again or contact support if the issue persists',
      context
    };
  }

  /**
   * Handle error with automatic retry logic and RPC switching
   */
  async handleError(error: any, context: ErrorContext): Promise<ErrorDetails> {
    const errorDetails = this.classifyError(error, context);
    
    // Log the error
    this.logError(errorDetails);

    // Handle network errors with RPC switching
    if (errorDetails.type === 'network' && this.rpcProviders.length > 1) {
      await this.switchRpcProvider();
      errorDetails.userMessage = 'Switched to backup network connection. Please try again.';
    }

    return errorDetails;
  }

  /**
   * Retry operation with exponential backoff
   */
  async retryOperation<T>(
    operation: () => Promise<T>,
    context: ErrorContext,
    customRetryConfig?: Partial<RetryConfig>
  ): Promise<T> {
    const config = { ...this.retryConfig, ...customRetryConfig };
    let lastError: any;
    let delay = config.baseDelay;

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        const errorDetails = this.classifyError(error, {
          ...context,
          additionalData: { ...context.additionalData, attempt }
        });

        // Don't retry if error shouldn't be retried
        if (!errorDetails.shouldRetry) {
          throw error;
        }

        // Don't retry on last attempt
        if (attempt === config.maxRetries) {
          break;
        }

        // Handle network errors with RPC switching
        if (errorDetails.type === 'network') {
          await this.switchRpcProvider();
        }

        // Wait before retry with exponential backoff
        await this.delay(Math.min(delay, config.maxDelay));
        delay *= config.backoffMultiplier;
      }
    }

    // All retries exhausted
    const finalErrorDetails = await this.handleError(lastError, {
      ...context,
      additionalData: { ...context.additionalData, retriesExhausted: true }
    });
    
    throw lastError;
  }

  /**
   * Switch to next available RPC provider
   */
  async switchRpcProvider(): Promise<void> {
    if (this.rpcProviders.length <= 1) {
      return;
    }

    // Mark current provider as inactive
    if (this.rpcProviders[this.currentProviderIndex]) {
      this.rpcProviders[this.currentProviderIndex].isActive = false;
    }

    // Find next active provider
    const startIndex = this.currentProviderIndex;
    do {
      this.currentProviderIndex = (this.currentProviderIndex + 1) % this.rpcProviders.length;
    } while (
      !this.rpcProviders[this.currentProviderIndex].isActive &&
      this.currentProviderIndex !== startIndex
    );

    console.log(`Switched to RPC provider: ${this.rpcProviders[this.currentProviderIndex].name}`);
  }

  /**
   * Get current active RPC provider
   */
  getCurrentProvider(): RpcProviderConfig | null {
    return this.rpcProviders[this.currentProviderIndex] || null;
  }

  /**
   * Log error with structured information
   */
  logError(errorDetails: ErrorDetails): void {
    // Add to in-memory log
    this.errorLog.push(errorDetails);

    // Maintain log size limit
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog = this.errorLog.slice(-this.maxLogSize);
    }

    // Console logging with appropriate level
    const logLevel = this.getLogLevel(errorDetails.severity);
    console[logLevel]('Error handled:', {
      type: errorDetails.type,
      severity: errorDetails.severity,
      message: errorDetails.message,
      context: errorDetails.context,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Get error logs with optional filtering
   */
  getErrorLogs(filter?: {
    type?: ErrorType;
    severity?: ErrorSeverity;
    since?: number;
    limit?: number;
  }): ErrorDetails[] {
    let logs = [...this.errorLog];

    if (filter) {
      if (filter.type) {
        logs = logs.filter(log => log.type === filter.type);
      }
      if (filter.severity) {
        logs = logs.filter(log => log.severity === filter.severity);
      }
      if (filter.since) {
        logs = logs.filter(log => log.context.timestamp >= filter.since);
      }
      if (filter.limit) {
        logs = logs.slice(-filter.limit);
      }
    }

    return logs;
  }

  /**
   * Clear error logs
   */
  clearErrorLogs(): void {
    this.errorLog = [];
  }

  /**
   * Extract error message from various error formats
   */
  private extractErrorMessage(error: any): string {
    if (error?.message) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    if (error && typeof error.toString === 'function') {
      const stringified = error.toString();
      return stringified === '[object Object]' ? 'Unknown error' : stringified;
    }
    return 'Unknown error';
  }

  /**
   * Check if error is network-related
   */
  private isNetworkError(error: any, message: string): boolean {
    const networkIndicators = [
      'network', 'timeout', 'connection', 'fetch', 'NETWORK_ERROR',
      'ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'socket hang up'
    ];
    
    return networkIndicators.some(indicator => 
      message.toLowerCase().includes(indicator.toLowerCase()) ||
      error?.code === indicator
    );
  }

  /**
   * Check if error is user action-related
   */
  private isUserActionError(error: any, message: string): boolean {
    const userActionIndicators = [
      'user rejected', 'user denied', 'cancelled', 'ACTION_REJECTED',
      'User cancelled', 'Transaction was rejected'
    ];
    
    return userActionIndicators.some(indicator => 
      message.toLowerCase().includes(indicator.toLowerCase()) ||
      error?.code === indicator
    );
  }

  /**
   * Check if error is gas-related
   */
  private isGasError(error: any, message: string): boolean {
    const gasIndicators = [
      'insufficient funds', 'gas required exceeds', 'out of gas',
      'gas limit', 'intrinsic gas too low', 'INSUFFICIENT_FUNDS'
    ];
    
    return gasIndicators.some(indicator => 
      message.toLowerCase().includes(indicator.toLowerCase())
    );
  }

  /**
   * Check if error is contract-related
   */
  private isContractError(error: any, message: string): boolean {
    const contractIndicators = [
      'revert', 'execution reverted', 'contract', 'CALL_EXCEPTION',
      'invalid opcode', 'stack underflow'
    ];
    
    return contractIndicators.some(indicator => 
      message.toLowerCase().includes(indicator.toLowerCase()) ||
      error?.code === indicator
    );
  }

  /**
   * Get appropriate console log level for error severity
   */
  private getLogLevel(severity: ErrorSeverity): 'log' | 'warn' | 'error' {
    switch (severity) {
      case 'low':
        return 'log';
      case 'medium':
        return 'warn';
      case 'high':
      case 'critical':
        return 'error';
      default:
        return 'log';
    }
  }

  /**
   * Delay utility for retry logic
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}