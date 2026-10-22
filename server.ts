import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import dotenv from 'dotenv';
import multer from 'multer';
// ffmpeg-static will be dynamically imported when needed to avoid startup crashes
import { createClient } from '@supabase/supabase-js';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, deleteDoc } from 'firebase/firestore';
import { INITIAL_FALLBACK_ORDERS } from './src/utils/initialOrders';
import { INITIAL_STAFFS } from './src/utils/initialStaffs';

import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

// Transcode video using FFmpeg to faststart H.264 baseline MP4 + generate thumbnail
async function transcodeToTelegramMp4(inputBuffer: Buffer, orderId: string): Promise<{ mp4Buffer: Buffer; thumbBuffer?: Buffer }> {
  const tmpId = `${orderId.replace(/[^a-zA-Z0-9_-]/g, '_')}_${Date.now()}`;
  const inputPath = path.join('/tmp', `${tmpId}_in.tmp`);
  const outputPath = path.join('/tmp', `${tmpId}_out.mp4`);
  const thumbPath = path.join('/tmp', `${tmpId}_thumb.jpg`);

  try {
    fs.writeFileSync(inputPath, inputBuffer);

    // Dynamic import to avoid startup issues in restricted environments
    let bin = 'ffmpeg';
    try {
      const ffmpegStatic: any = await import('ffmpeg-static');
      bin = ffmpegStatic.default || ffmpegStatic || 'ffmpeg';
    } catch (e) {
      console.warn('ffmpeg-static dynamic import failed, using system path:', e);
    }
    
    const cleanOrderId = orderId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const istTime = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' IST';
    const escapedTime = istTime.replace(/:/g, '\\:');

    // Minimal and Neat Style: Single line, bottom-right, white with black shadow
    const watermarkText = `ID\\: ${cleanOrderId} | ${escapedTime}`;
    // Using a very small font size and slightly transparent white for "minimal" look
    // We omit 'fontfile' to let FFmpeg pick the system default, but we'll use a safer filter string
    const filter = `scale='min(1280,iw)':-2,drawtext=text='${watermarkText}':x=w-tw-10:y=h-th-10:fontcolor=white@0.6:fontsize=12:shadowcolor=black@0.3:shadowx=1:shadowy=1`;

    try {
      // Primary attempt with watermark - ULTRAFAST preset for high throughput
      const cmd = `"${bin}" -fflags +genpts -i "${inputPath}" -c:v libx264 -preset ultrafast -crf 30 -maxrate 1200k -bufsize 2400k -pix_fmt yuv420p -vf "${filter}" -c:a aac -b:a 64k -movflags +faststart "${outputPath}" -y`;
      await execPromise(cmd, { timeout: 600000 }); 
    } catch (e: any) {
      console.warn('Watermarked transcoding failed, trying minimal scale-only fallback:', e?.message);
      // Fallback: No watermark but still transcode for Telegram compatibility
      const fallbackCmd = `"${bin}" -fflags +genpts -i "${inputPath}" -c:v libx264 -preset ultrafast -crf 32 -vf "scale='min(1280,iw)':-2" -c:a aac -b:a 64k -movflags +faststart "${outputPath}" -y`;
      await execPromise(fallbackCmd, { timeout: 600000 });
    }

    if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
      const mp4Buffer = fs.readFileSync(outputPath);

      // Extract thumbnail frame
      let thumbBuffer: Buffer | undefined;
      try {
        await execPromise(`"${bin}" -ss 00:00:00.500 -i "${outputPath}" -vframes 1 -q:v 2 "${thumbPath}" -y`, { timeout: 10000 });
        if (fs.existsSync(thumbPath) && fs.statSync(thumbPath).size > 0) {
          thumbBuffer = fs.readFileSync(thumbPath);
        }
      } catch {
        // Thumbnail is optional
      }

      return { mp4Buffer, thumbBuffer };
    }
  } catch (err) {
    console.warn('FFmpeg transcoding fallback:', err);
  } finally {
    try { if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath); } catch {}
    try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch {}
    try { if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath); } catch {}
  }

  // Fallback to original buffer if ffmpeg fails
  return { mp4Buffer: inputBuffer };
}

async function sendTelegramUpdate(record: OrderRecord) {
  const rawBotToken = settings.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN || '';
  const rawChatId = settings.telegramChatId || process.env.TELEGRAM_CHAT_ID || '';
  const botToken = cleanTelegramCredential(rawBotToken);
  const chatId = cleanTelegramCredential(rawChatId);
  if (botToken && chatId && record.telegramMessageId) {
    const durMin = Math.floor((record.durationSeconds || 0) / 60);
    const durSec = (record.durationSeconds || 0) % 60;
    const durationStr = `${durMin}m ${durSec}s`;
    const formattedDate = record.createdAt ? new Date(record.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleString('en-IN');
    const safeOrderId = escapeHtml(record.orderId);
    const captionLines = [
      `<b>📦 Order ID: ${safeOrderId} (Updated)</b>`,
      record.awbNumber ? `<b>🚚 AWB / Tracking:</b> ${escapeHtml(record.awbNumber)}` : '',
      record.courier ? `<b>🏢 Courier:</b> ${escapeHtml(record.courier)}` : '',
      record.weight ? `<b>⚖️ Weight:</b> ${escapeHtml(record.weight)}` : '',
      record.productSku ? `<b>🏷️ SKU / Item:</b> ${escapeHtml(record.productSku)}` : '',
      record.itemCount ? `<b>🔢 Qty:</b> ${escapeHtml(String(record.itemCount))}` : '',
      record.customerName ? `<b>👤 Customer / City:</b> ${escapeHtml(record.customerName)}` : '',
      record.contactPerson ? `<b>📞 Contact Person:</b> ${escapeHtml(record.contactPerson)}` : '',
      record.contactPhone ? `<b>📱 Contact Phone:</b> ${escapeHtml(record.contactPhone)}` : '',
      record.orderReceivedDate ? `<b>📥 Received Date:</b> ${escapeHtml(record.orderReceivedDate)}` : '',
      record.dispatchDate ? `<b>📤 Despatch Date:</b> ${escapeHtml(record.dispatchDate)}` : '',
      record.orderAmount ? `<b>💰 Order Amount:</b> ₹${escapeHtml(record.orderAmount)}` : '',
      record.shippingAmount ? `<b>📦 Shipping Amount:</b> ₹${escapeHtml(record.shippingAmount)}` : '',
      record.orderTotal ? `<b>💵 Total Amount:</b> ₹${escapeHtml(record.orderTotal)}` : '',
      record.deliveredDate ? `<b>✅ Delivered Date:</b> ${escapeHtml(record.deliveredDate)}` : '',
      `<b>👷 Staff:</b> ${escapeHtml(record.staffId)}`,
      `<b>📍 Station:</b> ${escapeHtml(record.stationId)}`,
      `<b>📅 Recorded:</b> ${escapeHtml(formattedDate)} (IST)`,
      `<b>⏱️ Duration:</b> ${escapeHtml(durationStr)}`,
      `<b>🚛 Fulfillment:</b> <b>${escapeHtml(record.fulfillmentStatus || 'Pending')}</b>`,
      record.notes ? `<b>📝 Notes:</b> ${escapeHtml(record.notes)}` : '',
      record.remarks ? `<b>✅ QC Remarks:</b> ${escapeHtml(record.remarks)}` : '',
      '<b>✏️ Status:</b> Order details edited & synced by Management'
    ].filter(Boolean);
    const newCaption = captionLines.join('\n');
    try {
      await fetch(`https://api.telegram.org/bot${botToken}/editMessageCaption`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: record.telegramChatId || chatId,
          message_id: Number(record.telegramMessageId),
          caption: newCaption,
          parse_mode: 'HTML'
        })
      });
    } catch (e) {
      console.error('Telegram editMessageCaption error:', e);
    }
  }
}

dotenv.config();

