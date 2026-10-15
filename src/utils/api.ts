// Safe API helper with automatic client-side fallback when backend Express API is unreachable or returns 404/500
import { db } from '../firebase';
import { collection, getDocs, doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';

export function getApiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : '/' + path;
  if (typeof window !== 'undefined' && window.location && window.location.origin && window.location.origin !== 'null') {
    return `${window.location.origin}${cleanPath}`;
  }
  return cleanPath;
}

export async function safeFetchJson(path: string, options: RequestInit = {}): Promise<any> {
  const url = getApiUrl(path);
  let response: Response | null = null;
  let rawText = '';

  try {
    response = await fetch(url, {
      ...options,
      headers: {
        'Accept': 'application/json',
        ...(options.headers || {})
      }
    });
    rawText = await response.text();
  } catch (netErr) {
    // Network error -> trigger client fallback
    response = null;
  }

  let data: any = null;
  let isJson = false;
  if (response && response.ok && rawText) {
    try {
      data = JSON.parse(rawText);
      isJson = true;
    } catch {
      isJson = false;
    }
  }

  // If response failed (not ok) or network error or non-json HTML response, fallback to client-side handler
  if (!response || !response.ok || !isJson) {
    try {
      const fallbackResult = await handleClientApiFallback(path, options);
      if (fallbackResult !== undefined) {
        return fallbackResult;
      }
    } catch (fallbackErr: any) {
      console.warn('Client API fallback error:', fallbackErr);
      throw fallbackErr;
    }

    // If fallback didn't handle or also failed, throw helpful error
    if (response && !response.ok) {
      if (data && data.error) {
        throw new Error(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
      }
      throw new Error(rawText ? rawText.slice(0, 150) : `HTTP ${response.status} ${response.statusText}`);
    }
    throw new Error(rawText ? rawText.slice(0, 150) : `API request failed for ${path}`);
  }

  return data;
}

async function handleClientApiFallback(path: string, options: RequestInit): Promise<any> {
  const cleanPath = path.split('?')[0];
  const method = (options.method || 'GET').toUpperCase();
  let body: any = {};
  if (options.body) {
    try {
      if (typeof options.body === 'string') {
        body = JSON.parse(options.body);
      }
    } catch {}
  }

  // 1. Health check
  if (cleanPath.endsWith('/health') || cleanPath === '/') {
    return {
      status: 'ok',
      service: 'Zuboc VMS Client Fallback API',
      firebaseConnected: Boolean(db),
      timestamp: new Date().toISOString()
    };
  }

  // 2. Settings GET / POST
  if (cleanPath.endsWith('/settings')) {
    if (method === 'GET') {
      let settings = {
        telegramBotToken: localStorage.getItem('zuboc_telegram_token') || '8372063656:AAGc8APzAoq1LH14p5POdBm19qnv-5286gE',
        telegramChatId: localStorage.getItem('zuboc_telegram_chatid') || '-1003940299676',
        autoUpload: localStorage.getItem('zuboc_auto_upload') !== 'false',
        stationId: localStorage.getItem('zuboc_station_id') || 'Packing-01'
      };
      if (db) {
        try {
          const snap = await getDoc(doc(db, 'settings', 'config'));
          if (snap.exists()) {
            const fsData = snap.data();
            settings = { ...settings, ...fsData };
          }
        } catch {}
      }
      const maskedToken = settings.telegramBotToken
        ? settings.telegramBotToken.substring(0, 6) + '...' + settings.telegramBotToken.slice(-4)
        : '';
      return {
        ...settings,
        telegramBotTokenMasked: maskedToken,
        hasToken: Boolean(settings.telegramBotToken),
        firebaseConnected: Boolean(db)
      };
    } else if (method === 'POST') {
      const { telegramBotToken, telegramChatId, autoUpload, stationId } = body;
      if (telegramBotToken !== undefined && !telegramBotToken.includes('...')) {
        localStorage.setItem('zuboc_telegram_token', telegramBotToken);
      }
      if (telegramChatId !== undefined) {
        localStorage.setItem('zuboc_telegram_chatid', telegramChatId);
      }
      if (autoUpload !== undefined) {
        localStorage.setItem('zuboc_auto_upload', String(autoUpload));
      }
      if (stationId !== undefined) {
        localStorage.setItem('zuboc_station_id', stationId);
      }

      const updated = {
        telegramBotToken: localStorage.getItem('zuboc_telegram_token'),
        telegramChatId: localStorage.getItem('zuboc_telegram_chatid'),
        autoUpload: localStorage.getItem('zuboc_auto_upload') !== 'false',
        stationId: localStorage.getItem('zuboc_station_id')
      };

      if (db) {
        try {
          await setDoc(doc(db, 'settings', 'config'), { ...updated, updatedAt: new Date().toISOString() }, { merge: true });
        } catch {}
      }
      return { success: true, settings: { ...updated, telegramBotTokenMasked: '***' } };
    }
  }

  // 3. Orders GET / POST / DELETE
  if (cleanPath.includes('/orders')) {
    if (method === 'GET') {
      let orders: any[] = [];
      const localOrders = localStorage.getItem('zuboc_orders_store');
      if (localOrders) {
        try { orders = JSON.parse(localOrders); } catch {}
      }
      if (db) {
        try {
          const snap = await getDocs(collection(db, 'orders'));
          const fsOrders: any[] = [];
          snap.forEach(d => fsOrders.push(d.data()));
          if (fsOrders.length > 0) {
            orders = fsOrders;
            localStorage.setItem('zuboc_orders_store', JSON.stringify(orders));
          }
        } catch {}
      }
      return orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else if (method === 'POST') {
      const orderId = body.orderId || `ORD-${Date.now()}`;
      const now = new Date().toISOString();
      let orders: any[] = [];
      const localOrders = localStorage.getItem('zuboc_orders_store');
      if (localOrders) {
        try { orders = JSON.parse(localOrders); } catch {}
      }
      const existingIdx = orders.findIndex((o: any) => o.orderId === orderId);
      const record = {
        orderId,
        staffId: body.staffId || 'Staff-01',
        stationId: body.stationId || localStorage.getItem('zuboc_station_id') || 'Packing-01',
        recordingStartedAt: body.recordingStartedAt || now,
        recordingCompletedAt: now,
        durationSeconds: Number(body.durationSeconds) || 0,
        recordingStatus: body.recordingStatus || 'COMPLETED',
        uploadStatus: body.uploadStatus || 'PENDING',
        videoUrl: body.videoUrl || '',
        notes: body.notes || '',
        createdAt: existingIdx >= 0 ? orders[existingIdx].createdAt : now,
        updatedAt: now
      };
      if (existingIdx >= 0) {
        orders[existingIdx] = { ...orders[existingIdx], ...record };
      } else {
        orders.unshift(record);
      }
      localStorage.setItem('zuboc_orders_store', JSON.stringify(orders));
      if (db) {
        try {
          await setDoc(doc(db, 'orders', orderId), record, { merge: true });
        } catch {}
      }
      return { success: true, record };
    } else if (method === 'DELETE') {
      const parts = cleanPath.split('/');
      const orderId = parts[parts.length - 1];
      let orders: any[] = [];
      const localOrders = localStorage.getItem('zuboc_orders_store');
      if (localOrders) {
        try { orders = JSON.parse(localOrders); } catch {}
      }
      orders = orders.filter((o: any) => o.orderId !== orderId);
      localStorage.setItem('zuboc_orders_store', JSON.stringify(orders));
      if (db) {
        try {
          await deleteDoc(doc(db, 'orders', orderId));
        } catch {}
      }
      return { success: true, message: `Order ${orderId} deleted` };
    }
  }

  // 4. Telegram Test Connection
  if (cleanPath.endsWith('/telegram/test-connection')) {
    const token = body.telegramBotToken || localStorage.getItem('zuboc_telegram_token');
    const chatId = body.telegramChatId || localStorage.getItem('zuboc_telegram_chatid');
    if (!token || !chatId) {
      throw new Error('Telegram Bot Token and Chat ID not configured.');
    }
    const cleanToken = token.trim().replace(/^["']|["']$/g, '');
    const cleanChatId = chatId.trim().replace(/^["']|["']$/g, '');

    const meRes = await fetch(`https://api.telegram.org/bot${cleanToken}/getMe`);
    const meText = await meRes.text();
    let meData: any;
    try {
      meData = JSON.parse(meText);
    } catch {
      throw new Error(`Telegram API non-JSON response: ${meText.slice(0, 100)}`);
    }
    if (!meData.ok) {
      throw new Error(meData.description || 'Invalid Telegram Bot Token');
    }
    const botUsername = meData.result?.username ? `@${meData.result.username}` : 'Bot';

    const msgRes = await fetch(`https://api.telegram.org/bot${cleanToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: cleanChatId,
        text: `🟢 <b>Zuboc VMS (${botUsername}) Connected!</b>\n\nStation online and verified.`,
        parse_mode: 'HTML'
      })
    });
    const msgText = await msgRes.text();
    let msgData: any;
    try {
      msgData = JSON.parse(msgText);
    } catch {
      throw new Error(`Telegram API non-JSON response: ${msgText.slice(0, 100)}`);
    }
    if (!msgData.ok) {
      throw new Error(msgData.description || 'Failed to send test message to Telegram chat ID');
    }

    localStorage.setItem('zuboc_telegram_token', cleanToken);
    localStorage.setItem('zuboc_telegram_chatid', cleanChatId);
    if (db) {
      try {
        await setDoc(doc(db, 'settings', 'config'), { telegramBotToken: cleanToken, telegramChatId: cleanChatId }, { merge: true });
      } catch {}
    }
    return { success: true, botUsername, message: `Bot ${botUsername} verified and test message sent successfully!` };
  }

  // 5. Telegram Upload
  if (cleanPath.endsWith('/telegram/upload')) {
    const orderId = body.orderId;
    const token = localStorage.getItem('zuboc_telegram_token');
    const chatId = localStorage.getItem('zuboc_telegram_chatid');
    if (!token || !chatId) {
      throw new Error('Telegram Bot Token and Chat ID are not configured.');
    }
    const videoBase64 = body.videoBase64;
    if (!videoBase64) {
      throw new Error('No video data received for upload');
    }

    const base64Data = videoBase64.replace(/^data:.*;base64,/, '');
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'video/mp4' });

    const formData = new FormData();
    formData.append('chat_id', chatId.trim().replace(/^["']|["']$/g, ''));
    formData.append('caption', `📦 Order ID: ${orderId}\nStation: ${localStorage.getItem('zuboc_station_id') || 'Packing-01'}`);
    formData.append('parse_mode', 'HTML');
    formData.append('video', blob, `${orderId}.mp4`);

    const tgRes = await fetch(`https://api.telegram.org/bot${token.trim().replace(/^["']|["']$/g, '')}/sendVideo`, {
      method: 'POST',
      body: formData
    });
    const tgData = await tgRes.json();
    if (!tgData.ok) {
      throw new Error(tgData.description || 'Telegram video upload failed');
    }

    const messageId = tgData.result?.message_id?.toString();
    const fileId = tgData.result?.video?.file_id;
    let numericId = chatId.trim();
    if (numericId.startsWith('-100')) numericId = numericId.substring(4);
    else if (numericId.startsWith('-')) numericId = numericId.substring(1);
    const messageLink = chatId.startsWith('@') 
      ? `https://t.me/${chatId.substring(1)}/${messageId}` 
      : `https://t.me/c/${numericId}/${messageId}`;

    let orders: any[] = [];
    const localOrders = localStorage.getItem('zuboc_orders_store');
    if (localOrders) {
      try { orders = JSON.parse(localOrders); } catch {}
    }
    let record = orders.find((o: any) => o.orderId === orderId);
    if (!record) {
      record = { orderId, createdAt: new Date().toISOString() };
      orders.unshift(record);
    }
    record.uploadStatus = 'SUCCESS';
    record.telegramChatId = chatId;
    record.telegramMessageId = messageId;
    record.telegramFileId = fileId;
    record.telegramMessageLink = messageLink;
    record.updatedAt = new Date().toISOString();

    localStorage.setItem('zuboc_orders_store', JSON.stringify(orders));
    if (db) {
      try {
        await setDoc(doc(db, 'orders', orderId), record, { merge: true });
      } catch {}
    }

    return { success: true, record, telegramResponse: tgData };
  }

  return undefined;
}
