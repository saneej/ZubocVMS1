import React, { useState, useMemo, useEffect } from 'react';
import { 
  Calculator, 
  MapPin, 
  Scale, 
  Box, 
  Zap, 
  ShieldAlert, 
  CheckCircle2, 
  Info, 
  Copy, 
  Check, 
  HelpCircle, 
  TrendingUp, 
  Clock, 
  Truck, 
  FileText, 
  RefreshCw,
  ArrowRight,
  AlertTriangle,
  Receipt
} from 'lucide-react';
import { OrderRecord } from '../types';

interface ShippingRateCalculatorProps {
  orders?: OrderRecord[];
  onUpdateOrder?: (order: OrderRecord) => void;
  currentStaffName?: string;
}

// Zone Definitions & Rate Configuration
export interface ZoneInfo {
  id: number;
  name: string;
  code: string;
  description: string;
  sampleCities: string[];
  transitTime: string;
  baseRate: number;        // Up to 0.5 kg
  additionalRate: number;  // Per additional 0.5 kg
}

export const ZONES_CONFIG: Record<number, ZoneInfo> = {
  1: {
    id: 1,
    name: 'Zone 1: Local / Intra-NCR',
    code: 'NCR',
    description: 'Delhi, Faridabad, Gurgaon, Noida, Ghaziabad',
    sampleCities: ['Delhi', 'Faridabad', 'Gurgaon', 'Noida', 'Ghaziabad'],
    transitTime: '24–48 Hours',
    baseRate: 120,
    additionalRate: 40
  },
  2: {
    id: 2,
    name: 'Zone 2: Regional / North',
    code: 'NORTH',
    description: 'Chandigarh, Punjab, Haryana, Rajasthan, Western UP, Uttarakhand',
    sampleCities: ['Chandigarh', 'Moradabad', 'Jaipur', 'Ludhiana', 'Lucknow', 'Dehradun'],
    transitTime: '2–3 Days',
    baseRate: 160,
    additionalRate: 65
  },
  3: {
    id: 3,
    name: 'Zone 3: Metro to Metro',
    code: 'METRO',
    description: 'Tier-1 Metros: Chennai, Hyderabad, Kolkata, Mumbai, Bengaluru, Pune, Ahmedabad',
    sampleCities: ['Chennai', 'Hyderabad', 'Kolkata', 'Mumbai', 'Bengaluru', 'Pune', 'Ahmedabad'],
    transitTime: '3–5 Days',
    baseRate: 220,
    additionalRate: 85
  },
  4: {
    id: 4,
    name: 'Zone 4: Rest of India (ROI)',
    code: 'ROI',
    description: 'Tier-2/3 Cities & Rural MP, Bihar, Odisha, Kerala, AP, Rural TN, Gujarat',
    sampleCities: ['Bhopal', 'Patna', 'Bhubaneswar', 'Kochi', 'Vizag', 'Coimbatore', 'Indore'],
    transitTime: '5–7 Days',
    baseRate: 260,
    additionalRate: 105
  },
  5: {
    id: 5,
    name: 'Zone 5: Special / Remote Air',
    code: 'REMOTE',
    description: 'J&K, Ladakh, North-East States, Sikkim, Andaman & Nicobar, Lakshadweep',
    sampleCities: ['Srinagar', 'Guwahati', 'Imphal', 'Gangtok', 'Port Blair', 'Agartala', 'Leh'],
    transitTime: '7–10 Days',
    baseRate: 380,
    additionalRate: 150
  }
};

