import { ScenarioMode, ScenarioResult, Zone, TransitLine } from "../types";
import { lineString, point, booleanIntersects, buffer, booleanWithin } from "@turf/turf";

/**
 * Cost benchmarks per mode (in $ millions).
 * Based on real Toronto project data (simplified for hackathon).
 */
const COST_BENCHMARKS: Record<
  ScenarioMode,
  {
    perKmLow: number;
    perKmHigh: number;
    perStationLow: number;
    perStationHigh: number;
  }
> = {
  subway: {
    perKmLow: 300, // $M per km (tunnel)
    perKmHigh: 500,
    perStationLow: 150,
    perStationHigh: 250,
  },
  surface_lrt: {
    perKmLow: 80,
    perKmHigh: 150,
    perStationLow: 15,
    perStationHigh: 30,
  },
  enhanced_bus: {
    perKmLow: 5,
    perKmHigh: 15,
    perStationLow: 0.5,
    perStationHigh: 2,
  },
};

/**
 * Timeline benchmarks (years).
 */
const TIMELINE_BENCHMARKS: Record<
  ScenarioMode,
  { overheadYears: number; yearsPerKm: number }
> = {
  subway: { overheadYears: 3, yearsPerKm: 0.8 },
  surface_lrt: { overheadYears: 2, yearsPerKm: 0.4 },
  enhanced_bus: { overheadYears: 0.5, yearsPerKm: 0.05 },
};

/**
 * Average TTC fare per boarding (from TTC revenue data).
 */
const AVG_FARE = 3.35; // CAD

/**
 * Ridership capture rates.
 */
const CAPTURE_RATES: Record<ScenarioMode, { existing: number; newRiders: number }> = {
  subway: { existing: 0.35, newRiders: 0.08 },
  surface_lrt: { existing: 0.25, newRiders: 0.05 },
  enhanced_bus: { existing: 0.15, newRiders: 0.03 },
};

/**
 * Calculate the haversine distance between two [lat, lng] points in km.
 */
export function haversineDistance(
  point1: [number, number],
  point2: [number, number]
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((point2[0] - point1[0]) * Math.PI) / 180;
  const dLng = ((point2[1] - point1[1]) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((point1[0] * Math.PI) / 180) *
      Math.cos((point2[0] * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculate total polyline length in km.
 */
export function calculateLineLength(path: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += haversineDistance(path[i - 1], path[i]);
  }
  return total;
}

/**
 * Find zones within buffer distance (km) of any point on the line.
 */
export function findZonesNearLine(
  path: [number, number][],
  zones: Zone[],
  bufferKm: number = 0.8
): Zone[] {
  return zones.filter((zone) => {
    return path.some(
      (point) => haversineDistance(zone.center, point) <= bufferKm
    );
  });
}

/**
 * Calculate network connectivity multiplier.
 * If the new line intersects or comes very close to existing lines,
 * it creates a network effect that boosts ridership.
 */
export function calculateNetworkMultiplier(
  path: [number, number][],
  existingLines: TransitLine[]
): number {
  if (path.length < 2) return 1.0;

  try {
    // Turf expects [lng, lat]
    const routeGeom = lineString(path.map(p => [p[1], p[0]]));
    // Provide a 200m buffer around the new route to check for connections
    const routeBuffer = buffer(routeGeom, 0.2, { units: 'kilometers' });

    if (!routeBuffer) return 1.0;

    let connections = 0;

    existingLines.forEach(line => {
      if (line.coordinates.length < 2) return;
      const existingLineGeom = lineString(line.coordinates.map(p => [p[1], p[0]]));
      
      // If lines intersect or are within 200m of each other
      if (booleanIntersects(routeGeom, existingLineGeom) || 
          booleanIntersects(routeBuffer, existingLineGeom)) {
        
        // Give higher weight to Subway connections vs bus connections
        if (line.mode === 'subway') connections += 1.5;
        else if (line.mode === 'lrt') connections += 1.0;
        else connections += 0.5;
      }
    });

    // Max 30% boost for being highly connected
    const multiplier = 1.0 + Math.min(0.3, connections * 0.05);
    return multiplier;
  } catch (err) {
    console.warn("Turf intersection check failed", err);
    return 1.0;
  }
}

/**
 * Calculate full scenario results from a drawn line.
 */
export function calculateScenario(
  path: [number, number][],
  mode: ScenarioMode,
  stationSpacingMeters: number,
  zones: Zone[],
  existingLines: TransitLine[] = []
): ScenarioResult {
  const lineLengthKm = calculateLineLength(path);
  const numStations = Math.max(
    2,
    Math.round(lineLengthKm / (stationSpacingMeters / 1000)) + 1
  );

  // Network Effect Multiplier
  const networkMultiplier = calculateNetworkMultiplier(path, existingLines);

  // Cost
  const benchmarks = COST_BENCHMARKS[mode];
  const costLow =
    lineLengthKm * benchmarks.perKmLow + numStations * benchmarks.perStationLow;
  const costHigh =
    lineLengthKm * benchmarks.perKmHigh +
    numStations * benchmarks.perStationHigh;

  // Zones served
  const servedZones = findZonesNearLine(path, zones, 0.8);
  const populationServed = servedZones.reduce(
    (sum, z) => sum + z.populationDensity * 2.5, // approx area of zone ~2.5 sq km
    0
  );
  const jobsServed = servedZones.reduce(
    (sum, z) => sum + z.jobDensity * 2.5,
    0
  );

  // Ridership (Boosted by Network Effects)
  const rates = CAPTURE_RATES[mode];
  const existingTransitRiders = servedZones.reduce(
    (sum, z) => sum + z.existingRidership,
    0
  );
  
  const capturedExisting = Math.round(existingTransitRiders * rates.existing);
  const newRiders = Math.round(populationServed * rates.newRiders);
  
  const baseRiders = capturedExisting + newRiders;
  
  // Apply network multiplier
  const dailyRidersLow = Math.round((baseRiders * networkMultiplier) * 0.8);
  const dailyRidersHigh = Math.round((baseRiders * networkMultiplier) * 1.2);

  // Car trips removed (assume 60% of new riders would have driven)
  const newRidersWithNetwork = Math.round(newRiders * networkMultiplier);
  const carTripsRemovedLow = Math.round(newRidersWithNetwork * 0.5);
  const carTripsRemovedHigh = Math.round(newRidersWithNetwork * 0.7);

  // Revenue
  const avgDailyRiders = (dailyRidersLow + dailyRidersHigh) / 2;
  const annualFareRevenue = Math.round(avgDailyRiders * AVG_FARE * 365);

  // Timeline
  const timeline = TIMELINE_BENCHMARKS[mode];
  const baseYears = timeline.overheadYears + lineLengthKm * timeline.yearsPerKm;
  const timelineYearsLow = Math.round(baseYears * 10) / 10;
  const timelineYearsHigh = Math.round(baseYears * 1.5 * 10) / 10;

  return {
    lineLengthKm: Math.round(lineLengthKm * 10) / 10,
    numStations,
    costLow: Math.round(costLow),
    costHigh: Math.round(costHigh),
    dailyRidersLow,
    dailyRidersHigh,
    carTripsRemovedLow,
    carTripsRemovedHigh,
    annualFareRevenue,
    timelineYearsLow,
    timelineYearsHigh,
    populationServed: Math.round(populationServed),
    jobsServed: Math.round(jobsServed),
  };
}
