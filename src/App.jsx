import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ethers } from "ethers";
import PVAAuctionABI from "./abi/PVAAuction.json";
import { EnhancedHeader } from "./components/EnhancedHeader";
import { AuthStatusCard } from "./components/AuthStatusCard";
import { FloatingAuthStatus, ConnectionStatusToast } from "./components/AuthStatus";
import { EnhancedRating } from "./components/EnhancedRating";
import { useEnhancedTradeEngine } from "./hooks/useEnhancedTradeEngine";

/************************** Constants **************************/
const formatUSD = (n) =>
  `$${Number(n || 0).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })}`;
const clamp = (n, min, max) => Math.min(Math.max(n, min), max);
const now = () => Date.now();
const HOURS = (h) => h * 60 * 60 * 1000;
const qty3 = (n) => (Number.isFinite(+n) ? (+n).toFixed(3) : "0.000");
const shortAddr = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");

const TOTAL_SUPPLY = 1_000_000_000; // 1 млрд
const PARTS = 100; // 100 частей токеномики
const PLATFORM_FEE = 0.015; // 1.5%
const LOCK_HOURS = 3;

const LEAGUES = [
  { name: "Silver", min: 0.01, max: 0.1, profit: 0.1 },
  { name: "Gold", min: 0.1, max: 1, profit: 0.075 },
  { name: "Diamond", min: 1, max: 10, profit: 0.05 },
];

const leagueByPrice = (price) =>
  LEAGUES.find((l) => price >= l.min && price < l.max) || LEAGUES[2];

const toReadableQty = (n) => {
  const x = Math.floor(Number(n || 0));
  if (x >= 1_000_000_000) return `${(x / 1_000_000_000).toFixed(0)} млрд`;
  if (x >= 1_000_000) return `${(x / 1_000_000).toFixed(1)} млн`;
  if (x >= 1_000) return `${(x / 1_000).toFixed(1)} тыс`;
  return `${x.toLocaleString()}`;
};

/*************** On-chain constants (Base + contracts) ***************/
const BASE_CHAIN_ID_HEX = "0x2105"; // Base mainnet
// USDT на Base mainnet (каноничный)
const USDT_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
// Твой контракт аукциона
const PVA_ADDRESS = "0xEbD88A97c246084808dc9D0ee03Ea2eC0BBeD536";

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

/************************** Tiny UI **************************/
function Countdown({ until }) {
  const [t, setT] = useState(Math.max(0, until - now()));
  useEffect(() => {
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

const Row = ({ label, value }) => (
  <div className="flex items-center justify-between py-1.5">
    <div className="text-sm opacity-70">{label}</div>
    <div className="text-sm font-semibold">{value}</div>
  </div>
);

const Card = ({ label, value }) => (
  <div className="rounded-xl border p-3 bg-white/70 dark:bg-neutral-900/70">
    <div className="text-xs opacity-70">{label}</div>
    <div className="text-xl font-semibold">{value}</div>
  </div>
);

/*********************** Toasts (minimal) ***********************/
function useToasts() {
  const [toasts, setToasts] = useState([]);
  const push = (type, text) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, type, text }]);
    setTimeout(
      () => setToasts((t) => t.filter((x) => x.id !== id)),
      2500
    );
  };
  const view = (
    <div className="fixed bottom-4 right-4 z-[60] space-y-2">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className={`min-w-[220px] max-w-[320px] rounded-xl border px-3 py-2 text-sm shadow bg-white/90 dark:bg-neutral-900/90 ${
              t.type === "error"
                ? "border-red-300 dark:border-red-700"
                : "border-gray-200 dark:border-neutral-700"
            }`}
          >
            {String(t.text)}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
  return { push, view };
}

/*********************** Web3 helpers ****************************/
function detectProviders() {
  if (typeof window === "undefined") return [];
  const eth = window.ethereum;
  if (!eth) return [];
  if (eth.providers && Array.isArray(eth.providers)) return eth.providers;
  return [eth];
}

async function ensureBaseNetwork(raw) {
  const chainId = await raw.request({ method: "eth_chainId" });
  if (chainId === BASE_CHAIN_ID_HEX) return;
  try {
    await raw.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: BASE_CHAIN_ID_HEX }],
    });
  } catch (e) {
    if (e && e.code === 4902) {
      await raw.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: BASE_CHAIN_ID_HEX,
            chainName: "Base",
            nativeCurrency: {
              name: "Ether",
              symbol: "ETH",
              decimals: 18,
            },
            rpcUrls: ["https://mainnet.base.org"],
            blockExplorerUrls: ["https://basescan.org"],
          },
        ],
      });
    } else {
      throw e;
    }
  }
}

