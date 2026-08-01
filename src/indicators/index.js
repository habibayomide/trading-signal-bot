const { EMA, RSI, MACD, BollingerBands, ATR } = require("technicalindicators");

function closes(candles) {
  return candles.map((c) => c.close);
}

function ema(candles, period) {
  return EMA.calculate({ period, values: closes(candles) });
}

function rsi(candles, period = 14) {
  return RSI.calculate({ period, values: closes(candles) });
}

function macd(candles, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  return MACD.calculate({
    values: closes(candles),
    fastPeriod,
    slowPeriod,
    signalPeriod,
    SimpleMAOscillator: false,
    SimpleMASignal: false
  });
}

function bollinger(candles, period = 20, stdDev = 2) {
  return BollingerBands.calculate({ period, values: closes(candles), stdDev });
}

function atr(candles, period = 14) {
  return ATR.calculate({
    period,
    high: candles.map((c) => c.high),
    low: candles.map((c) => c.low),
    close: candles.map((c) => c.close)
  });
}

function computeLatest(candles) {
  const ema20 = ema(candles, 20);
  const ema50 = ema(candles, 50);
  const ema200 = ema(candles, 200);
  const rsi14 = rsi(candles, 14);
  const macdVals = macd(candles);
  const bb = bollinger(candles, 20, 2);
  const atr14 = atr(candles, 14);

  return {
    price: candles[candles.length - 1].close,
    ema20: ema20[ema20.length - 1],
    ema50: ema50[ema50.length - 1],
    ema200: ema200[ema200.length - 1] ?? null,
    rsi14: rsi14[rsi14.length - 1],
    macd: macdVals[macdVals.length - 1],
    macdPrev: macdVals[macdVals.length - 2],
    bollinger: bb[bb.length - 1],
    atr14: atr14[atr14.length - 1]
  };
}

module.exports = { ema, rsi, macd, bollinger, atr, computeLatest };
