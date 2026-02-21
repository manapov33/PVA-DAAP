/**
 * Enhanced Profile Component
 * Shows user profile with integrated Position Manager data and sync status
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useIntegratedPositionEngine } from '../hooks/useIntegratedPositionEngine';
import { AuthStatusCard } from './AuthStatusCard';
import { SyncStatusIndicator } from './TransactionStatusIndicator';

interface EnhancedProfileProps {
  userAddress?: string | null;
  provider?: any;
  contractAddress?: string;
  web3?: any;
  toast: (type: string, message: string) => void;
}

const formatUSD = (n: number) =>
  `${Number(n || 0).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })}`;

const qty3 = (n: number) => (Number.isFinite(+n) ? (+n).toFixed(3) : "0.000");
const now = () => Date.now();

function Countdown({ until }: { until: number }) {
  const [t, setT] = React.useState(Math.max(0, until - now()));
  
  React.useEffect(() => {
    const id = setInterval(
      () => setT(Math.max(0, until - now())),
      1000
    );
    return () => clearInterval(id);
  }, [until]);
  
  const h = String(Math.floor(t / 1000 / 3600)).padStart(2, "0");
  const m = String(Math.floor(((t / 1000) % 3600) / 60)).padStart(2, "0");
  const s = String(Math.floor((t / 1000) % 60)).padStart(2, "0");
  
  return (
    <span className="font-mono">
      {h}:{m}:{s}
    </span>
  );
}

const Card = ({ label, value }: { label: string; value: string | number }) => (
  <div className="rounded-xl border p-3 bg-white/70 dark:bg-neutral-900/70">
    <div className="text-xs opacity-70">{label}</div>
    <div className="text-xl font-semibold">{value}</div>
  </div>
);

const LEAGUES = [
  { name: "Silver", min: 0.01, max: 0.1, profit: 0.1 },
  { name: "Gold", min: 0.1, max: 1, profit: 0.075 },
  { name: "Diamond", min: 1, max: 10, profit: 0.05 },
];

const leagueByPrice = (price: number) =>
  LEAGUES.find((l) => price >= l.min && price < l.max) || LEAGUES[2];

export const EnhancedProfile: React.FC<EnhancedProfileProps> = ({
  userAddress,
  provider,
  contractAddress,
  web3,
  toast
}) => {
  const engine = useIntegratedPositionEngine({
    userAddress,
    provider,
    contractAddress,
    toast
  });

  // Calculate statistics from trade history
  const buys = engine.tradeHistory
    .filter((e) => e.type === "buy")
    .reduce((s, e) => s + (e.amount || 0), 0);
  
  const sells = engine.tradeHistory
    .filter((e) => e.type === "sell")
    .reduce((s, e) => s + (e.net || 0), 0);
  
  const profit = engine.tradeHistory
    .filter((e) => e.type === "sell")
    .reduce((s, e) => s + (e.profit || 0), 0);
  
  const pct = buys > 0 ? (profit / buys) * 100 : 0;

  const handleRefreshPositions = async () => {
    try {
      await engine.refreshPositions();
      toast('success', 'Позиции обновлены');
    } catch (error) {
      console.error('Failed to refresh positions:', error);
      toast('error', 'Ошибка обновления позиций');
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="text-lg font-semibold">Профиль</div>
      
      {/* Auth Status Card - Full */}
      <AuthStatusCard
        connected={web3?.connected || false}
        address={web3?.address}
        usdtBalance={web3?.usdtBalance}
        usdtSymbol={web3?.usdtSymbol}
        chainId={web3?.chainId}
        loading={web3?.loading}
        onConnect={() => web3?.connect?.()}
        onDisconnect={web3?.disconnect}
        onRefreshBalance={web3?.refreshUsdtBalance}
        compact={false}
      />

      {/* Sync Status with Manual Refresh */}
      <div className="flex items-center justify-between gap-3">
        <SyncStatusIndicator
          loading={engine.loading}
          error={engine.error}
          lastSyncTime={Date.now() - 30000} // Mock last sync time
          className="flex-1"
        />
        <button
          onClick={handleRefreshPositions}
          disabled={engine.loading}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            engine.loading
              ? "bg-gray-100 dark:bg-neutral-800 text-gray-400 cursor-not-allowed"
              : "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/30"
          }`}
        >
          {engine.loading ? "Обновление..." : "Обновить"}
        </button>
      </div>

      {/* Statistics Cards */}
      <div className="rounded-2xl border p-4 bg-white/70 dark:bg-neutral-900/70 grid grid-cols-2 gap-3">
        <Card
          label="Объём торгов"
          value={formatUSD(buys + sells)}
        />
        <Card
          label="Прибыль"
          value={`${formatUSD(profit)} (${pct.toFixed(2)}%)`}
        />
        <Card
          label="Активные позиции"
          value={engine.positions.length}
        />
        <Card
          label="Сделок всего"
          value={engine.tradeHistory.length}
        />
      </div>

      {/* Active Positions Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Активные позиции</div>
          {engine.positions.length > 0 && (
            <div className="text-xs opacity-70">
              {engine.positions.length} позиций
            </div>
          )}
        </div>
        
        {engine.positions.length === 0 && (
          <div className="text-sm opacity-70 text-center py-8">
            {userAddress ? "Нет активных позиций" : "Подключите кошелек для просмотра позиций"}
          </div>
        )}
        
        <AnimatePresence initial={false}>
          {engine.positions.map((p, i) => {
            const ready = now() >= p.lockUntil;
            const target =
              p.buyPrice *
              (1 + leagueByPrice(p.buyPrice).profit);
            
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-2xl border p-4 bg-white/70 dark:bg-neutral-900/70"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">
                      Позиция #{i + 1} • L{p.level}
                      {p.onchainId !== undefined && (
                        <span className="ml-2 text-xs opacity-70">
                          (On-chain: {p.onchainId})
                        </span>
                      )}
                    </div>
                    <div className="text-xs opacity-70">
                      Куплено по {p.buyPrice.toFixed(4)} •
                      Кол-во {qty3(p.qty)}
                    </div>
                  </div>
                  <div className="text-right text-sm">
                    <div>
                      Цель: <b>{target.toFixed(4)}</b>
                    </div>
                    {!ready ? (
                      <div className="text-xs opacity-70">
                        Лок до:{" "}
                        <Countdown until={p.lockUntil} />
                      </div>
                    ) : (
                      <div className="text-xs text-green-600">
                        Готово к продаже
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Trade History Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">История сделок</div>
          {engine.tradeHistory.length > 0 && (
            <div className="text-xs opacity-70">
              {engine.tradeHistory.length} сделок
            </div>
          )}
        </div>
        
        <div className="rounded-2xl border p-4 bg-white/70 dark:bg-neutral-900/70">
          <div className="space-y-2 max-h-64 overflow-auto pr-1">
            {engine.tradeHistory.length === 0 && (
              <div className="text-xs opacity-70 text-center py-4">
                {userAddress ? "История сделок пуста" : "Подключите кошелек для просмотра истории"}
              </div>
            )}
            {engine.tradeHistory.map((e, i) => (
              <div
                key={i}
                className="text-sm flex items-center justify-between py-2 border-b border-gray-100 dark:border-neutral-800 last:border-b-0"
              >
                <div className="opacity-70 text-xs">
                  {new Date(e.time).toLocaleString()}
                </div>
                <div className="font-medium">
                  {e.type === "buy"
                    ? `Покупка ${formatUSD(e.amount || 0)} (L${e.level})`
                    : `Продажа ${formatUSD(e.net || 0)} (L${e.level})`}
                </div>
                {e.type === "sell" && e.profit !== undefined && (
                  <div className={`text-xs ${
                    e.profit > 0 ? "text-green-600" : "text-red-600"
                  }`}>
                    {e.profit > 0 ? "+" : ""}{formatUSD(e.profit)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};