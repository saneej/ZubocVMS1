import * as XLSX from 'xlsx';
import { OrderRecord } from '../types';

export interface ParsedShopifyOrder {
  orderId: string;
  customerName?: string;
  contactPerson?: string;
  contactPhone?: string;
  productSku?: string;
  itemCount: string;
  orderAmount?: string;
  shippingAmount?: string;
  orderTotal?: string;
  courier?: string;
  awbNumber?: string;
  orderReceivedDate?: string;
  fulfillmentStatus: 'Pending' | 'Packed' | 'Shipped' | 'Fulfilled' | 'Cancelled';
  notes?: string;
  recordingStatus: 'PENDING';
  uploadStatus: 'PENDING';
  source: 'Shopify CSV' | 'Custom CSV';
  lineItemCount: number;
}

export interface CsvParseResult {
  success: boolean;
  orders: ParsedShopifyOrder[];
  totalRows: number;
  uniqueOrdersCount: number;
  detectedFormat: 'Shopify CSV' | 'Custom CSV';
  errors: string[];
}

/**
 * Maps Shopify fulfillment status to system fulfillment status
 */
function mapShopifyStatus(shopifyStatus?: string): 'Pending' | 'Packed' | 'Shipped' | 'Fulfilled' | 'Cancelled' {
  if (!shopifyStatus) return 'Pending';
  const lower = shopifyStatus.toLowerCase().trim();
  if (lower.includes('fulfilled') && !lower.includes('unfulfilled') && !lower.includes('partial')) {
    return 'Fulfilled';
  }
  if (lower.includes('shipped') || lower.includes('in_transit')) {
    return 'Shipped';
  }
  if (lower.includes('partial') || lower.includes('packed')) {
    return 'Packed';
  }
  if (lower.includes('cancel') || lower.includes('restock') || lower.includes('refunded')) {
    return 'Cancelled';
  }
  return 'Pending';
}

/**
 * Normalizes Phone Numbers (e.g. "+919876543210", "'9876543210" -> "9876543210")
 */
function sanitizePhone(phone?: any): string | undefined {
  if (!phone) return undefined;
  const str = String(phone).replace(/['"'\s-]/g, '').trim();
  if (!str) return undefined;
  // If starts with +91 or 91 and has 12 chars
  if (str.startsWith('+91') && str.length === 13) return str.slice(3);
  if (str.startsWith('91') && str.length === 12) return str.slice(2);
  return str;
}

/**
 * Formats CSV date to ISO string or clean date
 */
function parseCsvDate(dateStr?: any): string | undefined {
  if (!dateStr) return undefined;
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toISOString();
    }
  } catch (e) {
    // ignore
  }
  return String(dateStr).trim();
}

/**
 * Main CSV Parser for Shopify and General CSV files
 */
