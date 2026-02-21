/**
 * Trade History Service - Управление историей торгов и рейтингом трейдеров
 * Обеспечивает персистентность данных и связь с Web3 адресами
 */

import { EnhancedLocalStorageCache } from './EnhancedLocalStorageCache';

export interface TradeRecord {
  id: string;
  type: 'buy' | 'sell';
  userAddress: string;
  amount?: number;        // для покупок
  net?: number;          // для продаж
  fee?: number;          // комиссия
  price: number;
  qty: number;
  time: number;
  level: number;
  profit?: number;       // прибыль от продажи
  buyCost?: number;      // стоимость покупки
  onchainId?: number | null;
}

export interface TraderStats {
  address: string;
  displayName: string;   // сокращенный адрес
  profit: number;
  volume: number;
  trades: number;
  lastTradeTime: number;
}

export interface GlobalLeaderboard {
  traders: TraderStats[];
  lastUpdated: number;
}

export class TradeHistoryService {
  private cache: EnhancedLocalStorageCache;
  private readonly TRADE_HISTORY_KEY = 'trade_history';
  private readonly GLOBAL_LEADERBOARD_KEY = 'global_leaderboard';
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 минут

  constructor() {
    this.cache = new EnhancedLocalStorageCache();
  }

  /**
   * Добавить новую торговую запись
   */
  async addTradeRecord(record: Omit<TradeRecord, 'id'>): Promise<void> {
    const tradeRecord: TradeRecord = {
      ...record,
      id: this.generateTradeId(),
    };

    // Получаем существующую историю
    const history = await this.getUserTradeHistory(record.userAddress);
    
    // Добавляем новую запись
    const updatedHistory = [tradeRecord, ...history];
    
    // Сохраняем обновленную историю
    const key = this.getUserHistoryKey(record.userAddress);
    await this.cache.set(key, updatedHistory);

    // Обновляем глобальный рейтинг
    await this.updateGlobalLeaderboard(record.userAddress, tradeRecord);
  }

  /**
   * Получить историю торгов пользователя
   */
  async getUserTradeHistory(userAddress: string): Promise<TradeRecord[]> {
    if (!userAddress) return [];
    
    const key = this.getUserHistoryKey(userAddress);
    const history = await this.cache.get<TradeRecord[]>(key);
    return history || [];
  }

  /**
   * Получить статистику пользователя
   */
  async getUserStats(userAddress: string): Promise<TraderStats | null> {
    if (!userAddress) return null;

    const history = await this.getUserTradeHistory(userAddress);
    if (history.length === 0) return null;

    return this.calculateTraderStats(userAddress, history);
  }

  /**
   * Получить глобальный рейтинг трейдеров
   */
  async getGlobalLeaderboard(): Promise<TraderStats[]> {
    const leaderboard = await this.cache.get<GlobalLeaderboard>(this.GLOBAL_LEADERBOARD_KEY);
    
    if (!leaderboard || this.isLeaderboardExpired(leaderboard)) {
      return this.getFallbackLeaderboard();
    }

    return leaderboard.traders;
  }

  /**
   * Очистить историю пользователя
   */
  async clearUserHistory(userAddress: string): Promise<void> {
    if (!userAddress) return;
    
    const key = this.getUserHistoryKey(userAddress);
    await this.cache.remove(key);
    
    // Обновляем глобальный рейтинг
    await this.rebuildGlobalLeaderboard();
  }

  /**
   * Получить топ трейдеров по прибыли
   */
  async getTopTraders(limit: number = 10): Promise<TraderStats[]> {
    const leaderboard = await this.getGlobalLeaderboard();
    return leaderboard
      .sort((a, b) => b.profit - a.profit)
      .slice(0, limit);
  }

  /**
   * Экспорт данных пользователя
   */
  async exportUserData(userAddress: string): Promise<{
    history: TradeRecord[];
    stats: TraderStats | null;
  }> {
    const [history, stats] = await Promise.all([
      this.getUserTradeHistory(userAddress),
      this.getUserStats(userAddress)
    ]);

    return { history, stats };
  }

