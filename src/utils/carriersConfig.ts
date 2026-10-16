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
  fuelSurchargePct: number; // 0.10 = 10%
  gstPct: number; // 0.18 = 18%
  badge?: string;
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

export const CARRIERS_CONFIG: Record<string, CarrierConfig> = {
  delhivery_surface: {
    id: "delhivery_surface",
    name: "Delhivery Surface",
    type: "Surface",
    minWeightSlab: 0.5,
    incrementalSlab: 0.5,
    docketFee: 35,
    fuelSurchargePct: 0.10,
    gstPct: 0.18,
    transitDays: { zone1: "1-2 Days", zone2: "2-3 Days", zone3: "3-5 Days", zone4: "5-7 Days", zone5: "7-10 Days" },
    rates: {
      zone1: { base: 110, addl: 35 },
      zone2: { base: 140, addl: 55 },
      zone3: { base: 190, addl: 75 },
      zone4: { base: 240, addl: 95 },
      zone5: { base: 350, addl: 140 }
    }
  },
  bluedart_air: {
    id: "bluedart_air",
    name: "Blue Dart Express",
    type: "Air / Priority",
    minWeightSlab: 0.5,
    incrementalSlab: 0.5,
    docketFee: 50,
    fuelSurchargePct: 0.18,
    gstPct: 0.18,
    transitDays: { zone1: "Next Day", zone2: "1-2 Days", zone3: "2-3 Days", zone4: "3-4 Days", zone5: "4-6 Days" },
    rates: {
      zone1: { base: 180, addl: 60 },
      zone2: { base: 240, addl: 90 },
      zone3: { base: 310, addl: 130 },
      zone4: { base: 380, addl: 160 },
      zone5: { base: 490, addl: 210 }
    }
  },
  dtdc_ground: {
    id: "dtdc_ground",
    name: "DTDC Standard",
    type: "Surface",
    minWeightSlab: 1.0, // strict 1 kg minimum slab
    incrementalSlab: 0.5,
    docketFee: 35,
    fuelSurchargePct: 0.12,
    gstPct: 0.18,
    transitDays: { zone1: "1-2 Days", zone2: "2-4 Days", zone3: "4-6 Days", zone4: "6-8 Days", zone5: "8-11 Days" },
    rates: {
      zone1: { base: 120, addl: 40 },
      zone2: { base: 150, addl: 65 },
      zone3: { base: 210, addl: 85 },
      zone4: { base: 250, addl: 105 },
      zone5: { base: 370, addl: 150 }
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
      zone1: { base: 80, addl: 30 },
      zone2: { base: 110, addl: 45 },
      zone3: { base: 160, addl: 65 },
      zone4: { base: 200, addl: 80 },
      zone5: { base: 270, addl: 110 }
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
  let chargedWeight = Math.max(billableWeightKg, minSlab);

  if (chargedWeight > minSlab) {
    const diff = chargedWeight - minSlab;
    const extraSlabs = Math.ceil(diff / 0.5);
    chargedWeight = minSlab + extraSlabs * 0.5;
  }

  const additionalSlabs = Math.max(0, Math.round((chargedWeight - minSlab) / 0.5));
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

  const delhiveryIndex = results.findIndex(r => r.carrier.id === 'delhivery_surface');
  if (delhiveryIndex !== -1) {
    results[delhiveryIndex].isRecommended = true;
  } else {
    results[cheapestIndex].isRecommended = true;
  }

  return results;
}