export function parseOrdersCsv(fileBuffer: ArrayBuffer | Uint8Array): CsvParseResult {
  const errors: string[] = [];
  try {
    const workbook = XLSX.read(fileBuffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return { success: false, orders: [], totalRows: 0, uniqueOrdersCount: 0, detectedFormat: 'Custom CSV', errors: ['CSV file is empty or corrupted.'] };
    }

    const sheet = workbook.Sheets[firstSheetName];
    const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (!rawRows || rawRows.length === 0) {
      return { success: false, orders: [], totalRows: 0, uniqueOrdersCount: 0, detectedFormat: 'Custom CSV', errors: ['No data rows found in CSV file.'] };
    }

    // Check headers to determine format
    const sampleKeys = Object.keys(rawRows[0] || {}).map(k => k.trim());
    const isShopifyFormat = sampleKeys.some(k => 
      ['Name', 'Financial Status', 'Lineitem name', 'Lineitem quantity', 'Lineitem sku', 'Shipping Name'].includes(k)
    );

    const detectedFormat = isShopifyFormat ? 'Shopify CSV' : 'Custom CSV';

    if (isShopifyFormat) {
      // Group by Shopify 'Name' (Order ID, e.g., #1001 or 1001)
      const groupedOrders: Record<string, Record<string, any>[]> = {};
      
      for (const row of rawRows) {
        const rawName = row['Name'] || row['Order ID'] || row['order_id'];
        if (!rawName) continue;
        const nameStr = String(rawName).trim();
        if (!groupedOrders[nameStr]) {
          groupedOrders[nameStr] = [];
        }
        groupedOrders[nameStr].push(row);
      }

      const parsedOrders: ParsedShopifyOrder[] = [];

      for (const [orderName, rows] of Object.entries(groupedOrders)) {
        const firstRow = rows[0];

        // Gather all line items
        const skus: string[] = [];
        let totalItems = 0;

        rows.forEach(r => {
          const sku = (r['Lineitem sku'] || r['Lineitem name'] || '').toString().trim();
          const qty = parseInt(r['Lineitem quantity'] || '1', 10) || 1;
          if (sku) {
            skus.push(qty > 1 ? `${sku} (x${qty})` : sku);
          }
          totalItems += qty;
        });

        // Determine customer name & shipping details
        const shippingName = (firstRow['Shipping Name'] || firstRow['Billing Name'] || firstRow['Email'] || '').toString().trim();
        const contactPerson = (firstRow['Shipping Name'] || firstRow['Billing Name'] || '').toString().trim();
        const contactPhone = sanitizePhone(firstRow['Shipping Phone'] || firstRow['Billing Phone'] || firstRow['Phone']);
        
        // Shipping address note preview
        const addressParts = [
          firstRow['Shipping Address1'],
          firstRow['Shipping City'],
          firstRow['Shipping Zip'],
          firstRow['Shipping Country']
        ].filter(Boolean).map(s => String(s).trim());
        const addressNote = addressParts.length > 0 ? `Address: ${addressParts.join(', ')}` : '';

        // Amounts
        const subtotal = firstRow['Subtotal'] ? String(firstRow['Subtotal']).trim() : '';
        const shipping = firstRow['Shipping'] ? String(firstRow['Shipping']).trim() : '';
        const total = firstRow['Total'] ? String(firstRow['Total']).trim() : '';

        // Delivery Method / Courier
        const shippingMethod = (firstRow['Shipping Method'] || firstRow['Tracking Company'] || '').toString().trim();
        const trackingNum = (firstRow['Tracking Number'] || '').toString().trim();

        // Fulfillment status mapping
        const shopifyFulfillment = firstRow['Fulfillment Status'] || 'unfulfilled';
        const fulfillmentStatus = mapShopifyStatus(shopifyFulfillment);

        // Received Date
        const createdAt = parseCsvDate(firstRow['Created at'] || firstRow['Paid at']);

        parsedOrders.push({
          orderId: orderName,
          customerName: shippingName || undefined,
          contactPerson: contactPerson || undefined,
          contactPhone: contactPhone || undefined,
          productSku: skus.length > 0 ? skus.join(', ') : 'Shopify Item',
          itemCount: String(totalItems || 1),
          orderAmount: subtotal || (total ? String(Number(total) - (Number(shipping) || 0)) : undefined),
          shippingAmount: shipping || undefined,
          orderTotal: total || undefined,
          courier: shippingMethod || undefined,
          awbNumber: trackingNum || undefined,
          orderReceivedDate: createdAt,
          fulfillmentStatus,
          notes: [addressNote, firstRow['Notes']].filter(Boolean).join(' | ') || undefined,
          recordingStatus: 'PENDING',
          uploadStatus: 'PENDING',
          source: 'Shopify CSV',
          lineItemCount: rows.length
        });
      }

      return {
        success: true,
        orders: parsedOrders,
        totalRows: rawRows.length,
        uniqueOrdersCount: parsedOrders.length,
        detectedFormat: 'Shopify CSV',
        errors
      };

    } else {
      // Custom / General CSV Format
      const parsedOrders: ParsedShopifyOrder[] = [];

      for (let i = 0; i < rawRows.length; i++) {
        const row = rawRows[i];
        // Find order ID column
        const orderIdKey = Object.keys(row).find(k => 
          /order\s*id|order\s*num|order#|invoice|ref/i.test(k)
        ) || Object.keys(row)[0];

        const rawId = row[orderIdKey];
        if (!rawId) continue;
        const cleanId = String(rawId).trim();

        // Customer column
        const custKey = Object.keys(row).find(k => /customer|name|client|buyer/i.test(k));
        const phoneKey = Object.keys(row).find(k => /phone|mobile|contact|tel/i.test(k));
        const skuKey = Object.keys(row).find(k => /sku|item|product|description/i.test(k));
        const qtyKey = Object.keys(row).find(k => /qty|quantity|count/i.test(k));
        const totalKey = Object.keys(row).find(k => /total|amount|price|value/i.test(k));
        const courierKey = Object.keys(row).find(k => /courier|carrier|shipping|method/i.test(k));
        const awbKey = Object.keys(row).find(k => /awb|tracking|waybill/i.test(k));
        const statusKey = Object.keys(row).find(k => /status|fulfillment/i.test(k));

        parsedOrders.push({
          orderId: cleanId,
          customerName: custKey && row[custKey] ? String(row[custKey]).trim() : undefined,
          contactPerson: custKey && row[custKey] ? String(row[custKey]).trim() : undefined,
          contactPhone: phoneKey ? sanitizePhone(row[phoneKey]) : undefined,
          productSku: skuKey && row[skuKey] ? String(row[skuKey]).trim() : undefined,
          itemCount: qtyKey && row[qtyKey] ? String(row[qtyKey]).trim() : '1',
          orderTotal: totalKey && row[totalKey] ? String(row[totalKey]).trim() : undefined,
          courier: courierKey && row[courierKey] ? String(row[courierKey]).trim() : undefined,
          awbNumber: awbKey && row[awbKey] ? String(row[awbKey]).trim() : undefined,
          fulfillmentStatus: statusKey ? mapShopifyStatus(row[statusKey]) : 'Pending',
          recordingStatus: 'PENDING',
          uploadStatus: 'PENDING',
          source: 'Custom CSV',
          lineItemCount: 1
        });
      }

      return {
        success: true,
        orders: parsedOrders,
        totalRows: rawRows.length,
        uniqueOrdersCount: parsedOrders.length,
        detectedFormat: 'Custom CSV',
        errors
      };
    }

  } catch (err: any) {
    console.error('Error parsing orders CSV:', err);
    return {
      success: false,
      orders: [],
      totalRows: 0,
      uniqueOrdersCount: 0,
      detectedFormat: 'Shopify CSV',
      errors: [err?.message || 'Failed to parse CSV file. Ensure it is a valid .csv file.']
    };
  }
}

