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
    name: 'Zone 1: Local / Intra-Kerala',
    code: 'KERALA',
    description: 'Malappuram (676505), Kozhikode, Kochi, Trivandrum, Thrissur, Kannur, Palakkad',
    sampleCities: ['Malappuram', 'Kozhikode', 'Kochi', 'Trivandrum', 'Thrissur', 'Kannur']
  },
  2: {
    id: 2,
    name: 'Zone 2: Regional / South Tier 1 & 2',
    code: 'SOUTH',
    description: 'Coimbatore, Mysore, Madurai, Mangalore, Vijayawada, Rural TN/KA/AP/TS',
    sampleCities: ['Coimbatore', 'Mysore', 'Madurai', 'Mangalore', 'Vijayawada']
  },
  3: {
    id: 3,
    name: 'Zone 3: Metro to Metro',
    code: 'METRO',
    description: 'Tier-1 Metros: Chennai, Bengaluru, Hyderabad, Mumbai, Delhi NCR, Kolkata, Pune, Ahmedabad',
    sampleCities: ['Chennai', 'Bengaluru', 'Hyderabad', 'Mumbai', 'Delhi', 'Kolkata']
  },
  4: {
    id: 4,
    name: 'Zone 4: Rest of India (ROI)',
    code: 'ROI',
    description: 'Maharashtra, Gujarat, MP, Rajasthan, UP, Bihar, WB, Odisha, Punjab, Haryana',
    sampleCities: ['Faridabad', 'Bhopal', 'Patna', 'Bhubaneswar', 'Jaipur', 'Lucknow']
  },
  5: {
    id: 5,
    name: 'Zone 5: Special / Remote Air',
    code: 'REMOTE',
    description: 'Jammu & Kashmir, Ladakh, North-East States, Sikkim, Andaman & Nicobar, Lakshadweep',
    sampleCities: ['Srinagar', 'Guwahati', 'Imphal', 'Gangtok', 'Port Blair', 'Kavaratti']
  }
};

export function getZonesConfig(originPincode: string = '676505'): Record<number, ZoneInfo> {
  const cleanOrigin = originPincode.trim().replace(/\D/g, '') || '676505';
  const isKerala = cleanOrigin.startsWith('67') || cleanOrigin.startsWith('68') || cleanOrigin.startsWith('69') || cleanOrigin === '676505';

  if (isKerala) {
    return ZONES_CONFIG;
  }

  // Secondary Fallback for North / NCR
  if (cleanOrigin.startsWith('11') || cleanOrigin.startsWith('12') || cleanOrigin.startsWith('13') || cleanOrigin.startsWith('20')) {
    return {
      1: { id: 1, name: 'Zone 1: Local / Intra-NCR', code: 'NCR', description: 'Delhi, Faridabad, Gurgaon, Noida, Ghaziabad', sampleCities: ['Delhi', 'Faridabad', 'Gurgaon', 'Noida'] },
      2: { id: 2, name: 'Zone 2: Regional / North', code: 'NORTH', description: 'Chandigarh, Punjab, Haryana, Rajasthan, UP', sampleCities: ['Chandigarh', 'Moradabad', 'Jaipur'] },
      3: ZONES_CONFIG[3],
      4: ZONES_CONFIG[4],
      5: ZONES_CONFIG[5]
    };
  }

  return ZONES_CONFIG;
}

