import { createClient } from '@supabase/supabase-js';

// Support VITE_ environment variables for deployment flexibility
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://bdfgscjiuqccoidkeaqh.supabase.co';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkZmdzY2ppdXFjY29pZGtlYXFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0MDc0ODgsImV4cCI6MjEwNzk4MzQ4OH0.CP8Cb8ZYRdvtV4Cs4PEe6XnA9S3rrv3O6LLbnTh2T2U';

let _supabaseClientInstance: any = null;

export function getClientSupabase() {
  if (_supabaseClientInstance) return _supabaseClientInstance;
  _supabaseClientInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
  return _supabaseClientInstance;
}

// Client-side singleton instance using the public anon key
export const supabase = getClientSupabase();

export const SUPABASE_ALLOWED_COLUMNS = new Set([
  'orderId', 'staffId', 'stationId', 'recordingStartedAt', 'recordingCompletedAt',
  'durationSeconds', 'recordingStatus', 'uploadStatus', 'evidenceType', 'videoUrl',
  'photoUrls', 'photoDataUrl', 'telegramChatId', 'telegramMessageId', 'telegramFileId',
  'telegramMessageLink', 'awbNumber', 'courier', 'deliveryMethod', 'weight',
  'productSku', 'customerName', 'contactPerson', 'contactPhone', 'fulfillFrom',
  'orderReceivedDate', 'dispatchDate', 'deliveredDate', 'orderAmount', 'shippingAmount',
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

export const SUPABASE_DATE_FIELDS = new Set([
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

export function normalizeIsoDate(dateVal?: any): string | undefined {
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

export function cleanForSupabase(obj: any): any {
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

  return cleaned;
}
