// server.ts
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import dotenv from "dotenv";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, deleteDoc } from "firebase/firestore";

// src/utils/initialOrders.ts
var INITIAL_FALLBACK_ORDERS = [];

// src/utils/initialStaffs.ts
var INITIAL_STAFFS = [
  {
    id: "saneej",
    name: "saneej",
    role: "ADMIN",
    stationId: "Packing-01",
    password: "saneej",
    createdAt: "2026-10-16T11:06:21.534Z"
  },
  {
    id: "Admin-01",
    name: "David Admin",
    role: "ADMIN",
    stationId: "Packing-HQ",
    password: "password123",
    createdAt: "2026-10-15T10:09:26.652Z"
  },
  {
    id: "Staff-01",
    name: "Alex Packer",
    role: "PACKER",
    stationId: "Packing-01",
    password: "password123",
    createdAt: "2026-10-15T10:09:26.652Z"
  },
  {
    id: "Staff-02",
    name: "Sarah Supervisor",
    role: "SUPERVISOR",
    stationId: "Packing-01",
    password: "password123",
    createdAt: "2026-10-15T10:09:26.652Z"
  },
  {
    id: "Zuboc",
    name: "Zuboc",
    role: "ADMIN",
    stationId: "Packing-01",
    password: "password123",
    createdAt: "2026-10-16T10:00:00.000Z"
  }
];

// server.ts
import { exec } from "child_process";
import util from "util";
var execPromise = util.promisify(exec);
async function transcodeToTelegramMp4(inputBuffer, orderId) {
  const tmpId = `${orderId.replace(/[^a-zA-Z0-9_-]/g, "_")}_${Date.now()}`;
  const inputPath = path.join("/tmp", `${tmpId}_in.tmp`);
  const outputPath = path.join("/tmp", `${tmpId}_out.mp4`);
  const thumbPath = path.join("/tmp", `${tmpId}_thumb.jpg`);
  try {
    fs.writeFileSync(inputPath, inputBuffer);
    let bin = "ffmpeg";
    try {
      const ffmpegStatic = await import("ffmpeg-static");
      bin = ffmpegStatic.default || ffmpegStatic || "ffmpeg";
    } catch (e) {
      console.warn("ffmpeg-static dynamic import failed, using system path:", e);
    }
    const cleanOrderId = orderId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const istTime = (/* @__PURE__ */ new Date()).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) + " IST";
    const escapedTime = istTime.replace(/:/g, "\\:");
    const watermarkText = `ID\\: ${cleanOrderId} | ${escapedTime}`;
    const filter = `scale='min(1280,iw)':-2,drawtext=text='${watermarkText}':x=w-tw-10:y=h-th-10:fontcolor=white@0.6:fontsize=12:shadowcolor=black@0.3:shadowx=1:shadowy=1`;
    try {
      const cmd = `"${bin}" -fflags +genpts -i "${inputPath}" -c:v libx264 -preset ultrafast -crf 30 -maxrate 1200k -bufsize 2400k -pix_fmt yuv420p -vf "${filter}" -c:a aac -b:a 64k -movflags +faststart "${outputPath}" -y`;
      await execPromise(cmd, { timeout: 6e5 });
    } catch (e) {
      console.warn("Watermarked transcoding failed, trying minimal scale-only fallback:", e?.message);
      const fallbackCmd = `"${bin}" -fflags +genpts -i "${inputPath}" -c:v libx264 -preset ultrafast -crf 32 -vf "scale='min(1280,iw)':-2" -c:a aac -b:a 64k -movflags +faststart "${outputPath}" -y`;
      await execPromise(fallbackCmd, { timeout: 6e5 });
    }
    if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
      const mp4Buffer = fs.readFileSync(outputPath);
      let thumbBuffer;
      try {
        await execPromise(`"${bin}" -ss 00:00:00.500 -i "${outputPath}" -vframes 1 -q:v 2 "${thumbPath}" -y`, { timeout: 1e4 });
        if (fs.existsSync(thumbPath) && fs.statSync(thumbPath).size > 0) {
          thumbBuffer = fs.readFileSync(thumbPath);
        }
      } catch {
      }
      return { mp4Buffer, thumbBuffer };
    }
  } catch (err) {
    console.warn("FFmpeg transcoding fallback:", err);
  } finally {
    try {
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
    } catch {
    }
    try {
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    } catch {
    }
    try {
      if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
    } catch {
    }
  }
  return { mp4Buffer: inputBuffer };
}
async function sendTelegramUpdate(record) {
  const rawBotToken = settings.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN || "";
  const rawChatId = settings.telegramChatId || process.env.TELEGRAM_CHAT_ID || "";
  const botToken = cleanTelegramCredential(rawBotToken);
  const chatId = cleanTelegramCredential(rawChatId);
  if (botToken && chatId && record.telegramMessageId) {
    const durMin = Math.floor((record.durationSeconds || 0) / 60);
    const durSec = (record.durationSeconds || 0) % 60;
    const durationStr = `${durMin}m ${durSec}s`;
    const formattedDate = record.createdAt ? new Date(record.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : (/* @__PURE__ */ new Date()).toLocaleString("en-IN");
    const safeOrderId = escapeHtml(record.orderId);
    const captionLines = [
      `<b>\u{1F4E6} Order ID: ${safeOrderId} (Updated)</b>`,
      record.awbNumber ? `<b>\u{1F69A} AWB / Tracking:</b> ${escapeHtml(record.awbNumber)}` : "",
      record.courier ? `<b>\u{1F3E2} Courier:</b> ${escapeHtml(record.courier)}` : "",
      record.weight ? `<b>\u2696\uFE0F Weight:</b> ${escapeHtml(record.weight)}` : "",
      record.productSku ? `<b>\u{1F3F7}\uFE0F SKU / Item:</b> ${escapeHtml(record.productSku)}` : "",
      record.itemCount ? `<b>\u{1F522} Qty:</b> ${escapeHtml(String(record.itemCount))}` : "",
      record.customerName ? `<b>\u{1F464} Customer / City:</b> ${escapeHtml(record.customerName)}` : "",
      record.contactPerson ? `<b>\u{1F4DE} Contact Person:</b> ${escapeHtml(record.contactPerson)}` : "",
      record.contactPhone ? `<b>\u{1F4F1} Contact Phone:</b> ${escapeHtml(record.contactPhone)}` : "",
      record.orderReceivedDate ? `<b>\u{1F4E5} Received Date:</b> ${escapeHtml(record.orderReceivedDate)}` : "",
      record.dispatchDate ? `<b>\u{1F4E4} Despatch Date:</b> ${escapeHtml(record.dispatchDate)}` : "",
      record.orderAmount ? `<b>\u{1F4B0} Order Amount:</b> \u20B9${escapeHtml(record.orderAmount)}` : "",
      record.shippingAmount ? `<b>\u{1F4E6} Shipping Amount:</b> \u20B9${escapeHtml(record.shippingAmount)}` : "",
      record.orderTotal ? `<b>\u{1F4B5} Total Amount:</b> \u20B9${escapeHtml(record.orderTotal)}` : "",
      record.deliveredDate ? `<b>\u2705 Delivered Date:</b> ${escapeHtml(record.deliveredDate)}` : "",
      `<b>\u{1F477} Staff:</b> ${escapeHtml(record.staffId)}`,
      `<b>\u{1F4CD} Station:</b> ${escapeHtml(record.stationId)}`,
      `<b>\u{1F4C5} Recorded:</b> ${escapeHtml(formattedDate)} (IST)`,
      `<b>\u23F1\uFE0F Duration:</b> ${escapeHtml(durationStr)}`,
      `<b>\u{1F69B} Fulfillment:</b> <b>${escapeHtml(record.fulfillmentStatus || "Pending")}</b>`,
      record.notes ? `<b>\u{1F4DD} Notes:</b> ${escapeHtml(record.notes)}` : "",
      record.remarks ? `<b>\u2705 QC Remarks:</b> ${escapeHtml(record.remarks)}` : "",
      "<b>\u270F\uFE0F Status:</b> Order details edited & synced by Management"
    ].filter(Boolean);
    const newCaption = captionLines.join("\n");
    try {
      await fetch(`https://api.telegram.org/bot${botToken}/editMessageCaption`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: record.telegramChatId || chatId,
          message_id: Number(record.telegramMessageId),
          caption: newCaption,
          parse_mode: "HTML"
        })
      });
    } catch (e) {
      console.error("Telegram editMessageCaption error:", e);
    }
  }
}
dotenv.config();
process.on("unhandledRejection", (reason, promise) => {
  console.error("CRITICAL: Unhandled Rejection at:", promise, "reason:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("CRITICAL: Uncaught Exception:", err);
});
var __dirname = path.dirname(fileURLToPath(import.meta.url));
var app = express();
var PORT = Number(process.env.PORT) || 3e3;
var APP_VERSION = "1.2.6-PROD-FIX";
app.get("/ping", (req, res) => res.send(`OK-${APP_VERSION}`));
app.get("/api/ping-basic", (req, res) => res.json({ status: "ok", v: APP_VERSION }));
function sanitizeString(str) {
  if (typeof str !== "string") return "";
  return str.trim().replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, "-");
}
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  res.header("Cache-Control", "no-cache, no-store, must-revalidate, max-age=0");
  res.header("Pragma", "no-cache");
  res.header("Expires", "0");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});
