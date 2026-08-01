// Fetches OHLCV candles for crypto pairs using ccxt.
// No API key required — this hits each exchange's public market data endpoints.

const ccxt = require("ccxt");
const { crypto: cryptoAssets } = require("../../config/assets");

const DEFAULT_EXCHANGE_ID = process.env.CRYPTO_EXCHANGE || "binance";

const exchangeInstances = {};
function getExchange(exchangeId = DEFAULT_EXCHANGE_ID) {
  if (!exchangeInstances[exchangeId]) {
    const ExchangeClass = ccxt[exchangeId];
    if (!ExchangeClass) {
      throw new Error(`Exchange "${exchangeId}" not supported by ccxt.`);
    }
    // defaultType: 'spot' stops the library from also trying to load futures/
    // options market data we never use — that extra loading was causing
    // failures when Binance's futures endpoint (dapi.binance.com) was slow
    // or unreachable, even though we only ever fetch spot OHLCV.
    exchangeInstances[exchangeId] = new ExchangeClass({
      enableRateLimit: true,
      options: { defaultType: "spot" }
    });
  }
  return exchangeInstances[exchangeId];
}

async function fetchOHLCV(symbol, timeframe = "1h", limit = 200, exchangeId) {
  const exchange = getExchange(exchangeId);
  const raw = await exchange.fetchOHLCV(symbol, timeframe, undefined, limit);
  return raw.map(([time, open, high, low, close, volume]) => ({
    time,
    open,
    high,
    low,
    close,
    volume
  }));
}

/**
 * Fetch a longer run of historical candles by paginating past each exchange's
 * per-call limit (usually 500-1000). Used by the backtest engines.
 */
async function fetchHistoricalOHLCV(symbol, timeframe, totalCandles, exchangeId) {
  const exchange = getExchange(exchangeId);
  const perCallLimit = 1000;
  const timeframeMs = exchange.parseTimeframe(timeframe) * 1000;

  let since = exchange.milliseconds() - totalCandles * timeframeMs;
  const allCandles = [];

  while (allCandles.length < totalCandles) {
    const remaining = totalCandles - allCandles.length;
    const raw = await exchange.fetchOHLCV(symbol, timeframe, since, Math.min(perCallLimit, remaining));
    if (!raw || raw.length === 0) break;

    for (const [time, open, high, low, close, volume] of raw) {
      allCandles.push({ time, open, high, low, close, volume });
    }

    const lastTime = raw[raw.length - 1][0];
    since = lastTime + timeframeMs;

    if (raw.length < perCallLimit) break;
    await new Promise((r) => setTimeout(r, exchange.rateLimit || 200));
  }

  return allCandles;
}

async function fetchAllCrypto(timeframe = "1h", limit = 200) {
  const results = {};
  for (const asset of cryptoAssets) {
    try {
      results[asset.label] = await fetchOHLCV(asset.symbol, timeframe, limit, asset.exchange);
    } catch (err) {
      console.error(`Failed to fetch ${asset.symbol} (${asset.exchange || DEFAULT_EXCHANGE_ID}):`, err.message);
      results[asset.label] = null;
    }
  }
  return results;
}

if (require.main === module) {
  (async () => {
    const data = await fetchAllCrypto("1h", 5);
    for (const [label, candles] of Object.entries(data)) {
      console.log(`\n${label}:`);
      console.log(candles ? candles[candles.length - 1] : "FAILED");
    }
  })();
}

module.exports = { fetchOHLCV, fetchAllCrypto, fetchHistoricalOHLCV };
