import * as XLSX from 'xlsx';
import { OrderRecord } from '../types';
import { formatIST } from './time';

export function exportOrdersToExcel(orders: OrderRecord[], filenamePrefix = 'zuboc_orders'): void {
  if (!orders || orders.length === 0) {
    alert('No order records available to export.');
    return;
  }

  const exportData = orders.map((o, idx) => {
    const durMin = Math.floor((o.durationSeconds || 0) / 60);
    const durSec = (o.durationSeconds || 0) % 60;
    const durationFormatted = o.durationSeconds ? `${durMin}m ${durSec}s` : '0m 0s';

    return {
      'S.No': idx + 1,
      'Order ID': o.orderId || '',
      'AWB / Tracking': o.awbNumber || '',
      'Courier Partner': o.courier || '',
      'Delivery Method': o.deliveryMethod || 'Normal',
      'Weight': o.weight || '',
      'Product / SKU': o.productSku || '',
      'Quantity': o.itemCount ? String(o.itemCount) : '1',
      'Customer Name / City': o.customerName || '',
      'Contact Person': o.contactPerson || '',
      'Contact Phone': o.contactPhone || '',
      'Fulfill From': o.fulfillFrom || '',
      'Order Received Date': o.orderReceivedDate || '',
      'Despatch Date': o.dispatchDate || '',
      'Order Amount (₹)': o.orderAmount ? parseFloat(o.orderAmount) || o.orderAmount : '',
      'Shipping Amount (₹)': o.shippingAmount ? parseFloat(o.shippingAmount) || o.shippingAmount : '',
      'Total Amount (₹)': o.orderTotal ? parseFloat(o.orderTotal) || o.orderTotal : '',
      'Delivered Date': o.deliveredDate || '',
      'Packing Status': o.recordingStatus || 'PENDING',
      'Upload Status': o.uploadStatus || 'PENDING',
      'Evidence Type': o.evidenceType || 'VIDEO',
      'Duration': durationFormatted,
      'Station ID': o.stationId || '',
      'Staff / Operator': o.staffId || '',
      'Telegram Message Link': o.telegramMessageLink || '',
      'QC Notes / Remarks': o.notes || '',
      'Recorded Time (IST)': o.createdAt ? formatIST(o.createdAt) : ''
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(exportData);

  // Compute column widths dynamically
  const colWidths = Object.keys(exportData[0] || {}).map(key => {
    let maxLen = key.length;
    exportData.forEach(row => {
      const val = String((row as any)[key] || '');
      if (val.length > maxLen) maxLen = val.length;
    });
    return { wch: Math.min(Math.max(maxLen + 3, 10), 45) };
  });

  worksheet['!cols'] = colWidths;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Order Packing Records');

  const nowStr = new Date().toISOString().slice(0, 10);
  const fullFilename = `${filenamePrefix}_${nowStr}.xlsx`;

  XLSX.writeFile(workbook, fullFilename);
}

export function exportOrdersToCSV(orders: OrderRecord[], filenamePrefix = 'zuboc_orders'): void {
  if (!orders || orders.length === 0) {
    alert('No order records available to export.');
    return;
  }

  const headers = [
    'Order ID',
    'AWB Number',
    'Courier',
    'Delivery Method',
    'Weight',
    'Product SKU',
    'Quantity',
    'Customer',
    'Contact Person',
    'Contact Phone',
    'Fulfill From',
    'Order Received Date',
    'Despatch Date',
    'Order Amount',
    'Shipping Amount',
    'Total Amount',
    'Delivered Date',
    'Packing Status',
    'Upload Status',
    'Evidence Type',
    'Duration (s)',
    'Station ID',
    'Operator',
    'Telegram Link',
    'Notes',
    'Timestamp (IST)'
  ];

  const escapeCSV = (val: any) => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows = orders.map(o => [
    escapeCSV(o.orderId),
    escapeCSV(o.awbNumber || ''),
    escapeCSV(o.courier || ''),
    escapeCSV(o.deliveryMethod || 'Normal'),
    escapeCSV(o.weight || ''),
    escapeCSV(o.productSku || ''),
    escapeCSV(o.itemCount ? String(o.itemCount) : '1'),
    escapeCSV(o.customerName || ''),
    escapeCSV(o.contactPerson || ''),
    escapeCSV(o.contactPhone || ''),
    escapeCSV(o.fulfillFrom || ''),
    escapeCSV(o.orderReceivedDate || ''),
    escapeCSV(o.dispatchDate || ''),
    escapeCSV(o.orderAmount || ''),
    escapeCSV(o.shippingAmount || ''),
    escapeCSV(o.orderTotal || ''),
    escapeCSV(o.deliveredDate || ''),
    escapeCSV(o.recordingStatus || 'PENDING'),
    escapeCSV(o.uploadStatus || 'PENDING'),
    escapeCSV(o.evidenceType || 'VIDEO'),
    escapeCSV(o.durationSeconds || 0),
    escapeCSV(o.stationId || ''),
    escapeCSV(o.staffId || ''),
    escapeCSV(o.telegramMessageLink || ''),
    escapeCSV(o.notes || ''),
    escapeCSV(o.createdAt ? formatIST(o.createdAt) : '')
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filenamePrefix}_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
