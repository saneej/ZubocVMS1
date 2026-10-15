import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import dotenv from 'dotenv';
import multer from 'multer';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, deleteDoc } from 'firebase/firestore';

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
  limits: { fileSize: 2000 * 1024 * 1024 } // 2 GB limit
});

app.use(express.json({ limit: '2gb' }));
app.use(express.urlencoded({ extended: true, limit: '2gb' }));

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

  if (firebaseConfig) {
    if (getApps().some(a => a.name === 'SERVER_APP')) {
      firebaseApp = getApp('SERVER_APP');
    } else {
      firebaseApp = initializeApp(firebaseConfig, 'SERVER_APP');
    }
    const dbId = firebaseConfig.firestoreDatabaseId || process.env.FIREBASE_FIRESTORE_DATABASE_ID || process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || '(default)';
    firestoreDb = getFirestore(firebaseApp, dbId);
    console.log('Server initialized Firebase Firestore:', firebaseConfig.projectId, 'Database:', dbId);
  } else {
    console.warn('No Firebase configuration found on server.');
  }
} catch (e) {
  console.error('Error initializing Firebase in server.ts:', e);
}

const DATA_FILE = path.join(__dirname, 'vms_data.json');
const TMP_DATA_FILE = '/tmp/vms_data.json';

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
  let activeDataPath = DATA_FILE;
  if (!fs.existsSync(activeDataPath)) {
    activeDataPath = TMP_DATA_FILE;
  }
  if (fs.existsSync(activeDataPath)) {
    const raw = fs.readFileSync(activeDataPath, 'utf-8');
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
  const payload = JSON.stringify({ orders: ordersStore, settings }, null, 2);
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

syncSettingsFromFirestore();

// API Router supporting both /api/... and direct serverless paths
const apiRouter = express.Router();

// Base / Root endpoint
apiRouter.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Zuboc VMS API',
    firebaseConnected: Boolean(firestoreDb),
    timestamp: new Date().toISOString()
  });
});

// Health check
apiRouter.get('/health', (req, res) => {
  res.json({
    status: 'ok',
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

// Orders GET
apiRouter.get('/orders', async (req, res) => {
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

// Orders GET by ID
apiRouter.get('/orders/:orderId', async (req, res) => {
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
apiRouter.post('/orders', async (req, res) => {
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

// Delete order record
apiRouter.delete('/orders/:orderId', async (req, res) => {
  const orderId = sanitizeString(req.params.orderId);
  if (!orderId) {
    return res.status(400).json({ error: 'orderId is required' });
  }

  delete ordersStore[orderId];
  saveLocalBackup();

  if (firestoreDb) {
    try {
      await deleteDoc(doc(firestoreDb, 'orders', orderId));
    } catch (e) {
      console.error('Error deleting order from Firestore:', e);
    }
  }

  res.json({ success: true, message: `Order ${orderId} deleted successfully` });
});

// Telegram Primary Upload Route
apiRouter.post('/telegram/upload', (req, res, next) => {
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
    
    const videoBlob = new Blob([new Uint8Array(videoBuffer)], { type: 'video/mp4' });
    formData.append('video', videoBlob, `${safeOrderId}.mp4`);

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

    const text = `🟢 <b>Zuboc VMS (${escapeHtml(botUsername)}) Connected!</b>\n\n<b>Station:</b> ${escapeHtml(settings.stationId)}\n<b>Timestamp:</b> ${escapeHtml(new Date().toLocaleString('en-GB'))}\n\nYour Zuboc VMS packing station is online and verified. Recorded order packing evidence will be delivered here automatically.`;

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
      setDoc(doc(firestoreDb, 'settings', 'config'), {
        telegramBotToken: settings.telegramBotToken,
        telegramChatId: settings.telegramChatId,
        updatedAt: new Date().toISOString()
      }, { merge: true }).catch(() => {});
    }

    res.json({ success: true, botUsername, message: `Bot ${botUsername} verified and test message sent successfully!`, telegramResponse: data });
  } catch (err: any) {
    console.error('Test connection error:', err);
    res.status(500).json({ error: err.message || 'Failed to verify Telegram credentials' });
  }
});

// Attach API Router under /api only
app.use('/api', apiRouter);

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
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  if (!process.env.VERCEL) {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Zuboc VMS Server running on http://localhost:${PORT}`);
    });
  }
}

if (!process.env.VERCEL) {
  startServer();
}

export default app;
