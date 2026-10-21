import * as XLSX from 'xlsx';
import { OrderRecord, LineItem, OrderSource } from '../types';

/**
 * STRICT 26-COLUMN SHOPIFY WHITELIST
 * All other extraneous columns are completely discarded during parsing.
 */
export const SHOPIFY_WHITELIST_COLUMNS = [
  'Name',
  'Email',
  'Financial Status',
  'Fulfillment Status',
  'Subtotal',
  'Shipping',
  'Taxes',
  'Total',
  'Discount Code',
  'Discount Amount',
  'Shipping Method',
  'Created at',
  'Lineitem name',
  'Lineitem price',
  'Lineitem sku',
  'Shipping Name',
  'Shipping Street',
  'Shipping Address1',
  'Shipping Address2',
  'Shipping Company',
  'Shipping City',
  'Shipping Zip',
  'Shipping Province',
  'Shipping Country',
  'Shipping Phone',
  'Notes'
] as const;

export type ShopifyWhitelistKey = typeof SHOPIFY_WHITELIST_COLUMNS[number];

export interface WhitelistedShopifyRow {
  Name: string;
  Email?: string;
  'Financial Status'?: string;
  'Fulfillment Status': string;
  Subtotal?: string;
  Shipping?: string;
  Taxes?: string;
  Total?: string;
  'Discount Code'?: string;
  'Discount Amount'?: string;
  'Shipping Method'?: string;
  'Created at'?: string;
  'Lineitem name'?: string;
  'Lineitem price'?: string;
  'Lineitem sku'?: string;
  'Shipping Name'?: string;
  'Shipping Street'?: string;
  'Shipping Address1'?: string;
  'Shipping Address2'?: string;
  'Shipping Company'?: string;
  'Shipping City'?: string;
  'Shipping Zip'?: string;
  'Shipping Province'?: string;
  'Shipping Country'?: string;
  'Shipping Phone'?: string;
  Notes?: string;
}

export interface ParsedShopifyOrder extends OrderRecord {
  source: 'Shopify CSV' | 'Custom CSV';
  lineItemCount: number;
}

export interface CsvParseResult {
  success: boolean;
  orders: ParsedShopifyOrder[];
  totalRows: number;
  filteredOutUnfulfilledCount: number;
  duplicateRowsDiscarded: number;
  uniqueOrdersCount: number;
  detectedFormat: 'Shopify CSV' | 'Custom CSV';
  errors: string[];
}

/**
 * Normalizes Phone Numbers (e.g. "+919876543210", "'9876543210" -> "9876543210")
 */
export function sanitizePhone(phone?: any): string | undefined {
  if (!phone) return undefined;
  const str = String(phone).replace(/['"'\s-]/g, '').trim();
  if (!str) return undefined;
  if (str.startsWith('+91') && str.length === 13) return str.slice(3);
  if (str.startsWith('91') && str.length === 12) return str.slice(2);
  return str;
}

/**
 * Parses numeric order number from Name (e.g. "#2888" -> 2888, "WEB-1042" -> 1042)
 */
export function parseOrderNumberNum(orderName: string): number | undefined {
  if (!orderName) return undefined;
  const digits = orderName.replace(/\D/g, '');
  if (!digits) return undefined;
  const num = parseInt(digits, 10);
  return isNaN(num) ? undefined : num;
}

/**
 * Formats CSV date to ISO string or clean date
 */
export function parseCsvDate(dateStr?: any): string | undefined {
  if (!dateStr) return undefined;
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toISOString();
    }
  } catch {}
  return String(dateStr).trim();
}

/**
 * Strict normalizer for raw row into the 26 whitelisted fields only.
 * Discards any column not in the whitelist.
 */