// Auto-resolve Zone from 6-digit Indian Pincode relative to Origin
export function resolveZoneFromPincode(pincode: string, originPincode: string = '676505'): { zoneId: number; cityGuess: string } {
  const cleanPin = pincode.trim().replace(/\D/g, '');
  const cleanOrigin = originPincode.trim().replace(/\D/g, '') || '676505';
  if (cleanPin.length < 3) return { zoneId: 4, cityGuess: 'Rest of India' };

  const isOriginKerala = cleanOrigin.startsWith('67') || cleanOrigin.startsWith('68') || cleanOrigin.startsWith('69') || cleanOrigin === '676505';

  if (isOriginKerala) {
    // Zone 1: Intra-Kerala
    if (cleanPin.startsWith('67') || cleanPin.startsWith('68') || cleanPin.startsWith('69')) {
      let guess = 'Kerala Intra-State';
      if (cleanPin.startsWith('676')) guess = 'Malappuram (Origin District)';
      if (cleanPin.startsWith('673')) guess = 'Kozhikode';
      if (cleanPin.startsWith('682')) guess = 'Kochi / Ernakulam';
      if (cleanPin.startsWith('695')) guess = 'Trivandrum';
      if (cleanPin.startsWith('680')) guess = 'Thrissur';
      if (cleanPin.startsWith('670')) guess = 'Kannur';
      return { zoneId: 1, cityGuess: guess };
    }

    // Zone 5: Remote / Air
    if (
      cleanPin.startsWith('190') || cleanPin.startsWith('191') || cleanPin.startsWith('192') || cleanPin.startsWith('193') || cleanPin.startsWith('194') ||
      cleanPin.startsWith('78') || cleanPin.startsWith('79') ||
      cleanPin.startsWith('737') || cleanPin.startsWith('744') || cleanPin.startsWith('6825')
    ) {
      let guess = 'Special / Remote Region';
      if (cleanPin.startsWith('19')) guess = 'Jammu & Kashmir / Ladakh';
      if (cleanPin.startsWith('78') || cleanPin.startsWith('79')) guess = 'North-East Region';
      if (cleanPin.startsWith('744')) guess = 'Andaman & Nicobar';
      if (cleanPin.startsWith('6825')) guess = 'Lakshadweep Islands';
      return { zoneId: 5, cityGuess: guess };
    }

    // Zone 3: Tier-1 Metros
    if (
      cleanPin.startsWith('400') || cleanPin.startsWith('401') || cleanPin.startsWith('402') || cleanPin.startsWith('403') || cleanPin.startsWith('404') ||
      cleanPin.startsWith('600') || cleanPin.startsWith('601') || cleanPin.startsWith('602') || cleanPin.startsWith('603') ||
      cleanPin.startsWith('500') || cleanPin.startsWith('501') || cleanPin.startsWith('502') || cleanPin.startsWith('503') ||
      cleanPin.startsWith('700') || cleanPin.startsWith('701') || cleanPin.startsWith('702') || cleanPin.startsWith('703') ||
      cleanPin.startsWith('560') || cleanPin.startsWith('561') || cleanPin.startsWith('562') ||
      cleanPin.startsWith('411') || cleanPin.startsWith('380') || cleanPin.startsWith('110')
    ) {
      let guess = 'Tier-1 Metro';
      if (cleanPin.startsWith('60')) guess = 'Chennai Metro';
      if (cleanPin.startsWith('56')) guess = 'Bengaluru Metro';
      if (cleanPin.startsWith('50')) guess = 'Hyderabad Metro';
      if (cleanPin.startsWith('40')) guess = 'Mumbai Metro';
      if (cleanPin.startsWith('110')) guess = 'Delhi NCR Metro';
      if (cleanPin.startsWith('70')) guess = 'Kolkata Metro';
      if (cleanPin.startsWith('411')) guess = 'Pune Metro';
      if (cleanPin.startsWith('380')) guess = 'Ahmedabad Metro';
      return { zoneId: 3, cityGuess: guess };
    }

    // Zone 2: South Regional (TN, KA, AP, TS)
    if (
      cleanPin.startsWith('60') || cleanPin.startsWith('61') || cleanPin.startsWith('62') || cleanPin.startsWith('63') || cleanPin.startsWith('64') ||
      cleanPin.startsWith('56') || cleanPin.startsWith('57') || cleanPin.startsWith('58') || cleanPin.startsWith('59') ||
      cleanPin.startsWith('50') || cleanPin.startsWith('51') || cleanPin.startsWith('52') || cleanPin.startsWith('53')
    ) {
      let guess = 'South Regional';
      if (cleanPin.startsWith('641')) guess = 'Coimbatore (TN)';
      if (cleanPin.startsWith('570')) guess = 'Mysore (KA)';
      if (cleanPin.startsWith('520')) guess = 'Vijayawada (AP)';
      return { zoneId: 2, cityGuess: guess };
    }

    return { zoneId: 4, cityGuess: 'Rest of India' };
  }

  // Delhi NCR Origin
  if (cleanPin.startsWith('110') || cleanPin.startsWith('121') || cleanPin.startsWith('122') || cleanPin.startsWith('2013')) {
    return { zoneId: 1, cityGuess: 'Delhi NCR' };
  }
  if (
    cleanPin.startsWith('190') || cleanPin.startsWith('191') || cleanPin.startsWith('78') || cleanPin.startsWith('79') || cleanPin.startsWith('744')
  ) {
    return { zoneId: 5, cityGuess: 'Remote Region' };
  }

  return { zoneId: 4, cityGuess: 'Rest of India' };
}

