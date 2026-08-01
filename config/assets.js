// Central place to manage what the bot watches.

module.exports = {
  timeframe: {
    primary: "1h", // main signal timeframe
    confirm: "4h" // used to confirm trend direction before firing a signal
  },

  crypto: [
    { symbol: "BTC/USDT", label: "BTC" },
    { symbol: "ETH/USDT", label: "ETH" },
    { symbol: "SOL/USDT", label: "SOL" },
    { symbol: "HYPE/USDT", label: "HYPE", exchange: "bybit" }, // not listed on Binance
    { symbol: "SUI/USDT", label: "SUI" },
    { symbol: "APT/USDT", label: "APT" },
    { symbol: "OP/USDT", label: "OP" },
    { symbol: "ARB/USDT", label: "ARB" }
  ],

  // FX/XAU removed — crypto-only going forward. Left as an empty array
  // (rather than deleting the key) so nothing else in the codebase breaks.
  twelveData: []
};