function extractWhitelistedShopifyFields(rawRow: Record<string, any>): WhitelistedShopifyRow | null {
  // Normalize row keys to lower-case trimmed for resilient matching
  const keyMap: Record<string, string> = {};
  for (const k of Object.keys(rawRow)) {
    keyMap[k.trim().toLowerCase()] = k;
  }

  const getVal = (whitelistKey: ShopifyWhitelistKey): string => {
    const directVal = rawRow[whitelistKey];
    if (directVal !== undefined && directVal !== null) {
      return String(directVal).trim();
    }
    const lowerKey = whitelistKey.toLowerCase();
    const matchedKey = keyMap[lowerKey];
    if (matchedKey && rawRow[matchedKey] !== undefined && rawRow[matchedKey] !== null) {
      return String(rawRow[matchedKey]).trim();
    }
    return '';
  };

  const nameVal = getVal('Name');
  if (!nameVal) {
    return null; // A valid row must have an order Name/ID
  }

  // Construct pure whitelisted object
  const cleanRow: WhitelistedShopifyRow = {
    Name: nameVal,
    Email: getVal('Email') || undefined,
    'Financial Status': getVal('Financial Status') || undefined,
    'Fulfillment Status': getVal('Fulfillment Status'),
    Subtotal: getVal('Subtotal') || undefined,
    Shipping: getVal('Shipping') || undefined,
    Taxes: getVal('Taxes') || undefined,
    Total: getVal('Total') || undefined,
    'Discount Code': getVal('Discount Code') || undefined,
    'Discount Amount': getVal('Discount Amount') || undefined,
    'Shipping Method': getVal('Shipping Method') || undefined,
    'Created at': getVal('Created at') || undefined,
    'Lineitem name': getVal('Lineitem name') || undefined,
    'Lineitem price': getVal('Lineitem price') || undefined,
    'Lineitem sku': getVal('Lineitem sku') || undefined,
    'Shipping Name': getVal('Shipping Name') || undefined,
    'Shipping Street': getVal('Shipping Street') || undefined,
    'Shipping Address1': getVal('Shipping Address1') || undefined,
    'Shipping Address2': getVal('Shipping Address2') || undefined,
    'Shipping Company': getVal('Shipping Company') || undefined,
    'Shipping City': getVal('Shipping City') || undefined,
    'Shipping Zip': getVal('Shipping Zip') || undefined,
    'Shipping Province': getVal('Shipping Province') || undefined,
    'Shipping Country': getVal('Shipping Country') || undefined,
    'Shipping Phone': getVal('Shipping Phone') || undefined,
    Notes: getVal('Notes') || undefined
  };

  return cleanRow;
}

/**
 * Main CSV Parser for Shopify and General CSV files.
 * Strictly adheres to the 26-column whitelist, fulfilled-only filter,
 * deduplication on (order_source, order_name, lineitem_sku, lineitem_name),
 * and order_source = 'website'.
 */
