# Trading Signal Bot (Crypto, 1h)

Signal bot for BTC, ETH, SOL, HYPE, SUI, APT, OP, ARB. Free to run — no paid APIs required.
FX/XAU pairs were tested and dropped (no consistent edge shown, and the strategies
weren't purpose-built for FX market structure).

**This is not financial advice.** Every strategy here has been backtested and none
has yet shown validated, out-of-sample-confirmed positive expectancy. Do not run
`npm start` against real capital until a strategy passes out-of-sample validation.

## Strategies built so far

1. **Confluence** (`src/strategy/confluence.js`) — stacks EMA/RSI/MACD/Bollinger/volume.
   Tested extensively (filters, factor removal, thresholds) — no configuration showed
   real edge. Currently the one wired into `src/index.js` (the live bot), but not
   recommended for live trading given the backtest results.
2. **Support/Resistance** (`src/strategy/supportResistance.js`) — bounces off zones
   price has respected before. Showed a small positive edge on the most recent
   ~2,600 candles, but that did NOT hold up out-of-sample on an older period —
   classic curve-fitting warning sign. Needs re-testing with the corrected longer
   hold window (see below) before drawing new conclusions.
3. **Smart Money Concepts / BOS-CHoCH** (`src/strategy/smartMoney.js`) — structure-based:
   tracks swing highs/lows, trades Change of Character (trend reversal) breaks.
   Most recent addition, results still being evaluated.

## Important fix: max trade hold time

The backtest engine originally force-closed any trade after 30 hourly candles (30h).
That was fine for the confluence strategy's tighter ATR-based targets, but both the
support/resistance and SMC strategies target structural price levels that can take
much longer to reach — the 30-candle cap was cutting trades off as "timeouts" before
they had a fair chance to hit their real stop or target, understating true performance.
This has been fixed: `simulateTrade()` in `src/backtest/engine.js` now accepts a
configurable hold window, with `srEngine.js` using 100 candles and `smcEngine.js`
using 150 candles.

## Setup

1. Install Node.js 18+: https://nodejs.org
2. `npm install` (on WSL, run `sudo apt install -y build-essential python3` first,
   for the native `better-sqlite3` module)
3. `cp .env.example .env` and fill in your Telegram bot token + chat ID
   (`TWELVE_DATA_API_KEY` is no longer needed since FX pairs were dropped)

## Commands

```
npm run test:crypto-feed   # confirms crypto data pulls correctly (no key needed)
npm run test:bot           # sends a test message to your Telegram
npm run backtest           # confluence strategy backtest
npm run backtest:sr        # support/resistance strategy backtest
npm run backtest:sr-oos    # support/resistance out-of-sample validation (older vs recent)
npm run backtest:smc       # SMC (BOS/CHoCH) backtest, with older/recent split built in
npm run ablation           # confluence filter ablation (reference/historical)
npm run factor-ablation    # confluence factor ablation (reference/historical)
npm start                  # live bot — NOT recommended until a strategy validates
```

## Next steps

- Re-run `backtest:sr-oos` and `backtest:smc` with the corrected hold-window fix
  and compare against the earlier (flawed) results
- If either strategy shows positive expectancy in BOTH the older and recent periods,
  that's the first real candidate for paper trading before considering live capital
- Trade-tracking feature (accept/track trades via Telegram buttons, PnL summary) is
  still queued, pending a strategy that actually validates
