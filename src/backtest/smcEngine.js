// Backtest wrapper for the Smart Money Concepts (BOS/CHoCH) strategy.
// Reuses the same trade simulation and stats aggregation as the other engines,
// but with a much longer max-hold window: CHoCH signals target full structural
// swing reversals, which naturally take longer to play out than a tight
// intraday confluence setup. The default 30-candle (30h) timeout was cutting
// these trades off before they had a fair chance to reach SL or TP.

const { simulateTrade, computeStats } = require("./engine");
const smc = require("../strategy/smartMoney");

const WARMUP_CANDLES = 160; // enough history for swing detection + RSI
const MAX_HOLD_CANDLES = 150; // ~6 days on 1h candles — structural moves need room to develop

function backtestSMCAsset(candles, options = {}) {
  const trades = [];
  let inTrade = false;
  let tradeExitIndex = -1;

  for (let i = WARMUP_CANDLES; i < candles.length; i++) {
    if (inTrade && i <= tradeExitIndex) continue;
    inTrade = false;

    const signal = smc.evaluate(candles, i, options);

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

module.exports = { backtestSMCAsset };