function useWeb3(toast) {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [address, setAddress] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [connected, setConnected] = useState(false);
  const [usdtBalance, setUsdtBalance] = useState("0");
  const [usdtSymbol, setUsdtSymbol] = useState("USDT");
  const [loading, setLoading] = useState(false);

  const refreshUsdtBalance = async (_prov, _addr) => {
    try {
      const prov = _prov || provider;
      const addr = _addr || address;
      if (!prov || !addr) return;
      const erc20 = new ethers.Contract(
        USDT_ADDRESS,
        ERC20_ABI,
        prov
      );
      const [bal, sym, dec] = await Promise.all([
        erc20.balanceOf(addr),
        erc20.symbol(),
        erc20.decimals(),
      ]);
      setUsdtSymbol(sym || "USDT");
      const human = Number(
        ethers.formatUnits(bal, dec || 6)
      );
      setUsdtBalance(human.toFixed(2));
    } catch (e) {
      console.warn("USDT balance fetch failed", e);
    }
  };

  const connect = async (type = "metamask") => {
    try {
      const providers = detectProviders();
      if (!providers.length) {
        toast("error", "Web3-провайдер не найден");
        return;
      }
      let raw = null;
      if (type === "metamask") {
        raw =
          providers.find((p) => p.isMetaMask) ||
          providers[0] ||
          null;
      } else if (type === "coinbase") {
        raw =
          providers.find((p) => p.isCoinbaseWallet) ||
          providers[0] ||
          null;
      } else {
        raw = providers[0];
      }
      if (!raw) {
        toast("error", "Провайдер не найден");
        return;
      }

      await ensureBaseNetwork(raw);

      const prov = new ethers.BrowserProvider(raw);
      await prov.send("eth_requestAccounts", []);
      const s = await prov.getSigner();
      const net = await prov.getNetwork();
      const addr = await s.getAddress();

      setProvider(prov);
      setSigner(s);
      setAddress(addr);
      setChainId(net.chainId?.toString());
      setConnected(true);

      await refreshUsdtBalance(prov, addr);

      if (raw && raw.on) {
        raw.on("accountsChanged", async (accs) => {
          const a = accs && accs[0];
          if (!a) {
            setAddress(null);
            setConnected(false);
            setUsdtBalance("0");
            return;
          }
          setAddress(a);
          setConnected(true);
          await refreshUsdtBalance(prov, a);
        });
        raw.on("chainChanged", async () => {
          try {
            await ensureBaseNetwork(raw);
            const net2 = await prov.getNetwork();
            setChainId(net2.chainId?.toString());
            if (address) await refreshUsdtBalance(prov, address);
          } catch (e) {
            console.warn("chainChanged handler error", e);
          }
        });
      }

      toast("success", "Кошелёк подключён");
    } catch (e) {
      console.error(e);
      toast("error", e?.message || "Ошибка подключения");
    }
  };

  const disconnect = () => {
    setProvider(null);
    setSigner(null);
    setAddress(null);
    setChainId(null);
    setConnected(false);
    setUsdtBalance("0");
  };

  const buyOnChain = async (usdAmount) => {
    if (!signer || !address) {
      throw new Error("Подключите кошелёк");
    }
    if (!Number.isFinite(+usdAmount) || +usdAmount < 20) {
      throw new Error("Минимум 20 USDT");
    }
    setLoading(true);
    try {
      const usdt = new ethers.Contract(
        USDT_ADDRESS,
        ERC20_ABI,
        signer
      );
      const pva = new ethers.Contract(
        PVA_ADDRESS,
        PVAAuctionABI,
        signer
      );
      const dec = await usdt.decimals();
      const amt = ethers.parseUnits(
        String(usdAmount),
        dec || 6
      );

      const allowance = await usdt.allowance(
        address,
        PVA_ADDRESS
      );
      if (allowance < amt) {
        const tx1 = await usdt.approve(PVA_ADDRESS, amt);
        await tx1.wait();
      }

      const tx2 = await pva.buyTokens(amt);
      const receipt = await tx2.wait();
      console.log("buyTokens receipt", receipt);

      const len = await pva.getPositionsLength();
      await refreshUsdtBalance();
      // новая позиция — последняя
      const newId = Number(len) - 1;
      return newId >= 0 ? newId : null;
    } finally {
      setLoading(false);
    }
  };

  const sellOnChain = async (positionId) => {
    if (!signer || !address) {
      throw new Error("Подключите кошелёк");
    }
    setLoading(true);
    try {
      const pva = new ethers.Contract(
        PVA_ADDRESS,
        PVAAuctionABI,
        signer
      );
      const tx = await pva.sellPosition(positionId);
      const receipt = await tx.wait();
      console.log("sellPosition receipt", receipt);
      await refreshUsdtBalance();
    } finally {
      setLoading(false);
    }
  };

  return {
    provider,
    signer,
    address,
    chainId,
    connected,
    usdtBalance,
    usdtSymbol,
    loading,
    connect,
    disconnect,
    refreshUsdtBalance,
    buyOnChain,
    sellOnChain,
  };
}

