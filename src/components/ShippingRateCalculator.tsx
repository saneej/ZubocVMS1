import React, { useState, useMemo, useEffect } from 'react';
import { 
  Calculator, 
  MapPin, 
  Scale, 
  Box, 
  Zap, 
  ShieldAlert, 
  CheckCircle2, 
  Copy, 
  Check, 
  Clock, 
  Truck, 
  Receipt,
  AlertTriangle,
  Award,
  DollarSign,
  ChevronDown,
  ChevronUp,
  Plane,
  Mail
} from 'lucide-react';
import { OrderRecord } from '../types';
import { 
  CARRIERS_CONFIG, 
  CarrierConfig, 
  CarrierCalculationResult, 
  evaluateAllCarriers 
} from '../utils/carriersConfig';

interface ShippingRateCalculatorProps {
  orders?: OrderRecord[];
  onUpdateOrder?: (order: OrderRecord) => void;
  currentStaffName?: string;
}

// Zone Definitions
export interface ZoneInfo {
  id: number;
  name: string;
  code: string;
  description: string;
  sampleCities: string[];
}

export const ZONES_CONFIG: Record<number, ZoneInfo> = {
  1: {
    id: 1,
    name: 'Zone 1: Local / Intra-NCR',
    code: 'NCR',
    description: 'Delhi, Faridabad, Gurgaon, Noida, Ghaziabad',
    sampleCities: ['Delhi', 'Faridabad', 'Gurgaon', 'Noida', 'Ghaziabad']
  },
  2: {
    id: 2,
    name: 'Zone 2: Regional / North',
    code: 'NORTH',
    description: 'Chandigarh, Punjab, Haryana, Rajasthan, Western UP, Uttarakhand',
    sampleCities: ['Chandigarh', 'Moradabad', 'Jaipur', 'Ludhiana', 'Lucknow', 'Dehradun']
  },
  3: {
    id: 3,
    name: 'Zone 3: Metro to Metro',
    code: 'METRO',
    description: 'Tier-1 Metros: Chennai, Hyderabad, Kolkata, Mumbai, Bengaluru, Pune, Ahmedabad',
    sampleCities: ['Chennai', 'Hyderabad', 'Kolkata', 'Mumbai', 'Bengaluru', 'Pune', 'Ahmedabad']
  },
  4: {
    id: 4,
    name: 'Zone 4: Rest of India (ROI)',
    code: 'ROI',
    description: 'Tier-2/3 Cities & Rural MP, Bihar, Odisha, Kerala, AP, Rural TN, Gujarat',
    sampleCities: ['Bhopal', 'Patna', 'Bhubaneswar', 'Kochi', 'Vizag', 'Coimbatore', 'Indore']
  },
  5: {
    id: 5,
    name: 'Zone 5: Special / Remote Air',
    code: 'REMOTE',
    description: 'J&K, Ladakh, North-East States, Sikkim, Andaman & Nicobar, Lakshadweep',
    sampleCities: ['Srinagar', 'Guwahati', 'Imphal', 'Gangtok', 'Port Blair', 'Agartala', 'Leh']
  }
};

