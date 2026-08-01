// The always-on scheduler — checks all crypto assets every hour and sends
// a Telegram alert only when a real signal fires. Currently wired to the
// confluence strategy; can be pointed at supportResistance or smartMoney
// once one of them shows validated out-of-sample edge.

require("dotenv").config();
const fs = require("fs");
const path = require("path");

const { fetchOHLCV } = require("./data/cryptoFeed");
const { computeLatest } = require("./indicators");
const { evaluate } = require("./strategy/confluence");
const { sendSignalAlert, sendMessage } = require("./bot/alertBot");
const assets = require("../config/assets");

const PRIMARY_TF = assets.timeframe.primary;
const CONFIRM_TF = assets.timeframe.confirm;
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

const STATE_FILE = path.join(__dirname, "..", "data", "lastSignals.json");

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

let lastSignals = loadState();

async function checkCrypto(asset) {
  const primary = await fetchOHLCV(asset.symbol, PRIMARY_TF, 250, asset.exchange);
  const confirm = await fetchOHLCV(asset.symbol, CONFIRM_TF, 250, asset.exchange);
  const daily = await fetchOHLCV(asset.symbol, "1d", 100, asset.exchange);

  const ind = computeLatest(primary);
  const indHigher = computeLatest(confirm);
  const dailyInd = computeLatest(daily);
  const recent = primary.slice(-20);
  const lastIndex = primary.length - 1;

  return evaluate(ind, indHigher, recent, {
    dailyInd,
    levelCandles: primary,
    levelCandlesIndex: lastIndex,
    isFx: false
  });
}

function isNewSignal(label, signal) {
  const previous = lastSignals[label];
  if (!signal) return false;
  if (!previous) return true;
  return previous !== signal.direction;
}

async function runCycle() {
  const timestamp = new Date().toISOString();
  console.log(`\n[${timestamp}] Running check cycle...`);

  for (const asset of assets.crypto) {
    try {
      const signal = await checkCrypto(asset);
      if (isNewSignal(asset.label, signal)) {
        console.log(`  ${asset.label}: NEW ${signal.direction} signal — sending alert`);
        await sendSignalAlert(asset.label, PRIMARY_TF, signal);
        lastSignals[asset.label] = signal.direction;
        saveState(lastSignals);
      } else if (signal) {
        console.log(`  ${asset.label}: ${signal.direction} signal persists — already alerted`);
      } else {
        console.log(`  ${asset.label}: no signal`);
        if (lastSignals[asset.label]) {
          delete lastSignals[asset.label];
          saveState(lastSignals);
        }
      }
    } catch (err) {
      console.error(`  ${asset.label}: check failed — ${err.message}`);
    }
  }

  console.log(`[${timestamp}] Cycle complete. Next check in ${CHECK_INTERVAL_MS / 60000} minutes.`);
}

async function start() {
  console.log("Trading signal bot starting up...");
  console.log(`Watching ${assets.crypto.length} crypto pairs`);
  console.log(`Primary timeframe: ${PRIMARY_TF}, confirmation timeframe: ${CONFIRM_TF}`);

  try {
    await sendMessage("🤖 Trading signal bot is now live and watching the markets.");
  } catch (err) {
    console.error("Could not reach Telegram on startup:", err.message);
  }

  await runCycle();
  setInterval(runCycle, CHECK_INTERVAL_MS);
}

start();
