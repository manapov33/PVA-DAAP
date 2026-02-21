/**
 * Transaction Status Indicator Component
 * Shows real-time transaction status with loading states and notifications
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TransactionStatus } from '../types/position';

interface TransactionStatusIndicatorProps {
  transactionStatus?: {
    hash: string;
    status: TransactionStatus;
    type: 'buy' | 'sell';
    userMessage?: string;
  } | null;
  className?: string;
}

export const TransactionStatusIndicator: React.FC<TransactionStatusIndicatorProps> = ({
  transactionStatus,
  className = ''
}) => {
  if (!transactionStatus) return null;

  const { status, type, userMessage, hash } = transactionStatus;

  const getStatusConfig = () => {
    switch (status) {
      case 'pending':
        return {
          color: 'text-blue-600 dark:text-blue-400',
          bgColor: 'bg-blue-50 dark:bg-blue-900/20',
          borderColor: 'border-blue-200 dark:border-blue-800',
          icon: '⏳',
          message: `${type === 'buy' ? 'Покупка' : 'Продажа'} в процессе...`,
          showSpinner: true
        };
      case 'confirmed':
        return {
          color: 'text-green-600 dark:text-green-400',
          bgColor: 'bg-green-50 dark:bg-green-900/20',
          borderColor: 'border-green-200 dark:border-green-800',
          icon: '✅',
          message: userMessage || `${type === 'buy' ? 'Покупка' : 'Продажа'} завершена!`,
          showSpinner: false
        };
      case 'failed':
        return {
          color: 'text-red-600 dark:text-red-400',
          bgColor: 'bg-red-50 dark:bg-red-900/20',
          borderColor: 'border-red-200 dark:border-red-800',
          icon: '❌',
          message: userMessage || `${type === 'buy' ? 'Покупка' : 'Продажа'} не удалась`,
          showSpinner: false
        };
      default:
        return null;
    }
  };

  const config = getStatusConfig();
  if (!config) return null;

  const shortHash = hash ? `${hash.slice(0, 6)}...${hash.slice(-4)}` : '';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.95 }}
        className={`
          rounded-xl border p-3 ${config.bgColor} ${config.borderColor} ${className}
        `}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">{config.icon}</span>
            {config.showSpinner && (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="w-4 h-4 border-2 border-current border-t-transparent rounded-full"
              />
            )}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className={`text-sm font-medium ${config.color}`}>
              {config.message}
            </div>
            {hash && (
              <div className="text-xs opacity-70 font-mono mt-1">
                Транзакция: {shortHash}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

// Компонент для отображения статуса синхронизации позиций
interface SyncStatusIndicatorProps {
  loading: boolean;
  error: string | null;
  lastSyncTime?: number;
  className?: string;
}

export const SyncStatusIndicator: React.FC<SyncStatusIndicatorProps> = ({
  loading,
  error,
  lastSyncTime,
  className = ''
}) => {
  const formatLastSync = (timestamp?: number) => {
    if (!timestamp) return 'Никогда';
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / (1000 * 60));
    
    if (minutes < 1) return 'Только что';
    if (minutes < 60) return `${minutes} мин назад`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} ч назад`;
    const days = Math.floor(hours / 24);
    return `${days} дн назад`;
  };

  if (error) {
    return (
      <div className={`
        flex items-center gap-2 px-3 py-2 rounded-lg 
        bg-red-50 dark:bg-red-900/20 
        border border-red-200 dark:border-red-800
        text-red-600 dark:text-red-400 text-sm
        ${className}
      `}>
        <span>⚠️</span>
        <span>Ошибка синхронизации</span>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={`
        flex items-center gap-2 px-3 py-2 rounded-lg 
        bg-blue-50 dark:bg-blue-900/20 
        border border-blue-200 dark:border-blue-800
        text-blue-600 dark:text-blue-400 text-sm
        ${className}
      `}>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-3 h-3 border border-current border-t-transparent rounded-full"
        />
        <span>Синхронизация...</span>
      </div>
    );
  }

  return (
    <div className={`
      flex items-center gap-2 px-3 py-2 rounded-lg 
      bg-green-50 dark:bg-green-900/20 
      border border-green-200 dark:border-green-800
      text-green-600 dark:text-green-400 text-sm
      ${className}
    `}>
      <span>✅</span>
      <span>Синхронизировано {formatLastSync(lastSyncTime)}</span>
    </div>
  );
};