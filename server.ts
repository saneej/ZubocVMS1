import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import dotenv from 'dotenv';
import multer from 'multer';
import { GoogleGenAI } from '@google/genai';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, collection, getDocs } from 'firebase/firestore';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Utility to sanitize iOS smart punctuation dashes and extra whitespace
function sanitizeString(str: any): string {
  if (typeof str !== 'string') return '';
  return str
    .trim()
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-');
}

// Enable CORS for all origins and headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Configure multer for binary uploads
const upload = multer({
  limits: { fileSize: 150 * 1024 * 1024 }
});

app.use(express.json({ limit: '150mb' }));
app.use(express.urlencoded({ extended: true, limit: '150mb' }));

// Initialize Firebase App
let firebaseApp: any = null;
let firestoreDb: any = null;

try {
  const configPath = path.join(__dirname, 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    const rawConfig = fs.readFileSync(configPath, 'utf-8');
    const firebaseConfig = JSON.parse(rawConfig);
    firebaseApp = initializeApp(firebaseConfig, 'SERVER_APP');
    firestoreDb = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);
    console.log('Server initialized Firebase Firestore:', firebaseConfig.projectId);
  }
} catch (e) {
  console.error('Error initializing Firebase in server.ts:', e);
}

const DATA_FILE = path.join(__dirname, 'vms_data.json');

interface OrderRecord {
  orderId: string;
  staffId: string;
  stationId: string;
  recordingStartedAt: string;
  recordingCompletedAt?: string;
  durationSeconds: number;
  recordingStatus: 'RECORDING' | 'COMPLETED' | 'FAILED';
  uploadStatus: 'PENDING' | 'SUCCESS' | 'FAILED' | 'SKIPPED';
  telegramChatId?: string;
  telegramMessageId?: string;
  telegramFileId?: string;
  telegramMessageLink?: string;
  videoUrl?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
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

let ordersStore: Record<string, OrderRecord> = {};

try {
  if (fs.existsSync(DATA_FILE)) {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed.orders) ordersStore = parsed.orders;
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
  console.error('Error loading local vms_data.json:', e);
}

function saveLocalBackup() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ orders: ordersStore, settings }, null, 2));
  } catch (e) {
    console.error('Error saving vms_data.json:', e);
  }
}

async function syncSettingsFromFirestore() {
  if (!firestoreDb) return;
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
  } catch (e) {
    console.error('Error syncing settings from Firestore:', e);
  }
}

syncSettingsFromFirestore();

// API Routes
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    firebaseConnected: Boolean(firestoreDb),
    timestamp: new Date().toISOString()
  });
});