export function parseOrdersCsv(fileBuffer: ArrayBuffer | Uint8Array): CsvParseResult {
  const errors: string[] = [];
  try {
    const workbook = XLSX.read(fileBuffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return { 
        success: false, 
        orders: [], 
        totalRows: 0, 
        filteredOutUnfulfilledCount: 0,
        duplicateRowsDiscarded: 0,
        uniqueOrdersCount: 0, 
        detectedFormat: 'Shopify CSV', 
        errors: ['CSV file is empty or corrupted.'] 
      };
    }

    const sheet = workbook.Sheets[firstSheetName];
    const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (!rawRows || rawRows.length === 0) {
      return { 
        success: false, 
        orders: [], 
        totalRows: 0, 
        filteredOutUnfulfilledCount: 0,
        duplicateRowsDiscarded: 0,
        uniqueOrdersCount: 0, 
        detectedFormat: 'Shopify CSV', 
        errors: ['No data rows found in CSV file.'] 
      };
    }

    // Detect format
    const sampleKeys = Object.keys(rawRows[0] || {}).map(k => k.trim().toLowerCase());
    const isShopifyFormat = sampleKeys.some(k => 
      ['name', 'financial status', 'lineitem name', 'lineitem sku', 'shipping name', 'fulfillment status'].includes(k)
    );

    const detectedFormat = isShopifyFormat ? 'Shopify CSV' : 'Custom CSV';

    if (isShopifyFormat) {
      let filteredOutUnfulfilledCount = 0;
      let duplicateRowsDiscarded = 0;

      // Deduplication set based on (order_source, order_name, lineitem_sku, lineitem_name)
      // Note: order_source is strictly 'website' for all Shopify imports
      const seenItems = new Set<string>();

      // Group whitelisted and filtered rows by Order Name
      const groupedOrders: Record<string, WhitelistedShopifyRow[]> = {};

      for (const raw of rawRows) {
        const row = extractWhitelistedShopifyFields(raw);
        if (!row || !row.Name) continue;

        // Rule 1: Fulfilled Only (case-insensitive)
        const fulfillmentStatus = (row['Fulfillment Status'] || '').trim().toLowerCase();
        if (fulfillmentStatus !== 'fulfilled') {
          filteredOutUnfulfilledCount++;
          continue;
        }

        // Rule 2: Deduplication on (order_source, order_name, lineitem_sku, lineitem_name)
        const source: OrderSource = 'website';
        const orderName = row.Name.trim();
        const sku = (row['Lineitem sku'] || '').trim().toLowerCase();
        const lineName = (row['Lineitem name'] || '').trim().toLowerCase();
        const dedupKey = `${source}::${orderName.toLowerCase()}::${sku}::${lineName}`;

        if (seenItems.has(dedupKey)) {
          duplicateRowsDiscarded++;
          continue;
        }
        seenItems.add(dedupKey);

        if (!groupedOrders[orderName]) {
          groupedOrders[orderName] = [];
        }
        groupedOrders[orderName].push(row);
      }

      const parsedOrders: ParsedShopifyOrder[] = [];
      const nowIso = new Date().toISOString();

      for (const [orderName, rows] of Object.entries(groupedOrders)) {
        const firstRow = rows[0];

        // Gather all line items
        const lineItems: LineItem[] = [];
        const skus: string[] = [];

        rows.forEach(r => {
          const lName = (r['Lineitem name'] || '').trim();
          const lSku = (r['Lineitem sku'] || '').trim();
          const lPrice = (r['Lineitem price'] || '').trim();

          if (lName || lSku) {
            lineItems.push({
              name: lName || lSku || 'Product Item',
              sku: lSku || undefined,
              price: lPrice || undefined,
              quantity: 1
            });
            const skuOrName = lSku || lName;
            if (skuOrName && !skus.includes(skuOrName)) {
              skus.push(skuOrName);
            }
          }
        });

        // Numeric Sorting field for Website orders
        const order_number_num = parseOrderNumberNum(orderName);

        // Normalize created date
        const createdAt = parseCsvDate(firstRow['Created at']) || nowIso;
        const shippingName = (firstRow['Shipping Name'] || '').trim();
        const contactPhone = sanitizePhone(firstRow['Shipping Phone']);

        // Address parts and notes
        const orderNotes = (firstRow['Notes'] || '').trim();

        parsedOrders.push({
          orderId: orderName,
          order_source: 'website',
          orderSource: 'website',
          order_number_num,
          staffId: 'Shopify Importer',
          stationId: 'Web-Fulfillment',
          recordingStartedAt: createdAt,
          durationSeconds: 0,
          recordingStatus: 'PENDING',
          uploadStatus: 'PENDING',

          // Target 26 Shopify Fields
          email: firstRow.Email,
          financialStatus: firstRow['Financial Status'] || 'paid',
          fulfillmentStatus: 'Fulfilled',
          subtotal: firstRow.Subtotal,
          shipping: firstRow.Shipping,
          taxes: firstRow.Taxes,
          total: firstRow.Total,
          orderTotal: firstRow.Total || firstRow.Subtotal,
          orderAmount: firstRow.Subtotal || firstRow.Total,
          shippingAmount: firstRow.Shipping,
          discountCode: firstRow['Discount Code'],
          discountAmount: firstRow['Discount Amount'],
          shippingMethod: firstRow['Shipping Method'],
          courier: firstRow['Shipping Method'] || 'Shopify Express',
          orderReceivedDate: createdAt,
          lineItems,
          productSku: skus.length > 0 ? skus.join(', ') : 'Shopify Line Item',
          itemCount: lineItems.length || 1,
          customerName: shippingName || firstRow.Email || 'Website Customer',
          shippingName: shippingName || undefined,
          contactPerson: shippingName || undefined,
          contactPhone,
          shippingStreet: firstRow['Shipping Street'] || firstRow['Shipping Address1'],
          shippingAddress1: firstRow['Shipping Address1'] || firstRow['Shipping Street'],
          shippingAddress2: firstRow['Shipping Address2'],
          shippingCompany: firstRow['Shipping Company'],
          shippingCity: firstRow['Shipping City'],
          shippingZip: firstRow['Shipping Zip'],
          shippingProvince: firstRow['Shipping Province'],
          shippingCountry: firstRow['Shipping Country'],
          shippingPhone: contactPhone,
          notes: orderNotes || undefined,

          // System fields
          source: 'Shopify CSV',
          lineItemCount: lineItems.length,
          isProductionDeckOrder: true,
          createdAt,
          updatedAt: nowIso
        });
      }

      return {
        success: true,
        orders: parsedOrders,
        totalRows: rawRows.length,
        filteredOutUnfulfilledCount,
        duplicateRowsDiscarded,
        uniqueOrdersCount: parsedOrders.length,
        detectedFormat: 'Shopify CSV',
        errors
      };

    } else {
      // Custom / General CSV Format fallback
      const parsedOrders: ParsedShopifyOrder[] = [];
      const nowIso = new Date().toISOString();

      for (let i = 0; i < rawRows.length; i++) {
        const row = rawRows[i];
        const orderIdKey = Object.keys(row).find(k => 
          /order\s*id|order\s*num|order#|invoice|ref/i.test(k)
        ) || Object.keys(row)[0];

        const rawId = row[orderIdKey];
        if (!rawId) continue;
        const cleanId = String(rawId).trim();

        // Detect if amazon style ID (e.g. 402-1234567-1234567) or default website
        const isAmazon = /amazon|\d{3}-\d{7}-\d{7}/i.test(cleanId) || /amazon/i.test(String(row['source'] || row['channel'] || ''));
        const source: OrderSource = isAmazon ? 'amazon' : 'website';

        const custKey = Object.keys(row).find(k => /customer|name|client|buyer/i.test(k));
        const phoneKey = Object.keys(row).find(k => /phone|mobile|contact|tel/i.test(k));
        const skuKey = Object.keys(row).find(k => /sku|item|product|description/i.test(k));
        const totalKey = Object.keys(row).find(k => /total|amount|price|value/i.test(k));
        const courierKey = Object.keys(row).find(k => /courier|carrier|shipping|method/i.test(k));
        const awbKey = Object.keys(row).find(k => /awb|tracking|waybill/i.test(k));

        const order_number_num = parseOrderNumberNum(cleanId);

        parsedOrders.push({
          orderId: cleanId,
          order_source: source,
          orderSource: source,
          order_number_num,
          staffId: 'CSV Importer',
          stationId: 'General-Fulfillment',
          recordingStartedAt: nowIso,
          durationSeconds: 0,
          recordingStatus: 'PENDING',
          uploadStatus: 'PENDING',
          customerName: custKey && row[custKey] ? String(row[custKey]).trim() : undefined,
          contactPerson: custKey && row[custKey] ? String(row[custKey]).trim() : undefined,
          contactPhone: phoneKey ? sanitizePhone(row[phoneKey]) : undefined,
          productSku: skuKey && row[skuKey] ? String(row[skuKey]).trim() : undefined,
          itemCount: '1',
          orderTotal: totalKey && row[totalKey] ? String(row[totalKey]).trim() : undefined,
          courier: courierKey && row[courierKey] ? String(row[courierKey]).trim() : undefined,
          awbNumber: awbKey && row[awbKey] ? String(row[awbKey]).trim() : undefined,
          fulfillmentStatus: 'Fulfilled',
          source: 'Custom CSV',
          lineItemCount: 1,
          createdAt: nowIso,
          updatedAt: nowIso
        });
      }

      return {
        success: true,
        orders: parsedOrders,
        totalRows: rawRows.length,
        filteredOutUnfulfilledCount: 0,
        duplicateRowsDiscarded: 0,
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
      filteredOutUnfulfilledCount: 0,
      duplicateRowsDiscarded: 0,
      uniqueOrdersCount: 0,
      detectedFormat: 'Shopify CSV',
      errors: [err?.message || 'Failed to parse CSV file. Ensure it is a valid .csv file.']
    };
  }
}

/**
 * Returns a downloadable sample Shopify CSV template string matching the 26 whitelisted fields
 */
export function getSampleShopifyCsvContent(): string {
  const headers = SHOPIFY_WHITELIST_COLUMNS.join(',');
  const row1 = [
    '"#2888"',
    '"rahul.sharma@example.com"',
    '"paid"',
    '"fulfilled"',
    '"1500.00"',
    '"80.00"',
    '"270.00"',
    '"1850.00"',
    '"WELCOME10"',
    '"150.00"',
    '"Delhivery Express"',
    '"2026-10-18T14:30:00Z"',
    '"Custom Monogrammed Leather Wallet"',
    '"1200.00"',
    '"ZUBOC-WAL-01"',
    '"Rahul Sharma"',
    '"MG Road 45"',
    '"MG Road 45, Floor 2"',
    '"Suite 2B"',
    '"Acme Retail"',
    '"Kochi"',
    '"682001"',
    '"Kerala"',
    '"India"',
    '"+919876543210"',
    '"Emboss initials R.S. in gold foil"'
  ].join(',');

  const row2 = [
    '"#2888"',
    '"rahul.sharma@example.com"',
    '"paid"',
    '"fulfilled"',
    '"1500.00"',
    '"80.00"',
    '"270.00"',
    '"1850.00"',
    '"WELCOME10"',
    '"150.00"',
    '"Delhivery Express"',
    '"2026-10-18T14:30:00Z"',
    '"Gold Foil Wax Stamp Accessory"',
    '"300.00"',
    '"ZUBOC-WAX-02"',
    '"Rahul Sharma"',
    '"MG Road 45"',
    '"MG Road 45, Floor 2"',
    '"Suite 2B"',
    '"Acme Retail"',
    '"Kochi"',
    '"682001"',
    '"Kerala"',
    '"India"',
    '"+919876543210"',
    '"Emboss initials R.S. in gold foil"'
  ].join(',');

  const row3 = [
    '"#2889"',
    '"ananya.nair@example.com"',
    '"paid"',
    '"fulfilled"',
    '"2200.00"',
    '"0.00"',
    '"396.00"',
    '"2596.00"',
    '""',
    '"0.00"',
    '"Blue Dart Express"',
    '"2026-10-19T09:15:00Z"',
    '"Premium Eco Gift Box Set"',
    '"2200.00"',
    '"ZUBOC-BOX-10"',
    '"Ananya Nair"',
    '"Marine Drive 12"',
    '"Flat 4A, Bayview Tower"',
    '""',
    '""',
    '"Kozhikode"',
    '"673001"',
    '"Kerala"',
    '"India"',
    '"+919812345678"',
    '"Deliver between 2 PM and 5 PM"'
  ].join(',');

  return `${headers}\n${row1}\n${row2}\n${row3}`;
}
