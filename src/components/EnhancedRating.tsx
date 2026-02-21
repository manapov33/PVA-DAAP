/**
 * Enhanced Rating Component - Улучшенный рейтинг трейдеров
 * Показывает реальные данные с Web3 адресами и персистентностью
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TraderStats } from '../services/TradeHistoryService';

interface EnhancedRatingProps {
  globalLeaderboard: TraderStats[];
  userStats: TraderStats | null;
  userAddress?: string | null;
  onRefresh: () => void;
  loading?: boolean;
}

export const EnhancedRating = ({
  globalLeaderboard,
  userStats,
  userAddress,
  onRefresh,
  loading = false,
}: EnhancedRatingProps) => {
  const [filter, setFilter] = useState<'all' | 'profit' | 'volume' | 'trades'>('profit');
  const [showUserOnly, setShowUserOnly] = useState(false);

  const formatUSD = (n: number) =>
    `$${Number(n || 0).toLocaleString(undefined, {
      maximumFractionDigits: 2,
    })}`;

  const formatTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 60000) return 'Только что';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} мин назад`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} ч назад`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)} дн назад`;
    
    return new Date(timestamp).toLocaleDateString();
  };

  const getSortedData = () => {
    let data = [...globalLeaderboard];
    
    // Фильтрация по пользователю
    if (showUserOnly && userAddress) {
      data = data.filter(trader => 
        trader.address.toLowerCase() === userAddress.toLowerCase()
      );
    }
    
    // Сортировка
    switch (filter) {
      case 'profit':
        return data.sort((a, b) => b.profit - a.profit);
      case 'volume':
        return data.sort((a, b) => b.volume - a.volume);
      case 'trades':
        return data.sort((a, b) => b.trades - a.trades);
      default:
        return data.sort((a, b) => b.profit - a.profit);
    }
  };

  const sortedData = getSortedData();
  const userRank = userAddress && userStats 
    ? globalLeaderboard.findIndex(trader => 
        trader.address.toLowerCase() === userAddress.toLowerCase()
      ) + 1
    : null;

  return (
    <div className="p-4 space-y-4">
      {/* Заголовок и управление */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Рейтинг трейдеров</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {globalLeaderboard.length} активных трейдеров
          </p>
        </div>
        
        <button
          onClick={onRefresh}
          disabled={loading}
          className="p-2 rounded-lg border hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors disabled:opacity-50"
          title="Обновить рейтинг"
        >
          <svg 
            className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Статистика пользователя */}
      {userStats && userAddress && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl"
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-blue-700 dark:text-blue-300">
              Ваша статистика
            </h3>
            {userRank && (
              <span className="px-2 py-1 bg-blue-500 text-white text-xs rounded-full">
                #{userRank}
              </span>
            )}
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <div className="text-gray-600 dark:text-gray-400">Прибыль</div>
              <div className="font-semibold text-blue-700 dark:text-blue-300">
                {formatUSD(userStats.profit)}
              </div>
            </div>
            <div>
              <div className="text-gray-600 dark:text-gray-400">Объем</div>
              <div className="font-semibold">
                {formatUSD(userStats.volume)}
              </div>
            </div>
            <div>
              <div className="text-gray-600 dark:text-gray-400">Сделок</div>
              <div className="font-semibold">{userStats.trades}</div>
            </div>
            <div>
              <div className="text-gray-600 dark:text-gray-400">Последняя</div>
              <div className="font-semibold text-xs">
                {formatTime(userStats.lastTradeTime)}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Фильтры */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-neutral-800 rounded-lg p-1">
          {[
            { key: 'profit', label: 'Прибыль' },
            { key: 'volume', label: 'Объем' },
            { key: 'trades', label: 'Сделки' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key as 'profit' | 'volume' | 'trades')}
              className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                filter === key
                  ? 'bg-black text-white dark:bg-white dark:text-black'
                  : 'hover:bg-gray-200 dark:hover:bg-neutral-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {userAddress && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showUserOnly}
              onChange={(e) => setShowUserOnly(e.target.checked)}
              className="rounded"
            />
            Только мои данные
          </label>
        )}
      </div>

      {/* Таблица рейтинга */}
      <div className="rounded-xl border overflow-hidden bg-white dark:bg-neutral-900">
        {/* Заголовок таблицы */}
        <div className="grid grid-cols-6 gap-4 p-3 bg-gray-50 dark:bg-neutral-800 text-sm font-semibold border-b">
          <div>#</div>
          <div>Трейдер</div>
          <div className="text-center">Сделок</div>
          <div className="text-right">Прибыль</div>
          <div className="text-right">Объем</div>
          <div className="text-right">Активность</div>
        </div>

        {/* Данные */}
        <div className="max-h-96 overflow-auto">
          <AnimatePresence initial={false}>
            {sortedData.length === 0 ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                {loading ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                    Загрузка...
                  </div>
                ) : showUserOnly ? (
                  'У вас пока нет торговых данных'
                ) : (
                  'Нет данных о трейдерах'
                )}
              </div>
            ) : (
              sortedData.map((trader, index) => {
                const isCurrentUser = userAddress && 
                  trader.address.toLowerCase() === userAddress.toLowerCase();
                
                return (
                  <motion.div
                    key={trader.address}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ delay: index * 0.05 }}
                    className={`grid grid-cols-6 gap-4 p-3 text-sm border-b border-gray-100 dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition-colors ${
                      isCurrentUser ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`font-semibold ${
                        index === 0 ? 'text-yellow-600' :
                        index === 1 ? 'text-gray-500' :
                        index === 2 ? 'text-amber-600' : ''
                      }`}>
                        {index + 1}
                      </span>
                      {isCurrentUser && (
                        <span className="w-2 h-2 bg-blue-500 rounded-full" />
                      )}
                    </div>
                    
                    <div className="font-mono text-xs">
                      {trader.displayName}
                      {isCurrentUser && (
                        <span className="ml-2 text-blue-600 dark:text-blue-400 font-normal">
                          (Вы)
                        </span>
                      )}
                    </div>
                    
                    <div className="text-center">{trader.trades}</div>
                    
                    <div className={`text-right font-semibold ${
                      trader.profit > 0 ? 'text-green-600' : 
                      trader.profit < 0 ? 'text-red-600' : ''
                    }`}>
                      {formatUSD(trader.profit)}
                    </div>
                    
                    <div className="text-right">
                      {formatUSD(trader.volume)}
                    </div>
                    
                    <div className="text-right text-xs text-gray-500">
                      {formatTime(trader.lastTradeTime)}
                    </div>
                  </motion.div>
                );
              })
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Информация */}
      <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
        Данные обновляются в реальном времени • Показаны топ-100 трейдеров
      </div>
    </div>
  );
};