/**
 * Auth Status Card - Detailed authentication status display
 * Shows comprehensive wallet and connection information
 */

import React from 'react';

interface AuthStatusCardProps {
  connected: boolean;
  address?: string | null;
  usdtBalance?: string;
  usdtSymbol?: string;
  chainId?: string | null;
  loading?: boolean;
  error?: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
  onRefreshBalance?: () => void;
  compact?: boolean;
}

export const AuthStatusCard = ({
  connected,
  address,
  usdtBalance = "0",
  usdtSymbol = "USDT",
  chainId,
  loading = false,
  error = null,
  onConnect,
  onDisconnect,
  onRefreshBalance,
  compact = false,
}: AuthStatusCardProps) => {
  const shortAddr = (addr: string) => 
    addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "";

  const getNetworkName = (id?: string | null) => {
    if (!id) return 'Неизвестно';
    
    switch (id) {
      case '8453':
      case '0x2105':
        return 'Base Mainnet';
      case '84532':
      case '0x14a34':
        return 'Base Sepolia';
      case '1':
      case '0x1':
        return 'Ethereum Mainnet';
      default:
        return `Сеть ${id}`;
    }
  };

  const isCorrectNetwork = chainId === '8453' || chainId === '0x2105';

  if (compact) {
    return (
      <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${
              loading ? 'bg-yellow-500 animate-pulse' :
              connected ? 'bg-green-500' : 'bg-red-500'
            }`} />
            <span className="text-sm font-medium">
              {loading ? 'Подключение...' : 
               connected ? 'Подключен' : 'Не подключен'}
            </span>
          </div>
          
          {connected ? (
            <button
              onClick={onDisconnect}
              className="text-xs text-red-600 hover:text-red-700 dark:text-red-400"
            >
              Отключить
            </button>
          ) : (
            <button
              onClick={onConnect}
              className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400"
            >
              Подключить
            </button>
          )}
        </div>
        
        {connected && address && (
          <div className="mt-2 text-xs text-gray-600 dark:text-gray-400 font-mono">
            {shortAddr(address)}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Статус кошелька</h3>
        
        {connected && onRefreshBalance && (
          <button
            onClick={onRefreshBalance}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            title="Обновить баланс"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        )}
      </div>

      {/* Error State */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-red-500 rounded-full" />
            <span className="text-sm text-red-700 dark:text-red-300">
              Ошибка: {error}
            </span>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            <span className="text-sm text-blue-700 dark:text-blue-300">
              Подключение к кошельку...
            </span>
          </div>
        </div>
      )}

      {/* Not Connected State */}
      {!connected && !loading && (
        <div className="space-y-4">
          <div className="p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 bg-red-500 rounded-full" />
              <span className="text-sm font-medium text-red-700 dark:text-red-300">
                Кошелек не подключен
              </span>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Подключите Web3 кошелек для доступа к торговым функциям
            </p>
          </div>
          
          <button
            onClick={onConnect}
            className="w-full py-2 px-4 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            Подключить кошелек
          </button>
        </div>
      )}

      {/* Connected State */}
      {connected && address && (
        <div className="space-y-4">
          {/* Connection Status */}
          <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
              <span className="text-sm font-medium text-green-700 dark:text-green-300">
                Кошелек подключен
              </span>
            </div>
            
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Адрес:</span>
                <span className="font-mono text-gray-700 dark:text-gray-300">
                  {shortAddr(address)}
                </span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Сеть:</span>
                <span className={`font-medium ${
                  isCorrectNetwork 
                    ? 'text-green-600 dark:text-green-400' 
                    : 'text-red-600 dark:text-red-400'
                }`}>
                  {getNetworkName(chainId)}
                </span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Баланс:</span>
                <span className="font-semibold text-gray-700 dark:text-gray-300">
                  {usdtBalance} {usdtSymbol}
                </span>
              </div>
            </div>
          </div>

          {/* Network Warning */}
          {!isCorrectNetwork && (
            <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 bg-yellow-500 rounded-full" />
                <span className="text-sm font-medium text-yellow-700 dark:text-yellow-300">
                  Неправильная сеть
                </span>
              </div>
              <p className="text-xs text-yellow-600 dark:text-yellow-400">
                Переключитесь на Base Network для корректной работы
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={() => navigator.clipboard.writeText(address)}
              className="flex-1 py-2 px-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-sm"
            >
              Копировать адрес
            </button>
            
            <button
              onClick={onDisconnect}
              className="py-2 px-3 bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/30 transition-colors text-sm"
            >
              Отключить
            </button>
          </div>
        </div>
      )}
    </div>
  );
};