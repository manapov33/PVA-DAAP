/**
 * Integrated Position Engine Hook - Интеграция Position Manager с UI
 * Объединяет usePositionManager с существующим интерфейсом для плавной миграции
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { ethers } from 'ethers';
import { usePositionManager } from './usePositionManager';
import { Position } from '../types/position';

interface UseIntegratedPositionEngineProps {
  userAddress?: string | null;
  provider?: ethers.Provider;
  contractAddress?: string;
  toast: (type: string, message: string) => void;
}

interface LegacyPosition {
  qty: number;
  buyPrice: number;
  lockUntil: number;
  level: number;
  onchainId?: number | null;
}

interface TradeHistoryEntry {
  type: 'buy' | 'sell';
  amount?: number;
  net?: number;
  fee?: number;
  price: number;
  qty: number;
  time: number;
  level: number;
  onchainId?: number | null;
  buyCost?: number;
  profit?: number;
}

export function useIntegratedPositionEngine({
  userAddress,
  provider,
  contractAddress,
  toast
}: UseIntegratedPositionEngineProps) {
  // Константы
  const TOTAL_SUPPLY = 1_000_000_000;
  const PARTS = 100;
  const LOCK_HOURS = 3;
  const HOURS = (h: number) => h * 60 * 60 * 1000;
  const now = () => Date.now();
  const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);

  // Используем новый Position Manager
  const positionManager = usePositionManager(userAddress, provider, contractAddress);

  // Локальное состояние для совместимости с существующим UI
  const [price] = useState(0.01);
  const [unlockedParts, setUnlockedParts] = useState(1);
  const [tradeHistory, setTradeHistory] = useState<TradeHistoryEntry[]>([]);
  const [todayBuys, setTodayBuys] = useState(0);
  const [todaySells, setTodaySells] = useState(0);
  const [lastDay, setLastDay] = useState(new Date().getDate());

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

  // Конвертация позиций из нового формата в старый для совместимости
  const legacyPositions: LegacyPosition[] = useMemo(() => {
    return positionManager.positions.map(position => ({
      qty: Number(position.amountTokens) / 1e18, // Конвертируем из wei
      buyPrice: Number(position.buyPrice) / 1e18, // Конвертируем из wei
      lockUntil: position.unlockAt * 1000, // Конвертируем в миллисекунды
      level: position.partId,
      onchainId: position.onChainId,
    }));
  }, [positionManager.positions]);

  // Функция покупки с интеграцией Position Manager
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

    try {
      // Используем Position Manager для покупки
      const txHash = await positionManager.buyTokens(usd);
      
      // Обновляем локальную статистику
      const qty = usd / price;
      const level = typeof meta.level === 'number' 
        ? meta.level 
        : Math.floor(Math.random() * unlockedParts) + 1;

      const tradeRecord: TradeHistoryEntry = {
        type: 'buy',
        amount: usd,
        price,
        qty,
        time: now(),
        level,
        onchainId: meta.onchainId,
      };

      setTradeHistory(h => [tradeRecord, ...h]);
      setTodayBuys(n => n + 1);
      setUnlockedParts(v => clamp(v + 1, 1, PARTS));

      return txHash;
    } catch (error) {
      console.error('Buy failed:', error);
      throw error;
    }
  }, [userAddress, price, todayBuys, unlockedParts, toast, positionManager]);

  // Функция продажи с интеграцией Position Manager
  const sell = useCallback(async (idx: number) => {
    if (!userAddress) {
      toast('error', 'Подключите кошелек для торговли');
      throw new Error('No wallet connected');
    }

    const position = positionManager.positions[idx];
    if (!position) return;

    if (now() < position.unlockAt * 1000) {
      toast('error', 'Лок ещё активен (3ч)');
      throw new Error('Locked');
    }

    if (todaySells >= 2) {
      toast('error', 'Лимит продаж на сегодня: 2');
      throw new Error('Daily sell limit');
    }

    try {
      // Используем Position Manager для продажи
      await positionManager.sellPosition(position.id);

      // Обновляем локальную статистику
      const buyPrice = Number(position.buyPrice) / 1e18;
      const qty = Number(position.amountTokens) / 1e18;
      
      // Расчет прибыли по лигам
      const getLeagueProfit = (buyPrice: number) => {
        if (buyPrice >= 0.01 && buyPrice < 0.1) return 0.1; // Silver
        if (buyPrice >= 0.1 && buyPrice < 1) return 0.075; // Gold
        return 0.05; // Diamond
      };

      const profitPct = getLeagueProfit(buyPrice);
      const sellPrice = buyPrice * (1 + profitPct);
      const gross = qty * sellPrice;
      const fee = gross * 0.015; // 1.5% платформенная комиссия
      const net = gross - fee;
      const buyCost = qty * buyPrice;
      const profit = net - buyCost;

      const tradeRecord: TradeHistoryEntry = {
        type: 'sell',
        net,
        fee,
        price: sellPrice,
        qty,
        time: now(),
        buyCost,
        profit,
        level: position.partId,
        onchainId: position.onChainId,
      };

      setTradeHistory(h => [tradeRecord, ...h]);
      setTodaySells(n => n + 1);
      setUnlockedParts(v => clamp(v + 1, 1, PARTS));
    } catch (error) {
      console.error('Sell failed:', error);
      throw error;
    }
  }, [userAddress, todaySells, toast, positionManager]);

  const marketCap = useMemo(() => TOTAL_SUPPLY * price, [price]);

  return {
    // Данные для совместимости с существующим UI
    price,
    unlockedParts,
    positions: legacyPositions,
    tradeHistory,
    marketCap,
    
    // Действия
    buy,
    sell,
    
    // Статистика
    todayBuys,
    todaySells,
    
    // Новые данные из Position Manager
    loading: positionManager.loading,
    error: positionManager.error,
    transactionStatus: positionManager.transactionStatus,
    refreshPositions: positionManager.refreshPositions,
    
    // Прямой доступ к Position Manager для расширенной функциональности
    positionManager,
  };
}