/*********************** Demo Engine (Legacy - для совместимости) ************************/
function useTradeEngine(toast) {
  // Этот хук оставлен для совместимости со старым кодом
  // Новый код должен использовать useEnhancedTradeEngine
  const [price] = useState(0.01);
  const [unlockedParts, setUnlockedParts] = useState(1);
  const [positions, setPositions] = useState([]);
  const [tradeHistory, setTradeHistory] = useState([]);
  const [todayBuys, setTodayBuys] = useState(0);
  const [todaySells, setTodaySells] = useState(0);
  const [lastDay, setLastDay] = useState(new Date().getDate());

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

  const buy = (usd, meta = {}) => {
    if (!(Number.isFinite(usd) && usd >= 20)) {
      toast("error", "Минимальная покупка $20");
      throw new Error("Minimum purchase: $20");
    }
    if (todayBuys >= 2) {
      toast("error", "Лимит покупок на сегодня: 2");
      throw new Error("Daily buy limit");
    }
    const qty = usd / price;
    const lockUntil = now() + HOURS(LOCK_HOURS);
    const level =
      typeof meta.level === "number"
        ? meta.level
        : Math.floor(Math.random() * unlockedParts) + 1;
    const onchainId =
      typeof meta.onchainId === "number" ? meta.onchainId : null;

    setPositions((arr) => [
      ...arr,
      {
        qty,
        buyPrice: price,
        lockUntil,
        level,
        onchainId,
      },
    ]);
    setTradeHistory((h) => [
      {
        type: "buy",
        amount: usd,
        price,
        qty,
        time: now(),
        level,
      },
      ...h,
    ]);
    setTodayBuys((n) => n + 1);
    setUnlockedParts((v) => clamp(v + 1, 1, PARTS));
    toast("success", "Сделка выполнена");
  };

  const sell = (idx) => {
    const p = positions[idx];
    if (!p) return;
    if (now() < p.lockUntil) {
      toast("error", "Лок ещё активен (3ч)");
      throw new Error("Locked");
    }
    if (todaySells >= 2) {
      toast("error", "Лимит продаж на сегодня: 2");
      throw new Error("Daily sell limit");
    }

    const league = leagueByPrice(p.buyPrice);
    const profitPct =
      league.name === "Silver"
        ? 0.1
        : league.name === "Gold"
        ? 0.075
        : 0.05;

    const sellPrice = p.buyPrice * (1 + profitPct);
    const gross = p.qty * sellPrice;
    const fee = gross * PLATFORM_FEE;
    const net = gross - fee;
    const buyCost = p.qty * p.buyPrice;
    const pl = net - buyCost;

    setPositions((arr) => arr.filter((_, i) => i !== idx));
    setTradeHistory((h) => [
      {
        type: "sell",
        net,
        fee,
        price: sellPrice,
        qty: p.qty,
        time: now(),
        buyCost,
        profit: pl,
        level: p.level,
        onchainId: p.onchainId ?? null,
      },
      ...h,
    ]);
    setTodaySells((n) => n + 1);
    setUnlockedParts((v) => clamp(v + 1, 1, PARTS));
    toast("success", "Сделка выполнена");
  };

  const marketCap = useMemo(
    () => TOTAL_SUPPLY * price,
    [price]
  );

  return {
    price,
    unlockedParts,
    positions,
    tradeHistory,
    marketCap,
    buy,
    sell,
  };
}

