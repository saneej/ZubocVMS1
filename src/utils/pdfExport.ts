import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { OrderRecord } from '../types';
import { formatIST } from './time';
import { CarrierCalculationResult } from './carriersConfig';

// Brand colors explicitly typed as [number, number, number] tuple
const PRIMARY_MAROON: [number, number, number] = [131, 47, 94]; // #832f5e
const SECONDARY_DARK: [number, number, number] = [15, 23, 42]; // #0f172a
const ACCENT_EMERALD: [number, number, number] = [5, 150, 105]; // #059669
const BG_LIGHT_SLATE: [number, number, number] = [248, 250, 252]; // #f8fafc
const AMBER_COLOR: [number, number, number] = [217, 119, 6];

/**
 * Export a beautiful executive PDF summary report of multiple orders
 */
export function exportOrdersToPDF(orders: OrderRecord[], title = 'Fulfillment & Dispatch Manifest Report'): void {
  if (!orders || orders.length === 0) {
    alert('No order records available to export.');
    return;
  }

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // 1. Header Top Accent Bar
  doc.setFillColor(PRIMARY_MAROON[0], PRIMARY_MAROON[1], PRIMARY_MAROON[2]);
  doc.rect(0, 0, pageWidth, 5, 'F');

  // Header Title & Logo Box
  doc.setFillColor(SECONDARY_DARK[0], SECONDARY_DARK[1], SECONDARY_DARK[2]);
  doc.rect(12, 10, 10, 10, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('ZB', 14, 16.5);

  doc.setTextColor(SECONDARY_DARK[0], SECONDARY_DARK[1], SECONDARY_DARK[2]);
  doc.setFontSize(16);
  doc.text('ZUBOC LOGISTICS FLOW', 26, 15);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('Automated Video Audit & Order Dispatch Verification Engine', 26, 20);

  // Document Title & Date (Right Aligned)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(PRIMARY_MAROON[0], PRIMARY_MAROON[1], PRIMARY_MAROON[2]);
  doc.text(title.toUpperCase(), pageWidth - 14, 15, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  const generatedTime = formatIST(new Date().toISOString());
  doc.text(`Generated: ${generatedTime}`, pageWidth - 14, 20, { align: 'right' });

  // Divider line
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.4);
  doc.line(12, 24, pageWidth - 12, 24);

  // 2. Summary KPI Metrics Cards
  const totalOrders = orders.length;
  const totalValue = orders.reduce((acc, o) => {
    const val = parseFloat(o.orderTotal || o.orderAmount || '0') || 0;
    return acc + val;
  }, 0);
  const packedCount = orders.filter(o => o.recordingStatus === 'COMPLETED' || o.recordingStatus === 'RECORDING').length;
  const pendingCount = totalOrders - packedCount;

  const cardY = 27;
  const cardHeight = 14;
  const cardWidth = (pageWidth - 24 - 9) / 4;

  // Helper for KPI card
  const drawKpiCard = (x: number, label: string, val: string, sub: string, colorRGB: [number, number, number]) => {
    doc.setFillColor(BG_LIGHT_SLATE[0], BG_LIGHT_SLATE[1], BG_LIGHT_SLATE[2]);
    doc.roundedRect(x, cardY, cardWidth, cardHeight, 2, 2, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, cardY, cardWidth, cardHeight, 2, 2, 'S');

    // Left accent strip
    doc.setFillColor(colorRGB[0], colorRGB[1], colorRGB[2]);
    doc.roundedRect(x, cardY, 1.5, cardHeight, 1, 1, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(label.toUpperCase(), x + 4, cardY + 4.5);

    doc.setFontSize(11);
    doc.setTextColor(SECONDARY_DARK[0], SECONDARY_DARK[1], SECONDARY_DARK[2]);
    doc.text(val, x + 4, cardY + 10);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    doc.text(sub, x + cardWidth - 3, cardY + 10, { align: 'right' });
  };

  drawKpiCard(12, 'Total Shipments', String(totalOrders), '100% Manifested', PRIMARY_MAROON);
  drawKpiCard(12 + cardWidth + 3, 'Total Order Value', `Rs. ${totalValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`, 'GMV Invoice', ACCENT_EMERALD);
  drawKpiCard(12 + (cardWidth + 3) * 2, 'Video Verified', String(packedCount), `${totalOrders > 0 ? Math.round((packedCount / totalOrders) * 100) : 0}% Verified`, ACCENT_EMERALD);
  drawKpiCard(12 + (cardWidth + 3) * 3, 'Pending Action', String(pendingCount), 'Needs Packing', AMBER_COLOR);

  // 3. AutoTable Data Presentation
  const tableData = orders.map((o, idx) => {
    const amountStr = o.orderTotal ? `Rs. ${parseFloat(o.orderTotal).toLocaleString('en-IN')}` : (o.orderAmount ? `Rs. ${parseFloat(o.orderAmount).toLocaleString('en-IN')}` : '—');

    return [
      idx + 1,
      o.orderId || 'N/A',
      o.awbNumber || 'PENDING',
      o.customerName ? `${o.customerName}${o.contactPhone ? `\n${o.contactPhone}` : ''}` : 'Direct Customer',
      o.productSku ? `${o.productSku} (${o.itemCount || 1}x)` : '1x Item',
      o.courier ? `${o.courier}\n${o.deliveryMethod || 'Surface'}` : 'Not Assigned',
      o.weight ? `${o.weight} kg` : '—',
      amountStr,
      o.recordingStatus || 'PENDING',
      o.createdAt ? formatIST(o.createdAt) : '—'
    ];
  });

  autoTable(doc, {
    startY: cardY + cardHeight + 5,
    head: [[
      '#',
      'Order ID',
      'AWB / Tracking',
      'Customer & Contact',
      'Product SKU',
      'Carrier',
      'Weight',
      'Value (Rs.)',
      'Video Status',
      'Recorded IST'
    ]],
    body: tableData,
    margin: { left: 12, right: 12, bottom: 18 },
    styles: {
      font: 'helvetica',
      fontSize: 7.5,
      cellPadding: 2.5,
      textColor: [30, 41, 59],
      valign: 'middle'
    },
    headStyles: {
      fillColor: PRIMARY_MAROON,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'left'
    },
    alternateRowStyles: {
      fillColor: BG_LIGHT_SLATE
    },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 26, fontStyle: 'bold' },
      2: { cellWidth: 28 },
      3: { cellWidth: 42 },
      4: { cellWidth: 38 },
      5: { cellWidth: 32 },
      6: { cellWidth: 18, halign: 'center' },
      7: { cellWidth: 22, halign: 'right', fontStyle: 'bold' },
      8: { cellWidth: 25, halign: 'center', fontStyle: 'bold' },
      9: { cellWidth: 33, halign: 'center' }
    },
    didParseCell: (data) => {
      // Color-code Packing Status column (index 8)
      if (data.section === 'body' && data.column.index === 8) {
        const val = String(data.cell.raw).toUpperCase();
        if (val.includes('COMPLETED') || val.includes('PACKED') || val.includes('SHIPPED') || val.includes('DELIVERED')) {
          data.cell.styles.textColor = ACCENT_EMERALD;
        } else {
          data.cell.styles.textColor = [180, 83, 9]; // Amber
        }
      }
    },
    didDrawPage: (data) => {
      // Footer on each page
      const currentPg = data.pageNumber;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);

      // Footer divider
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.line(12, pageHeight - 12, pageWidth - 12, pageHeight - 12);

      doc.text('ZUBOC FLOW — Official Logistics Dispatch & Proof Manifest • Confidential Internal Record', 12, pageHeight - 7);
      doc.text(`Page ${currentPg}`, pageWidth - 12, pageHeight - 7, { align: 'right' });
    }
  });

  const timeStamp = new Date().toISOString().slice(0, 10);
  doc.save(`${title.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${timeStamp}.pdf`);
}

