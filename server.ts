import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import dotenv from 'dotenv';
import multer from 'multer';
import ffmpegPath from 'ffmpeg-static';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, deleteDoc } from 'firebase/firestore';

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

    const bin = ffmpegPath || 'ffmpeg';
    const cleanOrderId = orderId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const istTime = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' IST';
    const escapedTime = istTime.replace(/:/g, '\\:');

    // Minimal and Neat Style: Single line, bottom-right, white with black shadow
    const watermarkText = `Order ID\\: ${cleanOrderId} | ${escapedTime}`;
    const filter = `scale='min(1280,iw)':-2:flags=lanczos,drawtext=text='${watermarkText}':x=w-tw-20:y=h-th-20:fontcolor=white:fontsize=16:shadowcolor=black@0.7:shadowx=2:shadowy=2`;

    try {
      // Primary attempt with watermark
      const cmd = `"${bin}" -fflags +genpts -i "${inputPath}" -c:v libx264 -preset veryfast -crf 28 -maxrate 1000k -bufsize 2000k -pix_fmt yuv420p -vf "${filter}" -c:a aac -b:a 64k -movflags +faststart "${outputPath}" -y`;
      await execPromise(cmd, { timeout: 300000 });
    } catch (e: any) {
      console.warn('Watermarked transcoding failed, falling back to clean transcode:', e?.message);
      // Absolute fallback: No watermark
      const fallbackCmd = `"${bin}" -fflags +genpts -i "${inputPath}" -c:v libx264 -preset veryfast -crf 30 -vf "scale='min(1280,iw)':-2" -c:a aac -b:a 64k -movflags +faststart "${outputPath}" -y`;
      await execPromise(fallbackCmd, { timeout: 300000 });
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
  notes?: string;
  auditLogs?: { timestamp: string; staffId: string; action: string; details: string; type: 'EDIT_LOG' | 'CHANGE_LOG' | 'USER_LOG' }[];
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

interface StaffMember {
  id: string;
  name: string;
  role: 'ADMIN' | 'SUPERVISOR' | 'PACKER';
  stationId: string;
  password?: string;
  email?: string;
  createdAt?: string;
}

const DEFAULT_STAFFS: StaffMember[] = [
  { id: 'Admin-01', name: 'David Admin', role: 'ADMIN', stationId: 'Packing-HQ', password: 'password123', createdAt: new Date().toISOString() },
];

let staffsStore: Record<string, StaffMember> = {
  'Admin-01': DEFAULT_STAFFS[0],
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
  console.error('Error loading local vms_data.json:', e);
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

async function syncStaffsFromFirestore() {
  if (!firestoreDb || firestoreQuotaExceeded) return;
  try {
    const colRef = collection(firestoreDb, 'staffs');
    const snap = await getDocs(colRef);
    if (!snap.empty) {
      snap.forEach(d => {
        staffsStore[d.id] = d.data() as StaffMember;
      });
      saveLocalBackup();
    } else {
      // Seed default staffs into Firestore
      for (const s of DEFAULT_STAFFS) {
        await setDoc(doc(firestoreDb, 'staffs', s.id), cleanForFirestore(s), { merge: true });
      }
    }
  } catch (e: any) {
    if (e?.message?.includes('Quota') || e?.message?.includes('quota')) {
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

  res.json({ success: true, settings: { ...settings, telegramBotTokenMasked: '***' } });
});

// Staffs GET
apiRouter.get('/staffs', async (req, res) => {
  await syncStaffsFromFirestore();
  const staffList = Object.values(staffsStore).map(s => ({
    id: s.id,
    name: s.name,
    role: s.role,
    stationId: s.stationId,
    email: s.email,
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

  res.json({ success: true, message: `Password for ${staffsStore[staffKey].name} has been reset successfully!` });
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

// Orders GET
apiRouter.get('/orders', async (req, res) => {
  if (firestoreDb && !firestoreQuotaExceeded) {
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
    } catch (e: any) {
      if (e?.message?.includes('Quota') || e?.message?.includes('quota')) {
        firestoreQuotaExceeded = true;
      } else {
        console.error('Error fetching orders from Firestore:', e);
      }
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

  const now = new Date().toISOString();
  const existing = ordersStore[orderId];

  const record: OrderRecord = {
    orderId,
    staffId: staffId || 'Staff-01',
    stationId: stationId || settings.stationId || 'Packing-01',
    recordingStartedAt: recordingStartedAt || existing?.recordingStartedAt || now,
    recordingCompletedAt: now,
    durationSeconds: Number(durationSeconds) || 0,
    recordingStatus: recordingStatus || existing?.recordingStatus || 'COMPLETED',
    uploadStatus: uploadStatus || existing?.uploadStatus || 'PENDING',
    telegramChatId: existing?.telegramChatId || '',
    telegramMessageId: existing?.telegramMessageId || '',
    telegramFileId: existing?.telegramFileId || '',
    telegramMessageLink: existing?.telegramMessageLink || '',
    videoUrl: videoUrl || existing?.videoUrl || '',
    awbNumber: awbNumber || existing?.awbNumber || '',
    courier: courier || existing?.courier || '',
    deliveryMethod: req.body.deliveryMethod || existing?.deliveryMethod || 'Normal',
    weight: weight || existing?.weight || '',
    productSku: productSku || existing?.productSku || '',
    customerName: customerName || existing?.customerName || '',
    contactPerson: sanitizeString(req.body.contactPerson) || existing?.contactPerson || '',
    contactPhone: sanitizeString(req.body.contactPhone) || existing?.contactPhone || '',
    orderReceivedDate: req.body.orderReceivedDate || existing?.orderReceivedDate || '',
    dispatchDate: req.body.dispatchDate || existing?.dispatchDate || '',
    orderAmount: sanitizeString(req.body.orderAmount) || existing?.orderAmount || '',
    shippingAmount: sanitizeString(req.body.shippingAmount) || existing?.shippingAmount || '',
    orderTotal: sanitizeString(req.body.orderTotal) || existing?.orderTotal || '',
    deliveredDate: req.body.deliveredDate || existing?.deliveredDate || '',
    itemCount: itemCount || existing?.itemCount || '',
    notes: notes || existing?.notes || '',
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  ordersStore[orderId] = record;
  saveLocalBackup();

  if (firestoreDb) {
    try {
      await setDoc(doc(firestoreDb, 'orders', orderId), cleanForFirestore(record), { merge: true });
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

    // 1. Upload Video if present
    if (videoBuffer) {
      const durMin = Math.floor((durationSeconds || record.durationSeconds || 0) / 60);
      const durSec = (durationSeconds || record.durationSeconds || 0) % 60;
      const durationStr = `${durMin}m ${durSec}s`;

      const captionLines = [
        `<b>🎥 Packing Video • Order ID: ${safeOrderId}</b>`,
        record.awbNumber ? `<b>🚚 AWB:</b> ${escapeHtml(record.awbNumber)}` : '',
        record.courier ? `<b>🏢 Courier:</b> ${escapeHtml(record.courier)}` : '',
        record.deliveryMethod ? `<b>🚀 Delivery Method:</b> ${escapeHtml(record.deliveryMethod)}` : '',
        record.weight ? `<b>⚖️ Weight:</b> ${escapeHtml(record.weight)}` : '',
        record.productSku ? `<b>🏷️ SKU / Item:</b> ${escapeHtml(record.productSku)}` : '',
        `<b>👷 Staff:</b> ${safeStaffId} • <b>Station:</b> ${safeStationId}`,
        `<b>📅 Recorded:</b> ${escapeHtml(formattedDate)} (IST) • <b>⏱️ Duration:</b> ${escapeHtml(durationStr)}`
      ].filter(Boolean);

      const caption = captionLines.join('\n');

      // Transcode video using FFmpeg to faststart H.264 baseline MP4 + generate thumbnail
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
      
      const videoBlob = new Blob([new Uint8Array(mp4Buffer)], { type: 'video/mp4' });
      formData.append('video', videoBlob, `${safeOrderId}.mp4`);

      // Add thumbnail if generated or if photo attached
      if (thumbBuffer && thumbBuffer.length > 0) {
        const thumbBlob = new Blob([new Uint8Array(thumbBuffer)], { type: 'image/jpeg' });
        formData.append('thumb', thumbBlob, `${safeOrderId}_thumb.jpg`);
      } else if (photoBuffers[0] && photoBuffers[0].length > 0) {
        const thumbBlob = new Blob([new Uint8Array(photoBuffers[0])], { type: 'image/jpeg' });
        formData.append('thumb', thumbBlob, `${safeOrderId}_thumb.jpg`);
      }

      const tgResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendVideo`, {
        method: 'POST',
        body: formData
      });

      const responseText = await tgResponse.text();
      try {
        tgResult = JSON.parse(responseText);
      } catch {
        throw new Error(`Telegram API non-JSON response: ${responseText.substring(0, 150)}`);
      }

      if (!tgResult.ok) {
        throw new Error(tgResult.description || 'Telegram Video upload error');
      }

      if (!messageId) {
        messageId = tgResult.result?.message_id?.toString();
      }
      fileId = tgResult.result?.video?.file_id || tgResult.result?.document?.file_id;
    }

    // 2. Upload Photos if present (threaded as replies under video/header message)
    if (photoBuffers.length > 0) {
      for (let i = 0; i < photoBuffers.length; i++) {
        const pBuf = photoBuffers[i];
        const photoCaptionLines = [
          videoBuffer
            ? `<b>📷 Photo Snapshot #${i + 1} • Order ID: ${safeOrderId}</b>`
            : `<b>📷 Photo Evidence #${i + 1} • Order ID: ${safeOrderId}</b>`,
          record.awbNumber ? `<b>AWB:</b> ${escapeHtml(record.awbNumber)}` : '',
          record.courier ? `<b>Courier:</b> ${escapeHtml(record.courier)}` : '',
          record.deliveryMethod ? `<b>Delivery:</b> ${escapeHtml(record.deliveryMethod)}` : '',
          record.weight ? `<b>Weight:</b> ${escapeHtml(record.weight)}` : '',
          record.productSku ? `<b>Item:</b> ${escapeHtml(record.productSku)}` : '',
          `<b>Staff:</b> ${safeStaffId} • <b>Station:</b> ${safeStationId}`,
          `<b>Captured:</b> ${escapeHtml(formattedDate)} (IST)`,
          record.notes ? `<b>Notes:</b> ${escapeHtml(record.notes)}` : ''
        ].filter(Boolean);
        const photoCaption = photoCaptionLines.join('\n');
        const photoFormData = new FormData();
        photoFormData.append('chat_id', chatId);
        photoFormData.append('caption', photoCaption);
        photoFormData.append('parse_mode', 'HTML');
        if (messageId) {
          photoFormData.append('reply_to_message_id', messageId);
          photoFormData.append('allow_sending_without_reply', 'true');
          photoFormData.append('reply_parameters', JSON.stringify({ message_id: Number(messageId), allow_sending_without_reply: true }));
        }
        const photoBlob = new Blob([new Uint8Array(pBuf)], { type: 'image/jpeg' });
        photoFormData.append('photo', photoBlob, `${safeOrderId}_${i + 1}.jpg`);
        try {
          const photoTgResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
            method: 'POST',
            body: photoFormData
          });
          const photoResponseText = await photoTgResponse.text();
          const photoTgResult = JSON.parse(photoResponseText);
          if (!messageId && photoTgResult && photoTgResult.ok) {
            messageId = photoTgResult.result?.message_id?.toString();
            fileId = photoTgResult.result?.photo?.[photoTgResult.result.photo.length - 1]?.file_id;
            tgResult = photoTgResult;
          }
        } catch (e) {
          console.error(`Failed to send photo #${i + 1} to Telegram:`, e);
        }
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
    if (['awbNumber', 'courier', 'weight', 'productSku', 'customerName', 'contactPerson', 'contactPhone', 'orderReceivedDate', 'dispatchDate', 'orderAmount', 'shippingAmount', 'orderTotal', 'deliveredDate', 'itemCount', 'notes'].includes(key)) {
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
      record.notes ? `<b>📝 Notes:</b> ${escapeHtml(record.notes)}` : '',
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