// Auto-resolve Zone from 6-digit Indian Pincode
export function resolveZoneFromPincode(pincode: string): { zoneId: number; cityGuess: string } {
  const cleanPin = pincode.trim().replace(/\D/g, '');
  if (cleanPin.length < 3) return { zoneId: 4, cityGuess: 'Rest of India' };

  if (cleanPin.startsWith('110') || cleanPin.startsWith('121') || cleanPin.startsWith('122') || cleanPin.startsWith('2013')) {
    let guess = 'Delhi NCR';
    if (cleanPin.startsWith('121')) guess = 'Faridabad';
    if (cleanPin.startsWith('122')) guess = 'Gurgaon';
    if (cleanPin.startsWith('2013')) guess = 'Noida / Ghaziabad';
    return { zoneId: 1, cityGuess: guess };
  }

  if (
    cleanPin.startsWith('190') || cleanPin.startsWith('191') || cleanPin.startsWith('192') || cleanPin.startsWith('193') || cleanPin.startsWith('194') ||
    cleanPin.startsWith('78') || cleanPin.startsWith('79') ||
    cleanPin.startsWith('737') ||
    cleanPin.startsWith('744') ||
    cleanPin.startsWith('6825')
  ) {
    let guess = 'Special / Remote Region';
    if (cleanPin.startsWith('19')) guess = 'Jammu & Kashmir / Ladakh';
    if (cleanPin.startsWith('78') || cleanPin.startsWith('79')) guess = 'North-East Region';
    if (cleanPin.startsWith('744')) guess = 'Andaman & Nicobar';
    return { zoneId: 5, cityGuess: guess };
  }

  if (
    cleanPin.startsWith('400') || cleanPin.startsWith('401') || cleanPin.startsWith('402') || cleanPin.startsWith('403') || cleanPin.startsWith('404') ||
    cleanPin.startsWith('600') || cleanPin.startsWith('601') || cleanPin.startsWith('602') || cleanPin.startsWith('603') ||
    cleanPin.startsWith('500') || cleanPin.startsWith('501') || cleanPin.startsWith('502') || cleanPin.startsWith('503') ||
    cleanPin.startsWith('700') || cleanPin.startsWith('701') || cleanPin.startsWith('702') || cleanPin.startsWith('703') ||
    cleanPin.startsWith('560') || cleanPin.startsWith('561') || cleanPin.startsWith('562') ||
    cleanPin.startsWith('411') ||
    cleanPin.startsWith('380')
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

  if (
    cleanPin.startsWith('12') || cleanPin.startsWith('13') || cleanPin.startsWith('14') || cleanPin.startsWith('15') || cleanPin.startsWith('16') ||
    cleanPin.startsWith('24') || cleanPin.startsWith('25') || cleanPin.startsWith('26') ||
    cleanPin.startsWith('30') || cleanPin.startsWith('31') || cleanPin.startsWith('32') || cleanPin.startsWith('33') || cleanPin.startsWith('34')
  ) {
    let guess = 'North Regional';
    if (cleanPin.startsWith('16')) guess = 'Chandigarh';
    if (cleanPin.startsWith('244')) guess = 'Moradabad';
    if (cleanPin.startsWith('302')) guess = 'Jaipur';
    return { zoneId: 2, cityGuess: guess };
  }

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

  // 4. Selected Carrier State
  const [selectedCarrierId, setSelectedCarrierId] = useState<string>('delhivery_surface');
  const [expandedCarrierId, setExpandedCarrierId] = useState<string | null>(null);

  // 5. Preset Order & Feedback
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
      if (ord.customerName) {
        if (ord.customerName.toLowerCase().includes('chennai')) { setPincode('600001'); setSelectedCityOverride('Chennai'); }
        if (ord.customerName.toLowerCase().includes('mumbai')) { setPincode('400001'); setSelectedCityOverride('Mumbai'); }
        if (ord.customerName.toLowerCase().includes('faridabad')) { setPincode('121001'); setSelectedCityOverride('Faridabad'); }
      }
    }
  };

  // Raw Billable Weight Calculation
  const { deadWeightKg, volumetricWeightKg, rawBillableWeightKg, isVolumetricGoverning } = useMemo(() => {
    const parsedDead = parseFloat(deadWeight) || 0;
    const deadKg = weightUnit === 'g' ? parsedDead / 1000 : parsedDead;

    const l = parseFloat(lengthCm) || 0;
    const w = parseFloat(widthCm) || 0;
    const h = parseFloat(heightCm) || 0;
    const volKg = (l * w * h) / 5000;

    const rawBillable = Math.max(deadKg, volKg);
    return {
      deadWeightKg: deadKg,
      volumetricWeightKg: volKg,
      rawBillableWeightKg: rawBillable,
      isVolumetricGoverning: volKg > deadKg && volKg > 0
    };
  }, [deadWeight, weightUnit, lengthCm, widthCm, heightCm]);

  // Multi-Carrier Evaluations
  const carrierResults = useMemo(() => {
    return evaluateAllCarriers(selectedZoneId, rawBillableWeightKg);
  }, [selectedZoneId, rawBillableWeightKg]);

  // Selected Carrier Result
  const selectedResult = useMemo(() => {
    return carrierResults.find(r => r.carrier.id === selectedCarrierId) || carrierResults[0];
  }, [carrierResults, selectedCarrierId]);

  const activeZone = ZONES_CONFIG[selectedZoneId] || ZONES_CONFIG[3];

  // Copy Formatted Text Quote
  const handleCopyQuote = () => {
    if (!selectedResult) return;
    const textQuote = `📦 *LOGISTICS QUOTE: ${selectedResult.carrier.name.toUpperCase()}*
────────────────────────────
Destination: ${isValidPincode ? pincode : 'India'} (${activeZone.name})
Carrier Service: ${selectedResult.carrier.name} (${selectedResult.carrier.type})
Chargeable Weight: ${selectedResult.chargedWeightKg} kg (${isVolumetricGoverning ? 'Volumetric' : 'Actual Dead Weight'})
Estimated Transit: ${selectedResult.transitTime}

💰 *COST BREAKDOWN*:
• Base Freight (Slab 1): ₹${selectedResult.baseFreightRate.toFixed(2)}
• Additional Slabs (${selectedResult.additionalSlabs}x): ₹${selectedResult.additionalFreightFee.toFixed(2)}
• Handling & Docket Charge: ₹${selectedResult.docketFee.toFixed(2)}
• Fuel Surcharge (${(selectedResult.carrier.fuelSurchargePct * 100).toFixed(0)}% FSC): ₹${selectedResult.fuelSurchargeAmount.toFixed(2)}
• Subtotal: ₹${selectedResult.subtotalBeforeTax.toFixed(2)}
• GST (${(selectedResult.carrier.gstPct * 100).toFixed(0)}%): ₹${selectedResult.gstAmount.toFixed(2)}
────────────────────────────
👉 *TOTAL SHIPPING PAYABLE: ₹${selectedResult.totalPayable}*
────────────────────────────`;

    navigator.clipboard.writeText(textQuote);
    setCopiedQuote(true);
    setTimeout(() => setCopiedQuote(false), 2500);
  };

  // Attach Quote to Order
  const handleSaveToOrder = () => {
    if (!selectedPresetOrderId || !onUpdateOrder || !selectedResult) return;
    const targetOrder = orders.find(o => o.orderId === selectedPresetOrderId);
    if (!targetOrder) return;

    const newLogs = [...(targetOrder.auditLogs || [])];
    newLogs.push({
      timestamp: new Date().toISOString(),
      staffId: currentStaffName,
      action: 'ATTACHED_CARRIER_QUOTE',
      details: `Selected ${selectedResult.carrier.name} quote ₹${selectedResult.totalPayable} (${selectedResult.chargedWeightKg}kg to ${activeZone.code})`,
      type: 'EDIT_LOG'
    });

    const updatedOrder: OrderRecord = {
      ...targetOrder,
      courier: selectedResult.carrier.name,
      shippingAmount: selectedResult.totalPayable.toString(),
      weight: `${selectedResult.chargedWeightKg} kg`,
      auditLogs: newLogs,
      updatedAt: new Date().toISOString()
    };

    onUpdateOrder(updatedOrder);
    setSavedToOrderMsg(`${selectedResult.carrier.name} quote ₹${selectedResult.totalPayable} attached to Order #${selectedPresetOrderId}!`);
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
                <h1 className="text-2xl font-black text-slate-900 font-sans">Shipping Charge Calculator</h1>
                <p className="text-slate-500 text-xs font-medium">Multi-Carrier Comparison & Zone Engine for Indian Domestic Logistics</p>
              </div>
            </div>
          </div>

          {/* Quick Preset Order Loader */}
          {orders.length > 0 && (
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 p-2 rounded-2xl">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider pl-1">Preset Order:</span>
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

      {/* Loss Prevention Alert Banner */}
      <div className="bg-amber-50/70 border border-amber-200/80 rounded-3xl p-4 shadow-2xs">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0" />
            <p className="text-xs text-amber-900 font-medium leading-relaxed">
              <strong className="font-extrabold uppercase">Multi-Carrier Rating Matrix:</strong> Evaluates exact slab pricing, docket fees (₹0–₹50), FSC % & GST (18%) across Delhivery, Blue Dart, DTDC, and India Post.
            </p>
          </div>
          <span className="text-[10px] font-extrabold text-amber-800 bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-full uppercase font-mono shrink-0">
            Airtight Rates
          </span>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column: Form Inputs & Carrier Comparison Grid (7 cols) */}
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

            {/* City Fallback & Zone Details */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  Quick City Fallback Mapping
                </label>
                <span className="text-[10px] text-slate-400 font-medium">Auto-resolves zone from PIN</span>
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

              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-slate-900">{activeZone.name}</span>
                    <span className="px-2 py-0.5 bg-[#832f5e] text-white text-[9px] font-extrabold uppercase rounded-md tracking-wider">
                      {activeZone.code}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium">{activeZone.description}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Chargeable Weight Calculation Engine */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-xs font-bold text-slate-800 uppercase tracking-widest flex items-center gap-2">
                <Scale className="w-4 h-4 text-emerald-600" />
                2. Weight & Package Dimensions
              </h2>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  Actual Dead Weight
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

            {/* Volumetric Dimension Accordion */}
            <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50 space-y-3">
              <div 
                onClick={() => setIsVolumetricExpanded(!isVolumetricExpanded)}
                className="flex items-center justify-between cursor-pointer select-none"
              >
                <div className="flex items-center gap-2">
                  <Box className="w-4 h-4 text-purple-600" />
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Box Dimensions (L × W × H in cm)
                  </span>
                </div>
                <span className="text-[11px] font-mono font-bold text-purple-700 bg-purple-50 border border-purple-100 px-2 py-0.5 rounded-md">
                  Volumetric: {volumetricWeightKg.toFixed(2)} kg
                </span>
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
                </div>
              )}
            </div>
          </div>

          {/* Card 3: Multi-Carrier Partner Comparison Module */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-xs font-bold text-slate-800 uppercase tracking-widest flex items-center gap-2">
                <Truck className="w-4 h-4 text-[#832f5e]" />
                3. Logistics Partner Comparison & Selection
              </h2>
              <span className="text-[10px] font-bold text-slate-400 font-mono">
                {carrierResults.length} Partners Evaluated
              </span>
            </div>

            <div className="space-y-3">
              {carrierResults.map((result) => {
                const isSelected = selectedCarrierId === result.carrier.id;
                const isExpanded = expandedCarrierId === result.carrier.id;

                return (
                  <div
                    key={result.carrier.id}
                    className={`rounded-2xl border-2 transition-all overflow-hidden ${
                      isSelected 
                        ? 'border-[#832f5e] bg-[#832f5e]/5 shadow-sm' 
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div 
                      onClick={() => setSelectedCarrierId(result.carrier.id)}
                      className="p-4 flex items-center justify-between cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="carrierSelection"
                          checked={isSelected}
                          onChange={() => setSelectedCarrierId(result.carrier.id)}
                          className="w-4 h-4 text-[#832f5e] focus:ring-[#832f5e] cursor-pointer"
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-extrabold text-slate-900">{result.carrier.name}</h3>
                            
                            {/* Partner Badges */}
                            {result.isRecommended && (
                              <span className="px-2 py-0.5 bg-[#832f5e] text-white text-[9px] font-black uppercase rounded-md tracking-wider">
                                Recommended
                              </span>
                            )}
                            {result.isCheapest && (
                              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300 text-[9px] font-black uppercase rounded-md tracking-wider">
                                Cheapest
                              </span>
                            )}
                            {result.isFastest && (
                              <span className="px-2 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 text-[9px] font-black uppercase rounded-md tracking-wider">
                                Fastest
                              </span>
                            )}
                          </div>

                          <p className="text-[11px] text-slate-500 font-medium flex items-center gap-3 mt-0.5">
                            <span>Service: <strong>{result.carrier.type}</strong></span>
                            <span>•</span>
                            <span className="flex items-center gap-1 text-slate-700 font-bold">
                              <Clock className="w-3 h-3 text-emerald-600" />
                              {result.transitTime}
                            </span>
                            <span>•</span>
                            <span>Min Slab: {result.carrier.minWeightSlab}kg</span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-right">
                        <div>
                          <div className="text-lg font-black font-mono text-slate-900">
                            ₹{result.totalPayable.toLocaleString('en-IN')}
                          </div>
                          <div className="text-[10px] text-slate-400 font-bold font-mono">
                            {result.chargedWeightKg} kg Charged
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedCarrierId(isExpanded ? null : result.carrier.id);
                          }}
                          className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Expandable Breakdown Drawer */}
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-2 border-t border-slate-200/60 bg-slate-50/60 font-sans text-xs space-y-2">
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          Rate Calculation Breakdown ({result.carrier.name})
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                          <div className="flex justify-between py-0.5 border-b border-slate-200/60">
                            <span className="text-slate-500">Base Freight ({result.carrier.minWeightSlab}kg):</span>
                            <span className="font-bold text-slate-800">₹{result.baseFreightRate.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between py-0.5 border-b border-slate-200/60">
                            <span className="text-slate-500">Additional Slabs ({result.additionalSlabs}x):</span>
                            <span className="font-bold text-slate-800">₹{result.additionalFreightFee.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between py-0.5 border-b border-slate-200/60">
                            <span className="text-slate-500">Docket Fee:</span>
                            <span className="font-bold text-slate-800">₹{result.docketFee.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between py-0.5 border-b border-slate-200/60">
                            <span className="text-slate-500">Fuel Surcharge ({(result.carrier.fuelSurchargePct * 100).toFixed(0)}%):</span>
                            <span className="font-bold text-slate-800">₹{result.fuelSurchargeAmount.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between py-0.5 border-b border-slate-200/60">
                            <span className="text-slate-500">Subtotal Before Tax:</span>
                            <span className="font-bold text-slate-800">₹{result.subtotalBeforeTax.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between py-0.5 border-b border-slate-200/60">
                            <span className="text-slate-500">GST (18%):</span>
                            <span className="font-bold text-slate-800">₹{result.gstAmount.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* Right Column: Live Summary & Selected Carrier Quote Card (5 cols) */}
        <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-6">
          
          <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-xl space-y-6 relative overflow-hidden border border-slate-800">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#832f5e]/20 rounded-full blur-2xl pointer-events-none"></div>

            {/* Title Bar */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-amber-400" />
                <span className="text-xs font-bold uppercase tracking-widest text-slate-300">
                  Selected Carrier Quote
                </span>
              </div>
              
              <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-extrabold uppercase tracking-wider border border-emerald-500/30">
                GST Compliant
              </span>
            </div>

            {/* Selected Partner Header */}
            <div className="space-y-1 text-center py-3 bg-slate-800/60 rounded-2xl border border-slate-700/60 p-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                {selectedResult.carrier.name} ({selectedResult.carrier.type})
              </div>
              <div className="text-4xl font-black font-mono text-amber-400">
                ₹{selectedResult.totalPayable.toLocaleString('en-IN')}
              </div>
              <div className="text-[11px] text-slate-300 font-medium">
                Est. Transit: <strong className="text-emerald-400">{selectedResult.transitTime}</strong> ({activeZone.code})
              </div>
            </div>

            {/* Chargeable Weight Applied Badge */}
            <div className={`p-3 rounded-xl border text-xs font-sans flex items-center justify-between ${
              isVolumetricGoverning 
                ? 'bg-purple-950/40 border-purple-800/60 text-purple-200' 
                : 'bg-emerald-950/40 border-emerald-800/60 text-emerald-200'
            }`}>
              <div>
                <span className="block text-[10px] uppercase font-bold text-slate-400">Chargeable Weight Applied</span>
                <span className="font-mono font-bold text-sm">{selectedResult.chargedWeightKg} kg ({selectedResult.totalSlabs} Slabs)</span>
              </div>
              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                {isVolumetricGoverning ? 'Volumetric' : 'Dead Weight'}
              </span>
            </div>

            {/* Granular Cost Breakdown Table */}
            <div className="space-y-3 text-xs font-sans">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-800 pb-1">
                Cost Breakdown ({selectedResult.carrier.name})
              </div>

              <div className="space-y-2 font-mono">
                <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Base Freight ({selectedResult.carrier.minWeightSlab}kg)</span>
                  <span className="font-bold text-slate-200">₹{selectedResult.baseFreightRate.toFixed(2)}</span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">
                    Additional Slabs ({selectedResult.additionalSlabs} × 0.5kg)
                  </span>
                  <span className="font-bold text-slate-200">₹{selectedResult.additionalFreightFee.toFixed(2)}</span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Handling & Docket Fee</span>
                  <span className="font-bold text-slate-200">₹{selectedResult.docketFee.toFixed(2)}</span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Fuel Surcharge ({(selectedResult.carrier.fuelSurchargePct * 100).toFixed(0)}% FSC)</span>
                  <span className="font-bold text-slate-200">₹{selectedResult.fuelSurchargeAmount.toFixed(2)}</span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Subtotal Before Tax</span>
                  <span className="font-bold text-slate-100">₹{selectedResult.subtotalBeforeTax.toFixed(2)}</span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-slate-800/60 text-amber-300">
                  <span>Goods & Services Tax (18% GST)</span>
                  <span className="font-bold">₹{selectedResult.gstAmount.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
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

          </div>

        </div>

      </div>

    </div>
  );
};
