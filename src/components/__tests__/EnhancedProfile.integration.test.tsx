/**
 * Integration Tests for Enhanced Profile Component
 * Tests interaction with Position Manager system and sync status
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EnhancedProfile } from '../EnhancedProfile';
import { useIntegratedPositionEngine } from '../../hooks/useIntegratedPositionEngine';

// Mock the integrated position engine
vi.mock('../../hooks/useIntegratedPositionEngine');

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

const mockEngine = {
  price: 0.01,
  unlockedParts: 5,
  positions: [],
  tradeHistory: [],
  marketCap: 10000000,
  buy: vi.fn(),
  sell: vi.fn(),
  todayBuys: 0,
  todaySells: 0,
  loading: false,
  error: null,
  transactionStatus: null,
  refreshPositions: vi.fn(),
  positionManager: {
    positions: [],
    loading: false,
    error: null,
    refreshPositions: vi.fn(),
    buyTokens: vi.fn(),
    sellPosition: vi.fn(),
    getPositionById: vi.fn(),
  },
};

const mockWeb3 = {
  connected: true,
  address: '0x1234567890123456789012345678901234567890',
  usdtBalance: '1000.00',
  usdtSymbol: 'USDT',
  chainId: '8453',
  loading: false,
  connect: vi.fn(),
  disconnect: vi.fn(),
  refreshUsdtBalance: vi.fn(),
};

const mockToast = vi.fn();

describe('EnhancedProfile Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useIntegratedPositionEngine as any).mockReturnValue(mockEngine);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Component Rendering', () => {
    it('should render profile interface with all sections', () => {
      render(
        <EnhancedProfile
          userAddress={mockWeb3.address}
          provider={null}
          contractAddress="0xtest"
          web3={mockWeb3}
          toast={mockToast}
        />
      );

      expect(screen.getByText('Профиль')).toBeInTheDocument();
      expect(screen.getByText('Активные позиции')).toBeInTheDocument();
      expect(screen.getByText('История сделок')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Обновить' })).toBeInTheDocument();
    });

    it('should display statistics cards', () => {
      const engineWithData = {
        ...mockEngine,
        tradeHistory: [
          {
            type: 'buy' as const,
            amount: 100,
            price: 0.01,
            qty: 10000,
            time: Date.now(),
            level: 1,
          },
          {
            type: 'sell' as const,
            net: 110,
            profit: 8.5,
            price: 0.011,
            qty: 10000,
            time: Date.now(),
            level: 1,
          },
        ],
      };
      (useIntegratedPositionEngine as any).mockReturnValue(engineWithData);

      render(
        <EnhancedProfile
          userAddress={mockWeb3.address}
          provider={null}
          contractAddress="0xtest"
          web3={mockWeb3}
          toast={mockToast}
        />
      );

      expect(screen.getByText('Объём торгов')).toBeInTheDocument();
      expect(screen.getByText('Прибыль')).toBeInTheDocument();
      expect(screen.getByText('Активные позиции')).toBeInTheDocument();
      expect(screen.getByText('Сделок всего')).toBeInTheDocument();
    });

    it('should show sync status indicator', () => {
      render(
        <EnhancedProfile
          userAddress={mockWeb3.address}
          provider={null}
          contractAddress="0xtest"
          web3={mockWeb3}
          toast={mockToast}
        />
      );

      expect(screen.getByText(/Синхронизировано/)).toBeInTheDocument();
    });
  });

  describe('Position Display', () => {
    it('should display active positions with details', () => {
      const engineWithPositions = {
        ...mockEngine,
        positions: [
          {
            qty: 1000,
            buyPrice: 0.01,
            lockUntil: Date.now() + 3600000, // 1 hour from now
            level: 1,
            onchainId: 123,
          },
          {
            qty: 2000,
            buyPrice: 0.015,
            lockUntil: Date.now() - 3600000, // 1 hour ago (ready)
            level: 2,
            onchainId: 456,
          },
        ],
      };
      (useIntegratedPositionEngine as any).mockReturnValue(engineWithPositions);

      render(
        <EnhancedProfile
          userAddress={mockWeb3.address}
          provider={null}
          contractAddress="0xtest"
          web3={mockWeb3}
          toast={mockToast}
        />
      );

      expect(screen.getByText('Позиция #1 • L1')).toBeInTheDocument();
      expect(screen.getByText('Позиция #2 • L2')).toBeInTheDocument();
      expect(screen.getByText('(On-chain: 123)')).toBeInTheDocument();
      expect(screen.getByText('(On-chain: 456)')).toBeInTheDocument();
      expect(screen.getByText('Готово к продаже')).toBeInTheDocument();
      expect(screen.getByText('2 позиций')).toBeInTheDocument();
    });

    it('should show empty state when no positions', () => {
      render(
        <EnhancedProfile
          userAddress={mockWeb3.address}
          provider={null}
          contractAddress="0xtest"
          web3={mockWeb3}
          toast={mockToast}
        />
      );

      expect(screen.getByText('Нет активных позиций')).toBeInTheDocument();
    });

    it('should show wallet connection prompt when not connected', () => {
      render(
        <EnhancedProfile
          userAddress={null}
          provider={null}
          contractAddress="0xtest"
          web3={{ ...mockWeb3, connected: false, address: null }}
          toast={mockToast}
        />
      );

      expect(screen.getByText('Подключите кошелек для просмотра позиций')).toBeInTheDocument();
      expect(screen.getByText('Подключите кошелек для просмотра истории')).toBeInTheDocument();
    });
  });

  describe('Trade History Display', () => {
    it('should display trade history with details', () => {
      const engineWithHistory = {
        ...mockEngine,
        tradeHistory: [
          {
            type: 'buy' as const,
            amount: 100,
            price: 0.01,
            qty: 10000,
            time: Date.now() - 3600000,
            level: 1,
          },
          {
            type: 'sell' as const,
            net: 110,
            profit: 8.5,
            price: 0.011,
            qty: 10000,
            time: Date.now() - 1800000,
            level: 1,
          },
        ],
      };
      (useIntegratedPositionEngine as any).mockReturnValue(engineWithHistory);

      render(
        <EnhancedProfile
          userAddress={mockWeb3.address}
          provider={null}
          contractAddress="0xtest"
          web3={mockWeb3}
          toast={mockToast}
        />
      );

      expect(screen.getByText(/Покупка.*100.*L1/)).toBeInTheDocument();
      expect(screen.getByText(/Продажа.*110.*L1/)).toBeInTheDocument();
      expect(screen.getByText('+8.5')).toBeInTheDocument(); // Profit display
      expect(screen.getByText('2 сделок')).toBeInTheDocument();
    });

    it('should show empty state when no trade history', () => {
      render(
        <EnhancedProfile
          userAddress={mockWeb3.address}
          provider={null}
          contractAddress="0xtest"
          web3={mockWeb3}
          toast={mockToast}
        />
      );

      expect(screen.getByText('История сделок пуста')).toBeInTheDocument();
    });
  });

  describe('Refresh Functionality', () => {
    it('should handle refresh positions successfully', async () => {
      mockEngine.refreshPositions.mockResolvedValue(undefined);

      render(
        <EnhancedProfile
          userAddress={mockWeb3.address}
          provider={null}
          contractAddress="0xtest"
          web3={mockWeb3}
          toast={mockToast}
        />
      );

      const refreshButton = screen.getByRole('button', { name: 'Обновить' });
      fireEvent.click(refreshButton);

      await waitFor(() => {
        expect(mockEngine.refreshPositions).toHaveBeenCalled();
        expect(mockToast).toHaveBeenCalledWith('success', 'Позиции обновлены');
      });
    });

    it('should handle refresh positions failure', async () => {
      const error = new Error('Network error');
      mockEngine.refreshPositions.mockRejectedValue(error);

      render(
        <EnhancedProfile
          userAddress={mockWeb3.address}
          provider={null}
          contractAddress="0xtest"
          web3={mockWeb3}
          toast={mockToast}
        />
      );

      const refreshButton = screen.getByRole('button', { name: 'Обновить' });
      fireEvent.click(refreshButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith('error', 'Ошибка обновления позиций');
      });
    });

    it('should disable refresh button when loading', () => {
      const loadingEngine = { ...mockEngine, loading: true };
      (useIntegratedPositionEngine as any).mockReturnValue(loadingEngine);

      render(
        <EnhancedProfile
          userAddress={mockWeb3.address}
          provider={null}
          contractAddress="0xtest"
          web3={mockWeb3}
          toast={mockToast}
        />
      );

      const refreshButton = screen.getByRole('button', { name: 'Обновление...' });
      expect(refreshButton).toBeDisabled();
    });
  });

  describe('Statistics Calculation', () => {
    it('should calculate statistics correctly', () => {
      const engineWithComplexHistory = {
        ...mockEngine,
        positions: [{ qty: 1000, buyPrice: 0.01, lockUntil: Date.now(), level: 1 }],
        tradeHistory: [
          {
            type: 'buy' as const,
            amount: 100,
            price: 0.01,
            qty: 10000,
            time: Date.now(),
            level: 1,
          },
          {
            type: 'buy' as const,
            amount: 200,
            price: 0.01,
            qty: 20000,
            time: Date.now(),
            level: 2,
          },
          {
            type: 'sell' as const,
            net: 110,
            profit: 8.5,
            price: 0.011,
            qty: 10000,
            time: Date.now(),
            level: 1,
          },
          {
            type: 'sell' as const,
            net: 225,
            profit: 22.5,
            price: 0.01125,
            qty: 20000,
            time: Date.now(),
            level: 2,
          },
        ],
      };
      (useIntegratedPositionEngine as any).mockReturnValue(engineWithComplexHistory);

      render(
        <EnhancedProfile
          userAddress={mockWeb3.address}
          provider={null}
          contractAddress="0xtest"
          web3={mockWeb3}
          toast={mockToast}
        />
      );

      // Total volume: 100 + 200 + 110 + 225 = 635
      expect(screen.getByText('635')).toBeInTheDocument();
      
      // Total profit: 8.5 + 22.5 = 31
      expect(screen.getByText(/31.*10\.33%/)).toBeInTheDocument(); // 31/300 * 100 = 10.33%
      
      // Active positions: 1
      expect(screen.getByText('1')).toBeInTheDocument();
      
      // Total trades: 4
      expect(screen.getByText('4')).toBeInTheDocument();
    });
  });

  describe('Error States', () => {
    it('should display error state in sync indicator', () => {
      const engineWithError = {
        ...mockEngine,
        error: 'Connection failed',
      };
      (useIntegratedPositionEngine as any).mockReturnValue(engineWithError);

      render(
        <EnhancedProfile
          userAddress={mockWeb3.address}
          provider={null}
          contractAddress="0xtest"
          web3={mockWeb3}
          toast={mockToast}
        />
      );

      expect(screen.getByText('Ошибка синхронизации')).toBeInTheDocument();
    });

    it('should show loading state in sync indicator', () => {
      const loadingEngine = {
        ...mockEngine,
        loading: true,
      };
      (useIntegratedPositionEngine as any).mockReturnValue(loadingEngine);

      render(
        <EnhancedProfile
          userAddress={mockWeb3.address}
          provider={null}
          contractAddress="0xtest"
          web3={mockWeb3}
          toast={mockToast}
        />
      );

      expect(screen.getByText('Синхронизация...')).toBeInTheDocument();
    });
  });
});