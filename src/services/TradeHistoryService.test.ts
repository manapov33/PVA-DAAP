/**
 * Trade History Service Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TradeHistoryService, TradeRecord, TraderStats } from './TradeHistoryService';

// Мокаем EnhancedLocalStorageCache
vi.mock('./EnhancedLocalStorageCache', () => ({
  EnhancedLocalStorageCache: class MockEnhancedLocalStorageCache {
    set = vi.fn().mockResolvedValue(undefined);
    get = vi.fn().mockResolvedValue(null);
    remove = vi.fn().mockResolvedValue(undefined);
  },
}));

describe('TradeHistoryService', () => {
  let service: TradeHistoryService;
  let mockCache: any;

  beforeEach(() => {
    service = new TradeHistoryService();
    mockCache = (service as any).cache;
    vi.clearAllMocks();
  });

  const mockUserAddress = '0x1234567890123456789012345678901234567890';
  
  const mockBuyRecord: Omit<TradeRecord, 'id'> = {
    type: 'buy',
    userAddress: mockUserAddress,
    amount: 100,
    price: 0.01,
    qty: 10000,
    time: Date.now(),
    level: 1,
  };

  const mockSellRecord: Omit<TradeRecord, 'id'> = {
    type: 'sell',
    userAddress: mockUserAddress,
    net: 110,
    fee: 1.65,
    price: 0.011,
    qty: 10000,
    time: Date.now() + 1000,
    buyCost: 100,
    profit: 8.35,
    level: 1,
  };

  describe('addTradeRecord', () => {
    it('should add a new trade record with generated ID', async () => {
      mockCache.get.mockResolvedValue([]);

      await service.addTradeRecord(mockBuyRecord);

      expect(mockCache.get).toHaveBeenCalledWith(`trade_history_${mockUserAddress.toLowerCase()}`);
      expect(mockCache.set).toHaveBeenCalledWith(
        `trade_history_${mockUserAddress.toLowerCase()}`,
        expect.arrayContaining([
          expect.objectContaining({
            ...mockBuyRecord,
            id: expect.stringMatching(/^trade_\d+_[a-z0-9]+$/),
          }),
        ])
      );
    });

    it('should append to existing trade history', async () => {
      const existingRecord = { ...mockBuyRecord, id: 'existing_id' };
      mockCache.get.mockResolvedValue([existingRecord]);

      await service.addTradeRecord(mockSellRecord);

      expect(mockCache.set).toHaveBeenCalledWith(
        `trade_history_${mockUserAddress.toLowerCase()}`,
        expect.arrayContaining([
          expect.objectContaining(mockSellRecord),
          existingRecord,
        ])
      );
    });
  });

  describe('getUserTradeHistory', () => {
    it('should return empty array for non-existent user', async () => {
      mockCache.get.mockResolvedValue(null);

      const result = await service.getUserTradeHistory(mockUserAddress);

      expect(result).toEqual([]);
    });

    it('should return empty array for empty address', async () => {
      const result = await service.getUserTradeHistory('');

      expect(result).toEqual([]);
      expect(mockCache.get).not.toHaveBeenCalled();
    });

    it('should return user trade history', async () => {
      const mockHistory = [
        { ...mockBuyRecord, id: 'buy_id' },
        { ...mockSellRecord, id: 'sell_id' },
      ];
      mockCache.get.mockResolvedValue(mockHistory);

      const result = await service.getUserTradeHistory(mockUserAddress);

      expect(result).toEqual(mockHistory);
      expect(mockCache.get).toHaveBeenCalledWith(`trade_history_${mockUserAddress.toLowerCase()}`);
    });
  });

  describe('getUserStats', () => {
    it('should return null for user with no trades', async () => {
      mockCache.get.mockResolvedValue([]);

      const result = await service.getUserStats(mockUserAddress);

      expect(result).toBeNull();
    });

    it('should return null for empty address', async () => {
      const result = await service.getUserStats('');

      expect(result).toBeNull();
    });

    it('should calculate correct user stats', async () => {
      const mockHistory = [
        { ...mockBuyRecord, id: 'buy_id', time: 1000 },
        { ...mockSellRecord, id: 'sell_id', time: 2000 },
      ];
      mockCache.get.mockResolvedValue(mockHistory);

      const result = await service.getUserStats(mockUserAddress);

      expect(result).toEqual({
        address: mockUserAddress,
        displayName: '0x1234…7890',
        profit: 8.35,
        volume: 210, // 100 (buy) + 110 (sell)
        trades: 2,
        lastTradeTime: 2000,
      });
    });
  });

  describe('getGlobalLeaderboard', () => {
    it('should return fallback leaderboard when no data exists', async () => {
      mockCache.get.mockResolvedValue(null);

      const result = await service.getGlobalLeaderboard();

      expect(result).toHaveLength(3);
      expect(result[0]).toMatchObject({
        address: expect.stringMatching(/^0x[a-f0-9]{40}$/),
        displayName: expect.stringMatching(/^0x[a-f0-9]{4}…[a-f0-9]{4}$/),
        profit: expect.any(Number),
        volume: expect.any(Number),
        trades: expect.any(Number),
      });
    });

    it('should return cached leaderboard when not expired', async () => {
      const mockLeaderboard = {
        traders: [
          {
            address: mockUserAddress,
            displayName: '0x1234…7890',
            profit: 100,
            volume: 1000,
            trades: 5,
            lastTradeTime: Date.now(),
          },
        ],
        lastUpdated: Date.now(),
      };
      mockCache.get.mockResolvedValue(mockLeaderboard);

      const result = await service.getGlobalLeaderboard();

      expect(result).toEqual(mockLeaderboard.traders);
    });
  });

  describe('clearUserHistory', () => {
    it('should remove user history and rebuild leaderboard', async () => {
      await service.clearUserHistory(mockUserAddress);

      expect(mockCache.remove).toHaveBeenCalledWith(`trade_history_${mockUserAddress.toLowerCase()}`);
      expect(mockCache.set).toHaveBeenCalledWith('global_leaderboard', {
        traders: [],
        lastUpdated: expect.any(Number),
      });
    });

    it('should handle empty address gracefully', async () => {
      await service.clearUserHistory('');

      expect(mockCache.remove).not.toHaveBeenCalled();
    });
  });

  describe('getTopTraders', () => {
    it('should return top traders sorted by profit', async () => {
      const mockLeaderboard = [
        {
          address: '0x1111',
          displayName: '0x1111…1111',
          profit: 50,
          volume: 500,
          trades: 3,
          lastTradeTime: Date.now(),
        },
        {
          address: '0x2222',
          displayName: '0x2222…2222',
          profit: 100,
          volume: 1000,
          trades: 5,
          lastTradeTime: Date.now(),
        },
        {
          address: '0x3333',
          displayName: '0x3333…3333',
          profit: 75,
          volume: 750,
          trades: 4,
          lastTradeTime: Date.now(),
        },
      ];
      
      mockCache.get.mockResolvedValue({
        traders: mockLeaderboard,
        lastUpdated: Date.now(),
      });

      const result = await service.getTopTraders(2);

      expect(result).toHaveLength(2);
      expect(result[0].profit).toBe(100); // Highest profit first
      expect(result[1].profit).toBe(75);  // Second highest
    });
  });

  describe('exportUserData', () => {
    it('should export user history and stats', async () => {
      const mockHistory = [{ ...mockBuyRecord, id: 'test_id' }];
      const mockStats = {
        address: mockUserAddress,
        displayName: '0x1234…7890',
        profit: 0,
        volume: 100,
        trades: 1,
        lastTradeTime: Date.now(),
      };

      mockCache.get
        .mockResolvedValueOnce(mockHistory) // getUserTradeHistory call
        .mockResolvedValueOnce(mockHistory); // getUserStats call (same data)

      const result = await service.exportUserData(mockUserAddress);

      expect(result).toEqual({
        history: mockHistory,
        stats: expect.objectContaining({
          address: mockUserAddress,
          displayName: '0x1234…7890',
        }),
      });
    });
  });

  describe('address formatting', () => {
    it('should format addresses correctly', () => {
      const service = new TradeHistoryService();
      const formatAddress = (service as any).formatAddress.bind(service);

      expect(formatAddress('0x1234567890123456789012345678901234567890'))
        .toBe('0x1234…7890');
      
      expect(formatAddress('0x123')).toBe('0x123'); // Short address unchanged
      expect(formatAddress('')).toBe(''); // Empty address unchanged
    });
  });
});