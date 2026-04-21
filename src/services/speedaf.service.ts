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

// Define Speedaf zones based on the rate card
const SPEEDAF_ZONES: SpeedafZone[] = [
  {
    zone: 'Zone 1',
    cities: ['Abeokuta'],
    baseRate: 3500,
    additionalWeightRate: 100,
    weightLimit: 10,
    dimensionsLimit: '30×30×30cm',
    deliveryDays: '1-2 business days',
  },
  {
    zone: 'Zone 2',
    cities: ['Lagos', 'Akure', 'Ado-Ekiti', 'Ibadan', 'Ogbomosho', 'Oshogbo', 'Ota', 'Ilorin'],
    baseRate: 2000,
    additionalWeightRate: 100,
    weightLimit: 10,
    dimensionsLimit: '30×30×30cm',
    deliveryDays: '1-2 business days',
  },
  {
    zone: 'Zone 3',
    cities: ['Aba', 'Asaba', 'Enugu', 'Onitsha', 'Owerri', 'Umuahia', 'Abuja', 'Benin', 'Calabar', 'Port Harcourt', 'Uyo', 'Warri', 'Yenagoa'],
    baseRate: 3000,
    additionalWeightRate: 100,
    weightLimit: 10,
    dimensionsLimit: '30×30×30cm',
    deliveryDays: '2-3 business days',
  },
  {
    zone: 'Zone 4',
    cities: ['Lafia', 'Lokoja', 'Makurdi', 'Minna', 'Bauchi', 'Jalingo', 'Jos', 'Gombe', 'Maiduguri', 'Damaturu', 'Yola', 'Kaduna', 'Katsina', 'Dutse', 'Birnin Kebbi', 'Sokoto', 'Kano'],
    baseRate: 4000,
    additionalWeightRate: 100,
    weightLimit: 10,
    dimensionsLimit: '30×30×30cm',
    deliveryDays: '3-4 business days',
  },
];

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

  // Ensure weight is within limits (max 10kg)
  const normalizedWeight = Math.min(weightInKg, 10);

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

  // Calculate base rate and additional weight cost
  const baseWeight = 0.5; // Base weight is 0.5kg
  let additionalWeightCost = 0;

  if (normalizedWeight > baseWeight) {
    const additionalWeight = Math.ceil(normalizedWeight - baseWeight); // Round up to next kg
    additionalWeightCost = additionalWeight * zone.additionalWeightRate;
  }

  const totalDeliveryFee = zone.baseRate + additionalWeightCost;

  return {
    baseRate: zone.baseRate,
    additionalWeightCost,
    totalDeliveryFee,
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