const { computeLatest } = require("../indicators");

function findSwings(candles, currentIndex, config = {}) {
  const lookback = config.lookback ?? 150;
  const radius = config.radius ?? 3;
  const start = Math.max(0, currentIndex - lookback);
  const end = currentIndex - radius;
  const swings = [];

  for (let i = start + radius; i <= end; i++) {
    if (i - radius < 0 || i + radius >= candles.length) continue;
    const window = candles.slice(i - radius, i + radius + 1);
    const highs = window.map((c) => c.high);
    const lows = window.map((c) => c.low);
    if (candles[i].high === Math.max(...highs)) swings.push({ index: i, price: candles[i].high, type: "high" });
    if (candles[i].low === Math.min(...lows)) swings.push({ index: i, price: candles[i].low, type: "low" });
  }

  return swings.sort((a, b) => a.index - b.index);
}

function getStructure(swings) {
  const highs = swings.filter((s) => s.type === "high");
  const lows = swings.filter((s) => s.type === "low");
  if (highs.length < 2 || lows.length < 2) return null;

  const lastHigh = highs[highs.length - 1];
  const prevHigh = highs[highs.length - 2];
  const lastLow = lows[lows.length - 1];
  const prevLow = lows[lows.length - 2];

  let trend = null;
  if (lastHigh.price > prevHigh.price && lastLow.price > prevLow.price) trend = "UP";
  else if (lastHigh.price < prevHigh.price && lastLow.price < prevLow.price) trend = "DOWN";

  return { trend, lastHigh, prevHigh, lastLow, prevLow };
}

function evaluate(candles, currentIndex, options = {}) {
  const window = candles.slice(0, currentIndex + 1);
  const ind = computeLatest(window);
  const atr = ind.atr14 ?? ind.price * 0.01;
  const current = candles[currentIndex];
  const minRR = options.minRR ?? 1.5;

  if (ind.rsi14 == null) return null;

  const swings = findSwings(candles, currentIndex, options);
  const structure = getStructure(swings);
  if (!structure || !structure.trend) return null;

  const { trend, lastHigh, prevHigh, lastLow, prevLow } = structure;

  if (trend === "UP" && current.close < lastLow.price && ind.rsi14 < 50) {
    const stopLoss = lastHigh.price + atr * 0.3;
    const risk = stopLoss - current.close;
    const structuralTarget = prevLow.price < current.close ? prevLow.price : null;
    const takeProfit = structuralTarget ?? current.close - risk * 2;
    const reward = current.close - takeProfit;

    if (risk > 0 && reward / risk >= minRR) {
      return {
        direction: "SHORT",
        confidence: 1,
        reasons: [
          `Bearish CHoCH — broke below prior swing low at ${lastLow.price.toFixed(4)}`,
          `RSI ${ind.rsi14.toFixed(1)} confirms bearish momentum`,
          structuralTarget ? "Target set at next structural swing low" : "Target set at 2x risk (no clear structure level)"
        ],
        entry: current.close,
        stopLoss,
        takeProfit
      };
    }
  }

  if (trend === "DOWN" && current.close > lastHigh.price && ind.rsi14 > 50) {
    const stopLoss = lastLow.price - atr * 0.3;
    const risk = current.close - stopLoss;
    const structuralTarget = prevHigh.price > current.close ? prevHigh.price : null;
    const takeProfit = structuralTarget ?? current.close + risk * 2;
    const reward = takeProfit - current.close;

    if (risk > 0 && reward / risk >= minRR) {
      return {
        direction: "LONG",
        confidence: 1,
        reasons: [
          `Bullish CHoCH — broke above prior swing high at ${lastHigh.price.toFixed(4)}`,
          `RSI ${ind.rsi14.toFixed(1)} confirms bullish momentum`,
          structuralTarget ? "Target set at next structural swing high" : "Target set at 2x risk (no clear structure level)"
        ],
        entry: current.close,
        stopLoss,
        takeProfit
      };
    }
  }

  return null;
}

module.exports = { evaluate, findSwings, getStructure };
