// Confluence strategy: a signal only fires when multiple independent factors
// agree, AND passes a set of filters. Supports per-factor disable toggles and
// a configurable score threshold for ablation testing.

function findPivotLevels(candles, currentIndex, lookback = 100, radius = 3) {
  const start = Math.max(0, currentIndex - lookback);
  const end = currentIndex - radius;
  const resistances = [];
  const supports = [];

  for (let i = start + radius; i <= end; i++) {
    if (i < 0 || i - radius < 0 || i + radius >= candles.length) continue;
    const window = candles.slice(i - radius, i + radius + 1);
    const highs = window.map((c) => c.high);
    const lows = window.map((c) => c.low);
    if (candles[i].high === Math.max(...highs)) resistances.push(candles[i].high);
    if (candles[i].low === Math.min(...lows)) supports.push(candles[i].low);
  }

  return { resistances, supports };
}

function getDailyTrend(dailyInd) {
  if (!dailyInd || dailyInd.ema50 == null) return null;
  if (dailyInd.ema20 > dailyInd.ema50) return "BULLISH";
  if (dailyInd.ema20 < dailyInd.ema50) return "BEARISH";
  return null;
}

function isActiveSession(timestampMs) {
  const hourUTC = new Date(timestampMs).getUTCHours();
  return hourUTC >= 7 && hourUTC <= 21;
}

function evaluate(ind, indHigherTF, recentCandles, options = {}) {
  const reasons = [];
  let bullScore = 0;
  let bearScore = 0;
  const disabled = new Set(options.disabledFactors || []);

  if (!disabled.has("trend") && ind.ema20 > ind.ema50) {
    bullScore++;
    reasons.push("EMA20 > EMA50 (uptrend)");
  } else if (!disabled.has("trend") && ind.ema20 < ind.ema50) {
    bearScore++;
    reasons.push("EMA20 < EMA50 (downtrend)");
  }

  if (!disabled.has("higherTF") && indHigherTF?.ema20 != null && indHigherTF?.ema50 != null) {
    if (indHigherTF.ema20 > indHigherTF.ema50) {
      bullScore++;
      reasons.push("4h trend also bullish");
    } else if (indHigherTF.ema20 < indHigherTF.ema50) {
      bearScore++;
      reasons.push("4h trend also bearish");
    }
  }

  const macdHistNow = ind.macd?.histogram;
  const macdHistPrev = ind.macdPrev?.histogram;
  if (!disabled.has("macd") && macdHistNow != null && macdHistPrev != null) {
    if (macdHistPrev < 0 && macdHistNow > 0) {
      bullScore++;
      reasons.push("MACD histogram flipped bullish");
    } else if (macdHistPrev > 0 && macdHistNow < 0) {
      bearScore++;
      reasons.push("MACD histogram flipped bearish");
    }
  }

  if (!disabled.has("rsi") && ind.rsi14 != null) {
    if (ind.rsi14 > 50 && ind.rsi14 < 70) {
      bullScore++;
      reasons.push(`RSI ${ind.rsi14.toFixed(1)} — bullish with room left`);
    } else if (ind.rsi14 < 50 && ind.rsi14 > 30) {
      bearScore++;
      reasons.push(`RSI ${ind.rsi14.toFixed(1)} — bearish with room left`);
    }
  }

  if (!disabled.has("bollinger") && ind.bollinger && ind.price != null) {
    if (ind.price > ind.bollinger.upper) {
      bullScore++;
      reasons.push("Price broke above upper Bollinger Band");
    } else if (ind.price < ind.bollinger.lower) {
      bearScore++;
      reasons.push("Price broke below lower Bollinger Band");
    }
  }

  if (
    !disabled.has("volume") &&
    recentCandles && recentCandles.length >= 10 && recentCandles[0].volume != null
  ) {
    const last = recentCandles[recentCandles.length - 1];
    const avgVol = recentCandles.slice(-11, -1).reduce((sum, c) => sum + c.volume, 0) / 10;
    if (last.volume > avgVol * 1.5) {
      if (bullScore > bearScore) {
        bullScore++;
        reasons.push("Volume spike confirming move");
      } else if (bearScore > bullScore) {
        bearScore++;
        reasons.push("Volume spike confirming move");
      }
    }
  }

  const MIN_SCORE_TO_FIRE = options.minScore ?? 4;
  const direction =
    bullScore >= MIN_SCORE_TO_FIRE && bullScore > bearScore
      ? "LONG"
      : bearScore >= MIN_SCORE_TO_FIRE && bearScore > bullScore
      ? "SHORT"
      : null;

  if (!direction) return null;

  if (options.dailyInd && options.useDailyFilter !== false) {
    const dailyTrend = getDailyTrend(options.dailyInd);
    if (dailyTrend === "BULLISH" && direction === "SHORT") return null;
    if (dailyTrend === "BEARISH" && direction === "LONG") return null;
  }

  const atr = ind.atr14 ?? ind.price * 0.01;
  if (options.levelCandles && options.levelCandlesIndex != null && options.useLevelFilter !== false) {
    const { resistances, supports } = findPivotLevels(options.levelCandles, options.levelCandlesIndex);
    if (direction === "LONG") {
      const nearestResistance = resistances.filter((r) => r > ind.price).sort((a, b) => a - b)[0];
      if (nearestResistance && nearestResistance - ind.price < atr) return null;
    } else {
      const nearestSupport = supports.filter((s) => s < ind.price).sort((a, b) => b - a)[0];
      if (nearestSupport && ind.price - nearestSupport < atr) return null;
    }
  }

  if (options.isFx && options.timestamp != null && options.useSessionFilter !== false) {
    if (!isActiveSession(options.timestamp)) return null;
  }

  const SL_MULT = 2.0;
  const TP_MULT = 4.5;
  const entry = ind.price;
  const stopLoss = direction === "LONG" ? entry - atr * SL_MULT : entry + atr * SL_MULT;
  const takeProfit = direction === "LONG" ? entry + atr * TP_MULT : entry - atr * TP_MULT;

  return {
    direction,
    confidence: Math.max(bullScore, bearScore),
    reasons,
    entry,
    stopLoss,
    takeProfit
  };
}

module.exports = { evaluate, findPivotLevels, getDailyTrend, isActiveSession };
