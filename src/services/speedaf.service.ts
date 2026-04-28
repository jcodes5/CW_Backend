import { getDeliveryEstimate } from '../utils/helpers';

export interface SpeedafZone {
  zone: string;
  cities: string[];
  baseRate: number;
  additionalWeightRate: number;
  weightLimit: number;
  dimensionsLimit: string;
  deliveryDays: string;
}

export interface SpeedafPricing {
  baseRate: number;
  additionalWeightCost: number;
  totalDeliveryFee: number;
  estimatedDelivery: string;
  zone: string;
}

// Tiered rate lookup table: [weightKg, zone1, zone2, zone3, zone4] in NGN VAT inclusive
const SPEEDAF_RATE_TABLE = [
  [0.5, 3118, 4547, 6085, 7439],
  [1, 3741, 4870, 6418, 7772],
  [1.5, 4053, 5515, 6762, 8116],
  [2, 4365, 5837, 7439, 8450],
  [2.5, 4676, 6171, 7772, 9127],
  [3, 5300, 6493, 8116, 9460],
  [3.5, 5612, 7138, 8450, 9804],
  [4, 5934, 7461, 9127, 10137],
  [4.5, 6246, 7794, 9460, 10815],
  [5, 6869, 8116, 9804, 11159],
  [5.5, 7493, 9084, 11685, 13147],
  [6, 7805, 9406, 12051, 13513],
  [6.5, 8116, 9740, 12416, 13878],
  [7, 8740, 10385, 13147, 14244],
  [7.5, 9052, 10707, 13513, 14964],
  [8, 9363, 11030, 13878, 15330],
  [8.5, 9987, 11685, 14244, 15695],
  [9, 10299, 12008, 14964, 16426],
  [9.5, 10610, 12330, 15330, 16792],
  [10, 11234, 12653, 15695, 17157],
];

// Define Speedaf zones based on the rate card
const SPEEDAF_ZONES: SpeedafZone[] = [
  {
    zone: 'Zone 1',
    cities: ['Abeokuta'],
    baseRate: 3118,
    additionalWeightRate: 1075,
    weightLimit: 10,
    dimensionsLimit: '30×30×30cm',
    deliveryDays: '1-2 business days',
  },
  {
    zone: 'Zone 2',
    cities: ['Lagos', 'Akure', 'Ado-Ekiti', 'Ibadan', 'Ogbomosho', 'Oshogbo', 'Ota', 'Ilorin'],
    baseRate: 4547,
    additionalWeightRate: 1290,
    weightLimit: 10,
    dimensionsLimit: '30×30×30cm',
    deliveryDays: '1-2 business days',
  },
  {
    zone: 'Zone 3',
    cities: ['Aba', 'Asaba', 'Enugu', 'Onitsha', 'Owerri', 'Umuahia', 'Abuja', 'Benin', 'Benin City', 'Calabar', 'Port Harcourt', 'Port-Harcourt', 'Uyo', 'Warri', 'Yenagoa', 'Yenegoa'],
    baseRate: 6085,
    additionalWeightRate: 1613,
    weightLimit: 10,
    dimensionsLimit: '30×30×30cm',
    deliveryDays: '2-3 business days',
  },
  {
    zone: 'Zone 4',
    cities: ['Lafia', 'Lokoja', 'Makurdi', 'Minna', 'Bauchi', 'Jalingo', 'Jos', 'Gombe', 'Maiduguri', 'Damaturu', 'Yola', 'Kaduna', 'Katsina', 'Dutse', 'Birnin Kebbi', 'Sokoto', 'Kano'],
    baseRate: 7439,
    additionalWeightRate: 1720,
    weightLimit: 10,
    dimensionsLimit: '30×30×30cm',
    deliveryDays: '3-4 business days',
  },
];

/**
 * Round weight UP to the nearest 0.5 kg increment
 * Minimum billed weight is 0.5 kg
 */
