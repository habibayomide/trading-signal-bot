// Runs the confluence strategy backtest across all crypto assets.
// Run with: npm run backtest

require("dotenv").config();
const { fetchHistoricalOHLCV } = require("../data/cryptoFeed");
const { backtestAsset } = require("./engine");
const assets = require("../../config/assets");

const PRIMARY_TF = assets.timeframe.primary;
const CONFIRM_TF = assets.timeframe.confirm;
const PRIMARY_CANDLE_COUNT = 3000;
const CONFIRM_CANDLE_COUNT = Math.ceil(PRIMARY_CANDLE_COUNT / 4) + 50;

function printAssetReport(label, stats) {
  if (stats.totalTrades === 0) {
    console.log(`${label.padEnd(8)} | No trades triggered in this period`);
    return;
  }
  console.log(
    `${label.padEnd(8)} | Trades: ${String(stats.totalTrades).padEnd(4)} | ` +
    `Win rate: ${(stats.winRate * 100).toFixed(1)}%`.padEnd(16) +
    ` | Avg R: ${stats.avgRMultiple.toFixed(2)}`.padEnd(14) +
    ` | Wins/Losses/Timeouts: ${stats.wins}/${stats.losses}/${stats.timeouts}` +
    ` | Max loss streak: ${stats.maxConsecutiveLosses}`
  );
}

async function main() {
  console.log(`Running backtest — primary: ${PRIMARY_TF}, confirm: ${CONFIRM_TF}\n`);

  const results = {};
  for (const asset of assets.crypto) {
    console.log(`Fetching history for ${asset.label}...`);
    try {
      const primary = await fetchHistoricalOHLCV(asset.symbol, PRIMARY_TF, PRIMARY_CANDLE_COUNT, asset.exchange);
      const confirm = await fetchHistoricalOHLCV(asset.symbol, CONFIRM_TF, CONFIRM_CANDLE_COUNT, asset.exchange);
      const daily = await fetchHistoricalOHLCV(asset.symbol, "1d", 300, asset.exchange);
      const { stats } = backtestAsset(primary, confirm, daily, false);
      results[asset.label] = stats;
    } catch (err) {
      console.error(`Backtest failed for ${asset.label}: ${err.message}`);
      results[asset.label] = null;
    }
  }

  console.log("\n=== BACKTEST REPORT ===\n");
  for (const [label, stats] of Object.entries(results)) {
    if (stats) printAssetReport(label, stats);
    else console.log(`${label.padEnd(8)} | FAILED`);
  }

  const allTrades = Object.values(results).filter(Boolean).filter((s) => s.totalTrades > 0);
  if (allTrades.length > 0) {
    const totalTrades = allTrades.reduce((sum, s) => sum + s.totalTrades, 0);
    const totalWins = allTrades.reduce((sum, s) => sum + s.wins, 0);
    const weightedR = allTrades.reduce((sum, s) => sum + s.avgRMultiple * s.totalTrades, 0) / totalTrades;

    console.log("\n--- OVERALL ---");
    console.log(`Total trades: ${totalTrades}`);
    console.log(`Win rate: ${((totalWins / totalTrades) * 100).toFixed(1)}%`);
    console.log(`Avg R multiple: ${weightedR.toFixed(2)}`);
  }
}

main();