var upload = multer({
  limits: { fileSize: 100 * 1024 * 1024 }
  // 100 MB limit (more reasonable for serverless)
});
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
var firebaseApp = null;
var firestoreDb = null;
try {
  let firebaseConfig = null;
  const configPaths = [
    path.join(process.cwd(), "firebase-applet-config.json"),
    path.join(__dirname, "firebase-applet-config.json"),
    path.join(__dirname, "..", "firebase-applet-config.json")
  ];
  for (const cp of configPaths) {
    if (fs.existsSync(cp)) {
      try {
        const rawConfig = fs.readFileSync(cp, "utf-8");
        firebaseConfig = JSON.parse(rawConfig);
        break;
      } catch (e) {
        console.error("Error reading config file at", cp, e);
      }
    }
  }
  if (!firebaseConfig && (process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID)) {
    firebaseConfig = {
      projectId: process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID,
      appId: process.env.FIREBASE_APP_ID || process.env.VITE_FIREBASE_APP_ID,
      apiKey: process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY,
      authDomain: process.env.FIREBASE_AUTH_DOMAIN || process.env.VITE_FIREBASE_AUTH_DOMAIN,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      firestoreDatabaseId: process.env.FIREBASE_FIRESTORE_DATABASE_ID || process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || "(default)"
    };
  }
  if (firebaseConfig && process.env.DISABLE_FIREBASE !== "true") {
    if (getApps().some((a) => a.name === "SERVER_APP")) {
      firebaseApp = getApp("SERVER_APP");
    } else {
      firebaseApp = initializeApp(firebaseConfig, "SERVER_APP");
    }
    const dbId = firebaseConfig.firestoreDatabaseId || process.env.FIREBASE_FIRESTORE_DATABASE_ID || process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || "(default)";
    firestoreDb = getFirestore(firebaseApp, dbId);
    console.log("Server initialized Firebase Firestore:", firebaseConfig.projectId, "Database:", dbId, "Connected:", Boolean(firestoreDb));
  } else {
    console.warn("No Firebase configuration found on server.");
  }
} catch (e) {
  console.error("Error initializing Firebase in server.ts:", e);
}
var SUPABASE_URL = process.env.SUPABASE_URL || "https://bdfgscjiuqccoidkeaqh.supabase.co";
var SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkZmdzY2ppdXFjY29pZGtlYXFoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MjQwNzQ4OCwiZXhwIjoyMTA3OTgzNDg4fQ.NAQ_B4oLhyLPLlnUeJGc9lJ1NPcO7oH0_e3ZxeAlrF4";
var _supabaseServer = null;
function getSupabaseClient() {
  if (_supabaseServer) return _supabaseServer;
  try {
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      _supabaseServer = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
        global: {
          headers: { "x-application-name": "zuboc-flow-server" }
        }
      });
      return _supabaseServer;
    }
  } catch (e) {
    console.error("Supabase init error:", e?.message);
  }
  return null;
}
async function withTimeout(promise, timeoutMs = 8e3) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    const result = await Promise.race([promise, timeoutPromise]);
    return result;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
