// Trade journal storage — plain JSON file, no database needed. Tracks trades
// you actually took manually (independent of any bot-generated signal), so
// you can measure your real performance over time.

const fs = require("fs");
const path = require("path");

const JOURNAL_FILE = path.join(__dirname, "..", "..", "data", "journal.json");

function load() {
  try {
    return JSON.parse(fs.readFileSync(JOURNAL_FILE, "utf8"));
  } catch {
    return { nextId: 1, trades: [] };
  }
}

function save(data) {
  fs.writeFileSync(JOURNAL_FILE, JSON.stringify(data, null, 2));
}

function addTrade({ asset, direction, entry, stopLoss, takeProfit, size }) {
  const data = load();
  const trade = {
    id: data.nextId,
    asset: asset.toUpperCase(),
    direction: direction.toUpperCase(),
    entry,
    stopLoss,
    takeProfit,
    size: size ?? null,
    status: "OPEN",
    openTime: new Date().toISOString(),
    exitPrice: null,
    closeTime: null,
    rMultiple: null,
    pnl: null
  };
  data.trades.push(trade);
  data.nextId++;
  save(data);
  return trade;
}

function closeTrade(id, exitPrice) {
  const data = load();
  const trade = data.trades.find((t) => t.id === id && t.status === "OPEN");
  if (!trade) return null;

  const risk = Math.abs(trade.entry - trade.stopLoss);
  const rawReturn = trade.direction === "LONG" ? exitPrice - trade.entry : trade.entry - exitPrice;
  const rMultiple = risk > 0 ? rawReturn / risk : 0;

  trade.status = "CLOSED";
  trade.exitPrice = exitPrice;
  trade.closeTime = new Date().toISOString();
  trade.rMultiple = rMultiple;
  trade.pnl = trade.size != null ? trade.size * rMultiple : null;

  save(data);
  return trade;
}

function getOpenTrades() {
  return load().trades.filter((t) => t.status === "OPEN");
}

function getClosedTrades() {
  return load().trades.filter((t) => t.status === "CLOSED");
}

function getTradeById(id) {
  return load().trades.find((t) => t.id === id) || null;
}

function getSummary() {
  const closed = getClosedTrades();
  if (closed.length === 0) {
    return { totalTrades: 0, wins: 0, losses: 0, winRate: null, avgR: null, totalR: null, totalPnl: null };
  }

  const wins = closed.filter((t) => t.rMultiple > 0).length;
  const losses = closed.filter((t) => t.rMultiple <= 0).length;
  const totalR = closed.reduce((sum, t) => sum + t.rMultiple, 0);
  const avgR = totalR / closed.length;
  const hasPnl = closed.every((t) => t.pnl != null);
  const totalPnl = hasPnl ? closed.reduce((sum, t) => sum + t.pnl, 0) : null;

  return {
    totalTrades: closed.length,
    wins,
    losses,
    winRate: wins / closed.length,
    avgR,
    totalR,
    totalPnl
  };
}

module.exports = { addTrade, closeTrade, getOpenTrades, getClosedTrades, getTradeById, getSummary };
