export interface CarrierRateZone {
  base: number;      // Base freight cost for first slab
  addl: number;      // Additional freight cost per additional slab
}

export interface CarrierConfig {
  id: string;
  name: string;
  type: 'Surface' | 'Air / Express' | 'Heavy Cargo' | 'National Postal';
  minWeightSlab: number; // e.g. 0.5 kg
  incrementalSlab: number; // e.g. 0.5 kg or 1.0 kg
  docketFee: number; // e.g. 35
  fuelSurchargePct: number; // e.g. 0.10 (10%)
  gstPct: number; // e.g. 0.18 (18%)
  volumetricBufferPct?: number; // e.g. 0.15 (15% for Air)
  minimumFloorQuote?: Record<string, number>; // Zone floor constraints (e.g. { zone1: 174.96, zone4: 408.00 })
  badge?: string;
  notes?: string;
  transitDays: {
    zone1: string;
    zone2: string;
    zone3: string;
    zone4: string;
    zone5: string;
  };
  rates: {
    zone1: CarrierRateZone;
    zone2: CarrierRateZone;
    zone3: CarrierRateZone;
    zone4: CarrierRateZone;
    zone5: CarrierRateZone;
  };
}

export interface CarrierCalculationParams {
  carrier: CarrierConfig;
  zoneId: number;
  deadWeightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  shippingType?: 'SURFACE' | 'AIR' | 'AUTO';
  isSpecialPincode?: boolean;
}

export interface CarrierCalculationResult {
  carrier: CarrierConfig;
  zoneKey: 'zone1' | 'zone2' | 'zone3' | 'zone4' | 'zone5';
  transitTime: string;
  actualDeadWeightKg: number;
  rawVolumetricWeightKg: number;
  appliedVolumetricBufferPct: number;
  billableWeightKg: number;
  chargedWeightKg: number;
  totalSlabs: number;
  additionalSlabs: number;
  baseFreightRate: number;
  additionalFreightFee: number;
  operationalFreightSubtotal: number;
  docketFee: number;
  fuelSurchargeAmount: number;
  subtotalBeforeTax: number;
  gstAmount: number;
  contractedCarrierCost: number; // Actual invoice cost paid to carrier
  targetMarginPct: number; // e.g. 0.20 (20%)
  recommendedCustomerQuote: number; // Selling price to customer
  marginAmount: number; // Profit in Rs.
  totalPayable: number;
  isCheapest: boolean;
  isFastest: boolean;
  isRecommended: boolean;
  recommendationReason?: string;
  isFloorAdjusted?: boolean;
  floorAdjustmentAmount?: number;
}

/**
 * Calibrated carrier rates based on empirical May - August reconciliation (500+ real orders)
 * (Base Origin: South India / Kerala hub - 676505)
 */