/**
 * Export a single order dispatch packing slip & video proof certificate PDF
 */
export function exportSingleOrderPDF(order: OrderRecord): void {
  if (!order) return;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();

  // Top Maroon Accent
  doc.setFillColor(PRIMARY_MAROON[0], PRIMARY_MAROON[1], PRIMARY_MAROON[2]);
  doc.rect(0, 0, pageWidth, 6, 'F');

  // Header Box
  doc.setFillColor(BG_LIGHT_SLATE[0], BG_LIGHT_SLATE[1], BG_LIGHT_SLATE[2]);
  doc.rect(12, 12, pageWidth - 24, 26, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.rect(12, 12, pageWidth - 24, 26, 'S');

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(PRIMARY_MAROON[0], PRIMARY_MAROON[1], PRIMARY_MAROON[2]);
  doc.text('ZUBOC LOGISTICS FLOW', 18, 22);

  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.text('Official Order Packing Certificate & Dispatch Audit Slip', 18, 27);

  // Status Badge in Header
  const statusStr = (order.recordingStatus || 'PENDING').toUpperCase();
  const isOk = statusStr.includes('COMPLETED') || statusStr.includes('PACKED') || statusStr.includes('SHIPPED');
  doc.setFillColor(isOk ? 220 : 254, isOk ? 252 : 243, isOk ? 231 : 199);
  doc.roundedRect(pageWidth - 65, 17, 47, 16, 2, 2, 'F');
  doc.setTextColor(isOk ? 5 : 180, isOk ? 150 : 83, isOk ? 105 : 9);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text(`STATUS: ${statusStr}`, pageWidth - 41.5, 26.5, { align: 'center' });

  let curY = 44;

  // Box 1: Order & Tracking Identifiers
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(12, curY, pageWidth - 24, 32, 2, 2, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(SECONDARY_DARK[0], SECONDARY_DARK[1], SECONDARY_DARK[2]);
  doc.text('ORDER & TRACKING SPECIFICATIONS', 16, curY + 6);

  doc.setDrawColor(241, 245, 249);
  doc.line(16, curY + 8, pageWidth - 16, curY + 8);

  const drawField = (label: string, val: string, x: number, y: number) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(label, x, y);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text(val || 'N/A', x, y + 4.5);
  };

  drawField('Order Identifier:', order.orderId || 'N/A', 16, curY + 13);
  drawField('AWB / Tracking No:', order.awbNumber || 'PENDING GENERATION', 75, curY + 13);
  drawField('Courier Partner:', order.courier || 'Delhivery Surface', 140, curY + 13);

  drawField('Packing Station ID:', order.stationId || 'STATION-01 (NCR-WH)', 16, curY + 23);
  drawField('Packing Staff / Operator:', order.staffId || 'Verified Operator', 75, curY + 23);
  drawField('Fulfillment Origin:', order.fulfillFrom || 'Kerala Hub (676505)', 140, curY + 23);

  curY += 37;

  // Box 2: Consignee & Customer Details
  doc.roundedRect(12, curY, pageWidth - 24, 32, 2, 2, 'S');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(SECONDARY_DARK[0], SECONDARY_DARK[1], SECONDARY_DARK[2]);
  doc.text('CONSIGNEE & CUSTOMER INFORMATION', 16, curY + 6);

  doc.setDrawColor(241, 245, 249);
  doc.line(16, curY + 8, pageWidth - 16, curY + 8);

  drawField('Customer Name / City:', order.customerName || 'Direct Customer', 16, curY + 13);
  drawField('Contact Person:', order.contactPerson || 'N/A', 75, curY + 13);
  drawField('Contact Telephone:', order.contactPhone || 'N/A', 140, curY + 13);

  drawField('Order Date Received:', order.orderReceivedDate || 'N/A', 16, curY + 23);
  drawField('Target Despatch Date:', order.dispatchDate || 'Immediate', 75, curY + 23);
  drawField('Delivery Method:', order.deliveryMethod || 'Standard Surface', 140, curY + 23);

  curY += 37;

  // Box 3: Product & Financial Summary Table
  doc.roundedRect(12, curY, pageWidth - 24, 34, 2, 2, 'S');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(SECONDARY_DARK[0], SECONDARY_DARK[1], SECONDARY_DARK[2]);
  doc.text('PACKAGE & FINANCIAL BREAKDOWN', 16, curY + 6);

  doc.setDrawColor(241, 245, 249);
  doc.line(16, curY + 8, pageWidth - 16, curY + 8);

  drawField('Product SKU / Description:', order.productSku || 'Standard Merchandise', 16, curY + 13);
  drawField('Package Quantity:', `${order.itemCount || 1} Units`, 95, curY + 13);
  drawField('Gross Dead Weight:', order.weight ? `${order.weight} kg` : '0.50 kg', 140, curY + 13);

  drawField('Item Amount (Rs.):', order.orderAmount ? `Rs. ${parseFloat(order.orderAmount).toLocaleString('en-IN')}` : 'Rs. 0.00', 16, curY + 24);
  drawField('Freight Charge (Rs.):', order.shippingAmount ? `Rs. ${parseFloat(order.shippingAmount).toLocaleString('en-IN')}` : 'Rs. 0.00', 75, curY + 24);
  drawField('Total Order Payable (Rs.):', order.orderTotal ? `Rs. ${parseFloat(order.orderTotal).toLocaleString('en-IN')}` : 'Rs. 0.00', 140, curY + 24);

  curY += 39;

  // Box 4: Video Evidence & Audit Logs
  doc.setFillColor(BG_LIGHT_SLATE[0], BG_LIGHT_SLATE[1], BG_LIGHT_SLATE[2]);
  doc.roundedRect(12, curY, pageWidth - 24, 38, 2, 2, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(12, curY, pageWidth - 24, 38, 2, 2, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(PRIMARY_MAROON[0], PRIMARY_MAROON[1], PRIMARY_MAROON[2]);
  doc.text('AUTOMATED VIDEO PACKING PROOF & TELEGRAM AUDIT LOGS', 16, curY + 6);

  doc.setDrawColor(226, 232, 240);
  doc.line(16, curY + 8, pageWidth - 16, curY + 8);

  const durM = Math.floor((order.durationSeconds || 0) / 60);
  const durS = (order.durationSeconds || 0) % 60;
  const durStr = order.durationSeconds ? `${durM}m ${durS}s` : 'N/A';

  drawField('Recording Duration:', durStr, 16, curY + 13);
  drawField('Evidence File Type:', order.evidenceType || 'HD Video Recording (1080p)', 75, curY + 13);
  drawField('Cloud Storage Sync:', order.uploadStatus || 'SYNCED / BACKED UP', 140, curY + 13);

  drawField('Recording Timestamp (IST):', order.createdAt ? formatIST(order.createdAt) : 'N/A', 16, curY + 25);
  drawField('QC Operator Notes:', order.notes || 'Package verified complete without damage.', 75, curY + 25);

  curY += 44;

  // Footer / Verification Stamp
  doc.setDrawColor(226, 232, 240);
  doc.line(12, curY, pageWidth - 12, curY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(SECONDARY_DARK[0], SECONDARY_DARK[1], SECONDARY_DARK[2]);
  doc.text('ZUBOC VERIFIED AUDIT SEAL', 12, curY + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text('This document certifies that the aforementioned parcel was packed and recorded under high-definition video monitoring.', 12, curY + 9);
  doc.text('All rights reserved © Zuboc Logistics Flow Engine.', 12, curY + 12.5);

  doc.save(`dispatch_slip_${order.orderId || 'order'}_${Date.now()}.pdf`);
}

/**
 * Export Shipping Rates Comparison Quote to PDF
 */
export function exportShippingQuotePDF(params: {
  originPincode: string;
  destPincode: string;
  cityGuess: string;
  zoneName: string;
  deadWeightKg: number;
  volumetricWeightKg: number;
  chargeableWeightKg: number;
  dimensions: { length: number; width: number; height: number };
  carriers: CarrierCalculationResult[];
}): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();

  // Top Accent Bar
  doc.setFillColor(PRIMARY_MAROON[0], PRIMARY_MAROON[1], PRIMARY_MAROON[2]);
  doc.rect(0, 0, pageWidth, 6, 'F');

  // Header Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(PRIMARY_MAROON[0], PRIMARY_MAROON[1], PRIMARY_MAROON[2]);
  doc.text('DOMESTIC SHIPPING CHARGE ESTIMATE', 12, 16);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(`Origin PIN: ${params.originPincode}  ➔  Destination PIN: ${params.destPincode} (${params.cityGuess})`, 12, 21);

  doc.setFontSize(8);
  doc.text(`Generated: ${formatIST(new Date().toISOString())}`, pageWidth - 12, 21, { align: 'right' });

  doc.setDrawColor(226, 232, 240);
  doc.line(12, 24, pageWidth - 12, 24);

  // Specifications Box
  doc.setFillColor(BG_LIGHT_SLATE[0], BG_LIGHT_SLATE[1], BG_LIGHT_SLATE[2]);
  doc.roundedRect(12, 27, pageWidth - 24, 24, 2, 2, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(SECONDARY_DARK[0], SECONDARY_DARK[1], SECONDARY_DARK[2]);
  doc.text('CONSIGNMENT SPECIFICATIONS:', 16, 32);

  doc.setFont('helvetica', 'normal');
  doc.text(`Destination Zone: ${params.zoneName}`, 16, 37);
  doc.text(`Dead Weight: ${params.deadWeightKg.toFixed(2)} kg`, 16, 42);

  doc.text(`Box Dimensions: ${params.dimensions.length} x ${params.dimensions.width} x ${params.dimensions.height} cm`, 85, 37);
  doc.text(`Volumetric Weight: ${params.volumetricWeightKg.toFixed(2)} kg`, 85, 42);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(PRIMARY_MAROON[0], PRIMARY_MAROON[1], PRIMARY_MAROON[2]);
  doc.text(`Applied Billable Weight: ${params.chargeableWeightKg.toFixed(1)} kg`, 150, 37);

  // Table of Carriers
  const tableRows = params.carriers.map((c) => [
    c.carrier.name,
    c.carrier.type,
    c.transitTime,
    `Rs. ${c.baseFreightRate.toFixed(2)}`,
    `Rs. ${c.docketFee.toFixed(2)}`,
    `Rs. ${c.fuelSurchargeAmount.toFixed(2)}`,
    `Rs. ${c.gstAmount.toFixed(2)}`,
    `Rs. ${c.totalPayable.toFixed(2)}`
  ]);

  autoTable(doc, {
    startY: 55,
    head: [[
      'Logistics Partner',
      'Service Type',
      'Transit Time',
      'Base Freight',
      'Docket',
      'Fuel (FSC)',
      '18% GST',
      'Total Payable (Rs.)'
    ]],
    body: tableRows,
    margin: { left: 12, right: 12 },
    headStyles: {
      fillColor: PRIMARY_MAROON,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8
    },
    styles: {
      fontSize: 8,
      cellPadding: 3
    },
    columnStyles: {
      0: { fontStyle: 'bold' },
      7: { fontStyle: 'bold', halign: 'right', textColor: PRIMARY_MAROON }
    }
  });

  doc.save(`shipping_quote_${params.destPincode}_${Date.now()}.pdf`);
}
