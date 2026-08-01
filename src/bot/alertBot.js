// Sends formatted flash signal alerts to your Telegram chat.

require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

let bot = null;
function getBot() {
  if (!TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is missing. Add it to your .env file.");
  }
  if (!bot) {
    bot = new TelegramBot(TOKEN, { polling: false });
  }
  return bot;
}

function formatSignalMessage(label, timeframe, signal) {
  const arrow = signal.direction === "LONG" ? "🟢 LONG" : "🔴 SHORT";
  const reasons = signal.reasons.map((r) => `  • ${r}`).join("\n");

  return (
    `⚡ *Flash Signal — ${label} (${timeframe})*\n\n` +
    `${arrow}\n` +
    `Confidence: ${signal.confidence}\n\n` +
    `Entry: ${signal.entry.toFixed(4)}\n` +
    `Stop Loss: ${signal.stopLoss.toFixed(4)}\n` +
    `Take Profit: ${signal.takeProfit.toFixed(4)}\n\n` +
    `Reasons:\n${reasons}\n\n` +
    `_Not financial advice. Risk-manage your position size._`
  );
}

async function sendSignalAlert(label, timeframe, signal) {
  if (!CHAT_ID) {
    throw new Error("TELEGRAM_CHAT_ID is missing. Add it to your .env file.");
  }
  const message = formatSignalMessage(label, timeframe, signal);
  return getBot().sendMessage(CHAT_ID, message, { parse_mode: "Markdown" });
}

async function sendMessage(text) {
  if (!CHAT_ID) {
    throw new Error("TELEGRAM_CHAT_ID is missing. Add it to your .env file.");
  }
  return getBot().sendMessage(CHAT_ID, text);
}

if (require.main === module) {
  (async () => {
    try {
      await sendMessage("✅ Bot connected successfully. This is a test message.");
      console.log("Test message sent. Check your Telegram.");
    } catch (err) {
      console.error("Bot test failed:", err.message);
    }
  })();
}

module.exports = { sendSignalAlert, sendMessage, formatSignalMessage };
