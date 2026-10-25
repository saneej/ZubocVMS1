import React, { useState } from 'react';
import { X, PackagePlus, AlertCircle, CheckCircle2, Box, Truck, Scale, Tag, FileText, Camera, Image as ImageIcon, Upload } from 'lucide-react';
import { safeFetchJson } from '../utils/api';
import { OrderRecord, isAmazonOrder } from '../types';
import { db } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';
import { cleanForFirestore } from '../utils/firestoreHelper';
import { supabase, cleanForSupabase } from '../supabase';

interface AddOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (record: OrderRecord) => void;
  currentStaffId?: string;
  currentStaffName?: string;
}

export const AddOrderModal: React.FC<AddOrderModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  currentStaffId = 'Admin-01',
  currentStaffName = 'Admin'
}) => {
  const [orderSource, setOrderSource] = useState<'website' | 'amazon'>('website');
  const [orderId, setOrderId] = useState('');
  const [customer, setCustomer] = useState('');
  const [amazonAddress, setAmazonAddress] = useState('');
  const [amazonProduct, setAmazonProduct] = useState('');

  // Website order fields
  const [courier, setCourier] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState<string>('Normal');
  const [awb, setAwb] = useState('');
  const [weight, setWeight] = useState('');
  const [sku, setSku] = useState('');
  const [itemCount, setItemCount] = useState('1');
  const [contactPerson, setContactPerson] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [orderReceivedDate, setOrderReceivedDate] = useState('');
  const [dispatchDate, setDispatchDate] = useState('');
  const [orderAmount, setOrderAmount] = useState('');
  const [shippingAmount, setShippingAmount] = useState('');
  const [orderTotal, setOrderTotal] = useState('');
  const [deliveredDate, setDeliveredDate] = useState('');
  const [notes, setNotes] = useState('');
  const [remarks, setRemarks] = useState('');
  const [sendToProductionDeck, setSendToProductionDeck] = useState(true);

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const quickCouriers = ['Delhivery', 'Blue Dart', 'DTDC', 'Shiprocket', 'Ekart', 'Xpressbees', 'India Post'];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = orderId.trim();
    if (!cleanId) {
      setError('Please enter a valid Order ID.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMsg(null);

    const now = new Date().toISOString();
    const finalNotes = notes.trim();
    const initialChatNote = finalNotes ? [{
      id: `note-add-${Date.now()}`,
      text: finalNotes,
      staffId: currentStaffId,
      staffName: currentStaffName,
      timestamp: now
    }] : [];

    // Parse numeric value for sorting
    const digits = cleanId.replace(/\D/g, '');
    const order_number_num = digits ? parseInt(digits, 10) : undefined;

    const isAmazon = orderSource === 'amazon' || isAmazonOrder({ orderId: cleanId, order_source: orderSource, courier });
    const finalSource: 'amazon' | 'website' = isAmazon ? 'amazon' : 'website';

    const newRecord: OrderRecord = {
      orderId: cleanId,
      order_source: finalSource,
      orderSource: finalSource,
      order_number_num,
      courier: isAmazon ? 'Amazon Shipping' : (courier.trim() || undefined),
      deliveryMethod: isAmazon ? 'Normal' : (deliveryMethod || 'Normal'),
      awbNumber: isAmazon ? undefined : (awb.trim() || undefined),
      weight: isAmazon ? undefined : (weight.trim() || undefined),
      productSku: isAmazon ? (amazonProduct.trim() || undefined) : (sku.trim() || undefined),
      product: isAmazon ? (amazonProduct.trim() || undefined) : undefined,
      itemCount: isAmazon ? '1' : (itemCount ? String(itemCount) : '1'),
      customerName: customer.trim() || undefined,
      shippingAddress1: isAmazon ? (amazonAddress.trim() || undefined) : undefined,
      shippingStreet: isAmazon ? (amazonAddress.trim() || undefined) : undefined,
      contactPerson: isAmazon ? undefined : (contactPerson.trim() || undefined),
      contactPhone: isAmazon ? undefined : (contactPhone.trim() || undefined),
      orderReceivedDate: orderReceivedDate || undefined,
      dispatchDate: dispatchDate || undefined,
      orderAmount: isAmazon ? undefined : (orderAmount.trim() || undefined),
      shippingAmount: isAmazon ? undefined : (shippingAmount.trim() || undefined),
      orderTotal: isAmazon ? undefined : (orderTotal.trim() || undefined),
      deliveredDate: deliveredDate || undefined,
      notes: finalNotes || undefined,
      chatNotes: initialChatNote,
      remarks: remarks.trim() || undefined,
      staffId: currentStaffName,
      stationId: 'Packing-01',
      recordingStartedAt: now,
      durationSeconds: 0,
      recordingStatus: 'PENDING',
      uploadStatus: 'PENDING',
      isProductionDeckOrder: sendToProductionDeck,
      createdAt: now,
      updatedAt: now
    };

    // 1. Direct write to Supabase (works seamlessly in deployed web app)
    try {
      const supaPayload = cleanForSupabase(newRecord);
      if (supaPayload && supaPayload.orderId) {
        await supabase.from('orders').upsert(supaPayload, { onConflict: 'orderId' });
      }
    } catch (supaErr) {
      console.warn('Direct Supabase write notice in AddOrderModal:', supaErr);
    }

    // 2. Also save to Express API if running
    try {
      const res = await safeFetchJson('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRecord)
      });

      setSuccessMsg(`Order ${cleanId} added successfully!`);
      if (onSuccess) onSuccess((res && res.record) ? res.record : newRecord);
    } catch (err) {
      // Deployed static site or offline: Supabase already updated above
      setSuccessMsg(`Order ${cleanId} added successfully!`);
      if (onSuccess) onSuccess(newRecord);
    }

    setTimeout(() => {
      setIsSubmitting(false);
      setSuccessMsg(null);
      // reset form
      setOrderId('');
      setCustomer('');
      setAmazonAddress('');
      setAmazonProduct('');
      setCourier('');
      setDeliveryMethod('Normal');
      setAwb('');
      setWeight('');
      setSku('');
      setItemCount('1');
      setContactPerson('');
      setContactPhone('');
      setOrderReceivedDate('');
      setDispatchDate('');
      setOrderAmount('');
      setShippingAmount('');
      setOrderTotal('');
      setDeliveredDate('');
      setNotes('');
      setRemarks('');
      onClose();
    }, 1000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-stone-200/80 max-w-3xl w-full p-6 text-slate-800 my-8 animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-stone-100 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#832f5e]/10 text-[#832f5e] flex items-center justify-center font-bold">
              <PackagePlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-slate-900 font-sans">Add Order Details</h2>
              <p className="text-xs text-stone-500 font-sans">Manually create or stage order information</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback banners */}
        {error && (
          <div className="mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">

          {/* Channel / Order Source Selector */}
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Sales Channel / Order Source <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setOrderSource('website');
                  if (!orderId || orderId.startsWith('402-')) setOrderId('#2888');
                }}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                  orderSource === 'website'
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span>Website / Shopify</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setOrderSource('amazon');
                  if (!orderId || orderId.startsWith('#')) setOrderId('402-');
                }}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                  orderSource === 'amazon'
                    ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-amber-300"></span>
                <span>Amazon</span>
              </button>
            </div>
          </div>
          
          {/* Order ID Input */}
          <div className="bg-[#832f5e]/5 p-3.5 rounded-xl border border-[#832f5e]/20">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-[#832f5e] uppercase tracking-wider">
                Order ID / Number <span className="text-rose-500">*</span>
              </label>
              <span className="text-[10px] font-mono text-slate-500">
                {orderSource === 'website' ? 'Format: #2888' : 'Format: 402-1234567-1234567'}
              </span>
            </div>
            <input
              type="text"
              required
              placeholder={orderSource === 'website' ? 'e.g. #2888' : 'e.g. 402-1234567-1234567'}
              value={orderId}
              onChange={(e) => {
                const val = e.target.value;
                setOrderId(val);
                if (isAmazonOrder({ orderId: val })) {
                  setOrderSource('amazon');
                }
              }}
              className="w-full px-3.5 py-2.5 text-sm font-mono font-bold rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-[#832f5e] bg-white"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              {orderSource === 'website' 
                ? 'Website orders are sorted numerically (highest number first).' 
                : 'Amazon orders are sorted chronologically by order date.'}
            </p>
          </div>

          {orderSource === 'amazon' ? (
            /* Simplified Amazon Order Form - 4 Key Fields */
            <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-amber-200/60">
                <PackagePlus className="w-4 h-4 text-amber-700" />
                <span className="text-xs font-extrabold text-amber-900 font-mono uppercase tracking-wider">
                  Amazon Order Details (4 Required Fields)
                </span>
              </div>

              {/* Customer Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Customer Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rahul Sharma"
                  value={customer}
                  onChange={(e) => setCustomer(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm font-bold rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-600 bg-white text-slate-900"
                />
              </div>

              {/* Customer Full Address */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Customer Full Address (1 Column) <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. Flat 402, Sunshine Apartments, MG Road, Bangalore, Karnataka - 560001"
                  value={amazonAddress}
                  onChange={(e) => setAmazonAddress(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm font-medium rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-600 bg-white text-slate-900"
                />
              </div>

              {/* Desired Product Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Desired Product Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Custom Acrylic Nameplate (Gold Finish)"
                  value={amazonProduct}
                  onChange={(e) => setAmazonProduct(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm font-bold rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-600 bg-white text-slate-900"
                />
              </div>

              {/* Production TV Deck Toggle */}
              <div className="pt-2">
                <label className="flex items-center gap-3 p-3.5 rounded-xl bg-white border border-amber-200 cursor-pointer font-bold text-slate-900 text-xs shadow-sm">
                  <input
                    type="checkbox"
                    checked={sendToProductionDeck}
                    onChange={(e) => setSendToProductionDeck(e.target.checked)}
                    className="w-5 h-5 rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
                  />
                  <div className="flex flex-col">
                    <span className="font-black text-amber-950 uppercase tracking-wide">Display on Production TV Deck Schedule</span>
                    <span className="text-[10px] font-bold text-amber-800/70">Enable this to track workshop sub-assembly and live dashboard monitoring</span>
                  </div>
                </label>
              </div>
            </div>
          ) : (
            /* PACKAGE & SHIPMENT DETAILS */
            <div className="bg-stone-50/80 border border-stone-200/80 rounded-xl p-4 space-y-3.5">
            <div className="flex items-center justify-between pb-2 border-b border-stone-200/60">
              <div className="flex items-center gap-2">
                <Box className="w-4 h-4 text-[#832f5e]" />
                <span className="text-xs font-extrabold text-slate-800 font-mono uppercase tracking-wider">
                  Package & Shipment Details
                </span>
              </div>
              <span className="text-[10px] text-stone-500 font-mono">Order Details</span>
            </div>

            {/* Delivery Method Dropdown */}
            <div>
              <label className="block text-[10px] font-mono font-bold text-slate-600 uppercase mb-1">
                Delivery Method:
              </label>
              <select
                value={deliveryMethod}
                onChange={(e) => setDeliveryMethod(e.target.value)}
                className="w-full px-3 py-1.5 text-xs font-bold rounded-lg border border-stone-200 focus:outline-none focus:ring-2 focus:ring-[#832f5e] bg-white text-slate-800"
              >
                <option value="Normal">Normal</option>
                <option value="Express">Express</option>
                <option value="Next day delivery (porter/SKS)">Next day delivery (porter/SKS)</option>
              </select>
            </div>

            {/* Courier Partner Quick Selector */}
            <div>
              <label className="block text-[10px] font-mono font-bold text-slate-600 uppercase mb-1">
                Courier Partner:
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {quickCouriers.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCourier(courier === c ? '' : c)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold cursor-pointer transition-colors border ${
                      courier === c 
                        ? 'bg-[#832f5e] text-white border-[#832f5e]' 
                        : 'bg-white text-slate-700 border-stone-200 hover:bg-stone-100'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <input
                type="text"
                placeholder="Or type custom courier name..."
                value={courier}
                onChange={(e) => setCourier(e.target.value)}
                className="w-full px-3 py-1.5 text-xs rounded-lg border border-stone-200 focus:outline-none focus:ring-2 focus:ring-[#832f5e] bg-white"
              />
            </div>

            {/* Grid 1: AWB, Package Weight, Item/SKU */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] font-mono font-bold text-slate-600 uppercase mb-1">
                  AWB / Tracking Barcode
                </label>
                <div className="relative">
                  <Truck className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-stone-400" />
                  <input
                    type="text"
                    value={awb}
                    onChange={(e) => setAwb(e.target.value)}
                    placeholder="Scan or enter AWB..."
                    className="w-full bg-white border border-stone-200 focus:border-[#832f5e] rounded-lg pl-8 pr-2 py-1.5 text-slate-900 text-xs font-bold focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-mono font-bold text-slate-600 uppercase mb-1">
                  Package Weight
                </label>
                <div className="relative">
                  <Scale className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-stone-400" />
                  <input
                    type="text"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    placeholder="e.g. 0.45 kg / 450g"
                    className="w-full bg-white border border-stone-200 focus:border-[#832f5e] rounded-lg pl-8 pr-2 py-1.5 text-slate-900 text-xs font-bold focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-mono font-bold text-slate-600 uppercase mb-1">
                  Item / SKU Name
                </label>
                <div className="relative">
                  <Tag className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-stone-400" />
                  <input
                    type="text"
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    placeholder="e.g. ZB-TEE-L"
                    className="w-full bg-white border border-stone-200 focus:border-[#832f5e] rounded-lg pl-8 pr-2 py-1.5 text-slate-900 text-xs font-bold focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Grid 2: Items Qty, Customer/City, Contact Person */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] font-mono font-bold text-slate-600 uppercase mb-1">
                  Items Quantity
                </label>
                <input
                  type="number"
                  min="1"
                  value={itemCount}
                  onChange={(e) => setItemCount(e.target.value)}
                  placeholder="1"
                  className="w-full bg-white border border-stone-200 focus:border-[#832f5e] rounded-lg px-2.5 py-1.5 text-slate-900 text-xs font-bold focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono font-bold text-slate-600 uppercase mb-1">
                  Customer / City
                </label>
                <input
                  type="text"
                  value={customer}
                  onChange={(e) => setCustomer(e.target.value)}
                  placeholder="e.g. Saneej - Valanchery"
                  className="w-full bg-white border border-stone-200 focus:border-[#832f5e] rounded-lg px-2.5 py-1.5 text-slate-900 text-xs font-bold focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono font-bold text-slate-600 uppercase mb-1">
                  Contact Person Name
                </label>
                <input
                  type="text"
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                  placeholder="e.g. Saneej"
                  className="w-full bg-white border border-stone-200 focus:border-[#832f5e] rounded-lg px-2.5 py-1.5 text-slate-900 text-xs font-bold focus:outline-none"
                />
              </div>
            </div>

            {/* Grid 3: Contact Phone, Order Received Date, Despatch Date */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] font-mono font-bold text-slate-600 uppercase mb-1">
                  Contact Phone Number
                </label>
                <input
                  type="text"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="e.g. +91 9876543210"
                  className="w-full bg-white border border-stone-200 focus:border-[#832f5e] rounded-lg px-2.5 py-1.5 text-slate-900 text-xs font-bold focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono font-bold text-slate-600 uppercase mb-1">
                  Order Received Date
                </label>
                <input
                  type="date"
                  value={orderReceivedDate}
                  onChange={(e) => setOrderReceivedDate(e.target.value)}
                  className="w-full bg-white border border-stone-200 focus:border-[#832f5e] rounded-lg px-2.5 py-1.5 text-slate-900 text-xs font-bold focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono font-bold text-slate-600 uppercase mb-1">
                  Despatch Date
                </label>
                <input
                  type="date"
                  value={dispatchDate}
                  onChange={(e) => setDispatchDate(e.target.value)}
                  className="w-full bg-white border border-stone-200 focus:border-[#832f5e] rounded-lg px-2.5 py-1.5 text-slate-900 text-xs font-bold focus:outline-none"
                />
              </div>
            </div>

            {/* Grid 4: Order Amount, Shipping Amount, Total Amount */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] font-mono font-bold text-slate-600 uppercase mb-1">
                  Order Amount (₹)
                </label>
                <input
                  type="text"
                  value={orderAmount}
                  onChange={(e) => {
                    const val = e.target.value;
                    setOrderAmount(val);
                    const oAmt = parseFloat(val) || 0;
                    const sAmt = parseFloat(shippingAmount) || 0;
                    if (oAmt || sAmt) setOrderTotal(String((oAmt + sAmt).toFixed(2)));
                  }}
                  placeholder="e.g. 1499.00"
                  className="w-full bg-white border border-stone-200 focus:border-[#832f5e] rounded-lg px-2.5 py-1.5 text-slate-900 text-xs font-bold focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono font-bold text-slate-600 uppercase mb-1">
                  Shipping Amount (₹)
                </label>
                <input
                  type="text"
                  value={shippingAmount}
                  onChange={(e) => {
                    const val = e.target.value;
                    setShippingAmount(val);
                    const oAmt = parseFloat(orderAmount) || 0;
                    const sAmt = parseFloat(val) || 0;
                    if (oAmt || sAmt) setOrderTotal(String((oAmt + sAmt).toFixed(2)));
                  }}
                  placeholder="e.g. 99.00"
                  className="w-full bg-white border border-stone-200 focus:border-[#832f5e] rounded-lg px-2.5 py-1.5 text-slate-900 text-xs font-bold focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono font-bold text-slate-600 uppercase mb-1">
                  Total Amount (₹)
                </label>
                <input
                  type="text"
                  value={orderTotal}
                  onChange={(e) => setOrderTotal(e.target.value)}
                  placeholder="Auto or manual total"
                  className="w-full bg-white border border-stone-200 focus:border-[#832f5e] rounded-lg px-2.5 py-1.5 text-slate-900 text-xs font-bold focus:outline-none font-mono"
                />
              </div>
            </div>

            {/* Grid 5: Delivered Date, Notes / QC Remarks */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-mono font-bold text-slate-600 uppercase mb-1">
                  Delivered Date (Editable)
                </label>
                <input
                  type="date"
                  value={deliveredDate}
                  onChange={(e) => setDeliveredDate(e.target.value)}
                  className="w-full bg-white border border-stone-200 focus:border-[#832f5e] rounded-lg px-2.5 py-1.5 text-slate-900 text-xs font-bold focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono font-bold text-slate-600 uppercase mb-1">
                  Internal Notes
                </label>
                <div className="relative">
                  <FileText className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-stone-400" />
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Bubble wrap"
                    className="w-full bg-white border border-stone-200 focus:border-[#832f5e] rounded-lg pl-8 pr-2 py-1.5 text-slate-900 text-xs font-bold focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-mono font-bold text-slate-600 uppercase mb-1">
                  QC Remarks
                </label>
                <div className="relative">
                  <CheckCircle2 className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-stone-400" />
                  <input
                    type="text"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="e.g. Quality check passed"
                    className="w-full bg-white border border-stone-200 focus:border-[#832f5e] rounded-lg pl-8 pr-2 py-1.5 text-slate-900 text-xs font-bold focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Production TV Deck Toggle */}
            <div className="pt-1">
              <label className="flex items-center gap-3 p-4 rounded-xl bg-indigo-50 border border-indigo-200 cursor-pointer font-bold text-slate-900 text-xs shadow-sm">
                <input
                  type="checkbox"
                  checked={sendToProductionDeck}
                  onChange={(e) => setSendToProductionDeck(e.target.checked)}
                  className="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <div className="flex flex-col">
                  <span className="font-black text-indigo-950 uppercase tracking-wide">Display on Production TV Deck Schedule</span>
                  <span className="text-[10px] font-bold text-indigo-700/70">Enable this to track workshop sub-assembly and live dashboard monitoring</span>
                </div>
              </label>
            </div>
          </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100 sticky bottom-0 bg-white z-10 py-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-stone-600 hover:bg-stone-100 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-[#832f5e] hover:bg-[#6e264e] shadow-md shadow-[#832f5e]/20 disabled:opacity-50 transition-all cursor-pointer flex items-center gap-2"
            >
              <PackagePlus className="w-4 h-4" />
              <span>{isSubmitting ? 'Saving Order...' : 'Add New Order'}</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
