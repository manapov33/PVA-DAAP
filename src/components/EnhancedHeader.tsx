/**
 * Enhanced Header Component - Header with integrated auth status
 * Replaces the basic Header with better UX and auth indicators
 */

import React from 'react';
import { HeaderAuthBadge } from './AuthStatus';

interface EnhancedHeaderProps {
  // Navigation handlers
  onRating: () => void;
  onWallet: () => void;
  onSettings: () => void;
  
  // Auth status
  connected: boolean;
  address?: string | null;
  loading?: boolean;
  
  // Optional features
  showNetworkStatus?: boolean;
  showSyncStatus?: boolean;
  syncInProgress?: boolean;
  lastSyncTime?: number;
}

export const EnhancedHeader = ({
  onRating,
  onWallet,
  onSettings,
  connected,
  address,
  loading = false,
  showNetworkStatus = true,
  showSyncStatus = false,
  syncInProgress = false,
  lastSyncTime,
}: EnhancedHeaderProps) => {
  const formatLastSync = (timestamp?: number) => {
    if (!timestamp) return 'Никогда';
    
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 60000) return 'Только что';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} мин назад`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} ч назад`;
    return new Date(timestamp).toLocaleDateString();
  };

  return (
    <div className="sticky top-0 z-30 bg-white/80 dark:bg-neutral-900/80 backdrop-blur border-b border-gray-200 dark:border-neutral-800">
      {/* Main Header */}
      <div className="flex items-center justify-between p-4">
        {/* Logo and Title */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl border border-gray-300 dark:border-neutral-600 flex items-center justify-center text-sm font-bold bg-gradient-to-br from-blue-500 to-purple-600 text-white">
            PV
          </div>
          <div>
            <div className="text-xl font-semibold">PVA Аукцион</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Decentralized Trading Platform
            </div>
          </div>
        </div>

        {/* Auth Status and Navigation */}
        <div className="flex items-center gap-3">
          {/* Sync Status (if enabled) */}
          {showSyncStatus && connected && (
            <div className="hidden md:flex items-center gap-2 px-2 py-1 bg-gray-100 dark:bg-neutral-800 rounded-lg">
              <div className={`w-2 h-2 rounded-full ${
                syncInProgress 
                  ? 'bg-blue-500 animate-pulse' 
                  : 'bg-green-500'
              }`} />
              <span className="text-xs text-gray-600 dark:text-gray-400">
                {syncInProgress ? 'Синхронизация...' : `Синх: ${formatLastSync(lastSyncTime)}`}
              </span>
            </div>
          )}

          {/* Network Status (if enabled) */}
          {showNetworkStatus && connected && (
            <div className="hidden sm:flex items-center gap-2 px-2 py-1 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <div className="w-2 h-2 bg-blue-500 rounded-full" />
              <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                Base Network
              </span>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={onRating}
              className="px-3 py-1.5 border rounded-xl text-sm hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors"
            >
              Рейтинг
            </button>
            
            <button
              onClick={onSettings}
              className="px-3 py-1.5 border rounded-xl text-sm hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors"
            >
              Настройки
            </button>

            {/* Auth Status Badge */}
            <HeaderAuthBadge
              connected={connected}
              address={address}
              loading={loading}
              onClick={onWallet}
            />
          </div>
        </div>
      </div>

      {/* Status Bar (mobile-friendly) */}
      {connected && (
        <div className="px-4 pb-2 flex items-center justify-between text-xs">
          <div className="flex items-center gap-4">
            {/* Mobile Network Status */}
            <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
              <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
              <span>Base Network</span>
            </div>

            {/* Mobile Sync Status */}
            {showSyncStatus && (
              <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
                <div className={`w-1.5 h-1.5 rounded-full ${
                  syncInProgress 
                    ? 'bg-blue-500 animate-pulse' 
                    : 'bg-green-500'
                }`} />
                <span>
                  {syncInProgress ? 'Синхронизация...' : `Обновлено: ${formatLastSync(lastSyncTime)}`}
                </span>
              </div>
            )}
          </div>

          {/* Connection Quality Indicator */}
          <div className="flex items-center gap-1">
            <div className="flex gap-0.5">
              <div className="w-1 h-2 bg-green-500 rounded-sm" />
              <div className="w-1 h-3 bg-green-500 rounded-sm" />
              <div className="w-1 h-4 bg-green-500 rounded-sm" />
            </div>
            <span className="text-green-600 dark:text-green-400 ml-1">
              Отлично
            </span>
          </div>
        </div>
      )}

      {/* Disconnected State Banner */}
      {!connected && !loading && (
        <div className="px-4 pb-2">
          <div className="flex items-center justify-between p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-yellow-500 rounded-full" />
              <span className="text-sm text-yellow-700 dark:text-yellow-300">
                Подключите кошелек для полного доступа к функциям
              </span>
            </div>
            <button
              onClick={onWallet}
              className="px-3 py-1 bg-yellow-500 text-white rounded-lg text-xs hover:bg-yellow-600 transition-colors"
            >
              Подключить
            </button>
          </div>
        </div>
      )}

      {/* Loading State Banner */}
      {loading && (
        <div className="px-4 pb-2">
          <div className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            <span className="text-sm text-blue-700 dark:text-blue-300">
              Подключение к кошельку...
            </span>
          </div>
        </div>
      )}
    </div>
  );
};