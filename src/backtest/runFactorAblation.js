// Factor ablation for the confluence strategy — kept for reference.
// Run with: npm run factor-ablation

require("dotenv").config();
const { fetchHistoricalOHLCV } = require("../data/cryptoFeed");
const { backtestAsset } = require("./engine");
const assets = require("../../config/assets");

const PRIMARY_TF = assets.timeframe.primary;
const CONFIRM_TF = assets.timeframe.confirm;
const PRIMARY_CANDLE_COUNT = 1100;
const CONFIRM_CANDLE_COUNT = Math.ceil(PRIMARY_CANDLE_COUNT / 4) + 50;

const NO_FILTERS = { useDaily: false, useLevels: false, useSession: false };
const FACTORS = ["trend", "higherTF", "macd", "rsi", "bollinger", "volume"];

const CONFIGS = [
  { name: "baseline (score >= 4)", flags: { ...NO_FILTERS, minScore: 4 } },
  { name: "stricter: score >= 5", flags: { ...NO_FILTERS, minScore: 5 } },
  { name: "strictest: score >= 6", flags: { ...NO_FILTERS, minScore: 6 } },
  ...FACTORS.map((factor) => ({
    name: `remove "${factor}" factor`,
    flags: { ...NO_FILTERS, minScore: 4, disabledFactors: [factor] }
  }))
];

function summarize(statsByAsset) {
  const withTrades = Object.values(statsByAsset).filter((s) => s && s.totalTrades > 0);
  if (withTrades.length === 0) return { totalTrades: 0, winRate: null, avgR: null };
  const totalTrades = withTrades.reduce((sum, s) => sum + s.totalTrades, 0);
  const totalWins = withTrades.reduce((sum, s) => sum + s.wins, 0);
  const weightedR = withTrades.reduce((sum, s) => sum + s.avgRMultiple * s.totalTrades, 0) / totalTrades;
  return { totalTrades, winRate: totalWins / totalTrades, avgR: weightedR };
}

async function fetchAllData() {
  const data = {};
  for (const asset of assets.crypto) {
    console.log(`Fetching ${asset.label}...`);
    try {
      data[asset.label] = {
        isFx: false,
        primary: await fetchHistoricalOHLCV(asset.symbol, PRIMARY_TF, PRIMARY_CANDLE_COUNT, asset.exchange),
        confirm: await fetchHistoricalOHLCV(asset.symbol, CONFIRM_TF, CONFIRM_CANDLE_COUNT, asset.exchange),
        daily: null
      };
    } catch (err) {
      console.error(`  Failed: ${err.message}`);
    }
  }
  return data;
}

async function main() {
  console.log("Fetching historical data once for all assets...\n");
  const allData = await fetchAllData();

  console.log("\n=== FACTOR ABLATION REPORT ===\n");
  const configResults = {};
  for (const config of CONFIGS) {
    const statsByAsset = {};
    for (const [label, d] of Object.entries(allData)) {
      const { stats } = backtestAsset(d.primary, d.confirm, d.daily, d.isFx, config.flags);
      statsByAsset[label] = stats;
    }
    configResults[config.name] = summarize(statsByAsset);
  }

  console.log(`${"Configuration".padEnd(34)} | ${"Trades".padEnd(8)} | ${"Win Rate".padEnd(10)} | Avg R`);
  console.log("-".repeat(76));
  for (const [name, summary] of Object.entries(configResults)) {
    if (summary.totalTrades === 0) {
      console.log(`${name.padEnd(34)} | No trades generated`);
      continue;
    }
    console.log(
      `${name.padEnd(34)} | ${String(summary.totalTrades).padEnd(8)} | ` +
      `${(summary.winRate * 100).toFixed(1)}%`.padEnd(10) + ` | ${summary.avgR.toFixed(3)}`
    );
  }
}

main();
