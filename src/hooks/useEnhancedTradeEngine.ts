/**
 * Enhanced Trade Engine Hook - Улучшенный торговый движок с персистентностью
 * Интегрируется с TradeHistoryService и Web3 для полной функциональности
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { tradeHistoryService, TradeRecord, TraderStats } from '../services/TradeHistoryService';

interface UseEnhancedTradeEngineProps {
  userAddress?: string | null;
  toast: (type: string, message: string) => void;
}

interface Position {
  qty: number;
  buyPrice: number;
  lockUntil: number;
  level: number;
  onchainId?: number | null;
}

export function useEnhancedTradeEngine({ userAddress, toast }: UseEnhancedTradeEngineProps) {
  // Константы
  const TOTAL_SUPPLY = 1_000_000_000;
  const PARTS = 100;
  const LOCK_HOURS = 3;
  const HOURS = (h: number) => h * 60 * 60 * 1000;
  const now = () => Date.now();
  const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);

  // Состояние
  const [price] = useState(0.01);
  const [unlockedParts, setUnlockedParts] = useState(1);
  const [positions, setPositions] = useState<Position[]>([]);
  const [tradeHistory, setTradeHistory] = useState<TradeRecord[]>([]);
  const [todayBuys, setTodayBuys] = useState(0);
  const [todaySells, setTodaySells] = useState(0);
  const [lastDay, setLastDay] = useState(new Date().getDate());
  const [userStats, setUserStats] = useState<TraderStats | null>(null);
  const [globalLeaderboard, setGlobalLeaderboard] = useState<TraderStats[]>([]);
  const [loading, setLoading] = useState(false);

  // Загрузка данных пользователя при изменении адреса
  useEffect(() => {
    if (userAddress) {
      loadUserData();
    } else {
      // Очищаем данные если пользователь отключился
      setTradeHistory([]);
      setUserStats(null);
      setPositions([]);
    }
  }, [userAddress]);

  // Загрузка глобального рейтинга
  useEffect(() => {
    loadGlobalLeaderboard();
  }, []);

  // Сброс дневных лимитов
  useEffect(() => {
    const id = setInterval(() => {
      const d = new Date().getDate();
      if (d !== lastDay) {
        setTodayBuys(0);
        setTodaySells(0);
        setLastDay(d);
      }
    }, 15000);
    return () => clearInterval(id);
  }, [lastDay]);

  const loadUserData = useCallback(async () => {
    if (!userAddress) return;
    
    setLoading(true);
    try {
      const [history, stats] = await Promise.all([
        tradeHistoryService.getUserTradeHistory(userAddress),
        tradeHistoryService.getUserStats(userAddress)
      ]);
      
      setTradeHistory(history);
      setUserStats(stats);
      
      // Восстанавливаем позиции из истории (упрощенная логика)
      const openPositions = history
        .filter(record => record.type === 'buy')
        .slice(0, 10) // Ограничиваем количество позиций
        .map(record => ({
          qty: record.qty,
          buyPrice: record.price,
          lockUntil: record.time + HOURS(LOCK_HOURS),
          level: record.level,
          onchainId: record.onchainId || null,
        }));
      
      setPositions(openPositions);
    } catch (error) {
      console.error('Failed to load user data:', error);
      toast('error', 'Ошибка загрузки данных пользователя');
    } finally {
      setLoading(false);
    }
  }, [userAddress, toast]);

  const loadGlobalLeaderboard = useCallback(async () => {
    try {
      const leaderboard = await tradeHistoryService.getGlobalLeaderboard();
      setGlobalLeaderboard(leaderboard);
    } catch (error) {
      console.error('Failed to load global leaderboard:', error);
    }
  }, []);

  const buy = useCallback(async (usd: number, meta: { level?: number; onchainId?: number } = {}) => {
    if (!userAddress) {
      toast('error', 'Подключите кошелек для торговли');
      throw new Error('No wallet connected');
    }

    if (!(Number.isFinite(usd) && usd >= 20)) {
      toast('error', 'Минимальная покупка $20');
      throw new Error('Minimum purchase: $20');
    }

    if (todayBuys >= 2) {
      toast('error', 'Лимит покупок на сегодня: 2');
      throw new Error('Daily buy limit');
    }

    const qty = usd / price;
    const lockUntil = now() + HOURS(LOCK_HOURS);
    const level = typeof meta.level === 'number' 
      ? meta.level 
      : Math.floor(Math.random() * unlockedParts) + 1;
    const onchainId = typeof meta.onchainId === 'number' ? meta.onchainId : null;

    // Создаем новую позицию
    const newPosition: Position = {
      qty,
      buyPrice: price,
      lockUntil,
      level,
      onchainId,
    };

    // Создаем торговую запись
    const tradeRecord: Omit<TradeRecord, 'id'> = {
      type: 'buy',
      userAddress,
      amount: usd,
      price,
      qty,
      time: now(),
      level,
      onchainId,
    };

    try {
      // Сохраняем в историю
      await tradeHistoryService.addTradeRecord(tradeRecord);
      
      // Обновляем локальное состояние
      setPositions(arr => [...arr, newPosition]);
      setTradeHistory(h => [{ ...tradeRecord, id: `temp_${Date.now()}` }, ...h]);
      setTodayBuys(n => n + 1);
      setUnlockedParts(v => clamp(v + 1, 1, PARTS));
      
      // Обновляем статистику пользователя
      const updatedStats = await tradeHistoryService.getUserStats(userAddress);
      setUserStats(updatedStats);
      
      // Обновляем глобальный рейтинг
      await loadGlobalLeaderboard();
      
      toast('success', 'Сделка выполнена');
    } catch (error) {
      console.error('Failed to save trade:', error);
      toast('error', 'Ошибка сохранения сделки');
      throw error;
    }
  }, [userAddress, price, todayBuys, unlockedParts, toast, loadGlobalLeaderboard]);

  const sell = useCallback(async (idx: number) => {
    if (!userAddress) {
      toast('error', 'Подключите кошелек для торговли');
      throw new Error('No wallet connected');
    }

    const p = positions[idx];
    if (!p) return;

    if (now() < p.lockUntil) {
      toast('error', 'Лок ещё активен (3ч)');
      throw new Error('Locked');
    }

    if (todaySells >= 2) {
      toast('error', 'Лимит продаж на сегодня: 2');
      throw new Error('Daily sell limit');
    }

    // Расчет прибыли по лигам
    const getLeagueProfit = (buyPrice: number) => {
      if (buyPrice >= 0.01 && buyPrice < 0.1) return 0.1; // Silver
      if (buyPrice >= 0.1 && buyPrice < 1) return 0.075; // Gold
      return 0.05; // Diamond
    };

    const profitPct = getLeagueProfit(p.buyPrice);
    const sellPrice = p.buyPrice * (1 + profitPct);
    const gross = p.qty * sellPrice;
    const fee = gross * 0.015; // 1.5% платформенная комиссия
    const net = gross - fee;
    const buyCost = p.qty * p.buyPrice;
    const profit = net - buyCost;

    // Создаем торговую запись
    const tradeRecord: Omit<TradeRecord, 'id'> = {
      type: 'sell',
      userAddress,
      net,
      fee,
      price: sellPrice,
      qty: p.qty,
      time: now(),
      buyCost,
      profit,
      level: p.level,
      onchainId: p.onchainId,
    };

    try {
      // Сохраняем в историю
      await tradeHistoryService.addTradeRecord(tradeRecord);
      
      // Обновляем локальное состояние
      setPositions(arr => arr.filter((_, i) => i !== idx));
      setTradeHistory(h => [{ ...tradeRecord, id: `temp_${Date.now()}` }, ...h]);
      setTodaySells(n => n + 1);
      setUnlockedParts(v => clamp(v + 1, 1, PARTS));
      
      // Обновляем статистику пользователя
      const updatedStats = await tradeHistoryService.getUserStats(userAddress);
      setUserStats(updatedStats);
      
      // Обновляем глобальный рейтинг
      await loadGlobalLeaderboard();
      
      toast('success', 'Сделка выполнена');
    } catch (error) {
      console.error('Failed to save trade:', error);
      toast('error', 'Ошибка сохранения сделки');
      throw error;
    }
  }, [userAddress, positions, todaySells, toast, loadGlobalLeaderboard]);

  const clearUserData = useCallback(async () => {
    if (!userAddress) return;
    
    try {
      await tradeHistoryService.clearUserHistory(userAddress);
      setTradeHistory([]);
      setUserStats(null);
      setPositions([]);
      await loadGlobalLeaderboard();
      toast('success', 'История очищена');
    } catch (error) {
      console.error('Failed to clear user data:', error);
      toast('error', 'Ошибка очистки данных');
    }
  }, [userAddress, toast, loadGlobalLeaderboard]);

  const exportUserData = useCallback(async () => {
    if (!userAddress) return null;
    
    try {
      return await tradeHistoryService.exportUserData(userAddress);
    } catch (error) {
      console.error('Failed to export user data:', error);
      toast('error', 'Ошибка экспорта данных');
      return null;
    }
  }, [userAddress, toast]);

  const marketCap = useMemo(() => TOTAL_SUPPLY * price, [price]);

  return {
    // Основные данные
    price,
    unlockedParts,
    positions,
    tradeHistory,
    marketCap,
    userStats,
    globalLeaderboard,
    loading,
    
    // Действия
    buy,
    sell,
    clearUserData,
    exportUserData,
    refreshData: loadUserData,
    refreshLeaderboard: loadGlobalLeaderboard,
    
    // Статистика
    todayBuys,
    todaySells,
  };
}