/**
 * Returns a downloadable sample Shopify CSV template string
 */
export function getSampleShopifyCsvContent(): string {
  return [
    `Name,Email,Financial Status,Paid at,Fulfillment Status,Fulfilled at,Accepts Marketing,Currency,Subtotal,Shipping,Taxes,Total,Discount Code,Discount Amount,Shipping Method,Created at,Lineitem quantity,Lineitem name,Lineitem price,Lineitem compare at price,Lineitem sku,Lineitem requires shipping,Lineitem taxable,Lineitem fulfillment status,Billing Name,Billing Address1,Billing City,Billing Zip,Billing Province,Billing Country,Billing Phone,Shipping Name,Shipping Address1,Shipping Address2,Shipping Company,Shipping City,Shipping Zip,Shipping Province,Shipping Country,Shipping Phone,Notes,Note Attributes,Cancelled at,Payment Method,Vendor,Outstanding Balance,Employee,Location,Device ID,Id,Tags,Risk Level,Source,Lineitem discount,Tax 1 Name,Tax 1 Value,Phone,Receipt Number,Duties`,
    `"#1001","rahul.sharma@example.com","paid","2026-10-15 14:30:00 +0530","unfulfilled","","true","INR","1500.00","80.00","270.00","1850.00","WELCOME10","150.00","Delhivery Express","2026-10-15 14:30:00 +0530","2","Custom Printed Packvision Box","600.00","","PV-BOX-01","true","true","pending","Rahul Sharma","MG Road 45","Kochi","682001","KL","IN","+919876543210","Rahul Sharma","MG Road 45","Suite 2B","Acme","Kochi","682001","KL","IN","+919876543210","Handle with fragile care","","","Razorpay","Packvision","0.00","","","","5829104820","Priority","Low","web","0.00","IGST","270.00","+919876543210","",""`,
    `"#1001","rahul.sharma@example.com","paid","2026-10-15 14:30:00 +0530","unfulfilled","","true","INR","1500.00","80.00","270.00","1850.00","WELCOME10","150.00","Delhivery Express","2026-10-15 14:30:00 +0530","1","Heavy Duty Sealing Tape","300.00","","PV-TAPE-02","true","true","pending","Rahul Sharma","MG Road 45","Kochi","682001","KL","IN","+919876543210","Rahul Sharma","MG Road 45","Suite 2B","Acme","Kochi","682001","KL","IN","+919876543210","Handle with fragile care","","","Razorpay","Packvision","0.00","","","","5829104820","Priority","Low","web","0.00","IGST","270.00","+919876543210","",""`,
    `"#1002","ananya.nair@example.com","paid","2026-10-15 16:15:00 +0530","fulfilled","2026-10-16","true","INR","2200.00","0.00","396.00","2596.00","","0.00","Blue Dart Express","2026-10-15 16:15:00 +0530","1","Eco Shipping Bags 100 Pack","2200.00","","PV-BAG-100","true","true","fulfilled","Ananya Nair","Calicut Main St 12","Kozhikode","673001","KL","IN","+919812345678","Ananya Nair","Calicut Main St 12","","","Kozhikode","673001","KL","IN","+919812345678","Please deliver before 5 PM","","","UPI","Packvision","0.00","","","","5829104821","Regular","Low","web","0.00","IGST","396.00","+919812345678","",""`
  ].join('\n');
}
