import { Zone, ScoringWeights, DEFAULT_WEIGHTS } from "../types";

/**
 * Normalize a value to 0-1 range given min/max bounds.
 */
function normalize(value: number, min: number, max: number): number {
  if (max === min) return 0.5;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

/**
 * Compute the Transit Need Score (0-100) for a zone.
 * Higher = more underserved / higher need for transit investment.
 *
 * Factors:
 * - Population density (higher = more need)
 * - Job density (higher = more need)
 * - Traffic level (higher = more congested = more need)
 * - Distance to transit (farther = more underserved)
 * - Equity factor (lower income = higher priority)
 */
export function computeNeedScore(
  zone: Omit<Zone, "needScore">,
  allZones: Omit<Zone, "needScore">[],
  weights: ScoringWeights = DEFAULT_WEIGHTS
): number {
  const popDensities = allZones.map((z) => z.populationDensity);
  const jobDensities = allZones.map((z) => z.jobDensity);
  const trafficLevels = allZones.map((z) => z.trafficLevel);
  const distances = allZones.map((z) => z.distanceToTransit);
  const incomes = allZones.map((z) => z.medianIncome);

  const popScore = normalize(
    zone.populationDensity,
    Math.min(...popDensities),
    Math.max(...popDensities)
  );
  const jobScore = normalize(
    zone.jobDensity,
    Math.min(...jobDensities),
    Math.max(...jobDensities)
  );
  const trafficScore = normalize(
    zone.trafficLevel,
    Math.min(...trafficLevels),
    Math.max(...trafficLevels)
  );
  const distanceScore = normalize(
    zone.distanceToTransit,
    Math.min(...distances),
    Math.max(...distances)
  );
  // Equity: lower income = higher score
  const equityScore =
    1 -
    normalize(
      zone.medianIncome,
      Math.min(...incomes),
      Math.max(...incomes)
    );

  const raw =
    weights.populationDensity * popScore +
    weights.jobDensity * jobScore +
    weights.trafficLevel * trafficScore +
    weights.distanceToTransit * distanceScore +
    weights.equityFactor * equityScore;

  // Growth bonus: +10% if flagged for projected growth
  const growthBonus = zone.growthFlag ? 0.1 : 0;

  return Math.round(Math.min(100, (raw + growthBonus) * 100));
}

/**
 * Generate a plain-language explanation for why a zone has its score.
 */
export function generateExplanation(zone: Zone, allZones: Zone[]): string {
  const parts: string[] = [];
  const sortedByScore = [...allZones].sort((a, b) => b.needScore - a.needScore);
  const rank = sortedByScore.findIndex((z) => z.id === zone.id) + 1;
  const percentile = Math.round((1 - rank / allZones.length) * 100);

  parts.push(
    `**${zone.name}** ranks #${rank} out of ${allZones.length} zones (top ${100 - percentile}%) with a Transit Need Score of **${zone.needScore}/100**.`
  );

  if (zone.populationDensity > 8000) {
    parts.push(
      `It has very high population density (${zone.populationDensity.toLocaleString()} people/km²).`
    );
  }

  if (zone.distanceToTransit > 1.0) {
    parts.push(
      `It is **${zone.distanceToTransit.toFixed(1)} km** from the nearest rapid transit station, indicating limited access.`
    );
  } else {
    parts.push(
      `It is ${zone.distanceToTransit.toFixed(1)} km from the nearest rapid transit station.`
    );
  }

  if (zone.trafficLevel > 60) {
    parts.push(
      `Traffic congestion is high (${zone.trafficLevel}/100), suggesting many car-dependent commuters.`
    );
  }

  if (zone.medianIncome < 50000) {
    parts.push(
      `Median household income is $${zone.medianIncome.toLocaleString()}, making transit equity a priority here.`
    );
  }

  if (zone.growthFlag) {
    parts.push(
      `This area is flagged for **projected population growth**, increasing future demand.`
    );
  }

  if (zone.existingRidership > 10000) {
    parts.push(
      `Existing TTC routes through this zone carry ~${zone.existingRidership.toLocaleString()} weekday riders, indicating already high demand.`
    );
  }

  return parts.join(" ");
}

/**
 * Get the color for a Need Score on a gradient from green (low) to red (high).
 */
export function getScoreColor(score: number): string {
  // Green (low need) -> Yellow (medium) -> Orange -> Red (high need)
  if (score < 25) return "#22c55e"; // green
  if (score < 50) return "#eab308"; // yellow
  if (score < 75) return "#f97316"; // orange
  return "#ef4444"; // red
}

/**
 * Get score label text.
 */
export function getScoreLabel(score: number): string {
  if (score < 25) return "Low Need";
  if (score < 50) return "Moderate Need";
  if (score < 75) return "High Need";
  return "Critical Need";
}
