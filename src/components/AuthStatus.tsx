/**
 * Auth Status Component - Visual indicators for user authentication status
 * Shows connection status, wallet info, and quick actions
 */

import React from 'react';

interface AuthStatusProps {
  connected: boolean;
  address?: string | null;
  usdtBalance?: string;
  usdtSymbol?: string;
  loading?: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  compact?: boolean;
}

export const AuthStatus = ({
  connected,
  address,
  usdtBalance = "0",
  usdtSymbol = "USDT",
  loading = false,
  onConnect,
  onDisconnect,
  compact = false,
}: AuthStatusProps) => {
  const shortAddr = (addr: string) => 
    addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "";

  if (loading) {
    return (
      <div className={`flex items-center gap-2 ${compact ? 'text-xs' : 'text-sm'}`}>
        <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
        <span className="text-yellow-600 dark:text-yellow-400">
          Подключение...
        </span>
      </div>
    );
  }

  if (!connected) {
    return (
      <div className={`flex items-center gap-2 ${compact ? 'text-xs' : 'text-sm'}`}>
        <div className="w-2 h-2 bg-red-500 rounded-full" />
        <span className="text-gray-600 dark:text-gray-400">
          Не подключен
        </span>
        {!compact && (
          <button
            onClick={onConnect}
            className="ml-2 px-3 py-1 bg-blue-500 text-white rounded-lg text-xs hover:bg-blue-600 transition-colors"
          >
            Подключить
          </button>
        )}
      </div>
    );
  }

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <div className="w-2 h-2 bg-green-500 rounded-full" />
        <span className="font-mono text-gray-700 dark:text-gray-300">
          {shortAddr(address || "")}
        </span>
        <span className="text-gray-500">•</span>
        <span className="text-gray-600 dark:text-gray-400">
          {usdtBalance} {usdtSymbol}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
        <div className="flex flex-col">
          <span className="text-sm font-medium text-green-700 dark:text-green-300">
            Подключен
          </span>
          <span className="text-xs font-mono text-green-600 dark:text-green-400">
            {shortAddr(address || "")}
          </span>
        </div>
      </div>
      
      <div className="flex items-center gap-2 ml-auto">
        <div className="text-right">
          <div className="text-xs text-gray-500">Баланс</div>
          <div className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            {usdtBalance} {usdtSymbol}
          </div>
        </div>
        
        <button
          onClick={onDisconnect}
          className="px-2 py-1 text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors"
          title="Отключить кошелек"
        >
          ✕
        </button>
      </div>
    </div>
  );
};

/**
 * Header Auth Badge - Compact status indicator for header
 */
export const HeaderAuthBadge = ({
  connected,
  address,
  loading,
  onClick,
}: {
  connected: boolean;
  address?: string | null;
  loading?: boolean;
  onClick: () => void;
}) => {
  const shortAddr = (addr: string) => 
    addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "";

  if (loading) {
    return (
      <button
        onClick={onClick}
        className="flex items-center gap-2 px-3 py-1.5 border rounded-xl text-sm hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors"
      >
        <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
        <span>Подключение...</span>
      </button>
    );
  }

  if (!connected) {
    return (
      <button
        onClick={onClick}
        className="flex items-center gap-2 px-3 py-1.5 border rounded-xl text-sm hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors"
      >
        <div className="w-2 h-2 bg-red-500 rounded-full" />
        <span>Подключить кошелек</span>
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-1.5 border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20 rounded-xl text-sm hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
    >
      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
      <span className="font-mono text-green-700 dark:text-green-300">
        {shortAddr(address || "")}
      </span>
    </button>
  );
};

/**
 * Floating Auth Status - Persistent status indicator
 */
export const FloatingAuthStatus = ({
  connected,
  address,
  usdtBalance,
  usdtSymbol,
  loading,
  onToggle,
}: {
  connected: boolean;
  address?: string | null;
  usdtBalance?: string;
  usdtSymbol?: string;
  loading?: boolean;
  onToggle: () => void;
}) => {
  const shortAddr = (addr: string) => 
    addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "";

  if (!connected && !loading) {
    return null; // Don't show floating status when not connected
  }

  return (
    <button
      onClick={onToggle}
      className="fixed top-4 right-4 z-40 flex items-center gap-2 px-3 py-2 bg-white/90 dark:bg-neutral-900/90 backdrop-blur border border-gray-200 dark:border-neutral-700 rounded-full shadow-lg hover:shadow-xl transition-all"
    >
      {loading ? (
        <>
          <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
          <span className="text-xs text-yellow-600 dark:text-yellow-400">
            Подключение...
          </span>
        </>
      ) : connected ? (
        <>
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <div className="flex flex-col items-start">
            <span className="text-xs font-mono text-gray-700 dark:text-gray-300">
              {shortAddr(address || "")}
            </span>
            <span className="text-xs text-gray-500">
              {usdtBalance} {usdtSymbol}
            </span>
          </div>
        </>
      ) : null}
    </button>
  );
};

/**
 * Connection Status Toast - Temporary notification for connection changes
 */
export const ConnectionStatusToast = ({
  show,
  connected,
  address,
  onClose,
}: {
  show: boolean;
  connected: boolean;
  address?: string | null;
  onClose: () => void;
}) => {
  const shortAddr = (addr: string) => 
    addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "";

  React.useEffect(() => {
    if (show) {
      const timer = setTimeout(onClose, 3000); // Auto-close after 3 seconds
      return () => clearTimeout(timer);
    }
  }, [show, onClose]);

  if (!show) return null;

  return (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-lg shadow-lg">
      {connected ? (
        <>
          <div className="w-3 h-3 bg-green-500 rounded-full" />
          <div>
            <div className="text-sm font-medium text-green-700 dark:text-green-300">
              Кошелек подключен
            </div>
            <div className="text-xs font-mono text-gray-600 dark:text-gray-400">
              {shortAddr(address || "")}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="w-3 h-3 bg-red-500 rounded-full" />
          <div className="text-sm font-medium text-red-700 dark:text-red-300">
            Кошелек отключен
          </div>
        </>
      )}
      
      <button
        onClick={onClose}
        className="ml-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
      >
        ✕
      </button>
    </div>
  );
};