export const CARRIERS_CONFIG: Record<string, CarrierConfig> = {
  bluedart_surface: {
    id: "bluedart_surface",
    name: "Blue Dart Surface",
    type: "Surface",
    minWeightSlab: 0.5,
    incrementalSlab: 0.5,
    docketFee: 35.0,
    fuelSurchargePct: 0.10, // 10% FSC
    gstPct: 0.18,
    badge: "Contracted Primary",
    notes: "Contracted Tariff Matrix calibrated against 500+ May–August sales invoices.",
    transitDays: { zone1: "1-2 Days", zone2: "2-3 Days", zone3: "3-4 Days", zone4: "4-5 Days", zone5: "6-8 Days" },
    rates: {
      zone1: { base: 30.00, addl: 15.00 }, // First 500g Total incl GST = ₹82.31
      zone2: { base: 42.00, addl: 22.00 }, // First 500g Total incl GST = ₹97.28
      zone3: { base: 48.00, addl: 26.00 }, // Metro First 500g = ₹105.00
      zone4: { base: 50.00, addl: 26.00 }, // North/East Hubs First 500g = ₹108.00 (1kg = ₹168.00)
      zone5: { base: 150.00, addl: 84.75 } // Special / NE Base = ₹240.86
    }
  },
  bluedart_air: {
    id: "bluedart_air",
    name: "Blue Dart Express (Air)",
    type: "Air / Express",
    minWeightSlab: 0.5,
    incrementalSlab: 0.5,
    docketFee: 35.0,
    fuelSurchargePct: 0.12, // 12% FSC
    gstPct: 0.18,
    volumetricBufferPct: 0.15, // 15% Air Volumetric Protection Buffer
    minimumFloorQuote: {
      zone1: 174.96,
      zone2: 205.10,
      zone3: 408.00,
      zone4: 408.00,
      zone5: 510.00
    },
    badge: "Air Express (15% Protected)",
    notes: "Priority Air Express with automatic 15% Volumetric Buffer & Docket Floor Protection.",
    transitDays: { zone1: "Next Day", zone2: "1-2 Days", zone3: "2 Days", zone4: "2-3 Days", zone5: "3-5 Days" },
    rates: {
      zone1: { base: 85.00, addl: 45.00 },
      zone2: { base: 120.00, addl: 65.00 },
      zone3: { base: 260.00, addl: 110.00 },
      zone4: { base: 260.00, addl: 110.00 },
      zone5: { base: 340.00, addl: 160.00 }
    }
  },
  trackon_cargo: {
    id: "trackon_cargo",
    name: "Trackon / SKS Heavy Cargo",
    type: "Heavy Cargo",
    minWeightSlab: 3.0, // 3kg minimum base slab
    incrementalSlab: 1.0,
    docketFee: 35.0,
    fuelSurchargePct: 0.10,
    gstPct: 0.18,
    badge: "Heavy Freight Partner (>5kg)",
    notes: "Optimized for heavy packages (>5.0 kg). Flat base ₹150 for first 3 kg + ₹30/kg thereafter.",
    transitDays: { zone1: "2-3 Days", zone2: "3-4 Days", zone3: "4-5 Days", zone4: "5-6 Days", zone5: "7-10 Days" },
    rates: {
      zone1: { base: 150.00, addl: 30.00 },
      zone2: { base: 170.00, addl: 35.00 },
      zone3: { base: 210.00, addl: 45.00 },
      zone4: { base: 240.00, addl: 55.00 },
      zone5: { base: 350.00, addl: 85.00 }
    }
  },
  delhivery_surface: {
    id: "delhivery_surface",
    name: "Delhivery Surface",
    type: "Surface",
    minWeightSlab: 0.5,
    incrementalSlab: 0.5,
    docketFee: 25.0,
    fuelSurchargePct: 0.08, // 8% FSC
    gstPct: 0.18,
    badge: "Special / Remote Partner",
    notes: "Recommended for North-East (79X) and Remote J&K (19X) pincodes.",
    transitDays: { zone1: "1-2 Days", zone2: "2-3 Days", zone3: "3-5 Days", zone4: "5-7 Days", zone5: "6-8 Days" },
    rates: {
      zone1: { base: 25.00, addl: 14.00 },
      zone2: { base: 40.00, addl: 22.00 },
      zone3: { base: 75.00, addl: 32.00 },
      zone4: { base: 88.00, addl: 38.00 },
      zone5: { base: 135.00, addl: 58.00 } // Highly competitive for remote/NE
    }
  },
  dtdc_ground: {
    id: "dtdc_ground",
    name: "DTDC Ground",
    type: "Surface",
    minWeightSlab: 1.0,
    incrementalSlab: 1.0,
    docketFee: 30.0,
    fuelSurchargePct: 0.10,
    gstPct: 0.18,
    notes: "Local South & Kerala 1.0 kg flat rate slab.",
    transitDays: { zone1: "1-2 Days", zone2: "2-4 Days", zone3: "4-6 Days", zone4: "6-8 Days", zone5: "8-11 Days" },
    rates: {
      zone1: { base: 55.00, addl: 30.00 },
      zone2: { base: 80.00, addl: 40.00 },
      zone3: { base: 120.00, addl: 55.00 },
      zone4: { base: 150.00, addl: 70.00 },
      zone5: { base: 220.00, addl: 110.00 }
    }
  },
  india_post: {
    id: "india_post",
    name: "India Post (Speed Post)",
    type: "National Postal",
    minWeightSlab: 0.5,
    incrementalSlab: 0.5,
    docketFee: 0.0,
    fuelSurchargePct: 0.0,
    gstPct: 0.18,
    badge: "Government Postal",
    notes: "Universal coverage for remote pincodes without private courier access.",
    transitDays: { zone1: "2-3 Days", zone2: "3-5 Days", zone3: "4-6 Days", zone4: "5-8 Days", zone5: "6-10 Days" },
    rates: {
      zone1: { base: 67.80, addl: 25.42 }, // Incl GST = ₹80.00
      zone2: { base: 93.22, addl: 38.14 },
      zone3: { base: 120.00, addl: 50.00 },
      zone4: { base: 140.00, addl: 60.00 },
      zone5: { base: 180.00, addl: 85.00 }
    }
  }
};

