import { ethers } from 'ethers';

export type TransactionType = 'buy' | 'sell';
export type TransactionStatus = 'pending' | 'confirmed' | 'failed';
export type TransactionErrorType = 'user_rejected' | 'insufficient_gas' | 'network_error' | 'contract_revert' | 'unknown';

export interface PendingTransaction {
  hash: string;
  type: TransactionType;
  timestamp: number;
  retryCount: number;
  status: TransactionStatus;
}

export interface TransactionResult {
  hash: string;
  status: TransactionStatus;
  receipt?: ethers.TransactionReceipt;
  error?: string;
  errorType?: TransactionErrorType;
  userMessage?: string;
}

export interface TransactionErrorDetails {
  type: TransactionErrorType;
  message: string;
  userMessage: string;
  shouldRetry: boolean;
}

export class TransactionMonitor {
  private pendingTransactions: Map<string, PendingTransaction> = new Map();
  private provider: ethers.Provider;
  private monitoringIntervals: Map<string, NodeJS.Timeout> = new Map();
  private checkInterval: number;

  constructor(provider: ethers.Provider, checkInterval: number = 5000) {
    this.provider = provider;
    this.checkInterval = checkInterval;
  }

  /**
   * Classify transaction error and provide user-friendly message
   */
  private classifyTransactionError(error: any): TransactionErrorDetails {
    let errorMessage: string;
    
    if (error?.message) {
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    } else if (error && typeof error.toString === 'function') {
      const stringified = error.toString();
      errorMessage = stringified === '[object Object]' ? 'Unknown error' : stringified;
    } else {
      errorMessage = 'Unknown error';
    }
    
    const errorCode = error?.code;

    // User rejected transaction
    if (errorCode === 'ACTION_REJECTED' || errorMessage.includes('user rejected') || errorMessage.includes('User denied')) {
      return {
        type: 'user_rejected',
        message: errorMessage,
        userMessage: 'Transaction was cancelled by user',
        shouldRetry: false
      };
    }

    // Insufficient gas
    if (errorMessage.includes('insufficient funds') || errorMessage.includes('gas required exceeds allowance') || errorMessage.includes('out of gas')) {
      return {
        type: 'insufficient_gas',
        message: errorMessage,
        userMessage: 'Insufficient gas to complete transaction. Please increase gas limit or add more ETH to your wallet.',
        shouldRetry: false
      };
    }

    // Contract revert
    if (errorMessage.includes('revert') || errorMessage.includes('execution reverted')) {
      return {
        type: 'contract_revert',
        message: errorMessage,
        userMessage: 'Transaction failed due to contract conditions. Please check your transaction parameters.',
        shouldRetry: false
      };
    }

    // Network errors
    if (errorMessage.includes('network') || errorMessage.includes('timeout') || errorMessage.includes('connection') || errorCode === 'NETWORK_ERROR') {
      return {
        type: 'network_error',
        message: errorMessage,
        userMessage: 'Network connection issue. Please check your internet connection and try again.',
        shouldRetry: true
      };
    }

    // Unknown error
    return {
      type: 'unknown',
      message: errorMessage,
      userMessage: 'An unexpected error occurred. Please try again.',
      shouldRetry: true
    };
  }

  /**
   * Start monitoring a transaction until it reaches a final state
   */
  async monitorTransaction(hash: string, type: TransactionType): Promise<TransactionResult> {
    const transaction: PendingTransaction = {
      hash,
      type,
      timestamp: Date.now(),
      retryCount: 0,
      status: 'pending'
    };

    this.pendingTransactions.set(hash, transaction);

    return new Promise((resolve) => {
      const checkStatus = async () => {
        try {
          const receipt = await this.provider.getTransactionReceipt(hash);
          
          if (receipt) {
            // Transaction is confirmed
            const status: TransactionStatus = receipt.status === 1 ? 'confirmed' : 'failed';
            
            transaction.status = status;
            this.pendingTransactions.set(hash, transaction);
            
            this.stopMonitoring(hash);
            
            resolve({
              hash,
              status,
              receipt,
              error: status === 'failed' ? 'Transaction reverted' : undefined
            });
          } else {
            // Still pending, check if transaction exists
            const tx = await this.provider.getTransaction(hash);
            if (!tx) {
              // Transaction not found, mark as failed
              transaction.status = 'failed';
              this.pendingTransactions.set(hash, transaction);
              
              this.stopMonitoring(hash);
              
              resolve({
                hash,
                status: 'failed',
                error: 'Transaction not found'
              });
            }
            // Continue monitoring if transaction exists but no receipt yet
          }
        } catch (error) {
          transaction.retryCount++;
          
          // Classify the error
          const errorDetails = this.classifyTransactionError(error);
          
          if (!errorDetails.shouldRetry || transaction.retryCount >= 5) {
            // Max retries reached or error shouldn't be retried, mark as failed
            transaction.status = 'failed';
            this.pendingTransactions.set(hash, transaction);
            
            this.stopMonitoring(hash);
            
            resolve({
              hash,
              status: 'failed',
              error: errorDetails.message,
              errorType: errorDetails.type,
              userMessage: errorDetails.userMessage
            });
          }
          // Continue monitoring if retries available and error should be retried
        }
      };

      // Check immediately
      checkStatus();
      
      // Set up interval for periodic checks
      const interval = setInterval(checkStatus, this.checkInterval);
      this.monitoringIntervals.set(hash, interval);
    });
  }

  /**
   * Handle transaction initiation errors (before monitoring starts)
   */
  handleTransactionError(error: any): TransactionErrorDetails {
    return this.classifyTransactionError(error);
  }

  /**
   * Cancel monitoring for a specific transaction
   */
  cancelMonitoring(hash: string): void {
    this.stopMonitoring(hash);
    this.pendingTransactions.delete(hash);
  }

  /**
   * Get current status of a transaction
   */
  getTransactionStatus(hash: string): TransactionStatus | null {
    const transaction = this.pendingTransactions.get(hash);
    return transaction ? transaction.status : null;
  }

  /**
   * Get all pending transactions
   */
  getPendingTransactions(): Map<string, PendingTransaction> {
    return new Map(this.pendingTransactions);
  }

  /**
   * Clear all completed transactions from memory
   */
  clearCompletedTransactions(): void {
    for (const [hash, transaction] of this.pendingTransactions.entries()) {
      if (transaction.status === 'confirmed' || transaction.status === 'failed') {
        this.pendingTransactions.delete(hash);
      }
    }
  }

  /**
   * Stop monitoring interval for a transaction
   */
  private stopMonitoring(hash: string): void {
    const interval = this.monitoringIntervals.get(hash);
    if (interval) {
      clearInterval(interval);
      this.monitoringIntervals.delete(hash);
    }
  }

  /**
   * Cleanup all monitoring intervals
   */
  cleanup(): void {
    for (const interval of this.monitoringIntervals.values()) {
      clearInterval(interval);
    }
    this.monitoringIntervals.clear();
    this.pendingTransactions.clear();
  }
}