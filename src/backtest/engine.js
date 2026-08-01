// Backtest engine — walks through historical candles bar-by-bar, running the
// exact same strategy logic the live bot uses, and simulates what would have
// happened to each signal (hit take-profit, hit stop-loss, or timed out).
//
// This is the piece that turns "here's a strategy" into real numbers:
// win rate, average R, expectancy, max drawdown — measured, not guessed.

const { computeLatest } = require("../indicators");
const { evaluate } = require("../strategy/confluence");

const WARMUP_CANDLES = 210; // EMA200 needs 200+ candles before it's valid
const DEFAULT_MAX_HOLD_CANDLES = 30; // default timeout, appropriate for confluence/S/R intraday setups

/**
 * Find the most recent confirm-timeframe candle that closed at or before
 * the given primary-timeframe timestamp (avoids lookahead bias).
 */
function findConfirmIndex(confirmCandles, timestamp) {
  let idx = -1;
  for (let i = 0; i < confirmCandles.length; i++) {
    if (confirmCandles[i].time <= timestamp) {
      idx = i;
    } else {
      break;
    }
  }
  return idx;
}

/**
 * Simulate a single trade forward from its entry candle to find its outcome.
 * @param {Array} primaryCandles
 * @param {number} entryIndex
 * @param {object} signal
 * @param {number} [maxHoldCandles] override the default timeout — pass a larger
 *   value for strategies that target bigger structural moves (e.g. SMC/BOS-CHoCH),
 *   which naturally take longer to play out than a tight intraday confluence setup.
 */
function simulateTrade(primaryCandles, entryIndex, signal, maxHoldCandles = DEFAULT_MAX_HOLD_CANDLES) {
  const { direction, stopLoss, takeProfit, entry } = signal;

  for (let i = entryIndex + 1; i < primaryCandles.length && i <= entryIndex + maxHoldCandles; i++) {
    const candle = primaryCandles[i];

    if (direction === "LONG") {
      if (candle.low <= stopLoss) {
        return { outcome: "LOSS", exitPrice: stopLoss, exitIndex: i, rMultiple: -1 };
      }
      if (candle.high >= takeProfit) {
        const risk = entry - stopLoss;
        const reward = takeProfit - entry;
        return { outcome: "WIN", exitPrice: takeProfit, exitIndex: i, rMultiple: reward / risk };
      }
    } else {
      // SHORT
      if (candle.high >= stopLoss) {
        return { outcome: "LOSS", exitPrice: stopLoss, exitIndex: i, rMultiple: -1 };
      }
      if (candle.low <= takeProfit) {
        const risk = stopLoss - entry;
        const reward = entry - takeProfit;
        return { outcome: "WIN", exitPrice: takeProfit, exitIndex: i, rMultiple: reward / risk };
      }
    }
  }

  // Timed out — close at whatever price the last checked candle closed at
  const lastIdx = Math.min(entryIndex + maxHoldCandles, primaryCandles.length - 1);
  const exitPrice = primaryCandles[lastIdx].close;
  const risk = direction === "LONG" ? entry - stopLoss : stopLoss - entry;
  const rawReturn = direction === "LONG" ? exitPrice - entry : entry - exitPrice;
  return { outcome: "TIMEOUT", exitPrice, exitIndex: lastIdx, rMultiple: rawReturn / risk };
}

/**
 * Run a full backtest for one asset (confluence strategy).
 * @param {Array} primaryCandles historical candles on the primary timeframe (e.g. 1h)
 * @param {Array} confirmCandles historical candles on the confirm timeframe (e.g. 4h)
 * @param {Array} [dailyCandles] historical daily candles, enables the daily trend filter
 * @param {boolean} [isFx] true for FX/XAU assets, enables the session filter
 * @param {object} [filterConfig] useDaily/useLevels/useSession toggles, minScore, disabledFactors
 * @returns {{trades: Array, stats: object}}
 */
function backtestAsset(primaryCandles, confirmCandles, dailyCandles = null, isFx = false, filterConfig = {}) {
  const { useDaily = true, useLevels = true, useSession = true, ...restConfig } = filterConfig;
  const trades = [];
  let inTrade = false;
  let tradeExitIndex = -1;

  for (let i = WARMUP_CANDLES; i < primaryCandles.length; i++) {
    if (inTrade && i <= tradeExitIndex) continue; // don't overlap trades on the same asset
    inTrade = false;

    const window = primaryCandles.slice(0, i + 1);
    const ind = computeLatest(window);

    const confirmIdx = findConfirmIndex(confirmCandles, primaryCandles[i].time);
    if (confirmIdx < WARMUP_CANDLES / 4) continue;
    const confirmWindow = confirmCandles.slice(0, confirmIdx + 1);
    const indHigher = computeLatest(confirmWindow);

    const recent = window.slice(-20);

    const options = {
      isFx: isFx && useSession,
      timestamp: primaryCandles[i].time,
      ...restConfig
    };
    if (useLevels) {
      options.levelCandles = window;
      options.levelCandlesIndex = i;
    }
    if (useDaily && dailyCandles) {
      const dailyIdx = findConfirmIndex(dailyCandles, primaryCandles[i].time);
      if (dailyIdx >= 55) {
        options.dailyInd = computeLatest(dailyCandles.slice(0, dailyIdx + 1));
      }
    }

    const signal = evaluate(ind, indHigher, recent, options);

    if (signal) {
      const result = simulateTrade(primaryCandles, i, signal);
      trades.push({
        entryTime: primaryCandles[i].time,
        direction: signal.direction,
        entry: signal.entry,
        stopLoss: signal.stopLoss,
        takeProfit: signal.takeProfit,
        confidence: signal.confidence,
        ...result
      });
      inTrade = true;
      tradeExitIndex = result.exitIndex;
    }
  }

  return { trades, stats: computeStats(trades) };
}

/**
 * Aggregate raw trade results into the numbers that actually matter.
 */
function computeStats(trades) {
  if (trades.length === 0) {
    return {
      totalTrades: 0,
      wins: 0,
      losses: 0,
      timeouts: 0,
      winRate: null,
      avgRMultiple: null,
      expectancy: null,
      maxConsecutiveLosses: 0
    };
  }

  const wins = trades.filter((t) => t.outcome === "WIN").length;
  const losses = trades.filter((t) => t.outcome === "LOSS").length;
  const timeouts = trades.filter((t) => t.outcome === "TIMEOUT").length;
  const totalR = trades.reduce((sum, t) => sum + t.rMultiple, 0);
  const avgRMultiple = totalR / trades.length;
  const winRate = wins / trades.length;
  const expectancy = avgRMultiple;

  let maxConsecutiveLosses = 0;
  let currentStreak = 0;
  for (const t of trades) {
    if (t.outcome === "LOSS") {
      currentStreak++;
      maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentStreak);
    } else {
      currentStreak = 0;
    }
  }

  return {
    totalTrades: trades.length,
    wins,
    losses,
    timeouts,
    winRate,
    avgRMultiple,
    expectancy,
    maxConsecutiveLosses
  };
}

module.exports = { backtestAsset, computeStats, simulateTrade };