function roundWeightToBillingIncrement(weightKg: number): number {
  const increment = 0.5;
  const rounded = Math.ceil(weightKg / increment) * increment;
  return Math.max(rounded, 0.5);
}

/**
 * Look up exact rate from tier table based on weight and zone index
 * Zone index: 0 = Zone 1, 1 = Zone 2, 2 = Zone 3, 3 = Zone 4
 */
function lookupRateFromTable(billedWeightKg: number, zoneIndex: number): number {
  const row = SPEEDAF_RATE_TABLE.find(r => r[0] === billedWeightKg);
  if (row) {
    return row[zoneIndex + 1] as number;
  }
  // Fallback: use the highest tier if weight exceeds table
  const lastRow = SPEEDAF_RATE_TABLE[SPEEDAF_RATE_TABLE.length - 1];
  return lastRow[zoneIndex + 1] as number;
}

/**
 * Get zone index (0-3) for a given zone object
 */
function getZoneIndex(zone: SpeedafZone): number {
  const zoneNumber = parseInt(zone.zone.split(' ')[1]);
  return zoneNumber - 1;
}

/**
 * Determines the zone for a given city
 */
export function getSpeedafZone(city: string): SpeedafZone | null {
  for (const zone of SPEEDAF_ZONES) {
    if (zone.cities.some(zc => zc.toLowerCase() === city.toLowerCase())) {
      return zone;
    }
  }
  // If city is not found in any specific zone, return the default zone (Zone 4)
  return SPEEDAF_ZONES[SPEEDAF_ZONES.length - 1];
}

/**
 * Calculates delivery fee based on Speedaf pricing
 * Supports splitting orders over 10 kg into multiple waybills
 */
export function calculateSpeedafDeliveryFee(weightInKg: number, city: string, subtotal: number): SpeedafPricing {
  // Free delivery for orders above threshold
  if (subtotal >= 25000) {
    const zone = getSpeedafZone(city);
    return {
      baseRate: 0,
      additionalWeightCost: 0,
      totalDeliveryFee: 0,
      estimatedDelivery: getDeliveryEstimate(city),
      zone: zone ? zone.zone : 'Zone 4',
    };
  }

  const zone = getSpeedafZone(city);
  if (!zone) {
    // Fallback to Zone 4 if city not found
    const fallbackZone = SPEEDAF_ZONES[SPEEDAF_ZONES.length - 1];
    return {
      baseRate: fallbackZone.baseRate,
      additionalWeightCost: 0,
      totalDeliveryFee: fallbackZone.baseRate,
      estimatedDelivery: getDeliveryEstimate(city),
      zone: fallbackZone.zone,
    };
  }

  // Calculate total fee by splitting into waybills if needed (max 10 kg per waybill)
  let totalFee = 0;
  let remainingWeight = weightInKg;
  const zoneIndex = getZoneIndex(zone);

  while (remainingWeight > 0) {
    const waybillWeight = Math.min(remainingWeight, 10);
    const billedWeight = roundWeightToBillingIncrement(waybillWeight);
    const rate = lookupRateFromTable(billedWeight, zoneIndex);
    totalFee += rate;
    remainingWeight -= waybillWeight;
  }

  return {
    baseRate: zone.baseRate,
    additionalWeightCost: totalFee - zone.baseRate,
    totalDeliveryFee: totalFee,
    estimatedDelivery: zone.deliveryDays,
    zone: zone.zone,
  };
}

/**
 * Gets delivery information for a given city
 */
export function getSpeedafDeliveryInfo(city: string, weightInKg: number, subtotal: number) {
  const pricing = calculateSpeedafDeliveryFee(weightInKg, city, subtotal);
  
  return {
    fee: pricing.totalDeliveryFee,
    estimatedDelivery: pricing.estimatedDelivery,
    zone: pricing.zone,
    isFree: pricing.totalDeliveryFee === 0,
    label: pricing.totalDeliveryFee === 0 ? 'Free' : 'Speedaf Express',
  };
}