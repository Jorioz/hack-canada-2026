import { ScenarioMode, ScenarioResult, Zone, TransitLine } from "../types";
import {
    lineString,
    point,
    booleanIntersects,
    buffer,
    booleanWithin,
} from "@turf/turf";

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
const CAPTURE_RATES: Record<
    ScenarioMode,
    { existing: number; newRiders: number }
> = {
    subway: { existing: 0.35, newRiders: 0.08 },
    surface_lrt: { existing: 0.25, newRiders: 0.05 },
    enhanced_bus: { existing: 0.15, newRiders: 0.03 },
};

/**
 * Calculate the haversine distance between two [lat, lng] points in km.
 */
export function haversineDistance(
    point1: [number, number],
    point2: [number, number],
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
    bufferKm: number = 0.8,
): Zone[] {
    return zones.filter((zone) => {
        return path.some(
            (point) => haversineDistance(zone.center, point) <= bufferKm,
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
    existingLines: TransitLine[],
): number {
    if (path.length < 2) return 1.0;

    try {
        // Turf expects [lng, lat]
        const routeGeom = lineString(path.map((p) => [p[1], p[0]]));
        // Provide a 200m buffer around the new route to check for connections
        const routeBuffer = buffer(routeGeom, 0.2, { units: "kilometers" });

        if (!routeBuffer) return 1.0;

        let connections = 0;

        existingLines.forEach((line) => {
            if (line.coordinates.length < 2) return;
            const existingLineGeom = lineString(
                line.coordinates.map((p) => [p[1], p[0]]),
            );

            // If lines intersect or are within 200m of each other
            if (
                booleanIntersects(routeGeom, existingLineGeom) ||
                booleanIntersects(routeBuffer, existingLineGeom)
            ) {
                // Give higher weight to Subway connections vs bus connections
                if (line.mode === "subway") connections += 1.5;
                else if (line.mode === "lrt") connections += 1.0;
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
    existingLines: TransitLine[] = [],
): ScenarioResult {
    const lineLengthKm = calculateLineLength(path);
    const numStations = Math.max(
        2,
        Math.round(lineLengthKm / (stationSpacingMeters / 1000)) + 1,
    );

    // Network Effect Multiplier
    const networkMultiplier = calculateNetworkMultiplier(path, existingLines);

    // Cost
    const benchmarks = COST_BENCHMARKS[mode];
    const costLow =
        lineLengthKm * benchmarks.perKmLow +
        numStations * benchmarks.perStationLow;
    const costHigh =
        lineLengthKm * benchmarks.perKmHigh +
        numStations * benchmarks.perStationHigh;

    // Zones served
    const servedZones = findZonesNearLine(path, zones, 0.8);
    const populationServed = servedZones.reduce(
        (sum, z) => sum + z.populationDensity * 2.5, // approx area of zone ~2.5 sq km
        0,
    );
    const jobsServed = servedZones.reduce(
        (sum, z) => sum + z.jobDensity * 2.5,
        0,
    );

    // Ridership (Boosted by Network Effects)
    const rates = CAPTURE_RATES[mode];
    const existingTransitRiders = servedZones.reduce(
        (sum, z) => sum + z.existingRidership,
        0,
    );

    const capturedExisting = Math.round(existingTransitRiders * rates.existing);
    const newRiders = Math.round(populationServed * rates.newRiders);

    const baseRiders = capturedExisting + newRiders;

    // Apply network multiplier
    const dailyRidersLow = Math.round(baseRiders * networkMultiplier * 0.8);
    const dailyRidersHigh = Math.round(baseRiders * networkMultiplier * 1.2);

    // Car trips removed (assume 60% of new riders would have driven)
    const newRidersWithNetwork = Math.round(newRiders * networkMultiplier);
    const carTripsRemovedLow = Math.round(newRidersWithNetwork * 0.5);
    const carTripsRemovedHigh = Math.round(newRidersWithNetwork * 0.7);

    // Revenue
    const avgDailyRiders = (dailyRidersLow + dailyRidersHigh) / 2;
    const annualFareRevenue = Math.round(avgDailyRiders * AVG_FARE * 365);

    // Timeline
    const timeline = TIMELINE_BENCHMARKS[mode];
    const baseYears =
        timeline.overheadYears + lineLengthKm * timeline.yearsPerKm;
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

/**
 * Minimum station spacing by mode (in km).
 * Based on real-world transit standards.
 */
const MIN_STATION_SPACING_KM: Record<ScenarioMode, number> = {
    subway: 0.8, // Subways: minimum 800m between stations
    surface_lrt: 0.4, // LRT: minimum 400m
    enhanced_bus: 0.25, // Enhanced bus: minimum 250m
};

/**
 * Calculate the angle change between two segments in degrees.
 */
function calculateAngleChange(
    p1: [number, number],
    p2: [number, number],
    p3: [number, number],
): number {
    const angle1 = Math.atan2(p2[0] - p1[0], p2[1] - p1[1]);
    const angle2 = Math.atan2(p3[0] - p2[0], p3[1] - p2[1]);
    let diff = Math.abs(((angle2 - angle1) * 180) / Math.PI);
    if (diff > 180) diff = 360 - diff;
    return diff;
}

/**
 * Find potential intersection points along a path based on direction changes.
 * Returns indices of path points that represent significant turns.
 */
function findPotentialIntersections(
    path: [number, number][],
    minAngleChange: number = 25,
): number[] {
    const intersections: number[] = [];

    for (let i = 1; i < path.length - 1; i++) {
        const angle = calculateAngleChange(path[i - 1], path[i], path[i + 1]);
        if (angle >= minAngleChange) {
            intersections.push(i);
        }
    }

    return intersections;
}

/**
 * Calculate station positions along a path using intelligent placement.
 * Prefers intersection points and respects minimum spacing by mode.
 * Returns array of [lat, lng] positions for each station.
 */
export function calculateStationPositions(
    path: [number, number][],
    stationSpacingMeters: number,
    mode: ScenarioMode = "subway",
): [number, number][] {
    if (path.length < 2) return path.length === 1 ? [path[0]] : [];

    const stations: [number, number][] = [];
    const targetSpacingKm = stationSpacingMeters / 1000;
    const minSpacingKm = MIN_STATION_SPACING_KM[mode];
    const effectiveSpacing = Math.max(targetSpacingKm, minSpacingKm);

    // Calculate total line length
    const totalLength = calculateLineLength(path);

    // If line is very short, just place terminal stations
    if (totalLength < effectiveSpacing * 1.5) {
        return [path[0], path[path.length - 1]];
    }

    // Find potential intersection points
    const intersectionIndices = findPotentialIntersections(path, 20);

    // Calculate cumulative distances along the path
    const cumulativeDistances: number[] = [0];
    for (let i = 1; i < path.length; i++) {
        cumulativeDistances.push(
            cumulativeDistances[i - 1] +
                haversineDistance(path[i - 1], path[i]),
        );
    }

    // Always add the first station (terminal)
    stations.push(path[0]);
    let lastStationDistance = 0;

    // Score each potential intersection by how well it fits the spacing
    const candidateStations: {
        index: number;
        distance: number;
        score: number;
    }[] = [];

    for (const idx of intersectionIndices) {
        const dist = cumulativeDistances[idx];
        const distFromLast = dist - lastStationDistance;

        // Skip if too close to start or end
        if (dist < minSpacingKm || totalLength - dist < minSpacingKm * 0.5) {
            continue;
        }

        // Score based on how close to ideal spacing this point is
        const idealPlacement =
            Math.round(dist / effectiveSpacing) * effectiveSpacing;
        const deviationFromIdeal = Math.abs(dist - idealPlacement);
        const score = 1 - deviationFromIdeal / effectiveSpacing;

        candidateStations.push({ index: idx, distance: dist, score });
    }

    // Greedily select stations respecting minimum spacing
    for (const candidate of candidateStations) {
        const distFromLastStation = candidate.distance - lastStationDistance;
        const distToEnd = totalLength - candidate.distance;

        // Must be at least minimum spacing from last station
        if (distFromLastStation >= minSpacingKm) {
            // Don't place if it would leave the end too close without a proper terminal gap
            if (distToEnd >= minSpacingKm * 0.5) {
                stations.push(path[candidate.index]);
                lastStationDistance = candidate.distance;
            }
        }
    }

    // If we have large gaps, fill them with interpolated stations
    const stationsWithInterpolation: [number, number][] = [stations[0]];
    let currentDistanceAlongPath = 0;

    for (let s = 1; s < stations.length; s++) {
        const prevStation = stations[s - 1];
        const currStation = stations[s];

        // Find distances along path for these stations
        let prevDist = 0;
        let currDist = 0;

        for (let i = 0; i < path.length; i++) {
            if (
                path[i][0] === prevStation[0] &&
                path[i][1] === prevStation[1]
            ) {
                prevDist = cumulativeDistances[i];
            }
            if (
                path[i][0] === currStation[0] &&
                path[i][1] === currStation[1]
            ) {
                currDist = cumulativeDistances[i];
            }
        }

        const gap = currDist - prevDist;

        // If gap is too large, add interpolated stations
        if (gap > effectiveSpacing * 1.8) {
            const numToAdd = Math.floor(gap / effectiveSpacing) - 1;
            const actualSpacing = gap / (numToAdd + 1);

            for (let n = 1; n <= numToAdd; n++) {
                const targetDist = prevDist + actualSpacing * n;

                // Find the path segment containing this distance
                for (let i = 1; i < path.length; i++) {
                    if (cumulativeDistances[i] >= targetDist) {
                        const segmentStart = cumulativeDistances[i - 1];
                        const segmentEnd = cumulativeDistances[i];
                        const ratio =
                            (targetDist - segmentStart) /
                            (segmentEnd - segmentStart);

                        const lat =
                            path[i - 1][0] +
                            ratio * (path[i][0] - path[i - 1][0]);
                        const lng =
                            path[i - 1][1] +
                            ratio * (path[i][1] - path[i - 1][1]);

                        stationsWithInterpolation.push([lat, lng]);
                        break;
                    }
                }
            }
        }

        stationsWithInterpolation.push(currStation);
    }

    // Always add the terminal station at the end
    const lastStation =
        stationsWithInterpolation[stationsWithInterpolation.length - 1];
    const endPoint = path[path.length - 1];
    const distToEnd = haversineDistance(lastStation, endPoint);

    // Add end station if it's reasonably far from last station
    if (distToEnd >= minSpacingKm * 0.5) {
        stationsWithInterpolation.push(endPoint);
    } else if (
        lastStation[0] !== endPoint[0] ||
        lastStation[1] !== endPoint[1]
    ) {
        // Replace last station with end point if too close
        stationsWithInterpolation[stationsWithInterpolation.length - 1] =
            endPoint;
    }

    return stationsWithInterpolation;
}
