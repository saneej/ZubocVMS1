import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, collection, getDocs } from 'firebase/firestore';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

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
    console.log('Server successfully initialized Firebase Firestore:', firebaseConfig.projectId);
  }
} catch (e) {
  console.error('Error initializing Firebase in server.ts:', e);
}

// Local file fallback backup
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

// Load existing local data backup
try {
  if (fs.existsSync(DATA_FILE)) {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed.orders) ordersStore = parsed.orders;
    if (parsed.settings) settings = { ...settings, ...parsed.settings };
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

// Load settings from Firestore on server startup
async function syncSettingsFromFirestore() {
  if (!firestoreDb) return;
  try {
    const docRef = doc(firestoreDb, 'settings', 'config');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data() as AppSettings;
      if (data.telegramBotToken) settings.telegramBotToken = data.telegramBotToken;
      if (data.telegramChatId) settings.telegramChatId = data.telegramChatId;
      if (data.stationId) settings.stationId = data.stationId;
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
    if (!telegramBotToken.includes('...')) {
      settings.telegramBotToken = telegramBotToken;
    }
  }
  if (telegramChatId !== undefined) settings.telegramChatId = telegramChatId;
  if (autoUpload !== undefined) settings.autoUpload = Boolean(autoUpload);
  if (stationId !== undefined) settings.stationId = stationId;

  saveLocalBackup();

  // Save to Firestore
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
  // Fetch from Firestore if available
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
  const { orderId } = req.params;
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

// Create or update order record in Firestore & local backup
app.post('/api/orders', async (req, res) => {
  const { orderId, staffId, stationId, recordingStartedAt, durationSeconds, recordingStatus, uploadStatus, videoUrl, notes } = req.body;
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
    durationSeconds: durationSeconds || 0,
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

// Upload video to Telegram & store reference in Firebase
app.post('/api/telegram/upload', async (req, res) => {
  const { orderId, videoBase64, staffId, stationId, durationSeconds, recordingDate } = req.body;

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
      durationSeconds: durationSeconds || 0,
      recordingStatus: 'COMPLETED',
      uploadStatus: 'PENDING',
      createdAt: now,
      updatedAt: now
    };
  }

  const botToken = settings.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = settings.telegramChatId || process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    record.uploadStatus = 'FAILED';
    ordersStore[orderId] = record;
    saveLocalBackup();
    if (firestoreDb) {
      await setDoc(doc(firestoreDb, 'orders', orderId), record, { merge: true });
    }
    return res.status(400).json({
      error: 'Telegram Bot Token and Chat ID are not configured. Please enter them in Settings.',
      record
    });
  }

  try {
    let videoBuffer: Buffer;
    if (videoBase64) {
      const base64Data = videoBase64.replace(/^data:.*;base64,/, '');
      videoBuffer = Buffer.from(base64Data, 'base64');
    } else {
      return res.status(400).json({ error: 'No video data provided for upload' });
    }

    const formattedDate = recordingDate 
      ? new Date(recordingDate).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    const durMin = Math.floor((durationSeconds || record.durationSeconds || 0) / 60);
    const durSec = (durationSeconds || record.durationSeconds || 0) % 60;
    const durationStr = `${durMin}m ${durSec}s`;

    const caption = `<b>Order ID: ${orderId}</b>\n<b>Staff:</b> ${staffId || record.staffId}\n<b>Station:</b> ${stationId || record.stationId}\n<b>Recorded:</b> ${formattedDate}\n<b>Duration:</b> ${durationStr}`;

    const boundary = '----TelegramFormBoundary' + Math.random().toString(36).substring(2);
    let bodyBuffers: Buffer[] = [];
    
    bodyBuffers.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n`));
    bodyBuffers.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`));
    bodyBuffers.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="parse_mode"\r\n\r\nHTML\r\n`));
    bodyBuffers.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="video"; filename="${orderId}.webm"\r\nContent-Type: video/webm\r\n\r\n`));
    bodyBuffers.push(videoBuffer);
    bodyBuffers.push(Buffer.from(`\r\n--${boundary}--\r\n`));

    const multipartBody = Buffer.concat(bodyBuffers);
    const telegramUrl = `https://api.telegram.org/bot${botToken}/sendVideo`;

    const tgResponse = await fetch(telegramUrl, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body: multipartBody
    });

    const tgResult = await tgResponse.json() as any;

    if (!tgResult.ok) {
      throw new Error(tgResult.description || 'Telegram API returned error');
    }

    const messageId = tgResult.result?.message_id?.toString();
    const fileId = tgResult.result?.video?.file_id || tgResult.result?.document?.file_id;

    let messageLink = '';
    if (chatId.startsWith('@')) {
      messageLink = `https://t.me/${chatId.substring(1)}/${messageId}`;
    } else {
      const cleanChatId = chatId.startsWith('-100') ? chatId.substring(4) : chatId.replace(/^-/, '');
      messageLink = `https://t.me/c/${cleanChatId}/${messageId}`;
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
    record.uploadStatus = 'FAILED';
    record.updatedAt = new Date().toISOString();
    ordersStore[orderId] = record;
    saveLocalBackup();

    if (firestoreDb) {
      await setDoc(doc(firestoreDb, 'orders', orderId), record, { merge: true });
    }

    res.status(500).json({ error: error.message || 'Failed to upload video to Telegram', record });
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
      const queryOrderId = parts[1]?.trim();

      const botToken = settings.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN;

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

      // Find order in local store or Firestore
      let foundRecord = ordersStore[queryOrderId];
      if (!foundRecord && firestoreDb) {
        const snap = await getDoc(doc(firestoreDb, 'orders', queryOrderId));
        if (snap.exists()) {
          foundRecord = snap.data() as OrderRecord;
        }
      }

      if (botToken) {
        if (foundRecord) {
          const replyText = `📦 <b>Order ID: ${foundRecord.orderId}</b>\n\n<b>Staff:</b> ${foundRecord.staffId}\n<b>Station:</b> ${foundRecord.stationId}\n<b>Status:</b> ${foundRecord.uploadStatus}\n<b>Duration:</b> ${foundRecord.durationSeconds}s\n<b>Recorded:</b> ${new Date(foundRecord.createdAt).toLocaleString()}\n\n🔗 <a href="${foundRecord.telegramMessageLink || '#'}">View Original Telegram Video Message</a>`;
          
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
              text: `❌ No packing video found for Order ID: <code>${queryOrderId}</code>`,
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

// Gemini AI Assistant for packing verification
app.post('/api/ai/verify-packing', async (req, res) => {
  try {
    const { orderId, imageBase64, itemsList } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.json({
        success: true,
        aiAnalysis: "AI API Key not configured. Packing recorded successfully. Order ID: " + orderId
      });
    }

    const ai = new GoogleGenAI({ apiKey });
    
    let contents: any[] = [
      {
        text: `Analyze this packing station snapshot for order ID "${orderId}". Check if items appear properly packed and sealed.`
      }
    ];

    if (imageBase64) {
      const base64Data = imageBase64.replace(/^data:.*;base64,/, '');
      contents.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: base64Data
        }
      });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: contents,
    });

    res.json({ success: true, aiAnalysis: response.text });
  } catch (error: any) {
    console.error('Gemini AI error:', error);
    res.status(500).json({ error: error.message || 'AI analysis failed' });
  }
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
