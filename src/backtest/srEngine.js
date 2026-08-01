// Backtest wrapper for the support/resistance strategy. Uses a longer
// max-hold window than the confluence default, same reasoning as the SMC
// engine — targets are set at structural levels which can take longer than
// 30 candles to reach.

const { simulateTrade, computeStats } = require("./engine");
const sr = require("../strategy/supportResistance");

const WARMUP_CANDLES = 160;
const MAX_HOLD_CANDLES = 100; // ~4 days on 1h candles

function backtestSRAsset(candles, options = {}) {
  const trades = [];
  let inTrade = false;
  let tradeExitIndex = -1;

  for (let i = WARMUP_CANDLES; i < candles.length; i++) {
    if (inTrade && i <= tradeExitIndex) continue;
    inTrade = false;

    const signal = sr.evaluate(candles, i, options);

    if (signal) {
      const result = simulateTrade(candles, i, signal, MAX_HOLD_CANDLES);
      trades.push({
        entryTime: candles[i].time,
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

module.exports = { backtestSRAsset };
