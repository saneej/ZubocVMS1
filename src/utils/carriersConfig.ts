export interface CarrierRateZone {
  base: number;
  addl: number;
}

export interface CarrierConfig {
  id: string;
  name: string;
  type: 'Surface' | 'Air / Priority' | 'National Postal' | string;
  minWeightSlab: number; // kg
  incrementalSlab: number; // kg
  docketFee: number;
  fuelSurchargePct: number; // e.g. 0.0 or 0.10
  gstPct: number; // 0.18 = 18%
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

/**
 * Calibrated carrier rates based on historical May - August sales dispatch invoice data
 * (Dispatch Origin: Kerala 676505)
 */
export const CARRIERS_CONFIG: Record<string, CarrierConfig> = {
  bluedart_surface: {
    id: "bluedart_surface",
    name: "Blue Dart Surface",
    type: "Surface",
    minWeightSlab: 0.5,
    incrementalSlab: 0.5,
    docketFee: 0,
    fuelSurchargePct: 0.0, // Included in base rate
    gstPct: 0.18,
    notes: "Primary Courier. Exact May-Aug sales report invoice benchmark",
    transitDays: { zone1: "1-2 Days", zone2: "2-3 Days", zone3: "3-5 Days", zone4: "4-6 Days", zone5: "6-9 Days" },
    rates: {
      zone1: { base: 69.75, addl: 28.81 }, // Base incl GST = ₹82.31, Addl incl GST = ₹34.00
      zone2: { base: 69.75, addl: 28.81 }, // Base incl GST = ₹82.31, Addl incl GST = ₹34.00
      zone3: { base: 82.44, addl: 38.14 }, // Base incl GST = ₹97.28, Addl incl GST = ₹45.00
      zone4: { base: 82.44, addl: 38.14 }, // Base incl GST = ₹97.28, Addl incl GST = ₹45.00
      zone5: { base: 98.75, addl: 61.60 }  // Base incl GST = ₹116.52, Addl incl GST = ₹72.69
    }
  },
  bluedart_air: {
    id: "bluedart_air",
    name: "Blue Dart Express (Air)",
    type: "Air / Priority",
    minWeightSlab: 0.5,
    incrementalSlab: 0.5,
    docketFee: 0,
    fuelSurchargePct: 0.0,
    gstPct: 0.18,
    notes: "Priority Express Air delivery based on sales report air billings",
    transitDays: { zone1: "Next Day", zone2: "1-2 Days", zone3: "2-3 Days", zone4: "2-4 Days", zone5: "4-5 Days" },
    rates: {
      zone1: { base: 49.42, addl: 49.42 },  // Base incl GST = ₹58.32
      zone2: { base: 98.85, addl: 49.42 },  // Base incl GST = ₹116.64
      zone3: { base: 148.27, addl: 98.85 }, // Base incl GST = ₹174.96
      zone4: { base: 199.31, addl: 116.64 },// Base incl GST = ₹235.19
      zone5: { base: 230.00, addl: 145.00 } // Base incl GST = ₹271.40
    }
  },
  delhivery_surface: {
    id: "delhivery_surface",
    name: "Delhivery Surface",
    type: "Surface",
    minWeightSlab: 0.5,
    incrementalSlab: 0.5,
    docketFee: 0,
    fuelSurchargePct: 0.0,
    gstPct: 0.18,
    notes: "Verified Delhivery invoices (Kerala ₹37.17, TN ₹81.77, Metros ₹127.44, ROI ₹142.20)",
    transitDays: { zone1: "1-2 Days", zone2: "2-3 Days", zone3: "3-5 Days", zone4: "5-7 Days", zone5: "7-10 Days" },
    rates: {
      zone1: { base: 31.50, addl: 14.00 }, // Base incl GST = ₹37.17
      zone2: { base: 69.30, addl: 26.70 }, // Base incl GST = ₹81.77
      zone3: { base: 108.00, addl: 35.00 },// Base incl GST = ₹127.44
      zone4: { base: 120.50, addl: 42.00 },// Base incl GST = ₹142.20
      zone5: { base: 174.00, addl: 62.00 } // Base incl GST = ₹205.32 (Jharkhand/Manipur)
    }
  },
  trackon_express: {
    id: "trackon_express",
    name: "Trackon Air & Heavy",
    type: "Air / Heavy Cargo",
    minWeightSlab: 1.0,
    incrementalSlab: 1.0,
    docketFee: 0,
    fuelSurchargePct: 0.0,
    gstPct: 0.18,
    notes: "Specialist for Air & heavy cargo (1.0kg min slab)",
    transitDays: { zone1: "1-2 Days", zone2: "2-3 Days", zone3: "2-4 Days", zone4: "4-6 Days", zone5: "5-8 Days" },
    rates: {
      zone1: { base: 186.44, addl: 100.00 }, // Base incl GST = ₹220.00
      zone2: { base: 186.44, addl: 120.00 }, // Base incl GST = ₹220.00
      zone3: { base: 261.02, addl: 150.00 }, // Base incl GST = ₹308.00
      zone4: { base: 285.59, addl: 180.00 }, // Base incl GST = ₹337.00
      zone5: { base: 385.59, addl: 250.00 }  // Base incl GST = ₹455.00
    }
  },
  dtdc_ground: {
    id: "dtdc_ground",
    name: "DTDC Ground",
    type: "Surface",
    minWeightSlab: 1.0, // strict 1 kg minimum slab
    incrementalSlab: 1.0,
    docketFee: 0,
    fuelSurchargePct: 0.0,
    gstPct: 0.18,
    notes: "Local Kerala & South 1kg flat rate (Kerala ₹70.00 flat)",
    transitDays: { zone1: "1-2 Days", zone2: "2-4 Days", zone3: "4-6 Days", zone4: "6-8 Days", zone5: "8-11 Days" },
    rates: {
      zone1: { base: 59.32, addl: 35.00 }, // Base incl GST = ₹70.00
      zone2: { base: 84.75, addl: 45.00 }, // Base incl GST = ₹100.00
      zone3: { base: 127.12, addl: 60.00 },// Base incl GST = ₹150.00
      zone4: { base: 169.49, addl: 80.00 },// Base incl GST = ₹200.00
      zone5: { base: 254.24, addl: 120.00 }
    }
  },
  speed_and_safe: {
    id: "speed_and_safe",
    name: "Speed & Safe (Kerala Local)",
    type: "Regional Express",
    minWeightSlab: 1.0,
    incrementalSlab: 1.0,
    docketFee: 0,
    fuelSurchargePct: 0.0,
    gstPct: 0.18,
    notes: "Kerala Intra-State local courier (₹87 - ₹100 flat)",
    transitDays: { zone1: "Same Day / Next Day", zone2: "2 Days", zone3: "4-5 Days", zone4: "5-7 Days", zone5: "7-10 Days" },
    rates: {
      zone1: { base: 84.75, addl: 42.37 }, // Base incl GST = ₹100.00
      zone2: { base: 110.00, addl: 50.00 },
      zone3: { base: 150.00, addl: 75.00 },
      zone4: { base: 200.00, addl: 100.00 },
      zone5: { base: 300.00, addl: 150.00 }
    }
  },
  india_post: {
    id: "india_post",
    name: "India Post (Speed Post)",
    type: "National Postal",
    minWeightSlab: 0.5,
    incrementalSlab: 0.5,
    docketFee: 0,
    fuelSurchargePct: 0.0,
    gstPct: 0.18,
    transitDays: { zone1: "2-3 Days", zone2: "3-5 Days", zone3: "4-7 Days", zone4: "5-9 Days", zone5: "7-12 Days" },
    rates: {
      zone1: { base: 67.80, addl: 25.42 }, // Base incl GST = ₹80.00
      zone2: { base: 93.22, addl: 38.14 },
      zone3: { base: 135.59, addl: 55.08 },
      zone4: { base: 169.49, addl: 67.80 },
      zone5: { base: 228.81, addl: 93.22 }
    }
  }
};

export interface CarrierCalculationResult {
  carrier: CarrierConfig;
  zoneKey: 'zone1' | 'zone2' | 'zone3' | 'zone4' | 'zone5';
  transitTime: string;
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
  totalPayable: number;
  isCheapest: boolean;
  isFastest: boolean;
  isRecommended: boolean;
}

export function calculateCarrierRate(
  carrier: CarrierConfig,
  zoneId: number,
  billableWeightKg: number
): CarrierCalculationResult {
  const zoneKey = (`zone${zoneId}` as 'zone1' | 'zone2' | 'zone3' | 'zone4' | 'zone5') || 'zone3';
  const zoneRates = carrier.rates[zoneKey] || carrier.rates.zone3;
  const transitTime = carrier.transitDays[zoneKey] || carrier.transitDays.zone3;

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

  const baseFreightRate = zoneRates.base;
  const additionalFreightFee = additionalSlabs * zoneRates.addl;
  const operationalFreightSubtotal = baseFreightRate + additionalFreightFee;

  const docketFee = carrier.docketFee;
  const fuelSurchargeAmount = operationalFreightSubtotal * carrier.fuelSurchargePct;
  const subtotalBeforeTax = operationalFreightSubtotal + docketFee + fuelSurchargeAmount;
  const gstAmount = subtotalBeforeTax * carrier.gstPct;
  const totalPayable = Math.round(subtotalBeforeTax + gstAmount);

  return {
    carrier,
    zoneKey,
    transitTime,
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
    totalPayable,
    isCheapest: false,
    isFastest: false,
    isRecommended: false
  };
}

export function evaluateAllCarriers(
  zoneId: number,
  billableWeightKg: number
): CarrierCalculationResult[] {
  const results = Object.values(CARRIERS_CONFIG).map(carrier =>
    calculateCarrierRate(carrier, zoneId, billableWeightKg)
  );

  if (results.length === 0) return [];

  let cheapestIndex = 0;
  let minCost = results[0].totalPayable;

  let fastestIndex = 0;
  let minDays = 999;

  results.forEach((res, idx) => {
    if (res.totalPayable < minCost) {
      minCost = res.totalPayable;
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

  const blueDartIndex = results.findIndex(r => r.carrier.id === 'bluedart_surface');
  if (blueDartIndex !== -1) {
    results[blueDartIndex].isRecommended = true;
  } else {
    results[cheapestIndex].isRecommended = true;
  }

  return results;
}