export const ShippingRateCalculator: React.FC<ShippingRateCalculatorProps> = ({
  orders = [],
  onUpdateOrder,
  currentStaffName = 'Logistics Manager'
}) => {
  // 1. Origin & Destination Inputs
  const [originPincode, setOriginPincode] = useState('676505');
  const [origin, setOrigin] = useState('Malappuram Warehouse (676505)');
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

  // 5. Preset Order, Feedback & Sales Report Audit
  const [selectedPresetOrderId, setSelectedPresetOrderId] = useState<string>('');
  const [copiedQuote, setCopiedQuote] = useState(false);
  const [savedToOrderMsg, setSavedToOrderMsg] = useState<string | null>(null);
  const [showAuditTable, setShowAuditTable] = useState(false);

  // Pincode Validation
  const isValidPincode = useMemo(() => {
    return /^[1-9][0-9]{5}$/.test(pincode.trim());
  }, [pincode]);

  // Auto-resolve Zone when Pincode or Fallback City changes
  useEffect(() => {
    if (selectedCityOverride !== 'AUTO') {
      const cityZoneMap: Record<string, number> = {
        'Malappuram': 1, 'Kozhikode': 1, 'Kochi': 1, 'Trivandrum': 1, 'Thrissur': 1, 'Kannur': 1,
        'Coimbatore': 2, 'Mysore': 2, 'Madurai': 2, 'Mangalore': 2, 'Vijayawada': 2,
        'Faridabad': 4, 'Gurgaon': 4, 'Noida': 4, 'Delhi': 3,
        'Chandigarh': 4, 'Moradabad': 4, 'Ludhiana': 4, 'Jaipur': 4, 'Lucknow': 4,
        'Chennai': 3, 'Hyderabad': 3, 'Kolkata': 3, 'Mumbai': 3, 'Bengaluru': 3, 'Pune': 3, 'Ahmedabad': 3,
        'Bhopal': 4, 'Patna': 4, 'Bhubaneswar': 4, 'Vizag': 2,
        'Srinagar': 5, 'Guwahati': 5, 'Port Blair': 5, 'Imphal': 5
      };
      if (cityZoneMap[selectedCityOverride]) {
        setSelectedZoneId(cityZoneMap[selectedCityOverride]);
      }
    } else if (isValidPincode) {
      const { zoneId } = resolveZoneFromPincode(pincode, originPincode);
      setSelectedZoneId(zoneId);
    }
  }, [pincode, originPincode, selectedCityOverride, isValidPincode]);

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
        if (ord.customerName.toLowerCase().includes('kochi') || ord.customerName.toLowerCase().includes('kerala')) { setPincode('682001'); setSelectedCityOverride('Kochi'); }
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

  const activeZonesConfig = useMemo(() => getZonesConfig(originPincode), [originPincode]);
  const activeZone = activeZonesConfig[selectedZoneId] || activeZonesConfig[3];

  // Copy Formatted Text Quote
  const handleCopyQuote = () => {
    if (!selectedResult) return;
    const textQuote = `📦 *LOGISTICS QUOTE: ${selectedResult.carrier.name.toUpperCase()}*
────────────────────────────
Origin: ${originPincode} (Malappuram / Kerala)
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
      details: `Selected ${selectedResult.carrier.name} quote ₹${selectedResult.totalPayable} (${selectedResult.chargedWeightKg}kg from ${originPincode} to ${activeZone.code})`,
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
                <p className="text-slate-500 text-xs font-medium">Origin PIN: <strong className="text-[#832f5e] font-mono">{originPincode}</strong> (Malappuram / Kerala Warehouse)</p>
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

      {/* Calibrated Sales Report Banner & Benchmark Audit */}
      <div className="bg-amber-50/80 border border-amber-200 rounded-3xl p-4 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0" />
            <p className="text-xs text-amber-900 font-medium leading-relaxed">
              <strong className="font-extrabold uppercase">Calibrated May-Aug Dispatch Rates (Origin PIN {originPincode}):</strong> Rates are calibrated against historical May, June, July, and August sales report invoice data across BlueDart, Delhivery, DTDC, Trackon & Speed & Safe.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAuditTable(!showAuditTable)}
            className="text-[10px] font-extrabold text-amber-900 bg-amber-200/80 hover:bg-amber-200 border border-amber-300 px-3 py-1.5 rounded-xl uppercase font-mono shrink-0 cursor-pointer flex items-center justify-center gap-1.5 transition-all"
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>{showAuditTable ? 'Hide May-Aug Sales Rates' : 'View May-Aug Calibrated Rates'}</span>
          </button>
        </div>

        {showAuditTable && (
          <div className="pt-3 border-t border-amber-200/80 overflow-x-auto">
            <table className="w-full text-left text-[11px] font-mono border-collapse">
              <thead>
                <tr className="border-b border-amber-300 text-amber-900 font-bold uppercase text-[10px] bg-amber-100/50">
                  <th className="py-1.5 px-2.5">Carrier & Service</th>
                  <th className="py-1.5 px-2.5">Kerala (Zone 1)</th>
                  <th className="py-1.5 px-2.5">South (Zone 2)</th>
                  <th className="py-1.5 px-2.5">Metro (Zone 3)</th>
                  <th className="py-1.5 px-2.5">ROI (Zone 4)</th>
                  <th className="py-1.5 px-2.5">Remote/Air (Zone 5)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-200/60 text-amber-950">
                <tr>
                  <td className="py-2 px-2.5 font-bold">BlueDart Surface (0.5kg Base)</td>
                  <td className="py-2 px-2.5">₹82.31 incl GST</td>
                  <td className="py-2 px-2.5">₹82.31 incl GST</td>
                  <td className="py-2 px-2.5">₹97.28 incl GST</td>
                  <td className="py-2 px-2.5">₹97.28 incl GST</td>
                  <td className="py-2 px-2.5">₹116.52 incl GST</td>
                </tr>
                <tr>
                  <td className="py-2 px-2.5 font-bold">BlueDart Express (Air 0.5kg)</td>
                  <td className="py-2 px-2.5">₹58.32 incl GST</td>
                  <td className="py-2 px-2.5">₹116.64 incl GST</td>
                  <td className="py-2 px-2.5">₹174.96 incl GST</td>
                  <td className="py-2 px-2.5">₹235.19 incl GST</td>
                  <td className="py-2 px-2.5">₹271.40 incl GST</td>
                </tr>
                <tr>
                  <td className="py-2 px-2.5 font-bold">Delhivery Surface (0.5kg Base)</td>
                  <td className="py-2 px-2.5">₹37.17 incl GST</td>
                  <td className="py-2 px-2.5">₹81.77 incl GST</td>
                  <td className="py-2 px-2.5">₹127.44 incl GST</td>
                  <td className="py-2 px-2.5">₹142.20 incl GST</td>
                  <td className="py-2 px-2.5">₹205.32 incl GST</td>
                </tr>
                <tr>
                  <td className="py-2 px-2.5 font-bold">DTDC Ground (1.0kg Flat)</td>
                  <td className="py-2 px-2.5">₹70.00 flat</td>
                  <td className="py-2 px-2.5">₹100.00 incl GST</td>
                  <td className="py-2 px-2.5">₹150.00 incl GST</td>
                  <td className="py-2 px-2.5">₹200.00 incl GST</td>
                  <td className="py-2 px-2.5">₹300.00 incl GST</td>
                </tr>
                <tr>
                  <td className="py-2 px-2.5 font-bold">Trackon Air & Cargo (1.0kg)</td>
                  <td className="py-2 px-2.5">₹220.00 incl GST</td>
                  <td className="py-2 px-2.5">₹220.00 incl GST</td>
                  <td className="py-2 px-2.5">₹308.00 incl GST</td>
                  <td className="py-2 px-2.5">₹337.00 incl GST</td>
                  <td className="py-2 px-2.5">₹455.00 incl GST</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
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
                Origin: {originPincode}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Origin PIN Code (Dispatch Center)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    maxLength={6}
                    value={originPincode}
                    onChange={(e) => {
                      const newPin = e.target.value;
                      setOriginPincode(newPin);
                      setOrigin(`Warehouse (${newPin})`);
                    }}
                    placeholder="676505"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#832f5e]/20"
                  />
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 absolute right-3 top-3" />
                </div>
                <span className="text-[10px] text-emerald-700 font-semibold mt-1 block">
                  📍 Malappuram / Kerala Origin ({originPincode})
                </span>
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
                <option value="AUTO">-- Auto-Resolve From Destination PIN ({pincode}) --</option>
                <optgroup label="Zone 1 (Local / Intra-Kerala)">
                  <option value="Malappuram">Malappuram (Zone 1 - Origin District)</option>
                  <option value="Kozhikode">Kozhikode (Zone 1)</option>
                  <option value="Kochi">Kochi / Ernakulam (Zone 1)</option>
                  <option value="Trivandrum">Trivandrum (Zone 1)</option>
                  <option value="Thrissur">Thrissur (Zone 1)</option>
                  <option value="Kannur">Kannur (Zone 1)</option>
                </optgroup>
                <optgroup label="Zone 2 (Regional / South Tier 1 & 2)">
                  <option value="Coimbatore">Coimbatore / TN (Zone 2)</option>
                  <option value="Mysore">Mysore / KA (Zone 2)</option>
                  <option value="Madurai">Madurai / TN (Zone 2)</option>
                  <option value="Mangalore">Mangalore / KA (Zone 2)</option>
                  <option value="Vijayawada">Vijayawada / AP (Zone 2)</option>
                </optgroup>
                <optgroup label="Zone 3 (Metro to Metro)">
                  <option value="Chennai">Chennai Metro (Zone 3)</option>
                  <option value="Bengaluru">Bengaluru Metro (Zone 3)</option>
                  <option value="Hyderabad">Hyderabad Metro (Zone 3)</option>
                  <option value="Mumbai">Mumbai Metro (Zone 3)</option>
                  <option value="Delhi">Delhi NCR Metro (Zone 3)</option>
                  <option value="Kolkata">Kolkata Metro (Zone 3)</option>
                  <option value="Pune">Pune Metro (Zone 3)</option>
                  <option value="Ahmedabad">Ahmedabad Metro (Zone 3)</option>
                </optgroup>
                <optgroup label="Zone 4 (Rest of India)">
                  <option value="Faridabad">Faridabad / Haryana (Zone 4)</option>
                  <option value="Bhopal">Bhopal / MP (Zone 4)</option>
                  <option value="Patna">Patna / Bihar (Zone 4)</option>
                  <option value="Bhubaneswar">Bhubaneswar / Odisha (Zone 4)</option>
                  <option value="Jaipur">Jaipur / Rajasthan (Zone 4)</option>
                  <option value="Lucknow">Lucknow / UP (Zone 4)</option>
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