app.get('/api/settings', async (req, res) => {
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

app.post('/api/settings', async (req, res) => {
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
      await setDoc(doc(firestoreDb, 'settings', 'config'), {
        telegramBotToken: settings.telegramBotToken,
        telegramChatId: settings.telegramChatId,
        autoUpload: settings.autoUpload,
        stationId: settings.stationId,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (e) {
      console.error('Error saving settings to Firestore:', e);
    }
  }

  res.json({ success: true, settings: { ...settings, telegramBotTokenMasked: '***' } });
});

app.get('/api/orders', async (req, res) => {
  if (firestoreDb) {
    try {
      const colRef = collection(firestoreDb, 'orders');
      const snap = await getDocs(colRef);
      const fsOrders: OrderRecord[] = [];
      snap.forEach(d => {
        fsOrders.push(d.data() as OrderRecord);
      });
      if (fsOrders.length > 0) {
        fsOrders.forEach(o => {
          ordersStore[o.orderId] = o;
        });
        saveLocalBackup();
        return res.json(
          fsOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        );
      }
    } catch (e) {
      console.error('Error fetching orders from Firestore:', e);
    }
  }

  const orders = Object.values(ordersStore).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  res.json(orders);
});

app.get('/api/orders/:orderId', async (req, res) => {
  const orderId = sanitizeString(req.params.orderId);
  if (firestoreDb) {
    try {
      const docRef = doc(firestoreDb, 'orders', orderId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return res.json(snap.data());
      }
    } catch (e) {
      console.error('Error fetching order from Firestore:', e);
    }
  }

  const order = ordersStore[orderId];
  if (!order) {
    return res.status(404).json({ error: 'Order recording not found' });
  }
  res.json(order);
});

// Create or update order record metadata
app.post('/api/orders', async (req, res) => {
  const orderId = sanitizeString(req.body.orderId);
  const staffId = sanitizeString(req.body.staffId);
  const stationId = sanitizeString(req.body.stationId);
  const durationSeconds = Number(req.body.durationSeconds) || 0;
  const recordingStartedAt = req.body.recordingStartedAt;
  const recordingStatus = req.body.recordingStatus;
  const uploadStatus = req.body.uploadStatus;
  const videoUrl = req.body.videoUrl;
  const notes = req.body.notes;

  if (!orderId) {
    return res.status(400).json({ error: 'orderId is required' });
  }

  const now = new Date().toISOString();
  const existing = ordersStore[orderId];

  const record: OrderRecord = {
    orderId,
    staffId: staffId || 'Staff-01',
    stationId: stationId || settings.stationId || 'Packing-01',
    recordingStartedAt: recordingStartedAt || existing?.recordingStartedAt || now,
    recordingCompletedAt: now,
    durationSeconds: Number(durationSeconds) || 0,
    recordingStatus: recordingStatus || 'COMPLETED',
    uploadStatus: uploadStatus || 'PENDING',
    telegramChatId: existing?.telegramChatId,
    telegramMessageId: existing?.telegramMessageId,
    telegramFileId: existing?.telegramFileId,
    telegramMessageLink: existing?.telegramMessageLink,
    videoUrl: videoUrl || existing?.videoUrl,
    notes: notes || existing?.notes || '',
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  ordersStore[orderId] = record;
  saveLocalBackup();

  if (firestoreDb) {
    try {
      await setDoc(doc(firestoreDb, 'orders', orderId), record, { merge: true });
    } catch (e) {
      console.error('Error writing order record to Firestore:', e);
    }
  }

  res.json({ success: true, record });
});

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

// Primary Upload Route
app.post('/api/telegram/upload', (req, res, next) => {
  upload.single('video')(req, res, (err) => {
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
        staffId: staffId || 'Staff-01',
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

    const rawBotToken = settings.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN || '';
    const rawChatId = settings.telegramChatId || process.env.TELEGRAM_CHAT_ID || '';
    const botToken = cleanTelegramCredential(rawBotToken);
    const chatId = cleanTelegramCredential(rawChatId);

    if (!botToken || !chatId) {
      record.uploadStatus = 'FAILED';
      ordersStore[orderId] = record;
      saveLocalBackup();
      if (firestoreDb) {
        await setDoc(doc(firestoreDb, 'orders', orderId), record, { merge: true });
      }
      return res.status(400).json({
        error: 'Telegram Bot Token and Chat ID are not configured.',
        record
      });
    }

    let videoBuffer: Buffer | null = null;

    if (req.file && req.file.buffer) {
      videoBuffer = req.file.buffer;
    } else if (videoBase64) {
      const base64Data = videoBase64.replace(/^data:.*;base64,/, '');
      videoBuffer = Buffer.from(base64Data, 'base64');
    }

    if (!videoBuffer) {
      return res.status(400).json({ error: 'No video payload received in request' });
    }

    const formattedDate = recordingDate 
      ? new Date(recordingDate).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    const durMin = Math.floor((durationSeconds || record.durationSeconds || 0) / 60);
    const durSec = (durationSeconds || record.durationSeconds || 0) % 60;
    const durationStr = `${durMin}m ${durSec}s`;

    const safeOrderId = escapeHtml(orderId);
    const safeStaffId = escapeHtml(staffId || record.staffId);
    const safeStationId = escapeHtml(stationId || record.stationId);

    const caption = `<b>Order ID: ${safeOrderId}</b>\n<b>Staff:</b> ${safeStaffId}\n<b>Station:</b> ${safeStationId}\n<b>Recorded:</b> ${escapeHtml(formattedDate)}\n<b>Duration:</b> ${escapeHtml(durationStr)}`;

    const formData = new FormData();
    formData.append('chat_id', chatId);
    formData.append('caption', caption);
    formData.append('parse_mode', 'HTML');
    
    const videoBlob = new Blob([new Uint8Array(videoBuffer)], { type: 'video/webm' });
    formData.append('video', videoBlob, `${safeOrderId}.webm`);

    const telegramUrl = `https://api.telegram.org/bot${botToken}/sendVideo`;

    const tgResponse = await fetch(telegramUrl, {
      method: 'POST',
      body: formData
    });

    const responseText = await tgResponse.text();
    let tgResult: any;
    try {
      tgResult = JSON.parse(responseText);
    } catch {
      throw new Error(`Telegram API non-JSON response: ${responseText.substring(0, 150)}`);
    }

    if (!tgResult.ok) {
      throw new Error(tgResult.description || 'Telegram API returned error');
    }

    const messageId = tgResult.result?.message_id?.toString();
    const fileId = tgResult.result?.video?.file_id || tgResult.result?.document?.file_id;

    // Safe Telegram deep link URL construction
    let cleanChannelId = chatId;
    let numericId = cleanChannelId;
    if (numericId.startsWith('-100')) {
      numericId = numericId.substring(4);
    } else if (numericId.startsWith('-')) {
      numericId = numericId.substring(1);
    }

    let messageLink = '';
    if (cleanChannelId.startsWith('@')) {
      messageLink = `https://t.me/${cleanChannelId.substring(1)}/${messageId}`;
    } else {
      messageLink = `https://t.me/c/${numericId}/${messageId}`;
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
      await setDoc(doc(firestoreDb, 'orders', orderId), record, { merge: true });
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
        setDoc(doc(firestoreDb, 'orders', orderId), ordersStore[orderId], { merge: true }).catch(() => {});
      }
    }
    res.status(500).json({ error: error.message || 'Failed to upload video to Telegram' });
  }
});

// Telegram Webhook for commands like /video <orderId>
app.post('/api/telegram/webhook', async (req, res) => {
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

// Test Telegram connection by sending a demo message
app.post('/api/telegram/test-connection', async (req, res) => {
  const rawBotToken = settings.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN || '';
  const rawChatId = settings.telegramChatId || process.env.TELEGRAM_CHAT_ID || '';
  const botToken = cleanTelegramCredential(rawBotToken);
  const chatId = cleanTelegramCredential(rawChatId);

  if (!botToken || !chatId) {
    return res.status(400).json({ error: 'Telegram Bot Token and Chat ID not configured.' });
  }

  try {
    const text = `🟢 <b>PackVision VMS Connected Successfully!</b>\n\n<b>Station:</b> ${escapeHtml(settings.stationId)}\n<b>Timestamp:</b> ${escapeHtml(new Date().toLocaleString('en-GB'))}\n\nYour PackVision VMS packing station is online and connected to this Telegram channel. Recorded order packing evidence will be delivered here automatically.`;

    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML'
      })
    });

    const data = await response.json() as any;

    if (!data.ok) {
      throw new Error(data.description || 'Failed to send message to Telegram');
    }

    res.json({ success: true, message: 'Test message sent to Telegram channel!', telegramResponse: data });
  } catch (err: any) {
    console.error('Test connection error:', err);
    res.status(500).json({ error: err.message || 'Failed to send test message' });
  }
});

// Global Express Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PackVision VMS Server running on http://localhost:${PORT}`);
  });
}

startServer();
