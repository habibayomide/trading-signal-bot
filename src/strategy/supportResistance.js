// Support/Resistance strategy — bounces off zones price has respected before,
// confirmed by RSI, targeting the next opposing structural level.

const { computeLatest } = require("../indicators");

function findZones(candles, currentIndex, atr, config = {}) {
  const lookback = config.lookback ?? 150;
  const radius = config.radius ?? 3;
  const mergeTolerance = atr * (config.mergeToleranceATR ?? 0.5);

  const start = Math.max(0, currentIndex - lookback);
  const end = currentIndex - radius;
  const rawHighs = [];
  const rawLows = [];

  for (let i = start + radius; i <= end; i++) {
    if (i - radius < 0 || i + radius >= candles.length) continue;
    const window = candles.slice(i - radius, i + radius + 1);
    const highs = window.map((c) => c.high);
    const lows = window.map((c) => c.low);
    if (candles[i].high === Math.max(...highs)) rawHighs.push(candles[i].high);
    if (candles[i].low === Math.min(...lows)) rawLows.push(candles[i].low);
  }

  function cluster(prices) {
    const sorted = [...prices].sort((a, b) => a - b);
    const zones = [];
    for (const p of sorted) {
      const zone = zones.find((z) => Math.abs(z.price - p) <= mergeTolerance);
      if (zone) {
        zone.price = (zone.price * zone.touches + p) / (zone.touches + 1);
        zone.touches++;
      } else {
        zones.push({ price: p, touches: 1 });
      }
    }
    return zones;
  }

  return { resistances: cluster(rawHighs), supports: cluster(rawLows) };
}

function evaluate(candles, currentIndex, options = {}) {
  const window = candles.slice(0, currentIndex + 1);
  const ind = computeLatest(window);
  const atr = ind.atr14 ?? ind.price * 0.01;
  const price = ind.price;
  const current = candles[currentIndex];
  const minTouches = options.minTouches ?? 2;
  const minRR = options.minRR ?? 1.5;

  if (ind.rsi14 == null) return null;

  const { resistances, supports } = findZones(candles, currentIndex, atr);

  const nearSupport = supports
    .filter((z) => z.touches >= minTouches)
    .find((z) => current.low <= z.price + atr * 0.3 && current.low >= z.price - atr * 0.7);

  if (nearSupport && current.close > nearSupport.price && ind.rsi14 < 45) {
    const nextResistance = resistances.filter((z) => z.price > price).sort((a, b) => a.price - b.price)[0];
    const stopLoss = nearSupport.price - atr * 0.5;
    const risk = price - stopLoss;
    const takeProfit = nextResistance ? nextResistance.price : price + risk * 2;
    const reward = takeProfit - price;

    if (risk > 0 && reward / risk >= minRR) {
      return {
        direction: "LONG",
        confidence: nearSupport.touches,
        reasons: [
          `Bounce off support tested ${nearSupport.touches}x before`,
          `RSI ${ind.rsi14.toFixed(1)} — room to run upward`,
          nextResistance ? "Target set at next resistance zone" : "Target set at 2x risk"
        ],
        entry: price,
        stopLoss,
        takeProfit
      };
    }
  }

  const nearResistance = resistances
    .filter((z) => z.touches >= minTouches)
    .find((z) => current.high >= z.price - atr * 0.3 && current.high <= z.price + atr * 0.7);

  if (nearResistance && current.close < nearResistance.price && ind.rsi14 > 55) {
    const nextSupport = supports.filter((z) => z.price < price).sort((a, b) => b.price - a.price)[0];
    const stopLoss = nearResistance.price + atr * 0.5;
    const risk = stopLoss - price;
    const takeProfit = nextSupport ? nextSupport.price : price - risk * 2;
    const reward = price - takeProfit;

    if (risk > 0 && reward / risk >= minRR) {
      return {
        direction: "SHORT",
        confidence: nearResistance.touches,
        reasons: [
          `Rejection at resistance tested ${nearResistance.touches}x before`,
          `RSI ${ind.rsi14.toFixed(1)} — room to fall`,
          nextSupport ? "Target set at next support zone" : "Target set at 2x risk"
        ],
        entry: price,
        stopLoss,
        takeProfit
      };
    }
  }

  return null;
}

module.exports = { evaluate, findZones };
