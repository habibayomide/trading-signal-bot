// FX/XAU data feed via Twelve Data. Kept in the codebase but unused now that
// config/assets.js has twelveData: [] — crypto-only going forward.

require("dotenv").config();
const axios = require("axios");

const BASE_URL = "https://api.twelvedata.com/time_series";
const API_KEY = process.env.TWELVE_DATA_API_KEY;

async function fetchCandles(symbol, interval = "1h", outputsize = 200) {
  if (!API_KEY) {
    throw new Error("TWELVE_DATA_API_KEY is missing. Add it to your .env file.");
  }

  const { data } = await axios.get(BASE_URL, {
    params: { symbol, interval, outputsize, apikey: API_KEY }
  });

  if (data.status === "error") {
    throw new Error(`Twelve Data error for ${symbol}: ${data.message}`);
  }

  return data.values
    .map((v) => ({
      time: new Date(v.datetime).getTime(),
      open: parseFloat(v.open),
      high: parseFloat(v.high),
      low: parseFloat(v.low),
      close: parseFloat(v.close),
      volume: v.volume ? parseFloat(v.volume) : null
    }))
    .reverse();
}

module.exports = { fetchCandles };