// Auto-resolve Zone from 6-digit Indian Pincode
export function resolveZoneFromPincode(pincode: string): { zoneId: number; cityGuess: string } {
  const cleanPin = pincode.trim().replace(/\D/g, '');
  if (cleanPin.length < 3) return { zoneId: 4, cityGuess: 'Rest of India' };

  const prefix3 = cleanPin.substring(0, 3);
  const prefix2 = cleanPin.substring(0, 2);

  // Zone 1: Intra-NCR
  if (cleanPin.startsWith('110') || cleanPin.startsWith('121') || cleanPin.startsWith('122') || cleanPin.startsWith('2013')) {
    let guess = 'Delhi NCR';
    if (cleanPin.startsWith('121')) guess = 'Faridabad';
    if (cleanPin.startsWith('122')) guess = 'Gurgaon';
    if (cleanPin.startsWith('2013')) guess = 'Noida / Ghaziabad';
    return { zoneId: 1, cityGuess: guess };
  }

  // Zone 5: Remote / NE / J&K / Islands
  if (
    cleanPin.startsWith('190') || cleanPin.startsWith('191') || cleanPin.startsWith('192') || cleanPin.startsWith('193') || cleanPin.startsWith('194') || // J&K / Ladakh
    cleanPin.startsWith('78') || cleanPin.startsWith('79') || // Assam, NE
    cleanPin.startsWith('737') || // Sikkim
    cleanPin.startsWith('744') || // Andaman
    cleanPin.startsWith('6825')   // Lakshadweep
  ) {
    let guess = 'Special / Remote Region';
    if (cleanPin.startsWith('19')) guess = 'Jammu & Kashmir / Ladakh';
    if (cleanPin.startsWith('78') || cleanPin.startsWith('79')) guess = 'North-East Region';
    if (cleanPin.startsWith('744')) guess = 'Andaman & Nicobar';
    return { zoneId: 5, cityGuess: guess };
  }

  // Zone 3: Metro to Metro
  if (
    cleanPin.startsWith('400') || cleanPin.startsWith('401') || cleanPin.startsWith('402') || cleanPin.startsWith('403') || cleanPin.startsWith('404') || // Mumbai
    cleanPin.startsWith('600') || cleanPin.startsWith('601') || cleanPin.startsWith('602') || cleanPin.startsWith('603') || // Chennai
    cleanPin.startsWith('500') || cleanPin.startsWith('501') || cleanPin.startsWith('502') || cleanPin.startsWith('503') || // Hyderabad
    cleanPin.startsWith('700') || cleanPin.startsWith('701') || cleanPin.startsWith('702') || cleanPin.startsWith('703') || // Kolkata
    cleanPin.startsWith('560') || cleanPin.startsWith('561') || cleanPin.startsWith('562') || // Bengaluru
    cleanPin.startsWith('411') || // Pune
    cleanPin.startsWith('380')    // Ahmedabad
  ) {
    let guess = 'Tier-1 Metro';
    if (cleanPin.startsWith('40')) guess = 'Mumbai Metro';
    if (cleanPin.startsWith('60')) guess = 'Chennai Metro';
    if (cleanPin.startsWith('50')) guess = 'Hyderabad Metro';
    if (cleanPin.startsWith('70')) guess = 'Kolkata Metro';
    if (cleanPin.startsWith('56')) guess = 'Bengaluru Metro';
    if (cleanPin.startsWith('411')) guess = 'Pune Metro';
    if (cleanPin.startsWith('380')) guess = 'Ahmedabad Metro';
    return { zoneId: 3, cityGuess: guess };
  }

  // Zone 2: North Regional
  if (
    cleanPin.startsWith('12') || cleanPin.startsWith('13') || cleanPin.startsWith('14') || cleanPin.startsWith('15') || cleanPin.startsWith('16') || // Punjab, Haryana, Chandigarh
    cleanPin.startsWith('24') || cleanPin.startsWith('25') || cleanPin.startsWith('26') || // Western UP, Moradabad
    cleanPin.startsWith('30') || cleanPin.startsWith('31') || cleanPin.startsWith('32') || cleanPin.startsWith('33') || cleanPin.startsWith('34')    // Rajasthan
  ) {
    let guess = 'North Regional';
    if (cleanPin.startsWith('16')) guess = 'Chandigarh';
    if (cleanPin.startsWith('244')) guess = 'Moradabad';
    if (cleanPin.startsWith('302')) guess = 'Jaipur';
    return { zoneId: 2, cityGuess: guess };
  }

  // Default Zone 4: Rest of India
  return { zoneId: 4, cityGuess: 'Rest of India' };
}