// Global Process Error Handlers to prevent silent crashes in serverless env
process.on('unhandledRejection', (reason, promise) => {
  console.error('CRITICAL: Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('CRITICAL: Uncaught Exception:', err);
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Versioning for tracking deployment updates
const APP_VERSION = '1.2.6-PROD-FIX';

// Extreme priority heartbeat for diagnostics
app.get('/ping', (req, res) => res.send(`OK-${APP_VERSION}`));
app.get('/api/ping-basic', (req, res) => res.json({ status: 'ok', v: APP_VERSION }));
function sanitizeString(str: any): string {
  if (typeof str !== 'string') return '';
  return str
    .trim()
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-');
}

// Enable CORS and disable caching for API
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  // Explicitly disable caching for all API responses to fix deployment update issues
  res.header('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  res.header('Pragma', 'no-cache');
  res.header('Expires', '0');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Configure multer for binary uploads
const upload = multer({
  limits: { fileSize: 100 * 1024 * 1024 } // 100 MB limit (more reasonable for serverless)
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Initialize Firebase App safely for both local server and Vercel serverless env
let firebaseApp: any = null;
let firestoreDb: any = null;

try {
  let firebaseConfig: any = null;

  const configPaths = [
    path.join(process.cwd(), 'firebase-applet-config.json'),
    path.join(__dirname, 'firebase-applet-config.json'),
    path.join(__dirname, '..', 'firebase-applet-config.json')
  ];

  for (const cp of configPaths) {
    if (fs.existsSync(cp)) {
      try {
        const rawConfig = fs.readFileSync(cp, 'utf-8');
        firebaseConfig = JSON.parse(rawConfig);
        break;
      } catch (e) {
        console.error('Error reading config file at', cp, e);
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
      firestoreDatabaseId: process.env.FIREBASE_FIRESTORE_DATABASE_ID || process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || '(default)'
    };
  }

  if (firebaseConfig && process.env.DISABLE_FIREBASE !== 'true') {
    if (getApps().some(a => a.name === 'SERVER_APP')) {
      firebaseApp = getApp('SERVER_APP');
    } else {
      firebaseApp = initializeApp(firebaseConfig, 'SERVER_APP');
    }
    const dbId = firebaseConfig.firestoreDatabaseId || process.env.FIREBASE_FIRESTORE_DATABASE_ID || process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || '(default)';
    firestoreDb = getFirestore(firebaseApp, dbId);
    console.log('Server initialized Firebase Firestore:', firebaseConfig.projectId, 'Database:', dbId, 'Connected:', Boolean(firestoreDb));
  } else {
    console.warn('No Firebase configuration found on server.');
  }
} catch (e) {
  console.error('Error initializing Firebase in server.ts:', e);
}

// Lazy Initialize Supabase Client to prevent startup crashes
// Primary Supabase configuration (Hardcoded for stability, can be overridden)
// Primary Supabase configuration (Hardcoded for stability)
// We use these as absolute defaults to ensure the deployed app works even if env vars are missing
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bdfgscjiuqccoidkeaqh.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkZmdzY2ppdXFjY29pZGtlYXFoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MjQwNzQ4OCwiZXhwIjoyMTA3OTgzNDg4fQ.NAQ_B4oLhyLPLlnUeJGc9lJ1NPcO7oH0_e3ZxeAlrF4';

let _supabaseServer: any = null;
function getSupabaseClient() {
  if (_supabaseServer) return _supabaseServer;
  try {
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      _supabaseServer = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
        global: {
          headers: { 'x-application-name': 'zuboc-flow-server' }
        }
      });
      return _supabaseServer;
    }
  } catch (e: any) {
    console.error('Supabase init error:', e?.message);
  }
  return null;
}

// Helper for Supabase operations with internal timeout
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number = 8000): Promise<T> {
  let timeoutId: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    const result = await Promise.race([promise, timeoutPromise]);
    return result;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

let isSupabaseReady = false;
let hasPerformedInitialSync = false;
let syncPromise: Promise<void> | null = null;

// Ensure initial sync happens exactly once
async function ensureInitialSync() {
  if (hasPerformedInitialSync) return;
  if (syncPromise) return syncPromise;
  
  syncPromise = (async () => {
    try {
      await syncFromSupabase();
      hasPerformedInitialSync = true;
    } catch (err) {
      console.warn('Warmup sync failed:', err);
    } finally {
      syncPromise = null;
    }
  })();
  
  // In serverless, we wait a bit but not forever to avoid Vercel timeouts
  return Promise.race([
    syncPromise,
    new Promise(resolve => setTimeout(resolve, 3000))
  ]);
}

const DATA_FILE = path.join(__dirname, 'flow_data.json');
const TMP_DATA_FILE = '/tmp/flow_data.json';

interface ChatNote {
  id: string;
  text: string;
  staffId: string;
  staffName: string;
  timestamp: string;
}

interface OrderRecord {
  orderId: string;
  staffId: string;
  stationId: string;
  recordingStartedAt: string;
  recordingCompletedAt?: string;
  durationSeconds: number;
  recordingStatus: 'RECORDING' | 'COMPLETED' | 'FAILED' | 'PENDING';
  uploadStatus: 'PENDING' | 'SUCCESS' | 'FAILED' | 'SKIPPED';
  telegramChatId?: string;
  telegramMessageId?: string;
  telegramFileId?: string;
  telegramMessageLink?: string;
  videoUrl?: string;
  photoUrls?: string[];
  photoDataUrl?: string;
  evidenceType?: 'VIDEO' | 'PHOTO' | 'PHOTO_VIDEO';
  awbNumber?: string;
  courier?: string;
  deliveryMethod?: string;
  weight?: string;
  productSku?: string;
  customerName?: string;
  contactPerson?: string;
  contactPhone?: string;
  orderReceivedDate?: string;
  dispatchDate?: string;
  orderAmount?: string;
  shippingAmount?: string;
  orderTotal?: string;
  deliveredDate?: string;
  itemCount?: string | number;
  fulfillmentStatus?: string;
  notes?: string;
  remarks?: string;
  chatNotes?: ChatNote[];
  auditLogs?: { timestamp: string; staffId: string; action: string; details: string; type: 'EDIT_LOG' | 'CHANGE_LOG' | 'USER_LOG' }[];
  createdAt: string;
  updatedAt: string;
  order_source?: 'website' | 'amazon';
  orderSource?: 'website' | 'amazon';
  order_number_num?: number;
  email?: string;
  financialStatus?: string;
  subtotal?: string | number;
  shipping?: string | number;
  taxes?: string | number;
  total?: string | number;
  discountCode?: string;
  discountAmount?: string | number;
  shippingMethod?: string;
  shippingName?: string;
  shippingStreet?: string;
  shippingAddress1?: string;
  shippingAddress2?: string;
  shippingCompany?: string;
  shippingCity?: string;
  shippingZip?: string;
  shippingProvince?: string;
  shippingCountry?: string;
  shippingPhone?: string;
  lineItems?: { name: string; price?: string | number; sku?: string; quantity?: number }[];
  isProductionDeckOrder?: boolean;
}

interface AppSettings {
  telegramBotToken: string;
  telegramChatId: string;
  autoUpload: boolean;
  stationId: string;
}

let settings: AppSettings = {
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '8372063656:AAGc8APzAoq1LH14p5POdBm19qnv-5286gE',
  telegramChatId: process.env.TELEGRAM_CHAT_ID || '-1003940299676',
  autoUpload: true,
  stationId: 'Packing-01'
};

interface StaffMember {
  id: string;
  name: string;
  role: 'ADMIN' | 'SUPERVISOR' | 'PACKER';
  stationId: string;
  password?: string;
  email?: string;
  createdAt?: string;
}

const DEFAULT_STAFFS: StaffMember[] = INITIAL_STAFFS;

let staffsStore: Record<string, StaffMember> = {};
for (const s of INITIAL_STAFFS) {
  staffsStore[s.id] = s;
}

let ordersStore: Record<string, OrderRecord> = {};
for (const ord of INITIAL_FALLBACK_ORDERS) {
  if (ord && ord.orderId) {
    ordersStore[ord.orderId] = ord;
  }
}

try {
  let activeDataPath = DATA_FILE;
  if (!fs.existsSync(activeDataPath)) {
    const altPath = path.join(process.cwd(), 'flow_data.json');
    if (fs.existsSync(altPath)) {
      activeDataPath = altPath;
    } else {
      activeDataPath = TMP_DATA_FILE;
    }
  }
  if (fs.existsSync(activeDataPath)) {
    const raw = fs.readFileSync(activeDataPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed.orders) {
      for (const [id, ord] of Object.entries(parsed.orders as Record<string, any>)) {
        if (ord) {
          const cleaned = { ...ord };
          for (const dateKey of ['createdAt', 'updatedAt', 'recordingStartedAt', 'recordingCompletedAt', 'orderReceivedDate', 'dispatchDate', 'deliveredDate', 'formFillingDate', 'promisedDeliveryDate']) {
            if (cleaned[dateKey]) {
              const norm = normalizeIsoDate(cleaned[dateKey]);
              if (norm) cleaned[dateKey] = norm;
            }
          }
          ordersStore[id] = cleaned as OrderRecord;
        }
      }
    }
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
  console.error('Error loading local flow_data.json:', e);
}

function saveLocalBackup() {
  const payload = JSON.stringify({ orders: ordersStore, settings, staffs: staffsStore }, null, 2);
  try {
    fs.writeFileSync(DATA_FILE, payload);
  } catch (e: any) {
    try {
      fs.writeFileSync(TMP_DATA_FILE, payload);
    } catch (tmpErr) {
      console.error('Error saving local backup to /tmp:', tmpErr);
    }
  }
}

let firestoreQuotaExceeded = false;

function cleanForFirestore(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  return JSON.parse(JSON.stringify(obj, (key, value) => {
    if (value === undefined) return undefined;
    return value;
  }));
}

const SUPABASE_ALLOWED_COLUMNS = new Set([
  'orderId', 'staffId', 'stationId', 'recordingStartedAt', 'recordingCompletedAt',
  'durationSeconds', 'recordingStatus', 'uploadStatus', 'evidenceType', 'videoUrl',
  'photoUrls', 'photoDataUrl', 'telegramChatId', 'telegramMessageId', 'telegramFileId',
  'telegramMessageLink', 'awbNumber', 'courier', 'deliveryMethod', 'weight',
  'productSku', 'customerName', 'contactPerson', 'contactPhone', 'fulfillFrom',
  'orderReceivedDate', 'dispatchDate', 'riderNumber', 'deliveredDate', 'orderAmount', 'shippingAmount',
  'orderTotal', 'itemCount', 'fulfillmentStatus', 'notes', 'remarks', 'chatNotes',
  'auditLogs', 'clientName', 'product', 'formFillingDate', 'preparedBy', 'checkedBy',
  'customisations', 'subAssemblyProgress', 'timeline', 'promisedDeliveryDate',
  'paymentGate', 'productionStage', 'stageDueDates', 'productionNotes',
  'isProductionDeckOrder', 'createdAt', 'updatedAt', 'order_source', 'orderSource',
  'order_number_num', 'email', 'financialStatus', 'subtotal', 'shipping', 'taxes',
  'total', 'discountCode', 'discountAmount', 'shippingMethod', 'shippingName',
  'shippingStreet', 'shippingAddress1', 'shippingAddress2', 'shippingCompany',
  'shippingCity', 'shippingZip', 'shippingProvince', 'shippingCountry',
  'shippingPhone', 'lineItems'
]);

const SUPABASE_DATE_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'recordingStartedAt',
  'recordingCompletedAt',
  'orderReceivedDate',
  'dispatchDate',
  'deliveredDate',
  'formFillingDate',
  'promisedDeliveryDate'
]);

function normalizeIsoDate(dateVal?: any): string | undefined {
  if (dateVal === undefined || dateVal === null || dateVal === '') return undefined;
  const str = String(dateVal).trim();
  if (!str) return undefined;

  const num = typeof dateVal === 'number' ? dateVal : parseFloat(str);
  if (!isNaN(num) && /^\d+(\.\d+)?$/.test(str) && num > 10000 && num < 100000) {
    try {
      const dateObj = new Date(Math.round((num - 25569) * 86400 * 1000));
      if (!isNaN(dateObj.getTime())) {
        return dateObj.toISOString();
      }
    } catch {}
  }

  try {
    const d = new Date(str);
    if (!isNaN(d.getTime()) && d.getFullYear() > 1990 && d.getFullYear() < 2100) {
      return d.toISOString();
    }
  } catch {}

  return undefined;
}

function isAmazonOrder(order: any): boolean {
  if (!order) return false;
  const src = String(order.order_source || order.orderSource || '').toLowerCase().trim();
  if (src === 'amazon' || src.includes('amazon')) return true;
  const id = String(order.orderId || '').trim();
  if (/^40[0-9]-/i.test(id)) return true;
  if (/^171-/i.test(id)) return true;
  if (/^026-/i.test(id)) return true;
  if (/\d{3}-\d{7}-\d{7}/.test(id)) return true;
  if (/amazon/i.test(id)) return true;
  if (/amazon/i.test(String(order.courier || ''))) return true;
  return false;
}

function cleanForSupabase(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  const cleaned: Record<string, any> = {};
  const nowIso = new Date().toISOString();

  for (const [key, val] of Object.entries(obj)) {
    if (SUPABASE_ALLOWED_COLUMNS.has(key) && val !== undefined) {
      if (SUPABASE_DATE_FIELDS.has(key)) {
        const norm = normalizeIsoDate(val);
        if (norm) {
          cleaned[key] = norm;
        } else if (key === 'createdAt' || key === 'updatedAt' || key === 'recordingStartedAt') {
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
    cleaned.order_source = 'amazon';
    cleaned.orderSource = 'amazon';
  } else if (!cleaned.order_source) {
    cleaned.order_source = 'website';
    cleaned.orderSource = 'website';
  }

  return cleaned;
}

async function saveOrderToSupabase(record: OrderRecord): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) {
    console.warn('Supabase save skipped: Client not initialized.');
    return false;
  }
  try {
    const payload = cleanForSupabase(record);
    // Add timeout to upsert to prevent hanging the request
    const { error } = (await withTimeout(
      client.from('orders').upsert(payload, { onConflict: 'orderId' }),
      6000
    )) as { error: any };
    
    if (error) {
      console.error(`Supabase save error for Order #${record.orderId}:`, error.message, error.code, error.details);
      if (error.code === '42P01') {
        console.error('HINT: Table "orders" does not exist in Supabase.');
      } else if (error.code === '42703') {
        console.error('HINT: One or more columns are missing from the Supabase table.');
      }
      return false;
    } else {
      isSupabaseReady = true;
      return true;
    }
  } catch (err: any) {
    console.error(`Supabase save exception for Order #${record.orderId}:`, err?.message);
    return false;
  }
}

async function deleteOrderFromSupabase(orderId: string): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  try {
    const { error } = await client.from('orders').delete().eq('orderId', orderId);
    if (error) {
      console.error(`Supabase order delete error for #${orderId}:`, error.message, error.code);
      return false;
    }
    console.log(`Deleted order #${orderId} from Supabase successfully.`);
    return true;
  } catch (err: any) {
    console.error(`Supabase order delete exception for #${orderId}:`, err?.message);
    return false;
  }
}

async function saveStaffToSupabase(staff: StaffMember) {
  if (!getSupabaseClient()) return;
  try {
    await getSupabaseClient().from('staffs').upsert(cleanForSupabase(staff), { onConflict: 'id' });
  } catch {}
}

async function deleteStaffFromSupabase(staffId: string) {
  if (!getSupabaseClient()) return;
  try {
    await getSupabaseClient().from('staffs').delete().eq('id', staffId);
  } catch {}
}

async function saveSettingsToSupabase(sett: AppSettings) {
  if (!getSupabaseClient()) return;
  try {
    await getSupabaseClient().from('settings').upsert({ id: 'config', ...cleanForSupabase(sett) }, { onConflict: 'id' });
  } catch {}
}

async function syncFromSupabase() {
  const client = getSupabaseClient();
  if (!client) {
    console.warn('Initial sync skipped: Supabase client not initialized.');
    return;
  }
  try {
    console.log('Starting parallel initial sync from Supabase...');
    
    const [ordersRes, staffsRes, settingsRes] = await Promise.allSettled([
      withTimeout(client.from('orders').select('*').order('createdAt', { ascending: false }), 10000),
      withTimeout(client.from('staffs').select('*'), 8000),
      withTimeout(client.from('settings').select('*').eq('id', 'config').maybeSingle(), 5000)
    ]);

    if (ordersRes.status === 'fulfilled') {
      const { data: ords, error: ordErr } = ordersRes.value as any;
      if (ordErr) {
        console.error('Sync error (orders):', ordErr.message);
      } else if (Array.isArray(ords)) {
        isSupabaseReady = true;
        const freshOrdersMap: Record<string, OrderRecord> = {};
        for (const o of ords) {
          if (o.orderId) freshOrdersMap[o.orderId] = o;
        }
        ordersStore = freshOrdersMap;
        saveLocalBackup();
        console.log(`Synced ${ords.length} orders from Supabase.`);
      }
    }

    if (staffsRes.status === 'fulfilled') {
      const { data: stfs, error: stfErr } = staffsRes.value as any;
      if (stfErr) console.error('Sync error (staffs):', stfErr.message);
      else if (Array.isArray(stfs)) {
        for (const s of stfs) if (s.id) staffsStore[s.id] = s;
        console.log(`Synced ${stfs.length} staff members.`);
      }
    }

    if (settingsRes.status === 'fulfilled') {
      const { data: sett, error: settErr } = settingsRes.value as any;
      if (settErr) console.error('Sync error (settings):', settErr.message);
      else if (sett) {
        settings = { ...settings, ...sett };
        console.log('Synced system settings.');
      }
    }

    hasPerformedInitialSync = true;
  } catch (err: any) {
    console.warn('Supabase initial sync failure:', err?.message);
  }
}

// Initial sync check with Supabase - moved inside startServer to prevent startup hangs
// syncFromSupabase();

let lastStaffsSyncTime = 0;

async function syncStaffsFromFirestore(force = false) {
  if (!firestoreDb || firestoreQuotaExceeded) return;
  const now = Date.now();
  const hasStaffs = Object.keys(staffsStore).length > 0;
  // If we already have staffs in memory, only refresh every 6 hours or when explicitly forced
  if (!force && hasStaffs && now - lastStaffsSyncTime < 21600000) return;
  lastStaffsSyncTime = now;

  try {
    const colRef = collection(firestoreDb, 'staffs');
    const snap = await getDocs(colRef);
    if (!snap.empty) {
      snap.forEach(d => {
        staffsStore[d.id] = {
          ...(staffsStore[d.id] || {}),
          ...(d.data() as StaffMember)
        };
      });
      saveLocalBackup();
    }
  } catch (e: any) {
    if (e?.message?.includes('Quota') || e?.message?.includes('quota') || e?.code === 'resource-exhausted') {
      firestoreQuotaExceeded = true;
      console.warn('Firestore quota exceeded. Running on local storage fallback mode.');
    } else {
      console.error('Error syncing staffs from Firestore:', e);
    }
  }
}

async function syncSettingsFromFirestore() {
  if (!firestoreDb || firestoreQuotaExceeded) return;
  try {
    const docRef = doc(firestoreDb, 'settings', 'config');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data() as AppSettings;
      if (data.telegramBotToken) settings.telegramBotToken = sanitizeString(data.telegramBotToken);
      if (data.telegramChatId) settings.telegramChatId = sanitizeString(data.telegramChatId);
      if (data.stationId) settings.stationId = sanitizeString(data.stationId);
      if (data.autoUpload !== undefined) settings.autoUpload = data.autoUpload;
    }
  } catch (e: any) {
    if (e?.message?.includes('Quota') || e?.message?.includes('quota')) {
      firestoreQuotaExceeded = true;
    } else {
      console.error('Error syncing settings from Firestore:', e);
    }
  }
}

let lastOrdersSyncTime = 0;

async function syncOrdersWithFirestore(force = false) {
  if (!firestoreDb || firestoreQuotaExceeded) return;
  const now = Date.now();
  if (!force && now - lastOrdersSyncTime < 3600000) {
    return; // Throttle to prevent exhausting Firestore daily read units
  }
  lastOrdersSyncTime = now;

  try {
    const colRef = collection(firestoreDb, 'orders');
    const snap = await getDocs(colRef);
    const fsOrdersMap: Record<string, OrderRecord> = {};
    snap.forEach(d => {
      const dat = d.data() as OrderRecord;
      if (dat && dat.orderId) {
        fsOrdersMap[dat.orderId] = dat;
      }
    });

    for (const [orderId, fsOrd] of Object.entries(fsOrdersMap)) {
      ordersStore[orderId] = {
        ...(ordersStore[orderId] || {}),
        ...fsOrd
      };
    }
    saveLocalBackup();
  } catch (e: any) {
    if (e?.message?.includes('Quota') || e?.message?.includes('quota') || e?.code === 'resource-exhausted') {
      firestoreQuotaExceeded = true;
      console.warn('Firestore daily read quota limit reached on server. Using in-memory & local storage.');
    } else {
      console.error('Error in syncOrdersWithFirestore:', e);
    }
  }
}

// Helper to safely escape strings for Telegram HTML parse_mode
function escapeHtml(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Clean Bot Tokens & Chat IDs from extra quotes or whitespace
function cleanTelegramCredential(str: string): string {
  if (!str) return '';
  return str.trim().replace(/^["']|["']$/g, '');
}

// syncSettingsFromFirestore and syncOrdersWithFirestore are disabled on cold boot to prevent burning daily read quota

// API Router supporting both /api/... and direct serverless paths
const apiRouter = express.Router();

// Base / Root endpoint
apiRouter.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Zuboc Flow API',
    firebaseConnected: Boolean(firestoreDb),
    timestamp: new Date().toISOString()
  });
});

// Health check
apiRouter.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    v: '1.2.0-diag',
    firebaseConnected: Boolean(firestoreDb),
    timestamp: new Date().toISOString()
  });
});