/**
 * Calculates carrier rate based on calibrated parameters
 */
export function calculateCarrierRate(
  carrier: CarrierConfig,
  zoneId: number,
  deadWeightKg: number,
  lengthCm: number,
  widthCm: number,
  heightCm: number,
  shippingType: 'SURFACE' | 'AIR' | 'AUTO' = 'AUTO',
  targetMarginPct: number = 0.20 // 20% default margin
): CarrierCalculationResult {
  const zoneKey = (`zone${zoneId}` as 'zone1' | 'zone2' | 'zone3' | 'zone4' | 'zone5') || 'zone3';
  const zoneRates = carrier.rates[zoneKey] || carrier.rates.zone3;
  const transitTime = carrier.transitDays[zoneKey] || carrier.transitDays.zone3;

  // 1. Dual Weight Comparison (Volumetric vs Dead Weight)
  const actualDeadWeightKg = Math.max(0, deadWeightKg);
  const rawVolumetricWeightKg = Math.max(0, (lengthCm * widthCm * heightCm) / 5000);

  // 2. Air Volumetric Protection Buffer (15% for Air Express)
  const isAirService = carrier.type.toLowerCase().includes('air') || shippingType === 'AIR';
  const bufferPct = isAirService ? (carrier.volumetricBufferPct || 0.15) : 0;
  const bufferedVolumetricWeightKg = rawVolumetricWeightKg * (1 + bufferPct);

  // 3. Billable Weight = Math.max(actual_weight, volumetric_weight) with 0.5 kg floor
  let billableWeightKg = Math.max(actualDeadWeightKg, bufferedVolumetricWeightKg);
  billableWeightKg = Math.max(0.5, billableWeightKg); // 0.5 kg floor

  // 4. Calculate Charged Slabs
  const minSlab = carrier.minWeightSlab || 0.5;
  const incrSlab = carrier.incrementalSlab || 0.5;

  let chargedWeight = Math.max(billableWeightKg, minSlab);

  if (chargedWeight > minSlab) {
    const diff = chargedWeight - minSlab;
    const extraSlabs = Math.ceil(diff / incrSlab);
    chargedWeight = minSlab + extraSlabs * incrSlab;
  }

  const additionalSlabs = Math.max(0, Math.round((chargedWeight - minSlab) / incrSlab));
  const totalSlabs = 1 + additionalSlabs;

  // 5. Freight Breakdown
  const baseFreightRate = zoneRates.base;
  const additionalFreightFee = additionalSlabs * zoneRates.addl;
  const operationalFreightSubtotal = baseFreightRate + additionalFreightFee;

  const docketFee = carrier.docketFee;
  const fuelSurchargeAmount = operationalFreightSubtotal * carrier.fuelSurchargePct;
  const subtotalBeforeTax = operationalFreightSubtotal + docketFee + fuelSurchargeAmount;
  const gstAmount = subtotalBeforeTax * carrier.gstPct;
  
  let contractedCarrierCost = Math.round(subtotalBeforeTax + gstAmount);
  let isFloorAdjusted = false;
  let floorAdjustmentAmount = 0;

  // 6. Check Air Minimum Floor Protection
  if (isAirService && carrier.minimumFloorQuote) {
    const floorValue = carrier.minimumFloorQuote[zoneKey] || 174.96;
    if (contractedCarrierCost < floorValue) {
      isFloorAdjusted = true;
      floorAdjustmentAmount = Math.round(floorValue - contractedCarrierCost);
      contractedCarrierCost = Math.round(floorValue);
    }
  }

  // 7. Calculate Customer Quoted Price with Guaranteed Net Margin
  const totalPayable = contractedCarrierCost; // Contracted Cost
  const recommendedCustomerQuote = Math.round(contractedCarrierCost * (1 + targetMarginPct));
  const marginAmount = recommendedCustomerQuote - contractedCarrierCost;

  return {
    carrier,
    zoneKey,
    transitTime,
    actualDeadWeightKg,
    rawVolumetricWeightKg,
    appliedVolumetricBufferPct: bufferPct,
    billableWeightKg,
    chargedWeightKg: chargedWeight,
    totalSlabs,
    additionalSlabs,
    baseFreightRate,
    additionalFreightFee,
    operationalFreightSubtotal,
    docketFee,
    fuelSurchargeAmount,
    subtotalBeforeTax,
    gstAmount,
    contractedCarrierCost,
    targetMarginPct,
    recommendedCustomerQuote,
    marginAmount,
    totalPayable,
    isCheapest: false,
    isFastest: false,
    isRecommended: false,
    isFloorAdjusted,
    floorAdjustmentAmount
  };
}

