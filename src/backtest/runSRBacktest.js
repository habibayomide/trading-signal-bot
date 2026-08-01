// Runs the support/resistance strategy backtest across all crypto assets.
// Run with: npm run backtest:sr

require("dotenv").config();
const { fetchHistoricalOHLCV } = require("../data/cryptoFeed");
const { backtestSRAsset } = require("./srEngine");
const assets = require("../../config/assets");

const PRIMARY_TF = assets.timeframe.primary;
const CANDLE_COUNT = 2500;

function printAssetReport(label, stats) {
  if (!stats || stats.totalTrades === 0) {
    console.log(`${label.padEnd(8)} | No trades triggered`);
    return;
  }
  console.log(
    `${label.padEnd(8)} | Trades: ${String(stats.totalTrades).padEnd(4)} | ` +
    `Win rate: ${(stats.winRate * 100).toFixed(1)}%`.padEnd(16) +
    ` | Avg R: ${stats.avgRMultiple.toFixed(2)}`.padEnd(14) +
    ` | W/L/T: ${stats.wins}/${stats.losses}/${stats.timeouts}` +
    ` | Max loss streak: ${stats.maxConsecutiveLosses}`
  );
}

function combinedStats(statsList) {
  const withTrades = statsList.filter((s) => s && s.totalTrades > 0);
  if (withTrades.length === 0) return null;
  const totalTrades = withTrades.reduce((sum, s) => sum + s.totalTrades, 0);
  const totalWins = withTrades.reduce((sum, s) => sum + s.wins, 0);
  const weightedR = withTrades.reduce((sum, s) => sum + s.avgRMultiple * s.totalTrades, 0) / totalTrades;
  return { totalTrades, winRate: totalWins / totalTrades, avgR: weightedR };
}

async function main() {
  console.log(`Running support/resistance backtest — timeframe: ${PRIMARY_TF}\n`);

  const results = {};
  for (const asset of assets.crypto) {
    console.log(`Fetching ${asset.label}...`);
    try {
      const candles = await fetchHistoricalOHLCV(asset.symbol, PRIMARY_TF, CANDLE_COUNT, asset.exchange);
      results[asset.label] = backtestSRAsset(candles).stats;
    } catch (err) {
      console.error(`  Failed: ${err.message}`);
      results[asset.label] = null;
    }
  }

  console.log("\n=== SUPPORT/RESISTANCE BACKTEST REPORT ===\n");
  for (const [label, stats] of Object.entries(results)) printAssetReport(label, stats);

  const overall = combinedStats(Object.values(results));
  if (overall) {
    console.log("\n--- OVERALL ---");
    console.log(`${overall.totalTrades} trades, ${(overall.winRate * 100).toFixed(1)}% win rate, avg R ${overall.avgR.toFixed(2)}`);
    console.log(overall.avgR > 0 ? "Positive expectancy in this sample." : "Still negative expectancy in this sample.");
  }
}

main();