// Settings GET
apiRouter.get('/settings', async (req, res) => {
  await syncSettingsFromFirestore();
  const maskedToken = settings.telegramBotToken
    ? settings.telegramBotToken.substring(0, 6) + '...' + settings.telegramBotToken.slice(-4)
    : '';
  res.json({
    ...settings,
    telegramBotTokenMasked: maskedToken,
    hasToken: Boolean(settings.telegramBotToken),
    firebaseConnected: Boolean(firestoreDb)
  });
});

// Settings POST
apiRouter.post('/settings', async (req, res) => {
  const { telegramBotToken, telegramChatId, autoUpload, stationId } = req.body;
  if (telegramBotToken !== undefined) {
    const cleanToken = sanitizeString(telegramBotToken);
    if (!cleanToken.includes('...')) {
      settings.telegramBotToken = cleanToken;
    }
  }
  if (telegramChatId !== undefined) {
    settings.telegramChatId = sanitizeString(telegramChatId);
  }
  if (autoUpload !== undefined) settings.autoUpload = Boolean(autoUpload);
  if (stationId !== undefined) settings.stationId = sanitizeString(stationId);

  saveLocalBackup();

  if (firestoreDb) {
    try {
      await setDoc(doc(firestoreDb, 'settings', 'config'), cleanForFirestore({
        telegramBotToken: settings.telegramBotToken,
        telegramChatId: settings.telegramChatId,
        autoUpload: settings.autoUpload,
        stationId: settings.stationId,
        updatedAt: new Date().toISOString()
      }), { merge: true });
    } catch (e) {
      console.error('Error saving settings to Firestore:', e);
    }
  }

  await saveSettingsToSupabase(settings);

  res.json({ success: true, settings: { ...settings, telegramBotTokenMasked: '***' } });
});

// Simple text ping to verify raw connectivity bypassing JSON
apiRouter.get('/diag/ping-text', (req, res) => {
  res.send('Zuboc Server is REACHABLE (Text Mode)');
});

// Detailed System Diagnostic Report
apiRouter.get('/diag/system-report', async (req, res) => {
  try {
    const report: any = {
      timestamp: new Date().toISOString(),
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        env: process.env.NODE_ENV,
        port: PORT,
        hasSupabaseUrl: Boolean(SUPABASE_URL),
        hasSupabaseKey: Boolean(SUPABASE_SERVICE_ROLE_KEY),
        hasFirebaseConfig: Boolean(firebaseApp),
      },
      database: {
        supabaseInitialized: Boolean(getSupabaseClient()),
        firebaseInitialized: Boolean(firestoreDb),
        isSupabaseReady,
        firestoreQuotaExceeded,
      },
      storage: {
        cwd: process.cwd(),
        dirname: __dirname,
      }
    };

    // Very safe network check
    try {
      if (typeof fetch !== 'undefined') {
        const start = Date.now();
        const netRes = await fetch('https://www.google.com', { method: 'HEAD' });
        report.connectivity = {
          googleHead: {
            ok: netRes.ok,
            status: netRes.status,
            latencyMs: Date.now() - start
          }
        };
      } else {
        report.connectivity = { error: 'Global fetch not available in this Node runtime.' };
      }
    } catch (e: any) {
      report.connectivity = { error: `Network test failed: ${e.message}` };
    }

    res.json({ success: true, report });
  } catch (err: any) {
    console.error('SYSTEM_REPORT_CRASH:', err);
    res.json({ success: false, error: err.message, stack: err.stack });
  }
});

