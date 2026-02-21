/**
 * Integration Tests for Enhanced Trading Component
 * Tests interaction with Position Manager system
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EnhancedTrading } from '../EnhancedTrading';
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

// Mock the VirtualizedPositionList component
vi.mock('../VirtualizedPositionList', () => ({
  VirtualizedPositionList: ({ positions, onSell }: any) => (
    <div data-testid="virtualized-position-list">
      {positions.map((pos: any, i: number) => (
        <div key={i} data-testid={`position-${i}`}>
          <span>Position {pos.id}</span>
          <button onClick={() => onSell(i)}>Sell</button>
        </div>
      ))}
    </div>
  ),
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
  buyOnChain: vi.fn(),
  sellOnChain: vi.fn(),
};

const mockToast = vi.fn();

describe('EnhancedTrading Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useIntegratedPositionEngine as any).mockReturnValue(mockEngine);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Component Rendering', () => {
    it('should render trading interface with all components', () => {
      render(
        <EnhancedTrading
          userAddress={mockWeb3.address}
          provider={null}
          contractAddress="0xtest"
          web3={mockWeb3}
          toast={mockToast}
        />
      );

      // Check main components are rendered
      expect(screen.getByText('Торговля')).toBeInTheDocument();
      expect(screen.getByText('Биржа')).toBeInTheDocument();
      expect(screen.getByText('Сумма покупки (USDT)')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Купить' })).toBeInTheDocument();
    });

    it('should show transaction status indicator when transaction is pending', () => {
      const engineWithTransaction = {
        ...mockEngine,
        transactionStatus: {
          hash: '0xabcdef',
          status: 'pending' as const,
          type: 'buy' as const,
        },
      };
      (useIntegratedPositionEngine as any).mockReturnValue(engineWithTransaction);

      render(
        <EnhancedTrading
          userAddress={mockWeb3.address}
          provider={null}
          contractAddress="0xtest"
          web3={mockWeb3}
          toast={mockToast}
        />
      );

      expect(screen.getByText('Покупка в процессе...')).toBeInTheDocument();
    });

    it('should show sync status indicator', () => {
      render(
        <EnhancedTrading
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

  describe('Buy Functionality', () => {
    it('should handle buy transaction successfully', async () => {
      mockWeb3.buyOnChain.mockResolvedValue(123);
      mockEngine.buy.mockResolvedValue('0xhash');

      render(
        <EnhancedTrading
          userAddress={mockWeb3.address}
          provider={null}
          contractAddress="0xtest"
          web3={mockWeb3}
          toast={mockToast}
        />
      );

      const input = screen.getByDisplayValue('20');
      const buyButton = screen.getByRole('button', { name: 'Купить' });

      fireEvent.change(input, { target: { value: '50' } });
      fireEvent.click(buyButton);

      await waitFor(() => {
        expect(mockWeb3.buyOnChain).toHaveBeenCalledWith(50);
        expect(mockEngine.buy).toHaveBeenCalledWith(50, { onchainId: 123 });
      });
    });

    it('should handle buy transaction failure', async () => {
      const error = new Error('Insufficient funds');
      mockWeb3.buyOnChain.mockRejectedValue(error);

      render(
        <EnhancedTrading
          userAddress={mockWeb3.address}
          provider={null}
          contractAddress="0xtest"
          web3={mockWeb3}
          toast={mockToast}
        />
      );

      const buyButton = screen.getByRole('button', { name: 'Купить' });
      fireEvent.click(buyButton);

      await waitFor(() => {
        expect(screen.getByText('Insufficient funds')).toBeInTheDocument();
      });
    });

    it('should disable buy button when loading', () => {
      const loadingEngine = { ...mockEngine, loading: true };
      (useIntegratedPositionEngine as any).mockReturnValue(loadingEngine);

      render(
        <EnhancedTrading
          userAddress={mockWeb3.address}
          provider={null}
          contractAddress="0xtest"
          web3={mockWeb3}
          toast={mockToast}
        />
      );

      const buyButton = screen.getByRole('button', { name: 'Покупка...' });
      expect(buyButton).toBeDisabled();
    });
  });

  describe('Position Display', () => {
    it('should display regular position list for small datasets', () => {
      const engineWithPositions = {
        ...mockEngine,
        positions: [
          {
            qty: 1000,
            buyPrice: 0.01,
            lockUntil: Date.now() + 3600000, // 1 hour from now
            level: 1,
            onchainId: 1,
          },
          {
            qty: 2000,
            buyPrice: 0.015,
            lockUntil: Date.now() - 3600000, // 1 hour ago (ready)
            level: 2,
            onchainId: 2,
          },
        ],
      };
      (useIntegratedPositionEngine as any).mockReturnValue(engineWithPositions);

      render(
        <EnhancedTrading
          userAddress={mockWeb3.address}
          provider={null}
          contractAddress="0xtest"
          web3={mockWeb3}
          toast={mockToast}
        />
      );

      expect(screen.getByText('Позиция #1 • L1')).toBeInTheDocument();
      expect(screen.getByText('Позиция #2 • L2')).toBeInTheDocument();
      expect(screen.getByText('Готово')).toBeInTheDocument();
    });

    it('should use virtualized list for large datasets', () => {
      const largePositions = Array.from({ length: 150 }, (_, i) => ({
        qty: 1000,
        buyPrice: 0.01,
        lockUntil: Date.now() + 3600000,
        level: 1,
        onchainId: i,
      }));

      const engineWithManyPositions = {
        ...mockEngine,
        positions: largePositions,
      };
      (useIntegratedPositionEngine as any).mockReturnValue(engineWithManyPositions);

      render(
        <EnhancedTrading
          userAddress={mockWeb3.address}
          provider={null}
          contractAddress="0xtest"
          web3={mockWeb3}
          toast={mockToast}
        />
      );

      expect(screen.getByTestId('virtualized-position-list')).toBeInTheDocument();
    });
  });

  describe('Sell Functionality', () => {
    it('should handle sell transaction successfully', async () => {
      const engineWithPositions = {
        ...mockEngine,
        positions: [
          {
            qty: 1000,
            buyPrice: 0.01,
            lockUntil: Date.now() - 3600000, // Ready to sell
            level: 1,
            onchainId: 1,
          },
        ],
      };
      (useIntegratedPositionEngine as any).mockReturnValue(engineWithPositions);

      mockWeb3.sellOnChain.mockResolvedValue(undefined);
      mockEngine.sell.mockResolvedValue(undefined);

      render(
        <EnhancedTrading
          userAddress={mockWeb3.address}
          provider={null}
          contractAddress="0xtest"
          web3={mockWeb3}
          toast={mockToast}
        />
      );

      const sellButton = screen.getByRole('button', { name: 'Продать' });
      fireEvent.click(sellButton);

      await waitFor(() => {
        expect(mockWeb3.sellOnChain).toHaveBeenCalledWith(1);
        expect(mockEngine.sell).toHaveBeenCalledWith(0);
      });
    });

    it('should handle sell transaction failure', async () => {
      const engineWithPositions = {
        ...mockEngine,
        positions: [
          {
            qty: 1000,
            buyPrice: 0.01,
            lockUntil: Date.now() - 3600000,
            level: 1,
            onchainId: 1,
          },
        ],
      };
      (useIntegratedPositionEngine as any).mockReturnValue(engineWithPositions);

      const error = new Error('Transaction failed');
      mockWeb3.sellOnChain.mockRejectedValue(error);

      render(
        <EnhancedTrading
          userAddress={mockWeb3.address}
          provider={null}
          contractAddress="0xtest"
          web3={mockWeb3}
          toast={mockToast}
        />
      );

      const sellButton = screen.getByRole('button', { name: 'Продать' });
      fireEvent.click(sellButton);

      await waitFor(() => {
        expect(screen.getByText('Transaction failed')).toBeInTheDocument();
      });
    });
  });

  describe('Tab Navigation', () => {
    it('should switch between trade and exchange tabs', () => {
      render(
        <EnhancedTrading
          userAddress={mockWeb3.address}
          provider={null}
          contractAddress="0xtest"
          web3={mockWeb3}
          toast={mockToast}
        />
      );

      const exchangeTab = screen.getByRole('button', { name: 'Биржа' });
      fireEvent.click(exchangeTab);

      // Should show exchange table
      expect(screen.getByText('Пользователь')).toBeInTheDocument();
      expect(screen.getByText('Тип')).toBeInTheDocument();
      expect(screen.getByText('Цена')).toBeInTheDocument();

      const tradeTab = screen.getByRole('button', { name: 'Торговля' });
      fireEvent.click(tradeTab);

      // Should show trade form
      expect(screen.getByText('Сумма покупки (USDT)')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should display error state when engine has error', () => {
      const engineWithError = {
        ...mockEngine,
        error: 'Network connection failed',
      };
      (useIntegratedPositionEngine as any).mockReturnValue(engineWithError);

      render(
        <EnhancedTrading
          userAddress={mockWeb3.address}
          provider={null}
          contractAddress="0xtest"
          web3={mockWeb3}
          toast={mockToast}
        />
      );

      expect(screen.getByText('Ошибка синхронизации')).toBeInTheDocument();
    });

    it('should show loading state when engine is loading', () => {
      const loadingEngine = {
        ...mockEngine,
        loading: true,
      };
      (useIntegratedPositionEngine as any).mockReturnValue(loadingEngine);

      render(
        <EnhancedTrading
          userAddress={mockWeb3.address}
          provider={null}
          contractAddress="0xtest"
          web3={mockWeb3}
          toast={mockToast}
        />
      );

      expect(screen.getByText('Синхронизация...')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Покупка...' })).toBeDisabled();
    });
  });
});