  // Приватные методы

  private generateTradeId(): string {
    return `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getUserHistoryKey(userAddress: string): string {
    return `${this.TRADE_HISTORY_KEY}_${userAddress.toLowerCase()}`;
  }

  private calculateTraderStats(address: string, history: TradeRecord[]): TraderStats {
    let profit = 0;
    let volume = 0;
    let trades = history.length;
    let lastTradeTime = 0;

    for (const record of history) {
      if (record.type === 'buy') {
        volume += record.amount || 0;
      } else if (record.type === 'sell') {
        volume += record.net || 0;
        profit += record.profit || 0;
      }
      
      if (record.time > lastTradeTime) {
        lastTradeTime = record.time;
      }
    }

    return {
      address,
      displayName: this.formatAddress(address),
      profit,
      volume,
      trades,
      lastTradeTime,
    };
  }

  private formatAddress(address: string): string {
    if (!address || address.length < 10) return address;
    return `${address.slice(0, 6)}…${address.slice(-4)}`;
  }

  private async updateGlobalLeaderboard(userAddress: string, newRecord: TradeRecord): Promise<void> {
    try {
      const leaderboard = await this.cache.get<GlobalLeaderboard>(this.GLOBAL_LEADERBOARD_KEY) || {
        traders: [],
        lastUpdated: 0
      };

      // Находим или создаем запись трейдера
      let traderIndex = leaderboard.traders.findIndex(t => t.address.toLowerCase() === userAddress.toLowerCase());
      
      if (traderIndex === -1) {
        // Новый трейдер
        const userHistory = await this.getUserTradeHistory(userAddress);
        const stats = this.calculateTraderStats(userAddress, userHistory);
        leaderboard.traders.push(stats);
      } else {
        // Обновляем существующего трейдера
        const userHistory = await this.getUserTradeHistory(userAddress);
        leaderboard.traders[traderIndex] = this.calculateTraderStats(userAddress, userHistory);
      }

      // Сортируем по прибыли и ограничиваем количество
      leaderboard.traders = leaderboard.traders
        .sort((a, b) => b.profit - a.profit)
        .slice(0, 100); // Храним топ-100

      leaderboard.lastUpdated = Date.now();

      await this.cache.set(this.GLOBAL_LEADERBOARD_KEY, leaderboard);
    } catch (error) {
      console.warn('Failed to update global leaderboard:', error);
    }
  }

  private async rebuildGlobalLeaderboard(): Promise<void> {
    // Эта функция может быть расширена для полной перестройки рейтинга
    // из всех пользовательских данных в localStorage
    const emptyLeaderboard: GlobalLeaderboard = {
      traders: [],
      lastUpdated: Date.now()
    };
    
    await this.cache.set(this.GLOBAL_LEADERBOARD_KEY, emptyLeaderboard);
  }

  private isLeaderboardExpired(leaderboard: GlobalLeaderboard): boolean {
    return Date.now() - leaderboard.lastUpdated > this.CACHE_DURATION;
  }

  private getFallbackLeaderboard(): TraderStats[] {
    // Возвращаем демо-данные, если нет реальных
    return [
      {
        address: '0x1234567890123456789012345678901234567890',
        displayName: '0x1234…7890',
        profit: 1234.56,
        volume: 25000,
        trades: 14,
        lastTradeTime: Date.now() - 3600000, // 1 час назад
      },
      {
        address: '0x2345678901234567890123456789012345678901',
        displayName: '0x2345…8901',
        profit: 987.12,
        volume: 20000,
        trades: 12,
        lastTradeTime: Date.now() - 7200000, // 2 часа назад
      },
      {
        address: '0x3456789012345678901234567890123456789012',
        displayName: '0x3456…9012',
        profit: 650.0,
        volume: 15000,
        trades: 10,
        lastTradeTime: Date.now() - 10800000, // 3 часа назад
      },
    ];
  }
}

// Экспортируем singleton instance
export const tradeHistoryService = new TradeHistoryService();