var isSupabaseReady = false;
var hasPerformedInitialSync = false;
var syncPromise = null;
async function ensureInitialSync() {
  if (hasPerformedInitialSync) return;
  if (syncPromise) return syncPromise;
  syncPromise = (async () => {
    try {
      await syncFromSupabase();
      hasPerformedInitialSync = true;
    } catch (err) {
      console.warn("Warmup sync failed:", err);
    } finally {
      syncPromise = null;
    }
  })();
  return Promise.race([
    syncPromise,
    new Promise((resolve) => setTimeout(resolve, 3e3))
  ]);
}
var DATA_FILE = path.join(__dirname, "flow_data.json");
var TMP_DATA_FILE = "/tmp/flow_data.json";
var settings = {
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || "8372063656:AAGc8APzAoq1LH14p5POdBm19qnv-5286gE",
  telegramChatId: process.env.TELEGRAM_CHAT_ID || "-1003940299676",
  autoUpload: true,
  stationId: "Packing-01"
};
var staffsStore = {};
for (const s of INITIAL_STAFFS) {
  staffsStore[s.id] = s;
}
var ordersStore = {};
for (const ord of INITIAL_FALLBACK_ORDERS) {
  if (ord && ord.orderId) {
    ordersStore[ord.orderId] = ord;
  }
}
try {
  let activeDataPath = DATA_FILE;
  if (!fs.existsSync(activeDataPath)) {
    const altPath = path.join(process.cwd(), "flow_data.json");
    if (fs.existsSync(altPath)) {
      activeDataPath = altPath;
    } else {
      activeDataPath = TMP_DATA_FILE;
    }
  }
  if (fs.existsSync(activeDataPath)) {
    const raw = fs.readFileSync(activeDataPath, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed.orders) ordersStore = { ...ordersStore, ...parsed.orders };
    if (parsed.staffs) staffsStore = { ...staffsStore, ...parsed.staffs };
    if (parsed.settings) {
      settings = {
        ...settings,
        ...parsed.settings,
        telegramBotToken: sanitizeString(parsed.settings.telegramBotToken || settings.telegramBotToken),
        telegramChatId: sanitizeString(parsed.settings.telegramChatId || settings.telegramChatId)
      };
    }
  }
} catch (e) {
  console.error("Error loading local flow_data.json:", e);
}
function saveLocalBackup() {
  const payload = JSON.stringify({ orders: ordersStore, settings, staffs: staffsStore }, null, 2);
  try {
    fs.writeFileSync(DATA_FILE, payload);
  } catch (e) {
    try {
      fs.writeFileSync(TMP_DATA_FILE, payload);
    } catch (tmpErr) {
      console.error("Error saving local backup to /tmp:", tmpErr);
    }
  }
}
var firestoreQuotaExceeded = false;
function cleanForFirestore(obj) {
  if (!obj || typeof obj !== "object") return obj;
  return JSON.parse(JSON.stringify(obj, (key, value) => {
    if (value === void 0) return void 0;
    return value;
  }));
}
function cleanForSupabase(obj) {
  if (!obj || typeof obj !== "object") return obj;
  return JSON.parse(JSON.stringify(obj, (key, value) => {
    if (value === void 0) return null;
    return value;
  }));
}
async function saveOrderToSupabase(record) {
  const client = getSupabaseClient();
  if (!client) {
    console.warn("Supabase save skipped: Client not initialized.");
    return false;
  }
  try {
    const payload = cleanForSupabase(record);
    const { error } = await withTimeout(
      client.from("orders").upsert(payload, { onConflict: "orderId" }),
      6e3
    );
    if (error) {
      console.error(`Supabase save error for Order #${record.orderId}:`, error.message, error.code, error.details);
      if (error.code === "42P01") {
        console.error('HINT: Table "orders" does not exist in Supabase.');
      } else if (error.code === "42703") {
        console.error("HINT: One or more columns are missing from the Supabase table.");
      }
      return false;
    } else {
      isSupabaseReady = true;
      return true;
    }
  } catch (err) {
    console.error(`Supabase save exception for Order #${record.orderId}:`, err?.message);
    return false;
  }
}
async function deleteOrderFromSupabase(orderId) {
  if (!getSupabaseClient()) return;
  try {
    await getSupabaseClient().from("orders").delete().eq("orderId", orderId);
  } catch {
  }
}
async function saveStaffToSupabase(staff) {
  if (!getSupabaseClient()) return;
  try {
    await getSupabaseClient().from("staffs").upsert(cleanForSupabase(staff), { onConflict: "id" });
  } catch {
  }
}
async function deleteStaffFromSupabase(staffId) {
  if (!getSupabaseClient()) return;
  try {
    await getSupabaseClient().from("staffs").delete().eq("id", staffId);
  } catch {
  }
}
async function saveSettingsToSupabase(sett) {
  if (!getSupabaseClient()) return;
  try {
    await getSupabaseClient().from("settings").upsert({ id: "config", ...cleanForSupabase(sett) }, { onConflict: "id" });
  } catch {
  }
}
async function syncFromSupabase() {
  const client = getSupabaseClient();
  if (!client) {
    console.warn("Initial sync skipped: Supabase client not initialized.");
    return;
  }
  try {
    console.log("Starting parallel initial sync from Supabase...");
    const [ordersRes, staffsRes, settingsRes] = await Promise.allSettled([
      withTimeout(client.from("orders").select("*").order("createdAt", { ascending: false }), 1e4),
      withTimeout(client.from("staffs").select("*"), 8e3),
      withTimeout(client.from("settings").select("*").eq("id", "config").maybeSingle(), 5e3)
    ]);
    if (ordersRes.status === "fulfilled") {
      const { data: ords, error: ordErr } = ordersRes.value;
      if (ordErr) console.error("Sync error (orders):", ordErr.message);
      else if (Array.isArray(ords)) {
        isSupabaseReady = true;
        for (const o of ords) if (o.orderId) ordersStore[o.orderId] = o;
        console.log(`Synced ${ords.length} orders.`);
      }
    }
    if (staffsRes.status === "fulfilled") {
      const { data: stfs, error: stfErr } = staffsRes.value;
      if (stfErr) console.error("Sync error (staffs):", stfErr.message);
      else if (Array.isArray(stfs)) {
        for (const s of stfs) if (s.id) staffsStore[s.id] = s;
        console.log(`Synced ${stfs.length} staff members.`);
      }
    }
    if (settingsRes.status === "fulfilled") {
      const { data: sett, error: settErr } = settingsRes.value;
      if (settErr) console.error("Sync error (settings):", settErr.message);
      else if (sett) {
        settings = { ...settings, ...sett };
        console.log("Synced system settings.");
      }
    }
    hasPerformedInitialSync = true;
  } catch (err) {
    console.warn("Supabase initial sync failure:", err?.message);
  }
}
var lastStaffsSyncTime = 0;
async function syncStaffsFromFirestore(force = false) {
  if (!firestoreDb || firestoreQuotaExceeded) return;
  const now = Date.now();
  const hasStaffs = Object.keys(staffsStore).length > 0;
  if (!force && hasStaffs && now - lastStaffsSyncTime < 216e5) return;
  lastStaffsSyncTime = now;
  try {
    const colRef = collection(firestoreDb, "staffs");
    const snap = await getDocs(colRef);
    if (!snap.empty) {
      snap.forEach((d) => {
        staffsStore[d.id] = {
          ...staffsStore[d.id] || {},
          ...d.data()
        };
      });
      saveLocalBackup();
    }
  } catch (e) {
    if (e?.message?.includes("Quota") || e?.message?.includes("quota") || e?.code === "resource-exhausted") {
      firestoreQuotaExceeded = true;
      console.warn("Firestore quota exceeded. Running on local storage fallback mode.");
    } else {
      console.error("Error syncing staffs from Firestore:", e);
    }
  }
}
async function syncSettingsFromFirestore() {
  if (!firestoreDb || firestoreQuotaExceeded) return;
  try {
    const docRef = doc(firestoreDb, "settings", "config");
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      if (data.telegramBotToken) settings.telegramBotToken = sanitizeString(data.telegramBotToken);
      if (data.telegramChatId) settings.telegramChatId = sanitizeString(data.telegramChatId);
      if (data.stationId) settings.stationId = sanitizeString(data.stationId);
      if (data.autoUpload !== void 0) settings.autoUpload = data.autoUpload;
    }
  } catch (e) {
    if (e?.message?.includes("Quota") || e?.message?.includes("quota")) {
      firestoreQuotaExceeded = true;
    } else {
      console.error("Error syncing settings from Firestore:", e);
    }
  }
}
function escapeHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function cleanTelegramCredential(str) {
  if (!str) return "";
  return str.trim().replace(/^["']|["']$/g, "");
}
var apiRouter = express.Router();
apiRouter.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "Zuboc Flow API",
    firebaseConnected: Boolean(firestoreDb),
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
});
apiRouter.get("/health", (req, res) => {
  res.json({
    status: "ok",
    v: "1.2.0-diag",
    firebaseConnected: Boolean(firestoreDb),
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
});
apiRouter.get("/settings", async (req, res) => {
  await syncSettingsFromFirestore();
  const maskedToken = settings.telegramBotToken ? settings.telegramBotToken.substring(0, 6) + "..." + settings.telegramBotToken.slice(-4) : "";
  res.json({
    ...settings,
    telegramBotTokenMasked: maskedToken,
    hasToken: Boolean(settings.telegramBotToken),
    firebaseConnected: Boolean(firestoreDb)
  });
});
apiRouter.post("/settings", async (req, res) => {
  const { telegramBotToken, telegramChatId, autoUpload, stationId } = req.body;
  if (telegramBotToken !== void 0) {
    const cleanToken = sanitizeString(telegramBotToken);
    if (!cleanToken.includes("...")) {
      settings.telegramBotToken = cleanToken;
    }
  }
  if (telegramChatId !== void 0) {
    settings.telegramChatId = sanitizeString(telegramChatId);
  }
  if (autoUpload !== void 0) settings.autoUpload = Boolean(autoUpload);
  if (stationId !== void 0) settings.stationId = sanitizeString(stationId);
  saveLocalBackup();
  if (firestoreDb) {
    try {
      await setDoc(doc(firestoreDb, "settings", "config"), cleanForFirestore({
        telegramBotToken: settings.telegramBotToken,
        telegramChatId: settings.telegramChatId,
        autoUpload: settings.autoUpload,
        stationId: settings.stationId,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      }), { merge: true });
    } catch (e) {
      console.error("Error saving settings to Firestore:", e);
    }
  }
  await saveSettingsToSupabase(settings);
  res.json({ success: true, settings: { ...settings, telegramBotTokenMasked: "***" } });
});
apiRouter.get("/diag/ping-text", (req, res) => {
  res.send("Zuboc Server is REACHABLE (Text Mode)");
});
apiRouter.get("/diag/system-report", async (req, res) => {
  try {
    const report = {
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        env: process.env.NODE_ENV,
        port: PORT,
        hasSupabaseUrl: Boolean(SUPABASE_URL),
        hasSupabaseKey: Boolean(SUPABASE_SERVICE_ROLE_KEY),
        hasFirebaseConfig: Boolean(firebaseApp)
      },
      database: {
        supabaseInitialized: Boolean(getSupabaseClient()),
        firebaseInitialized: Boolean(firestoreDb),
        isSupabaseReady,
        firestoreQuotaExceeded
      },
      storage: {
        cwd: process.cwd(),
        dirname: __dirname
      }
    };
    try {
      if (typeof fetch !== "undefined") {
        const start = Date.now();
        const netRes = await fetch("https://www.google.com", { method: "HEAD" });
        report.connectivity = {
          googleHead: {
            ok: netRes.ok,
            status: netRes.status,
            latencyMs: Date.now() - start
          }
        };
      } else {
        report.connectivity = { error: "Global fetch not available in this Node runtime." };
      }
    } catch (e) {
      report.connectivity = { error: `Network test failed: ${e.message}` };
    }
    res.json({ success: true, report });
  } catch (err) {
    console.error("SYSTEM_REPORT_CRASH:", err);
    res.json({ success: false, error: err.message, stack: err.stack });
  }
});
apiRouter.post("/supabase/test-server", async (req, res) => {
  try {
    const client = getSupabaseClient();
    if (!client) {
      return res.json({
        success: false,
        error: "Supabase server client not initialized. Check server logs for initialization errors."
      });
    }
    const testId = `diag-test-${Date.now()}`;
    const testRecord = {
      orderId: testId,
      customerName: "SERVER_DIAG_TEST",
      notes: "Temporary record for connection health check.",
      updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      recordingStatus: "PENDING",
      uploadStatus: "PENDING"
    };
    const { error: insertErr } = await client.from("orders").upsert(testRecord, { onConflict: "orderId" });
    if (insertErr) {
      return res.json({
        success: false,
        error: `Supabase Write Failed: ${insertErr.message}`,
        code: insertErr.code,
        details: insertErr.details,
        hint: insertErr.code === "42P01" ? 'Table "orders" does not exist.' : "Check table schema and PRIMARY KEY constraints."
      });
    }
    const { data: readData, error: readErr } = await client.from("orders").select("*").eq("orderId", testId).maybeSingle();
    if (readErr) {
      return res.json({ success: false, error: `Supabase Read Failed: ${readErr.message}`, code: readErr.code });
    }
    if (!readData) {
      return res.json({ success: false, error: "Supabase Write reported success, but the record could not be read back immediately." });
    }
    const { error: deleteErr } = await client.from("orders").delete().eq("orderId", testId);
    if (deleteErr) {
      console.warn("Diag Cleanup Warning:", deleteErr.message);
    }
    return res.json({
      success: true,
      message: "Server-side Supabase connection is fully healthy (Read/Write/Delete verified).",
      project: SUPABASE_URL.split("://")[1]?.split(".")[0] || "hidden",
      usingServiceRole: true,
      v: "1.2.1-diag"
    });
  } catch (err) {
    console.error("SERVER_DIAG_CRASH:", err);
    return res.json({
      success: false,
      error: `Internal Server Error: ${err.message || "Unknown exception"}`,
      stack: process.env.NODE_ENV === "development" ? err.stack : void 0
    });
  }
});
apiRouter.get("/supabase/status", async (req, res) => {
  const client = getSupabaseClient();
  if (!client) {
    return res.json({ connected: false, error: "No client initialized", v: APP_VERSION });
  }
  try {
    const { data, error } = await withTimeout(client.from("orders").select("orderId").limit(1), 5e3);
    if (error) {
      return res.json({
        connected: false,
        tableExists: false,
        code: error.code,
        message: error.message,
        v: APP_VERSION
      });
    }
    return res.json({
      connected: true,
      tableExists: true,
      v: APP_VERSION,
      sampleCount: data ? data.length : 0
    });
  } catch (err) {
    console.error("Supabase status check failed:", err.message);
    return res.json({
      connected: false,
      error: `Timeout or Error: ${err.message}`,
      v: APP_VERSION
    });
  }
});
apiRouter.get("/diag/system-report", async (req, res) => {
  const report = {
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    v: APP_VERSION,
    env: {
      NODE_ENV: process.env.NODE_ENV,
      VERCEL: process.env.VERCEL,
      SUPABASE_URL_SET: Boolean(process.env.SUPABASE_URL),
      SUPABASE_KEY_SET: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
    },
    effectiveConfig: {
      supabaseUrl: SUPABASE_URL.slice(0, 15) + "...",
      supabaseKeySet: Boolean(SUPABASE_SERVICE_ROLE_KEY)
    },
    stores: {
      ordersCount: Object.keys(ordersStore).length,
      staffsCount: Object.keys(staffsStore).length
    },
    connectivity: {
      googleReachable: false,
      supabaseReachable: false,
      hasGlobalFetch: typeof globalThis.fetch !== "undefined"
    }
  };
  const ping = async (url) => {
    try {
      if (typeof globalThis.fetch !== "undefined") {
        const resp = await withTimeout(globalThis.fetch(url, { method: "HEAD" }), 3e3);
        return resp.ok;
      }
      return false;
    } catch (e) {
      return false;
    }
  };
  report.connectivity.googleReachable = await ping("https://www.google.com");
  const supaUrl = (SUPABASE_URL || "").split(".co")[0] + ".co";
  report.connectivity.supabaseReachable = await ping(supaUrl);
  try {
    const client = getSupabaseClient();
    if (client) {
      const { error } = await withTimeout(client.from("orders").select("orderId").limit(1), 4e3);
      report.database = {
        supabase: error ? "ERROR" : "CONNECTED",
        error: error?.message,
        code: error?.code
      };
    } else {
      report.database = { supabase: "NOT_INITIALIZED" };
    }
  } catch (e) {
    report.database = { supabase: "CRASHED", error: e.message };
  }
  res.json({ success: true, report });
});
apiRouter.post("/supabase/force-sync", async (req, res) => {
  try {
    hasPerformedInitialSync = false;
    await syncFromSupabase();
    res.json({
      success: true,
      message: "Server memory successfully refreshed from Supabase.",
      ordersCount: Object.keys(ordersStore).length
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
apiRouter.post("/supabase/migrate", async (req, res) => {
  if (!getSupabaseClient()) {
    return res.status(500).json({ error: "Supabase client not initialized" });
  }
  try {
    const ordersList = Object.values(ordersStore);
    let ordersUploaded = 0;
    for (const ord of ordersList) {
      const { error } = await getSupabaseClient().from("orders").upsert(cleanForSupabase(ord), { onConflict: "orderId" });
      if (!error) ordersUploaded++;
    }
    const staffsList = Object.values(staffsStore);
    for (const st of staffsList) {
      await getSupabaseClient().from("staffs").upsert(cleanForSupabase(st), { onConflict: "id" });
    }
    await getSupabaseClient().from("settings").upsert({ id: "config", ...cleanForSupabase(settings) }, { onConflict: "id" });
    res.json({
      success: true,
      message: `Successfully migrated ${ordersUploaded} orders, ${staffsList.length} staff accounts, and system settings to Supabase!`,
      ordersCount: ordersUploaded
    });
  } catch (e) {
    res.status(500).json({ error: e.message || "Migration failed" });
  }
});
apiRouter.get("/staffs", async (req, res) => {
  const client = getSupabaseClient();
  if (client) {
    try {
      if (!hasPerformedInitialSync || Object.keys(staffsStore).length <= INITIAL_STAFFS.length) {
        await syncFromSupabase();
      }
      const { data: supaStaffs, error } = await withTimeout(client.from("staffs").select("*"), 6e3);
      if (!error && Array.isArray(supaStaffs) && supaStaffs.length > 0) {
        const freshMap = {};
        for (const s of supaStaffs) {
          if (s.id) freshMap[s.id] = s;
        }
        staffsStore = freshMap;
        saveLocalBackup();
      }
    } catch (e) {
      console.warn("Supabase staffs fetch warning:", e?.message);
    }
  }
  const staffList = Object.values(staffsStore).map((s) => ({
    id: s.id,
    name: s.name,
    role: s.role,
    stationId: s.stationId,
    email: s.email,
    password: s.password || s.id,
    createdAt: s.createdAt,
    hasPassword: Boolean(s.password)
  }));
  res.json(staffList);
});
apiRouter.post("/staffs", async (req, res) => {
  const id = sanitizeString(req.body.id);
  const name = sanitizeString(req.body.name);
  const role = sanitizeString(req.body.role) || "PACKER";
  const stationId = sanitizeString(req.body.stationId) || settings.stationId || "Packing-01";
  const password = req.body.password ? String(req.body.password).trim() : void 0;
  const email = req.body.email ? sanitizeString(req.body.email) : void 0;
  if (!id || !name) {
    return res.status(400).json({ error: "Staff ID and Name are required" });
  }
  const existing = staffsStore[id];
  const updatedStaff = {
    id,
    name,
    role: role === "ADMIN" || role === "SUPERVISOR" || role === "PACKER" ? role : "PACKER",
    stationId,
    password: password || existing?.password || "password123",
    email: email || existing?.email,
    createdAt: existing?.createdAt || (/* @__PURE__ */ new Date()).toISOString()
  };
  staffsStore[id] = updatedStaff;
  saveLocalBackup();
  if (firestoreDb) {
    try {
      await setDoc(doc(firestoreDb, "staffs", id), cleanForFirestore(updatedStaff), { merge: true });
    } catch (e) {
      console.error("Error saving staff to Firestore:", e);
    }
  }
  await saveStaffToSupabase(updatedStaff);
  res.json({
    success: true,
    staff: {
      id: updatedStaff.id,
      name: updatedStaff.name,
      role: updatedStaff.role,
      stationId: updatedStaff.stationId,
      email: updatedStaff.email,
      hasPassword: Boolean(updatedStaff.password)
    }
  });
});
apiRouter.delete("/staffs/:id", async (req, res) => {
  const id = sanitizeString(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "Staff ID is required" });
  }
  const existing = staffsStore[id];
  if (!existing) {
    return res.status(404).json({ error: "Staff member not found" });
  }
  if (existing.role === "ADMIN") {
    const adminCount = Object.values(staffsStore).filter((s) => s.role === "ADMIN").length;
    if (adminCount <= 1) {
      return res.status(400).json({ error: "Cannot delete the only remaining Admin account" });
    }
  }
  delete staffsStore[id];
  saveLocalBackup();
  if (firestoreDb) {
    try {
      await deleteDoc(doc(firestoreDb, "staffs", id));
    } catch (e) {
      console.error("Error deleting staff from Firestore:", e);
    }
  }
  await deleteStaffFromSupabase(id);
  res.json({ success: true, message: `Staff member ${id} removed successfully` });
});
apiRouter.post(["/staffs/reset-password", "/auth/reset-password"], async (req, res) => {
  const userId = sanitizeString(req.body.userId || req.body.id);
  const newPassword = req.body.newPassword ? String(req.body.newPassword).trim() : "";
  if (!userId || !newPassword) {
    return res.status(400).json({ error: "User ID and New Password are required" });
  }
  if (newPassword.length < 4) {
    return res.status(400).json({ error: "Password must be at least 4 characters" });
  }
  const staffKey = Object.keys(staffsStore).find(
    (k) => k.toLowerCase() === userId.toLowerCase() || staffsStore[k].name.toLowerCase() === userId.toLowerCase() || staffsStore[k].email && staffsStore[k].email.toLowerCase() === userId.toLowerCase()
  );
  if (!staffKey || !staffsStore[staffKey]) {
    return res.status(404).json({ error: `Staff user '${userId}' not found` });
  }
  staffsStore[staffKey].password = newPassword;
  saveLocalBackup();
  if (firestoreDb) {
    try {
      await setDoc(doc(firestoreDb, "staffs", staffKey), { password: newPassword }, { merge: true });
    } catch (e) {
      console.error("Error updating password in Firestore:", e);
    }
  }
  await saveStaffToSupabase(staffsStore[staffKey]);
  res.json({ success: true, message: `Password for ${staffsStore[staffKey].name} has been reset successfully!` });
});
var loginAttempts = /* @__PURE__ */ new Map();
apiRouter.post(["/auth/verify-pin", "/auth/access-code"], async (req, res) => {
  const ip = req.ip || req.headers["x-forwarded-for"] || "client";
  const ipKey = String(ip);
  const attempts = loginAttempts.get(ipKey);
  if (attempts && attempts.lockUntil > Date.now()) {
    const remainingSecs = Math.ceil((attempts.lockUntil - Date.now()) / 1e3);
    return res.status(429).json({
      error: `Security Lock Active: Too many failed attempts. Please wait ${remainingSecs} seconds.`
    });
  }
  const rawCode = req.body?.accessCode || req.body?.code || req.body?.pin || "";
  const cleanCode = String(rawCode).trim().toLowerCase();
  if (!cleanCode) {
    return res.status(400).json({ error: "Please enter Access Code" });
  }
  const envMasterCode = (process.env.MASTER_ACCESS_CODE || "889900").trim().toLowerCase();
  const envPackingCode = (process.env.PACKING_ACCESS_CODE || "123456").trim().toLowerCase();
  const masterWord = (process.env.MASTER_WORD || "zuboc").trim().toLowerCase();
  let authenticatedStaff = null;
  const client = getSupabaseClient();
  if (client) {
    try {
      const { data: matchedStaffs, error } = await withTimeout(
        client.from("staffs").select("*").or(`password.eq.${cleanCode},id.eq.${cleanCode}`).limit(1),
        5e3
      );
      if (!error && matchedStaffs && matchedStaffs.length > 0) {
        const matchedStaff = matchedStaffs[0];
        authenticatedStaff = {
          id: matchedStaff.id,
          name: matchedStaff.name,
          role: matchedStaff.role || "PACKER",
          stationId: matchedStaff.stationId || "Packing-01",
          email: matchedStaff.email
        };
      }
    } catch (supaErr) {
      console.warn("Supabase Auth Query error:", supaErr);
    }
  }
  if (!authenticatedStaff) {
    if (Object.keys(staffsStore).length <= INITIAL_STAFFS.length) {
      await syncStaffsFromFirestore();
    }
    const matchedStaff = Object.values(staffsStore).find((s) => {
      const p = String(s.password || "").trim().toLowerCase();
      const id = String(s.id || "").trim().toLowerCase();
      return p && p === cleanCode || id && id === cleanCode;
    });
    if (matchedStaff) {
      authenticatedStaff = {
        id: matchedStaff.id,
        name: matchedStaff.name,
        role: matchedStaff.role || "PACKER",
        stationId: matchedStaff.stationId || "Packing-01",
        email: matchedStaff.email
      };
    } else if (cleanCode === (process.env.MASTER_ACCESS_CODE || "zuboc2026").trim().toLowerCase()) {
      authenticatedStaff = {
        id: "Zuboc",
        name: "Zuboc (ADMIN)",
        role: "ADMIN",
        stationId: "Packing-01",
        email: "admin@zuboc.com"
      };
    }
  }
  if (authenticatedStaff) {
    loginAttempts.delete(ipKey);
    return res.json({
      success: true,
      token: `zuboc_sec_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      staff: authenticatedStaff,
      message: `Access granted as ${authenticatedStaff.name}`
    });
  }
  const currentCount = (attempts?.count || 0) + 1;
  const lockTime = currentCount >= 5 ? Date.now() + 6e4 : 0;
  loginAttempts.set(ipKey, { count: currentCount, lockUntil: lockTime });
  return res.status(401).json({
    error: currentCount >= 5 ? "Security alert: 5 failed attempts. Access locked for 60 seconds." : `Invalid Access Code. (${5 - currentCount} attempts remaining)`
  });
});
apiRouter.post("/auth/login", async (req, res) => {
  await syncStaffsFromFirestore();
  const userId = sanitizeString(req.body.userId || req.body.id || req.body.username);
  const password = req.body.password ? String(req.body.password).trim() : "";
  if (!userId) {
    return res.status(400).json({ error: "Please enter User ID" });
  }
  const staffKey = Object.keys(staffsStore).find(
    (k) => k.toLowerCase() === userId.toLowerCase() || staffsStore[k].name.toLowerCase() === userId.toLowerCase() || staffsStore[k].email && staffsStore[k].email.toLowerCase() === userId.toLowerCase()
  );
  if (!staffKey) {
    return res.status(401).json({ error: "Staff account not found with this User ID" });
  }
  const staff = staffsStore[staffKey];
  const expectedPassword = staff.password || "password123";
  if (expectedPassword !== password) {
    return res.status(401).json({ error: "Incorrect password. Default password is password123" });
  }
  res.json({
    success: true,
    staff: {
      id: staff.id,
      name: staff.name,
      role: staff.role,
      stationId: staff.stationId,
      email: staff.email
    }
  });
});
apiRouter.get("/orders", async (req, res) => {
  const client = getSupabaseClient();
  if (client) {
    try {
      if (!hasPerformedInitialSync) {
        await syncFromSupabase();
      }
      const { data: supaOrders, error } = await withTimeout(
        client.from("orders").select("*").order("createdAt", { ascending: false }),
        8e3
      );
      if (!error && Array.isArray(supaOrders)) {
        if (supaOrders.length > 0) {
          const freshOrdersMap = {};
          for (const o of supaOrders) {
            if (o.orderId) freshOrdersMap[o.orderId] = o;
          }
          ordersStore = freshOrdersMap;
          saveLocalBackup();
        }
      }
    } catch (e) {
      console.warn("Supabase sync warning on GET /orders:", e?.message);
    }
  }
  const orders = Object.values(ordersStore).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  res.json(orders);
});
apiRouter.get("/orders/:orderId", async (req, res) => {
  const rawId = req.params.orderId || "";
  let decodedId = rawId;
  try {
    decodedId = decodeURIComponent(rawId);
  } catch {
  }
  const orderId = sanitizeString(decodedId);
  const cleanId = orderId.replace(/^#/, "").trim().toLowerCase();
  let matchedOrder = ordersStore[orderId] || ordersStore[cleanId] || ordersStore[`#${cleanId}`];
  if (!matchedOrder) {
    matchedOrder = Object.values(ordersStore).find((o) => {
      if (!o.orderId) return false;
      const oId = o.orderId.trim().toLowerCase();
      const oIdNoHash = oId.replace(/^#/, "");
      return oId === cleanId || oIdNoHash === cleanId || oId === orderId.toLowerCase() || oIdNoHash === orderId.toLowerCase();
    });
  }
  if (matchedOrder) {
    return res.json(matchedOrder);
  }
  if (getSupabaseClient()) {
    try {
      const { data: supaOrder } = await getSupabaseClient().from("orders").select("*").or(`orderId.eq.${orderId},orderId.eq.${cleanId}`).maybeSingle();
      if (supaOrder && supaOrder.orderId) {
        ordersStore[supaOrder.orderId] = supaOrder;
        return res.json(supaOrder);
      }
    } catch (supaErr) {
      console.warn("Supabase order lookup notice:", supaErr);
    }
  }
  if (firestoreDb && !firestoreQuotaExceeded) {
    try {
      let docRef = doc(firestoreDb, "orders", orderId);
      let snap = await getDoc(docRef);
      if (!snap.exists() && orderId.startsWith("#")) {
        docRef = doc(firestoreDb, "orders", orderId.replace(/^#/, ""));
        snap = await getDoc(docRef);
      }
      if (snap.exists()) {
        const fsData = snap.data();
        ordersStore[fsData.orderId || orderId] = fsData;
        return res.json(fsData);
      }
    } catch (e) {
      if (e?.message?.includes("Quota") || e?.message?.includes("quota") || e?.code === "resource-exhausted") {
        firestoreQuotaExceeded = true;
        console.warn("Firestore read quota exceeded during order lookup. Using memory fallback.");
      } else {
        console.error("Error fetching order from Firestore:", e);
      }
    }
  }
  return res.status(404).json({ error: "Order recording not found" });
});
apiRouter.post("/orders", async (req, res) => {
  const orderId = sanitizeString(req.body.orderId);
  if (!orderId) {
    return res.status(400).json({ error: "orderId is required" });
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const existing = ordersStore[orderId];
  const record = {
    ...existing || {},
    ...req.body,
    orderId,
    // Ensure ID is preserved
    updatedAt: now,
    createdAt: existing?.createdAt || now
  };
  const fulfillmentChanged = existing && existing.fulfillmentStatus !== record.fulfillmentStatus;
  ordersStore[orderId] = record;
  saveLocalBackup();
  if (fulfillmentChanged) {
    await sendTelegramUpdate(record);
  }
  if (firestoreDb && !firestoreQuotaExceeded) {
    try {
      await setDoc(doc(firestoreDb, "orders", orderId), cleanForFirestore(record), { merge: true });
    } catch (e) {
      if (e?.code === "resource-exhausted" || e?.message?.includes("Quota") || e?.message?.includes("quota")) {
        firestoreQuotaExceeded = true;
        console.warn("Firestore write quota limit reached. Safely persisting to server storage.");
      } else {
        console.error("Error writing order record to Firestore:", e);
      }
    }
  }
  saveOrderToSupabase(record).catch((err) => console.error("Supabase Background Sync Error:", err));
  res.json({ success: true, record, supaSynced: "PENDING" });
});
apiRouter.post("/orders/bulk", async (req, res) => {
  const { orders, conflictStrategy = "skip" } = req.body;
  if (!Array.isArray(orders) || orders.length === 0) {
    return res.status(400).json({ error: 'An array of order objects is required under "orders"' });
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  const processedRecords = [];
  for (const rawRecord of orders) {
    const cleanId = sanitizeString(rawRecord.orderId);
    if (!cleanId) continue;
    const existing = ordersStore[cleanId];
    if (existing && conflictStrategy === "skip") {
      skippedCount++;
      continue;
    }
    let recordToSave;
    if (existing && conflictStrategy === "merge") {
      recordToSave = {
        ...existing,
        ...rawRecord,
        orderId: cleanId,
        updatedAt: now,
        createdAt: existing.createdAt || rawRecord.createdAt || now
      };
      updatedCount++;
    } else if (existing && conflictStrategy === "overwrite") {
      recordToSave = {
        ...rawRecord,
        orderId: cleanId,
        updatedAt: now,
        createdAt: rawRecord.createdAt || now
      };
      updatedCount++;
    } else {
      recordToSave = {
        ...rawRecord,
        orderId: cleanId,
        fulfillmentStatus: rawRecord.fulfillmentStatus || "Pending",
        recordingStatus: rawRecord.recordingStatus || "PENDING",
        uploadStatus: rawRecord.uploadStatus || "PENDING",
        createdAt: rawRecord.createdAt || now,
        updatedAt: now
      };
      createdCount++;
    }
    ordersStore[cleanId] = recordToSave;
    processedRecords.push(recordToSave);
    if (firestoreDb && !firestoreQuotaExceeded) {
      try {
        await setDoc(doc(firestoreDb, "orders", cleanId), cleanForFirestore(recordToSave), { merge: true });
      } catch (e) {
        if (e?.code === "resource-exhausted" || e?.message?.includes("Quota") || e?.message?.includes("quota")) {
          firestoreQuotaExceeded = true;
          console.warn("Bulk import: Firestore write quota limit reached. Saving remainder in memory & local storage.");
        } else {
          console.error("Error writing bulk order to Firestore:", cleanId, e);
        }
      }
    }
    saveOrderToSupabase(recordToSave);
  }
  saveLocalBackup();
  res.json({
    success: true,
    message: `Bulk import completed: ${createdCount} created, ${updatedCount} updated, ${skippedCount} skipped.`,
    stats: {
      totalInput: orders.length,
      created: createdCount,
      updated: updatedCount,
      skipped: skippedCount,
      processed: processedRecords.length
    },
    records: processedRecords
  });
});
apiRouter.post("/orders/:orderId", async (req, res) => {
  const { orderId } = req.params;
  console.log("Updating order:", orderId, "Body:", JSON.stringify(req.body));
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const existing = ordersStore[orderId];
  const record = {
    ...existing || {},
    ...req.body,
    orderId,
    updatedAt: now,
    createdAt: existing?.createdAt || req.body.createdAt || now
  };
  const fulfillmentChanged = existing && existing.fulfillmentStatus !== record.fulfillmentStatus;
  ordersStore[orderId] = record;
  saveLocalBackup();
  if (fulfillmentChanged) {
    await sendTelegramUpdate(record);
  }
  if (firestoreDb && !firestoreQuotaExceeded) {
    try {
      await setDoc(doc(firestoreDb, "orders", orderId), cleanForFirestore(record), { merge: true });
    } catch (e) {
      if (e?.code === "resource-exhausted" || e?.message?.includes("Quota") || e?.message?.includes("quota")) {
        firestoreQuotaExceeded = true;
        console.warn("Firestore write quota limit reached. Safely persisting to server storage.");
      } else {
        console.error("Error updating order record in Firestore:", e);
      }
    }
  }
  await saveOrderToSupabase(record);
  res.json({ success: true, record });
});
apiRouter.delete("/orders/:orderId", async (req, res) => {
  const orderId = sanitizeString(req.params.orderId);
  if (!orderId) {
    return res.status(400).json({ error: "orderId is required" });
  }
  delete ordersStore[orderId];
  saveLocalBackup();
  if (firestoreDb && !firestoreQuotaExceeded) {
    try {
      await deleteDoc(doc(firestoreDb, "orders", orderId));
    } catch (e) {
      if (e?.code === "resource-exhausted" || e?.message?.includes("Quota") || e?.message?.includes("quota")) {
        firestoreQuotaExceeded = true;
      } else {
        console.error("Error deleting order from Firestore:", e);
      }
    }
  }
  await deleteOrderFromSupabase(orderId);
  res.json({ success: true, message: `Order ${orderId} deleted successfully` });
});
apiRouter.post("/telegram/upload", (req, res, next) => {
  upload.fields([
    { name: "video", maxCount: 1 },
    { name: "photo", maxCount: 1 },
    { name: "photos", maxCount: 5 }
  ])(req, res, (err) => {
    if (err) {
      console.warn("Multer upload warning:", err.message);
    }
    next();
  });
}, async (req, res) => {
  try {
    const orderId = sanitizeString(req.body.orderId);
    const staffId = sanitizeString(req.body.staffId);
    const stationId = sanitizeString(req.body.stationId);
    const durationSeconds = Number(req.body.durationSeconds) || 0;
    const recordingDate = req.body.recordingDate;
    const videoBase64 = req.body.videoBase64;
    const photoBase64 = req.body.photoBase64;
    const evidenceType = req.body.evidenceType || "VIDEO";
    const awbNumber = sanitizeString(req.body.awbNumber);
    const courier = sanitizeString(req.body.courier);
    const weight = sanitizeString(req.body.weight);
    const productSku = sanitizeString(req.body.productSku);
    const customerName = sanitizeString(req.body.customerName);
    const itemCount = sanitizeString(req.body.itemCount);
    const notes = sanitizeString(req.body.notes);
    if (!orderId) {
      return res.status(400).json({ error: "orderId is required" });
    }
    let record = ordersStore[orderId];
    if (!record && firestoreDb) {
      try {
        const snap = await getDoc(doc(firestoreDb, "orders", orderId));
        if (snap.exists()) {
          record = snap.data();
        }
      } catch (e) {
        console.error("Firestore order read error:", e);
      }
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    if (!record) {
      record = {
        orderId,
        staffId: staffId || "Operator",
        stationId: stationId || settings.stationId || "Packing-01",
        recordingStartedAt: now,
        recordingCompletedAt: now,
        durationSeconds,
        recordingStatus: "COMPLETED",
        uploadStatus: "PENDING",
        createdAt: now,
        updatedAt: now
      };
    }
    if (awbNumber) record.awbNumber = awbNumber;
    if (courier) record.courier = courier;
    if (weight) record.weight = weight;
    if (productSku) record.productSku = productSku;
    if (customerName) record.customerName = customerName;
    if (itemCount) record.itemCount = itemCount;
    if (notes) record.notes = notes;
    const rawBotToken = settings.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN || "";
    const rawChatId = settings.telegramChatId || process.env.TELEGRAM_CHAT_ID || "";
    const botToken = cleanTelegramCredential(rawBotToken);
    const chatId = cleanTelegramCredential(rawChatId);
    if (!botToken || !chatId) {
      record.uploadStatus = "FAILED";
      ordersStore[orderId] = record;
      saveLocalBackup();
      if (firestoreDb) {
        await setDoc(doc(firestoreDb, "orders", orderId), cleanForFirestore(record), { merge: true });
      }
      return res.status(400).json({
        error: "Telegram Bot Token and Chat ID are not configured.",
        record
      });
    }
    const files = req.files;
    let videoBuffer = null;
    let photoBuffers = [];
    if (files?.video?.[0]?.buffer) {
      videoBuffer = files.video[0].buffer;
    } else if (videoBase64) {
      const base64Data = videoBase64.replace(/^data:.*;base64,/, "");
      videoBuffer = Buffer.from(base64Data, "base64");
    }
    if (files?.photo) {
      files.photo.forEach((f) => {
        if (f.buffer) photoBuffers.push(f.buffer);
      });
    }
    if (files?.photos) {
      files.photos.forEach((f) => {
        if (f.buffer) photoBuffers.push(f.buffer);
      });
    }
    if (photoBase64) {
      const base64Data = photoBase64.replace(/^data:.*;base64,/, "");
      photoBuffers.push(Buffer.from(base64Data, "base64"));
    }
    if (!videoBuffer && photoBuffers.length === 0) {
      return res.status(400).json({ error: "No video or photo payload received in request" });
    }
    const formattedDate = recordingDate ? new Date(recordingDate).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : (/* @__PURE__ */ new Date()).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const safeOrderId = escapeHtml(orderId);
    const safeStaffId = escapeHtml(staffId || record.staffId);
    const safeStationId = escapeHtml(stationId || record.stationId);
    let messageId = "";
    let fileId = "";
    let tgResult = null;
    try {
      const durMin = Math.floor((durationSeconds || record.durationSeconds || 0) / 60);
      const durSec = (durationSeconds || record.durationSeconds || 0) % 60;
      const durationStr = `${durMin}m ${durSec}s`;
      const headerTextLines = [
        `\u{1F4E6} <b>ORDER PACKING DETAILS \u2022 ${safeOrderId}</b>`,
        record.awbNumber ? `<b>\u{1F69A} AWB / Tracking:</b> ${escapeHtml(record.awbNumber)}` : "",
        record.courier ? `<b>\u{1F3E2} Courier:</b> ${escapeHtml(record.courier)}` : "",
        record.deliveryMethod ? `<b>\u{1F680} Delivery Method:</b> ${escapeHtml(record.deliveryMethod)}` : "",
        record.weight ? `<b>\u2696\uFE0F Weight:</b> ${escapeHtml(record.weight)}` : "",
        record.productSku ? `<b>\u{1F3F7}\uFE0F SKU / Item:</b> ${escapeHtml(record.productSku)}` : "",
        record.itemCount ? `<b>\u{1F522} Qty:</b> ${escapeHtml(String(record.itemCount))}` : "",
        record.customerName ? `<b>\u{1F464} Customer / City:</b> ${escapeHtml(record.customerName)}` : "",
        record.contactPerson ? `<b>\u{1F4DE} Contact Person:</b> ${escapeHtml(record.contactPerson)}` : "",
        record.contactPhone ? `<b>\u{1F4F1} Contact Phone:</b> ${escapeHtml(record.contactPhone)}` : "",
        record.orderReceivedDate ? `<b>\u{1F4E5} Received Date:</b> ${escapeHtml(record.orderReceivedDate)}` : "",
        record.dispatchDate ? `<b>\u{1F4E4} Despatch Date:</b> ${escapeHtml(record.dispatchDate)}` : "",
        record.orderAmount ? `<b>\u{1F4B0} Order Amount:</b> \u20B9${escapeHtml(record.orderAmount)}` : "",
        record.shippingAmount ? `<b>\u{1F4E6} Shipping Amount:</b> \u20B9${escapeHtml(record.shippingAmount)}` : "",
        record.orderTotal ? `<b>\u{1F4B5} Total Amount:</b> \u20B9${escapeHtml(record.orderTotal)}` : "",
        record.deliveredDate ? `<b>\u2705 Delivered Date:</b> ${escapeHtml(record.deliveredDate)}` : "",
        `<b>\u{1F477} Staff:</b> ${safeStaffId} | <b>\u{1F4CD} Station:</b> ${safeStationId}`,
        `<b>\u{1F4C5} Recorded:</b> ${escapeHtml(formattedDate)} (IST)`,
        record.durationSeconds ? `<b>\u23F1\uFE0F Duration:</b> ${escapeHtml(durationStr)}` : "",
        record.notes ? `<b>\u{1F4DD} Notes:</b> ${escapeHtml(record.notes)}` : ""
      ].filter(Boolean);
      const headerRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: headerTextLines.join("\n"),
          parse_mode: "HTML"
        })
      });
      const headerData = await headerRes.json();
      if (headerData.ok && headerData.result?.message_id) {
        messageId = headerData.result.message_id.toString();
      }
    } catch (e) {
      console.warn("Header message creation error in server:", e);
    }
    const uploadTasks = [];
    const robustUpload = async (method, formData) => {
      let lastErr;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res2 = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, { method: "POST", body: formData });
          const data = await res2.json();
          if (data.ok) return data;
          lastErr = new Error(data.description || `${method} failed`);
        } catch (e) {
          lastErr = e;
        }
        if (attempt === 0) await new Promise((r) => setTimeout(r, 1e3));
      }
      throw lastErr;
    };
    if (videoBuffer) {
      uploadTasks.push((async () => {
        const captionLines = [
          `<b>\u{1F3A5} Packing Video \u2022 Order ID: ${safeOrderId}</b>`,
          record.awbNumber ? `<b>\u{1F69A} AWB:</b> ${escapeHtml(record.awbNumber)}` : "",
          record.courier ? `<b>\u{1F3E2} Courier:</b> ${escapeHtml(record.courier)}` : "",
          record.deliveryMethod ? `<b>\u{1F680} Delivery Method:</b> ${escapeHtml(record.deliveryMethod)}` : "",
          record.weight ? `<b>\u2696\uFE0F Weight:</b> ${escapeHtml(record.weight)}` : "",
          record.productSku ? `<b>\u{1F3F7}\uFE0F SKU / Item:</b> ${escapeHtml(record.productSku)}` : "",
          `<b>\u{1F477} Staff:</b> ${safeStaffId} \u2022 <b>Station:</b> ${safeStationId}`,
          `<b>\u{1F4C5} Recorded:</b> ${escapeHtml(formattedDate)} (IST)`
        ].filter(Boolean);
        const caption = captionLines.join("\n");
        const { mp4Buffer, thumbBuffer } = await transcodeToTelegramMp4(videoBuffer, safeOrderId);
        const formData = new FormData();
        formData.append("chat_id", chatId);
        formData.append("caption", caption);
        formData.append("parse_mode", "HTML");
        if (messageId) {
          formData.append("reply_to_message_id", messageId);
          formData.append("allow_sending_without_reply", "true");
          formData.append("reply_parameters", JSON.stringify({ message_id: Number(messageId), allow_sending_without_reply: true }));
        }
        formData.append("supports_streaming", "true");
        const width = Number(req.body.width);
        const height = Number(req.body.height);
        if (width > 0 && height > 0) {
          formData.append("width", width.toString());
          formData.append("height", height.toString());
        }
        if (durationSeconds > 0) {
          formData.append("duration", Math.round(durationSeconds).toString());
        }
        formData.append("video", new Blob([new Uint8Array(mp4Buffer)], { type: "video/mp4" }), `${safeOrderId}.mp4`);
        if (thumbBuffer && thumbBuffer.length > 0) {
          formData.append("thumb", new Blob([new Uint8Array(thumbBuffer)], { type: "image/jpeg" }), `${safeOrderId}_thumb.jpg`);
        } else if (photoBuffers[0]) {
          formData.append("thumb", new Blob([new Uint8Array(photoBuffers[0])], { type: "image/jpeg" }), `${safeOrderId}_thumb.jpg`);
        }
        return robustUpload("sendVideo", formData);
      })());
    }
    photoBuffers.forEach((pBuf, i) => {
      uploadTasks.push((async () => {
        const photoCaptionLines = [
          videoBuffer ? `<b>\u{1F4F7} Photo Snapshot #${i + 1} \u2022 Order ID: ${safeOrderId}</b>` : `<b>\u{1F4F7} Photo Evidence #${i + 1} \u2022 Order ID: ${safeOrderId}</b>`,
          record.awbNumber ? `<b>AWB:</b> ${escapeHtml(record.awbNumber)}` : "",
          record.courier ? `<b>Courier:</b> ${escapeHtml(record.courier)}` : "",
          record.productSku ? `<b>Item:</b> ${escapeHtml(record.productSku)}` : "",
          `<b>Staff:</b> ${safeStaffId} \u2022 <b>Station:</b> ${safeStationId}`,
          `<b>Captured:</b> ${escapeHtml(formattedDate)} (IST)`
        ].filter(Boolean);
        const photoFormData = new FormData();
        photoFormData.append("chat_id", chatId);
        photoFormData.append("caption", photoCaptionLines.join("\n"));
        photoFormData.append("parse_mode", "HTML");
        if (messageId) {
          photoFormData.append("reply_to_message_id", messageId);
          photoFormData.append("allow_sending_without_reply", "true");
          photoFormData.append("reply_parameters", JSON.stringify({ message_id: Number(messageId), allow_sending_without_reply: true }));
        }
        photoFormData.append("photo", new Blob([new Uint8Array(pBuf)], { type: "image/jpeg" }), `${safeOrderId}_p${i + 1}.jpg`);
        return robustUpload("sendPhoto", photoFormData);
      })());
    });
    if (uploadTasks.length > 0) {
      try {
        const results = await Promise.all(uploadTasks);
        const videoRes = results.find((r) => r.result?.video);
        if (videoRes) {
          fileId = videoRes.result?.video?.file_id;
        } else if (results[0]?.result?.photo) {
          const photos = results[0].result.photo;
          fileId = photos[photos.length - 1]?.file_id;
        }
        if (!messageId && results[0]?.result?.message_id) {
          messageId = results[0].result.message_id.toString();
        }
      } catch (err) {
        console.error("Concurrent media upload failed:", err);
      }
    }
    let cleanChannelId = chatId;
    let numericId = cleanChannelId;
    if (numericId.startsWith("-100")) {
      numericId = numericId.substring(4);
    } else if (numericId.startsWith("-")) {
      numericId = numericId.substring(1);
    }
    let messageLink = "";
    if (messageId) {
      if (cleanChannelId.startsWith("@")) {
        messageLink = `https://t.me/${cleanChannelId.substring(1)}/${messageId}`;
      } else {
        messageLink = `https://t.me/c/${numericId}/${messageId}`;
      }
    }
    record.uploadStatus = "SUCCESS";
    record.telegramChatId = chatId;
    record.telegramMessageId = messageId;
    record.telegramFileId = fileId;
    record.telegramMessageLink = messageLink;
    record.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    ordersStore[orderId] = record;
    saveLocalBackup();
    if (firestoreDb) {
      await setDoc(doc(firestoreDb, "orders", orderId), cleanForFirestore(record), { merge: true });
    }
    res.json({ success: true, record, telegramResponse: tgResult });
  } catch (error) {
    console.error("Telegram upload error:", error);
    const orderId = sanitizeString(req.body.orderId);
    if (orderId && ordersStore[orderId]) {
      ordersStore[orderId].uploadStatus = "FAILED";
      ordersStore[orderId].updatedAt = (/* @__PURE__ */ new Date()).toISOString();
      saveLocalBackup();
      if (firestoreDb) {
        setDoc(doc(firestoreDb, "orders", orderId), cleanForFirestore(ordersStore[orderId]), { merge: true }).catch(() => {
        });
      }
    }
    res.status(500).json({ error: error.message || "Failed to upload video to Telegram" });
  }
});
apiRouter.post("/telegram/update-caption", async (req, res) => {
  const orderId = sanitizeString(req.body.orderId);
  if (!orderId) {
    return res.status(400).json({ error: "orderId is required" });
  }
  let record = ordersStore[orderId];
  if (!record && firestoreDb) {
    try {
      const snap = await getDoc(doc(firestoreDb, "orders", orderId));
      if (snap.exists()) {
        record = snap.data();
      }
    } catch (e) {
    }
  }
  if (!record) {
    return res.status(404).json({ error: "Order not found" });
  }
  Object.keys(req.body).forEach((key) => {
    if (["awbNumber", "courier", "weight", "productSku", "customerName", "contactPerson", "contactPhone", "orderReceivedDate", "dispatchDate", "orderAmount", "shippingAmount", "orderTotal", "deliveredDate", "itemCount", "notes", "fulfillmentStatus", "remarks"].includes(key)) {
      record[key] = sanitizeString(req.body[key]);
    }
  });
  record.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  ordersStore[orderId] = record;
  saveLocalBackup();
  if (firestoreDb) {
    await setDoc(doc(firestoreDb, "orders", orderId), cleanForFirestore(record), { merge: true }).catch(() => {
    });
  }
  const rawBotToken = settings.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN || "";
  const rawChatId = settings.telegramChatId || process.env.TELEGRAM_CHAT_ID || "";
  const botToken = cleanTelegramCredential(rawBotToken);
  const chatId = cleanTelegramCredential(rawChatId);
  if (botToken && chatId && record.telegramMessageId) {
    const durMin = Math.floor((record.durationSeconds || 0) / 60);
    const durSec = (record.durationSeconds || 0) % 60;
    const durationStr = `${durMin}m ${durSec}s`;
    const formattedDate = record.createdAt ? new Date(record.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : (/* @__PURE__ */ new Date()).toLocaleString("en-IN");
    const safeOrderId = escapeHtml(record.orderId);
    const captionLines = [
      `<b>\u{1F4E6} Order ID: ${safeOrderId} (Updated)</b>`,
      record.awbNumber ? `<b>\u{1F69A} AWB / Tracking:</b> ${escapeHtml(record.awbNumber)}` : "",
      record.courier ? `<b>\u{1F3E2} Courier:</b> ${escapeHtml(record.courier)}` : "",
      record.weight ? `<b>\u2696\uFE0F Weight:</b> ${escapeHtml(record.weight)}` : "",
      record.productSku ? `<b>\u{1F3F7}\uFE0F SKU / Item:</b> ${escapeHtml(record.productSku)}` : "",
      record.itemCount ? `<b>\u{1F522} Qty:</b> ${escapeHtml(String(record.itemCount))}` : "",
      record.customerName ? `<b>\u{1F464} Customer / City:</b> ${escapeHtml(record.customerName)}` : "",
      record.contactPerson ? `<b>\u{1F4DE} Contact Person:</b> ${escapeHtml(record.contactPerson)}` : "",
      record.contactPhone ? `<b>\u{1F4F1} Contact Phone:</b> ${escapeHtml(record.contactPhone)}` : "",
      record.orderReceivedDate ? `<b>\u{1F4E5} Received Date:</b> ${escapeHtml(record.orderReceivedDate)}` : "",
      record.dispatchDate ? `<b>\u{1F4E4} Despatch Date:</b> ${escapeHtml(record.dispatchDate)}` : "",
      record.orderAmount ? `<b>\u{1F4B0} Order Amount:</b> \u20B9${escapeHtml(record.orderAmount)}` : "",
      record.shippingAmount ? `<b>\u{1F4E6} Shipping Amount:</b> \u20B9${escapeHtml(record.shippingAmount)}` : "",
      record.orderTotal ? `<b>\u{1F4B5} Total Amount:</b> \u20B9${escapeHtml(record.orderTotal)}` : "",
      record.deliveredDate ? `<b>\u2705 Delivered Date:</b> ${escapeHtml(record.deliveredDate)}` : "",
      `<b>\u{1F477} Staff:</b> ${escapeHtml(record.staffId)}`,
      `<b>\u{1F4CD} Station:</b> ${escapeHtml(record.stationId)}`,
      `<b>\u{1F4C5} Recorded:</b> ${escapeHtml(formattedDate)} (IST)`,
      `<b>\u23F1\uFE0F Duration:</b> ${escapeHtml(durationStr)}`,
      `<b>\u{1F69B} Fulfillment:</b> <b>${escapeHtml(record.fulfillmentStatus || "Pending")}</b>`,
      record.notes ? `<b>\u{1F4DD} Notes:</b> ${escapeHtml(record.notes)}` : "",
      record.remarks ? `<b>\u2705 QC Remarks:</b> ${escapeHtml(record.remarks)}` : "",
      "<b>\u270F\uFE0F Status:</b> Order details edited & synced by Management"
    ].filter(Boolean);
    const newCaption = captionLines.join("\n");
    try {
      await fetch(`https://api.telegram.org/bot${botToken}/editMessageCaption`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: record.telegramChatId || chatId,
          message_id: Number(record.telegramMessageId),
          caption: newCaption,
          parse_mode: "HTML"
        })
      });
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: record.telegramChatId || chatId,
          reply_to_message_id: Number(record.telegramMessageId),
          text: `\u270F\uFE0F <b>Order Details Edited & Synced</b>

<b>Customer:</b> ${escapeHtml(record.customerName || "N/A")}
<b>AWB:</b> ${escapeHtml(record.awbNumber || "N/A")}
<b>SKU:</b> ${escapeHtml(record.productSku || "N/A")}
<b>Notes:</b> ${escapeHtml(record.notes || "N/A")}`,
          parse_mode: "HTML"
        })
      });
    } catch (e) {
      console.error("Failed to update Telegram message caption:", e);
    }
  }
  res.json({ success: true, record });
});
apiRouter.post("/telegram/webhook", async (req, res) => {
  try {
    const update = req.body;
    const message = update?.message;
    const text = message?.text || "";
    const chatId = message?.chat?.id;
    if (chatId && text.startsWith("/video")) {
      const parts = text.split(/\s+/);
      const queryOrderId = sanitizeString(parts[1]);
      const rawBotToken = settings.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN || "";
      const botToken = cleanTelegramCredential(rawBotToken);
      if (!queryOrderId) {
        if (botToken) {
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              text: "\u26A0\uFE0F Please supply an Order ID.\nExample: <code>/video ORD-123456</code>",
              parse_mode: "HTML"
            })
          });
        }
        return res.json({ ok: true });
      }
      let foundRecord = ordersStore[queryOrderId];
      if (!foundRecord && firestoreDb) {
        const snap = await getDoc(doc(firestoreDb, "orders", queryOrderId));
        if (snap.exists()) {
          foundRecord = snap.data();
        }
      }
      if (botToken) {
        if (foundRecord) {
          const replyText = `\u{1F4E6} <b>Order ID: ${escapeHtml(foundRecord.orderId)}</b>

<b>Staff:</b> ${escapeHtml(foundRecord.staffId)}
<b>Station:</b> ${escapeHtml(foundRecord.stationId)}
<b>Status:</b> ${escapeHtml(foundRecord.uploadStatus)}
<b>Duration:</b> ${foundRecord.durationSeconds}s
<b>Recorded:</b> ${new Date(foundRecord.createdAt).toLocaleString()}

\u{1F517} <a href="${foundRecord.telegramMessageLink || "#"}">View Original Telegram Video Message</a>`;
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              text: replyText,
              parse_mode: "HTML"
            })
          });
        } else {
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              text: `\u274C No packing video found for Order ID: <code>${escapeHtml(queryOrderId)}</code>`,
              parse_mode: "HTML"
            })
          });
        }
      }
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("Telegram webhook error:", err);
    res.json({ ok: true });
  }
});
apiRouter.post("/telegram/test-connection", async (req, res) => {
  const bodyToken = req.body?.telegramBotToken ? cleanTelegramCredential(req.body.telegramBotToken) : "";
  const bodyChatId = req.body?.telegramChatId ? cleanTelegramCredential(req.body.telegramChatId) : "";
  const rawBotToken = bodyToken || settings.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN || "";
  const rawChatId = bodyChatId || settings.telegramChatId || process.env.TELEGRAM_CHAT_ID || "";
  const botToken = cleanTelegramCredential(rawBotToken);
  const chatId = cleanTelegramCredential(rawChatId);
  if (!botToken || !chatId) {
    return res.status(400).json({ error: "Telegram Bot Token and Chat ID not configured." });
  }
  try {
    const meRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const meText = await meRes.text();
    let meData = null;
    try {
      meData = JSON.parse(meText);
    } catch {
      throw new Error("Telegram API unreachable or returned non-JSON response");
    }
    if (!meData || !meData.ok) {
      throw new Error(meData?.description || "Invalid Telegram Bot Token");
    }
    const botUsername = meData.result?.username ? `@${meData.result.username}` : "Bot";
    const text = `\u{1F7E2} <b>Zuboc Flow (${escapeHtml(botUsername)}) Connected!</b>

<b>Station:</b> ${escapeHtml(settings.stationId)}
<b>Timestamp:</b> ${escapeHtml((/* @__PURE__ */ new Date()).toLocaleString("en-GB"))}

Your Zuboc Flow packing station is online and verified. Recorded order packing evidence will be delivered here automatically.`;
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML"
      })
    });
    const responseText = await response.text();
    let data = null;
    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error("Telegram API sendMessage returned non-JSON response");
    }
    if (!data || !data.ok) {
      throw new Error(data?.description || "Failed to send message to Telegram chat ID");
    }
    if (bodyToken && !bodyToken.includes("...")) {
      settings.telegramBotToken = bodyToken;
    }
    if (bodyChatId) {
      settings.telegramChatId = bodyChatId;
    }
    saveLocalBackup();
    if (firestoreDb) {
      setDoc(doc(firestoreDb, "settings", "config"), cleanForFirestore({
        telegramBotToken: settings.telegramBotToken,
        telegramChatId: settings.telegramChatId,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      }), { merge: true }).catch(() => {
      });
    }
    res.json({ success: true, botUsername, message: `Bot ${botUsername} verified and test message sent successfully!`, telegramResponse: data });
  } catch (err) {
    console.error("Test connection error:", err);
    res.status(500).json({ error: err.message || "Failed to verify Telegram credentials" });
  }
});
apiRouter.post("/telegram/detect-chat-id", async (req, res) => {
  const bodyToken = req.body?.telegramBotToken ? cleanTelegramCredential(req.body.telegramBotToken) : "";
  const rawBotToken = bodyToken || settings.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN || "";
  const botToken = cleanTelegramCredential(rawBotToken);
  if (!botToken) {
    return res.status(400).json({ error: "Please enter a valid Telegram Bot Token first." });
  }
  try {
    const updatesRes = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates?limit=50`);
    const updatesText = await updatesRes.text();
    let updatesData = null;
    try {
      updatesData = JSON.parse(updatesText);
    } catch {
      throw new Error("Telegram API returned non-JSON response");
    }
    if (!updatesData || !updatesData.ok) {
      throw new Error(updatesData?.description || "Failed to fetch Telegram bot updates");
    }
    const foundChats = [];
    const seenIds = /* @__PURE__ */ new Set();
    const results = updatesData.result || [];
    for (const update of results) {
      const chat = update?.message?.chat || update?.channel_post?.chat || update?.my_chat_member?.chat || update?.edited_message?.chat;
      if (chat && chat.id) {
        const idStr = String(chat.id);
        if (!seenIds.has(idStr)) {
          seenIds.add(idStr);
          foundChats.push({
            id: idStr,
            title: chat.title || chat.username || chat.first_name || `Chat ${idStr}`,
            type: chat.type || "group"
          });
        }
      }
    }
    if (foundChats.length === 0) {
      return res.json({
        success: false,
        message: 'No recent messages found. Steps: 1) Add your bot to your Telegram Group, 2) Send a message (e.g. "hello bot") in the group, 3) Click Detect Chat ID again!'
      });
    }
    const preferredChat = foundChats.find((c) => c.type === "supergroup" || c.type === "group" || c.type === "channel") || foundChats[foundChats.length - 1];
    res.json({
      success: true,
      chatId: preferredChat.id,
      chatTitle: preferredChat.title,
      chatType: preferredChat.type,
      chats: foundChats,
      message: `Found group "${preferredChat.title}" (Chat ID: ${preferredChat.id})`
    });
  } catch (err) {
    console.error("Detect Chat ID error:", err);
    res.status(500).json({ error: err.message || "Failed to detect group Chat ID" });
  }
});
apiRouter.post("/ifm/chat", async (req, res) => {
  const { messages } = req.body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages array is required" });
  }
  const apiKey = process.env.IFM_API_KEY || "IFM-v1_d4sAGkIRgbpx7-PjHCqNJdpxTdjAVETb0sxzHd1DYFV7zPasHQnnS00CFePOaMsN";
  const apiUrl = "https://api.ifm.ai/v1/chat/completions";
  const modelName = "IFM/K2-Horizon-375B-A23B";
  const payloadMessages = messages.map((m) => ({
    role: m.role,
    content: typeof m.content === "string" ? m.content : JSON.stringify(m.content)
  }));
  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messages: payloadMessages,
        model: modelName
      })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error?.message || data?.message || `IFM API error status ${response.status}`);
    }
    res.json({ success: true, data });
  } catch (err) {
    console.error("IFM AI API error:", err);
    res.status(500).json({ error: err.message || "Failed to communicate with IFM AI API" });
  }
});
app.use("/api", async (req, res, next) => {
  try {
    await ensureInitialSync();
  } catch (e) {
    console.error("API Warmup error:", e);
  }
  next();
}, apiRouter);
app.use((err, req, res, next) => {
  console.error("Unhandled Server Error:", err);
  res.status(500).json({ error: err.message || "Internal Server Error" });
});
async function startServer() {
  if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
    try {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true, hmr: false },
        appType: "spa"
      });
      app.use(vite.middlewares);
    } catch (e) {
      console.warn("Vite dev server middleware omitted:", e);
    }
  } else if (!process.env.VERCEL) {
    app.use(express.static(path.join(__dirname, "dist"), {
      setHeaders: (res, filepath) => {
        if (filepath.endsWith("index.html") || filepath.endsWith("sw.js") || filepath.endsWith("manifest.webmanifest")) {
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate, max-age=0");
        }
      }
    }));
    app.get("*", (req, res) => {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate, max-age=0");
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }
  if (!process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Zuboc Flow Server (v1.2.1-diag) running on http://localhost:${PORT}`);
      syncFromSupabase().catch((e) => console.error("Background sync error:", e));
    });
  }
}
if (!process.env.VERCEL) {
  startServer();
}
var server_default = app;
export {
  server_default as default
};