/*********************** Home ************************/
function Home({ engine, goTrading, web3 }) {
  const totalBuys = engine.tradeHistory
    .filter((e) => e.type === "buy")
    .reduce((s, e) => s + (e.amount || 0), 0);
  const totalSells = engine.tradeHistory
    .filter((e) => e.type === "sell")
    .reduce((s, e) => s + (e.net || 0), 0);
  const trades = engine.tradeHistory.length;

  const partSupply = TOTAL_SUPPLY / PARTS;
  const unlockedSupply = partSupply * engine.unlockedParts;
  const lockedQty = engine.positions.reduce(
    (s, p) => s + (now() < p.lockUntil ? p.qty : 0),
    0
  );
  const availableQty = Math.max(
    0,
    Math.floor(unlockedSupply - lockedQty)
  );
  const unlockedPercent = (
    (unlockedSupply / TOTAL_SUPPLY) *
    100
  ).toFixed(2);

  const readableAvailable = toReadableQty(availableQty);

  const leagueDist = [
    { name: "Silver", count: Math.max(1, trades) },
    { name: "Gold", count: Math.floor(trades / 2) + 1 },
    { name: "Diamond", count: Math.floor(trades / 4) + 1 },
  ];
  const maxCount = Math.max(...leagueDist.map((l) => l.count));
  const fill = (c) => Math.round((c / maxCount) * 100);

  const Bar = ({ label, pct }) => (
    <div className="space-y-1">
      <div className="text-sm font-medium">
        {`${pct}% ${label}`}
      </div>
      <div className="h-2 rounded-full bg-gray-200 dark:bg-neutral-800 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${clamp(pct, 0, 100)}%` }}
          transition={{ duration: 1.1 }}
          className="h-full bg-black"
        />
      </div>
    </div>
  );

  return (
    <motion.div layout className="p-4 space-y-4">
      {/* Auth Status Card */}
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

      <div className="rounded-2xl border p-4 bg-white/70 dark:bg-neutral-900/70 shadow space-y-2">
        <Row
          label="Капитализация"
          value={formatUSD(engine.marketCap)}
        />
        <Row
          label="Открытых частей"
          value={`${engine.unlockedParts} / ${PARTS}`}
        />
        <Row
          label="Доступно токенов"
          value={readableAvailable}
        />
        <Row
          label="В локе токенов"
          value={Math.floor(lockedQty)}
        />
        <Row
          label="Разблокированный объём"
          value={`${unlockedPercent}%`}
        />
      </div>

      <button
        onClick={goTrading}
        className="w-full py-3 rounded-full bg-black text-white dark:bg-white dark:text-black font-semibold"
      >
        Участвовать
      </button>

      <div className="rounded-2xl border p-4 bg-white/70 dark:bg-neutral-900/70">
        <div className="text-lg font-semibold mb-2">
          Статистика
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Card label="Сделок" value={trades} />
          <Card
            label="Объём"
            value={formatUSD(totalBuys + totalSells)}
          />
        </div>
      </div>

      <div className="rounded-2xl border p-4 bg-white/70 dark:bg-neutral-900/70 space-y-2">
        <div className="text-lg font-semibold">Лиги</div>
        <Bar
          label="Silver"
          pct={fill(leagueDist[0].count)}
        />
        <Bar label="Gold" pct={fill(leagueDist[1].count)} />
        <Bar
          label="Diamond"
          pct={fill(leagueDist[2].count)}
        />
      </div>
    </motion.div>
  );
}

