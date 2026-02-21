/**
 * Unit Tests for Transaction Status Indicator Components
 * Tests transaction status display and sync status functionality
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TransactionStatusIndicator, SyncStatusIndicator } from '../TransactionStatusIndicator';

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

describe('TransactionStatusIndicator', () => {
  describe('Pending Transaction', () => {
    it('should display pending buy transaction', () => {
      render(
        <TransactionStatusIndicator
          transactionStatus={{
            hash: '0xabcdef1234567890',
            status: 'pending',
            type: 'buy',
          }}
        />
      );

      expect(screen.getByText('Покупка в процессе...')).toBeInTheDocument();
      expect(screen.getByText('⏳')).toBeInTheDocument();
      expect(screen.getByText('Транзакция: 0xabcd...7890')).toBeInTheDocument();
    });

    it('should display pending sell transaction', () => {
      render(
        <TransactionStatusIndicator
          transactionStatus={{
            hash: '0xabcdef1234567890',
            status: 'pending',
            type: 'sell',
          }}
        />
      );

      expect(screen.getByText('Продажа в процессе...')).toBeInTheDocument();
      expect(screen.getByText('⏳')).toBeInTheDocument();
    });
  });

  describe('Confirmed Transaction', () => {
    it('should display confirmed buy transaction', () => {
      render(
        <TransactionStatusIndicator
          transactionStatus={{
            hash: '0xabcdef1234567890',
            status: 'confirmed',
            type: 'buy',
            userMessage: 'Покупка успешно завершена!',
          }}
        />
      );

      expect(screen.getByText('Покупка успешно завершена!')).toBeInTheDocument();
      expect(screen.getByText('✅')).toBeInTheDocument();
    });

    it('should display confirmed sell transaction with default message', () => {
      render(
        <TransactionStatusIndicator
          transactionStatus={{
            hash: '0xabcdef1234567890',
            status: 'confirmed',
            type: 'sell',
          }}
        />
      );

      expect(screen.getByText('Продажа завершена!')).toBeInTheDocument();
      expect(screen.getByText('✅')).toBeInTheDocument();
    });
  });

  describe('Failed Transaction', () => {
    it('should display failed buy transaction', () => {
      render(
        <TransactionStatusIndicator
          transactionStatus={{
            hash: '0xabcdef1234567890',
            status: 'failed',
            type: 'buy',
            userMessage: 'Недостаточно средств',
          }}
        />
      );

      expect(screen.getByText('Недостаточно средств')).toBeInTheDocument();
      expect(screen.getByText('❌')).toBeInTheDocument();
    });

    it('should display failed sell transaction with default message', () => {
      render(
        <TransactionStatusIndicator
          transactionStatus={{
            hash: '0xabcdef1234567890',
            status: 'failed',
            type: 'sell',
          }}
        />
      );

      expect(screen.getByText('Продажа не удалась')).toBeInTheDocument();
      expect(screen.getByText('❌')).toBeInTheDocument();
    });
  });

  describe('No Transaction Status', () => {
    it('should not render when transactionStatus is null', () => {
      const { container } = render(
        <TransactionStatusIndicator transactionStatus={null} />
      );

      expect(container.firstChild).toBeNull();
    });

    it('should not render when transactionStatus is undefined', () => {
      const { container } = render(
        <TransactionStatusIndicator />
      );

      expect(container.firstChild).toBeNull();
    });
  });

  describe('Hash Display', () => {
    it('should display shortened transaction hash', () => {
      render(
        <TransactionStatusIndicator
          transactionStatus={{
            hash: '0x1234567890abcdef1234567890abcdef12345678',
            status: 'pending',
            type: 'buy',
          }}
        />
      );

      expect(screen.getByText('Транзакция: 0x1234...5678')).toBeInTheDocument();
    });

    it('should handle empty hash gracefully', () => {
      render(
        <TransactionStatusIndicator
          transactionStatus={{
            hash: '',
            status: 'pending',
            type: 'buy',
          }}
        />
      );

      expect(screen.queryByText(/Транзакция:/)).not.toBeInTheDocument();
    });
  });
});

describe('SyncStatusIndicator', () => {
  describe('Loading State', () => {
    it('should display loading state', () => {
      render(
        <SyncStatusIndicator
          loading={true}
          error={null}
        />
      );

      expect(screen.getByText('Синхронизация...')).toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    it('should display error state', () => {
      render(
        <SyncStatusIndicator
          loading={false}
          error="Network connection failed"
        />
      );

      expect(screen.getByText('Ошибка синхронизации')).toBeInTheDocument();
      expect(screen.getByText('⚠️')).toBeInTheDocument();
    });
  });

  describe('Success State', () => {
    it('should display success state with recent sync', () => {
      const recentTime = Date.now() - 30000; // 30 seconds ago
      
      render(
        <SyncStatusIndicator
          loading={false}
          error={null}
          lastSyncTime={recentTime}
        />
      );

      expect(screen.getByText('Синхронизировано Только что')).toBeInTheDocument();
      expect(screen.getByText('✅')).toBeInTheDocument();
    });

    it('should display success state with old sync', () => {
      const oldTime = Date.now() - 3600000; // 1 hour ago
      
      render(
        <SyncStatusIndicator
          loading={false}
          error={null}
          lastSyncTime={oldTime}
        />
      );

      expect(screen.getByText('Синхронизировано 1 ч назад')).toBeInTheDocument();
    });

    it('should display success state with no sync time', () => {
      render(
        <SyncStatusIndicator
          loading={false}
          error={null}
        />
      );

      expect(screen.getByText('Синхронизировано Никогда')).toBeInTheDocument();
    });
  });

  describe('Time Formatting', () => {
    it('should format minutes correctly', () => {
      const time = Date.now() - 5 * 60 * 1000; // 5 minutes ago
      
      render(
        <SyncStatusIndicator
          loading={false}
          error={null}
          lastSyncTime={time}
        />
      );

      expect(screen.getByText('Синхронизировано 5 мин назад')).toBeInTheDocument();
    });

    it('should format hours correctly', () => {
      const time = Date.now() - 2 * 60 * 60 * 1000; // 2 hours ago
      
      render(
        <SyncStatusIndicator
          loading={false}
          error={null}
          lastSyncTime={time}
        />
      );

      expect(screen.getByText('Синхронизировано 2 ч назад')).toBeInTheDocument();
    });

    it('should format days correctly', () => {
      const time = Date.now() - 3 * 24 * 60 * 60 * 1000; // 3 days ago
      
      render(
        <SyncStatusIndicator
          loading={false}
          error={null}
          lastSyncTime={time}
        />
      );

      expect(screen.getByText('Синхронизировано 3 дн назад')).toBeInTheDocument();
    });
  });

  describe('Priority States', () => {
    it('should prioritize error over loading', () => {
      render(
        <SyncStatusIndicator
          loading={true}
          error="Connection failed"
        />
      );

      expect(screen.getByText('Ошибка синхронизации')).toBeInTheDocument();
      expect(screen.queryByText('Синхронизация...')).not.toBeInTheDocument();
    });

    it('should prioritize loading over success', () => {
      render(
        <SyncStatusIndicator
          loading={true}
          error={null}
          lastSyncTime={Date.now()}
        />
      );

      expect(screen.getByText('Синхронизация...')).toBeInTheDocument();
      expect(screen.queryByText(/Синхронизировано/)).not.toBeInTheDocument();
    });
  });

  describe('Custom Styling', () => {
    it('should apply custom className', () => {
      const { container } = render(
        <SyncStatusIndicator
          loading={false}
          error={null}
          className="custom-class"
        />
      );

      expect(container.firstChild).toHaveClass('custom-class');
    });
  });
});