// Server-side Supabase Test (Detailed Diagnostic)
apiRouter.post('/supabase/test-server', async (req, res) => {
  try {
    const client = getSupabaseClient();
    if (!client) {
      return res.json({ 
        success: false, 
        error: 'Supabase server client not initialized. Check server logs for initialization errors.' 
      });
    }

    const testId = `diag-test-${Date.now()}`;
    const testRecord = {
      orderId: testId,
      customerName: 'SERVER_DIAG_TEST',
      notes: 'Temporary record for connection health check.',
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      recordingStatus: 'PENDING',
      uploadStatus: 'PENDING'
    };

    // 1. Attempt Write (Upsert)
    const { error: insertErr } = await client
      .from('orders')
      .upsert(testRecord, { onConflict: 'orderId' });

    if (insertErr) {
      return res.json({ 
        success: false, 
        error: `Supabase Write Failed: ${insertErr.message}`,
        code: insertErr.code,
        details: insertErr.details,
        hint: insertErr.code === '42P01' ? 'Table "orders" does not exist.' : 'Check table schema and PRIMARY KEY constraints.'
      });
    }

    // 2. Attempt Read
    const { data: readData, error: readErr } = await client
      .from('orders')
      .select('*')
      .eq('orderId', testId)
      .maybeSingle();

    if (readErr) {
      return res.json({ success: false, error: `Supabase Read Failed: ${readErr.message}`, code: readErr.code });
    }

    if (!readData) {
      return res.json({ success: false, error: 'Supabase Write reported success, but the record could not be read back immediately.' });
    }

    // 3. Attempt Delete (Cleanup)
    const { error: deleteErr } = await client
      .from('orders')
      .delete()
      .eq('orderId', testId);

    if (deleteErr) {
       console.warn('Diag Cleanup Warning:', deleteErr.message);
    }

    return res.json({ 
      success: true, 
      message: 'Server-side Supabase connection is fully healthy (Read/Write/Delete verified).',
      project: SUPABASE_URL.split('://')[1]?.split('.')[0] || 'hidden',
      usingServiceRole: true,
      v: '1.2.1-diag'
    });

  } catch (err: any) {
    console.error('SERVER_DIAG_CRASH:', err);
    // Return 200 with success:false to prevent safeFetchJson from crashing on HTML error pages
    return res.json({ 
      success: false, 
      error: `Internal Server Error: ${err.message || 'Unknown exception'}`,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

// Supabase Status check endpoint
apiRouter.get('/supabase/status', async (req, res) => {
  const client = getSupabaseClient();
  if (!client) {
    return res.json({ connected: false, error: 'No client initialized', v: APP_VERSION });
  }
  try {
    // Wrap Supabase call in timeout to prevent hanging on network issues
    const { data, error } = (await withTimeout(client.from('orders').select('orderId').limit(1), 5000)) as { data: any; error: any };
    
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
  } catch (err: any) {
    console.error('Supabase status check failed:', err.message);
    return res.json({
      connected: false,
      error: `Timeout or Error: ${err.message}`,
      v: APP_VERSION
    });
  }
});

// Deep System Diagnostic Report
apiRouter.get('/diag/system-report', async (req, res) => {
  const report: any = {
    timestamp: new Date().toISOString(),
    v: APP_VERSION,
    env: {
      NODE_ENV: process.env.NODE_ENV,
      VERCEL: process.env.VERCEL,
      SUPABASE_URL_SET: Boolean(process.env.SUPABASE_URL),
      SUPABASE_KEY_SET: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
    },
    effectiveConfig: {
      supabaseUrl: SUPABASE_URL.slice(0, 15) + '...',
      supabaseKeySet: Boolean(SUPABASE_SERVICE_ROLE_KEY)
    },
    stores: {
      ordersCount: Object.keys(ordersStore).length,
      staffsCount: Object.keys(staffsStore).length
    },
    connectivity: {
      googleReachable: false,
      supabaseReachable: false,
      hasGlobalFetch: typeof globalThis.fetch !== 'undefined'
    }
  };

  const ping = async (url: string) => {
    try {
      if (typeof globalThis.fetch !== 'undefined') {
        const resp = await withTimeout(globalThis.fetch(url, { method: 'HEAD' }), 3000);
        return resp.ok;
      }
      return false;
    } catch (e) { return false; }
  };

  report.connectivity.googleReachable = await ping('https://www.google.com');
  const supaUrl = (SUPABASE_URL || '').split('.co')[0] + '.co';
  report.connectivity.supabaseReachable = await ping(supaUrl);

  try {
    const client = getSupabaseClient();
    if (client) {
      const { error } = (await withTimeout(client.from('orders').select('orderId').limit(1), 4000)) as { error: any };
      report.database = {
        supabase: error ? 'ERROR' : 'CONNECTED',
        error: error?.message,
        code: error?.code
      };
    } else {
      report.database = { supabase: 'NOT_INITIALIZED' };
    }
  } catch (e: any) {
    report.database = { supabase: 'CRASHED', error: e.message };
  }

  res.json({ success: true, report });
});

// Sync orders between memory and Supabase (bi-directional)

// Force a fresh sync from Supabase to Server Memory
apiRouter.post('/supabase/force-sync', async (req, res) => {
  try {
    hasPerformedInitialSync = false;
    await syncFromSupabase();
    res.json({ 
      success: true, 
      message: 'Server memory successfully refreshed from Supabase.',
      ordersCount: Object.keys(ordersStore).length 
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Push/Migrate all current in-memory orders, staffs, and settings to Supabase
apiRouter.post('/supabase/migrate', async (req, res) => {
  if (!getSupabaseClient()) {
    return res.status(500).json({ error: 'Supabase client not initialized' });
  }
  try {
    const ordersList = Object.values(ordersStore);
    let ordersUploaded = 0;
    for (const ord of ordersList) {
      const { error } = await getSupabaseClient().from('orders').upsert(cleanForSupabase(ord), { onConflict: 'orderId' });
      if (!error) ordersUploaded++;
    }

    const staffsList = Object.values(staffsStore);
    for (const st of staffsList) {
      await getSupabaseClient().from('staffs').upsert(cleanForSupabase(st), { onConflict: 'id' });
    }

    await getSupabaseClient().from('settings').upsert({ id: 'config', ...cleanForSupabase(settings) }, { onConflict: 'id' });

    res.json({
      success: true,
      message: `Successfully migrated ${ordersUploaded} orders, ${staffsList.length} staff accounts, and system settings to Supabase!`,
      ordersCount: ordersUploaded
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Migration failed' });
  }
});

// Staffs GET - Syncs live from Supabase
apiRouter.get('/staffs', async (req, res) => {
  const client = getSupabaseClient();
  if (client) {
    try {
      // If we haven't synced yet (common in serverless), do it now
      if (!hasPerformedInitialSync || Object.keys(staffsStore).length <= INITIAL_STAFFS.length) {
        await syncFromSupabase();
      }

      const { data: supaStaffs, error } = (await withTimeout(client.from('staffs').select('*'), 6000)) as { data: any[]; error: any };
      if (!error && Array.isArray(supaStaffs) && supaStaffs.length > 0) {
        const freshMap: Record<string, StaffMember> = {};
        for (const s of supaStaffs) {
          if (s.id) freshMap[s.id] = s;
        }
        staffsStore = freshMap;
        saveLocalBackup();
      }
    } catch (e: any) {
      console.warn('Supabase staffs fetch warning:', e?.message);
    }
  }

  const staffList = Object.values(staffsStore).map(s => ({
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

// Staffs POST (Add or Update)
apiRouter.post('/staffs', async (req, res) => {
  const id = sanitizeString(req.body.id);
  const name = sanitizeString(req.body.name);
  const role = sanitizeString(req.body.role) || 'PACKER';
  const stationId = sanitizeString(req.body.stationId) || settings.stationId || 'Packing-01';
  const password = req.body.password ? String(req.body.password).trim() : undefined;
  const email = req.body.email ? sanitizeString(req.body.email) : undefined;

  if (!id || !name) {
    return res.status(400).json({ error: 'Staff ID and Name are required' });
  }

  const existing = staffsStore[id];
  const updatedStaff: StaffMember = {
    id,
    name,
    role: (role === 'ADMIN' || role === 'SUPERVISOR' || role === 'PACKER') ? role : 'PACKER',
    stationId,
    password: password || existing?.password || 'password123',
    email: email || existing?.email,
    createdAt: existing?.createdAt || new Date().toISOString()
  };

  staffsStore[id] = updatedStaff;
  saveLocalBackup();

  if (firestoreDb) {
    try {
      await setDoc(doc(firestoreDb, 'staffs', id), cleanForFirestore(updatedStaff), { merge: true });
    } catch (e) {
      console.error('Error saving staff to Firestore:', e);
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

// Staffs DELETE (Remove staff)
apiRouter.delete('/staffs/:id', async (req, res) => {
  const id = sanitizeString(req.params.id);
  if (!id) {
    return res.status(400).json({ error: 'Staff ID is required' });
  }

  const existing = staffsStore[id];
  if (!existing) {
    return res.status(404).json({ error: 'Staff member not found' });
  }

  // Guard: Don't allow deleting the last admin
  if (existing.role === 'ADMIN') {
    const adminCount = Object.values(staffsStore).filter(s => s.role === 'ADMIN').length;
    if (adminCount <= 1) {
      return res.status(400).json({ error: 'Cannot delete the only remaining Admin account' });
    }
  }

  delete staffsStore[id];
  saveLocalBackup();

  if (firestoreDb) {
    try {
      await deleteDoc(doc(firestoreDb, 'staffs', id));
    } catch (e) {
      console.error('Error deleting staff from Firestore:', e);
    }
  }

  await deleteStaffFromSupabase(id);

  res.json({ success: true, message: `Staff member ${id} removed successfully` });
});

// Staffs / Auth Reset Password
apiRouter.post(['/staffs/reset-password', '/auth/reset-password'], async (req, res) => {
  const userId = sanitizeString(req.body.userId || req.body.id);
  const newPassword = req.body.newPassword ? String(req.body.newPassword).trim() : '';

  if (!userId || !newPassword) {
    return res.status(400).json({ error: 'User ID and New Password are required' });
  }

  if (newPassword.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' });
  }

  const staffKey = Object.keys(staffsStore).find(
    k => k.toLowerCase() === userId.toLowerCase() ||
         staffsStore[k].name.toLowerCase() === userId.toLowerCase() ||
         (staffsStore[k].email && staffsStore[k].email!.toLowerCase() === userId.toLowerCase())
  );

  if (!staffKey || !staffsStore[staffKey]) {
    return res.status(404).json({ error: `Staff user '${userId}' not found` });
  }

  staffsStore[staffKey].password = newPassword;
  saveLocalBackup();

  if (firestoreDb) {
    try {
      await setDoc(doc(firestoreDb, 'staffs', staffKey), { password: newPassword }, { merge: true });
    } catch (e) {
      console.error('Error updating password in Firestore:', e);
    }
  }

  await saveStaffToSupabase(staffsStore[staffKey]);

  res.json({ success: true, message: `Password for ${staffsStore[staffKey].name} has been reset successfully!` });
});

// Rate limiting tracker for failed access code attempts
const loginAttempts = new Map<string, { count: number; lockUntil: number }>();

// Secure Access Code / PIN Verification Endpoint
apiRouter.post(['/auth/verify-pin', '/auth/access-code'], async (req, res) => {
  const ip = req.ip || req.headers['x-forwarded-for'] || 'client';
  const ipKey = String(ip);

  const attempts = loginAttempts.get(ipKey);
  if (attempts && attempts.lockUntil > Date.now()) {
    const remainingSecs = Math.ceil((attempts.lockUntil - Date.now()) / 1000);
    return res.status(429).json({ 
      error: `Security Lock Active: Too many failed attempts. Please wait ${remainingSecs} seconds.` 
    });
  }

  const rawCode = req.body?.accessCode || req.body?.code || req.body?.pin || '';
  const cleanCode = String(rawCode).trim().toLowerCase();

  if (!cleanCode) {
    return res.status(400).json({ error: 'Please enter Access Code' });
  }

  const envMasterCode = (process.env.MASTER_ACCESS_CODE || '889900').trim().toLowerCase();
  const envPackingCode = (process.env.PACKING_ACCESS_CODE || '123456').trim().toLowerCase();
  const masterWord = (process.env.MASTER_WORD || 'zuboc').trim().toLowerCase();

  let authenticatedStaff: StaffMember | null = null;

  // 1. Direct Supabase Query (Prioritize DB-managed Access Codes)
  const client = getSupabaseClient();
  if (client) {
    try {
      const { data: matchedStaffs, error } = await withTimeout(
        client.from('staffs').select('*').or(`password.eq.${cleanCode},id.eq.${cleanCode}`).limit(1),
        5000
      ) as { data: any[]; error: any };

      if (!error && matchedStaffs && matchedStaffs.length > 0) {
        const matchedStaff = matchedStaffs[0];
        authenticatedStaff = {
          id: matchedStaff.id,
          name: matchedStaff.name,
          role: matchedStaff.role || 'PACKER',
          stationId: matchedStaff.stationId || 'Packing-01',
          email: matchedStaff.email
        };
      }
    } catch (supaErr) {
      console.warn('Supabase Auth Query error:', supaErr);
    }
  }

  // 2. Fallback to in-memory/Firestore (if Supabase query didn't find anyone or failed)
  if (!authenticatedStaff) {
    // Refresh memory store if needed
    if (Object.keys(staffsStore).length <= INITIAL_STAFFS.length) {
      await syncStaffsFromFirestore();
    }

    const matchedStaff = Object.values(staffsStore).find(s => {
      const p = String(s.password || '').trim().toLowerCase();
      const id = String(s.id || '').trim().toLowerCase();
      return (p && p === cleanCode) || (id && id === cleanCode);
    });

    if (matchedStaff) {
      authenticatedStaff = {
        id: matchedStaff.id,
        name: matchedStaff.name,
        role: matchedStaff.role || 'PACKER',
        stationId: matchedStaff.stationId || 'Packing-01',
        email: matchedStaff.email
      };
    } else if (cleanCode === (process.env.MASTER_ACCESS_CODE || 'zuboc2026').trim().toLowerCase()) {
      authenticatedStaff = {
        id: 'Zuboc',
        name: 'Zuboc (ADMIN)',
        role: 'ADMIN',
        stationId: 'Packing-01',
        email: 'admin@zuboc.com'
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

  // Record failed attempt for brute-force protection
  const currentCount = (attempts?.count || 0) + 1;
  const lockTime = currentCount >= 5 ? Date.now() + 60000 : 0;
  loginAttempts.set(ipKey, { count: currentCount, lockUntil: lockTime });

  return res.status(401).json({
    error: currentCount >= 5 
      ? 'Security alert: 5 failed attempts. Access locked for 60 seconds.' 
      : `Invalid Access Code. (${5 - currentCount} attempts remaining)`
  });
});

// Auth Login
apiRouter.post('/auth/login', async (req, res) => {
  await syncStaffsFromFirestore();
  const userId = sanitizeString(req.body.userId || req.body.id || req.body.username);
  const password = req.body.password ? String(req.body.password).trim() : '';

  if (!userId) {
    return res.status(400).json({ error: 'Please enter User ID' });
  }

  const staffKey = Object.keys(staffsStore).find(
    k => k.toLowerCase() === userId.toLowerCase() ||
         staffsStore[k].name.toLowerCase() === userId.toLowerCase() ||
         (staffsStore[k].email && staffsStore[k].email!.toLowerCase() === userId.toLowerCase())
  );

  if (!staffKey) {
    return res.status(401).json({ error: 'Staff account not found with this User ID' });
  }

  const staff = staffsStore[staffKey];
  const expectedPassword = staff.password || 'password123';
  if (expectedPassword !== password) {
    return res.status(401).json({ error: 'Incorrect password. Default password is password123' });
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

async function saveBatchToSupabase(records: OrderRecord[]): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client || records.length === 0) return false;
  try {
    const payload = records.map(cleanForSupabase);
    const BATCH_SIZE = 100;
    for (let i = 0; i < payload.length; i += BATCH_SIZE) {
      const chunk = payload.slice(i, i + BATCH_SIZE);
      const result = (await withTimeout(
        client.from('orders').upsert(chunk, { onConflict: 'orderId' }),
        15000
      )) as { error: any };
      if (result && result.error) {
        console.error('Batch Supabase save error:', result.error.message, result.error.code);
      }
    }
    isSupabaseReady = true;
    return true;
  } catch (err: any) {
    console.error('Batch Supabase save exception:', err?.message);
    return false;
  }
}

// Orders GET - Syncs latest orders from Supabase and serves them
apiRouter.get('/orders', async (req, res) => {
  const client = getSupabaseClient();
  if (client) {
    try {
      // If we haven't synced yet or store is nearly empty, trigger sync
      if (!hasPerformedInitialSync) {
        await syncFromSupabase();
      }

      const { data: supaOrders, error } = (await withTimeout(
        client.from('orders').select('*').order('createdAt', { ascending: false }),
        8000
      )) as { data: any[]; error: any };
      
      if (!error && Array.isArray(supaOrders)) {
        const freshOrdersMap: Record<string, OrderRecord> = {};
        for (const o of supaOrders) {
          if (o.orderId) freshOrdersMap[o.orderId] = o;
        }
        // Safely merge Supabase orders with in-memory ordersStore (never delete local/imported orders)
        ordersStore = { ...freshOrdersMap, ...ordersStore };
        saveLocalBackup();
      }
    } catch (e: any) {
      console.warn('Supabase sync warning on GET /orders:', e?.message);
    }
  }

  const orders = Object.values(ordersStore).map(o => {
    if (!o || !o.orderId) return o;
    if (isAmazonOrder(o)) {
      return { ...o, order_source: 'amazon', orderSource: 'amazon' };
    }
    return { ...o, order_source: o.order_source || 'website', orderSource: o.orderSource || 'website' };
  }).sort((a, b) => {
    const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return (isNaN(timeB) ? 0 : timeB) - (isNaN(timeA) ? 0 : timeA);
  });
  res.json(orders);
});

// Orders GET by ID - Checks in-memory cache first (Zero Firestore read units)
apiRouter.get('/orders/:orderId', async (req, res) => {
  const rawId = req.params.orderId || '';
  let decodedId = rawId;
  try {
    decodedId = decodeURIComponent(rawId);
  } catch {}
  const orderId = sanitizeString(decodedId);
  const cleanId = orderId.replace(/^#/, '').trim().toLowerCase();

  // 1. Direct memory lookup
  let matchedOrder: OrderRecord | undefined = ordersStore[orderId] || ordersStore[cleanId] || ordersStore[`#${cleanId}`];

  // 2. Scan in-memory store case-insensitively and hash-stripped
  if (!matchedOrder) {
    matchedOrder = Object.values(ordersStore).find(o => {
      if (!o.orderId) return false;
      const oId = o.orderId.trim().toLowerCase();
      const oIdNoHash = oId.replace(/^#/, '');
      return oId === cleanId || oIdNoHash === cleanId || oId === orderId.toLowerCase() || oIdNoHash === orderId.toLowerCase();
    });
  }

  if (matchedOrder) {
    return res.json(matchedOrder);
  }

  // 3. Fallback to Supabase
  if (getSupabaseClient()) {
    try {
      const { data: supaOrder } = await getSupabaseClient()
        .from('orders')
        .select('*')
        .or(`orderId.eq.${orderId},orderId.eq.${cleanId}`)
        .maybeSingle();
      if (supaOrder && supaOrder.orderId) {
        ordersStore[supaOrder.orderId] = supaOrder;
        return res.json(supaOrder);
      }
    } catch (supaErr) {
      console.warn('Supabase order lookup notice:', supaErr);
    }
  }

  // 4. Fallback to Firestore only if not found in memory or Supabase
  if (firestoreDb && !firestoreQuotaExceeded) {
    try {
      let docRef = doc(firestoreDb, 'orders', orderId);
      let snap = await getDoc(docRef);
      if (!snap.exists() && orderId.startsWith('#')) {
        docRef = doc(firestoreDb, 'orders', orderId.replace(/^#/, ''));
        snap = await getDoc(docRef);
      }
      if (snap.exists()) {
        const fsData = snap.data() as OrderRecord;
        ordersStore[fsData.orderId || orderId] = fsData;
        return res.json(fsData);
      }
    } catch (e: any) {
      if (e?.message?.includes('Quota') || e?.message?.includes('quota') || e?.code === 'resource-exhausted') {
        firestoreQuotaExceeded = true;
        console.warn('Firestore read quota exceeded during order lookup. Using memory fallback.');
      } else {
        console.error('Error fetching order from Firestore:', e);
      }
    }
  }

  return res.status(404).json({ error: 'Order recording not found' });
});

// Create or update order record metadata
const handleSaveOrderRequest = async (req: express.Request, res: express.Response) => {
  let paramId = req.params?.orderId;
  if (paramId) {
    try { paramId = decodeURIComponent(paramId); } catch {}
  }
  const rawId = req.body.orderId || paramId || '';
  const orderId = sanitizeString(rawId);
  if (!orderId) {
    return res.status(400).json({ error: 'orderId is required' });
  }

  const now = new Date().toISOString();
  const existing = ordersStore[orderId] || Object.values(ordersStore).find(o => {
    if (!o.orderId) return false;
    const cleanO = o.orderId.trim().toLowerCase().replace(/^#/, '');
    const cleanR = orderId.trim().toLowerCase().replace(/^#/, '');
    return cleanO === cleanR;
  });

  // Auto-calculate order_source and numeric sort key
  const digits = orderId.replace(/\D/g, '');
  const parsedNum = digits ? parseInt(digits, 10) : undefined;
  const rawSource = String(req.body.order_source || req.body.orderSource || existing?.order_source || existing?.orderSource || 'website').trim().toLowerCase();
  const isAmazonPattern = /\d{3}-\d{7}-\d{7}/.test(orderId) || /amazon/i.test(orderId) || orderId.toLowerCase().startsWith('402-') || orderId.toLowerCase().startsWith('171-') || orderId.toLowerCase().startsWith('403-') || orderId.toLowerCase().startsWith('408-');
  const order_source = (rawSource.includes('amazon') || isAmazonPattern) ? 'amazon' : 'website';
  const order_number_num = req.body.order_number_num !== undefined ? req.body.order_number_num : (existing?.order_number_num !== undefined ? existing.order_number_num : parsedNum);

  // Merge with existing if present, otherwise start new
  const record: OrderRecord = {
    ...(existing || {}),
    ...req.body,
    orderId: existing?.orderId || orderId, // Ensure ID is preserved
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
  saveLocalBackup();

  if (fulfillmentChanged) {
    await sendTelegramUpdate(record);
  }

  if (firestoreDb && !firestoreQuotaExceeded) {
    try {
      await setDoc(doc(firestoreDb, 'orders', finalId), cleanForFirestore(record), { merge: true });
    } catch (e: any) {
      if (e?.code === 'resource-exhausted' || e?.message?.includes('Quota') || e?.message?.includes('quota')) {
        firestoreQuotaExceeded = true;
        console.warn('Firestore write quota limit reached. Safely persisting to server storage.');
      } else {
        console.error('Error writing order record to Firestore:', e);
      }
    }
  }

  // Synchronously save to Supabase
  const supaSaved = await saveOrderToSupabase(record);

  res.json({ success: true, record, supaSynced: supaSaved });
};

apiRouter.post('/orders', handleSaveOrderRequest);
apiRouter.post('/orders/:orderId', handleSaveOrderRequest);
apiRouter.put('/orders/:orderId', handleSaveOrderRequest);

// Bulk import orders (e.g. from Shopify CSV)
apiRouter.post('/orders/bulk', async (req, res) => {
  const { orders, conflictStrategy = 'skip' } = req.body;
  if (!Array.isArray(orders) || orders.length === 0) {
    return res.status(400).json({ error: 'An array of order objects is required under "orders"' });
  }

  const now = new Date().toISOString();
  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  const processedRecords: OrderRecord[] = [];

  for (const rawRecord of orders) {
    const cleanId = sanitizeString(rawRecord.orderId);
    if (!cleanId) continue;

    const digits = cleanId.replace(/\D/g, '');
    const parsedNum = digits ? parseInt(digits, 10) : undefined;
    const defaultSource = rawRecord.order_source || rawRecord.orderSource || 'website';
    const numVal = rawRecord.order_number_num !== undefined ? rawRecord.order_number_num : parsedNum;

    const existing = ordersStore[cleanId];
    if (existing && conflictStrategy === 'skip') {
      skippedCount++;
      continue;
    }

    let recordToSave: OrderRecord;
    if (existing && conflictStrategy === 'merge') {
      recordToSave = {
        ...existing,
        ...rawRecord,
        orderId: cleanId,
        order_source: rawRecord.order_source || rawRecord.orderSource || existing.order_source || 'website',
        orderSource: rawRecord.order_source || rawRecord.orderSource || existing.order_source || 'website',
        order_number_num: numVal !== undefined ? numVal : existing.order_number_num,
        updatedAt: now,
        createdAt: existing.createdAt || rawRecord.createdAt || now
      };
      updatedCount++;
    } else if (existing && conflictStrategy === 'overwrite') {
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
        fulfillmentStatus: rawRecord.fulfillmentStatus || 'Pending',
        recordingStatus: rawRecord.recordingStatus || 'PENDING',
        uploadStatus: rawRecord.uploadStatus || 'PENDING',
        createdAt: rawRecord.createdAt || now,
        updatedAt: now
      };
      createdCount++;
    }

    ordersStore[cleanId] = recordToSave;
    processedRecords.push(recordToSave);

    if (firestoreDb && !firestoreQuotaExceeded) {
      try {
        await setDoc(doc(firestoreDb, 'orders', cleanId), cleanForFirestore(recordToSave), { merge: true });
      } catch (e: any) {
        if (e?.code === 'resource-exhausted' || e?.message?.includes('Quota') || e?.message?.includes('quota')) {
          firestoreQuotaExceeded = true;
          console.warn('Bulk import: Firestore write quota limit reached. Saving remainder in memory & local storage.');
        } else {
          console.error('Error writing bulk order to Firestore:', cleanId, e);
        }
      }
    }

  }

  // Synchronously batch save processed records to Supabase before returning
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

// Connect directly with Shopify Admin API
apiRouter.post('/shopify/fetch-direct', async (req, res) => {
  const { shopDomain, accessToken } = req.body;
  if (!shopDomain || !accessToken) {
    return res.status(400).json({ success: false, error: 'shopDomain and accessToken are required' });
  }

  const cleanShop = shopDomain.replace(/https?:\/\//, '').replace(/\/$/, '').trim();
  const cleanToken = accessToken.trim();

  try {
    // 1. Fetch regular orders (any status, any fulfillment status)
    const shopifyRes = await fetch(`https://${cleanShop}/admin/api/2023-10/orders.json?status=any&limit=250`, {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': cleanToken,
        'Content-Type': 'application/json'
      }
    });

    if (!shopifyRes.ok) {
      const errText = await shopifyRes.text();
      return res.status(400).json({ success: false, error: `Shopify API Error (${shopifyRes.status}): ${errText}` });
    }

    const shopifyData = await shopifyRes.json() as { orders?: any[] };
    const rawOrders = shopifyData.orders || [];

    // 2. Fetch draft orders (manually created draft orders)
    let rawDraftOrders: any[] = [];
    try {
      const draftRes = await fetch(`https://${cleanShop}/admin/api/2023-10/draft_orders.json?status=any&limit=250`, {
        method: 'GET',
        headers: {
          'X-Shopify-Access-Token': cleanToken,
          'Content-Type': 'application/json'
        }
      });
      if (draftRes.ok) {
        const draftData = await draftRes.json() as { draft_orders?: any[] };
        rawDraftOrders = draftData.draft_orders || [];
      }
    } catch (draftErr) {
      console.warn('Could not fetch draft orders from Shopify API:', draftErr);
    }

    const now = new Date().toISOString();
    const importedRecords: OrderRecord[] = [];
    const processedOrderNames = new Set<string>();

    // Process regular orders
    for (const ord of rawOrders) {
      const orderName = String(ord.name || ord.order_number || ord.id).trim();
      if (!orderName) continue;
      processedOrderNames.add(orderName);

      const digits = orderName.replace(/\D/g, '');
      const order_number_num = digits ? parseInt(digits, 10) : undefined;
      const createdAt = ord.created_at || now;

      const lineItems = (ord.line_items || []).map((li: any) => ({
        name: li.name || li.title || 'Product Item',
        sku: li.sku || undefined,
        price: li.price || undefined,
        quantity: li.quantity || 1
      }));

      const skus = lineItems.map((li: any) => li.sku || li.name).filter(Boolean);
      const shippingAddr = ord.shipping_address || ord.billing_address || {};
      const customerObj = ord.customer || {};

      const rawFulfillment = ord.fulfillment_status;
      const fulfillmentStatus = rawFulfillment
        ? (rawFulfillment.charAt(0).toUpperCase() + rawFulfillment.slice(1).toLowerCase())
        : 'Unfulfilled';

      const record: OrderRecord = {
        orderId: orderName,
        order_source: 'website',
        orderSource: 'website',
        order_number_num,
        staffId: 'Shopify Direct API',
        stationId: 'Web-Fulfillment',
        recordingStartedAt: createdAt,
        durationSeconds: 0,
        recordingStatus: 'PENDING',
        uploadStatus: 'PENDING',

        email: ord.email || customerObj.email,
        financialStatus: ord.financial_status || 'pending',
        fulfillmentStatus,
        subtotal: ord.subtotal_price,
        shipping: ord.total_shipping_price_set?.shop_money?.amount || ord.shipping_lines?.[0]?.price || '0',
        taxes: ord.total_tax,
        total: ord.total_price,
        orderTotal: ord.total_price,
        orderAmount: ord.subtotal_price,
        shippingAmount: ord.total_shipping_price_set?.shop_money?.amount || '0',
        discountCode: ord.discount_codes?.[0]?.code,
        discountAmount: ord.total_discounts,
        shippingMethod: ord.shipping_lines?.[0]?.title || 'Shopify Express',
        courier: ord.shipping_lines?.[0]?.title || 'Shopify Express',
        orderReceivedDate: createdAt,
        lineItems,
        productSku: skus.length > 0 ? skus.join(', ') : 'Shopify Item',
        itemCount: lineItems.reduce((acc: number, li: any) => acc + (li.quantity || 1), 0),
        customerName: `${shippingAddr.first_name || customerObj.first_name || ''} ${shippingAddr.last_name || customerObj.last_name || ''}`.trim() || ord.email || 'Shopify Customer',
        shippingName: `${shippingAddr.first_name || ''} ${shippingAddr.last_name || ''}`.trim() || undefined,
        contactPerson: `${shippingAddr.first_name || ''} ${shippingAddr.last_name || ''}`.trim() || undefined,
        contactPhone: shippingAddr.phone || customerObj.phone || undefined,
        shippingStreet: shippingAddr.address1,
        shippingAddress1: shippingAddr.address1,
        shippingAddress2: shippingAddr.address2,
        shippingCompany: shippingAddr.company,
        shippingCity: shippingAddr.city,
        shippingZip: shippingAddr.zip,
        shippingProvince: shippingAddr.province,
        shippingCountry: shippingAddr.country,
        shippingPhone: shippingAddr.phone,
        notes: ord.note || undefined,
        isProductionDeckOrder: false,
        createdAt,
        updatedAt: now
      };

      ordersStore[orderName] = record;
      importedRecords.push(record);

      if (firestoreDb && !firestoreQuotaExceeded) {
        try {
          await setDoc(doc(firestoreDb, 'orders', orderName), cleanForFirestore(record), { merge: true });
        } catch {}
      }
    }

    // Process draft orders (open/uncompleted draft orders created manually in Shopify)
    for (const draft of rawDraftOrders) {
      // If draft order has converted to an order or is already processed, skip
      if (draft.order_id || (draft.name && processedOrderNames.has(draft.name))) {
        continue;
      }

      const orderName = String(draft.name || (`DRAFT-${draft.id}`)).trim();
      if (!orderName || processedOrderNames.has(orderName)) continue;
      processedOrderNames.add(orderName);

      const digits = orderName.replace(/\D/g, '');
      const order_number_num = digits ? parseInt(digits, 10) : undefined;
      const createdAt = draft.created_at || now;

      const lineItems = (draft.line_items || []).map((li: any) => ({
        name: li.name || li.title || 'Draft Product Item',
        sku: li.sku || undefined,
        price: li.price || undefined,
        quantity: li.quantity || 1
      }));

      const skus = lineItems.map((li: any) => li.sku || li.name).filter(Boolean);
      const shippingAddr = draft.shipping_address || draft.billing_address || {};
      const customerObj = draft.customer || {};

      const record: OrderRecord = {
        orderId: orderName,
        order_source: 'website',
        orderSource: 'website',
        order_number_num,
        staffId: 'Shopify Direct API (Draft)',
        stationId: 'Web-Fulfillment',
        recordingStartedAt: createdAt,
        durationSeconds: 0,
        recordingStatus: 'PENDING',
        uploadStatus: 'PENDING',

        email: draft.email || customerObj.email,
        financialStatus: draft.status || 'draft',
        fulfillmentStatus: 'Draft',
        subtotal: draft.subtotal_price,
        shipping: draft.shipping_line?.price || '0',
        taxes: draft.total_tax,
        total: draft.total_price,
        orderTotal: draft.total_price,
        orderAmount: draft.subtotal_price,
        shippingAmount: draft.shipping_line?.price || '0',
        discountCode: undefined,
        discountAmount: '0',
        shippingMethod: draft.shipping_line?.title || 'Shopify Draft',
        courier: draft.shipping_line?.title || 'Shopify Draft',
        orderReceivedDate: createdAt,
        lineItems,
        productSku: skus.length > 0 ? skus.join(', ') : 'Shopify Draft Item',
        itemCount: lineItems.reduce((acc: number, li: any) => acc + (li.quantity || 1), 0),
        customerName: `${shippingAddr.first_name || customerObj.first_name || ''} ${shippingAddr.last_name || customerObj.last_name || ''}`.trim() || draft.email || 'Shopify Draft Customer',
        shippingName: `${shippingAddr.first_name || ''} ${shippingAddr.last_name || ''}`.trim() || undefined,
        contactPerson: `${shippingAddr.first_name || ''} ${shippingAddr.last_name || ''}`.trim() || undefined,
        contactPhone: shippingAddr.phone || customerObj.phone || undefined,
        shippingStreet: shippingAddr.address1,
        shippingAddress1: shippingAddr.address1,
        shippingAddress2: shippingAddr.address2,
        shippingCompany: shippingAddr.company,
        shippingCity: shippingAddr.city,
        shippingZip: shippingAddr.zip,
        shippingProvince: shippingAddr.province,
        shippingCountry: shippingAddr.country,
        shippingPhone: shippingAddr.phone,
        notes: draft.note || undefined,
        isProductionDeckOrder: false,
        createdAt,
        updatedAt: now
      };

      ordersStore[orderName] = record;
      importedRecords.push(record);

      if (firestoreDb && !firestoreQuotaExceeded) {
        try {
          await setDoc(doc(firestoreDb, 'orders', orderName), cleanForFirestore(record), { merge: true });
        } catch {}
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

  } catch (err: any) {
    console.error('Shopify Direct API Error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to connect to Shopify API' });
  }
});

// Parse incoming Shopify Webhook payload into OrderRecord
function parseShopifyWebhookPayload(ord: any): OrderRecord | null {
  if (!ord) return null;
  const now = new Date().toISOString();
  
  // Format Order ID (#2891, WEB-1042, or DRAFT-1002)
  let orderName = ord.name ? String(ord.name).trim() : '';
  if (!orderName && ord.order_number) {
    orderName = `#${ord.order_number}`;
  }
  if (!orderName && ord.id) {
    orderName = `SHOPIFY-${ord.id}`;
  }
  if (!orderName) return null;

  const digits = orderName.replace(/\D/g, '');
  const order_number_num = digits ? parseInt(digits, 10) : undefined;
  const createdAt = normalizeIsoDate(ord.created_at || ord.processed_at) || now;

  const lineItems = (ord.line_items || []).map((li: any) => ({
    name: li.name || li.title || 'Shopify Line Item',
    sku: li.sku || undefined,
    price: li.price || undefined,
    quantity: li.quantity || 1
  }));

  const skus = lineItems.map((li: any) => li.sku || li.name).filter(Boolean);
  const shippingAddr = ord.shipping_address || ord.billing_address || {};
  const customerObj = ord.customer || {};

  const rawFulfillment = ord.fulfillment_status;
  const fulfillmentStatus = rawFulfillment
    ? (rawFulfillment.charAt(0).toUpperCase() + rawFulfillment.slice(1).toLowerCase())
    : 'Unfulfilled';

  const record: OrderRecord = {
    orderId: orderName,
    order_source: 'website',
    orderSource: 'website',
    order_number_num,
    staffId: 'Shopify Webhook Auto-Sync',
    stationId: 'Web-Fulfillment',
    recordingStartedAt: createdAt,
    durationSeconds: 0,
    recordingStatus: 'PENDING',
    uploadStatus: 'PENDING',

    email: ord.email || customerObj.email,
    financialStatus: ord.financial_status || 'pending',
    fulfillmentStatus,
    subtotal: ord.subtotal_price,
    shipping: ord.total_shipping_price_set?.shop_money?.amount || ord.shipping_lines?.[0]?.price || '0',
    taxes: ord.total_tax,
    total: ord.total_price || ord.total_price_set?.shop_money?.amount,
    orderTotal: ord.total_price || ord.subtotal_price,
    orderAmount: ord.subtotal_price || ord.total_price,
    shippingAmount: ord.total_shipping_price_set?.shop_money?.amount || '0',
    discountCode: ord.discount_codes?.[0]?.code,
    discountAmount: ord.total_discounts,
    shippingMethod: ord.shipping_lines?.[0]?.title || 'Shopify Express',
    courier: ord.shipping_lines?.[0]?.title || 'Shopify Express',
    orderReceivedDate: createdAt,
    lineItems,
    productSku: skus.length > 0 ? skus.join(', ') : 'Shopify Line Item',
    itemCount: lineItems.reduce((acc: number, li: any) => acc + (li.quantity || 1), 0) || 1,
    customerName: `${shippingAddr.first_name || customerObj.first_name || ''} ${shippingAddr.last_name || customerObj.last_name || ''}`.trim() || ord.email || 'Shopify Customer',
    shippingName: `${shippingAddr.first_name || ''} ${shippingAddr.last_name || ''}`.trim() || undefined,
    contactPerson: `${shippingAddr.first_name || ''} ${shippingAddr.last_name || ''}`.trim() || undefined,
    contactPhone: shippingAddr.phone || customerObj.phone || undefined,
    shippingStreet: shippingAddr.address1,
    shippingAddress1: shippingAddr.address1,
    shippingAddress2: shippingAddr.address2,
    shippingCompany: shippingAddr.company,
    shippingCity: shippingAddr.city,
    shippingZip: shippingAddr.zip,
    shippingProvince: shippingAddr.province,
    shippingCountry: shippingAddr.country,
    shippingPhone: shippingAddr.phone,
    notes: ord.note || undefined,
    isProductionDeckOrder: false,
    createdAt,
    updatedAt: now
  };

  return record;
}

// Real-time Shopify Webhook Ingestion Routes
const handleShopifyWebhook = async (req: express.Request, res: express.Response) => {
  try {
    const topic = req.headers['x-shopify-topic'] || 'orders/create';
    console.log(`[Shopify Webhook] Ingesting ${topic} event...`);

    const record = parseShopifyWebhookPayload(req.body);
    if (!record) {
      return res.status(200).json({ success: true, message: 'Webhook received but payload contained no valid order Name or ID.' });
    }

    ordersStore[record.orderId] = record;
    saveLocalBackup();

    if (firestoreDb && !firestoreQuotaExceeded) {
      try {
        await setDoc(doc(firestoreDb, 'orders', record.orderId), cleanForFirestore(record), { merge: true });
      } catch {}
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
  } catch (err: any) {
    console.error('[Shopify Webhook Error]:', err);
    return res.status(200).json({ success: false, error: err?.message || 'Webhook processing exception' });
  }
};

apiRouter.post('/webhooks/shopify/orders-create', handleShopifyWebhook);
apiRouter.post('/webhooks/shopify/orders-updated', handleShopifyWebhook);
apiRouter.post('/webhooks/shopify/draft-orders', handleShopifyWebhook);
apiRouter.post('/webhooks/shopify', handleShopifyWebhook);

// Update specific order
apiRouter.post('/orders/:orderId', async (req, res) => {
  const { orderId } = req.params;
  console.log('Updating order:', orderId, 'Body:', JSON.stringify(req.body));
  const now = new Date().toISOString();
  const existing = ordersStore[orderId];

  const record: OrderRecord = {
    ...(existing || {}),
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
      await setDoc(doc(firestoreDb, 'orders', orderId), cleanForFirestore(record), { merge: true });
    } catch (e: any) {
      if (e?.code === 'resource-exhausted' || e?.message?.includes('Quota') || e?.message?.includes('quota')) {
        firestoreQuotaExceeded = true;
        console.warn('Firestore write quota limit reached. Safely persisting to server storage.');
      } else {
        console.error('Error updating order record in Firestore:', e);
      }
    }
  }

  await saveOrderToSupabase(record);

  res.json({ success: true, record });
});

// Delete order record
apiRouter.delete('/orders/:orderId', async (req, res) => {
  const orderId = sanitizeString(req.params.orderId);
  if (!orderId) {
    return res.status(400).json({ error: 'orderId is required' });
  }

  delete ordersStore[orderId];
  delete ordersStore[orderId.replace(/^#/, '')];
  delete ordersStore[`#${orderId.replace(/^#/, '')}`];
  saveLocalBackup();

  if (firestoreDb && !firestoreQuotaExceeded) {
    try {
      await deleteDoc(doc(firestoreDb, 'orders', orderId));
    } catch (e: any) {
      if (e?.code === 'resource-exhausted' || e?.message?.includes('Quota') || e?.message?.includes('quota')) {
        firestoreQuotaExceeded = true;
      } else {
        console.error('Error deleting order from Firestore:', e);
      }
    }
  }

  await deleteOrderFromSupabase(orderId);

  res.json({ success: true, message: `Order ${orderId} deleted successfully` });
});

// Telegram Primary Upload Route
apiRouter.post('/telegram/upload', (req, res, next) => {
  upload.fields([
    { name: 'video', maxCount: 1 },
    { name: 'photo', maxCount: 1 },
    { name: 'photos', maxCount: 5 }
  ])(req, res, (err) => {
    if (err) {
      console.warn('Multer upload warning:', err.message);
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
    const evidenceType = req.body.evidenceType || 'VIDEO';
    const awbNumber = sanitizeString(req.body.awbNumber);
    const courier = sanitizeString(req.body.courier);
    const weight = sanitizeString(req.body.weight);
    const productSku = sanitizeString(req.body.productSku);
    const customerName = sanitizeString(req.body.customerName);
    const itemCount = sanitizeString(req.body.itemCount);
    const notes = sanitizeString(req.body.notes);

    if (!orderId) {
      return res.status(400).json({ error: 'orderId is required' });
    }

    let record = ordersStore[orderId];
    if (!record && firestoreDb) {
      try {
        const snap = await getDoc(doc(firestoreDb, 'orders', orderId));
        if (snap.exists()) {
          record = snap.data() as OrderRecord;
        }
      } catch (e) {
        console.error('Firestore order read error:', e);
      }
    }

    const now = new Date().toISOString();
    if (!record) {
      record = {
        orderId,
        staffId: staffId || 'Operator',
        stationId: stationId || settings.stationId || 'Packing-01',
        recordingStartedAt: now,
        recordingCompletedAt: now,
        durationSeconds,
        recordingStatus: 'COMPLETED',
        uploadStatus: 'PENDING',
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

    const rawBotToken = settings.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN || '';
    const rawChatId = settings.telegramChatId || process.env.TELEGRAM_CHAT_ID || '';
    const botToken = cleanTelegramCredential(rawBotToken);
    const chatId = cleanTelegramCredential(rawChatId);

    if (!botToken || !chatId) {
      record.uploadStatus = 'FAILED';
      ordersStore[orderId] = record;
      saveLocalBackup();
      if (firestoreDb) {
        await setDoc(doc(firestoreDb, 'orders', orderId), cleanForFirestore(record), { merge: true });
      }
      return res.status(400).json({
        error: 'Telegram Bot Token and Chat ID are not configured.',
        record
      });
    }

    // Extract files from multer
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    let videoBuffer: Buffer | null = null;
    let photoBuffers: Buffer[] = [];
    if (files?.video?.[0]?.buffer) {
      videoBuffer = files.video[0].buffer;
    } else if (videoBase64) {
      const base64Data = videoBase64.replace(/^data:.*;base64,/, '');
      videoBuffer = Buffer.from(base64Data, 'base64');
    }
    if (files?.photo) {
      files.photo.forEach(f => { if (f.buffer) photoBuffers.push(f.buffer); });
    }
    if (files?.photos) {
      files.photos.forEach(f => { if (f.buffer) photoBuffers.push(f.buffer); });
    }
    if (photoBase64) {
      const base64Data = photoBase64.replace(/^data:.*;base64,/, '');
      photoBuffers.push(Buffer.from(base64Data, 'base64'));
    }
    if (!videoBuffer && photoBuffers.length === 0) {
      return res.status(400).json({ error: 'No video or photo payload received in request' });
    }

    const formattedDate = recordingDate 
      ? new Date(recordingDate).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    const safeOrderId = escapeHtml(orderId);
    const safeStaffId = escapeHtml(staffId || record.staffId);
    const safeStationId = escapeHtml(stationId || record.stationId);

    let messageId = '';
    let fileId = '';
    let tgResult: any = null;

    // Step 1: Send Header Card message first to establish thread parent for all order evidence
    try {
      const durMin = Math.floor((durationSeconds || record.durationSeconds || 0) / 60);
      const durSec = (durationSeconds || record.durationSeconds || 0) % 60;
      const durationStr = `${durMin}m ${durSec}s`;

      const headerTextLines = [
        `📦 <b>ORDER PACKING DETAILS • ${safeOrderId}</b>`,
        record.awbNumber ? `<b>🚚 AWB / Tracking:</b> ${escapeHtml(record.awbNumber)}` : '',
        record.courier ? `<b>🏢 Courier:</b> ${escapeHtml(record.courier)}` : '',
        record.deliveryMethod ? `<b>🚀 Delivery Method:</b> ${escapeHtml(record.deliveryMethod)}` : '',
        record.weight ? `<b>⚖️ Weight:</b> ${escapeHtml(record.weight)}` : '',
        record.productSku ? `<b>🏷️ SKU / Item:</b> ${escapeHtml(record.productSku)}` : '',
        record.itemCount ? `<b>🔢 Qty:</b> ${escapeHtml(String(record.itemCount))}` : '',
        record.customerName ? `<b>👤 Customer / City:</b> ${escapeHtml(record.customerName)}` : '',
        record.contactPerson ? `<b>📞 Contact Person:</b> ${escapeHtml(record.contactPerson)}` : '',
        record.contactPhone ? `<b>📱 Contact Phone:</b> ${escapeHtml(record.contactPhone)}` : '',
        record.orderReceivedDate ? `<b>📥 Received Date:</b> ${escapeHtml(record.orderReceivedDate)}` : '',
        record.dispatchDate ? `<b>📤 Despatch Date:</b> ${escapeHtml(record.dispatchDate)}` : '',
        record.orderAmount ? `<b>💰 Order Amount:</b> ₹${escapeHtml(record.orderAmount)}` : '',
        record.shippingAmount ? `<b>📦 Shipping Amount:</b> ₹${escapeHtml(record.shippingAmount)}` : '',
        record.orderTotal ? `<b>💵 Total Amount:</b> ₹${escapeHtml(record.orderTotal)}` : '',
        record.deliveredDate ? `<b>✅ Delivered Date:</b> ${escapeHtml(record.deliveredDate)}` : '',
        `<b>👷 Staff:</b> ${safeStaffId} | <b>📍 Station:</b> ${safeStationId}`,
        `<b>📅 Recorded:</b> ${escapeHtml(formattedDate)} (IST)`,
        record.durationSeconds ? `<b>⏱️ Duration:</b> ${escapeHtml(durationStr)}` : '',
        record.notes ? `<b>📝 Notes:</b> ${escapeHtml(record.notes)}` : ''
      ].filter(Boolean);

      const headerRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: headerTextLines.join('\n'),
          parse_mode: 'HTML'
        })
      });
      const headerData = await headerRes.json();
      if (headerData.ok && headerData.result?.message_id) {
        messageId = headerData.result.message_id.toString();
      }
    } catch (e) {
      console.warn('Header message creation error in server:', e);
    }

    const uploadTasks: Promise<any>[] = [];

    // Task Wrapper for robust retries
    const robustUpload = async (method: string, formData: FormData) => {
      let lastErr;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, { method: 'POST', body: formData });
          const data = await res.json();
          if (data.ok) return data;
          lastErr = new Error(data.description || `${method} failed`);
        } catch (e: any) {
          lastErr = e;
        }
        if (attempt === 0) await new Promise(r => setTimeout(r, 1000));
      }
      throw lastErr;
    };

    // 1. Prepare Video Upload Task
    if (videoBuffer) {
      uploadTasks.push((async () => {
        const captionLines = [
          `<b>🎥 Packing Video • Order ID: ${safeOrderId}</b>`,
          record.awbNumber ? `<b>🚚 AWB:</b> ${escapeHtml(record.awbNumber)}` : '',
          record.courier ? `<b>🏢 Courier:</b> ${escapeHtml(record.courier)}` : '',
          record.deliveryMethod ? `<b>🚀 Delivery Method:</b> ${escapeHtml(record.deliveryMethod)}` : '',
          record.weight ? `<b>⚖️ Weight:</b> ${escapeHtml(record.weight)}` : '',
          record.productSku ? `<b>🏷️ SKU / Item:</b> ${escapeHtml(record.productSku)}` : '',
          `<b>👷 Staff:</b> ${safeStaffId} • <b>Station:</b> ${safeStationId}`,
          `<b>📅 Recorded:</b> ${escapeHtml(formattedDate)} (IST)`
        ].filter(Boolean);

        const caption = captionLines.join('\n');
        const { mp4Buffer, thumbBuffer } = await transcodeToTelegramMp4(videoBuffer, safeOrderId);

        const formData = new FormData();
        formData.append('chat_id', chatId);
        formData.append('caption', caption);
        formData.append('parse_mode', 'HTML');
        if (messageId) {
          formData.append('reply_to_message_id', messageId);
          formData.append('allow_sending_without_reply', 'true');
          formData.append('reply_parameters', JSON.stringify({ message_id: Number(messageId), allow_sending_without_reply: true }));
        }
        formData.append('supports_streaming', 'true');

        const width = Number(req.body.width);
        const height = Number(req.body.height);
        if (width > 0 && height > 0) {
          formData.append('width', width.toString());
          formData.append('height', height.toString());
        }
        if (durationSeconds > 0) {
          formData.append('duration', Math.round(durationSeconds).toString());
        }
        
        formData.append('video', new Blob([new Uint8Array(mp4Buffer)], { type: 'video/mp4' }), `${safeOrderId}.mp4`);

        if (thumbBuffer && thumbBuffer.length > 0) {
          formData.append('thumb', new Blob([new Uint8Array(thumbBuffer)], { type: 'image/jpeg' }), `${safeOrderId}_thumb.jpg`);
        } else if (photoBuffers[0]) {
          formData.append('thumb', new Blob([new Uint8Array(photoBuffers[0])], { type: 'image/jpeg' }), `${safeOrderId}_thumb.jpg`);
        }

        return robustUpload('sendVideo', formData);
      })());
    }

    // 2. Prepare Photo Upload Tasks
    photoBuffers.forEach((pBuf, i) => {
      uploadTasks.push((async () => {
        const photoCaptionLines = [
          videoBuffer
            ? `<b>📷 Photo Snapshot #${i + 1} • Order ID: ${safeOrderId}</b>`
            : `<b>📷 Photo Evidence #${i + 1} • Order ID: ${safeOrderId}</b>`,
          record.awbNumber ? `<b>AWB:</b> ${escapeHtml(record.awbNumber)}` : '',
          record.courier ? `<b>Courier:</b> ${escapeHtml(record.courier)}` : '',
          record.productSku ? `<b>Item:</b> ${escapeHtml(record.productSku)}` : '',
          `<b>Staff:</b> ${safeStaffId} • <b>Station:</b> ${safeStationId}`,
          `<b>Captured:</b> ${escapeHtml(formattedDate)} (IST)`
        ].filter(Boolean);

        const photoFormData = new FormData();
        photoFormData.append('chat_id', chatId);
        photoFormData.append('caption', photoCaptionLines.join('\n'));
        photoFormData.append('parse_mode', 'HTML');
        if (messageId) {
          photoFormData.append('reply_to_message_id', messageId);
          photoFormData.append('allow_sending_without_reply', 'true');
          photoFormData.append('reply_parameters', JSON.stringify({ message_id: Number(messageId), allow_sending_without_reply: true }));
        }
        photoFormData.append('photo', new Blob([new Uint8Array(pBuf)], { type: 'image/jpeg' }), `${safeOrderId}_p${i+1}.jpg`);

        return robustUpload('sendPhoto', photoFormData);
      })());
    });

    // 3. Execute concurrently
    if (uploadTasks.length > 0) {
      try {
        const results = await Promise.all(uploadTasks);
        // Extract fileId from the first result that has it
        const videoRes = results.find(r => r.result?.video);
        if (videoRes) {
          fileId = videoRes.result?.video?.file_id;
        } else if (results[0]?.result?.photo) {
          const photos = results[0].result.photo;
          fileId = photos[photos.length - 1]?.file_id;
        }
        if (!messageId && results[0]?.result?.message_id) {
          messageId = results[0].result.message_id.toString();
        }
      } catch (err: any) {
        console.error('Concurrent media upload failed:', err);
        // We don't fail the whole request if the header was sent
      }
    }
    let cleanChannelId = chatId;
    let numericId = cleanChannelId;
    if (numericId.startsWith('-100')) {
      numericId = numericId.substring(4);
    } else if (numericId.startsWith('-')) {
      numericId = numericId.substring(1);
    }

    let messageLink = '';
    if (messageId) {
      if (cleanChannelId.startsWith('@')) {
        messageLink = `https://t.me/${cleanChannelId.substring(1)}/${messageId}`;
      } else {
        messageLink = `https://t.me/c/${numericId}/${messageId}`;
      }
    }

    record.uploadStatus = 'SUCCESS';
    record.telegramChatId = chatId;
    record.telegramMessageId = messageId;
    record.telegramFileId = fileId;
    record.telegramMessageLink = messageLink;
    record.updatedAt = new Date().toISOString();

    ordersStore[orderId] = record;
    saveLocalBackup();

    if (firestoreDb) {
      await setDoc(doc(firestoreDb, 'orders', orderId), cleanForFirestore(record), { merge: true });
    }

    res.json({ success: true, record, telegramResponse: tgResult });
  } catch (error: any) {
    console.error('Telegram upload error:', error);
    const orderId = sanitizeString(req.body.orderId);
    if (orderId && ordersStore[orderId]) {
      ordersStore[orderId].uploadStatus = 'FAILED';
      ordersStore[orderId].updatedAt = new Date().toISOString();
      saveLocalBackup();
      if (firestoreDb) {
        setDoc(doc(firestoreDb, 'orders', orderId), cleanForFirestore(ordersStore[orderId]), { merge: true }).catch(() => {});
      }
    }
    res.status(500).json({ error: error.message || 'Failed to upload video to Telegram' });
  }
});

// Update order details and sync/edit Telegram caption or send threaded reply update
apiRouter.post('/telegram/update-caption', async (req, res) => {
  const orderId = sanitizeString(req.body.orderId);
  if (!orderId) {
    return res.status(400).json({ error: 'orderId is required' });
  }
  let record = ordersStore[orderId];
  if (!record && firestoreDb) {
    try {
      const snap = await getDoc(doc(firestoreDb, 'orders', orderId));
      if (snap.exists()) {
        record = snap.data() as OrderRecord;
      }
    } catch (e) {}
  }
  if (!record) {
    return res.status(404).json({ error: 'Order not found' });
  }
  Object.keys(req.body).forEach(key => {
    if (['awbNumber', 'courier', 'weight', 'productSku', 'customerName', 'contactPerson', 'contactPhone', 'orderReceivedDate', 'dispatchDate', 'orderAmount', 'shippingAmount', 'orderTotal', 'deliveredDate', 'itemCount', 'notes', 'fulfillmentStatus', 'remarks'].includes(key)) {
      (record as any)[key] = sanitizeString(req.body[key]);
    }
  });
  record.updatedAt = new Date().toISOString();
  ordersStore[orderId] = record;
  saveLocalBackup();
  if (firestoreDb) {
    await setDoc(doc(firestoreDb, 'orders', orderId), cleanForFirestore(record), { merge: true }).catch(() => {});
  }
  const rawBotToken = settings.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN || '';
  const rawChatId = settings.telegramChatId || process.env.TELEGRAM_CHAT_ID || '';
  const botToken = cleanTelegramCredential(rawBotToken);
  const chatId = cleanTelegramCredential(rawChatId);
  if (botToken && chatId && record.telegramMessageId) {
    const durMin = Math.floor((record.durationSeconds || 0) / 60);
    const durSec = (record.durationSeconds || 0) % 60;
    const durationStr = `${durMin}m ${durSec}s`;
    const formattedDate = record.createdAt ? new Date(record.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleString('en-IN');
    const safeOrderId = escapeHtml(record.orderId);
    const captionLines = [
      `<b>📦 Order ID: ${safeOrderId} (Updated)</b>`,
      record.awbNumber ? `<b>🚚 AWB / Tracking:</b> ${escapeHtml(record.awbNumber)}` : '',
      record.courier ? `<b>🏢 Courier:</b> ${escapeHtml(record.courier)}` : '',
      record.weight ? `<b>⚖️ Weight:</b> ${escapeHtml(record.weight)}` : '',
      record.productSku ? `<b>🏷️ SKU / Item:</b> ${escapeHtml(record.productSku)}` : '',
      record.itemCount ? `<b>🔢 Qty:</b> ${escapeHtml(String(record.itemCount))}` : '',
      record.customerName ? `<b>👤 Customer / City:</b> ${escapeHtml(record.customerName)}` : '',
      record.contactPerson ? `<b>📞 Contact Person:</b> ${escapeHtml(record.contactPerson)}` : '',
      record.contactPhone ? `<b>📱 Contact Phone:</b> ${escapeHtml(record.contactPhone)}` : '',
      record.orderReceivedDate ? `<b>📥 Received Date:</b> ${escapeHtml(record.orderReceivedDate)}` : '',
      record.dispatchDate ? `<b>📤 Despatch Date:</b> ${escapeHtml(record.dispatchDate)}` : '',
      record.orderAmount ? `<b>💰 Order Amount:</b> ₹${escapeHtml(record.orderAmount)}` : '',
      record.shippingAmount ? `<b>📦 Shipping Amount:</b> ₹${escapeHtml(record.shippingAmount)}` : '',
      record.orderTotal ? `<b>💵 Total Amount:</b> ₹${escapeHtml(record.orderTotal)}` : '',
      record.deliveredDate ? `<b>✅ Delivered Date:</b> ${escapeHtml(record.deliveredDate)}` : '',
      `<b>👷 Staff:</b> ${escapeHtml(record.staffId)}`,
      `<b>📍 Station:</b> ${escapeHtml(record.stationId)}`,
      `<b>📅 Recorded:</b> ${escapeHtml(formattedDate)} (IST)`,
      `<b>⏱️ Duration:</b> ${escapeHtml(durationStr)}`,
      `<b>🚛 Fulfillment:</b> <b>${escapeHtml(record.fulfillmentStatus || 'Pending')}</b>`,
      record.notes ? `<b>📝 Notes:</b> ${escapeHtml(record.notes)}` : '',
      record.remarks ? `<b>✅ QC Remarks:</b> ${escapeHtml(record.remarks)}` : '',
      '<b>✏️ Status:</b> Order details edited & synced by Management'
    ].filter(Boolean);
    const newCaption = captionLines.join('\n');
    try {
      await fetch(`https://api.telegram.org/bot${botToken}/editMessageCaption`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: record.telegramChatId || chatId,
          message_id: Number(record.telegramMessageId),
          caption: newCaption,
          parse_mode: 'HTML'
        })
      });
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: record.telegramChatId || chatId,
          reply_to_message_id: Number(record.telegramMessageId),
          text: `✏️ <b>Order Details Edited & Synced</b>\n\n<b>Customer:</b> ${escapeHtml(record.customerName || 'N/A')}\n<b>AWB:</b> ${escapeHtml(record.awbNumber || 'N/A')}\n<b>SKU:</b> ${escapeHtml(record.productSku || 'N/A')}\n<b>Notes:</b> ${escapeHtml(record.notes || 'N/A')}`,
          parse_mode: 'HTML'
        })
      });
    } catch (e) {
      console.error('Failed to update Telegram message caption:', e);
    }
  }
  res.json({ success: true, record });
});

// Telegram Webhook
apiRouter.post('/telegram/webhook', async (req, res) => {
  try {
    const update = req.body;
    const message = update?.message;
    const text = message?.text || '';
    const chatId = message?.chat?.id;

    if (chatId && text.startsWith('/video')) {
      const parts = text.split(/\s+/);
      const queryOrderId = sanitizeString(parts[1]);

      const rawBotToken = settings.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN || '';
      const botToken = cleanTelegramCredential(rawBotToken);

      if (!queryOrderId) {
        if (botToken) {
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: '⚠️ Please supply an Order ID.\nExample: <code>/video ORD-123456</code>',
              parse_mode: 'HTML'
            })
          });
        }
        return res.json({ ok: true });
      }

      let foundRecord = ordersStore[queryOrderId];
      if (!foundRecord && firestoreDb) {
        const snap = await getDoc(doc(firestoreDb, 'orders', queryOrderId));
        if (snap.exists()) {
          foundRecord = snap.data() as OrderRecord;
        }
      }

      if (botToken) {
        if (foundRecord) {
          const replyText = `📦 <b>Order ID: ${escapeHtml(foundRecord.orderId)}</b>\n\n<b>Staff:</b> ${escapeHtml(foundRecord.staffId)}\n<b>Station:</b> ${escapeHtml(foundRecord.stationId)}\n<b>Status:</b> ${escapeHtml(foundRecord.uploadStatus)}\n<b>Duration:</b> ${foundRecord.durationSeconds}s\n<b>Recorded:</b> ${new Date(foundRecord.createdAt).toLocaleString()}\n\n🔗 <a href="${foundRecord.telegramMessageLink || '#'}">View Original Telegram Video Message</a>`;
          
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: replyText,
              parse_mode: 'HTML'
            })
          });
        } else {
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: `❌ No packing video found for Order ID: <code>${escapeHtml(queryOrderId)}</code>`,
              parse_mode: 'HTML'
            })
          });
        }
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Telegram webhook error:', err);
    res.json({ ok: true });
  }
});

// Telegram Test Connection
apiRouter.post('/telegram/test-connection', async (req, res) => {
  const bodyToken = req.body?.telegramBotToken ? cleanTelegramCredential(req.body.telegramBotToken) : '';
  const bodyChatId = req.body?.telegramChatId ? cleanTelegramCredential(req.body.telegramChatId) : '';

  const rawBotToken = bodyToken || settings.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN || '';
  const rawChatId = bodyChatId || settings.telegramChatId || process.env.TELEGRAM_CHAT_ID || '';
  const botToken = cleanTelegramCredential(rawBotToken);
  const chatId = cleanTelegramCredential(rawChatId);

  if (!botToken || !chatId) {
    return res.status(400).json({ error: 'Telegram Bot Token and Chat ID not configured.' });
  }

  try {
    // First verify bot info via getMe
    const meRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const meText = await meRes.text();
    let meData: any = null;
    try {
      meData = JSON.parse(meText);
    } catch {
      throw new Error('Telegram API unreachable or returned non-JSON response');
    }

    if (!meData || !meData.ok) {
      throw new Error(meData?.description || 'Invalid Telegram Bot Token');
    }
    const botUsername = meData.result?.username ? `@${meData.result.username}` : 'Bot';

    const text = `🟢 <b>Zuboc Flow (${escapeHtml(botUsername)}) Connected!</b>\n\n<b>Station:</b> ${escapeHtml(settings.stationId)}\n<b>Timestamp:</b> ${escapeHtml(new Date().toLocaleString('en-GB'))}\n\nYour Zuboc Flow packing station is online and verified. Recorded order packing evidence will be delivered here automatically.`;

    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML'
      })
    });

    const responseText = await response.text();
    let data: any = null;
    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error('Telegram API sendMessage returned non-JSON response');
    }

    if (!data || !data.ok) {
      throw new Error(data?.description || 'Failed to send message to Telegram chat ID');
    }

    // Save if valid
    if (bodyToken && !bodyToken.includes('...')) {
      settings.telegramBotToken = bodyToken;
    }
    if (bodyChatId) {
      settings.telegramChatId = bodyChatId;
    }
    saveLocalBackup();

    if (firestoreDb) {
      setDoc(doc(firestoreDb, 'settings', 'config'), cleanForFirestore({
        telegramBotToken: settings.telegramBotToken,
        telegramChatId: settings.telegramChatId,
        updatedAt: new Date().toISOString()
      }), { merge: true }).catch(() => {});
    }

    res.json({ success: true, botUsername, message: `Bot ${botUsername} verified and test message sent successfully!`, telegramResponse: data });
  } catch (err: any) {
    console.error('Test connection error:', err);
    res.status(500).json({ error: err.message || 'Failed to verify Telegram credentials' });
  }
});

// Detect Group or Channel Chat ID from Bot Updates
apiRouter.post('/telegram/detect-chat-id', async (req, res) => {
  const bodyToken = req.body?.telegramBotToken ? cleanTelegramCredential(req.body.telegramBotToken) : '';
  const rawBotToken = bodyToken || settings.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN || '';
  const botToken = cleanTelegramCredential(rawBotToken);

  if (!botToken) {
    return res.status(400).json({ error: 'Please enter a valid Telegram Bot Token first.' });
  }

  try {
    const updatesRes = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates?limit=50`);
    const updatesText = await updatesRes.text();
    let updatesData: any = null;
    try {
      updatesData = JSON.parse(updatesText);
    } catch {
      throw new Error('Telegram API returned non-JSON response');
    }

    if (!updatesData || !updatesData.ok) {
      throw new Error(updatesData?.description || 'Failed to fetch Telegram bot updates');
    }

    const foundChats: { id: string; title: string; type: string }[] = [];
    const seenIds = new Set<string>();

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
            type: chat.type || 'group'
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

    const preferredChat = foundChats.find(c => c.type === 'supergroup' || c.type === 'group' || c.type === 'channel') || foundChats[foundChats.length - 1];

    res.json({
      success: true,
      chatId: preferredChat.id,
      chatTitle: preferredChat.title,
      chatType: preferredChat.type,
      chats: foundChats,
      message: `Found group "${preferredChat.title}" (Chat ID: ${preferredChat.id})`
    });
  } catch (err: any) {
    console.error('Detect Chat ID error:', err);
    res.status(500).json({ error: err.message || 'Failed to detect group Chat ID' });
  }
});

// IFM AI Chat Completion Proxy for Shipping Rate Calculator
apiRouter.post('/ifm/chat', async (req, res) => {
  const { messages } = req.body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  const apiKey = process.env.IFM_API_KEY || 'IFM-v1_d4sAGkIRgbpx7-PjHCqNJdpxTdjAVETb0sxzHd1DYFV7zPasHQnnS00CFePOaMsN';
  const apiUrl = 'https://api.ifm.ai/v1/chat/completions';
  const modelName = 'IFM/K2-Horizon-375B-A23B';

  // Support multi-turn by passing full history
  const payloadMessages = messages.map((m: any) => ({
    role: m.role,
    content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
  }));

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
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
  } catch (err: any) {
    console.error('IFM AI API error:', err);
    res.status(500).json({ error: err.message || 'Failed to communicate with IFM AI API' });
  }
});

// Catch-all 404 for unmatched API endpoints (returns JSON 404 instead of falling through to SPA HTML)
apiRouter.use((req, res) => {
  res.status(404).json({ error: `API endpoint not found: ${req.method} ${req.originalUrl || req.url}` });
});

// Attach API Router strictly under /api
app.use('/api', async (req, res, next) => {
  try {
    await ensureInitialSync();
  } catch (e) {
    console.error('API Warmup error:', e);
  }
  next();
}, apiRouter);

// Global Express Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true, hmr: false },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } catch (e) {
      console.warn('Vite dev server middleware omitted:', e);
    }
  } else if (!process.env.VERCEL) {
    app.use(express.static(path.join(__dirname, 'dist'), {
      setHeaders: (res, filepath) => {
        if (filepath.endsWith('index.html') || filepath.endsWith('sw.js') || filepath.endsWith('manifest.webmanifest')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
        }
      }
    }));
    app.get('*', (req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  if (!process.env.VERCEL) {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Zuboc Flow Server (v1.2.1-diag) running on http://localhost:${PORT}`);
      // Initial sync in background to avoid blocking startup
      syncFromSupabase().catch(e => console.error('Background sync error:', e));
    });
  }
}

if (!process.env.VERCEL) {
  startServer();
}

export default app;
