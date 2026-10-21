import React, { useState, useRef } from 'react';
import { 
  X, 
  Upload, 
  FileSpreadsheet, 
  Download, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Box, 
  Search, 
  Layers, 
  ArrowRight,
  ShieldCheck,
  Check,
  Sparkles
} from 'lucide-react';
import { 
  parseOrdersCsv, 
  ParsedShopifyOrder, 
  getSampleShopifyCsvContent 
} from '../utils/shopifyCsvParser';
import { safeFetchJson } from '../utils/api';
import { OrderRecord } from '../types';


interface ImportShopifyCsvModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (importedCount: number) => void;
  existingOrderIds?: string[];
}

export const ImportShopifyCsvModal: React.FC<ImportShopifyCsvModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  existingOrderIds = []
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [detectedFormat, setDetectedFormat] = useState<'Shopify CSV' | 'Custom CSV' | null>(null);
  const [parsedOrders, setParsedOrders] = useState<ParsedShopifyOrder[]>([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [filteredOutUnfulfilled, setFilteredOutUnfulfilled] = useState<number>(0);
  const [duplicateRowsCount, setDuplicateRowsCount] = useState<number>(0);
  
  // Conflict handling: 'skip' | 'overwrite' | 'merge'
  const [conflictStrategy, setConflictStrategy] = useState<'skip' | 'overwrite' | 'merge'>('skip');
  const [searchQuery, setSearchQuery] = useState('');

  // Upload/Import State
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResults, setImportResults] = useState<{
    created: number;
    updated: number;
    skipped: number;
    total: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      processFile(selectedFile);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const processFile = async (selectedFile: File) => {
    setFile(selectedFile);
    setIsParsing(true);
    setParseError(null);
    setImportResults(null);
    setFilteredOutUnfulfilled(0);
    setDuplicateRowsCount(0);

    try {
      const buffer = await selectedFile.arrayBuffer();
      const result = parseOrdersCsv(buffer);

      setFilteredOutUnfulfilled(result.filteredOutUnfulfilledCount || 0);
      setDuplicateRowsCount(result.duplicateRowsDiscarded || 0);

      if (!result.success || result.orders.length === 0) {
        setParseError(
          result.errors[0] || 
          (result.filteredOutUnfulfilledCount > 0 
            ? `Found ${result.filteredOutUnfulfilledCount} row(s) in CSV, but none had fulfillment status 'fulfilled'. Only fulfilled orders are imported.`
            : 'No valid orders found in CSV file.')
        );
        setParsedOrders([]);
        setSelectedOrderIds(new Set());
      } else {
        setDetectedFormat(result.detectedFormat);
        setParsedOrders(result.orders);
        // Default select all parsed orders
        setSelectedOrderIds(new Set(result.orders.map(o => o.orderId)));
      }
    } catch (err: any) {
      setParseError('Failed to read CSV file. Please make sure it is a valid file.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleDownloadSample = () => {
    const csvContent = getSampleShopifyCsvContent();
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'shopify_orders_sample_zuboc.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const toggleSelectAll = () => {
    if (selectedOrderIds.size === filteredOrders.length) {
      setSelectedOrderIds(new Set());
    } else {
      setSelectedOrderIds(new Set(filteredOrders.map(o => o.orderId)));
    }
  };

  const toggleSelectOrder = (id: string) => {
    const newSet = new Set(selectedOrderIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedOrderIds(newSet);
  };

  const filteredOrders = parsedOrders.filter(o => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      o.orderId.toLowerCase().includes(q) ||
      (o.customerName && o.customerName.toLowerCase().includes(q)) ||
      (o.contactPhone && o.contactPhone.toLowerCase().includes(q)) ||
      (o.productSku && o.productSku.toLowerCase().includes(q))
    );
  });

  const existingSet = new Set(existingOrderIds.map(id => id.toLowerCase()));
  const conflictCount = parsedOrders.filter(o => existingSet.has(o.orderId.toLowerCase())).length;

  const handleStartImport = async () => {
    const ordersToImport = parsedOrders.filter(o => selectedOrderIds.has(o.orderId));
    if (ordersToImport.length === 0) return;

    setIsImporting(true);
    setImportProgress(10);

    const now = new Date().toISOString();
    let created = 0;
    let updated = 0;
    let skipped = 0;

    const formattedPayload = ordersToImport.map(o => {
      const cleanRecord: Partial<OrderRecord> = {
        orderId: o.orderId,
        order_source: 'website',
        orderSource: 'website',
        order_number_num: o.order_number_num,
        customerName: o.customerName,
        contactPerson: o.contactPerson,
        contactPhone: o.contactPhone,
        productSku: o.productSku,
        itemCount: o.itemCount,
        orderAmount: o.orderAmount,
        shippingAmount: o.shippingAmount,
        orderTotal: o.orderTotal,
        courier: o.courier,
        awbNumber: o.awbNumber,
        orderReceivedDate: o.orderReceivedDate,
        fulfillmentStatus: o.fulfillmentStatus,
        notes: o.notes,
        // All 26 Whitelisted Shopify data fields
        email: o.email,
        financialStatus: o.financialStatus,
        subtotal: o.subtotal,
        shipping: o.shipping,
        taxes: o.taxes,
        total: o.total,
        discountCode: o.discountCode,
        discountAmount: o.discountAmount,
        shippingMethod: o.shippingMethod,
        shippingName: o.shippingName,
        shippingStreet: o.shippingStreet,
        shippingAddress1: o.shippingAddress1,
        shippingAddress2: o.shippingAddress2,
        shippingCompany: o.shippingCompany,
        shippingCity: o.shippingCity,
        shippingZip: o.shippingZip,
        shippingProvince: o.shippingProvince,
        shippingCountry: o.shippingCountry,
        shippingPhone: o.shippingPhone,
        lineItems: o.lineItems,
        isProductionDeckOrder: true,
        recordingStatus: 'PENDING',
        uploadStatus: 'PENDING',
        createdAt: o.createdAt || o.orderReceivedDate || now,
        updatedAt: now
      };
      return cleanRecord;
    });

    try {
      // 1. Send bulk payload to server API
      setImportProgress(40);
      const res = await safeFetchJson('/api/orders/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orders: formattedPayload,
          conflictStrategy
        })
      });

      setImportProgress(100);

      if (res && res.stats) {
        created = res.stats.created;
        updated = res.stats.updated;
        skipped = res.stats.skipped;
      } else {
        created = ordersToImport.length - (conflictStrategy === 'skip' ? conflictCount : 0);
        updated = conflictStrategy !== 'skip' ? conflictCount : 0;
      }

      setImportResults({
        created,
        updated,
        skipped,
        total: ordersToImport.length
      });

      if (onSuccess) {
        onSuccess(created + updated);
      }
    } catch (err: any) {
      console.error('Bulk import error:', err);
      setParseError('Failed to import orders. Please check network connection.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setParsedOrders([]);
    setSelectedOrderIds(new Set());
    setParseError(null);
    setImportResults(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl border border-stone-200/80 max-w-4xl w-full p-6 text-slate-800 my-6 animate-in fade-in zoom-in-95 duration-200 max-h-[92vh] flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-stone-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 flex items-center justify-center shadow-inner">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                Import Shopify Orders CSV
                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  <Sparkles className="w-3 h-3 text-emerald-600" /> Auto-Group Multi-Items
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Bulk upload Shopify order exports (<code className="text-emerald-700 bg-emerald-50 px-1 py-0.5 rounded">orders_export.csv</code>) or custom CSV files
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4">

          {/* SUCCESS RESULTS VIEW */}
          {importResults ? (
            <div className="bg-emerald-50/80 border border-emerald-200/80 rounded-2xl p-6 text-center animate-in fade-in zoom-in-95">
              <div className="w-16 h-16 bg-emerald-500 text-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/20">
                <CheckCircle2 className="w-9 h-9" />
              </div>
              <h3 className="text-xl font-bold text-slate-900">Import Successful!</h3>
              <p className="text-sm text-slate-600 mt-1 max-w-md mx-auto">
                Successfully processed {importResults.total} orders into the packing & fulfillment pipeline.
              </p>

              <div className="grid grid-cols-3 gap-3 max-w-lg mx-auto mt-6">
                <div className="bg-white p-3.5 rounded-xl border border-stone-200 shadow-sm">
                  <span className="text-2xl font-black text-emerald-600">{importResults.created}</span>
                  <p className="text-xs font-medium text-slate-500 mt-0.5">New Orders Added</p>
                </div>
                <div className="bg-white p-3.5 rounded-xl border border-stone-200 shadow-sm">
                  <span className="text-2xl font-black text-blue-600">{importResults.updated}</span>
                  <p className="text-xs font-medium text-slate-500 mt-0.5">Orders Updated</p>
                </div>
                <div className="bg-white p-3.5 rounded-xl border border-stone-200 shadow-sm">
                  <span className="text-2xl font-black text-slate-400">{importResults.skipped}</span>
                  <p className="text-xs font-medium text-slate-500 mt-0.5">Duplicates Skipped</p>
                </div>
              </div>

              <div className="mt-8 flex items-center justify-center gap-3">
                <button
                  onClick={handleReset}
                  className="px-5 py-2.5 rounded-xl border border-stone-300 font-semibold text-slate-700 hover:bg-slate-100 text-sm transition-all"
                >
                  Import Another CSV
                </button>
                <button
                  onClick={onClose}
                  className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md transition-all flex items-center gap-2"
                >
                  Done & View Orders <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : parsedOrders.length === 0 ? (
            /* UPLOAD FILE & DROPZONE STEP */
            <div className="space-y-4">
              
              {/* Dropzone */}
              <div
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-stone-300 hover:border-emerald-500 bg-stone-50/70 hover:bg-emerald-50/30 rounded-2xl p-8 text-center cursor-pointer transition-all group relative overflow-hidden"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt,.xlsx,.xls"
                  onChange={handleFileChange}
                  className="hidden"
                />
                
                <div className="w-16 h-16 rounded-2xl bg-white border border-stone-200 text-emerald-600 flex items-center justify-center mx-auto mb-3 shadow-sm group-hover:scale-110 transition-transform">
                  <Upload className="w-8 h-8" />
                </div>
                
                <h3 className="text-base font-bold text-slate-800">
                  {isParsing ? 'Parsing CSV File...' : 'Drop your Shopify orders CSV here'}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Supports <span className="font-semibold text-emerald-700">orders_export_1.csv</span> exported directly from Shopify Admin or custom CSVs
                </p>

                <div className="mt-4 inline-flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-xl bg-emerald-600 text-white shadow-sm group-hover:bg-emerald-700 transition-colors">
                  <FileSpreadsheet className="w-4 h-4" /> Select CSV File
                </div>
              </div>

              {parseError && (
                <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-500" />
                  <div>
                    <strong className="font-semibold block">Parse Error</strong>
                    {parseError}
                  </div>
                </div>
              )}

              {/* Sample Download & Instructions */}
              <div className="bg-stone-50 rounded-2xl p-4 border border-stone-200/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                <div>
                  <span className="font-bold text-slate-800 block">Need a test template or format preview?</span>
                  <p className="text-slate-500">Download our sample Shopify CSV containing sample multi-item order entries.</p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadSample}
                  className="px-4 py-2 rounded-xl bg-white border border-stone-300 text-slate-700 hover:bg-stone-100 font-semibold flex items-center gap-2 shadow-xs transition-colors flex-shrink-0"
                >
                  <Download className="w-4 h-4 text-emerald-600" /> Download Sample CSV
                </button>
              </div>

              {/* How it handles Shopify CSV */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                <div className="p-3.5 bg-white rounded-xl border border-stone-200 shadow-xs">
                  <div className="flex items-center gap-2 text-slate-800 font-bold text-xs mb-1">
                    <Layers className="w-4 h-4 text-emerald-600" /> Item Aggregation
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Automatically combines multiple line items sharing the same order number into a single item list.
                  </p>
                </div>

                <div className="p-3.5 bg-white rounded-xl border border-stone-200 shadow-xs">
                  <div className="flex items-center gap-2 text-slate-800 font-bold text-xs mb-1">
                    <ShieldCheck className="w-4 h-4 text-blue-600" /> Smart De-duplication
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Detects existing orders in your packing database to avoid duplicate recordings or overwrites.
                  </p>
                </div>

                <div className="p-3.5 bg-white rounded-xl border border-stone-200 shadow-xs">
                  <div className="flex items-center gap-2 text-slate-800 font-bold text-xs mb-1">
                    <Box className="w-4 h-4 text-amber-600" /> Carrier & Phone Resolution
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Extracts shipping telephone, customer address, delivery method (Delhivery/BlueDart), and total amounts.
                  </p>
                </div>
              </div>

            </div>
          ) : (
            /* PREVIEW & CONFLICT SETTINGS STEP */
            <div className="space-y-4">
              
              {/* File Info & Change File */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-stone-50 p-3.5 rounded-2xl border border-stone-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-sm">{file?.name || 'CSV File'}</span>
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold text-[10px] rounded-full">
                        {detectedFormat}
                      </span>
                      <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 font-bold text-[10px] rounded-full">
                        Channel: Website
                      </span>
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-700 font-mono text-[10px] rounded-full">
                        26 Whitelist Fields
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-500">
                      <span>Found <strong className="text-slate-800">{parsedOrders.length} unique orders</strong> ready for import</span>
                      {filteredOutUnfulfilled > 0 && (
                        <span className="text-amber-600 font-medium">({filteredOutUnfulfilled} unfulfilled ignored)</span>
                      )}
                      {duplicateRowsCount > 0 && (
                        <span className="text-blue-600 font-medium">({duplicateRowsCount} duplicate item rows merged)</span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleReset}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-stone-300 text-slate-600 hover:bg-white transition-colors flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Change CSV
                </button>
              </div>

              {/* Conflict Handling Options */}
              {conflictCount > 0 && (
                <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-3.5 text-xs">
                  <div className="flex items-center gap-2 text-amber-900 font-bold mb-2">
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                    <span>{conflictCount} orders already exist in your packing records</span>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-4 text-slate-700">
                    <label className="flex items-center gap-1.5 cursor-pointer font-medium">
                      <input
                        type="radio"
                        name="conflict"
                        value="skip"
                        checked={conflictStrategy === 'skip'}
                        onChange={() => setConflictStrategy('skip')}
                        className="text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>Skip existing orders (Keep current)</span>
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer font-medium">
                      <input
                        type="radio"
                        name="conflict"
                        value="merge"
                        checked={conflictStrategy === 'merge'}
                        onChange={() => setConflictStrategy('merge')}
                        className="text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>Merge missing details</span>
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer font-medium">
                      <input
                        type="radio"
                        name="conflict"
                        value="overwrite"
                        checked={conflictStrategy === 'overwrite'}
                        onChange={() => setConflictStrategy('overwrite')}
                        className="text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>Overwrite existing records</span>
                    </label>
                  </div>
                </div>
              )}

              {/* Search & Selection Controls */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by Order ID, Customer, Phone, SKU..."
                    className="w-full pl-9 pr-3 py-1.5 bg-stone-50 border border-stone-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    className="px-3 py-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 text-slate-700 font-semibold transition-colors"
                  >
                    {selectedOrderIds.size === filteredOrders.length ? 'Deselect All' : 'Select All'}
                  </button>
                  <span className="text-slate-500 font-medium">
                    Selected: <strong className="text-emerald-700">{selectedOrderIds.size}</strong> / {parsedOrders.length}
                  </span>
                </div>
              </div>

              {/* Orders Table */}
              <div className="border border-stone-200 rounded-2xl overflow-hidden shadow-xs max-h-[300px] overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-stone-100/80 text-slate-600 uppercase font-bold text-[10px] sticky top-0 z-10 border-b border-stone-200">
                    <tr>
                      <th className="p-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={selectedOrderIds.size === filteredOrders.length && filteredOrders.length > 0}
                          onChange={toggleSelectAll}
                          className="rounded border-stone-300 text-emerald-600 focus:ring-emerald-500"
                        />
                      </th>
                      <th className="p-3">Order ID</th>
                      <th className="p-3">Customer & Contact</th>
                      <th className="p-3">Products & SKU(s)</th>
                      <th className="p-3">Courier / Delivery</th>
                      <th className="p-3 text-right">Total (₹)</th>
                      <th className="p-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 bg-white">
                    {filteredOrders.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-6 text-center text-slate-400">
                          No matching orders found.
                        </td>
                      </tr>
                    ) : (
                      filteredOrders.map(order => {
                        const isSelected = selectedOrderIds.has(order.orderId);
                        const exists = existingSet.has(order.orderId.toLowerCase());

                        return (
                          <tr 
                            key={order.orderId}
                            onClick={() => toggleSelectOrder(order.orderId)}
                            className={`cursor-pointer transition-colors ${
                              isSelected ? 'bg-emerald-50/40 hover:bg-emerald-50/70' : 'hover:bg-stone-50'
                            }`}
                          >
                            <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelectOrder(order.orderId)}
                                className="rounded border-stone-300 text-emerald-600 focus:ring-emerald-500"
                              />
                            </td>
                            <td className="p-3 font-bold text-slate-900">
                              <div className="flex items-center gap-1.5">
                                <span>{order.orderId}</span>
                                {exists && (
                                  <span className="px-1.5 py-0.2 bg-amber-100 text-amber-800 text-[9px] font-bold rounded">
                                    Exists
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-slate-400 block font-normal">
                                {order.lineItemCount > 1 ? `${order.lineItemCount} items aggregated` : '1 line item'}
                              </span>
                            </td>
                            <td className="p-3">
                              <span className="font-semibold text-slate-800 block">{order.customerName || 'N/A'}</span>
                              <span className="text-[11px] text-slate-500">{order.contactPhone || 'No Phone'}</span>
                            </td>
                            <td className="p-3 max-w-[220px]">
                              <p className="truncate font-medium text-slate-700" title={order.productSku}>
                                {order.productSku || 'Item'}
                              </p>
                              <span className="text-[10px] text-slate-400">Qty: {order.itemCount}</span>
                            </td>
                            <td className="p-3">
                              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-semibold text-[10px]">
                                {order.courier || 'Standard'}
                              </span>
                            </td>
                            <td className="p-3 text-right font-bold text-slate-900">
                              {order.orderTotal ? `₹${order.orderTotal}` : '—'}
                            </td>
                            <td className="p-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                order.fulfillmentStatus === 'Fulfilled' ? 'bg-emerald-100 text-emerald-800' :
                                order.fulfillmentStatus === 'Packed' ? 'bg-blue-100 text-blue-800' :
                                order.fulfillmentStatus === 'Shipped' ? 'bg-indigo-100 text-indigo-800' :
                                'bg-amber-100 text-amber-800'
                              }`}>
                                {order.fulfillmentStatus}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

            </div>
          )}

        </div>

        {/* Footer Actions */}
        {!importResults && (
          <div className="pt-4 border-t border-stone-100 flex items-center justify-between flex-shrink-0 gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isImporting}
              className="px-4 py-2 rounded-xl border border-stone-300 text-slate-700 hover:bg-stone-100 font-semibold text-xs transition-colors"
            >
              Cancel
            </button>

            {parsedOrders.length > 0 && (
              <button
                type="button"
                onClick={handleStartImport}
                disabled={isImporting || selectedOrderIds.size === 0}
                className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-sm shadow-md transition-all flex items-center gap-2"
              >
                {isImporting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Importing ({importProgress}%)...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" /> Import {selectedOrderIds.size} Selected Orders
                  </>
                )}
              </button>
            )}
          </div>
        )}

      </div>
    </div>
  );
};