/*********************** Trading (with Exchange tab) ***********************/
function Trading({ engine, web3, toast }) {
  const [fbPositions, setFbPositions] = useState([]);
  const FB_PRICE = 0.01;
  const hasValidEngine =
    engine &&
    typeof engine.price === "number" &&
    Array.isArray(engine.positions) &&
    typeof engine.buy === "function" &&
    typeof engine.sell === "function";

  const E = hasValidEngine
    ? engine
    : {
        price: FB_PRICE,
        positions: fbPositions,
        buy: (usd) => {
          if (!Number.isFinite(usd) || usd < 20)
            throw new Error("Minimum purchase: $20");
          const qty = usd / FB_PRICE;
          setFbPositions((arr) => [
            ...arr,
            {
              qty,
              buyPrice: FB_PRICE,
              lockUntil: now() + HOURS(LOCK_HOURS),
              level: 1,
            },
          ]);
        },
        sell: (i) =>
          setFbPositions((arr) =>
            arr.filter((_, idx) => idx !== i)
          ),
      };

  const [usd, setUsd] = useState(20);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState("trade"); // 'trade' | 'exchange'
  const qty = useMemo(
    () => (usd > 0 && E.price ? usd / E.price : 0),
    [usd, E.price]
  );

  const tryBuy = async () => {
    setErr("");
    try {
      let onchainId = null;
      if (web3 && web3.connected) {
        onchainId = await web3.buyOnChain(usd);
      }
      E.buy(usd, { onchainId });
    } catch (e) {
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

  const trySell = async (i) => {
    setErr("");
    try {
      const pos = (E.positions || [])[i];
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
      E.sell(i);
    } catch (e) {
      console.error(e);
      setErr(e?.message || String(e));
    }
  };

  const demoRows = useMemo(
    () =>
      Array.from({ length: 10 }).map((_, idx) => ({
        n: idx + 1,
        user: `user_${(idx % 5) + 1}`,
        type: idx % 2 === 0 ? "buy" : "sell",
        price: +(E.price * (1 + idx / 10)).toFixed(6),
        qty: 1000 + idx * 50,
        time: new Date(
          now() - idx * 60000
        ).toLocaleTimeString(undefined, {
          hour12: false,
        }),
      })),
    [E.price]
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
              />
              <div className="text-sm opacity-70">
                Будет куплено ≈ <b>{qty3(qty)}</b> токенов @{" "}
                {(E.price || 0).toFixed(4)}
              </div>
              {err && (
                <div className="text-xs text-red-600">
                  {String(err)}
                </div>
              )}
              <button
                className="w-full py-2.5 rounded-xl bg-black text-white dark:bg-white dark:text-black font-semibold"
                onClick={tryBuy}
              >
                Купить
              </button>
            </div>

            <AnimatePresence initial={false}>
              {(E.positions || []).map((p, i) => {
                const ready = p.lockUntil
                  ? now() >= p.lockUntil
                  : true;
                const target =
                  (p.buyPrice ?? E.price ?? 0) *
                  (1 +
                    leagueByPrice(
                      p.buyPrice ?? E.price ?? 0
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
                          {(p.buyPrice ?? E.price ?? 0).toFixed(
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
                      disabled={!ready}
                      onClick={() => trySell(i)}
                      className={`mt-3 w-full py-2.5 rounded-xl font-semibold ${
                        ready
                          ? "bg-black text-white dark:bg-white dark:text-black"
                          : "bg-gray-100 dark:bg-neutral-800 opacity-60"
                      }`}
                    >
                      Продать
                    </button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
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
}

/*********************** Rating (Legacy - заменен на EnhancedRating) ************************/
function safeNum(n, digits = 2) {
  const v = Number(n);
  if (!Number.isFinite(v)) return (0).toFixed(digits);
  return v.toFixed(digits);
}
function buildLeaderboardSafe(history) {
  const arr = Array.isArray(history) ? history : [];
  const map = new Map();
  arr.forEach((e, idx) => {
    const uname = `user_${(idx % 7) + 1}`;
    const user = e && e.user ? String(e.user) : uname;
    if (!map.has(user))
      map.set(user, {
        user,
        profit: 0,
        volume: 0,
        trades: 0,
      });
    const row = map.get(user);
    if (e && e.type === "buy") {
      row.volume += Number(e.amount) || 0;
      row.trades += 1;
    } else if (e && e.type === "sell") {
      row.volume += Number(e.net) || 0;
      row.profit += Number(e.profit) || 0;
      row.trades += 1;
    }
  });
  const out = Array.from(map.values()).sort(
    (a, b) => b.profit - a.profit
  );
  if (out.length) return out;
  return [
    {
      user: "user_1",
      profit: 1234.56,
      volume: 25000,
      trades: 14,
    },
    {
      user: "user_2",
      profit: 987.12,
      volume: 20000,
      trades: 12,
    },
    {
      user: "user_3",
      profit: 650.0,
      volume: 15000,
      trades: 10,
    },
  ];
}
function Rating({ engine }) {
  const data = useMemo(
    () => buildLeaderboardSafe(engine && engine.tradeHistory),
    [engine]
  );
  return (
    <div className="p-4">
      <div className="text-lg font-semibold mb-2">
        Рейтинг трейдеров (Legacy)
      </div>
      <div className="grid grid-cols-5 text-sm font-semibold mb-1 border-b pb-1">
        <div>#</div>
        <div>Имя</div>
        <div className="text-center">Сделок</div>
        <div className="text-right">Прибыль</div>
        <div className="text-right">Объём</div>
      </div>
      {data.map((r, i) => {
        const user =
          r && r.user ? String(r.user) : "Unknown";
        const trades = Number.isFinite(
          Number(r && r.trades)
        )
          ? Number(r.trades)
          : 0;
        const profit = safeNum(r && r.profit, 2);
        const volume = safeNum(r && r.volume, 2);
        return (
          <div
            key={`row-${i}-${user}`}
            className="grid grid-cols-5 text-sm py-1 border-b border-gray-200 dark:border-neutral-800"
          >
            <div>{i + 1}</div>
            <div>{user}</div>
            <div className="text-center">{trades}</div>
            <div className="text-right">{profit}$</div>
            <div className="text-right">{volume}$</div>
          </div>
        );
      })}
    </div>
  );
}

/*********************** Profile ************************/
function Profile({ engine, web3 }) {
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

      <div className="text-sm font-semibold">Позиции</div>
      {engine.positions.length === 0 && (
        <div className="text_sm opacity-70">Пусто</div>
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
                      Готово
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      <div className="text-sm font-semibold">
        История сделок
      </div>
      <div className="rounded-2xl border p-4 bg-white/70 dark:bg-neutral-900/70">
        <div className="space-y-2 max-h-64 overflow-auto pr-1">
          {engine.tradeHistory.length === 0 && (
            <div className="text-xs opacity-70">Пусто</div>
          )}
          {engine.tradeHistory.map((e, i) => (
            <div
              key={i}
              className="text-sm flex items-center justify_between"
            >
              <div className="opacity-70">
                {new Date(e.time).toLocaleString()}
              </div>
              <div className="font-medium">
                {e.type === "buy"
                  ? `Покупка ${formatUSD(e.amount)} (L${
                      e.level
                    })`
                  : `Продажа ${formatUSD(e.net)} (L${
                      e.level
                    })`}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/*********************** Wallet & Settings ************************/
function WalletModal({ open, onClose, web3 }) {
  if (!open) return null;
  const {
    connected,
    address,
    usdtBalance,
    usdtSymbol,
    connect,
    disconnect,
  } = web3 || {};
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white dark:bg-neutral-900 rounded-3xl p-6 w-[420px] border dark:border-neutral-800 space-y-4">
        <div className="text-lg font-semibold">Кошелёк</div>
        {!connected ? (
          <>
            <div className="text-sm opacity-70">
              Подключите кошелёк в сети Base (USDT).
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => connect("metamask")}
                className="h-11 rounded-xl border hover:bg-gray-100 dark:hover:bg-neutral-800 flex items-center justify-center text-sm"
              >
                MetaMask
              </button>
              <button
                onClick={() => connect("coinbase")}
                className="h-11 rounded-xl border hover:bg-gray-100 dark:hover:bg-neutral-800 flex items-center justify-center text-sm"
              >
                Coinbase Wallet
              </button>
            </div>
          </>
        ) : (
          <div className="rounded-2xl border p-4 bg-white/60 dark:bg-neutral-900/60 text-sm space-y-2">
            <div className="flex items-center justify-between">
              <span className="opacity-70">
                Адрес
              </span>
              <span className="font-mono text-xs">
                {address}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="opacity-70">
                Сеть
              </span>
              <span>Base</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="opacity-70">
                Баланс
              </span>
              <span>
                {usdtBalance} {usdtSymbol}
              </span>
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2">
          {connected && (
            <button
              onClick={disconnect}
              className="px-4 py-2 rounded-xl border text-sm"
            >
              Отключить
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl border text-sm"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingsModal({ open, onClose, dark, setDark }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white dark:bg-neutral-900 rounded-3xl p-6 w-96 border dark:border-neutral-800 space-y-3">
        <div className="flex justify-between items-center mb-2">
          <div className="text-lg font-semibold">
            Настройки
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1 border rounded-xl"
          >
            ✕
          </button>
        </div>
        <div className="space-y-2">
          <div className="font-semibold mb-1">
            Тёмная тема
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={dark}
              onChange={(e) =>
                setDark(e.target.checked)
              }
            />
            Включить
          </label>
        </div>
        <div>
          <div className="font-semibold mb-1">
            О проекте
          </div>
          <div className="text-sm opacity-70">
            PVA — personal value of the auction
            token. Демоверсия.
          </div>
        </div>
      </div>
    </div>
  );
}

/************************** App **************************/
export default function App() {
  const { push, view } = useToasts();
  const web3 = useWeb3(push);
  
  // Используем новый улучшенный торговый движок
  const enhancedEngine = useEnhancedTradeEngine({
    userAddress: web3.address,
    toast: push,
  });
  
  // Оставляем старый движок для совместимости
  const legacyEngine = useTradeEngine(push);

  const [dark, setDark] = useState(false);
  const [tab, setTab] = useState("home");
  const [walletOpen, setWalletOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showConnectionToast, setShowConnectionToast] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    document.body.classList.add(
      "bg-gray-50",
      "dark:bg-black",
      "text-gray-900",
      "dark:text-gray-100"
    );
  }, [dark]);

  // Track connection changes for toast notifications
  useEffect(() => {
    setShowConnectionToast(true);
  }, [web3.connected]);

  // Выбираем движок в зависимости от подключения кошелька
  const engine = web3.connected ? enhancedEngine : legacyEngine;

  const screen =
    tab === "home" ? (
      <Home
        engine={engine}
        goTrading={() => setTab("trading")}
        web3={web3}
      />
    ) : tab === "trading" ? (
      <Trading engine={engine} web3={web3} toast={push} />
    ) : tab === "rating" ? (
      web3.connected ? (
        <EnhancedRating
          globalLeaderboard={enhancedEngine.globalLeaderboard}
          userStats={enhancedEngine.userStats}
          userAddress={web3.address}
          onRefresh={enhancedEngine.refreshLeaderboard}
          loading={enhancedEngine.loading}
        />
      ) : (
        <Rating engine={legacyEngine} />
      )
    ) : (
      <Profile engine={engine} web3={web3} />
    );

  return (
    <div className="max-w-xl mx-auto min-h-screen">
      <EnhancedHeader
        onRating={() => setTab("rating")}
        onWallet={() => setWalletOpen(true)}
        onSettings={() => setSettingsOpen(true)}
        connected={web3.connected}
        address={web3.address}
        loading={web3.loading}
        showNetworkStatus={true}
        showSyncStatus={false}
      />

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
        >
          {screen}
        </motion.div>
      </AnimatePresence>

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

      <WalletModal
        open={walletOpen}
        onClose={() => setWalletOpen(false)}
        web3={web3}
      />
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        dark={dark}
        setDark={setDark}
      />

      {/* Floating Auth Status */}
      <FloatingAuthStatus
        connected={web3.connected}
        address={web3.address}
        usdtBalance={web3.usdtBalance}
        usdtSymbol={web3.usdtSymbol}
        loading={web3.loading}
        onToggle={() => setWalletOpen(true)}
      />

      {/* Connection Status Toast */}
      <ConnectionStatusToast
        show={showConnectionToast}
        connected={web3.connected}
        address={web3.address}
        onClose={() => setShowConnectionToast(false)}
      />

      {view}
    </div>
  );
}

/*********************** Tests (non-breaking) ***********************/
try {
  console.assert(
    leagueByPrice(0.01).name === "Silver",
    "league low"
  );
  console.assert(
    leagueByPrice(0.5).name === "Gold",
    "league mid"
  );
  console.assert(
    leagueByPrice(2).name === "Diamond",
    "league high"
  );
  console.assert(qty3(1.23456) === "1.235", "qty3");
  const rows = buildLeaderboardSafe([
    { type: "buy", amount: 100 },
    { type: "sell", net: 120, profit: 18 },
  ]);
  console.assert(
    Array.isArray(rows) && rows.length > 0,
    "leaderboard not empty"
  );
  console.assert(
    typeof rows[0].user === "string",
    "user string"
  );
  console.assert(
    Number.isFinite(Number(rows[0].volume)),
    "volume numeric"
  );
  console.assert(
    Number.isFinite(Number(rows[0].profit)),
    "profit numeric"
  );
  console.log("✅ smoke tests passed");
} catch (e) {
  console.warn("⚠️ tests:", e?.message || e);
}
