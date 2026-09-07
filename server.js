"use strict";
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 4000;

let shopeeToken = process.env.SHOPEE_TOKEN || "";
const apiKey = process.env.API_KEY || "";
const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN || "";
const telegramChatID = process.env.TELEGRAM_CHAT_ID || "";
const qrisStatic = process.env.QRIS_STATIC || "";
const hfToken = process.env.HF_TOKEN || "";
const spaceUrl = (process.env.SPACE_URL || "https://nuxys-apake-search.hf.space").replace(/\/+$/, "");

const qrisStore = new Map();
const usedTransactionIds = new Map();
let tokenValid = true;
let tokenNotifSent = false;

const logs = [];
const MAX_LOGS = 100;

function logEvent(level, message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level}] ${message}`);
  logs.push({ timestamp, level, message });
  if (logs.length > MAX_LOGS) {
    logs.shift();
  }
}

// ================= USER & TOKEN DATABASE (FILE-BACKED) =================
const USERS_FILE = path.join(__dirname, "users_db.json");
const VOUCHERS_FILE = path.join(__dirname, "vouchers_db.json");

function loadUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      return JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
    }
  } catch (e) {
    logEvent("ERROR", `Failed reading users_db: ${e.message}`);
  }
  return {};
}

function saveUsers(users) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
  } catch (e) {
    logEvent("ERROR", `Failed saving users_db: ${e.message}`);
  }
}

function getUser(userKey) {
  const users = loadUsers();
  if (!users[userKey]) {
    // New user gets 1 free trial token!
    users[userKey] = {
      tokens: 1,
      created: new Date().toISOString(),
      totalSearches: 0
    };
    saveUsers(users);
  }
  return users[userKey];
}

function updateUserTokens(userKey, delta) {
  const users = loadUsers();
  if (!users[userKey]) {
    users[userKey] = { tokens: 1, created: new Date().toISOString(), totalSearches: 0 };
  }
  users[userKey].tokens = Math.max(0, (users[userKey].tokens || 0) + delta);
  saveUsers(users);
  return users[userKey].tokens;
}

function loadVouchers() {
  try {
    if (fs.existsSync(VOUCHERS_FILE)) {
      return JSON.parse(fs.readFileSync(VOUCHERS_FILE, "utf8"));
    }
  } catch (e) {}
  return {};
}

function saveVouchers(vouchers) {
  try {
    fs.writeFileSync(VOUCHERS_FILE, JSON.stringify(vouchers, null, 2), "utf8");
  } catch (e) {}
}

const userAgents = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0",
];

function randomUA() {
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

const statusMap = {
  1: "pending",
  2: "failed",
  3: "success",
  4: "refunded",
  5: "expired",
};

app.use(cors({ origin: "*", credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

function apiKeyMiddleware(req, res, next) {
  let key = req.headers["x-api-key"] || req.query.api_key;
  if (!key || key !== apiKey) {
    return res.status(401).json({ success: false, error: "Invalid or missing API key" });
  }
  next();
}

function formatTransaction(t) {
  const date = new Date(t.createTime * 1000);
  const offset = 7 * 60;
  const wibTime = new Date(date.getTime() + offset * 60 * 1000);

  const pad = (n) => String(n).padStart(2, "0");
  const formattedTime = `${wibTime.getUTCFullYear()}-${pad(wibTime.getUTCMonth() + 1)}-${pad(wibTime.getUTCDate())} ${pad(wibTime.getUTCHours())}:${pad(wibTime.getUTCMinutes())}:${pad(wibTime.getUTCSeconds())}`;

  let cleanAmount = String(t.amount || "0").replace(/\./g, "").replace(/,/g, "");
  const amount = parseInt(cleanAmount, 10) || 0;
  let status = statusMap[t.status] || `unknown_${t.status}`;

  return { amount, status, time: formattedTime };
}

function getReqToken(req) {
  return req.headers["x-shopee-token"] || shopeeToken;
}

async function callShopeeAPI(startTime, endTime, pageSize, nextPos, token = shopeeToken) {
  const payload = {
    data: {
      metadata: {
        token: token,
        language: "id",
        timezone: "Asia/Jakarta",
      },
      pageSize: pageSize,
      filter: {
        startTime: startTime,
        endTime: endTime,
        serviceList: [1, 3],
      },
      sorter: {
        field: "createTime",
        order: "descend",
      },
      next_position: nextPos || "",
    },
  };

  const headers = {
    "Content-Type": "application/json",
    Origin: "https://partner.shopee.co.id",
    Referer: "https://partner.shopee.co.id/",
    "User-Agent": randomUA(),
    "X-Timestamp-Ms": String(Date.now()),
  };

  const response = await axios.post(
    "https://shopeepay.shopee.co.id/merchant/v1/partner-web/get-transaction-list",
    payload,
    { headers, timeout: 20000 }
  );

  return response.data;
}

async function callShopeeDetailAPI(orderSN, token = shopeeToken) {
  const payload = {
    data: {
      metadata: {
        token: token,
        language: "id",
        timezone: "Asia/Jakarta",
      },
      orderSN: orderSN,
    },
  };

  const headers = {
    "Content-Type": "application/json",
    Origin: "https://partner.shopee.co.id",
    Referer: "https://partner.shopee.co.id/",
    "User-Agent": randomUA(),
    "X-Timestamp-Ms": String(Date.now()),
  };

  const response = await axios.post(
    "https://shopeepay.shopee.co.id/merchant/v1/partner-web/get-transaction-detail",
    payload,
    { headers, timeout: 15000 }
  );

  return response.data;
}

function parseTLV(data) {
  const result = [];
  let i = 0;
  while (i < data.length) {
    if (i + 4 > data.length) break;
    const tag = data.slice(i, i + 2);
    const length = parseInt(data.slice(i + 2, i + 4), 10);
    if (isNaN(length)) break;
    i += 4;
    if (i + length > data.length) break;
    const value = data.slice(i, i + length);
    i += length;
    result.push([tag, value]);
  }
  return result;
}

function buildTLV(fields) {
  let res = "";
  for (const f of fields) {
    const tag = f[0];
    const val = f[1];
    res += tag + String(val.length).padStart(2, "0") + val;
  }
  return res;
}

function crc16CCITT(data) {
  let crc = 0xFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function generateDynamicQRIS(staticQRIS, amount) {
  if (!staticQRIS) {
    throw new Error("QRIS_STATIC belum diset di .env");
  }

  const fields = parseTLV(staticQRIS);
  if (fields.length === 0) {
    throw new Error("invalid QRIS format");
  }

  const newFields = [];
  let hasAmount = false;
  for (const f of fields) {
    if (f[0] === "63") continue;
    if (f[0] === "54") {
      newFields.push(["54", String(amount)]);
      hasAmount = true;
      continue;
    }
    newFields.push(f);
  }

  if (!hasAmount) {
    const withAmount = [];
    for (const f of newFields) {
      withAmount.push(f);
      if (f[0] === "53") {
        withAmount.push(["54", String(amount)]);
      }
    }
    newFields.length = 0;
    newFields.push(...withAmount);
  }

  let qrisWithoutCRC = buildTLV(newFields);
  qrisWithoutCRC += "6304";
  const crc = crc16CCITT(qrisWithoutCRC);
  return qrisWithoutCRC + crc;
}

// ================= PUBLIC SHIELD & PAYMENT ENDPOINTS =================

// 1. PUBLIC CHECKOUT (NO API KEY REQUIRED)
app.post("/api/public/checkout", (req, res) => {
  const { amount, tokens, userKey } = req.body;
  const amt = parseInt(amount, 10);
  const tokenCount = parseInt(tokens, 10) || 1;

  if (!amt || amt <= 0 || !userKey) {
    return res.status(400).json({ success: false, error: "Parameter tidak valid" });
  }

  try {
    const qris = generateDynamicQRIS(qrisStatic, amt);
    const id = crypto.randomBytes(4).toString("hex");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    qrisStore.set(id, {
      data: qris,
      expiresAt: expiresAt,
      amount: amt,
      tokens: tokenCount,
      userKey: userKey,
    });

    const host = req.get("host");
    const scheme = req.protocol;
    const qrURL = `${scheme}://${host}/qr/${id}`;

    res.json({
      success: true,
      data: {
        qris_url: qrURL,
        invoice_id: id,
        amount: amt,
        tokens: tokenCount,
        expires_in: "15 menit"
      }
    });
  } catch (err) {
    logEvent("ERROR", `Gagal generate QRIS: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. PUBLIC CHECK PAYMENT & AUTO-CREDIT TOKEN
app.post("/api/public/check-payment", async (req, res) => {
  const { amount, startTime, userKey, tokens } = req.body;
  if (!amount || !userKey) {
    return res.status(400).json({ success: false, error: "Parameter tidak lengkap" });
  }

  const nowUnix = Math.floor(Date.now() / 1000);
  let startUnix = parseInt(startTime, 10);
  if (isNaN(startUnix) || startUnix === 0) {
    startUnix = nowUnix - 15 * 60;
  }

  const expectedAmount = Number(amount);

  try {
    const result = await callShopeeAPI(startUnix, nowUnix, 30, "", shopeeToken);
    if (!result || result.code !== 0) {
      return res.status(500).json({ success: false, error: "Gagal cek ShopeePay" });
    }

    const list = (result.data && result.data.list) || [];
    const match = list.find((tx) => {
      const cleanAmount = String(tx.amount || "0").replace(/\./g, "").replace(/,/g, "");
      const txAmount = parseInt(cleanAmount, 10) || 0;
      const txId = tx.transactionId || tx.displayTransactionId;
      return tx.status === 3 && txAmount === expectedAmount && tx.createTime >= startUnix && !usedTransactionIds.has(txId);
    });

    if (!match) {
      return res.json({ success: true, paid: false });
    }

    const txId = match.transactionId || match.displayTransactionId;
    usedTransactionIds.set(txId, match.createTime);

    // AUTO CREDIT TOKENS ON SERVER
    const tokensToAdd = parseInt(tokens, 10) || 1;
    const newBalance = updateUserTokens(userKey, tokensToAdd);

    logEvent("INFO", `[LUNAS] User ${userKey} bayar Rp ${amount}. Token ditambah +${tokensToAdd}. Sisa: ${newBalance}`);

    let issuer = "QRIS / ShopeePay";
    try {
      const detail = await callShopeeDetailAPI(match.displayTransactionId || match.transactionId, shopeeToken);
      if (detail && detail.code === 0 && detail.data && detail.data.issuer) {
        issuer = detail.data.issuer;
      }
    } catch (e) {}

    res.json({
      success: true,
      paid: true,
      new_balance: newBalance,
      transaction: {
        transactionId: txId,
        amount: expectedAmount,
        issuer: issuer,
        time: new Date().toISOString()
      }
    });

  } catch (err) {
    logEvent("ERROR", `Check payment error: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. PUBLIC USER BALANCE
app.get("/api/public/balance", (req, res) => {
  const userKey = req.query.userKey;
  if (!userKey) return res.status(400).json({ success: false, error: "Missing userKey" });
  const user = getUser(userKey);
  res.json({ success: true, tokens: user.tokens });
});

// 4. PUBLIC REDEEM VOUCHER
app.post("/api/public/redeem-voucher", (req, res) => {
  const { code, userKey } = req.body;
  if (!code || !userKey) return res.status(400).json({ success: false, error: "Missing parameters" });

  const cleanCode = code.trim().toUpperCase();
  const vouchers = loadVouchers();

  // Support built-in trial codes
  if (cleanCode === "GHS-TRIAL-1" || cleanCode === "TRIAL10K") {
    const user = getUser(userKey);
    if (!user.claimedTrial) {
      user.claimedTrial = true;
      const newBal = updateUserTokens(userKey, 1);
      return res.json({ success: true, tokens_awarded: 1, new_balance: newBal });
    } else {
      return res.status(400).json({ success: false, error: "Kode trial sudah pernah Anda klaim!" });
    }
  }

  if (!vouchers[cleanCode]) {
    return res.status(400).json({ success: false, error: "Kode voucher tidak valid atau salah" });
  }
  if (vouchers[cleanCode].used) {
    return res.status(400).json({ success: false, error: "Kode voucher sudah pernah digunakan" });
  }

  const tokensAwarded = vouchers[cleanCode].tokens || 1;
  vouchers[cleanCode].used = true;
  vouchers[cleanCode].usedBy = userKey;
  vouchers[cleanCode].usedAt = new Date().toISOString();
  saveVouchers(vouchers);

  const newBalance = updateUserTokens(userKey, tokensAwarded);
  res.json({
    success: true,
    tokens_awarded: tokensAwarded,
    new_balance: newBalance
  });
});

// 5. PUBLIC SEARCH PROXY (SHIELD TO HUGGING FACE DUCKDB)
app.post("/api/public/search", async (req, res) => {
  const { userKey, query, city, district, address, gender, limit } = req.body;
  if (!userKey) return res.status(400).json({ success: false, error: "Missing userKey" });

  const user = getUser(userKey);
  if (user.tokens <= 0) {
    return res.status(402).json({
      success: false,
      error: "TOKEN_HABIS",
      message: "Saldo token pencarian Anda habis. Silakan top up untuk melanjutkan."
    });
  }

  const searchTerm = query || city || address || district;
  if (!searchTerm) {
    return res.status(400).json({ success: false, error: "Kata kunci pencarian kosong" });
  }

  try {
    const startTime = Date.now();
    const headers = { "Content-Type": "application/json" };
    if (hfToken) {
      headers["Authorization"] = `Bearer ${hfToken}`;
    }

    // 1. Post to Gradio call
    const callRes = await axios.post(`${spaceUrl}/gradio_api/call/gradio_search`, {
      data: [searchTerm]
    }, { headers, timeout: 30000 });

    const eventId = callRes.data && callRes.data.event_id;
    if (!eventId) {
      throw new Error("Gagal mendapatkan event_id dari DuckDB Cloud");
    }

    // 2. Fetch event stream
    const streamRes = await axios.get(`${spaceUrl}/gradio_api/call/gradio_search/${eventId}`, {
      headers,
      timeout: 45000,
      responseType: "text"
    });

    const streamText = streamRes.data;
    let records = [];
    const lines = streamText.split("\n");
    for (let line of lines) {
      if (line.startsWith("data:")) {
        try {
          const rawData = JSON.parse(line.substring(5).trim());
          if (Array.isArray(rawData) && rawData[0]) {
            const tableObj = rawData[0];
            const tableHeaders = tableObj.headers || ['NIK', 'Nama', 'Kelamin', 'TglLahir', 'Telp', 'Alamat', 'Kelurahan', 'Kecamatan', 'KabKota'];
            const rows = tableObj.data || [];
            records = rows.map(r => {
              let obj = {};
              tableHeaders.forEach((h, i) => obj[h] = r[i]);
              return obj;
            });
          }
        } catch (e) {}
      }
    }

    // Apply filters
    if (city) records = records.filter(r => (r.KabKota || '').toLowerCase().includes(city.toLowerCase()));
    if (district) records = records.filter(r => ((r.Kecamatan || '') + ' ' + (r.Kelurahan || '')).toLowerCase().includes(district.toLowerCase()));
    if (address) records = records.filter(r => (r.Alamat || '').toLowerCase().includes(address.toLowerCase()));
    if (gender) records = records.filter(r => (r.Kelamin || '').toLowerCase().includes(gender.toLowerCase()));

    const finalResults = records.slice(0, parseInt(limit, 10) || 30);
    const duration = ((Date.now() - startTime) / 1000).toFixed(3);

    // DEDUCT 1 TOKEN ONLY ON SUCCESS
    const remaining = updateUserTokens(userKey, -1);
    user.totalSearches = (user.totalSearches || 0) + 1;
    saveUsers(loadUsers());

    logEvent("INFO", `[SEARCH] User ${userKey} searched "${searchTerm}". Deducted 1 token. Sisa: ${remaining}`);

    res.json({
      success: true,
      results: finalResults,
      duration: duration,
      remaining_tokens: remaining
    });

  } catch (err) {
    logEvent("ERROR", `Pencarian gagal: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ================= EXISTING ADMIN ENDPOINTS =================
app.get("/", (req, res) => {
  res.send("ShopeePay API Gateway & Token Shield Running");
});

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "ShopeePay API Service is running",
    timestamp: new Date().toISOString()
  });
});

app.post("/api/admin/generate-voucher", apiKeyMiddleware, (req, res) => {
  const { tokens } = req.body;
  const count = parseInt(tokens, 10) || 1;
  const randomPart = crypto.randomBytes(3).toString("hex").toUpperCase();
  const code = `GHS-${count}-${randomPart}`;

  const vouchers = loadVouchers();
  vouchers[code] = {
    tokens: count,
    used: false,
    created: new Date().toISOString()
  };
  saveVouchers(vouchers);

  res.json({ success: true, code, tokens: count });
});

app.post("/update-token", apiKeyMiddleware, (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ success: false, error: "Provide token in body" });
  }
  shopeeToken = token;
  logEvent("INFO", "Token updated via API");
  res.json({ success: true, data: { message: "Token updated" } });
});

app.get("/token-status", apiKeyMiddleware, (req, res) => {
  const status = tokenValid ? "valid" : "invalid";
  res.json({
    success: tokenValid,
    data: {
      token_status: status,
      message: tokenValid ? "Token is working" : "Token expired/invalid",
    },
  });
});

app.post("/create-qris", apiKeyMiddleware, (req, res) => {
  const { amount } = req.body;
  if (!amount || amount <= 0) {
    return res.status(400).json({ success: false, error: "Provide valid amount" });
  }

  try {
    const qris = generateDynamicQRIS(qrisStatic, amount);
    const id = crypto.randomBytes(4).toString("hex");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    qrisStore.set(id, { data: qris, expiresAt: expiresAt });

    const host = req.get("host");
    const scheme = req.protocol;
    const qrURL = `${scheme}://${host}/qr/${id}`;

    res.json({
      success: true,
      data: {
        qris_url: qrURL,
        amount: amount,
        expires_at: expiresAt.toISOString(),
        expires_in: "15 menit"
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/qr/:id", (req, res) => {
  const { id } = req.params;
  const entry = qrisStore.get(id);
  if (!entry) return res.status(404).send("QR not found");
  if (Date.now() > entry.expiresAt.getTime()) {
    qrisStore.delete(id);
    return res.status(410).send("QR expired");
  }

  const qrAPIURL = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(entry.data)}`;
  res.redirect(302, qrAPIURL);
});

app.post("/check-payment", apiKeyMiddleware, async (req, res) => {
  const { amount, startTime } = req.body;
  if (!amount || amount <= 0) {
    return res.status(400).json({ success: false, error: "Provide valid amount" });
  }

  const reqToken = getReqToken(req);
  const nowUnix = Math.floor(Date.now() / 1000);
  let startUnix = parseInt(startTime, 10) || (nowUnix - 30 * 60);

  try {
    const result = await callShopeeAPI(startUnix, nowUnix, 50, "", reqToken);
    if (!result || result.code !== 0) {
      return res.status(500).json({ success: false, error: "Empty response from ShopeePay API" });
    }

    const list = (result.data && result.data.list) || [];
    const expectedAmount = Number(amount);

    const match = list.find((tx) => {
      const cleanAmount = String(tx.amount || "0").replace(/\./g, "").replace(/,/g, "");
      const txAmount = parseInt(cleanAmount, 10) || 0;
      const txId = tx.transactionId || tx.displayTransactionId;
      return tx.status === 3 && txAmount === expectedAmount && tx.createTime >= startUnix && !usedTransactionIds.has(txId);
    });

    if (!match) {
      return res.json({ success: true, paid: false });
    }

    const txId = match.transactionId || match.displayTransactionId;
    usedTransactionIds.set(txId, match.createTime);

    const trx = formatTransaction(match);
    res.json({
      success: true,
      paid: true,
      transaction: {
        transactionId: txId,
        amount: trx.amount,
        status: trx.status,
        time: trx.time,
        issuer: "QRIS / ShopeePay"
      }
    });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/transactions", apiKeyMiddleware, async (req, res) => {
  const now = Math.floor(Date.now() / 1000);
  let startTime = parseInt(req.query.startTime, 10) || (now - 3 * 24 * 3600);
  let endTime = parseInt(req.query.endTime, 10) || now;
  let pageSize = parseInt(req.query.pageSize, 10) || 10;
  const nextPos = req.query.next_position || "";

  try {
    const result = await callShopeeAPI(startTime, endTime, pageSize, nextPos, getReqToken(req));
    if (!result || result.code !== 0) {
      return res.status(400).json({ success: false, error: result?.msg || "API error" });
    }

    const list = (result.data && result.data.list) || [];
    const formatted = list.map(formatTransaction);

    res.json({
      success: true,
      total_amount: (result.data && result.data.totalNetSales) || "0",
      data: { transactions: formatted }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/logs", apiKeyMiddleware, (req, res) => {
  res.json({ success: true, data: { logs: logs } });
});

app.listen(PORT, () => {
  console.log(`ShopeePay API & Token Shield running at http://localhost:${PORT}`);
});
