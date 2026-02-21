/**
 * Enhanced Trading Component
 * Integrates with the new Position Manager system for improved functionality
 */

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useIntegratedPositionEngine } from '../hooks/useIntegratedPositionEngine';
import { TransactionStatusIndicator, SyncStatusIndicator } from './TransactionStatusIndicator';
import { AuthStatusCard } from './AuthStatusCard';
import { VirtualizedPositionList } from './VirtualizedPositionList';

interface EnhancedTradingProps {
  userAddress?: string | null;
  provider?: any;
  contractAddress?: string;
  web3?: any;
  toast: (type: string, message: string) => void;
}

const LEAGUES = [
  { name: "Silver", min: 0.01, max: 0.1, profit: 0.1 },
  { name: "Gold", min: 0.1, max: 1, profit: 0.075 },
  { name: "Diamond", min: 1, max: 10, profit: 0.05 },
];

const leagueByPrice = (price: number) =>
  LEAGUES.find((l) => price >= l.min && price < l.max) || LEAGUES[2];

const qty3 = (n: number) => (Number.isFinite(+n) ? (+n).toFixed(3) : "0.000");
const now = () => Date.now();

function Countdown({ until }: { until: number }) {
  const [t, setT] = useState(Math.max(0, until - now()));
  
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

export const EnhancedTrading: React.FC<EnhancedTradingProps> = ({
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

  const [usd, setUsd] = useState(20);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState("trade"); // 'trade' | 'exchange'

  const qty = useMemo(
    () => (usd > 0 && engine.price ? usd / engine.price : 0),
    [usd, engine.price]
  );

  const tryBuy = async () => {
    setErr("");
    try {
      let onchainId = null;
      if (web3 && web3.connected) {
        onchainId = await web3.buyOnChain(usd);
      }
      await engine.buy(usd, { onchainId });
    } catch (e: any) {
      console.error(e);
      setErr(e?.message || String(e));
      if (!web3?.connected) {
        toast(
          "error",
          "Подключите кошелёк для реальной покупки"
        );
      }
    }
  };

  const trySell = async (i: number) => {
    setErr("");
    try {
      const pos = (engine.positions || [])[i];
      if (pos && web3 && web3.connected) {
        if (
          typeof pos.onchainId === "number" &&
          pos.onchainId >= 0
        ) {
          await web3.sellOnChain(pos.onchainId);
        } else {
          throw new Error(
            "Нет on-chain позиции для продажи"
          );
        }
      }
      await engine.sell(i);
    } catch (e: any) {
      console.error(e);
      setErr(e?.message || String(e));
    }
  };

  // Demo exchange data
  const demoRows = useMemo(
    () =>
      Array.from({ length: 10 }).map((_, idx) => ({
        n: idx + 1,
        user: `user_${(idx % 5) + 1}`,
        type: idx % 2 === 0 ? "buy" : "sell",
        price: +(engine.price * (1 + idx / 10)).toFixed(6),
        qty: 1000 + idx * 50,
        time: new Date(
          now() - idx * 60000
        ).toLocaleTimeString(undefined, {
          hour12: false,
        }),
      })),
    [engine.price]
  );

  const ExchangeTable = () => (
    <div className="rounded-2xl border p-4 bg-white/70 dark:bg-neutral-900/70">
      <div className="rounded-2xl border overflow-auto max-h-[60vh]">
        <table className="w-full text-sm">
          <thead className="text-left opacity-70 sticky top-0 bg-white/80 dark:bg-neutral-900/80 backdrop-blur">
            <tr>
              <th className="py-2 px-3">#</th>
              <th className="py-2 px-3">Пользователь</th>
              <th className="py-2 px-3">Тип</th>
              <th className="py-2 px-3">Цена</th>
              <th className="py-2 px-3">Кол-во</th>
              <th className="py-2 px-3">Время</th>
            </tr>
          </thead>
          <tbody>
            {demoRows.map((r) => (
              <tr
                key={r.n}
                className="border-t dark:border-neutral-800"
              >
                <td className="py-2 px-3">{r.n}</td>
                <td className="py-2 px-3">{r.user}</td>
                <td
                  className={`py-2 px-3 ${
                    r.type === "buy"
                      ? "text-green-600"
                      : "text-red-600"
                  }`}
                >
                  {r.type}
                </td>
                <td className="py-2 px-3">
                  {r.price.toFixed(4)}
                </td>
                <td className="py-2 px-3">{r.qty}</td>
                <td className="py-2 px-3">{r.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="p-4 space-y-4">
      {/* Auth Status Card - Compact */}
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
        compact={true}
      />

      {/* Transaction Status Indicator */}
      <TransactionStatusIndicator 
        transactionStatus={engine.transactionStatus}
      />

      {/* Sync Status Indicator */}
      <SyncStatusIndicator
        loading={engine.loading}
        error={engine.error}
        lastSyncTime={Date.now() - 30000} // Mock last sync time
      />

      {/* Tab Navigation */}
      <div className="flex items-center gap-2 rounded-full bg-gray-100 dark:bg-neutral-800 p-1 w-max">
        <button
          onClick={() => setTab("trade")}
          className={`px-4 py-1.5 rounded-full text-sm ${
            tab === "trade"
              ? "bg-black text-white dark:bg-white dark:text-black shadow"
              : "opacity-70"
          }`}
        >
          Торговля
        </button>
        <button
          onClick={() => setTab("exchange")}
          className={`px-4 py-1.5 rounded-full text-sm ${
            tab === "exchange"
              ? "bg-black text-white dark:bg-white dark:text-black shadow"
              : "opacity-70"
          }`}
        >
          Биржа
        </button>
      </div>

      <AnimatePresence mode="wait">
        {tab === "trade" ? (
          <motion.div
            key="trade"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            {/* Buy Form */}
            <div className="rounded-2xl border p-4 bg-white/70 dark:bg-neutral-900/70 space-y-3">
              <div className="text-sm">
                Сумма покупки (USDT)
              </div>
              <input
                type="number"
                min={20}
                value={usd}
                onChange={(e) =>
                  setUsd(parseFloat(e.target.value || "0"))
                }
                className="w-full px-4 py-3 rounded-xl border bg-transparent"
                disabled={engine.loading}
              />
              <div className="text-sm opacity-70">
                Будет куплено ≈ <b>{qty3(qty)}</b> токенов @{" "}
                {(engine.price || 0).toFixed(4)}
              </div>
              {err && (
                <div className="text-xs text-red-600">
                  {String(err)}
                </div>
              )}
              <button
                className={`w-full py-2.5 rounded-xl font-semibold ${
                  engine.loading
                    ? "bg-gray-300 dark:bg-neutral-700 cursor-not-allowed"
                    : "bg-black text-white dark:bg-white dark:text-black"
                }`}
                onClick={tryBuy}
                disabled={engine.loading}
              >
                {engine.loading ? "Покупка..." : "Купить"}
              </button>
            </div>

            {/* Positions List */}
            {engine.positions.length > 100 ? (
              // Use virtualized list for large datasets
              <VirtualizedPositionList
                positions={engine.positions.map((p, i) => ({
                  id: i,
                  qty: p.qty,
                  buyPrice: p.buyPrice,
                  lockUntil: p.lockUntil,
                  level: p.level,
                  onchainId: p.onchainId,
                  ready: now() >= p.lockUntil,
                  target: p.buyPrice * (1 + leagueByPrice(p.buyPrice).profit)
                }))}
                onSell={trySell}
                loading={engine.loading}
              />
            ) : (
              // Regular list for smaller datasets
              <AnimatePresence initial={false}>
                {(engine.positions || []).map((p, i) => {
                  const ready = p.lockUntil
                    ? now() >= p.lockUntil
                    : true;
                  const target =
                    (p.buyPrice ?? engine.price ?? 0) *
                    (1 +
                      leagueByPrice(
                        p.buyPrice ?? engine.price ?? 0
                      ).profit);
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
                            Позиция #{i + 1}
                            {p.level ? ` • L${p.level}` : ""}
                          </div>
                          <div className="text-xs opacity-70">
                            Куплено по{" "}
                            {(p.buyPrice ?? engine.price ?? 0).toFixed(
                              4
                            )}{" "}
                            • Кол-во {qty3(p.qty)}
                          </div>
                        </div>
                        <div className="text-right text-sm">
                          <div>
                            Цель:{" "}
                            <b>{target.toFixed(4)}</b>
                          </div>
                          {p.lockUntil && !ready ? (
                            <div className="text-xs opacity-70">
                              Лок до:{" "}
                              <Countdown until={p.lockUntil} />
                            </div>
                          ) : (
                            <div className="text-xs text-green-600">
                              Готово
                            </div>
                          )}
                        </div>
                      </div>
                      <button
                        disabled={!ready || engine.loading}
                        onClick={() => trySell(i)}
                        className={`mt-3 w-full py-2.5 rounded-xl font-semibold ${
                          ready && !engine.loading
                            ? "bg-black text-white dark:bg-white dark:text-black"
                            : "bg-gray-100 dark:bg-neutral-800 opacity-60"
                        }`}
                      >
                        {engine.loading ? "Продажа..." : "Продать"}
                      </button>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="exchange"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <ExchangeTable />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};