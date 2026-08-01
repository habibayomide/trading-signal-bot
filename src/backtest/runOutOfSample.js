// Out-of-sample validation for the support/resistance strategy — splits
// history into an older half and recent half, tests both independently.
// Now uses the corrected longer max-hold window (see srEngine.js), so
// results here supersede the earlier out-of-sample run.
//
// Run with: npm run backtest:sr-oos

require("dotenv").config();
const { fetchHistoricalOHLCV } = require("../data/cryptoFeed");
const { backtestSRAsset } = require("./srEngine");
const assets = require("../../config/assets");

const PRIMARY_TF = assets.timeframe.primary;
const TOTAL_CANDLES = 5200;
const HALF_SIZE = Math.floor(TOTAL_CANDLES / 2);

function printReport(label, stats) {
  if (!stats || stats.totalTrades === 0) {
    console.log(`${label.padEnd(8)} | No trades triggered`);
    return;
  }
  console.log(
    `${label.padEnd(8)} | Trades: ${String(stats.totalTrades).padEnd(4)} | ` +
    `Win rate: ${(stats.winRate * 100).toFixed(1)}%`.padEnd(16) +
    ` | Avg R: ${stats.avgRMultiple.toFixed(2)}`
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
  console.log(`Fetching ${TOTAL_CANDLES} candles per asset, then splitting into older vs recent halves...\n`);

  const olderResults = {};
  const recentResults = {};

  for (const asset of assets.crypto) {
    console.log(`Fetching ${asset.label}...`);
    try {
      const candles = await fetchHistoricalOHLCV(asset.symbol, PRIMARY_TF, TOTAL_CANDLES, asset.exchange);
      const older = candles.slice(0, HALF_SIZE);
      const recent = candles.slice(candles.length - HALF_SIZE);

      olderResults[asset.label] = backtestSRAsset(older).stats;
      recentResults[asset.label] = backtestSRAsset(recent).stats;
    } catch (err) {
      console.error(`  Failed: ${err.message}`);
      olderResults[asset.label] = null;
      recentResults[asset.label] = null;
    }
  }

  console.log("\n=== OUT-OF-SAMPLE VALIDATION REPORT (support/resistance) ===\n");
  console.log("--- OLDER period ---");
  for (const [label, stats] of Object.entries(olderResults)) printReport(label, stats);

  console.log("\n--- RECENT period ---");
  for (const [label, stats] of Object.entries(recentResults)) printReport(label, stats);

  const olderOverall = combinedStats(Object.values(olderResults));
  const recentOverall = combinedStats(Object.values(recentResults));

  console.log("\n--- OVERALL COMPARISON ---");
  if (olderOverall) {
    console.log(`Older period:  ${olderOverall.totalTrades} trades, ${(olderOverall.winRate * 100).toFixed(1)}% win rate, avg R ${olderOverall.avgR.toFixed(3)}`);
  } else {
    console.log("Older period: no trades generated");
  }
  if (recentOverall) {
    console.log(`Recent period: ${recentOverall.totalTrades} trades, ${(recentOverall.winRate * 100).toFixed(1)}% win rate, avg R ${recentOverall.avgR.toFixed(3)}`);
  } else {
    console.log("Recent period: no trades generated");
  }

  if (olderOverall && recentOverall) {
    if (olderOverall.avgR > 0 && recentOverall.avgR > 0) {
      console.log("\nPositive expectancy holds in BOTH periods — a real, more trustworthy signal of edge.");
    } else {
      console.log("\nNot consistently positive across both periods — treat with skepticism.");
    }
  }
}

main();
