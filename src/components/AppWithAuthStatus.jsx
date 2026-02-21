/**
 * Enhanced App Component with Auth Status Integration
 * Example of how to integrate the new auth status components
 */

import React, { useState, useEffect } from 'react';
import { EnhancedHeader } from './EnhancedHeader';
import { AuthStatusCard } from './AuthStatusCard';
import { FloatingAuthStatus, ConnectionStatusToast } from './AuthStatus';

// This is an example of how to integrate the auth status components
// Replace the existing Header and add auth status indicators

export function AppWithAuthStatus() {
  // Existing web3 state (from useWeb3 hook)
  const [connected, setConnected] = useState(false);
  const [address, setAddress] = useState(null);
  const [loading, setLoading] = useState(false);
  const [usdtBalance, setUsdtBalance] = useState("0");
  const [usdtSymbol, setUsdtSymbol] = useState("USDT");
  const [chainId, setChainId] = useState(null);
  const [error, setError] = useState(null);

  // UI state for auth status
  const [showConnectionToast, setShowConnectionToast] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tab, setTab] = useState("home");

  // Mock sync status (replace with real data from useDataManager)
  const [syncInProgress, setSyncInProgress] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(Date.now() - 30000);

  // Show connection toast when connection status changes
  useEffect(() => {
    setShowConnectionToast(true);
  }, [connected]);

  // Mock functions (replace with real implementations)
  const handleConnect = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Simulate connection process
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      setConnected(true);
      setAddress("0x1234567890123456789012345678901234567890");
      setChainId("8453");
      setUsdtBalance("1,234.56");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = () => {
    setConnected(false);
    setAddress(null);
    setChainId(null);
    setUsdtBalance("0");
    setError(null);
  };

  const handleRefreshBalance = async () => {
    // Simulate balance refresh
    setSyncInProgress(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    setLastSyncTime(Date.now());
    setSyncInProgress(false);
  };

  return (
    <div className="max-w-xl mx-auto min-h-screen bg-gray-50 dark:bg-black">
      {/* Enhanced Header with Auth Status */}
      <EnhancedHeader
        onRating={() => setTab("rating")}
        onWallet={() => setWalletOpen(true)}
        onSettings={() => setSettingsOpen(true)}
        connected={connected}
        address={address}
        loading={loading}
        showNetworkStatus={true}
        showSyncStatus={connected}
        syncInProgress={syncInProgress}
        lastSyncTime={lastSyncTime}
      />

      {/* Main Content */}
      <div className="p-4 space-y-4">
        {/* Auth Status Card (can be shown on different screens) */}
        {tab === "home" && (
          <AuthStatusCard
            connected={connected}
            address={address}
            usdtBalance={usdtBalance}
            usdtSymbol={usdtSymbol}
            chainId={chainId}
            loading={loading}
            error={error}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
            onRefreshBalance={handleRefreshBalance}
          />
        )}

        {/* Compact Auth Status (for other screens) */}
        {tab !== "home" && (
          <AuthStatusCard
            connected={connected}
            address={address}
            usdtBalance={usdtBalance}
            usdtSymbol={usdtSymbol}
            chainId={chainId}
            loading={loading}
            error={error}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
            compact={true}
          />
        )}

        {/* Demo Content */}
        <div className="space-y-4">
          <div className="p-4 bg-white dark:bg-gray-900 rounded-xl border">
            <h2 className="text-lg font-semibold mb-2">Демо контент</h2>
            <p className="text-gray-600 dark:text-gray-400">
              Это пример интеграции новых компонентов статуса авторизации.
            </p>
            
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setTab("home")}
                className={`px-3 py-1 rounded ${tab === "home" ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}
              >
                Главная
              </button>
              <button
                onClick={() => setTab("trading")}
                className={`px-3 py-1 rounded ${tab === "trading" ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}
              >
                Торговля
              </button>
              <button
                onClick={() => setTab("profile")}
                className={`px-3 py-1 rounded ${tab === "profile" ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}
              >
                Профиль
              </button>
            </div>
          </div>

          {/* Demo Actions */}
          <div className="p-4 bg-white dark:bg-gray-900 rounded-xl border">
            <h3 className="font-semibold mb-2">Тестовые действия</h3>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={handleConnect}
                disabled={connected || loading}
                className="px-3 py-1 bg-green-500 text-white rounded disabled:opacity-50"
              >
                Подключить
              </button>
              <button
                onClick={handleDisconnect}
                disabled={!connected}
                className="px-3 py-1 bg-red-500 text-white rounded disabled:opacity-50"
              >
                Отключить
              </button>
              <button
                onClick={handleRefreshBalance}
                disabled={!connected}
                className="px-3 py-1 bg-blue-500 text-white rounded disabled:opacity-50"
              >
                Обновить баланс
              </button>
              <button
                onClick={() => setError("Тестовая ошибка")}
                className="px-3 py-1 bg-yellow-500 text-white rounded"
              >
                Показать ошибку
              </button>
              <button
                onClick={() => setError(null)}
                className="px-3 py-1 bg-gray-500 text-white rounded"
              >
                Очистить ошибку
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Floating Auth Status (optional, shows when connected) */}
      <FloatingAuthStatus
        connected={connected}
        address={address}
        usdtBalance={usdtBalance}
        usdtSymbol={usdtSymbol}
        loading={loading}
        onToggle={() => setWalletOpen(true)}
      />

      {/* Connection Status Toast */}
      <ConnectionStatusToast
        show={showConnectionToast}
        connected={connected}
        address={address}
        onClose={() => setShowConnectionToast(false)}
      />

      {/* Bottom Navigation (existing) */}
      <div className="sticky bottom-0 flex border-t bg-white/70 dark:bg-neutral-900/70 backdrop-blur">
        {["home", "trading", "profile"].map((id) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 py-3 px-3 ${
              tab === id
                ? "bg-black text-white dark:bg-white dark:text-black"
                : "text-gray-800 dark:text-gray-200"
            }`}
          >
            {id === "home"
              ? "Главная"
              : id === "trading"
              ? "Торговля"
              : "Профиль"}
          </button>
        ))}
      </div>

      {/* Mock Modals */}
      {walletOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 p-6 rounded-xl max-w-md w-full mx-4">
            <h2 className="text-lg font-semibold mb-4">Кошелек</h2>
            <AuthStatusCard
              connected={connected}
              address={address}
              usdtBalance={usdtBalance}
              usdtSymbol={usdtSymbol}
              chainId={chainId}
              loading={loading}
              error={error}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
              onRefreshBalance={handleRefreshBalance}
            />
            <button
              onClick={() => setWalletOpen(false)}
              className="mt-4 w-full py-2 bg-gray-200 dark:bg-gray-700 rounded-lg"
            >
              Закрыть
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Integration instructions for existing App.jsx:
/*
1. Import the new components:
   import { EnhancedHeader } from './components/EnhancedHeader';
   import { AuthStatusCard } from './components/AuthStatusCard';
   import { FloatingAuthStatus, ConnectionStatusToast } from './components/AuthStatus';

2. Replace the existing Header component with EnhancedHeader:
   <EnhancedHeader
     onRating={() => setTab("rating")}
     onWallet={() => setWalletOpen(true)}
     onSettings={() => setSettingsOpen(true)}
     connected={web3.connected}
     address={web3.address}
     loading={web3.loading}
   />

3. Add AuthStatusCard to screens where you want to show detailed wallet info:
   <AuthStatusCard
     connected={web3.connected}
     address={web3.address}
     usdtBalance={web3.usdtBalance}
     usdtSymbol={web3.usdtSymbol}
     chainId={web3.chainId}
     loading={web3.loading}
     onConnect={() => web3.connect()}
     onDisconnect={web3.disconnect}
   />

4. Optionally add FloatingAuthStatus for persistent status:
   <FloatingAuthStatus
     connected={web3.connected}
     address={web3.address}
     usdtBalance={web3.usdtBalance}
     usdtSymbol={web3.usdtSymbol}
     loading={web3.loading}
     onToggle={() => setWalletOpen(true)}
   />

5. Add ConnectionStatusToast for connection change notifications:
   <ConnectionStatusToast
     show={showConnectionToast}
     connected={web3.connected}
     address={web3.address}
     onClose={() => setShowConnectionToast(false)}
   />
*/