// Core types for the Toronto Transit Planner

export interface Zone {
  id: string;
  name: string;
  // GeoJSON polygon coordinates [lng, lat][]
  coordinates: [number, number][];
  // Center point for labels/markers
  center: [number, number];

  // Raw metrics
  populationDensity: number; // people per sq km
  jobDensity: number; // jobs per sq km
  trafficLevel: number; // 0-100 scale
  distanceToTransit: number; // km to nearest rapid transit stop
  medianIncome: number; // CAD
  growthFlag: boolean; // projected high growth
  existingRidership: number; // daily riders on routes through zone
  landUse: "residential" | "commercial" | "mixed" | "industrial";

  // Computed
  needScore: number; // 0-100, higher = more underserved
}

export interface TransitLine {
  id: string;
  name: string;
  description?: string; // Additional context/history about the line
  mode: "subway" | "lrt" | "bus";
  color: string;
  // Polyline coordinates [lat, lng][]
  coordinates: [number, number][];
  stations: TransitStation[];
  dailyRidership: number;
  
  // New detailed profile metrics
  avgSpeed?: number; // km/h
  headway?: number; // peak frequency in minutes
  reliability?: number; // on-time percentage
}

export interface TransitStation {
  name: string;
  position: [number, number]; // [lat, lng]
}

export type ScenarioMode = "subway" | "surface_lrt" | "enhanced_bus";

export interface Scenario {
  id: string;
  name: string;
  mode: ScenarioMode;
  // User-drawn path [lat, lng][]
  path: [number, number][];
  stationSpacing: number; // meters
  result: ScenarioResult | null;
  createdAt: Date;
  visible: boolean;
}

// Shared mode colors — highly distinct
export const SCENARIO_MODE_COLORS: Record<ScenarioMode, string> = {
  subway: "#c6da14",       // TTC Yellow
  surface_lrt: "#a855f7",  // Purple
  enhanced_bus: "#3b82f6",  // Blue
};

export interface ScenarioResult {
  lineLengthKm: number;
  numStations: number;
  costLow: number; // $ millions
  costHigh: number;
  dailyRidersLow: number;
  dailyRidersHigh: number;
  carTripsRemovedLow: number;
  carTripsRemovedHigh: number;
  annualFareRevenue: number;
  timelineYearsLow: number;
  timelineYearsHigh: number;
  populationServed: number;
  jobsServed: number;
}

export interface HotspotCluster {
  id: string;
  label: string;
  zones: Zone[];
  avgScore: number;
  center: [number, number];
}

export interface LayerVisibility {
  needScore: boolean;
  busLines: boolean;
  lrtLines: boolean;
  subwayLines: boolean;
  trafficHotspots: boolean;
  stations: boolean;
}

export interface ScoringWeights {
  populationDensity: number;
  jobDensity: number;
  trafficLevel: number;
  distanceToTransit: number;
  equityFactor: number;
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  populationDensity: 0.25,
  jobDensity: 0.2,
  trafficLevel: 0.2,
  distanceToTransit: 0.25,
  equityFactor: 0.1,
};

// ---------------------------------------------------------------------------
// Simulation / Analysis API response types
// ---------------------------------------------------------------------------

export interface ModeScenarioResult {
  mode: string;
  line_length_km: number;
  num_stations: number;
  cost_low: number;
  cost_high: number;
  daily_riders_low: number;
  daily_riders_high: number;
  car_trips_removed_low: number;
  car_trips_removed_high: number;
  annual_fare_revenue: number;
  timeline_years_low: number;
  timeline_years_high: number;
  population_served: number;
  jobs_served: number;
  cost_per_rider: number;
  roi_years: number;
}

export interface CoveredNeighbourhood {
  neighbourhood: string;
  benefit_score: number;
  centroid_lat: number;
  centroid_lng: number;
}

export interface CorridorInfo {
  length_km: number;
  population_served: number;
  jobs_served: number;
  traffic_served: number;
  avg_benefit_score: number;
  covered_neighbourhoods: CoveredNeighbourhood[];
}

export interface ModeComparisonResponse {
  corridor: CorridorInfo;
  modes: Record<string, ModeScenarioResult>;
}

export interface SensitivityPreset {
  weights: { density_weight: number; traffic_weight: number; distance_weight: number };
  corridor_avg_benefit: number;
  top_5_global: { neighbourhood: string; benefit_score: number }[];
  covered_neighbourhoods: string[];
}

export interface FullAnalysisResponse {
  comparison: ModeComparisonResponse;
  sensitivity: Record<string, SensitivityPreset>;
  briefing: string;
  ai_analysis?: string;
}

// ---------------------------------------------------------------------------
// Full Simulation (multi-candidate) response types
// ---------------------------------------------------------------------------

export interface SimulationCandidate {
  rank: number;
  path_lat_lng: [number, number][];
  candidate_score: number;
  reason: string;
  name: string;
  description: string;
  neighbourhoods: string[];
  pareto_front: boolean;
  coverage_km2?: number;
  avg_benefit?: number;
  num_neighbourhoods?: number;
  waypoint_count?: number;
}

export interface FullSimulationResponse {
  candidates: SimulationCandidate[];
  best_candidate_index: number;
  comparison: ModeComparisonResponse;
  sensitivity: Record<string, SensitivityPreset>;
  briefing: string;
  ai_analysis?: string;
}

export type SimulationPhase = "idle" | "simulating" | "analyzing" | "complete";

