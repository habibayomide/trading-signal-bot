// Trade journal Telegram bot — listens for commands so you can log trades
// you actually took, close them out, and check your PnL, all from Telegram.
//
// Commands:
//   /log SYMBOL DIRECTION ENTRY STOP TARGET [SIZE]
//     e.g. /log BTC LONG 65000 64000 68000 100
//     SIZE is optional — dollar amount you're risking, enables $ PnL tracking
//   /close ID EXITPRICE
//     e.g. /close 3 66500
//   /open        — list currently open trades
//   /history     — list closed trades
//   /pnl         — overall performance summary
//   /start, /help — show this list
//
// Run with: npm run journal

require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const journal = require("../journal/store");

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN is missing. Add it to your .env file.");
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

function fmt(n) {
  return typeof n === "number" ? n.toFixed(4).replace(/\.?0+$/, "") : n;
}

const WELCOME_MESSAGE =
  "👋 Welcome to your trade journal bot.\n\n" +
  "Commands:\n\n" +
  "/log SYMBOL DIRECTION ENTRY STOP TARGET [SIZE]\n" +
  "  e.g. /log BTC LONG 65000 64000 68000 100\n" +
  "  SIZE is optional — $ amount risked, enables $ PnL\n\n" +
  "/close ID EXITPRICE\n" +
  "  e.g. /close 3 66500\n\n" +
  "/open — list open trades\n" +
  "/history — list closed trades\n" +
  "/pnl — overall performance summary";

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, WELCOME_MESSAGE);
});

bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id, WELCOME_MESSAGE);
});

bot.onText(/\/log (.+)/, (msg, match) => {
  const parts = match[1].trim().split(/\s+/);
  if (parts.length < 5) {
    bot.sendMessage(msg.chat.id, "Usage: /log SYMBOL DIRECTION ENTRY STOP TARGET [SIZE]");
    return;
  }
  const [asset, direction, entryStr, stopStr, targetStr, sizeStr] = parts;

  if (!["LONG", "SHORT"].includes(direction.toUpperCase())) {
    bot.sendMessage(msg.chat.id, 'Direction must be "LONG" or "SHORT".');
    return;
  }

  const entry = parseFloat(entryStr);
  const stopLoss = parseFloat(stopStr);
  const takeProfit = parseFloat(targetStr);
  const size = sizeStr ? parseFloat(sizeStr) : undefined;

  if ([entry, stopLoss, takeProfit].some((n) => isNaN(n))) {
    bot.sendMessage(msg.chat.id, "Entry, stop, and target must be numbers.");
    return;
  }

  const trade = journal.addTrade({ asset, direction, entry, stopLoss, takeProfit, size });
  const risk = Math.abs(entry - stopLoss);
  const reward = Math.abs(takeProfit - entry);
  const rr = risk > 0 ? (reward / risk).toFixed(2) : "n/a";

  bot.sendMessage(
    msg.chat.id,
    `✅ Logged trade #${trade.id}\n\n` +
      `${trade.asset} ${trade.direction}\n` +
      `Entry: ${fmt(entry)}\nStop: ${fmt(stopLoss)}\nTarget: ${fmt(takeProfit)}\n` +
      `Risk:Reward — 1:${rr}` +
      (size ? `\nSize: $${size}` : "") +
      `\n\nClose it later with: /close ${trade.id} <exit price>`
  );
});

bot.onText(/\/close (\S+)\s+(\S+)/, (msg, match) => {
  const id = parseInt(match[1], 10);
  const exitPrice = parseFloat(match[2]);

  if (isNaN(id) || isNaN(exitPrice)) {
    bot.sendMessage(msg.chat.id, "Usage: /close ID EXITPRICE — e.g. /close 3 66500");
    return;
  }

  const trade = journal.closeTrade(id, exitPrice);
  if (!trade) {
    bot.sendMessage(msg.chat.id, `No open trade found with id ${id}. Check /open for your open trade IDs.`);
    return;
  }

  const outcome = trade.rMultiple > 0 ? "🟢 WIN" : trade.rMultiple < 0 ? "🔴 LOSS" : "⚪ BREAKEVEN";
  bot.sendMessage(
    msg.chat.id,
    `Closed trade #${trade.id} — ${outcome}\n\n` +
      `${trade.asset} ${trade.direction}\n` +
      `Entry: ${fmt(trade.entry)} → Exit: ${fmt(exitPrice)}\n` +
      `R multiple: ${trade.rMultiple.toFixed(2)}` +
      (trade.pnl != null ? `\nPnL: $${trade.pnl.toFixed(2)}` : "")
  );
});

bot.onText(/\/open/, (msg) => {
  const open = journal.getOpenTrades();
  if (open.length === 0) {
    bot.sendMessage(msg.chat.id, "No open trades.");
    return;
  }
  const lines = open.map(
    (t) => `#${t.id} ${t.asset} ${t.direction} — entry ${fmt(t.entry)}, stop ${fmt(t.stopLoss)}, target ${fmt(t.takeProfit)}`
  );
  bot.sendMessage(msg.chat.id, `Open trades:\n\n${lines.join("\n")}`);
});

bot.onText(/\/history/, (msg) => {
  const closed = journal.getClosedTrades();
  if (closed.length === 0) {
    bot.sendMessage(msg.chat.id, "No closed trades yet.");
    return;
  }
  const lines = closed
    .slice(-15)
    .map((t) => {
      const outcome = t.rMultiple > 0 ? "WIN" : t.rMultiple < 0 ? "LOSS" : "BE";
      return `#${t.id} ${t.asset} ${t.direction} — ${outcome} (${t.rMultiple.toFixed(2)}R)`;
    });
  bot.sendMessage(msg.chat.id, `Recent closed trades (last 15):\n\n${lines.join("\n")}`);
});

bot.onText(/\/pnl/, (msg) => {
  const s = journal.getSummary();
  if (s.totalTrades === 0) {
    bot.sendMessage(msg.chat.id, "No closed trades yet — nothing to summarize.");
    return;
  }
  bot.sendMessage(
    msg.chat.id,
    `📊 Performance summary\n\n` +
      `Total closed trades: ${s.totalTrades}\n` +
      `Wins: ${s.wins} | Losses: ${s.losses}\n` +
      `Win rate: ${(s.winRate * 100).toFixed(1)}%\n` +
      `Avg R per trade: ${s.avgR.toFixed(2)}\n` +
      `Total R: ${s.totalR.toFixed(2)}` +
      (s.totalPnl != null ? `\nTotal PnL: $${s.totalPnl.toFixed(2)}` : "\n\n(Add a SIZE when logging trades to also track $ PnL.)")
  );
});

console.log("Journal bot running — listening for /log, /close, /open, /history, /pnl, /help");
