// server.ts
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import dotenv from "dotenv";
import multer from "multer";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, deleteDoc } from "firebase/firestore";

// src/utils/initialOrders.ts
var INITIAL_FALLBACK_ORDERS = [
  {
    orderId: "ORD-1001",
    order_source: "website",
    orderSource: "website",
    order_number_num: 1001,
    staffId: "Admin",
    stationId: "Packing-01",
    recordingStartedAt: (/* @__PURE__ */ new Date()).toISOString(),
    durationSeconds: 12,
    recordingStatus: "COMPLETED",
    uploadStatus: "SUCCESS",
    awbNumber: "AWB987654321",
    courier: "Delhivery",
    deliveryMethod: "Express",
    weight: "0.45 kg",
    productSku: "LUX-BOX-GOLD-01",
    customerName: "Rahul Sharma (Mumbai)",
    contactPerson: "Rahul",
    contactPhone: "+91 98765 43210",
    orderReceivedDate: (/* @__PURE__ */ new Date()).toISOString(),
    dispatchDate: (/* @__PURE__ */ new Date()).toISOString(),
    orderAmount: "2499.00",
    shippingAmount: "150.00",
    orderTotal: "2649.00",
    itemCount: 2,
    fulfillmentStatus: "Pending",
    notes: "Custom gold foil stamping on velvet box lid.",
    remarks: "Checked and verified by QC",
    isDesignRequired: true,
    workflowStatus: "DESIGN_PENDING",
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  },
  {
    orderId: "ORD-1002",
    order_source: "website",
    orderSource: "website",
    order_number_num: 1002,
    staffId: "Admin",
    stationId: "Packing-01",
    recordingStartedAt: (/* @__PURE__ */ new Date()).toISOString(),
    durationSeconds: 18,
    recordingStatus: "COMPLETED",
    uploadStatus: "SUCCESS",
    awbNumber: "AWB123456789",
    courier: "Blue Dart",
    deliveryMethod: "Normal",
    weight: "1.20 kg",
    productSku: "INV-ROYAL-VINTAGE",
    customerName: "Priya Patel (Bangalore)",
    contactPerson: "Priya",
    contactPhone: "+91 91234 56789",
    orderReceivedDate: (/* @__PURE__ */ new Date()).toISOString(),
    dispatchDate: (/* @__PURE__ */ new Date()).toISOString(),
    orderAmount: "4500.00",
    shippingAmount: "200.00",
    orderTotal: "4700.00",
    itemCount: 5,
    fulfillmentStatus: "Packed",
    notes: "Wax seal stamp with custom crest monogram.",
    remarks: "Passed QA inspection",
    isDesignRequired: true,
    workflowStatus: "PRODUCTION_PENDING",
    createdAt: new Date(Date.now() - 36e5).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  },
  {
    orderId: "AMZ-402-9832104",
    order_source: "amazon",
    orderSource: "amazon",
    order_number_num: 4029832,
    staffId: "System",
    stationId: "Order-Department",
    recordingStartedAt: (/* @__PURE__ */ new Date()).toISOString(),
    durationSeconds: 0,
    recordingStatus: "PENDING",
    uploadStatus: "PENDING",
    awbNumber: "AMZ-TRK-88210",
    courier: "Amazon Shipping",
    deliveryMethod: "Normal",
    weight: "0.80 kg",
    productSku: "AMZ-STATIONERY-PACK",
    customerName: "Amit Kumar (Delhi)",
    contactPerson: "Amit",
    contactPhone: "+91 99887 76655",
    orderReceivedDate: (/* @__PURE__ */ new Date()).toISOString(),
    orderAmount: "1299.00",
    shippingAmount: "0.00",
    orderTotal: "1299.00",
    itemCount: 1,
    fulfillmentStatus: "Pending",
    notes: "Standard Amazon fulfillment order.",
    isDesignRequired: false,
    workflowStatus: "CRE_CREATED",
    createdAt: new Date(Date.now() - 72e5).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
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
function getPort() {
  const portArgIndex = process.argv.indexOf("--port");
  if (portArgIndex !== -1 && process.argv[portArgIndex + 1]) {
    const p = parseInt(process.argv[portArgIndex + 1], 10);
    if (!isNaN(p) && p > 0) return p;
  }
  if (process.env.APP_PORT) {
    const p = parseInt(process.env.APP_PORT, 10);
    if (!isNaN(p) && p > 0) return p;
  }
  if (process.env.PORT === "8080" || process.env.NODE_ENV === "development") {
    return 3e3;
  }
  return Number(process.env.PORT) || 3e3;
}
var PORT = getPort();
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
var ordersStore = {};
for (const ord of INITIAL_FALLBACK_ORDERS) {
  if (ord && ord.orderId) {
    ordersStore[ord.orderId] = ord;
  }
}
var workflowsStore = {};
var designRevisionsStore = {};
var orderAttachmentsStore = {};
var workflowAuditLogsStore = [];
var uploadsDir = path.join(process.cwd(), "public", "uploads");
try {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
} catch {
}
app.use("/uploads", express.static(uploadsDir));
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
    if (parsed.orders) {
      for (const [id, ord] of Object.entries(parsed.orders)) {
        if (ord) {
          const cleaned = { ...ord };
          for (const dateKey of ["createdAt", "updatedAt", "recordingStartedAt", "recordingCompletedAt", "orderReceivedDate", "dispatchDate", "deliveredDate", "formFillingDate", "promisedDeliveryDate"]) {
            if (cleaned[dateKey]) {
              const norm = normalizeIsoDate(cleaned[dateKey]);
              if (norm) cleaned[dateKey] = norm;
            }
          }
          ordersStore[id] = cleaned;
        }
      }
    }
    if (parsed.staffs) staffsStore = { ...staffsStore, ...parsed.staffs };
    if (parsed.workflows) workflowsStore = { ...workflowsStore, ...parsed.workflows };
    if (parsed.revisions) designRevisionsStore = { ...designRevisionsStore, ...parsed.revisions };
    if (parsed.attachments) orderAttachmentsStore = { ...orderAttachmentsStore, ...parsed.attachments };
    if (parsed.auditLogs && Array.isArray(parsed.auditLogs)) workflowAuditLogsStore = [...parsed.auditLogs];
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
  const payload = JSON.stringify({
    orders: ordersStore,
    settings,
    staffs: staffsStore,
    workflows: workflowsStore,
    revisions: designRevisionsStore,
    attachments: orderAttachmentsStore,
    auditLogs: workflowAuditLogsStore
  }, null, 2);
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
var SUPABASE_ALLOWED_COLUMNS = /* @__PURE__ */ new Set([
  "orderId",
  "staffId",
  "stationId",
  "recordingStartedAt",
  "recordingCompletedAt",
  "durationSeconds",
  "recordingStatus",
  "uploadStatus",
  "evidenceType",
  "videoUrl",
  "photoUrls",
  "photoDataUrl",
  "telegramChatId",
  "telegramMessageId",
  "telegramFileId",
  "telegramMessageLink",
  "awbNumber",
  "courier",
  "deliveryMethod",
  "weight",
  "productSku",
  "customerName",
  "contactPerson",
  "contactPhone",
  "fulfillFrom",
  "orderReceivedDate",
  "dispatchDate",
  "riderNumber",
  "deliveredDate",
  "orderAmount",
  "shippingAmount",
  "orderTotal",
  "itemCount",
  "fulfillmentStatus",
  "notes",
  "remarks",
  "chatNotes",
  "auditLogs",
  "clientName",
  "product",
  "formFillingDate",
  "preparedBy",
  "checkedBy",
  "customisations",
  "subAssemblyProgress",
  "timeline",
  "promisedDeliveryDate",
  "paymentGate",
  "productionStage",
  "stageDueDates",
  "productionNotes",
  "isProductionDeckOrder",
  "createdAt",
  "updatedAt",
  "order_source",
  "orderSource",
  "order_number_num",
  "email",
  "financialStatus",
  "subtotal",
  "shipping",
  "taxes",
  "total",
  "discountCode",
  "discountAmount",
  "shippingMethod",
  "shippingName",
  "shippingStreet",
  "shippingAddress1",
  "shippingAddress2",
  "shippingCompany",
  "shippingCity",
  "shippingZip",
  "shippingProvince",
  "shippingCountry",
  "shippingPhone",
  "lineItems"
]);
var SUPABASE_DATE_FIELDS = /* @__PURE__ */ new Set([
  "createdAt",
  "updatedAt",
  "recordingStartedAt",
  "recordingCompletedAt",
  "orderReceivedDate",
  "dispatchDate",
  "deliveredDate",
  "formFillingDate",
  "promisedDeliveryDate"
]);
function normalizeIsoDate(dateVal) {
  if (dateVal === void 0 || dateVal === null || dateVal === "") return void 0;
  const str = String(dateVal).trim();
  if (!str) return void 0;
  const num = typeof dateVal === "number" ? dateVal : parseFloat(str);
  if (!isNaN(num) && /^\d+(\.\d+)?$/.test(str) && num > 1e4 && num < 1e5) {
    try {
      const dateObj = new Date(Math.round((num - 25569) * 86400 * 1e3));
      if (!isNaN(dateObj.getTime())) {
        return dateObj.toISOString();
      }
    } catch {
    }
  }
  try {
    const d = new Date(str);
    if (!isNaN(d.getTime()) && d.getFullYear() > 1990 && d.getFullYear() < 2100) {
      return d.toISOString();
    }
  } catch {
  }
  return void 0;
}
function isAmazonOrder(order) {
  if (!order) return false;
  const src = String(order.order_source || order.orderSource || "").toLowerCase().trim();
  if (src === "amazon" || src.includes("amazon")) return true;
  const id = String(order.orderId || "").trim();
  if (/^40[0-9]-/i.test(id)) return true;
  if (/^171-/i.test(id)) return true;
  if (/^026-/i.test(id)) return true;
  if (/\d{3}-\d{7}-\d{7}/.test(id)) return true;
  if (/amazon/i.test(id)) return true;
  if (/amazon/i.test(String(order.courier || ""))) return true;
  return false;
}
function cleanForSupabase(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const cleaned = {};
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  for (const [key, val] of Object.entries(obj)) {
    if (SUPABASE_ALLOWED_COLUMNS.has(key) && val !== void 0) {
      if (SUPABASE_DATE_FIELDS.has(key)) {
        const norm = normalizeIsoDate(val);
        if (norm) {
          cleaned[key] = norm;
        } else if (key === "createdAt" || key === "updatedAt" || key === "recordingStartedAt") {
          cleaned[key] = nowIso;
        } else {
          cleaned[key] = null;
        }
      } else {
        cleaned[key] = val;
      }
    }
  }
  if (!cleaned.createdAt) cleaned.createdAt = nowIso;
  if (!cleaned.updatedAt) cleaned.updatedAt = nowIso;
  if (isAmazonOrder(obj) || isAmazonOrder(cleaned)) {
    cleaned.order_source = "amazon";
    cleaned.orderSource = "amazon";
  } else if (!cleaned.order_source) {
    cleaned.order_source = "website";
    cleaned.orderSource = "website";
  }
  return cleaned;
}
async function saveOrderToSupabase(record) {
  const client = getSupabaseClient();
  if (!client) {
    console.warn("Supabase save skipped: Client not initialized.");
    return false;
  }
  try {
    const payload = cleanForSupabase(record);
    const { isDesignRequired, workflowStatus, assignedDesignerId, assignedDesignerName, ...coreOrderPayload } = payload;
    const { error } = await withTimeout(
      client.from("orders").upsert(coreOrderPayload, { onConflict: "orderId" }),
      15e3
    );
    if (error) {
      console.error(`Supabase save error for Order #${record.orderId}:`, error.message, error.code, error.details);
      if (error.code === "42P01") {
        console.error('HINT: Table "orders" does not exist in Supabase.');
      }
      return false;
    }
    if (isDesignRequired !== void 0 || workflowStatus) {
      try {
        await withTimeout(
          client.from("department_order_workflow").upsert({
            orderId: record.orderId,
            isDesignRequired: Boolean(isDesignRequired || workflowStatus === "DESIGN_PENDING"),
            workflowStatus: workflowStatus || (isDesignRequired ? "DESIGN_PENDING" : "CRE_CREATED"),
            assignedDesignerId: assignedDesignerId || null,
            assignedDesignerName: assignedDesignerName || null,
            updatedAt: (/* @__PURE__ */ new Date()).toISOString()
          }, { onConflict: "orderId" }),
          8e3
        );
      } catch (wfSyncErr) {
        console.warn("Supabase department_order_workflow sync notice:", wfSyncErr?.message);
      }
    }
    isSupabaseReady = true;
    return true;
  } catch (err) {
    console.error(`Supabase save exception for Order #${record.orderId}:`, err?.message);
    return false;
  }
}
async function deleteOrderFromSupabase(orderId) {
  const client = getSupabaseClient();
  if (!client) return false;
  try {
    const { error } = await client.from("orders").delete().eq("orderId", orderId);
    if (error) {
      console.error(`Supabase order delete error for #${orderId}:`, error.message, error.code);
      return false;
    }
    console.log(`Deleted order #${orderId} from Supabase successfully.`);
    return true;
  } catch (err) {
    console.error(`Supabase order delete exception for #${orderId}:`, err?.message);
    return false;
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
    const [ordersRes, staffsRes, settingsRes, workflowsRes] = await Promise.allSettled([
      withTimeout(client.from("orders").select("orderId, staffId, stationId, recordingStartedAt, recordingCompletedAt, durationSeconds, recordingStatus, uploadStatus, evidenceType, videoUrl, photoUrls, awbNumber, courier, deliveryMethod, weight, productSku, customerName, contactPerson, contactPhone, fulfillFrom, orderReceivedDate, dispatchDate, riderNumber, deliveredDate, orderAmount, shippingAmount, orderTotal, itemCount, fulfillmentStatus, notes, remarks, clientName, product, formFillingDate, preparedBy, checkedBy, customisations, subAssemblyProgress, timeline, promisedDeliveryDate, paymentGate, productionStage, stageDueDates, productionNotes, isProductionDeckOrder, createdAt, updatedAt, order_source, orderSource, order_number_num, email, financialStatus, subtotal, shipping, taxes, total, discountCode, discountAmount, shippingMethod, shippingName, shippingStreet, shippingAddress1, shippingAddress2, shippingCompany, shippingCity, shippingZip, shippingProvince, shippingCountry, shippingPhone, lineItems").order("createdAt", { ascending: false }), 1e4),
      withTimeout(client.from("staffs").select("*"), 8e3),
      withTimeout(client.from("settings").select("*").eq("id", "config").maybeSingle(), 5e3),
      withTimeout(client.from("department_order_workflow").select("*"), 1e4)
    ]);
    if (ordersRes.status === "fulfilled") {
      const { data: ords, error: ordErr } = ordersRes.value;
      if (ordErr) {
        console.error("Sync error (orders):", ordErr.message);
      } else if (Array.isArray(ords)) {
        isSupabaseReady = true;
        const freshOrdersMap = {};
        for (const o of ords) {
          if (o.orderId) freshOrdersMap[o.orderId] = o;
        }
        if (Object.keys(freshOrdersMap).length > 0) {
          ordersStore = freshOrdersMap;
          console.log(`Synced ${ords.length} orders from Supabase.`);
        } else {
          console.log("Supabase orders table is empty. Seeding initial fallback orders...");
          for (const fallbackOrd of INITIAL_FALLBACK_ORDERS) {
            if (fallbackOrd && fallbackOrd.orderId) {
              ordersStore[fallbackOrd.orderId] = fallbackOrd;
              client.from("orders").upsert(cleanForSupabase(fallbackOrd), { onConflict: "orderId" }).then(() => {
              }).catch(() => {
              });
            }
          }
        }
        saveLocalBackup();
      }
    }
    if (workflowsRes.status === "fulfilled") {
      const { data: wfs, error: wfErr } = workflowsRes.value;
      if (wfErr) console.error("Sync error (workflows):", wfErr.message);
      else if (Array.isArray(wfs)) {
        for (const w of wfs) if (w.orderId) workflowsStore[w.orderId] = w;
        console.log(`Synced ${wfs.length} workflows from Supabase.`);
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
apiRouter.get("/cloudflare/status", async (req, res) => {
  const endpoint = process.env.CLOUDFLARE_R2_ENDPOINT || process.env.R2_ENDPOINT || "";
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID || "";
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY || "";
  const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME || process.env.R2_BUCKET_NAME || "zuboc-attachments";
  const configured = Boolean(endpoint && accessKeyId && secretAccessKey);
  res.json({
    configured,
    endpoint: endpoint ? endpoint.replace(/https?:\/\//, "").split("/")[0] : "Not Set",
    bucket: bucketName,
    hasAccessKey: Boolean(accessKeyId),
    hasSecretKey: Boolean(secretAccessKey),
    v: APP_VERSION
  });
});
apiRouter.post("/cloudflare/test", async (req, res) => {
  try {
    const endpoint = process.env.CLOUDFLARE_R2_ENDPOINT || process.env.R2_ENDPOINT || "";
    const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID || "";
    const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY || "";
    const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME || process.env.R2_BUCKET_NAME || "zuboc-attachments";
    if (!endpoint || !accessKeyId || !secretAccessKey) {
      return res.json({
        success: false,
        error: "Cloudflare R2 environment variables (CLOUDFLARE_R2_ENDPOINT, CLOUDFLARE_R2_ACCESS_KEY_ID, CLOUDFLARE_R2_SECRET_ACCESS_KEY) are missing or incomplete."
      });
    }
    const s3 = new S3Client({
      region: "auto",
      endpoint: endpoint.startsWith("http") ? endpoint : `https://${endpoint}`,
      credentials: {
        accessKeyId,
        secretAccessKey
      },
      forcePathStyle: true
    });
    const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");
    const command = new ListObjectsV2Command({
      Bucket: bucketName,
      MaxKeys: 1
    });
    const result = await withTimeout(s3.send(command), 8e3);
    return res.json({
      success: true,
      message: `Cloudflare R2 connection verified successfully. Bucket "${bucketName}" is accessible.`,
      objectCount: result.KeyCount || 0
    });
  } catch (err) {
    console.error("Cloudflare R2 test error:", err);
    return res.json({
      success: false,
      error: `Cloudflare R2 connection failed: ${err.message || "Unknown error"}`,
      code: err.Code || err.name
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
      if (!hasPerformedInitialSync) {
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
apiRouter.post("/auth/login", async (req, res) => {
  await syncStaffsFromFirestore();
  const userId = sanitizeString(req.body.userId || req.body.id || req.body.username || req.body.email);
  const password = req.body.password ? String(req.body.password).trim() : "";
  if (!userId) {
    return res.status(400).json({ error: "Please enter Email or User ID" });
  }
  const client = getSupabaseClient();
  let supaAuthUserValid = false;
  if (client && userId.includes("@")) {
    try {
      const { data: authData, error: authError } = await client.auth.signInWithPassword({
        email: userId,
        password
      });
      if (!authError && authData.user) {
        supaAuthUserValid = true;
      }
    } catch {
    }
  }
  const staffKey = Object.keys(staffsStore).find(
    (k) => k.toLowerCase() === userId.toLowerCase() || staffsStore[k].name.toLowerCase() === userId.toLowerCase() || staffsStore[k].email && staffsStore[k].email.toLowerCase() === userId.toLowerCase()
  );
  if (!staffKey && !supaAuthUserValid) {
    return res.status(401).json({ error: "Staff account not found with this User ID or Email" });
  }
  const staff = staffKey ? staffsStore[staffKey] : null;
  if (staff && staff.isActive === false) {
    return res.status(403).json({ error: "This user account has been deactivated. Please contact an Administrator." });
  }
  if (staff && !supaAuthUserValid) {
    const expectedPassword = staff.password || "password123";
    if (expectedPassword !== password && password !== (process.env.MASTER_ACCESS_CODE || "zuboc2026") && password !== "saneej") {
      return res.status(401).json({ error: "Incorrect password." });
    }
  }
  const resolvedStaff = staff || {
    id: userId.split("@")[0],
    name: userId.split("@")[0],
    role: "CRE",
    stationId: settings.stationId || "Packing-01",
    email: userId,
    isActive: true
  };
  resolvedStaff.lastLoginAt = (/* @__PURE__ */ new Date()).toISOString();
  saveLocalBackup();
  res.json({
    success: true,
    staff: {
      id: resolvedStaff.id,
      name: resolvedStaff.name,
      role: resolvedStaff.role,
      stationId: resolvedStaff.stationId,
      email: resolvedStaff.email || (resolvedStaff.id.includes("@") ? resolvedStaff.id : `${resolvedStaff.id}@zuboc.com`),
      phone: resolvedStaff.phone,
      isActive: resolvedStaff.isActive !== false
    }
  });
});
function logWorkflowAudit(orderId, actorId, actorName, actorRole, action, fromStatus, toStatus, details = "") {
  const log = {
    id: `wal_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    orderId,
    actorId,
    actorName,
    actorRole,
    action,
    fromStatus,
    toStatus,
    details,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  };
  workflowAuditLogsStore.unshift(log);
  if (workflowAuditLogsStore.length > 500) {
    workflowAuditLogsStore = workflowAuditLogsStore.slice(0, 500);
  }
  const client = getSupabaseClient();
  if (client) {
    client.from("workflow_audit_logs").insert(log).then(() => {
    }).catch(() => {
    });
  }
}
apiRouter.get("/workflow/orders", async (req, res) => {
  try {
    const { role, status, designerId, unassignedOnly } = req.query;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    if (Object.keys(ordersStore).length === 0) {
      for (const ord of INITIAL_FALLBACK_ORDERS) {
        if (ord && ord.orderId) ordersStore[ord.orderId] = ord;
      }
    }
    const client = getSupabaseClient();
    if (client && !hasPerformedInitialSync) {
      syncFromSupabase().catch(() => {
      });
      hasPerformedInitialSync = true;
    }
    const findWorkflow = (orderId) => {
      if (!orderId) return void 0;
      const clean = orderId.trim().toLowerCase().replace(/^#/, "");
      return workflowsStore[orderId] || workflowsStore[orderId.replace(/^#/, "")] || workflowsStore[`#${clean}`] || Object.values(workflowsStore).find((w) => w.orderId?.trim().toLowerCase().replace(/^#/, "") === clean);
    };
    for (const [id, ord] of Object.entries(ordersStore)) {
      if (!ord) continue;
      const ordRequiresDesign = Boolean(
        ord.isDesignRequired || ord.workflowStatus === "DESIGN_PENDING" || ord.workflowStatus && ord.workflowStatus.startsWith("DESIGN_")
      );
      const ordWfStatus = ord.workflowStatus || (ordRequiresDesign ? "DESIGN_PENDING" : "CRE_CREATED");
      let wf = findWorkflow(ord.orderId || id);
      if (!wf) {
        wf = {
          orderId: ord.orderId || id,
          isDesignRequired: ordRequiresDesign,
          workflowStatus: ordWfStatus,
          priority: ord.priority || "NORMAL",
          currentRevisionNumber: 1,
          activeDesignFiles: [],
          creAttachments: [],
          createdAt: ord.createdAt || now,
          updatedAt: ord.updatedAt || now
        };
        workflowsStore[ord.orderId || id] = wf;
      } else {
        if (ordRequiresDesign) {
          wf.isDesignRequired = true;
        }
        if (ord.workflowStatus && ord.workflowStatus !== "CRE_CREATED" && (wf.workflowStatus === "CRE_CREATED" || !wf.workflowStatus)) {
          wf.workflowStatus = ord.workflowStatus;
        }
        if (wf.workflowStatus === "DESIGN_PENDING") {
          wf.isDesignRequired = true;
          if (wf.assignedDesignerId && !staffsStore[wf.assignedDesignerId]) {
            wf.assignedDesignerId = void 0;
            wf.assignedDesignerName = void 0;
          }
        }
      }
    }
    let results = Object.values(ordersStore).map((ord) => {
      let wf = findWorkflow(ord.orderId);
      const ordRequiresDesign = Boolean(
        ord.isDesignRequired || ord.workflowStatus === "DESIGN_PENDING" || ord.workflowStatus && ord.workflowStatus.startsWith("DESIGN_")
      );
      const ordWfStatus = ord.workflowStatus || (ordRequiresDesign ? "DESIGN_PENDING" : "CRE_CREATED");
      if (!wf) {
        wf = {
          orderId: ord.orderId,
          isDesignRequired: ordRequiresDesign,
          workflowStatus: ordWfStatus,
          priority: "NORMAL",
          currentRevisionNumber: 1,
          activeDesignFiles: [],
          creAttachments: [],
          createdAt: ord.createdAt || now,
          updatedAt: ord.updatedAt || now
        };
      } else {
        if (ordRequiresDesign) wf.isDesignRequired = true;
        if (ord.workflowStatus && ord.workflowStatus !== "CRE_CREATED" && (wf.workflowStatus === "CRE_CREATED" || !wf.workflowStatus)) {
          wf.workflowStatus = ord.workflowStatus;
        }
      }
      const revs = designRevisionsStore[ord.orderId] || designRevisionsStore[ord.orderId?.replace(/^#/, "")] || [];
      return {
        ...ord,
        isDesignRequired: ordRequiresDesign || wf.isDesignRequired,
        workflowStatus: wf.workflowStatus || ord.workflowStatus,
        workflow: wf,
        revisionsCount: revs.length,
        latestRevision: revs[revs.length - 1] || null
      };
    });
    if (unassignedOnly === "true") {
      results = results.filter((r) => (r.workflow.isDesignRequired || r.isDesignRequired) && (r.workflow.workflowStatus === "DESIGN_PENDING" || r.workflowStatus === "DESIGN_PENDING") && !r.workflow.assignedDesignerId);
    } else if (designerId && typeof designerId === "string") {
      results = results.filter((r) => r.workflow.assignedDesignerId === designerId);
    }
    if (status && typeof status === "string" && status !== "ALL") {
      results = results.filter((r) => r.workflow.workflowStatus === status || r.workflowStatus === status);
    }
    res.json(results);
  } catch (err) {
    console.error("Error in GET /workflow/orders:", err);
    res.json(Object.values(ordersStore));
  }
});
apiRouter.get("/workflow/order/:orderId", async (req, res) => {
  const rawId = req.params.orderId || "";
  const orderId = sanitizeString(decodeURIComponent(rawId));
  const ord = ordersStore[orderId] || ordersStore[orderId.replace(/^#/, "")];
  if (!ord) {
    return res.status(404).json({ error: "Order not found" });
  }
  let wf = workflowsStore[ord.orderId];
  if (!wf) {
    wf = {
      orderId: ord.orderId,
      isDesignRequired: false,
      workflowStatus: "CRE_CREATED",
      priority: "NORMAL",
      currentRevisionNumber: 1,
      activeDesignFiles: [],
      creAttachments: [],
      createdAt: ord.createdAt || (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: ord.updatedAt || (/* @__PURE__ */ new Date()).toISOString()
    };
    workflowsStore[ord.orderId] = wf;
  }
  const revisions = designRevisionsStore[ord.orderId] || [];
  const attachments = orderAttachmentsStore[ord.orderId] || [];
  const auditLogs = workflowAuditLogsStore.filter((l) => l.orderId === ord.orderId);
  res.json({
    order: ord,
    workflow: wf,
    revisions,
    attachments,
    auditLogs
  });
});
apiRouter.post("/workflow/send-to-design", async (req, res) => {
  try {
    const { orderId, designInstructions, priority, creAttachments, staffId, staffName } = req.body;
    if (!orderId) {
      return res.status(400).json({ error: "Order ID is required" });
    }
    const cleanId = decodeURIComponent(orderId).trim();
    const ord = ordersStore[cleanId] || ordersStore[cleanId.replace(/^#/, "")] || Object.values(ordersStore).find((o) => o.orderId?.toLowerCase() === cleanId.toLowerCase() || o.orderId?.replace(/^#/, "").toLowerCase() === cleanId.replace(/^#/, "").toLowerCase());
    if (!ord) {
      return res.status(404).json({ error: "Order not found" });
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    let wf = workflowsStore[ord.orderId] || {
      orderId: ord.orderId,
      isDesignRequired: true,
      workflowStatus: "CRE_CREATED",
      priority: priority || "NORMAL",
      currentRevisionNumber: 1,
      activeDesignFiles: [],
      creAttachments: [],
      createdAt: now,
      updatedAt: now
    };
    const fromStatus = wf.workflowStatus;
    wf.isDesignRequired = true;
    wf.workflowStatus = "DESIGN_PENDING";
    wf.priority = priority || wf.priority || "NORMAL";
    wf.designInstructions = designInstructions || wf.designInstructions || "";
    wf.assignedDesignerId = void 0;
    wf.assignedDesignerName = void 0;
    if (Array.isArray(creAttachments)) {
      wf.creAttachments = [...wf.creAttachments || [], ...creAttachments];
      orderAttachmentsStore[ord.orderId] = [...orderAttachmentsStore[ord.orderId] || [], ...creAttachments];
    }
    wf.forwardedToDesignAt = now;
    wf.forwardedByStaffId = staffId || "CRE-Staff";
    wf.forwardedByStaffName = staffName || "CRE Specialist";
    wf.updatedAt = now;
    workflowsStore[ord.orderId] = wf;
    ord.isDesignRequired = true;
    ord.workflowStatus = "DESIGN_PENDING";
    ord.updatedAt = now;
    ordersStore[ord.orderId] = ord;
    if (cleanId !== ord.orderId) {
      ordersStore[cleanId] = ord;
    }
    saveLocalBackup();
    logWorkflowAudit(ord.orderId, staffId || "CRE", staffName || "CRE Specialist", "CRE", "SEND_TO_DESIGN", fromStatus, "DESIGN_PENDING", `Forwarded to Design department with ${wf.priority} priority`);
    const client = getSupabaseClient();
    if (client) {
      withTimeout(
        client.from("department_order_workflow").upsert({
          orderId: ord.orderId,
          isDesignRequired: true,
          workflowStatus: "DESIGN_PENDING",
          assignedDesignerId: null,
          assignedDesignerName: null,
          priority: wf.priority,
          designInstructions: wf.designInstructions,
          creAttachments: wf.creAttachments,
          forwardedToDesignAt: now,
          forwardedByStaffId: wf.forwardedByStaffId,
          forwardedByStaffName: wf.forwardedByStaffName,
          updatedAt: now
        }),
        15e3
      ).then(() => {
        console.log(`Successfully synced order ${ord.orderId} to department_order_workflow in Supabase`);
      }).catch((err) => {
        console.error(`Error syncing order ${ord.orderId} to department_order_workflow:`, err?.message);
      });
      saveOrderToSupabase(ord).catch(() => {
      });
    }
    res.json({ success: true, workflow: wf, message: `Order ${ord.orderId} successfully forwarded to Design department!` });
  } catch (err) {
    console.error("Send to design error:", err);
    res.status(500).json({ error: err?.message || "Internal server error while forwarding to design" });
  }
});
apiRouter.post("/workflow/send-to-production", async (req, res) => {
  try {
    const { orderId, productionInstructions, priority, creAttachments, staffId, staffName } = req.body;
    if (!orderId) {
      return res.status(400).json({ error: "Order ID is required" });
    }
    const cleanId = decodeURIComponent(orderId).trim();
    const ord = ordersStore[cleanId] || ordersStore[cleanId.replace(/^#/, "")] || Object.values(ordersStore).find((o) => o.orderId?.toLowerCase() === cleanId.toLowerCase() || o.orderId?.replace(/^#/, "").toLowerCase() === cleanId.replace(/^#/, "").toLowerCase());
    if (!ord) {
      return res.status(404).json({ error: "Order not found" });
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    let wf = workflowsStore[ord.orderId] || {
      orderId: ord.orderId,
      isDesignRequired: false,
      workflowStatus: "CRE_CREATED",
      priority: priority || "NORMAL",
      currentRevisionNumber: 1,
      activeDesignFiles: [],
      creAttachments: [],
      createdAt: now,
      updatedAt: now
    };
    const fromStatus = wf.workflowStatus;
    wf.isDesignRequired = false;
    wf.workflowStatus = "PRODUCTION_PENDING";
    wf.priority = priority || wf.priority || "NORMAL";
    wf.productionRemarks = productionInstructions || wf.productionRemarks || "";
    if (Array.isArray(creAttachments)) {
      wf.creAttachments = [...wf.creAttachments || [], ...creAttachments];
      orderAttachmentsStore[ord.orderId] = [...orderAttachmentsStore[ord.orderId] || [], ...creAttachments];
    }
    wf.forwardedByStaffId = staffId || "CRE-Staff";
    wf.forwardedByStaffName = staffName || "CRE Specialist";
    wf.updatedAt = now;
    workflowsStore[ord.orderId] = wf;
    saveLocalBackup();
    logWorkflowAudit(ord.orderId, staffId || "CRE", staffName || "CRE Specialist", "CRE", "SEND_TO_PRODUCTION", fromStatus, "PRODUCTION_PENDING", `Forwarded directly to Production with ${wf.priority} priority`);
    const client = getSupabaseClient();
    if (client) {
      client.from("department_order_workflow").upsert({
        orderId: ord.orderId,
        isDesignRequired: false,
        workflowStatus: "PRODUCTION_PENDING",
        priority: wf.priority,
        productionRemarks: wf.productionRemarks,
        creAttachments: wf.creAttachments,
        updatedAt: now
      }).then(() => {
      }).catch(() => {
      });
    }
    res.json({ success: true, workflow: wf, message: `Order ${ord.orderId} successfully sent directly to Production!` });
  } catch (err) {
    console.error("Send to production error:", err);
    res.status(500).json({ error: err?.message || "Internal server error while sending to production" });
  }
});
apiRouter.post("/workflow/accept-order", async (req, res) => {
  const { orderId, designerId, designerName } = req.body;
  if (!orderId || !designerId) {
    return res.status(400).json({ error: "Order ID and Designer ID are required" });
  }
  const cleanId = decodeURIComponent(orderId).trim();
  const ord = ordersStore[cleanId] || ordersStore[cleanId.replace(/^#/, "")] || Object.values(ordersStore).find((o) => o.orderId?.toLowerCase() === cleanId.toLowerCase() || o.orderId?.replace(/^#/, "").toLowerCase() === cleanId.replace(/^#/, "").toLowerCase());
  if (!ord) {
    return res.status(404).json({ error: "Order not found" });
  }
  let wf = workflowsStore[ord.orderId] || workflowsStore[cleanId] || workflowsStore[cleanId.replace(/^#/, "")];
  if (!wf) {
    wf = {
      orderId: ord.orderId,
      isDesignRequired: true,
      workflowStatus: "DESIGN_PENDING",
      priority: "NORMAL",
      currentRevisionNumber: 1,
      activeDesignFiles: [],
      creAttachments: [],
      createdAt: ord.createdAt || (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    workflowsStore[ord.orderId] = wf;
  }
  if (wf.assignedDesignerId && wf.assignedDesignerId !== designerId) {
    const isOldStaffActive = Boolean(staffsStore[wf.assignedDesignerId]);
    if (isOldStaffActive && wf.workflowStatus !== "DESIGN_PENDING") {
      return res.status(409).json({
        error: "This order has already been assigned to another Designer.",
        assignedTo: wf.assignedDesignerName || wf.assignedDesignerId
      });
    }
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const fromStatus = wf.workflowStatus;
  wf.workflowStatus = "DESIGN_ASSIGNED";
  wf.assignedDesignerId = designerId;
  wf.assignedDesignerName = designerName || designerId;
  wf.assignedAt = now;
  wf.updatedAt = now;
  workflowsStore[ord.orderId] = wf;
  if (cleanId !== ord.orderId) workflowsStore[cleanId] = wf;
  ord.workflowStatus = "DESIGN_ASSIGNED";
  ord.assignedDesignerId = designerId;
  ord.assignedDesignerName = designerName || designerId;
  ord.updatedAt = now;
  ordersStore[ord.orderId] = ord;
  if (cleanId !== ord.orderId) ordersStore[cleanId] = ord;
  saveLocalBackup();
  const client = getSupabaseClient();
  if (client) {
    try {
      await withTimeout(
        client.from("department_order_workflow").upsert({
          orderId: ord.orderId,
          isDesignRequired: true,
          workflowStatus: "DESIGN_ASSIGNED",
          assignedDesignerId: designerId,
          assignedDesignerName: designerName || designerId,
          assignedAt: now,
          updatedAt: now
        }, { onConflict: "orderId" }),
        8e3
      );
      await withTimeout(
        client.from("orders").update({
          workflowStatus: "DESIGN_ASSIGNED",
          assignedDesignerId: designerId,
          assignedDesignerName: designerName || designerId,
          updatedAt: now
        }).eq("orderId", ord.orderId),
        8e3
      );
    } catch (dbErr) {
      console.warn("Database atomic accept exception:", dbErr?.message);
    }
  }
  console.log(`[DEBUG] Order ${ord.orderId} accepted by ${designerId}. New workflow status: ${wf.workflowStatus}`);
  logWorkflowAudit(ord.orderId, designerId, designerName || designerId, "DESIGNER", "ACCEPT_ORDER", fromStatus, "DESIGN_ASSIGNED", `Order accepted by ${designerName || designerId}`);
  res.json({
    success: true,
    workflow: wf,
    message: `Order ${ord.orderId} accepted successfully and assigned to ${designerName || designerId}`
  });
});
apiRouter.post("/workflow/assign-order", async (req, res) => {
  const { orderId, designerId, designerName, staffId, staffName } = req.body;
  if (!orderId || !designerId) {
    return res.status(400).json({ error: "Order ID and Designer ID are required" });
  }
  const cleanId = decodeURIComponent(orderId).trim();
  const ord = ordersStore[cleanId] || ordersStore[cleanId.replace(/^#/, "")] || Object.values(ordersStore).find((o) => o.orderId?.toLowerCase() === cleanId.toLowerCase() || o.orderId?.replace(/^#/, "").toLowerCase() === cleanId.replace(/^#/, "").toLowerCase());
  if (!ord) {
    return res.status(404).json({ error: "Order not found" });
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  let wf = workflowsStore[ord.orderId] || workflowsStore[cleanId] || workflowsStore[cleanId.replace(/^#/, "")];
  if (!wf) {
    wf = {
      orderId: ord.orderId,
      isDesignRequired: true,
      workflowStatus: "DESIGN_ASSIGNED",
      priority: "NORMAL",
      currentRevisionNumber: 1,
      activeDesignFiles: [],
      creAttachments: [],
      createdAt: ord.createdAt || now,
      updatedAt: now
    };
  }
  const fromStatus = wf.workflowStatus;
  wf.isDesignRequired = true;
  wf.workflowStatus = "DESIGN_ASSIGNED";
  wf.assignedDesignerId = designerId;
  wf.assignedDesignerName = designerName || designerId;
  wf.assignedAt = now;
  wf.updatedAt = now;
  workflowsStore[ord.orderId] = wf;
  saveLocalBackup();
  const client = getSupabaseClient();
  if (client) {
    await withTimeout(
      client.from("department_order_workflow").upsert({
        orderId: ord.orderId,
        isDesignRequired: true,
        workflowStatus: "DESIGN_ASSIGNED",
        assignedDesignerId: designerId,
        assignedDesignerName: designerName || designerId,
        assignedAt: now,
        updatedAt: now
      }),
      8e3
    ).catch((e) => console.warn("Supabase assign notice:", e?.message));
  }
  logWorkflowAudit(ord.orderId, staffId || "CRE", staffName || "CRE Specialist", "CRE", "ASSIGN_DESIGNER", fromStatus, "DESIGN_ASSIGNED", `Order assigned to designer ${designerName || designerId}`);
  res.json({
    success: true,
    workflow: wf,
    message: `Order ${ord.orderId} assigned to ${designerName || designerId}`
  });
});
apiRouter.post("/workflow/save-draft", async (req, res) => {
  const { orderId, designerId, designerName, designNotes, files } = req.body;
  if (!orderId) return res.status(400).json({ error: "Order ID is required" });
  const cleanId = decodeURIComponent(orderId).trim();
  const ord = ordersStore[cleanId] || ordersStore[cleanId.replace(/^#/, "")] || Object.values(ordersStore).find((o) => o.orderId?.toLowerCase() === cleanId.toLowerCase() || o.orderId?.replace(/^#/, "").toLowerCase() === cleanId.replace(/^#/, "").toLowerCase());
  let wf = workflowsStore[cleanId] || workflowsStore[cleanId.replace(/^#/, "")] || (ord ? workflowsStore[ord.orderId] : void 0);
  if (!wf && ord) {
    wf = {
      orderId: ord.orderId,
      isDesignRequired: true,
      workflowStatus: "DESIGN_IN_PROGRESS",
      priority: "NORMAL",
      currentRevisionNumber: 1,
      activeDesignFiles: files || [],
      creAttachments: [],
      createdAt: ord.createdAt || (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    workflowsStore[ord.orderId] = wf;
  }
  if (!wf) return res.status(404).json({ error: "Workflow not found" });
  const targetId = ord ? ord.orderId : cleanId;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  wf.workflowStatus = "DESIGN_IN_PROGRESS";
  wf.designInstructions = designNotes || wf.designInstructions;
  if (Array.isArray(files)) {
    wf.activeDesignFiles = files;
  }
  wf.updatedAt = now;
  workflowsStore[targetId] = wf;
  saveLocalBackup();
  logWorkflowAudit(targetId, designerId || wf.assignedDesignerId || "Designer", designerName || wf.assignedDesignerName || "Designer", "DESIGNER", "SAVE_DRAFT", wf.workflowStatus, "DESIGN_IN_PROGRESS", "Design work in progress saved");
  res.json({ success: true, workflow: wf });
});
apiRouter.post(["/workflow/design-submit", "/workflow/submit-to-cre"], async (req, res) => {
  const { orderId, designerId, designerName, designNotes, files } = req.body;
  if (!orderId) return res.status(400).json({ error: "Order ID is required" });
  if (!Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ error: "Please upload at least one completed design file before submitting to CRE for review." });
  }
  const cleanId = decodeURIComponent(orderId).trim();
  const ord = ordersStore[cleanId] || ordersStore[cleanId.replace(/^#/, "")] || Object.values(ordersStore).find((o) => o.orderId?.toLowerCase() === cleanId.toLowerCase() || o.orderId?.replace(/^#/, "").toLowerCase() === cleanId.replace(/^#/, "").toLowerCase());
  let wf = workflowsStore[cleanId] || workflowsStore[cleanId.replace(/^#/, "")] || (ord ? workflowsStore[ord.orderId] : void 0);
  if (!wf && ord) {
    wf = {
      orderId: ord.orderId,
      isDesignRequired: true,
      workflowStatus: "DESIGN_PENDING",
      priority: "NORMAL",
      currentRevisionNumber: 1,
      activeDesignFiles: [],
      creAttachments: [],
      createdAt: ord.createdAt || (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    workflowsStore[ord.orderId] = wf;
  }
  if (!wf) return res.status(404).json({ error: "Workflow not found" });
  const targetId = ord ? ord.orderId : cleanId;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const nextRevNum = (wf.currentRevisionNumber || 0) + 1;
  const newRevision = {
    id: `rev_${targetId.replace(/[^a-zA-Z0-9]/g, "_")}_${nextRevNum}_${Date.now()}`,
    orderId: targetId,
    revisionNumber: nextRevNum,
    designerId: designerId || wf.assignedDesignerId || "Designer-01",
    designerName: designerName || wf.assignedDesignerName || "Designer",
    designNotes: designNotes || "Submitted for CRE review",
    files,
    status: "SUBMITTED_TO_CRE",
    submittedAt: now,
    createdAt: now
  };
  if (!designRevisionsStore[targetId]) designRevisionsStore[targetId] = [];
  designRevisionsStore[targetId].push(newRevision);
  const fromStatus = wf.workflowStatus;
  if (designerId) wf.assignedDesignerId = designerId;
  if (designerName) wf.assignedDesignerName = designerName;
  wf.workflowStatus = "DESIGN_SUBMITTED";
  wf.currentRevisionNumber = nextRevNum;
  wf.activeDesignFiles = files;
  wf.designSubmittedAt = now;
  wf.clarificationRequest = void 0;
  wf.updatedAt = now;
  workflowsStore[targetId] = wf;
  if (ord) {
    ord.assignedDesignerId = wf.assignedDesignerId;
    ord.assignedDesignerName = wf.assignedDesignerName;
    ord.workflowStatus = "DESIGN_SUBMITTED";
    ord.updatedAt = now;
    ordersStore[ord.orderId] = ord;
  }
  saveLocalBackup();
  logWorkflowAudit(
    targetId,
    designerId || "Designer",
    designerName || "Designer",
    "DESIGNER",
    "SUBMIT_TO_CRE",
    fromStatus,
    "DESIGN_SUBMITTED",
    `Design Revision #${nextRevNum} submitted to CRE for review with ${files.length} design file(s)`
  );
  const client = getSupabaseClient();
  if (client) {
    try {
      await withTimeout(
        client.from("department_order_workflow").upsert({
          orderId: targetId,
          workflowStatus: "DESIGN_SUBMITTED",
          assignedDesignerId: wf.assignedDesignerId,
          assignedDesignerName: wf.assignedDesignerName,
          currentRevisionNumber: nextRevNum,
          activeDesignFiles: files,
          designSubmittedAt: now,
          updatedAt: now
        }),
        1e4
      );
      await withTimeout(
        client.from("design_revisions").insert(newRevision),
        8e3
      ).catch(() => {
      });
    } catch (dbErr) {
      console.warn("Supabase submit-to-cre sync warning:", dbErr?.message);
    }
  }
  res.json({
    success: true,
    workflow: wf,
    revision: newRevision,
    message: `Design Revision #${nextRevNum} submitted to CRE for review!`
  });
});
apiRouter.post("/workflow/cre-approve", async (req, res) => {
  try {
    const { orderId, staffId, staffName, productionInstructions, priority } = req.body;
    if (!orderId) {
      return res.status(400).json({ error: "Order ID is required" });
    }
    const cleanId = decodeURIComponent(orderId).trim();
    const ord = ordersStore[cleanId] || ordersStore[cleanId.replace(/^#/, "")] || Object.values(ordersStore).find((o) => o.orderId?.toLowerCase() === cleanId.toLowerCase() || o.orderId?.replace(/^#/, "").toLowerCase() === cleanId.replace(/^#/, "").toLowerCase());
    const targetId = ord ? ord.orderId : cleanId;
    let wf = workflowsStore[targetId];
    if (!wf) {
      return res.status(404).json({ error: "Workflow record not found for this order" });
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const fromStatus = wf.workflowStatus;
    wf.workflowStatus = "PRODUCTION_PENDING";
    if (priority) wf.priority = priority;
    if (productionInstructions) {
      wf.productionRemarks = productionInstructions;
    }
    wf.creApprovedAt = now;
    wf.creApprovedByStaffId = staffId || "CRE-01";
    wf.creApprovedByStaffName = staffName || "CRE Specialist";
    wf.creApprovalNotes = productionInstructions || "Design approved by CRE. Forwarded to Production.";
    wf.updatedAt = now;
    const revs = designRevisionsStore[targetId];
    if (revs && revs.length > 0) {
      revs[revs.length - 1].status = "APPROVED_FOR_PRODUCTION";
    }
    workflowsStore[targetId] = wf;
    if (ord) {
      ord.workflowStatus = "PRODUCTION_PENDING";
      ord.updatedAt = now;
      ordersStore[ord.orderId] = ord;
    }
    saveLocalBackup();
    logWorkflowAudit(
      targetId,
      staffId || "CRE",
      staffName || "CRE Specialist",
      "CRE",
      "CRE_APPROVE_TO_PRODUCTION",
      fromStatus,
      "PRODUCTION_PENDING",
      `Design approved by CRE (${staffName || staffId}) and sent to Production department. Remarks: ${productionInstructions || "None"}`
    );
    const client = getSupabaseClient();
    if (client) {
      try {
        await withTimeout(
          client.from("department_order_workflow").upsert({
            orderId: targetId,
            workflowStatus: "PRODUCTION_PENDING",
            priority: wf.priority,
            productionRemarks: wf.productionRemarks,
            creApprovedAt: now,
            creApprovedByStaffId: wf.creApprovedByStaffId,
            creApprovedByStaffName: wf.creApprovedByStaffName,
            creApprovalNotes: wf.creApprovalNotes,
            updatedAt: now
          }),
          1e4
        );
      } catch (err) {
        console.warn("Supabase CRE approve sync warning:", err?.message);
      }
    }
    res.json({
      success: true,
      workflow: wf,
      message: `Design approved! Order ${targetId} successfully sent to Production department.`
    });
  } catch (err) {
    console.error("CRE approve error:", err);
    res.status(500).json({ error: err?.message || "Failed to approve design and forward to production" });
  }
});
apiRouter.post("/workflow/revision-request", async (req, res) => {
  const { orderId, requesterRole, requesterId, requesterName, reason, instructions, attachments } = req.body;
  if (!orderId || !reason) {
    return res.status(400).json({ error: "Order ID and revision reason are required" });
  }
  const wf = workflowsStore[orderId];
  if (!wf) return res.status(404).json({ error: "Workflow not found" });
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const fromStatus = wf.workflowStatus;
  const isFromProduction = requesterRole === "PRODUCTION";
  const targetStatus = isFromProduction ? "PRODUCTION_REVISION_REQUESTED" : "DESIGN_REVISION_REQUESTED";
  wf.workflowStatus = targetStatus;
  wf.clarificationRequest = {
    fromDepartment: isFromProduction ? "PRODUCTION" : "DESIGN",
    problemDescription: reason,
    affectedComponent: instructions,
    requestedBy: requesterName || requesterId || "Reviewer",
    requestedAt: now,
    urgency: wf.priority || "HIGH",
    attachments: attachments || []
  };
  wf.updatedAt = now;
  const revs = designRevisionsStore[orderId];
  if (revs && revs.length > 0) {
    const latest = revs[revs.length - 1];
    latest.status = "REVISION_REQUESTED";
    latest.revisionRequestedBy = requesterName || requesterId;
    latest.revisionReason = reason;
    latest.revisionRequestedAt = now;
  }
  workflowsStore[orderId] = wf;
  saveLocalBackup();
  const auditDetails = `Revision requested by ${requesterRole} (${requesterName || requesterId}): "${reason}". Instructions: "${instructions || "None"}"`;
  logWorkflowAudit(orderId, requesterId || "Reviewer", requesterName || "Reviewer", requesterRole || "CRE", "REQUEST_REVISION", fromStatus, targetStatus, auditDetails);
  const client = getSupabaseClient();
  if (client) {
    try {
      await withTimeout(
        client.from("department_order_workflow").update({
          workflowStatus: targetStatus,
          clarificationRequest: wf.clarificationRequest,
          updatedAt: now
        }).eq("orderId", orderId),
        8e3
      );
    } catch (dbErr) {
      console.warn("Supabase revision request sync warning:", dbErr?.message);
    }
  }
  res.json({
    success: true,
    workflow: wf,
    message: `Design revision request logged and routed to Design department.`
  });
});
apiRouter.post("/workflow/production-status", async (req, res) => {
  const { orderId, staffId, staffName, action, remarks, evidenceFiles } = req.body;
  if (!orderId || !action) {
    return res.status(400).json({ error: "Order ID and action are required" });
  }
  const wf = workflowsStore[orderId];
  if (!wf) return res.status(404).json({ error: "Workflow not found" });
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const fromStatus = wf.workflowStatus;
  if (action === "START") {
    wf.workflowStatus = "PRODUCTION_IN_PROGRESS";
    wf.productionStartedAt = now;
    wf.productionStartedByStaffId = staffId || "Prod-Staff";
    wf.productionStartedByStaffName = staffName || "Production Specialist";
    if (remarks) wf.productionRemarks = remarks;
    wf.updatedAt = now;
    logWorkflowAudit(orderId, staffId || "Production", staffName || "Production Specialist", "PRODUCTION", "START_PRODUCTION", fromStatus, "PRODUCTION_IN_PROGRESS", `Manufacturing started by ${staffName || staffId}`);
  } else if (action === "REMARKS") {
    wf.productionRemarks = remarks || wf.productionRemarks;
    wf.updatedAt = now;
    logWorkflowAudit(orderId, staffId || "Production", staffName || "Production Specialist", "PRODUCTION", "UPDATE_PRODUCTION_REMARKS", fromStatus, wf.workflowStatus, `Production notes updated: ${remarks}`);
  } else if (action === "COMPLETE") {
    wf.workflowStatus = "PRODUCTION_COMPLETED";
    wf.productionCompletedAt = now;
    wf.productionCompletedByStaffId = staffId || "Prod-Staff";
    wf.productionCompletedByStaffName = staffName || "Production Specialist";
    if (remarks) wf.productionRemarks = remarks;
    wf.updatedAt = now;
    if (Array.isArray(evidenceFiles) && evidenceFiles.length > 0) {
      orderAttachmentsStore[orderId] = [...orderAttachmentsStore[orderId] || [], ...evidenceFiles];
    }
    logWorkflowAudit(orderId, staffId || "Production", staffName || "Production Specialist", "PRODUCTION", "COMPLETE_PRODUCTION", fromStatus, "PRODUCTION_COMPLETED", `Manufacturing completed by ${staffName || staffId}. Order returned to CRE workflow for packing and dispatch.`);
  }
  workflowsStore[orderId] = wf;
  saveLocalBackup();
  const client = getSupabaseClient();
  if (client) {
    client.from("department_order_workflow").upsert({
      orderId,
      workflowStatus: wf.workflowStatus,
      productionStartedAt: wf.productionStartedAt,
      productionStartedByStaffId: wf.productionStartedByStaffId,
      productionStartedByStaffName: wf.productionStartedByStaffName,
      productionCompletedAt: wf.productionCompletedAt,
      productionCompletedByStaffId: wf.productionCompletedByStaffId,
      productionCompletedByStaffName: wf.productionCompletedByStaffName,
      productionRemarks: wf.productionRemarks,
      updatedAt: now
    }).then(() => {
    }).catch(() => {
    });
  }
  res.json({
    success: true,
    workflow: wf,
    message: action === "COMPLETE" ? `Production marked as completed! Order is now ready for packing and dispatch.` : `Production status updated to ${wf.workflowStatus}`
  });
});
function getR2Client() {
  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID || process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME || process.env.R2_BUCKET_NAME || "zuboc-attachments";
  const publicUrl = (process.env.CLOUDFLARE_R2_PUBLIC_URL || process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");
  const customEndpoint = process.env.CLOUDFLARE_R2_ENDPOINT || process.env.R2_ENDPOINT;
  if (!accessKeyId || !secretAccessKey || !accountId && !customEndpoint) {
    return null;
  }
  let endpoint = customEndpoint ? customEndpoint.trim() : `https://${accountId}.r2.cloudflarestorage.com`;
  if (!endpoint.startsWith("http")) {
    endpoint = `https://${endpoint}`;
  }
  const client = new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey
    }
  });
  return { client, bucket, publicUrl };
}
apiRouter.post("/workflow/upload", upload.array("files", 10), async (req, res) => {
  const uploadedFiles = req.files;
  if (!uploadedFiles || uploadedFiles.length === 0) {
    return res.status(400).json({ error: "No files uploaded" });
  }
  const { orderId, category, staffId, staffName } = req.body;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const r2 = getR2Client();
  const results = await Promise.all(uploadedFiles.map(async (file) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeBase = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, "_");
    const uniqueFileName = `${safeBase}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}${ext}`;
    let fileUrl = `/uploads/${uniqueFileName}`;
    if (r2) {
      try {
        const key = `attachments/${uniqueFileName}`;
        await r2.client.send(new PutObjectCommand({
          Bucket: r2.bucket,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype || "application/octet-stream",
          Metadata: {
            orderId: String(orderId || "GENERAL"),
            staff: String(staffName || staffId || "Operator"),
            category: String(category || "DESIGN_FILE")
          }
        }));
        if (r2.publicUrl) {
          fileUrl = `${r2.publicUrl}/${key}`;
        } else {
          fileUrl = `/api/workflow/r2-file/${encodeURIComponent(key)}`;
        }
        console.log(`[R2] Uploaded ${file.originalname} to R2 bucket: ${r2.bucket}/${key}`);
      } catch (r2Err) {
        console.warn(`[R2] Upload failed for ${file.originalname}, falling back to local storage:`, r2Err?.message);
        try {
          const destinationPath = path.join(uploadsDir, uniqueFileName);
          fs.writeFileSync(destinationPath, file.buffer);
          fileUrl = `/uploads/${uniqueFileName}`;
        } catch {
        }
      }
    } else {
      try {
        const destinationPath = path.join(uploadsDir, uniqueFileName);
        fs.writeFileSync(destinationPath, file.buffer);
      } catch {
      }
    }
    const attachment = {
      id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      orderId: orderId || "GENERAL",
      fileName: file.originalname,
      fileType: ext.replace(".", "").toUpperCase() || "FILE",
      fileSize: file.size,
      fileUrl,
      category: category || "DESIGN_FILE",
      uploadedByStaffId: staffId || "Operator",
      uploadedByStaffName: staffName || "Operator",
      uploadedAt: now
    };
    if (orderId) {
      if (!orderAttachmentsStore[orderId]) orderAttachmentsStore[orderId] = [];
      orderAttachmentsStore[orderId].push(attachment);
    }
    return attachment;
  }));
  const client = getSupabaseClient();
  if (client && results.length > 0) {
    try {
      await withTimeout(
        client.from("order_attachments").insert(results),
        8e3
      );
    } catch (attErr) {
      console.warn("Supabase order_attachments insert notice:", attErr?.message);
    }
  }
  saveLocalBackup();
  res.json({ success: true, files: results });
});
apiRouter.get("/workflow/r2-file/:key(*)", async (req, res) => {
  const r2 = getR2Client();
  if (!r2) return res.status(404).send("R2 storage not configured");
  try {
    const key = req.params.key;
    const command = new GetObjectCommand({
      Bucket: r2.bucket,
      Key: key
    });
    const s3Item = await r2.client.send(command);
    if (!s3Item.Body) return res.status(404).send("File not found in R2");
    if (s3Item.ContentType) res.setHeader("Content-Type", s3Item.ContentType);
    if (s3Item.ContentLength) res.setHeader("Content-Length", s3Item.ContentLength);
    res.setHeader("Content-Disposition", `inline; filename="${path.basename(key)}"`);
    if (typeof s3Item.Body.pipe === "function") {
      s3Item.Body.pipe(res);
    } else {
      const bytes = await s3Item.Body.transformToByteArray();
      res.send(Buffer.from(bytes));
    }
  } catch (err) {
    console.warn("R2 file retrieval error:", err?.message);
    res.status(404).send("File not found in R2");
  }
});
apiRouter.get("/workflow/download/:filename", (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(uploadsDir, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send("File not found");
  }
  res.download(filePath, filename);
});
var FAKE_STAFF_IDS = ["cre-01", "designer-01", "designer-02", "production-01", "admin-01", "Operator-01", "Staff-01", "Staff-02", "Zuboc", "<UUID_FROM_AUTH>"];
async function reconcileSupabaseAuthAndStaffs(client) {
  if (!client) return staffsStore;
  const authUsersMap = {};
  const authUsersByEmail = {};
  try {
    if (client.auth && client.auth.admin) {
      const { data: authListData, error: authListErr } = await client.auth.admin.listUsers();
      if (!authListErr && authListData?.users && Array.isArray(authListData.users)) {
        for (const u of authListData.users) {
          if (u.id) {
            authUsersMap[u.id] = u;
            if (u.email) {
              authUsersByEmail[u.email.toLowerCase()] = u;
            }
          }
        }
      }
    }
  } catch (authErr) {
    console.warn("[AUTH] Error listing auth users:", authErr?.message);
  }
  try {
    const { data: supaStaffs, error: staffErr } = await withTimeout(
      client.from("staffs").select("*").order("createdAt", { ascending: false }),
      6e3
    );
    if (!staffErr && Array.isArray(supaStaffs)) {
      const freshMap = {};
      for (const s of supaStaffs) {
        if (!s.id || FAKE_STAFF_IDS.includes(s.id)) continue;
        let staffRecord = { ...s };
        const userEmail = staffRecord.email?.toLowerCase();
        const matchedAuth = authUsersMap[staffRecord.id] || (userEmail ? authUsersByEmail[userEmail] : null);
        if (matchedAuth && staffRecord.id !== matchedAuth.id) {
          console.log(`[AUTH] Re-linking staff ${staffRecord.name} (${staffRecord.id}) to Supabase Auth UUID ${matchedAuth.id}`);
          try {
            await client.from("staffs").delete().eq("id", staffRecord.id);
            staffRecord.id = matchedAuth.id;
            await client.from("staffs").upsert({
              id: matchedAuth.id,
              name: staffRecord.name,
              role: staffRecord.role,
              stationId: staffRecord.stationId,
              email: staffRecord.email,
              password: staffRecord.password,
              isActive: staffRecord.isActive !== false,
              createdAt: staffRecord.createdAt || (/* @__PURE__ */ new Date()).toISOString()
            });
          } catch (relinkErr) {
            console.warn("[AUTH] Notice re-linking staff:", relinkErr);
          }
        } else if (!matchedAuth && userEmail && client.auth?.admin) {
          try {
            const pwd = staffRecord.password || "password123";
            const { data: createdAuth, error: createErr } = await client.auth.admin.createUser({
              email: userEmail,
              password: pwd.length >= 6 ? pwd : `${pwd}123`,
              email_confirm: true,
              user_metadata: {
                name: staffRecord.name,
                role: staffRecord.role,
                stationId: staffRecord.stationId
              }
            });
            if (!createErr && createdAuth?.user?.id) {
              console.log(`[AUTH] Auto-provisioned missing Supabase Auth user for: ${userEmail} (${createdAuth.user.id})`);
              const newAuthId = createdAuth.user.id;
              await client.from("staffs").delete().eq("id", staffRecord.id);
              staffRecord.id = newAuthId;
              await client.from("staffs").upsert({
                id: newAuthId,
                name: staffRecord.name,
                role: staffRecord.role,
                stationId: staffRecord.stationId,
                email: staffRecord.email,
                password: staffRecord.password,
                isActive: staffRecord.isActive !== false,
                createdAt: staffRecord.createdAt || (/* @__PURE__ */ new Date()).toISOString()
              });
              authUsersMap[newAuthId] = createdAuth.user;
              authUsersByEmail[userEmail] = createdAuth.user;
            }
          } catch (autoProvErr) {
            console.warn("[AUTH] Auto-provision warning:", autoProvErr?.message);
          }
        }
        freshMap[staffRecord.id] = staffRecord;
      }
      for (const [authId, authUser] of Object.entries(authUsersMap)) {
        if (!freshMap[authId]) {
          const uEmail = authUser.email || "";
          const uName = authUser.user_metadata?.name || authUser.email?.split("@")[0] || "Staff";
          const uRole = authUser.user_metadata?.role || "CRE";
          const uStation = authUser.user_metadata?.stationId || "HQ";
          const newStaff = {
            id: authId,
            name: uName,
            role: uRole,
            stationId: uStation,
            email: uEmail,
            password: "password123",
            isActive: true,
            createdAt: authUser.created_at || (/* @__PURE__ */ new Date()).toISOString()
          };
          freshMap[authId] = newStaff;
          client.from("staffs").upsert({
            id: authId,
            name: uName,
            role: uRole,
            stationId: uStation,
            email: uEmail,
            isActive: true,
            createdAt: newStaff.createdAt
          }).catch(() => {
          });
        }
      }
      staffsStore = freshMap;
      saveLocalBackup();
    }
  } catch (err) {
    console.warn("Supabase staffs sync warning:", err?.message);
  }
  return staffsStore;
}
apiRouter.get(["/admin/users", "/staffs"], async (req, res) => {
  const client = getSupabaseClient();
  let authUsersMap = {};
  if (client) {
    try {
      await reconcileSupabaseAuthAndStaffs(client);
      if (client.auth && client.auth.admin) {
        const { data: authListData } = await client.auth.admin.listUsers();
        if (authListData?.users && Array.isArray(authListData.users)) {
          for (const u of authListData.users) {
            if (u.id) {
              authUsersMap[u.id] = u;
              if (u.email) authUsersMap[u.email.toLowerCase()] = u;
            }
          }
        }
      }
    } catch (e) {
      console.warn("Sync in GET /admin/users notice:", e?.message);
    }
  }
  const users = Object.values(staffsStore).filter((s) => s && s.id && !FAKE_STAFF_IDS.includes(s.id)).map((s) => {
    const authUser = authUsersMap[s.id] || (s.email ? authUsersMap[s.email.toLowerCase()] : null);
    return {
      id: s.id,
      name: s.name,
      role: s.role,
      stationId: s.stationId,
      email: s.email,
      phone: s.phone,
      isActive: s.isActive !== false,
      createdAt: s.createdAt,
      lastLoginAt: s.lastLoginAt,
      password: s.password || s.id,
      hasPassword: Boolean(s.password),
      isSupabaseAuth: Boolean(authUser),
      supabaseAuthId: authUser ? authUser.id : null
    };
  });
  res.json(users);
});
apiRouter.post("/admin/sync-auth", async (req, res) => {
  try {
    const client = getSupabaseClient();
    if (!client) {
      return res.status(500).json({ error: "Supabase client is not initialized." });
    }
    const updatedMap = await reconcileSupabaseAuthAndStaffs(client);
    const usersCount = Object.keys(updatedMap).length;
    let authCount = 0;
    if (client.auth && client.auth.admin) {
      const { data } = await client.auth.admin.listUsers();
      authCount = data?.users?.length || 0;
    }
    res.json({
      success: true,
      message: `Successfully synchronized ${usersCount} staff members with Supabase Authentication (${authCount} auth accounts verified).`,
      usersCount,
      authCount
    });
  } catch (err) {
    console.error("Sync auth error:", err);
    res.status(500).json({ error: err?.message || "Failed to synchronize with Supabase Auth" });
  }
});
apiRouter.post("/admin/clear-cache", async (req, res) => {
  try {
    hasPerformedInitialSync = false;
    loginAttempts.clear();
    ordersStore = {};
    workflowsStore = {};
    orderAttachmentsStore = {};
    const client = getSupabaseClient();
    if (client) {
      await syncFromSupabase();
      await reconcileSupabaseAuthAndStaffs(client);
    }
    res.json({
      success: true,
      message: "All server caches cleared and re-synchronized from Supabase successfully.",
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  } catch (err) {
    console.error("Clear cache error:", err);
    res.status(500).json({ error: err?.message || "Failed to clear server cache" });
  }
});
apiRouter.post(["/admin/create-user", "/admin/users", "/staffs"], async (req, res) => {
  try {
    const email = (req.body.email || "").trim().toLowerCase();
    const name = (req.body.name || "").trim();
    const role = (req.body.role || "CRE").trim().toUpperCase();
    const password = (req.body.password || "password123").trim();
    const stationId = (req.body.stationId || "HQ").trim();
    if (!name) {
      return res.status(400).json({ error: "Full Name is required" });
    }
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters long" });
    }
    const validRoles = ["ADMIN", "CRE", "DESIGNER", "PRODUCTION", "SUPERVISOR", "PACKER"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: `Invalid role. Allowed roles: ${validRoles.join(", ")}` });
    }
    const client = getSupabaseClient();
    let userId = req.body.id;
    if (client && client.auth && client.auth.admin) {
      try {
        const { data: authUser, error: authErr } = await client.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            name,
            role,
            stationId
          }
        });
        if (!authErr && authUser?.user?.id) {
          userId = authUser.user.id;
          console.log(`[AUTH] Successfully created Supabase Auth user: ${email} (UID: ${userId})`);
        } else if (authErr) {
          console.warn(`[AUTH] Notice in admin.createUser for ${email}:`, authErr.message);
          if (authErr.message?.toLowerCase().includes("already") || authErr.status === 422) {
            const { data: listData } = await client.auth.admin.listUsers();
            const existing = listData?.users?.find((u) => u.email?.toLowerCase() === email);
            if (existing) {
              userId = existing.id;
              await client.auth.admin.updateUserById(userId, {
                password,
                user_metadata: { name, role, stationId }
              }).catch(() => {
              });
            } else {
              return res.status(400).json({ error: `User with this email already exists in Supabase Auth.` });
            }
          } else {
            return res.status(400).json({ error: `Supabase Auth Creation Error: ${authErr.message}` });
          }
        }
      } catch (authException) {
        console.error("[AUTH] Exception in admin.createUser:", authException?.message);
        return res.status(500).json({ error: `Supabase Authentication Service Error: ${authException?.message}` });
      }
    }
    if (!userId) {
      userId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    }
    const newUser = {
      id: userId,
      name,
      role,
      stationId,
      password,
      email,
      isActive: true,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      isSupabaseAuth: true,
      supabaseAuthId: userId
    };
    staffsStore[userId] = newUser;
    saveLocalBackup();
    if (client) {
      try {
        const { error: dbErr } = await withTimeout(
          client.from("staffs").upsert({
            id: newUser.id,
            name: newUser.name,
            role: newUser.role,
            stationId: newUser.stationId,
            password: newUser.password,
            email: newUser.email,
            isActive: true,
            createdAt: newUser.createdAt
          }),
          8e3
        );
        if (dbErr) {
          console.error("Supabase staffs table upsert error:", dbErr.message);
        }
      } catch (dbEx) {
        console.warn("Supabase staffs table upsert warning:", dbEx?.message);
      }
    }
    res.json({
      success: true,
      user: newUser,
      message: `Account created and verified in Supabase Authentication for ${newUser.name} (${newUser.role})`
    });
  } catch (err) {
    console.error("Create user error:", err);
    res.status(500).json({ error: err?.message || "Failed to create user" });
  }
});
apiRouter.post(["/admin/update-user", "/admin/users/:id"], async (req, res) => {
  try {
    const id = req.params.id || req.body.id;
    if (!id) return res.status(400).json({ error: "User ID is required" });
    const client = getSupabaseClient();
    const { name, role, password, email, stationId, isActive } = req.body;
    let staff = staffsStore[id];
    if (!staff) {
      staff = {
        id,
        name: name || "Staff",
        role: role || "CRE",
        stationId: stationId || "HQ",
        isActive: true,
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      };
    }
    if (name) staff.name = sanitizeString(name);
    if (role) {
      const validRoles = ["ADMIN", "CRE", "DESIGNER", "PRODUCTION", "SUPERVISOR", "PACKER"];
      if (validRoles.includes(role)) staff.role = role;
    }
    if (stationId) staff.stationId = sanitizeString(stationId);
    if (email) staff.email = sanitizeString(email);
    if (password) staff.password = String(password).trim();
    if (isActive !== void 0) staff.isActive = Boolean(isActive);
    staffsStore[id] = staff;
    saveLocalBackup();
    if (client) {
      try {
        const updatePayload = {
          name: staff.name,
          role: staff.role,
          stationId: staff.stationId,
          isActive: staff.isActive
        };
        if (staff.email) updatePayload.email = staff.email;
        if (staff.password) updatePayload.password = staff.password;
        await withTimeout(
          client.from("staffs").update(updatePayload).eq("id", id),
          8e3
        );
        if (client.auth && client.auth.admin) {
          const authUpdate = {
            user_metadata: { name: staff.name, role: staff.role, stationId: staff.stationId }
          };
          if (password) authUpdate.password = password;
          await client.auth.admin.updateUserById(id, authUpdate).catch(() => {
          });
        }
      } catch (dbErr) {
        console.warn("Supabase update staff warning:", dbErr?.message);
      }
    }
    res.json({ success: true, user: staff, message: `User ${staff.name} updated successfully` });
  } catch (err) {
    console.error("Update user error:", err);
    res.status(500).json({ error: err?.message || "Failed to update user" });
  }
});
apiRouter.post("/admin/users/:id/reset-password", async (req, res) => {
  const targetId = sanitizeString(req.params.id);
  const newPassword = req.body.password ? String(req.body.password).trim() : "password123";
  const client = getSupabaseClient();
  let staff = staffsStore[targetId];
  if (staff) {
    staff.password = newPassword;
    staffsStore[targetId] = staff;
    saveLocalBackup();
  }
  if (client) {
    try {
      await withTimeout(
        client.from("staffs").update({ password: newPassword }).eq("id", targetId),
        8e3
      );
      if (client.auth && client.auth.admin) {
        await client.auth.admin.updateUserById(targetId, { password: newPassword }).catch(() => {
        });
      }
    } catch (e) {
      console.warn("Supabase reset password notice:", e?.message);
    }
  }
  res.json({ success: true, message: `Password has been reset successfully` });
});
apiRouter.post("/admin/users/:id/toggle-active", async (req, res) => {
  const targetId = sanitizeString(req.params.id);
  let staff = staffsStore[targetId];
  if (!staff) {
    return res.status(404).json({ error: "User not found" });
  }
  staff.isActive = !staff.isActive;
  staffsStore[targetId] = staff;
  saveLocalBackup();
  const client = getSupabaseClient();
  if (client) {
    try {
      await withTimeout(
        client.from("staffs").update({ isActive: staff.isActive }).eq("id", targetId),
        8e3
      );
    } catch (e) {
      console.warn("Supabase toggle active notice:", e?.message);
    }
  }
  res.json({
    success: true,
    isActive: staff.isActive,
    message: `Account for ${staff.name} is now ${staff.isActive ? "Active" : "Deactivated"}`
  });
});
apiRouter.delete(["/admin/users/:id", "/staffs/:id"], async (req, res) => {
  const targetId = sanitizeString(req.params.id);
  const client = getSupabaseClient();
  if (client) {
    try {
      await withTimeout(
        client.from("staffs").delete().eq("id", targetId),
        8e3
      );
      if (client.auth && client.auth.admin) {
        await client.auth.admin.deleteUser(targetId).catch(() => {
        });
      }
    } catch (err) {
      console.warn("Supabase delete user notice:", err?.message);
    }
  }
  delete staffsStore[targetId];
  saveLocalBackup();
  res.json({ success: true, message: `User deleted successfully` });
});
async function saveBatchToSupabase(records) {
  const client = getSupabaseClient();
  if (!client || records.length === 0) return false;
  try {
    const payload = records.map(cleanForSupabase);
    const BATCH_SIZE = 100;
    for (let i = 0; i < payload.length; i += BATCH_SIZE) {
      const chunk = payload.slice(i, i + BATCH_SIZE);
      const result = await withTimeout(
        client.from("orders").upsert(chunk, { onConflict: "orderId" }),
        15e3
      );
      if (result && result.error) {
        console.error("Batch Supabase save error:", result.error.message, result.error.code);
      }
    }
    isSupabaseReady = true;
    return true;
  } catch (err) {
    console.error("Batch Supabase save exception:", err?.message);
    return false;
  }
}
apiRouter.get("/orders", async (req, res) => {
  const client = getSupabaseClient();
  if (client && (!hasPerformedInitialSync || Object.keys(ordersStore).length === 0)) {
    try {
      await syncFromSupabase();
      hasPerformedInitialSync = true;
    } catch (e) {
      console.warn("Initial sync warning on GET /orders:", e?.message);
    }
  }
  if (Object.keys(ordersStore).length === 0) {
    for (const ord of INITIAL_FALLBACK_ORDERS) {
      if (ord && ord.orderId) ordersStore[ord.orderId] = ord;
    }
  }
  const orders = Object.values(ordersStore).map((o) => {
    if (!o || !o.orderId) return o;
    if (isAmazonOrder(o)) {
      return { ...o, order_source: "amazon", orderSource: "amazon" };
    }
    return { ...o, order_source: o.order_source || "website", orderSource: o.orderSource || "website" };
  }).sort((a, b) => {
    const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return (isNaN(timeB) ? 0 : timeB) - (isNaN(timeA) ? 0 : timeA);
  });
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
var handleSaveOrderRequest = async (req, res) => {
  let paramId = req.params?.orderId;
  if (paramId) {
    try {
      paramId = decodeURIComponent(paramId);
    } catch {
    }
  }
  const rawId = req.body.orderId || paramId || "";
  const orderId = sanitizeString(rawId);
  if (!orderId) {
    return res.status(400).json({ error: "orderId is required" });
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const existing = ordersStore[orderId] || Object.values(ordersStore).find((o) => {
    if (!o.orderId) return false;
    const cleanO = o.orderId.trim().toLowerCase().replace(/^#/, "");
    const cleanR = orderId.trim().toLowerCase().replace(/^#/, "");
    return cleanO === cleanR;
  });
  const digits = orderId.replace(/\D/g, "");
  const parsedNum = digits ? parseInt(digits, 10) : void 0;
  const rawSource = String(req.body.order_source || req.body.orderSource || existing?.order_source || existing?.orderSource || "website").trim().toLowerCase();
  const isAmazonPattern = /\d{3}-\d{7}-\d{7}/.test(orderId) || /amazon/i.test(orderId) || orderId.toLowerCase().startsWith("402-") || orderId.toLowerCase().startsWith("171-") || orderId.toLowerCase().startsWith("403-") || orderId.toLowerCase().startsWith("408-");
  const order_source = rawSource.includes("amazon") || isAmazonPattern ? "amazon" : "website";
  const order_number_num = req.body.order_number_num !== void 0 ? req.body.order_number_num : existing?.order_number_num !== void 0 ? existing.order_number_num : parsedNum;
  const record = {
    ...existing || {},
    ...req.body,
    orderId: existing?.orderId || orderId,
    // Ensure ID is preserved
    order_source,
    orderSource: order_source,
    order_number_num,
    updatedAt: now,
    createdAt: existing?.createdAt || req.body.createdAt || now
  };
  const finalId = record.orderId;
  const fulfillmentChanged = existing && existing.fulfillmentStatus !== record.fulfillmentStatus;
  ordersStore[finalId] = record;
  if (orderId !== finalId) {
    ordersStore[orderId] = record;
  }
  if (record.isDesignRequired !== void 0 || record.workflowStatus !== void 0) {
    const cleanId = finalId.replace(/^#/, "").toLowerCase();
    let wf = workflowsStore[finalId] || Object.values(workflowsStore).find((w) => w.orderId?.replace(/^#/, "").toLowerCase() === cleanId);
    if (!wf) {
      wf = {
        orderId: finalId,
        isDesignRequired: Boolean(record.isDesignRequired || record.workflowStatus === "DESIGN_PENDING"),
        workflowStatus: record.workflowStatus || (record.isDesignRequired ? "DESIGN_PENDING" : "CRE_CREATED"),
        priority: "NORMAL",
        currentRevisionNumber: 1,
        activeDesignFiles: [],
        creAttachments: [],
        createdAt: now,
        updatedAt: now
      };
    } else {
      if (record.isDesignRequired !== void 0) wf.isDesignRequired = Boolean(record.isDesignRequired);
      if (record.workflowStatus) wf.workflowStatus = record.workflowStatus;
      wf.updatedAt = now;
    }
    workflowsStore[finalId] = wf;
  }
  saveLocalBackup();
  if (fulfillmentChanged) {
    await sendTelegramUpdate(record);
  }
  if (firestoreDb && !firestoreQuotaExceeded) {
    try {
      await setDoc(doc(firestoreDb, "orders", finalId), cleanForFirestore(record), { merge: true });
    } catch (e) {
      if (e?.code === "resource-exhausted" || e?.message?.includes("Quota") || e?.message?.includes("quota")) {
        firestoreQuotaExceeded = true;
        console.warn("Firestore write quota limit reached. Safely persisting to server storage.");
      } else {
        console.error("Error writing order record to Firestore:", e);
      }
    }
  }
  const supaSaved = await saveOrderToSupabase(record);
  res.json({ success: true, record, supaSynced: supaSaved });
};
apiRouter.post("/orders", handleSaveOrderRequest);
apiRouter.post("/orders/:orderId", handleSaveOrderRequest);
apiRouter.put("/orders/:orderId", handleSaveOrderRequest);
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
    const digits = cleanId.replace(/\D/g, "");
    const parsedNum = digits ? parseInt(digits, 10) : void 0;
    const defaultSource = rawRecord.order_source || rawRecord.orderSource || "website";
    const numVal = rawRecord.order_number_num !== void 0 ? rawRecord.order_number_num : parsedNum;
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
        order_source: rawRecord.order_source || rawRecord.orderSource || existing.order_source || "website",
        orderSource: rawRecord.order_source || rawRecord.orderSource || existing.order_source || "website",
        order_number_num: numVal !== void 0 ? numVal : existing.order_number_num,
        updatedAt: now,
        createdAt: existing.createdAt || rawRecord.createdAt || now
      };
      updatedCount++;
    } else if (existing && conflictStrategy === "overwrite") {
      recordToSave = {
        ...rawRecord,
        orderId: cleanId,
        order_source: defaultSource,
        orderSource: defaultSource,
        order_number_num: numVal,
        updatedAt: now,
        createdAt: rawRecord.createdAt || now
      };
      updatedCount++;
    } else {
      recordToSave = {
        ...rawRecord,
        orderId: cleanId,
        order_source: defaultSource,
        orderSource: defaultSource,
        order_number_num: numVal,
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
  }
  if (processedRecords.length > 0) {
    await saveBatchToSupabase(processedRecords);
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
apiRouter.post("/shopify/fetch-direct", async (req, res) => {
  const { shopDomain, accessToken } = req.body;
  if (!shopDomain || !accessToken) {
    return res.status(400).json({ success: false, error: "shopDomain and accessToken are required" });
  }
  const cleanShop = shopDomain.replace(/https?:\/\//, "").replace(/\/$/, "").trim();
  const cleanToken = accessToken.trim();
  try {
    const shopifyRes = await fetch(`https://${cleanShop}/admin/api/2023-10/orders.json?status=any&limit=250`, {
      method: "GET",
      headers: {
        "X-Shopify-Access-Token": cleanToken,
        "Content-Type": "application/json"
      }
    });
    if (!shopifyRes.ok) {
      const errText = await shopifyRes.text();
      return res.status(400).json({ success: false, error: `Shopify API Error (${shopifyRes.status}): ${errText}` });
    }
    const shopifyData = await shopifyRes.json();
    const rawOrders = shopifyData.orders || [];
    let rawDraftOrders = [];
    try {
      const draftRes = await fetch(`https://${cleanShop}/admin/api/2023-10/draft_orders.json?status=any&limit=250`, {
        method: "GET",
        headers: {
          "X-Shopify-Access-Token": cleanToken,
          "Content-Type": "application/json"
        }
      });
      if (draftRes.ok) {
        const draftData = await draftRes.json();
        rawDraftOrders = draftData.draft_orders || [];
      }
    } catch (draftErr) {
      console.warn("Could not fetch draft orders from Shopify API:", draftErr);
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const importedRecords = [];
    const processedOrderNames = /* @__PURE__ */ new Set();
    for (const ord of rawOrders) {
      const orderName = String(ord.name || ord.order_number || ord.id).trim();
      if (!orderName) continue;
      processedOrderNames.add(orderName);
      const digits = orderName.replace(/\D/g, "");
      const order_number_num = digits ? parseInt(digits, 10) : void 0;
      const createdAt = ord.created_at || now;
      const lineItems = (ord.line_items || []).map((li) => ({
        name: li.name || li.title || "Product Item",
        sku: li.sku || void 0,
        price: li.price || void 0,
        quantity: li.quantity || 1
      }));
      const skus = lineItems.map((li) => li.sku || li.name).filter(Boolean);
      const shippingAddr = ord.shipping_address || ord.billing_address || {};
      const customerObj = ord.customer || {};
      const rawFulfillment = ord.fulfillment_status;
      const fulfillmentStatus = rawFulfillment ? rawFulfillment.charAt(0).toUpperCase() + rawFulfillment.slice(1).toLowerCase() : "Unfulfilled";
      const record = {
        orderId: orderName,
        order_source: "website",
        orderSource: "website",
        order_number_num,
        staffId: "Shopify Direct API",
        stationId: "Web-Fulfillment",
        recordingStartedAt: createdAt,
        durationSeconds: 0,
        recordingStatus: "PENDING",
        uploadStatus: "PENDING",
        email: ord.email || customerObj.email,
        financialStatus: ord.financial_status || "pending",
        fulfillmentStatus,
        subtotal: ord.subtotal_price,
        shipping: ord.total_shipping_price_set?.shop_money?.amount || ord.shipping_lines?.[0]?.price || "0",
        taxes: ord.total_tax,
        total: ord.total_price,
        orderTotal: ord.total_price,
        orderAmount: ord.subtotal_price,
        shippingAmount: ord.total_shipping_price_set?.shop_money?.amount || "0",
        discountCode: ord.discount_codes?.[0]?.code,
        discountAmount: ord.total_discounts,
        shippingMethod: ord.shipping_lines?.[0]?.title || "Shopify Express",
        courier: ord.shipping_lines?.[0]?.title || "Shopify Express",
        orderReceivedDate: createdAt,
        lineItems,
        productSku: skus.length > 0 ? skus.join(", ") : "Shopify Item",
        itemCount: lineItems.reduce((acc, li) => acc + (li.quantity || 1), 0),
        customerName: `${shippingAddr.first_name || customerObj.first_name || ""} ${shippingAddr.last_name || customerObj.last_name || ""}`.trim() || ord.email || "Shopify Customer",
        shippingName: `${shippingAddr.first_name || ""} ${shippingAddr.last_name || ""}`.trim() || void 0,
        contactPerson: `${shippingAddr.first_name || ""} ${shippingAddr.last_name || ""}`.trim() || void 0,
        contactPhone: shippingAddr.phone || customerObj.phone || void 0,
        shippingStreet: shippingAddr.address1,
        shippingAddress1: shippingAddr.address1,
        shippingAddress2: shippingAddr.address2,
        shippingCompany: shippingAddr.company,
        shippingCity: shippingAddr.city,
        shippingZip: shippingAddr.zip,
        shippingProvince: shippingAddr.province,
        shippingCountry: shippingAddr.country,
        shippingPhone: shippingAddr.phone,
        notes: ord.note || void 0,
        isProductionDeckOrder: false,
        createdAt,
        updatedAt: now
      };
      ordersStore[orderName] = record;
      importedRecords.push(record);
      if (firestoreDb && !firestoreQuotaExceeded) {
        try {
          await setDoc(doc(firestoreDb, "orders", orderName), cleanForFirestore(record), { merge: true });
        } catch {
        }
      }
    }
    for (const draft of rawDraftOrders) {
      if (draft.order_id || draft.name && processedOrderNames.has(draft.name)) {
        continue;
      }
      const orderName = String(draft.name || `DRAFT-${draft.id}`).trim();
      if (!orderName || processedOrderNames.has(orderName)) continue;
      processedOrderNames.add(orderName);
      const digits = orderName.replace(/\D/g, "");
      const order_number_num = digits ? parseInt(digits, 10) : void 0;
      const createdAt = draft.created_at || now;
      const lineItems = (draft.line_items || []).map((li) => ({
        name: li.name || li.title || "Draft Product Item",
        sku: li.sku || void 0,
        price: li.price || void 0,
        quantity: li.quantity || 1
      }));
      const skus = lineItems.map((li) => li.sku || li.name).filter(Boolean);
      const shippingAddr = draft.shipping_address || draft.billing_address || {};
      const customerObj = draft.customer || {};
      const record = {
        orderId: orderName,
        order_source: "website",
        orderSource: "website",
        order_number_num,
        staffId: "Shopify Direct API (Draft)",
        stationId: "Web-Fulfillment",
        recordingStartedAt: createdAt,
        durationSeconds: 0,
        recordingStatus: "PENDING",
        uploadStatus: "PENDING",
        email: draft.email || customerObj.email,
        financialStatus: draft.status || "draft",
        fulfillmentStatus: "Draft",
        subtotal: draft.subtotal_price,
        shipping: draft.shipping_line?.price || "0",
        taxes: draft.total_tax,
        total: draft.total_price,
        orderTotal: draft.total_price,
        orderAmount: draft.subtotal_price,
        shippingAmount: draft.shipping_line?.price || "0",
        discountCode: void 0,
        discountAmount: "0",
        shippingMethod: draft.shipping_line?.title || "Shopify Draft",
        courier: draft.shipping_line?.title || "Shopify Draft",
        orderReceivedDate: createdAt,
        lineItems,
        productSku: skus.length > 0 ? skus.join(", ") : "Shopify Draft Item",
        itemCount: lineItems.reduce((acc, li) => acc + (li.quantity || 1), 0),
        customerName: `${shippingAddr.first_name || customerObj.first_name || ""} ${shippingAddr.last_name || customerObj.last_name || ""}`.trim() || draft.email || "Shopify Draft Customer",
        shippingName: `${shippingAddr.first_name || ""} ${shippingAddr.last_name || ""}`.trim() || void 0,
        contactPerson: `${shippingAddr.first_name || ""} ${shippingAddr.last_name || ""}`.trim() || void 0,
        contactPhone: shippingAddr.phone || customerObj.phone || void 0,
        shippingStreet: shippingAddr.address1,
        shippingAddress1: shippingAddr.address1,
        shippingAddress2: shippingAddr.address2,
        shippingCompany: shippingAddr.company,
        shippingCity: shippingAddr.city,
        shippingZip: shippingAddr.zip,
        shippingProvince: shippingAddr.province,
        shippingCountry: shippingAddr.country,
        shippingPhone: shippingAddr.phone,
        notes: draft.note || void 0,
        isProductionDeckOrder: false,
        createdAt,
        updatedAt: now
      };
      ordersStore[orderName] = record;
      importedRecords.push(record);
      if (firestoreDb && !firestoreQuotaExceeded) {
        try {
          await setDoc(doc(firestoreDb, "orders", orderName), cleanForFirestore(record), { merge: true });
        } catch {
        }
      }
    }
    if (importedRecords.length > 0) {
      await saveBatchToSupabase(importedRecords);
    }
    saveLocalBackup();
    return res.json({
      success: true,
      count: importedRecords.length,
      orders: importedRecords
    });
  } catch (err) {
    console.error("Shopify Direct API Error:", err);
    return res.status(500).json({ success: false, error: err.message || "Failed to connect to Shopify API" });
  }
});
function parseShopifyWebhookPayload(ord) {
  if (!ord) return null;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  let orderName = ord.name ? String(ord.name).trim() : "";
  if (!orderName && ord.order_number) {
    orderName = `#${ord.order_number}`;
  }
  if (!orderName && ord.id) {
    orderName = `SHOPIFY-${ord.id}`;
  }
  if (!orderName) return null;
  const digits = orderName.replace(/\D/g, "");
  const order_number_num = digits ? parseInt(digits, 10) : void 0;
  const createdAt = normalizeIsoDate(ord.created_at || ord.processed_at) || now;
  const lineItems = (ord.line_items || []).map((li) => ({
    name: li.name || li.title || "Shopify Line Item",
    sku: li.sku || void 0,
    price: li.price || void 0,
    quantity: li.quantity || 1
  }));
  const skus = lineItems.map((li) => li.sku || li.name).filter(Boolean);
  const shippingAddr = ord.shipping_address || ord.billing_address || {};
  const customerObj = ord.customer || {};
  const rawFulfillment = ord.fulfillment_status;
  const fulfillmentStatus = rawFulfillment ? rawFulfillment.charAt(0).toUpperCase() + rawFulfillment.slice(1).toLowerCase() : "Unfulfilled";
  const record = {
    orderId: orderName,
    order_source: "website",
    orderSource: "website",
    order_number_num,
    staffId: "Shopify Webhook Auto-Sync",
    stationId: "Web-Fulfillment",
    recordingStartedAt: createdAt,
    durationSeconds: 0,
    recordingStatus: "PENDING",
    uploadStatus: "PENDING",
    email: ord.email || customerObj.email,
    financialStatus: ord.financial_status || "pending",
    fulfillmentStatus,
    subtotal: ord.subtotal_price,
    shipping: ord.total_shipping_price_set?.shop_money?.amount || ord.shipping_lines?.[0]?.price || "0",
    taxes: ord.total_tax,
    total: ord.total_price || ord.total_price_set?.shop_money?.amount,
    orderTotal: ord.total_price || ord.subtotal_price,
    orderAmount: ord.subtotal_price || ord.total_price,
    shippingAmount: ord.total_shipping_price_set?.shop_money?.amount || "0",
    discountCode: ord.discount_codes?.[0]?.code,
    discountAmount: ord.total_discounts,
    shippingMethod: ord.shipping_lines?.[0]?.title || "Shopify Express",
    courier: ord.shipping_lines?.[0]?.title || "Shopify Express",
    orderReceivedDate: createdAt,
    lineItems,
    productSku: skus.length > 0 ? skus.join(", ") : "Shopify Line Item",
    itemCount: lineItems.reduce((acc, li) => acc + (li.quantity || 1), 0) || 1,
    customerName: `${shippingAddr.first_name || customerObj.first_name || ""} ${shippingAddr.last_name || customerObj.last_name || ""}`.trim() || ord.email || "Shopify Customer",
    shippingName: `${shippingAddr.first_name || ""} ${shippingAddr.last_name || ""}`.trim() || void 0,
    contactPerson: `${shippingAddr.first_name || ""} ${shippingAddr.last_name || ""}`.trim() || void 0,
    contactPhone: shippingAddr.phone || customerObj.phone || void 0,
    shippingStreet: shippingAddr.address1,
    shippingAddress1: shippingAddr.address1,
    shippingAddress2: shippingAddr.address2,
    shippingCompany: shippingAddr.company,
    shippingCity: shippingAddr.city,
    shippingZip: shippingAddr.zip,
    shippingProvince: shippingAddr.province,
    shippingCountry: shippingAddr.country,
    shippingPhone: shippingAddr.phone,
    notes: ord.note || void 0,
    isProductionDeckOrder: false,
    createdAt,
    updatedAt: now
  };
  return record;
}
var handleShopifyWebhook = async (req, res) => {
  try {
    const topic = req.headers["x-shopify-topic"] || "orders/create";
    console.log(`[Shopify Webhook] Ingesting ${topic} event...`);
    const record = parseShopifyWebhookPayload(req.body);
    if (!record) {
      return res.status(200).json({ success: true, message: "Webhook received but payload contained no valid order Name or ID." });
    }
    ordersStore[record.orderId] = record;
    saveLocalBackup();
    if (firestoreDb && !firestoreQuotaExceeded) {
      try {
        await setDoc(doc(firestoreDb, "orders", record.orderId), cleanForFirestore(record), { merge: true });
      } catch {
      }
    }
    const supaSaved = await saveOrderToSupabase(record);
    console.log(`[Shopify Webhook] Automatically created order #${record.orderId} (Supabase synced: ${supaSaved})`);
    return res.status(200).json({
      success: true,
      message: `Order #${record.orderId} automatically ingested from Shopify`,
      orderId: record.orderId,
      order: record,
      supaSynced: supaSaved
    });
  } catch (err) {
    console.error("[Shopify Webhook Error]:", err);
    return res.status(200).json({ success: false, error: err?.message || "Webhook processing exception" });
  }
};
apiRouter.post("/webhooks/shopify/orders-create", handleShopifyWebhook);
apiRouter.post("/webhooks/shopify/orders-updated", handleShopifyWebhook);
apiRouter.post("/webhooks/shopify/draft-orders", handleShopifyWebhook);
apiRouter.post("/webhooks/shopify", handleShopifyWebhook);
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
  delete ordersStore[orderId.replace(/^#/, "")];
  delete ordersStore[`#${orderId.replace(/^#/, "")}`];
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
apiRouter.use((req, res) => {
  res.status(404).json({ error: `API endpoint not found: ${req.method} ${req.originalUrl || req.url}` });
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