export const ShippingRateCalculator: React.FC<ShippingRateCalculatorProps> = ({
  orders = [],
  onUpdateOrder,
  currentStaffName = 'Logistics Manager'
}) => {
  // 1. Origin & Destination Inputs
  const [origin, setOrigin] = useState('Delhi Warehouse (110001)');
  const [pincode, setPincode] = useState('600001'); // Default Chennai
  const [selectedCityOverride, setSelectedCityOverride] = useState<string>('AUTO');
  const [selectedZoneId, setSelectedZoneId] = useState<number>(3);

  // 2. Weight Inputs
  const [deadWeight, setDeadWeight] = useState<string>('0.75');
  const [weightUnit, setWeightUnit] = useState<'kg' | 'g'>('kg');

  // 3. Volumetric Inputs (cm)
  const [lengthCm, setLengthCm] = useState<string>('25');
  const [widthCm, setWidthCm] = useState<string>('18');
  const [heightCm, setHeightCm] = useState<string>('12');
  const [isVolumetricExpanded, setIsVolumetricExpanded] = useState<boolean>(true);

  // 4. Shipping Mode
  const [deliveryMode, setDeliveryMode] = useState<'SURFACE' | 'EXPRESS'>('SURFACE');

  // 5. Preset Order Loader
  const [selectedPresetOrderId, setSelectedPresetOrderId] = useState<string>('');
  const [copiedQuote, setCopiedQuote] = useState(false);
  const [savedToOrderMsg, setSavedToOrderMsg] = useState<string | null>(null);

  // Pincode Validation
  const isValidPincode = useMemo(() => {
    return /^[1-9][0-9]{5}$/.test(pincode.trim());
  }, [pincode]);

  // Auto-resolve Zone when Pincode or Fallback City changes
  useEffect(() => {
    if (selectedCityOverride !== 'AUTO') {
      const cityZoneMap: Record<string, number> = {
        'Faridabad': 1, 'Gurgaon': 1, 'Noida': 1, 'Ghaziabad': 1, 'Delhi': 1,
        'Chandigarh': 2, 'Moradabad': 2, 'Ludhiana': 2, 'Jaipur': 2, 'Lucknow': 2,
        'Chennai': 3, 'Hyderabad': 3, 'Kolkata': 3, 'Mumbai': 3, 'Bengaluru': 3, 'Pune': 3, 'Ahmedabad': 3,
        'Bhopal': 4, 'Patna': 4, 'Bhubaneswar': 4, 'Kochi': 4, 'Vizag': 4,
        'Srinagar': 5, 'Guwahati': 5, 'Port Blair': 5, 'Imphal': 5
      };
      if (cityZoneMap[selectedCityOverride]) {
        setSelectedZoneId(cityZoneMap[selectedCityOverride]);
      }
    } else if (isValidPincode) {
      const { zoneId } = resolveZoneFromPincode(pincode);
      setSelectedZoneId(zoneId);
    }
  }, [pincode, selectedCityOverride, isValidPincode]);

  // Handle Preset Order Selection
  const handleSelectPresetOrder = (ordId: string) => {
    setSelectedPresetOrderId(ordId);
    const ord = orders.find(o => o.orderId === ordId);
    if (ord) {
      if (ord.weight) {
        const num = parseFloat(ord.weight.replace(/[^0-9.]/g, ''));
        if (!isNaN(num)) {
          if (ord.weight.toLowerCase().includes('g') && !ord.weight.toLowerCase().includes('k')) {
            setDeadWeight((num / 1000).toString());
            setWeightUnit('kg');
          } else {
            setDeadWeight(num.toString());
            setWeightUnit('kg');
          }
        }
      }
      // Guess pincode or city if in customerName/contact
      if (ord.customerName) {
        if (ord.customerName.toLowerCase().includes('chennai')) { setPincode('600001'); setSelectedCityOverride('Chennai'); }
        if (ord.customerName.toLowerCase().includes('mumbai')) { setPincode('400001'); setSelectedCityOverride('Mumbai'); }
        if (ord.customerName.toLowerCase().includes('faridabad')) { setPincode('121001'); setSelectedCityOverride('Faridabad'); }
      }
    }
  };

  // FINANCIAL & WEIGHT COMPUTATION ENGINE
  const calculation = useMemo(() => {
    // A. Dead Weight in Kg
    const parsedDead = parseFloat(deadWeight) || 0;
    const deadWeightKg = weightUnit === 'g' ? parsedDead / 1000 : parsedDead;

    // B. Volumetric Weight (L x W x H / 5000)
    const l = parseFloat(lengthCm) || 0;
    const w = parseFloat(widthCm) || 0;
    const h = parseFloat(heightCm) || 0;
    const volumetricWeightKg = (l * w * h) / 5000;

    // C. Raw Billable Weight
    const rawBillableWeightKg = Math.max(deadWeightKg, volumetricWeightKg);
    const isVolumetricGoverning = volumetricWeightKg > deadWeightKg && volumetricWeightKg > 0;

    // D. Slab Snapping Rules (Round UP to nearest 0.5 kg slab, min 0.5 kg)
    let chargedWeightKg = 0.5;
    if (rawBillableWeightKg <= 0.5) {
      chargedWeightKg = 0.5;
    } else {
      chargedWeightKg = Math.ceil(rawBillableWeightKg * 2) / 2;
    }

    // Number of 0.5 kg slabs
    const totalSlabs = Math.round(chargedWeightKg / 0.5);
    const additionalSlabs = Math.max(0, totalSlabs - 1);

    // E. Zone Pricing Lookup
    const activeZone = ZONES_CONFIG[selectedZoneId] || ZONES_CONFIG[3];
    const isExpressMode = deliveryMode === 'EXPRESS';
    const expressMultiplier = isExpressMode ? 1.45 : 1.0;

    const baseFreightRate = activeZone.baseRate * expressMultiplier;
    const slabIncrementalRate = activeZone.additionalRate * expressMultiplier;

    // F. Heavy Consignment Tier (> 10 kg slab discount)
    // First 10 kg = 20 slabs (1 base slab + 19 additional)
    let additionalFreightFee = 0;
    let bulkDiscountApplied = false;
    let bulkDiscountAmount = 0;

    if (chargedWeightKg <= 10) {
      additionalFreightFee = additionalSlabs * slabIncrementalRate;
    } else {
      bulkDiscountApplied = true;
      const normalSlabs10kg = 19; // Slabs between 0.5kg and 10kg
      const extraSlabsBeyond10kg = additionalSlabs - normalSlabs10kg;

      const normalAdditionalFee = normalSlabs10kg * slabIncrementalRate;
      const discountedIncrementalRate = slabIncrementalRate * 0.88; // 12% bulk efficiency discount
      const extraAdditionalFee = extraSlabsBeyond10kg * discountedIncrementalRate;

      additionalFreightFee = normalAdditionalFee + extraAdditionalFee;
      bulkDiscountAmount = (extraSlabsBeyond10kg * slabIncrementalRate) - extraAdditionalFee;
    }

    // G. Financial Breakdown Steps
    const operationalFreightFee = baseFreightRate + additionalFreightFee;
    const docketCharge = 35.00; // Flat Handling & Docket Charge
    const fuelSurchargeFSC = operationalFreightFee * 0.10; // 10% FSC
    const subtotalBeforeTax = operationalFreightFee + docketCharge + fuelSurchargeFSC;
    const gst18Amount = subtotalBeforeTax * 0.18;
    const totalShippingPayable = Math.round(subtotalBeforeTax + gst18Amount);

    // H. Historical Billing Comparison (Exposing historical billing loss)
    // Historical flaw: charged flat ~160 without docket & FSC/GST
    const historicalUnbracketedBilled = Math.round(chargedWeightKg * 110 + 25);
    const historicalNetLoss = Math.max(0, totalShippingPayable - historicalUnbracketedBilled);

    return {
      deadWeightKg,
      volumetricWeightKg,
      rawBillableWeightKg,
      chargedWeightKg,
      isVolumetricGoverning,
      totalSlabs,
      additionalSlabs,
      activeZone,
      isExpressMode,
      expressMultiplier,
      baseFreightRate,
      slabIncrementalRate,
      additionalFreightFee,
      bulkDiscountApplied,
      bulkDiscountAmount,
      operationalFreightFee,
      docketCharge,
      fuelSurchargeFSC,
      subtotalBeforeTax,
      gst18Amount,
      totalShippingPayable,
      historicalUnbracketedBilled,
      historicalNetLoss
    };
  }, [deadWeight, weightUnit, lengthCm, widthCm, heightCm, selectedZoneId, deliveryMode]);

  // Formatted Text Quote Copy Handler
  const handleCopyQuote = () => {
    const textQuote = `📦 *PACKVISION VMS LOGISTICS QUOTE*
────────────────────────────
Destination: ${isValidPincode ? pincode : 'India'} (${calculation.activeZone.name})
Mode: ${calculation.isExpressMode ? '⚡ Express Air (1.45x)' : '🚛 Surface Standard'}
Chargeable Weight: ${calculation.chargedWeightKg} kg (${calculation.isVolumetricGoverning ? 'Volumetric' : 'Actual Dead Weight'})
Estimated Transit: ${calculation.activeZone.transitTime}

💰 *COST BREAKDOWN*:
• Base Freight (0.5kg): ₹${calculation.baseFreightRate.toFixed(2)}
• Additional Slabs (${calculation.additionalSlabs}x): ₹${calculation.additionalFreightFee.toFixed(2)}
• Handling & Docket Fee: ₹35.00
• Fuel Surcharge (10% FSC): ₹${calculation.fuelSurchargeFSC.toFixed(2)}
• Subtotal: ₹${calculation.subtotalBeforeTax.toFixed(2)}
• GST (18% Mandatory): ₹${calculation.gst18Amount.toFixed(2)}
────────────────────────────
👉 *TOTAL SHIPPING PAYABLE: ₹${calculation.totalShippingPayable}*
────────────────────────────`;

    navigator.clipboard.writeText(textQuote);
    setCopiedQuote(true);
    setTimeout(() => setCopiedQuote(false), 2500);
  };

  // Save Calculated Shipping Quote into Selected Preset Order
  const handleSaveToOrder = () => {
    if (!selectedPresetOrderId || !onUpdateOrder) return;
    const targetOrder = orders.find(o => o.orderId === selectedPresetOrderId);
    if (!targetOrder) return;

    const newLogs = [...(targetOrder.auditLogs || [])];
    newLogs.push({
      timestamp: new Date().toISOString(),
      staffId: currentStaffName,
      action: 'CALCULATED_SHIPPING_FEE',
      details: `Calculated shipping quote ₹${calculation.totalShippingPayable} for ${calculation.chargedWeightKg}kg (${calculation.activeZone.code})`,
      type: 'EDIT_LOG'
    });

    const updatedOrder: OrderRecord = {
      ...targetOrder,
      shippingAmount: calculation.totalShippingPayable.toString(),
      weight: `${calculation.chargedWeightKg} kg`,
      auditLogs: newLogs,
      updatedAt: new Date().toISOString()
    };

    onUpdateOrder(updatedOrder);
    setSavedToOrderMsg(`Shipping quote ₹${calculation.totalShippingPayable} attached to Order #${selectedPresetOrderId}!`);
    setTimeout(() => setSavedToOrderMsg(null), 3500);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 font-sans">
      
      {/* Toast Feedback */}
      {savedToOrderMsg && (
        <div className="fixed top-20 right-6 z-50 bg-emerald-600 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300 font-sans">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span className="text-xs font-extrabold tracking-wide">{savedToOrderMsg}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-1.5 bg-[#832f5e]"></div>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#832f5e]/10 text-[#832f5e] rounded-2xl flex items-center justify-center">
                <Calculator className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-slate-900 font-sans">Shipping Rate Calculator</h1>
                <p className="text-slate-500 text-xs font-medium">Airtight Zone & Slab Pricing Engine for Indian Domestic Logistics</p>
              </div>
            </div>
          </div>

          {/* Quick Preset Order Loader */}
          {orders.length > 0 && (
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 p-2 rounded-2xl">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider pl-1">Load Order Preset:</span>
              <select
                value={selectedPresetOrderId}
                onChange={(e) => handleSelectPresetOrder(e.target.value)}
                className="bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-[#832f5e]/20 cursor-pointer max-w-[200px] truncate"
              >
                <option value="">-- Choose Order --</option>
                {orders.map(o => (
                  <option key={o.orderId} value={o.orderId}>
                    #{o.orderId} ({o.customerName || 'Customer'})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Loss Prevention & Historical Audit Alert Banner */}
      <div className="bg-amber-50/70 border border-amber-200/80 rounded-3xl p-5 shadow-2xs space-y-3">
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1 flex-1">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-extrabold text-amber-900 uppercase tracking-wider">
                Airtight Billing Engine • Net Loss Elimination Safeguard
              </h3>
              <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full uppercase font-mono">
                Audit Verified
              </span>
            </div>
            <p className="text-xs text-amber-800 leading-relaxed font-medium">
              Eliminates historical billing traps: Sub-1kg freight floors, unbilled GST (18%) & carrier docket charges (₹35), and un-calculated volumetric weight on light parcels.
            </p>
          </div>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column: Form Inputs (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Card 1: Geographic Routing & Destination */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-xs font-bold text-slate-800 uppercase tracking-widest flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#832f5e]" />
                1. Geographic Routing & Destination Zone
              </h2>
              <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md uppercase font-mono">
                6-Digit PIN Lookup
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Origin */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Origin (Dispatch Warehouse)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={origin}
                    onChange={(e) => setOrigin(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-bold focus:outline-none"
                  />
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 absolute right-3 top-3" />
                </div>
              </div>

              {/* Destination Pincode */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Destination PIN Code
                </label>
                <div className="relative">
                  <input
                    type="text"
                    maxLength={6}
                    value={pincode}
                    onChange={(e) => {
                      setPincode(e.target.value);
                      setSelectedCityOverride('AUTO');
                    }}
                    placeholder="e.g. 600001"
                    className={`w-full bg-white border rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 ${
                      isValidPincode ? 'border-slate-300 focus:ring-[#832f5e]/20' : 'border-rose-300 focus:ring-rose-500/20 text-rose-700'
                    }`}
                  />
                  {isValidPincode ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 absolute right-3 top-3" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-500 absolute right-3 top-3" />
                  )}
                </div>
                {!isValidPincode && (
                  <p className="text-[10px] text-rose-600 font-semibold mt-1">Please enter a valid 6-digit Indian PIN code.</p>
                )}
              </div>
            </div>

            {/* City Fallback Selector & Zone Badges */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  Quick City Fallback Mapping
                </label>
                <span className="text-[10px] text-slate-400 font-medium">Auto-resolves zone when PIN is entered</span>
              </div>

              <select
                value={selectedCityOverride}
                onChange={(e) => setSelectedCityOverride(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
              >
                <option value="AUTO">-- Auto-Resolve From PIN Code ({pincode}) --</option>
                <optgroup label="Zone 1 (Local / Intra-NCR)">
                  <option value="Faridabad">Faridabad (Zone 1)</option>
                  <option value="Gurgaon">Gurgaon (Zone 1)</option>
                  <option value="Noida">Noida / Ghaziabad (Zone 1)</option>
                  <option value="Delhi">Delhi City (Zone 1)</option>
                </optgroup>
                <optgroup label="Zone 2 (Regional / North)">
                  <option value="Chandigarh">Chandigarh (Zone 2)</option>
                  <option value="Moradabad">Moradabad (Zone 2)</option>
                  <option value="Jaipur">Jaipur (Zone 2)</option>
                  <option value="Ludhiana">Ludhiana (Zone 2)</option>
                  <option value="Lucknow">Lucknow (Zone 2)</option>
                </optgroup>
                <optgroup label="Zone 3 (Metro to Metro)">
                  <option value="Chennai">Chennai Metro (Zone 3)</option>
                  <option value="Hyderabad">Hyderabad Metro (Zone 3)</option>
                  <option value="Kolkata">Kolkata Metro (Zone 3)</option>
                  <option value="Mumbai">Mumbai Metro (Zone 3)</option>
                  <option value="Bengaluru">Bengaluru Metro (Zone 3)</option>
                  <option value="Pune">Pune Metro (Zone 3)</option>
                  <option value="Ahmedabad">Ahmedabad Metro (Zone 3)</option>
                </optgroup>
                <optgroup label="Zone 4 (Rest of India)">
                  <option value="Bhopal">Bhopal / MP (Zone 4)</option>
                  <option value="Patna">Patna / Bihar (Zone 4)</option>
                  <option value="Bhubaneswar">Bhubaneswar / Odisha (Zone 4)</option>
                  <option value="Kochi">Kochi / Kerala (Zone 4)</option>
                  <option value="Vizag">Vizag / AP (Zone 4)</option>
                </optgroup>
                <optgroup label="Zone 5 (Special / Remote)">
                  <option value="Srinagar">Srinagar / J&K (Zone 5)</option>
                  <option value="Guwahati">Guwahati / Assam (Zone 5)</option>
                  <option value="Port Blair">Port Blair / Islands (Zone 5)</option>
                  <option value="Imphal">Imphal / Manipur (Zone 5)</option>
                </optgroup>
              </select>

              {/* Active Zone Display Card */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-slate-900">{calculation.activeZone.name}</span>
                    <span className="px-2 py-0.5 bg-[#832f5e] text-white text-[9px] font-extrabold uppercase rounded-md tracking-wider">
                      {calculation.activeZone.code}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium">{calculation.activeZone.description}</p>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Est. Transit</div>
                  <div className="text-xs font-black text-emerald-700 flex items-center justify-end gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{calculation.activeZone.transitTime}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Chargeable Weight Calculation Engine */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-xs font-bold text-slate-800 uppercase tracking-widest flex items-center gap-2">
                <Scale className="w-4 h-4 text-emerald-600" />
                2. Dead Weight & Volumetric Dimensions
              </h2>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md uppercase font-mono">
                Slab Snapping Enabled
              </span>
            </div>

            {/* Dead Weight Input with Unit Pill Toggle */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  Actual Scale Dead Weight
                </label>
                <div className="flex bg-slate-100 p-0.5 rounded-lg text-[10px] font-bold">
                  <button
                    type="button"
                    onClick={() => setWeightUnit('kg')}
                    className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                      weightUnit === 'kg' ? 'bg-white text-[#832f5e] shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Kilograms (kg)
                  </button>
                  <button
                    type="button"
                    onClick={() => setWeightUnit('g')}
                    className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                      weightUnit === 'g' ? 'bg-white text-[#832f5e] shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Grams (g)
                  </button>
                </div>
              </div>

              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={deadWeight}
                  onChange={(e) => setDeadWeight(e.target.value)}
                  placeholder={weightUnit === 'kg' ? 'e.g. 0.75' : 'e.g. 750'}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#832f5e]/20"
                />
                <span className="absolute right-3.5 top-3 text-xs font-bold text-slate-400 uppercase">
                  {weightUnit}
                </span>
              </div>
            </div>

            {/* Volumetric Dimension Inputs Accordion */}
            <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50 space-y-3">
              <div 
                onClick={() => setIsVolumetricExpanded(!isVolumetricExpanded)}
                className="flex items-center justify-between cursor-pointer select-none"
              >
                <div className="flex items-center gap-2">
                  <Box className="w-4 h-4 text-purple-600" />
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Package Box Dimensions (L × W × H in cm)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono font-bold text-purple-700 bg-purple-50 border border-purple-100 px-2 py-0.5 rounded-md">
                    Vol: {calculation.volumetricWeightKg.toFixed(2)} kg
                  </span>
                </div>
              </div>

              {isVolumetricExpanded && (
                <div className="pt-2 border-t border-slate-200/60 space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Length (cm)</label>
                      <input
                        type="number"
                        min="1"
                        value={lengthCm}
                        onChange={(e) => setLengthCm(e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Width (cm)</label>
                      <input
                        type="number"
                        min="1"
                        value={widthCm}
                        onChange={(e) => setWidthCm(e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Height (cm)</label>
                      <input
                        type="number"
                        min="1"
                        value={heightCm}
                        onChange={(e) => setHeightCm(e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900 focus:outline-none"
                      />
                    </div>
                  </div>

                  <p className="text-[10px] text-slate-400 font-medium">
                    Formula: (Length × Width × Height in cm) ÷ 5000 = Volumetric Weight in kg
                  </p>
                </div>
              )}
            </div>

            {/* Chargeable Weight Applied Summary */}
            <div className={`p-4 rounded-2xl border flex items-center justify-between ${
              calculation.isVolumetricGoverning 
                ? 'bg-purple-50/80 border-purple-200 text-purple-950' 
                : 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
            }`}>
              <div className="space-y-0.5">
                <div className="text-[10px] font-bold uppercase tracking-wider opacity-70">
                  Chargeable Weight Applied
                </div>
                <div className="text-lg font-black font-mono">
                  {calculation.chargedWeightKg} kg <span className="text-xs font-normal">({calculation.totalSlabs} × 0.5kg Slabs)</span>
                </div>
              </div>

              <div className="text-right">
                <span className={`text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-lg border ${
                  calculation.isVolumetricGoverning
                    ? 'bg-purple-100 border-purple-300 text-purple-800'
                    : 'bg-emerald-100 border-emerald-300 text-emerald-800'
                }`}>
                  {calculation.isVolumetricGoverning ? 'Volumetric Governs' : 'Actual Weight Governs'}
                </span>
              </div>
            </div>
          </div>

          {/* Card 3: Shipping Mode & Service Type */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-xs font-bold text-slate-800 uppercase tracking-widest flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" />
                3. Logistics Service Mode & Speed
              </h2>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setDeliveryMode('SURFACE')}
                className={`p-4 rounded-2xl border-2 text-left transition-all cursor-pointer ${
                  deliveryMode === 'SURFACE'
                    ? 'border-[#832f5e] bg-[#832f5e]/5 text-[#832f5e]'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 font-bold text-xs">
                    <Truck className="w-4 h-4" />
                    <span>Surface Standard</span>
                  </div>
                  <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 bg-slate-100 rounded text-slate-600">1.0x Base</span>
                </div>
                <p className="text-[10px] opacity-80 leading-relaxed font-medium">Standard surface logistics networks across India.</p>
              </button>

              <button
                type="button"
                onClick={() => setDeliveryMode('EXPRESS')}
                className={`p-4 rounded-2xl border-2 text-left transition-all cursor-pointer ${
                  deliveryMode === 'EXPRESS'
                    ? 'border-amber-500 bg-amber-50/70 text-amber-900'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 font-bold text-xs">
                    <Zap className="w-4 h-4 text-amber-500" />
                    <span>Air / Express Delivery</span>
                  </div>
                  <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 bg-amber-200 rounded text-amber-900">1.45x Multiplier</span>
                </div>
                <p className="text-[10px] opacity-80 leading-relaxed font-medium">Priority air cargo dispatch for urgent deliveries.</p>
              </button>
            </div>
          </div>

        </div>

        {/* Right Column: Live Sticky Summary & Quote Card (5 cols) */}
        <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-6">
          
          <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-xl space-y-6 relative overflow-hidden border border-slate-800">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#832f5e]/20 rounded-full blur-2xl pointer-events-none"></div>

            {/* Title Bar */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-amber-400" />
                <span className="text-xs font-bold uppercase tracking-widest text-slate-300">
                  Live Billing Quote
                </span>
              </div>
              
              <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-extrabold uppercase tracking-wider border border-emerald-500/30">
                GST Compliant
              </span>
            </div>

            {/* Total Shipping Payable Hero Display */}
            <div className="space-y-1 text-center py-2 bg-slate-800/60 rounded-2xl border border-slate-700/60 p-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Total Shipping Payable
              </div>
              <div className="text-4xl font-black font-mono text-amber-400">
                ₹{calculation.totalShippingPayable.toLocaleString('en-IN')}
              </div>
              <div className="text-[11px] text-slate-300 font-medium">
                (Inclusive of 18% GST & ₹35 Docket Charge)
              </div>
            </div>

            {/* Granular Cost Breakdown Table */}
            <div className="space-y-3 text-xs font-sans">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-800 pb-1">
                Cost Computation Steps
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Base Freight (0.5 kg)</span>
                  <span className="font-mono font-bold text-slate-200">₹{calculation.baseFreightRate.toFixed(2)}</span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">
                    Additional Slabs ({calculation.additionalSlabs} × ₹{calculation.slabIncrementalRate.toFixed(2)})
                  </span>
                  <span className="font-mono font-bold text-slate-200">₹{calculation.additionalFreightFee.toFixed(2)}</span>
                </div>

                {calculation.bulkDiscountApplied && (
                  <div className="flex items-center justify-between py-1 border-b border-slate-800/60 text-emerald-400">
                    <span className="flex items-center gap-1 font-semibold text-[11px]">
                      <TrendingUp className="w-3.5 h-3.5" />
                      Bulk Discount (&gt;10kg)
                    </span>
                    <span className="font-mono font-bold">-₹{calculation.bulkDiscountAmount.toFixed(2)}</span>
                  </div>
                )}

                <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Operational Freight Subtotal</span>
                  <span className="font-mono font-bold text-slate-100">₹{calculation.operationalFreightFee.toFixed(2)}</span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Handling & Docket Charge</span>
                  <span className="font-mono font-bold text-slate-200">₹35.00</span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Fuel Surcharge (10% FSC)</span>
                  <span className="font-mono font-bold text-slate-200">₹{calculation.fuelSurchargeFSC.toFixed(2)}</span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Subtotal Before Tax</span>
                  <span className="font-mono font-bold text-slate-100">₹{calculation.subtotalBeforeTax.toFixed(2)}</span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-slate-800/60 text-amber-300">
                  <span>Goods & Services Tax (18% GST)</span>
                  <span className="font-mono font-bold">₹{calculation.gst18Amount.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Quick Action Buttons */}
            <div className="space-y-2.5 pt-2">
              <button
                onClick={handleCopyQuote}
                className="w-full py-3 bg-[#832f5e] hover:bg-[#6c234b] text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-md flex items-center justify-center gap-2"
              >
                {copiedQuote ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                <span>{copiedQuote ? 'Quote Copied to Clipboard!' : 'Copy Formatted Text Quote'}</span>
              </button>

              {selectedPresetOrderId && onUpdateOrder && (
                <button
                  onClick={handleSaveToOrder}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Attach Quote to Order #{selectedPresetOrderId}</span>
                </button>
              )}
            </div>

            {/* Historical Audit Comparison Card */}
            <div className="pt-3 border-t border-slate-800 text-[11px] space-y-1.5 font-sans">
              <div className="flex items-center justify-between text-slate-400">
                <span>Historical Flawed Billed:</span>
                <span className="font-mono line-through text-rose-400">₹{calculation.historicalUnbracketedBilled}</span>
              </div>
              <div className="flex items-center justify-between text-emerald-400 font-bold">
                <span>Business Net Profit Recovered:</span>
                <span className="font-mono">+₹{calculation.historicalNetLoss}</span>
              </div>
            </div>

          </div>

        </div>

      </div>

    </div>
  );
};
