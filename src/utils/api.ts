// Safe API helper with automatic client-side fallback when backend Express API is unreachable or returns 404/500
import { db } from '../firebase';
import { collection, getDocs, doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { cleanForFirestore } from './firestoreHelper';

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
      console.warn('Client API fallback warning:', fallbackErr);
      const msg = fallbackErr?.message || String(fallbackErr);
      if (msg.startsWith('Unexpected token') || msg.includes('is not valid JSON')) {
        throw new Error('Server connection or gateway error. Direct Telegram protocol active.');
      }
      throw new Error(msg);
    }

    // If fallback didn't handle or also failed, throw helpful error without JSON syntax exceptions
    if (response && !response.ok) {
      if (data && data.error) {
        throw new Error(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
      }
      if (rawText.includes('A server error') || rawText.startsWith('<!DOCTYPE') || rawText.startsWith('<html')) {
        throw new Error(`Server endpoint temporarily unavailable (HTTP ${response.status}). Details: ${rawText.slice(0, 500)}`);
      }
      throw new Error(rawText ? rawText.slice(0, 500) : `HTTP ${response.status} ${response.statusText}`);
    }
    throw new Error(`API request failed for ${path}`);
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
      service: 'Zuboc Flow Client Fallback API',
      firebaseConnected: Boolean(db),
      timestamp: new Date().toISOString()
    };
  }

  // Supabase Status Fallback
  if (cleanPath.includes('/supabase/status')) {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const client = createClient('https://bdfgscjiuqccoidkeaqh.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkZmdzY2ppdXFjY29pZGtlYXFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0MDc0ODgsImV4cCI6MjEwNzk4MzQ4OH0.CP8Cb8ZYRdvtV4Cs4PEe6XnA9S3rrv3O6LLbnTh2T2U', {
        auth: { persistSession: false, autoRefreshToken: false }
      });
      const { data, error } = await client.from('orders').select('orderId').limit(1);
      if (error) {
        return { connected: false, tableExists: false, message: error.message };
      }
      return { connected: true, tableExists: true, sampleCount: data ? data.length : 0 };
    } catch (e: any) {
      return { connected: false, tableExists: false, error: e?.message };
    }
  }

  // Auth Verify PIN / Access Code / Login Fallback
  if (cleanPath.includes('/auth/verify-pin') || cleanPath.includes('/auth/access-code') || cleanPath.includes('/auth/login')) {
    const rawCode = body.accessCode || body.code || body.pin || body.password || body.userId || body.id || body.username || '';
    const cleanCode = String(rawCode).trim().toLowerCase();

    if (!cleanCode) {
      return { success: false, error: 'Please enter Access Code' };
    }

    let staff: any = null;

    if (cleanCode && cleanCode.length >= 2) {
      // Direct Supabase Verification
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const client = createClient('https://bdfgscjiuqccoidkeaqh.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkZmdzY2ppdXFjY29pZGtlYXFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0MDc0ODgsImV4cCI6MjEwNzk4MzQ4OH0.CP8Cb8ZYRdvtV4Cs4PEe6XnA9S3rrv3O6LLbnTh2T2U', {
          auth: { persistSession: false, autoRefreshToken: false }
        });
        const { data: supaStaffs } = await client.from('staffs').select('*');
        if (Array.isArray(supaStaffs) && supaStaffs.length > 0) {
          const found = supaStaffs.find((s: any) => {
            const p = String(s.password || '').trim().toLowerCase();
            const id = String(s.id || '').trim().toLowerCase();
            if (!p && !id) return false;
            return (p && p === cleanCode) || (id && id === cleanCode);
          });
          if (found) staff = found;
        }
      } catch {}

      // Local Cache Backup Check
      if (!staff) {
        try {
          const cachedStaffs = localStorage.getItem('zuboc_staffs_cache');
          if (cachedStaffs) {
            const list = JSON.parse(cachedStaffs);
            if (Array.isArray(list)) {
              const found = list.find((s: any) => {
                const p = String(s.password || '').trim().toLowerCase();
                const id = String(s.id || '').trim().toLowerCase();
                if (!p && !id) return false;
                return (p && p === cleanCode) || (id && id === cleanCode);
              });
              if (found) staff = found;
            }
          }
        } catch {}
      }
    }

    if (staff) {
      return {
        success: true,
        token: `zuboc_token_${Date.now()}`,
        staff: {
          id: staff.id,
          name: staff.name,
          role: staff.role || 'PACKER',
          stationId: staff.stationId || 'Packing-01',
          email: staff.email
        },
        message: `Access granted as ${staff.name}`
      };
    }

    return { success: false, error: 'Invalid Access Code or Passphrase. Access Denied.' };
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
        telegramBotToken: localStorage.getItem('zuboc_telegram_token') || '8372063656:AAGc8APzAoq1LH14p5POdBm19qnv-5286gE',
        telegramChatId: localStorage.getItem('zuboc_telegram_chatid') || '-1003940299676',
        autoUpload: localStorage.getItem('zuboc_auto_upload') !== 'false',
        stationId: localStorage.getItem('zuboc_station_id') || 'Packing-01'
      };

      if (db) {
        try {
          await setDoc(doc(db, 'settings', 'config'), cleanForFirestore({ ...updated, updatedAt: new Date().toISOString() }), { merge: true });
        } catch {}
      }
      return { success: true, settings: { ...updated, telegramBotTokenMasked: '***' } };
    }
  }

  // 3. Orders GET / POST / DELETE
  if (cleanPath.includes('/orders')) {
    if (method === 'GET') {
      let orders: any[] = [];
      const localOrders = localStorage.getItem('zuboc_orders_cache') || localStorage.getItem('zuboc_orders_store');
      if (localOrders) {
        try { orders = JSON.parse(localOrders); } catch {}
      }

      // Check if path requested a specific single order (e.g. /api/orders/ZUB-123)
      const pathParts = cleanPath.split('/orders/');
      if (pathParts[1] && pathParts[1].trim()) {
        const rawTargetId = decodeURIComponent(pathParts[1].trim());
        const cleanTargetId = rawTargetId.toLowerCase().replace(/^#/, '');
        const singleOrder = orders.find(o => {
          if (!o || !o.orderId) return false;
          const oId = String(o.orderId).toLowerCase().replace(/^#/, '');
          return oId === cleanTargetId || String(o.orderId).toLowerCase() === rawTargetId.toLowerCase();
        });
        if (singleOrder) return singleOrder;
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
        awbNumber: body.awbNumber || '',
        courier: body.courier || '',
        weight: body.weight || '',
        productSku: body.productSku || '',
        customerName: body.customerName || '',
        contactPerson: body.contactPerson || '',
        contactPhone: body.contactPhone || '',
        fulfillFrom: body.fulfillFrom || '',
        orderReceivedDate: body.orderReceivedDate || '',
        dispatchDate: body.dispatchDate || '',
        orderAmount: body.orderAmount || '',
        shippingAmount: body.shippingAmount || '',
        orderTotal: body.orderTotal || '',
        deliveredDate: body.deliveredDate || '',
        itemCount: body.itemCount || '',
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
          await setDoc(doc(db, 'orders', orderId), cleanForFirestore(record), { merge: true });
        } catch {}
      }
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const client = createClient('https://bdfgscjiuqccoidkeaqh.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkZmdzY2ppdXFjY29pZGtlYXFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0MDc0ODgsImV4cCI6MjEwNzk4MzQ4OH0.CP8Cb8ZYRdvtV4Cs4PEe6XnA9S3rrv3O6LLbnTh2T2U', {
          auth: { persistSession: false, autoRefreshToken: false }
        });
        await client.from('orders').upsert(record, { onConflict: 'orderId' });
      } catch {}
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
    let token = body.telegramBotToken || localStorage.getItem('zuboc_telegram_token');
    let chatId = body.telegramChatId || localStorage.getItem('zuboc_telegram_chatid');

    if (!token || token.includes('...')) {
      token = '8372063656:AAGc8APzAoq1LH14p5POdBm19qnv-5286gE';
    }
    if (!chatId) {
      chatId = '-1003940299676';
    }

    const cleanToken = token.trim().replace(/^["']|["']$/g, '').replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-');
    const cleanChatId = chatId.trim().replace(/^["']|["']$/g, '').replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-');

    if (!cleanToken || !cleanChatId) {
      throw new Error('Telegram Bot Token and Chat ID are not configured in settings.');
    }

    // Direct fetch to Telegram API getMe
    const meRes = await fetch(`https://api.telegram.org/bot${cleanToken}/getMe`);
    const meText = await meRes.text();
    let meData: any = null;
    try {
      meData = JSON.parse(meText);
    } catch {
      throw new Error(`Telegram API non-JSON response from getMe`);
    }

    if (!meData || !meData.ok) {
      throw new Error(meData?.description || 'Invalid Telegram Bot Token');
    }

    const botUsername = meData.result?.username ? `@${meData.result.username}` : 'Bot';
    const stationId = body.stationId || localStorage.getItem('zuboc_station_id') || 'Packing-01';

    // Direct fetch to Telegram API sendMessage
    const msgRes = await fetch(`https://api.telegram.org/bot${cleanToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: cleanChatId,
        text: `🟢 <b>Zuboc Flow (${botUsername}) Connected!</b>\n\n<b>Station:</b> ${stationId}\n<b>Timestamp:</b> ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })} IST\n\nYour Zuboc Flow packing station is online and verified. Recorded order packing evidence will be delivered here automatically.`,
        parse_mode: 'HTML'
      })
    });

    const msgText = await msgRes.text();
    let msgData: any = null;
    try {
      msgData = JSON.parse(msgText);
    } catch {
      throw new Error(`Telegram API non-JSON response from sendMessage`);
    }

    if (!msgData || !msgData.ok) {
      throw new Error(msgData?.description || 'Failed to send test message to Telegram Chat ID. Ensure bot is added to group/channel as Admin.');
    }

    // Persist verified credentials
    localStorage.setItem('zuboc_telegram_token', cleanToken);
    localStorage.setItem('zuboc_telegram_chatid', cleanChatId);

    if (db) {
      try {
        await setDoc(doc(db, 'settings', 'config'), {
          telegramBotToken: cleanToken,
          telegramChatId: cleanChatId,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      } catch {}
    }

    return {
      success: true,
      botUsername,
      message: `Bot ${botUsername} verified and test message sent successfully!`,
      telegramResponse: msgData
    };
  }

  // 5. Telegram Upload Fallback
  if (cleanPath.endsWith('/telegram/upload')) {
    const orderId = body.orderId || `ORD-${Date.now()}`;
    const token = localStorage.getItem('zuboc_telegram_token') || '8372063656:AAGc8APzAoq1LH14p5POdBm19qnv-5286gE';
    const chatId = localStorage.getItem('zuboc_telegram_chatid') || '-1003940299676';

    const cleanToken = token.trim().replace(/^["']|["']$/g, '').replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-');
    const cleanChatId = chatId.trim().replace(/^["']|["']$/g, '').replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-');

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
    formData.append('chat_id', cleanChatId);
    formData.append('caption', `<b>Order ID: ${orderId}</b>\nStation: ${localStorage.getItem('zuboc_station_id') || 'Packing-01'}`);
    formData.append('parse_mode', 'HTML');
    formData.append('video', blob, `${orderId}.mp4`);

    const tgRes = await fetch(`https://api.telegram.org/bot${cleanToken}/sendVideo`, {
      method: 'POST',
      body: formData
    });

    const tgText = await tgRes.text();
    let tgData: any = null;
    try {
      tgData = JSON.parse(tgText);
    } catch {
      throw new Error(`Telegram API non-JSON response from sendVideo`);
    }

    if (!tgData || !tgData.ok) {
      throw new Error(tgData?.description || 'Telegram video upload failed');
    }

    const messageId = tgData.result?.message_id?.toString();
    const fileId = tgData.result?.video?.file_id;
    let numericId = cleanChatId;
    if (numericId.startsWith('-100')) numericId = numericId.substring(4);
    else if (numericId.startsWith('-')) numericId = numericId.substring(1);

    const messageLink = cleanChatId.startsWith('@')
      ? `https://t.me/${cleanChatId.substring(1)}/${messageId}`
      : `https://t.me/c/${numericId}/${messageId}`;

    const record = {
      orderId,
      uploadStatus: 'SUCCESS',
      telegramChatId: cleanChatId,
      telegramMessageId: messageId,
      telegramFileId: fileId,
      telegramMessageLink: messageLink,
      updatedAt: new Date().toISOString()
    };

    if (db) {
      try {
        await setDoc(doc(db, 'orders', orderId), cleanForFirestore(record), { merge: true });
      } catch {}
    }

    return { success: true, record, telegramResponse: tgData };
  }

  // 6. Staffs & Auth GET / POST / DELETE / Reset Password
  if (cleanPath.includes('/staffs') || cleanPath.includes('/auth/login') || cleanPath.includes('/auth/reset-password') || cleanPath.includes('/reset-password')) {
    let staffs: Record<string, any> = {
      'Admin-01': {
        id: 'Admin-01',
        name: 'David Admin',
        role: 'ADMIN',
        stationId: 'Packing-HQ',
        password: 'password123',
        createdAt: new Date().toISOString()
      }
    };
    const localStaffs = localStorage.getItem('zuboc_staffs_store');
    if (localStaffs) {
      try { staffs = JSON.parse(localStaffs); } catch {}
    }

    // Only query Firestore if local cache is empty
    if (!localStaffs && db) {
      try {
        const snap = await getDocs(collection(db, 'staffs'));
        if (!snap.empty) {
          snap.forEach(d => {
            staffs[d.id] = d.data();
          });
          localStorage.setItem('zuboc_staffs_store', JSON.stringify(staffs));
        }
      } catch {}
    }

    if (cleanPath.endsWith('/auth/login') && method === 'POST') {
      const userId = (body.userId || body.id || body.username || '').trim();
      const password = (body.password || '').trim();
      if (!userId) {
        throw new Error('Please enter User ID');
      }
      const staffKey = Object.keys(staffs).find(
        k => k.toLowerCase() === userId.toLowerCase() ||
             staffs[k].name?.toLowerCase() === userId.toLowerCase() ||
             (staffs[k].email && staffs[k].email.toLowerCase() === userId.toLowerCase())
      );
      if (!staffKey) {
        throw new Error('Staff account not found with this User ID');
      }
      const staff = staffs[staffKey];
      const expectedPassword = staff.password || 'password123';
      if (expectedPassword !== password) {
        throw new Error('Incorrect password. Default password is password123');
      }
      return {
        success: true,
        staff: {
          id: staff.id,
          name: staff.name,
          role: staff.role,
          stationId: staff.stationId,
          email: staff.email
        }
      };
    }

    if ((cleanPath.endsWith('/auth/reset-password') || cleanPath.endsWith('/reset-password')) && method === 'POST') {
      const userId = (body.userId || body.id || '').trim();
      const newPassword = (body.newPassword || '').trim();
      if (!userId || !newPassword) {
        throw new Error('User ID and New Password are required');
      }
      if (newPassword.length < 4) {
        throw new Error('Password must be at least 4 characters');
      }
      const staffKey = Object.keys(staffs).find(
        k => k.toLowerCase() === userId.toLowerCase() ||
             staffs[k].name?.toLowerCase() === userId.toLowerCase() ||
             (staffs[k].email && staffs[k].email.toLowerCase() === userId.toLowerCase())
      );
      if (!staffKey) {
        throw new Error(`Staff user '${userId}' not found`);
      }
      staffs[staffKey].password = newPassword;
      localStorage.setItem('zuboc_staffs_store', JSON.stringify(staffs));
      if (db) {
        try {
          await setDoc(doc(db, 'staffs', staffKey), cleanForFirestore({ password: newPassword }), { merge: true });
        } catch {}
      }
      return { success: true, message: `Password for ${staffs[staffKey].name} has been reset successfully!` };
    }

    if (cleanPath.endsWith('/staffs') && method === 'GET') {
      return Object.values(staffs).map((s: any) => ({
        id: s.id,
        name: s.name,
        role: s.role,
        stationId: s.stationId,
        email: s.email,
        createdAt: s.createdAt,
        hasPassword: Boolean(s.password)
      }));
    }

    if (cleanPath.endsWith('/staffs') && method === 'POST') {
      const id = (body.id || '').trim();
      const name = (body.name || '').trim();
      const role = body.role || 'PACKER';
      const stationId = body.stationId || 'Packing-01';
      const password = body.password ? String(body.password).trim() : undefined;
      const email = body.email ? String(body.email).trim() : undefined;

      if (!id || !name) {
        throw new Error('Staff ID and Name are required');
      }

      const existing = staffs[id];
      const updatedStaff = {
        id,
        name,
        role: ['ADMIN', 'SUPERVISOR', 'PACKER'].includes(role) ? role : 'PACKER',
        stationId,
        password: password || existing?.password || 'password123',
        email: email || existing?.email,
        createdAt: existing?.createdAt || new Date().toISOString()
      };

      staffs[id] = updatedStaff;
      localStorage.setItem('zuboc_staffs_store', JSON.stringify(staffs));
      if (db) {
        try {
          await setDoc(doc(db, 'staffs', id), cleanForFirestore(updatedStaff), { merge: true });
        } catch {}
      }

      return {
        success: true,
        staff: {
          id: updatedStaff.id,
          name: updatedStaff.name,
          role: updatedStaff.role,
          stationId: updatedStaff.stationId,
          email: updatedStaff.email,
          hasPassword: Boolean(updatedStaff.password)
        }
      };
    }

    if (cleanPath.includes('/staffs/') && method === 'DELETE') {
      const parts = cleanPath.split('/');
      const id = parts[parts.length - 1];
      if (!id) throw new Error('Staff ID is required');

      const existing = staffs[id];
      if (!existing) throw new Error('Staff member not found');

      if (existing.role === 'ADMIN') {
        const adminCount = Object.values(staffs).filter((s: any) => s.role === 'ADMIN').length;
        if (adminCount <= 1) {
          throw new Error('Cannot delete the only remaining Admin account');
        }
      }

      delete staffs[id];
      localStorage.setItem('zuboc_staffs_store', JSON.stringify(staffs));
      if (db) {
        try {
          await deleteDoc(doc(db, 'staffs', id));
        } catch {}
      }
      return { success: true, message: `Staff member ${id} removed successfully` };
    }

    if (cleanPath.includes('/ifm/chat')) {
      const messages = body.messages;
      if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error('messages array is required');
      }
      
      // Support multi-turn by passing full history
      const payloadMessages = messages.map((m: any) => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
      }));

      const response = await fetch('https://api.ifm.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer IFM-v1_d4sAGkIRgbpx7-PjHCqNJdpxTdjAVETb0sxzHd1DYFV7zPasHQnnS00CFePOaMsN',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: payloadMessages,
          model: 'IFM/K2-Horizon-375B-A23B'
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error?.message || data?.message || 'IFM API error');
      }
      return { success: true, data };
    }
  }

  return undefined;
}