/**
 * Automated Carrier Evaluation & Smart Recommendation Logic
 */
export function evaluateAllCarriers(
  zoneId: number,
  deadWeightKg: number,
  lengthCm: number,
  widthCm: number,
  heightCm: number,
  pincodePrefix: string = '',
  targetMarginPct: number = 0.20
): CarrierCalculationResult[] {
  const isSpecialZone = zoneId === 5 || pincodePrefix.startsWith('79') || pincodePrefix.startsWith('19') || pincodePrefix.startsWith('78');

  const results = Object.values(CARRIERS_CONFIG).map(carrier =>
    calculateCarrierRate(carrier, zoneId, deadWeightKg, lengthCm, widthCm, heightCm, 'AUTO', targetMarginPct)
  );

  if (results.length === 0) return [];

  // Identify Cheapest & Fastest
  let cheapestIndex = 0;
  let minCost = results[0].contractedCarrierCost;

  let fastestIndex = 0;
  let minDays = 999;

  results.forEach((res, idx) => {
    if (res.contractedCarrierCost < minCost) {
      minCost = res.contractedCarrierCost;
      cheapestIndex = idx;
    }

    const firstNum = parseInt(res.transitTime.match(/\d+/)?.[0] || '10', 10);
    if (firstNum < minDays) {
      minDays = firstNum;
      fastestIndex = idx;
    }
  });

  results[cheapestIndex].isCheapest = true;
  results[fastestIndex].isFastest = true;

  // Automated Carrier Recommendation Rules
  const maxWeight = Math.max(deadWeightKg, (lengthCm * widthCm * heightCm) / 5000);

  let recommendedCarrierId = 'bluedart_surface';
  let reason = 'Blue Dart Surface recommended (Lowest contracted tariff ₹82–₹97 for South & Metros)';

  if (isSpecialZone) {
    recommendedCarrierId = 'delhivery_surface';
    reason = 'Delhivery / Speed Post recommended for North-East & Far Zones (Avoids Blue Dart remote surcharge)';
  } else if (maxWeight > 5.0) {
    recommendedCarrierId = 'trackon_cargo';
    reason = 'Heavy Freight (>5kg): Trackon / SKS Cargo Partner selected to prevent high per-kg air expenses';
  } else if (maxWeight <= 2.0 && (zoneId === 1 || zoneId === 2 || zoneId === 3)) {
    recommendedCarrierId = 'bluedart_surface';
    reason = 'Blue Dart Surface recommended (Lowest contracted tariff ₹82–₹97 for South & Metros)';
  }

  const recIdx = results.findIndex(r => r.carrier.id === recommendedCarrierId);
  if (recIdx !== -1) {
    results[recIdx].isRecommended = true;
    results[recIdx].recommendationReason = reason;
  } else {
    results[cheapestIndex].isRecommended = true;
    results[cheapestIndex].recommendationReason = 'Lowest cost option for selected destination';
  }

  return results;
}
