"use client";

import { Scenario, Zone, SCENARIO_MODE_COLORS } from "../types";
import {
    X,
    TrainFront,
    TramFront,
    Bus,
    Sparkles,
    MapPinned,
    Lightbulb,
    Route,
    Users,
    Briefcase,
    TrendingUp,
    MapPin,
    Car,
    DollarSign,
    Clock,
    Ruler,
    BarChart3,
    Building2,
    Home,
    Factory,
    Layers,
    AlertTriangle,
    CheckCircle2,
    Leaf,
    Scale,
    Target,
    Gauge,
    Activity,
    Info,
} from "lucide-react";
import { useMemo } from "react";

interface ScenarioAnalysisOverlayProps {
    scenario: Scenario;
    zones: Zone[];
    onClose: () => void;
}

// Helper to check if a point is inside a polygon (ray casting)
function pointInPolygon(
    point: [number, number],
    polygon: [number, number][],
): boolean {
    const [y, x] = point; // point is [lat, lng], polygon is [lng, lat]
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [xi, yi] = polygon[i];
        const [xj, yj] = polygon[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
            inside = !inside;
        }
    }
    return inside;
}

// Find zones that the route passes through
function findZonesAlongRoute(path: [number, number][], zones: Zone[]): Zone[] {
    const zonesSet = new Set<string>();
    const result: Zone[] = [];

    for (const point of path) {
        for (const zone of zones) {
            if (
                !zonesSet.has(zone.id) &&
                pointInPolygon(point, zone.coordinates)
            ) {
                zonesSet.add(zone.id);
                result.push(zone);
            }
        }
    }

    return result;
}

function formatNumber(num: number): string {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toLocaleString();
}

function formatCost(millions: number): string {
    if (millions >= 1000) return `$${(millions / 1000).toFixed(1)}B`;
    return `$${millions.toFixed(0)}M`;
}

const LAND_USE_ICONS = {
    residential: Home,
    commercial: Building2,
    mixed: Layers,
    industrial: Factory,
};

const LAND_USE_LABELS = {
    residential: "Residential",
    commercial: "Commercial",
    mixed: "Mixed Use",
    industrial: "Industrial",
};

export default function ScenarioAnalysisOverlay({
    scenario,
    zones,
    onClose,
}: ScenarioAnalysisOverlayProps) {
    const modeColor = SCENARIO_MODE_COLORS[scenario.mode] || "#3b82f6";
    const ModeIcon =
        scenario.mode === "subway"
            ? TrainFront
            : scenario.mode === "surface_lrt"
              ? TramFront
              : Bus;

    // Calculate zones along route
    const zonesAlongRoute = useMemo(
        () => findZonesAlongRoute(scenario.path, zones),
        [scenario.path, zones],
    );

    // Aggregate statistics from zones
    const aggregateStats = useMemo(() => {
        if (zonesAlongRoute.length === 0) return null;

        const totalPopDensity = zonesAlongRoute.reduce(
            (sum, z) => sum + z.populationDensity,
            0,
        );
        const totalJobDensity = zonesAlongRoute.reduce(
            (sum, z) => sum + z.jobDensity,
            0,
        );
        const avgNeedScore =
            zonesAlongRoute.reduce((sum, z) => sum + z.needScore, 0) /
            zonesAlongRoute.length;
        const avgTrafficLevel =
            zonesAlongRoute.reduce((sum, z) => sum + z.trafficLevel, 0) /
            zonesAlongRoute.length;
        const avgDistanceToTransit =
            zonesAlongRoute.reduce((sum, z) => sum + z.distanceToTransit, 0) /
            zonesAlongRoute.length;
        const avgIncome =
            zonesAlongRoute.reduce((sum, z) => sum + z.medianIncome, 0) /
            zonesAlongRoute.length;
        const growthZones = zonesAlongRoute.filter((z) => z.growthFlag).length;
        const totalRidership = zonesAlongRoute.reduce(
            (sum, z) => sum + z.existingRidership,
            0,
        );

        const landUseBreakdown = {
            residential: zonesAlongRoute.filter(
                (z) => z.landUse === "residential",
            ).length,
            commercial: zonesAlongRoute.filter(
                (z) => z.landUse === "commercial",
            ).length,
            mixed: zonesAlongRoute.filter((z) => z.landUse === "mixed").length,
            industrial: zonesAlongRoute.filter(
                (z) => z.landUse === "industrial",
            ).length,
        };

        return {
            totalPopDensity,
            totalJobDensity,
            avgNeedScore,
            avgTrafficLevel,
            avgDistanceToTransit,
            avgIncome,
            growthZones,
            totalRidership,
            landUseBreakdown,
        };
    }, [zonesAlongRoute]);

    // Research-focused computed metrics
    const researchMetrics = useMemo(() => {
        if (!scenario.result) return null;

        const lineLengthKm = scenario.result.lineLengthKm || 1;
        const avgDailyRiders =
            (scenario.result.dailyRidersLow + scenario.result.dailyRidersHigh) /
            2;
        const avgCost =
            (scenario.result.costLow + scenario.result.costHigh) / 2;

        // Cost efficiency - capital cost per daily rider (lower is better)
        const costPerRider = avgCost / avgDailyRiders;

        // Cost per km
        const costPerKm = avgCost / lineLengthKm;

        // Ridership intensity - riders per km (higher indicates productive corridor)
        const ridersPerKm = avgDailyRiders / lineLengthKm;

        // CO2 Reduction Estimate (avg car trip = 8.9kg CO2, 250 working days)
        const avgCarsRemoved =
            (scenario.result.carTripsRemovedLow +
                scenario.result.carTripsRemovedHigh) /
            2;
        const annualCO2Reduction = (avgCarsRemoved * 8.9 * 250) / 1000; // tonnes/year

        // Mode Capacity Analysis
        // Peak hour capacity estimates (vehicles per direction per hour × capacity)
        const modeCapacity =
            {
                subway: 30000, // ~25 trains × 1200 passengers
                surface_lrt: 8000, // ~20 vehicles × 400 passengers
                enhanced_bus: 4000, // ~30 buses × 130 passengers
            }[scenario.mode] || 4000;

        // Estimate peak ridership as 15% of daily in peak direction
        const peakRidership = avgDailyRiders * 0.15;
        const capacityUtilization = (peakRidership / modeCapacity) * 100;

        // Only calculate zone-dependent metrics if we have zone data
        let equityIndex = 50; // default neutral
        let transitGapCoverage = 0;
        let constructionComplexity = 50; // default medium
        let modeSuitability = "Unknown";
        const densityScore = aggregateStats
            ? aggregateStats.totalPopDensity + aggregateStats.totalJobDensity
            : 0;

        if (aggregateStats && zonesAlongRoute.length > 0) {
            // Equity Index - corridor income vs city average ($73,000 Toronto median)
            // Score 0-100: higher = serves lower income areas (more equitable)
            const CITY_MEDIAN_INCOME = 73000;
            const incomeRatio = aggregateStats.avgIncome / CITY_MEDIAN_INCOME;
            equityIndex = Math.max(0, Math.min(100, (2 - incomeRatio) * 50));

            // Transit Gap Coverage - % of zones with high distance to transit (>1.5km)
            const transitGapZones = zonesAlongRoute.filter(
                (z) => z.distanceToTransit > 1.5,
            ).length;
            transitGapCoverage =
                (transitGapZones / zonesAlongRoute.length) * 100;

            // Construction Complexity Score (0-100)
            // Lower = easier. Industrial/residential = easier, mixed/commercial = harder
            const complexityWeights = {
                residential: 30,
                industrial: 20,
                commercial: 60,
                mixed: 70,
            };
            constructionComplexity =
                Object.entries(aggregateStats.landUseBreakdown).reduce(
                    (sum, [type, count]) =>
                        sum +
                        (complexityWeights[
                            type as keyof typeof complexityWeights
                        ] || 50) *
                            count,
                    0,
                ) / zonesAlongRoute.length;
        }

        // Mode Suitability Score based on ridership and density
        if (scenario.mode === "subway") {
            // Subway needs >15k riders/km and high density
            modeSuitability =
                ridersPerKm > 15000 && densityScore > 20000
                    ? "Optimal"
                    : ridersPerKm > 8000
                      ? "Suitable"
                      : "Over-built";
        } else if (scenario.mode === "surface_lrt") {
            // LRT suits 5k-15k riders/km
            modeSuitability =
                ridersPerKm > 5000 && ridersPerKm < 18000
                    ? "Optimal"
                    : ridersPerKm < 5000
                      ? "Under-utilized"
                      : "Consider Upgrade";
        } else {
            // Bus for <8k riders/km
            modeSuitability =
                ridersPerKm < 8000
                    ? "Optimal"
                    : ridersPerKm < 12000
                      ? "Consider LRT"
                      : "Consider Subway";
        }

        return {
            costPerRider,
            costPerKm,
            ridersPerKm,
            equityIndex,
            transitGapCoverage,
            annualCO2Reduction,
            capacityUtilization,
            constructionComplexity,
            modeSuitability,
            peakRidership,
            modeCapacity,
        };
    }, [scenario.result, aggregateStats, zonesAlongRoute, scenario.mode]);

    const analysis = scenario.aiAnalysis;

    return (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 animate-fade-in">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div
                className="relative w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl shadow-2xl"
                style={{
                    background:
                        "linear-gradient(135deg, rgba(15,23,42,0.98) 0%, rgba(30,41,59,0.98) 100%)",
                    border: `1px solid ${modeColor}40`,
                }}
            >
                {/* Header */}
                <div
                    className="sticky top-0 z-10 px-6 py-4 border-b"
                    style={{
                        borderColor: `${modeColor}30`,
                        background: `linear-gradient(135deg, ${modeColor}15 0%, transparent 60%)`,
                    }}
                >
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div
                                className="w-10 h-10 rounded-lg flex items-center justify-center"
                                style={{ background: `${modeColor}25` }}
                            >
                                <ModeIcon size={22} color={modeColor} />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-[var(--color-text-primary)]">
                                    {scenario.name}
                                </h2>
                                <p
                                    className="text-xs"
                                    style={{ color: modeColor }}
                                >
                                    {scenario.mode === "subway"
                                        ? "Subway Line"
                                        : scenario.mode === "surface_lrt"
                                          ? "Surface LRT"
                                          : "Enhanced Bus"}
                                    {" • "}
                                    {scenario.result?.lineLengthKm} km •{" "}
                                    {scenario.stations.length} stations
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 rounded-lg hover:bg-white/10 transition"
                        >
                            <X
                                size={20}
                                className="text-[var(--color-text-muted)]"
                            />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="overflow-y-auto max-h-[calc(90vh-80px)] p-6 space-y-6">
                    {/* Key Project Metrics */}
                    {scenario.result && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div className="glass-card p-3">
                                <div className="flex items-center gap-2 mb-1">
                                    <DollarSign
                                        size={14}
                                        className="text-[var(--color-accent-amber)]"
                                    />
                                    <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
                                        Capital Cost
                                    </span>
                                </div>
                                <p className="text-xl font-black text-[var(--color-accent-amber)]">
                                    {formatCost(scenario.result.costLow)}–
                                    {formatCost(scenario.result.costHigh)}
                                </p>
                                <p className="text-[9px] text-[var(--color-text-muted)] mt-1">
                                    $
                                    {researchMetrics
                                        ? formatNumber(
                                              Math.round(
                                                  researchMetrics.costPerKm /
                                                      1000000,
                                              ),
                                          )
                                        : "—"}
                                    M/km
                                </p>
                            </div>
                            <div className="glass-card p-3">
                                <div className="flex items-center gap-2 mb-1">
                                    <Users
                                        size={14}
                                        className="text-[var(--color-accent-cyan)]"
                                    />
                                    <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
                                        Daily Ridership
                                    </span>
                                </div>
                                <p className="text-xl font-black text-[var(--color-accent-cyan)]">
                                    {formatNumber(
                                        scenario.result.dailyRidersLow,
                                    )}
                                    –
                                    {formatNumber(
                                        scenario.result.dailyRidersHigh,
                                    )}
                                </p>
                                <p className="text-[9px] text-[var(--color-text-muted)] mt-1">
                                    {researchMetrics
                                        ? formatNumber(
                                              Math.round(
                                                  researchMetrics.ridersPerKm,
                                              ),
                                          )
                                        : "—"}{" "}
                                    riders/km
                                </p>
                            </div>
                            <div className="glass-card p-3">
                                <div className="flex items-center gap-2 mb-1">
                                    <Target
                                        size={14}
                                        className="text-[var(--color-accent-green)]"
                                    />
                                    <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
                                        Cost Efficiency
                                    </span>
                                </div>
                                <p className="text-xl font-black text-[var(--color-accent-green)]">
                                    $
                                    {researchMetrics
                                        ? formatNumber(
                                              Math.round(
                                                  researchMetrics.costPerRider,
                                              ),
                                          )
                                        : "—"}
                                </p>
                                <p className="text-[9px] text-[var(--color-text-muted)] mt-1">
                                    capital $/daily rider
                                </p>
                            </div>
                            <div className="glass-card p-3">
                                <div className="flex items-center gap-2 mb-1">
                                    <Clock
                                        size={14}
                                        className="text-[var(--color-accent-purple)]"
                                    />
                                    <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
                                        Timeline
                                    </span>
                                </div>
                                <p className="text-xl font-black text-[var(--color-accent-purple)]">
                                    {scenario.result.timelineYearsLow}–
                                    {scenario.result.timelineYearsHigh} yrs
                                </p>
                                <p className="text-[9px] text-[var(--color-text-muted)] mt-1">
                                    to full operation
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Research Metrics Panel */}
                    {researchMetrics && (
                        <div className="glass-card p-4">
                            <div className="flex items-center gap-2 mb-4">
                                <BarChart3
                                    size={16}
                                    style={{ color: modeColor }}
                                />
                                <h3 className="text-sm font-bold text-[var(--color-text-primary)]">
                                    Research Metrics
                                </h3>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {/* Equity Index */}
                                <div className="p-3 rounded-lg bg-white/5">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Scale
                                            size={14}
                                            className="text-[var(--color-accent-cyan)]"
                                        />
                                        <span className="text-[10px] text-[var(--color-text-muted)]">
                                            Equity Index
                                        </span>
                                    </div>
                                    <p
                                        className={`text-lg font-bold ${researchMetrics.equityIndex >= 60 ? "text-[var(--color-accent-green)]" : researchMetrics.equityIndex >= 40 ? "text-[var(--color-accent-amber)]" : "text-[var(--color-text-primary)]"}`}
                                    >
                                        {researchMetrics.equityIndex.toFixed(0)}
                                        <span className="text-[10px] font-normal text-[var(--color-text-muted)]">
                                            /100
                                        </span>
                                    </p>
                                    <p className="text-[8px] text-[var(--color-text-muted)] mt-1">
                                        {researchMetrics.equityIndex >= 60
                                            ? "Serves underserved areas"
                                            : researchMetrics.equityIndex >= 40
                                              ? "Moderate equity impact"
                                              : "Serves affluent areas"}
                                    </p>
                                </div>

                                {/* Transit Gap Coverage */}
                                <div className="p-3 rounded-lg bg-white/5">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Activity
                                            size={14}
                                            className="text-[var(--color-accent-red)]"
                                        />
                                        <span className="text-[10px] text-[var(--color-text-muted)]">
                                            Transit Gaps Filled
                                        </span>
                                    </div>
                                    <p className="text-lg font-bold text-[var(--color-text-primary)]">
                                        {researchMetrics.transitGapCoverage.toFixed(
                                            0,
                                        )}
                                        %
                                    </p>
                                    <p className="text-[8px] text-[var(--color-text-muted)] mt-1">
                                        zones &gt;1.5km from transit
                                    </p>
                                </div>

                                {/* Capacity Utilization */}
                                <div className="p-3 rounded-lg bg-white/5">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Gauge
                                            size={14}
                                            className="text-[var(--color-accent-purple)]"
                                        />
                                        <span className="text-[10px] text-[var(--color-text-muted)]">
                                            Peak Capacity
                                        </span>
                                    </div>
                                    <p
                                        className={`text-lg font-bold ${researchMetrics.capacityUtilization > 85 ? "text-[var(--color-accent-red)]" : researchMetrics.capacityUtilization > 60 ? "text-[var(--color-accent-amber)]" : "text-[var(--color-text-primary)]"}`}
                                    >
                                        {researchMetrics.capacityUtilization.toFixed(
                                            0,
                                        )}
                                        %
                                    </p>
                                    <p className="text-[8px] text-[var(--color-text-muted)] mt-1">
                                        {formatNumber(
                                            Math.round(
                                                researchMetrics.peakRidership,
                                            ),
                                        )}
                                        /
                                        {formatNumber(
                                            researchMetrics.modeCapacity,
                                        )}{" "}
                                        pax/hr
                                    </p>
                                </div>

                                {/* CO2 Reduction */}
                                <div className="p-3 rounded-lg bg-white/5">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Leaf
                                            size={14}
                                            className="text-[var(--color-accent-green)]"
                                        />
                                        <span className="text-[10px] text-[var(--color-text-muted)]">
                                            CO₂ Reduction
                                        </span>
                                    </div>
                                    <p className="text-lg font-bold text-[var(--color-accent-green)]">
                                        {formatNumber(
                                            Math.round(
                                                researchMetrics.annualCO2Reduction,
                                            ),
                                        )}
                                    </p>
                                    <p className="text-[8px] text-[var(--color-text-muted)] mt-1">
                                        tonnes/year
                                    </p>
                                </div>
                            </div>

                            {/* Mode Suitability Banner */}
                            <div
                                className={`mt-4 p-3 rounded-lg flex items-center gap-3 ${
                                    researchMetrics.modeSuitability ===
                                    "Optimal"
                                        ? "bg-green-500/10 border border-green-500/30"
                                        : researchMetrics.modeSuitability ===
                                            "Suitable"
                                          ? "bg-blue-500/10 border border-blue-500/30"
                                          : "bg-amber-500/10 border border-amber-500/30"
                                }`}
                            >
                                <Info
                                    size={16}
                                    className={
                                        researchMetrics.modeSuitability ===
                                        "Optimal"
                                            ? "text-green-400"
                                            : researchMetrics.modeSuitability ===
                                                "Suitable"
                                              ? "text-blue-400"
                                              : "text-amber-400"
                                    }
                                />
                                <div>
                                    <p className="text-xs font-semibold text-[var(--color-text-primary)]">
                                        Mode Suitability:{" "}
                                        {researchMetrics.modeSuitability}
                                    </p>
                                    <p className="text-[10px] text-[var(--color-text-muted)]">
                                        Based on{" "}
                                        {formatNumber(
                                            Math.round(
                                                researchMetrics.ridersPerKm,
                                            ),
                                        )}{" "}
                                        riders/km corridor density. Construction
                                        complexity:{" "}
                                        {researchMetrics.constructionComplexity.toFixed(
                                            0,
                                        )}
                                        /100.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Two Column Layout */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Left Column - AI Analysis */}
                        <div className="space-y-4">
                            <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--color-text-primary)]">
                                <Sparkles
                                    size={16}
                                    style={{ color: modeColor }}
                                />
                                AI Route Analysis
                            </h3>

                            {analysis ? (
                                <div className="space-y-4">
                                    {/* Corridor Insights */}
                                    {(analysis.totalPopulationServed ||
                                        analysis.transitDesertScore !==
                                            undefined) && (
                                        <div className="glass-card p-4">
                                            <div className="flex items-center gap-2 mb-3">
                                                <MapPinned
                                                    size={14}
                                                    style={{ color: modeColor }}
                                                />
                                                <span
                                                    className="text-xs font-semibold"
                                                    style={{ color: modeColor }}
                                                >
                                                    Corridor Insights
                                                </span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                {analysis.totalPopulationServed && (
                                                    <div>
                                                        <p className="text-[10px] text-[var(--color-text-muted)] mb-1">
                                                            Population Served
                                                        </p>
                                                        <p className="text-lg font-bold text-[var(--color-text-primary)]">
                                                            {analysis.totalPopulationServed.toLocaleString()}
                                                        </p>
                                                    </div>
                                                )}
                                                {analysis.transitDesertScore !==
                                                    undefined && (
                                                    <div>
                                                        <p className="text-[10px] text-[var(--color-text-muted)] mb-1">
                                                            Transit Desert Score
                                                        </p>
                                                        <div className="flex items-center gap-2">
                                                            <p className="text-lg font-bold text-[var(--color-text-primary)]">
                                                                {
                                                                    analysis.transitDesertScore
                                                                }
                                                            </p>
                                                            <span className="text-xs text-[var(--color-text-muted)]">
                                                                /100
                                                            </span>
                                                            {analysis.transitDesertScore >=
                                                                70 && (
                                                                <AlertTriangle
                                                                    size={14}
                                                                    className="text-[var(--color-accent-amber)]"
                                                                />
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            {analysis.corridorSummary && (
                                                <p className="text-xs text-[var(--color-text-secondary)] mt-3 leading-relaxed">
                                                    {analysis.corridorSummary}
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    {/* Why This Route */}
                                    {(analysis.reason ||
                                        analysis.reasoning) && (
                                        <div className="glass-card p-4">
                                            <div className="flex items-center gap-2 mb-3">
                                                <Lightbulb
                                                    size={14}
                                                    style={{ color: modeColor }}
                                                />
                                                <span
                                                    className="text-xs font-semibold"
                                                    style={{ color: modeColor }}
                                                >
                                                    Why This Route
                                                </span>
                                            </div>
                                            <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                                                {analysis.reasoning ||
                                                    analysis.reason}
                                            </p>
                                            {analysis.keyNeighbourhoods &&
                                                analysis.keyNeighbourhoods
                                                    .length > 0 && (
                                                    <div className="mt-3 flex flex-wrap gap-1">
                                                        {analysis.keyNeighbourhoods.map(
                                                            (n, i) => (
                                                                <span
                                                                    key={i}
                                                                    className="px-2 py-0.5 text-[10px] rounded-full"
                                                                    style={{
                                                                        background: `${modeColor}20`,
                                                                        color: modeColor,
                                                                    }}
                                                                >
                                                                    {n}
                                                                </span>
                                                            ),
                                                        )}
                                                    </div>
                                                )}
                                        </div>
                                    )}

                                    {/* Tradeoffs */}
                                    {analysis.tradeoffs && (
                                        <div className="glass-card p-4 border-l-2 border-[var(--color-accent-amber)]">
                                            <div className="flex items-center gap-2 mb-2">
                                                <AlertTriangle
                                                    size={14}
                                                    className="text-[var(--color-accent-amber)]"
                                                />
                                                <span className="text-xs font-semibold text-[var(--color-accent-amber)]">
                                                    Considerations
                                                </span>
                                            </div>
                                            <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                                                {analysis.tradeoffs}
                                            </p>
                                        </div>
                                    )}

                                    {/* Additional Summaries */}
                                    {(analysis.trafficSummary ||
                                        analysis.connectivitySummary ||
                                        analysis.neighbourhoodImpacts) && (
                                        <div className="glass-card p-4 space-y-3">
                                            {analysis.trafficSummary && (
                                                <div>
                                                    <p className="text-[10px] font-semibold text-[var(--color-accent-amber)] mb-1">
                                                        Traffic Impact
                                                    </p>
                                                    <p className="text-xs text-[var(--color-text-muted)]">
                                                        {
                                                            analysis.trafficSummary
                                                        }
                                                    </p>
                                                </div>
                                            )}
                                            {analysis.connectivitySummary && (
                                                <div>
                                                    <p className="text-[10px] font-semibold text-[var(--color-accent-cyan)] mb-1">
                                                        Transit Connectivity
                                                    </p>
                                                    <p className="text-xs text-[var(--color-text-muted)]">
                                                        {
                                                            analysis.connectivitySummary
                                                        }
                                                    </p>
                                                </div>
                                            )}
                                            {analysis.neighbourhoodImpacts && (
                                                <div>
                                                    <p className="text-[10px] font-semibold text-[var(--color-accent-green)] mb-1">
                                                        Neighbourhood Impacts
                                                    </p>
                                                    <p className="text-xs text-[var(--color-text-muted)]">
                                                        {
                                                            analysis.neighbourhoodImpacts
                                                        }
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Routes Considered */}
                                    {analysis.allCandidates &&
                                        analysis.allCandidates.length > 1 && (
                                            <div className="glass-card p-4">
                                                <div className="flex items-center gap-2 mb-3">
                                                    <Route
                                                        size={14}
                                                        style={{
                                                            color: modeColor,
                                                        }}
                                                    />
                                                    <span
                                                        className="text-xs font-semibold"
                                                        style={{
                                                            color: modeColor,
                                                        }}
                                                    >
                                                        Routes Considered
                                                    </span>
                                                </div>
                                                <div className="space-y-2">
                                                    {analysis.allCandidates.map(
                                                        (c, i) => {
                                                            const isSelected =
                                                                c.name ===
                                                                scenario.name;
                                                            return (
                                                                <div
                                                                    key={i}
                                                                    className={`flex items-center gap-3 p-2 rounded-lg ${isSelected ? "bg-white/5" : ""}`}
                                                                >
                                                                    <span
                                                                        className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                                                                        style={{
                                                                            background:
                                                                                isSelected
                                                                                    ? modeColor
                                                                                    : "rgba(255,255,255,0.1)",
                                                                            color: isSelected
                                                                                ? "#000"
                                                                                : "inherit",
                                                                        }}
                                                                    >
                                                                        {c.rank}
                                                                    </span>
                                                                    <div className="flex-1">
                                                                        <p
                                                                            className={`text-xs ${isSelected ? "font-semibold text-[var(--color-text-primary)]" : "text-[var(--color-text-muted)]"}`}
                                                                        >
                                                                            {
                                                                                c.name
                                                                            }
                                                                            {isSelected && (
                                                                                <CheckCircle2
                                                                                    size={
                                                                                        12
                                                                                    }
                                                                                    className="inline ml-2"
                                                                                    style={{
                                                                                        color: modeColor,
                                                                                    }}
                                                                                />
                                                                            )}
                                                                        </p>
                                                                        <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5 line-clamp-1">
                                                                            {
                                                                                c.reason
                                                                            }
                                                                        </p>
                                                                    </div>
                                                                    <span className="text-[10px] text-[var(--color-text-muted)]">
                                                                        Score:{" "}
                                                                        {
                                                                            c.candidateScore
                                                                        }
                                                                    </span>
                                                                </div>
                                                            );
                                                        },
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                    {/* Analysis Summary */}
                                    {analysis.analysisSummary && (
                                        <div className="glass-card p-4">
                                            <div className="flex items-center gap-2 mb-3">
                                                <Sparkles
                                                    size={14}
                                                    style={{ color: modeColor }}
                                                />
                                                <span
                                                    className="text-xs font-semibold"
                                                    style={{ color: modeColor }}
                                                >
                                                    Full Analysis
                                                </span>
                                            </div>
                                            <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed whitespace-pre-wrap">
                                                {analysis.analysisSummary}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="glass-card p-6 text-center">
                                    <Sparkles
                                        size={24}
                                        className="mx-auto mb-2 text-[var(--color-text-muted)]"
                                    />
                                    <p className="text-xs text-[var(--color-text-muted)]">
                                        No AI analysis available for this route.
                                        <br />
                                        Use AI-assisted routing to get detailed
                                        insights.
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Right Column - Corridor Density Data */}
                        <div className="space-y-4">
                            <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--color-text-primary)]">
                                <MapPin
                                    size={16}
                                    style={{ color: modeColor }}
                                />
                                Corridor Density Analysis
                            </h3>

                            {aggregateStats && zonesAlongRoute.length > 0 ? (
                                <div className="space-y-4">
                                    {/* Aggregate Stats */}
                                    <div className="glass-card p-4">
                                        <p
                                            className="text-xs font-semibold mb-3"
                                            style={{ color: modeColor }}
                                        >
                                            {zonesAlongRoute.length}{" "}
                                            Neighbourhoods Along Route
                                        </p>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <div className="flex items-center gap-1 mb-1">
                                                    <Users
                                                        size={12}
                                                        className="text-[var(--color-accent-cyan)]"
                                                    />
                                                    <span className="text-[10px] text-[var(--color-text-muted)]">
                                                        Total Pop. Density
                                                    </span>
                                                </div>
                                                <p className="text-base font-bold text-[var(--color-text-primary)]">
                                                    {formatNumber(
                                                        aggregateStats.totalPopDensity,
                                                    )}
                                                    <span className="text-[10px] font-normal text-[var(--color-text-muted)]">
                                                        /km²
                                                    </span>
                                                </p>
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-1 mb-1">
                                                    <Briefcase
                                                        size={12}
                                                        className="text-[var(--color-accent-purple)]"
                                                    />
                                                    <span className="text-[10px] text-[var(--color-text-muted)]">
                                                        Total Job Density
                                                    </span>
                                                </div>
                                                <p className="text-base font-bold text-[var(--color-text-primary)]">
                                                    {formatNumber(
                                                        aggregateStats.totalJobDensity,
                                                    )}
                                                    <span className="text-[10px] font-normal text-[var(--color-text-muted)]">
                                                        /km²
                                                    </span>
                                                </p>
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-1 mb-1">
                                                    <TrendingUp
                                                        size={12}
                                                        className="text-[var(--color-accent-red)]"
                                                    />
                                                    <span className="text-[10px] text-[var(--color-text-muted)]">
                                                        Avg Need Score
                                                    </span>
                                                </div>
                                                <p
                                                    className="text-base font-bold"
                                                    style={{
                                                        color:
                                                            aggregateStats.avgNeedScore >=
                                                            60
                                                                ? "var(--color-accent-red)"
                                                                : "var(--color-text-primary)",
                                                    }}
                                                >
                                                    {aggregateStats.avgNeedScore.toFixed(
                                                        1,
                                                    )}
                                                    <span className="text-[10px] font-normal text-[var(--color-text-muted)]">
                                                        /100
                                                    </span>
                                                </p>
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-1 mb-1">
                                                    <Car
                                                        size={12}
                                                        className="text-[var(--color-accent-amber)]"
                                                    />
                                                    <span className="text-[10px] text-[var(--color-text-muted)]">
                                                        Avg Traffic Level
                                                    </span>
                                                </div>
                                                <p className="text-base font-bold text-[var(--color-text-primary)]">
                                                    {aggregateStats.avgTrafficLevel.toFixed(
                                                        0,
                                                    )}
                                                    <span className="text-[10px] font-normal text-[var(--color-text-muted)]">
                                                        /100
                                                    </span>
                                                </p>
                                            </div>
                                        </div>

                                        {/* Additional aggregate stats */}
                                        <div className="grid grid-cols-3 gap-3 mt-4 pt-3 border-t border-white/10">
                                            <div className="text-center">
                                                <p className="text-lg font-bold text-[var(--color-accent-green)]">
                                                    {aggregateStats.growthZones}
                                                </p>
                                                <p className="text-[9px] text-[var(--color-text-muted)]">
                                                    Growth Zones
                                                </p>
                                            </div>
                                            <div className="text-center">
                                                <p className="text-lg font-bold text-[var(--color-text-primary)]">
                                                    {aggregateStats.avgDistanceToTransit.toFixed(
                                                        1,
                                                    )}
                                                    km
                                                </p>
                                                <p className="text-[9px] text-[var(--color-text-muted)]">
                                                    Avg to Transit
                                                </p>
                                            </div>
                                            <div className="text-center">
                                                <p className="text-lg font-bold text-[var(--color-text-primary)]">
                                                    $
                                                    {formatNumber(
                                                        aggregateStats.avgIncome,
                                                    )}
                                                </p>
                                                <p className="text-[9px] text-[var(--color-text-muted)]">
                                                    Med. Income
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Land Use Breakdown */}
                                    <div className="glass-card p-4">
                                        <p
                                            className="text-xs font-semibold mb-3"
                                            style={{ color: modeColor }}
                                        >
                                            Land Use Composition
                                        </p>
                                        <div className="grid grid-cols-4 gap-2">
                                            {(
                                                [
                                                    "residential",
                                                    "commercial",
                                                    "mixed",
                                                    "industrial",
                                                ] as const
                                            ).map((type) => {
                                                const Icon =
                                                    LAND_USE_ICONS[type];
                                                const count =
                                                    aggregateStats
                                                        .landUseBreakdown[type];
                                                const pct =
                                                    zonesAlongRoute.length > 0
                                                        ? (
                                                              (count /
                                                                  zonesAlongRoute.length) *
                                                              100
                                                          ).toFixed(0)
                                                        : 0;
                                                return (
                                                    <div
                                                        key={type}
                                                        className="text-center p-2 rounded-lg bg-white/5"
                                                    >
                                                        <Icon
                                                            size={16}
                                                            className="mx-auto mb-1"
                                                            style={{
                                                                color: modeColor,
                                                            }}
                                                        />
                                                        <p className="text-sm font-bold text-[var(--color-text-primary)]">
                                                            {count}
                                                        </p>
                                                        <p className="text-[9px] text-[var(--color-text-muted)]">
                                                            {
                                                                LAND_USE_LABELS[
                                                                    type
                                                                ]
                                                            }
                                                        </p>
                                                        <p className="text-[8px] text-[var(--color-text-muted)]">
                                                            ({pct}%)
                                                        </p>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Individual Zones */}
                                    <div className="glass-card p-4">
                                        <p
                                            className="text-xs font-semibold mb-3"
                                            style={{ color: modeColor }}
                                        >
                                            Neighbourhoods Along Route
                                        </p>
                                        <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                                            {zonesAlongRoute
                                                .sort(
                                                    (a, b) =>
                                                        b.needScore -
                                                        a.needScore,
                                                )
                                                .map((zone) => {
                                                    const LandIcon =
                                                        LAND_USE_ICONS[
                                                            zone.landUse
                                                        ];
                                                    return (
                                                        <div
                                                            key={zone.id}
                                                            className="flex items-center gap-3 p-2 rounded-lg bg-white/5 hover:bg-white/10 transition"
                                                        >
                                                            <div
                                                                className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0"
                                                                style={{
                                                                    background: `hsl(${Math.max(0, 120 - zone.needScore * 1.2)}, 70%, 40%)`,
                                                                }}
                                                            >
                                                                <span className="text-[10px] font-bold text-white">
                                                                    {zone.needScore.toFixed(
                                                                        0,
                                                                    )}
                                                                </span>
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-xs font-medium text-[var(--color-text-primary)] truncate">
                                                                    {zone.name}
                                                                </p>
                                                                <div className="flex items-center gap-2 text-[9px] text-[var(--color-text-muted)]">
                                                                    <span className="flex items-center gap-0.5">
                                                                        <Users
                                                                            size={
                                                                                9
                                                                            }
                                                                        />{" "}
                                                                        {formatNumber(
                                                                            zone.populationDensity,
                                                                        )}
                                                                    </span>
                                                                    <span className="flex items-center gap-0.5">
                                                                        <Briefcase
                                                                            size={
                                                                                9
                                                                            }
                                                                        />{" "}
                                                                        {formatNumber(
                                                                            zone.jobDensity,
                                                                        )}
                                                                    </span>
                                                                    <span className="flex items-center gap-0.5">
                                                                        <LandIcon
                                                                            size={
                                                                                9
                                                                            }
                                                                        />{" "}
                                                                        {
                                                                            LAND_USE_LABELS[
                                                                                zone
                                                                                    .landUse
                                                                            ]
                                                                        }
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            {zone.growthFlag && (
                                                                <TrendingUp
                                                                    size={12}
                                                                    className="text-[var(--color-accent-green)] flex-shrink-0"
                                                                />
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="glass-card p-6 text-center">
                                    <MapPin
                                        size={24}
                                        className="mx-auto mb-2 text-[var(--color-text-muted)]"
                                    />
                                    <p className="text-xs text-[var(--color-text-muted)]">
                                        No zone data available for this route
                                        corridor.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Comparative Benchmarks */}
                    {scenario.result && researchMetrics && (
                        <div className="glass-card p-4">
                            <div className="flex items-center gap-2 mb-4">
                                <BarChart3
                                    size={16}
                                    style={{ color: modeColor }}
                                />
                                <h3 className="text-sm font-bold text-[var(--color-text-primary)]">
                                    Comparative Benchmarks (Toronto Projects)
                                </h3>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="border-b border-white/10">
                                            <th className="text-left py-2 pr-4 text-[var(--color-text-muted)] font-medium">
                                                Project
                                            </th>
                                            <th className="text-right py-2 px-2 text-[var(--color-text-muted)] font-medium">
                                                Length
                                            </th>
                                            <th className="text-right py-2 px-2 text-[var(--color-text-muted)] font-medium">
                                                Cost/km
                                            </th>
                                            <th className="text-right py-2 px-2 text-[var(--color-text-muted)] font-medium">
                                                Riders/km
                                            </th>
                                            <th className="text-right py-2 px-2 text-[var(--color-text-muted)] font-medium">
                                                $/Rider
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {/* Your Project - highlighted */}
                                        <tr
                                            className="border-b border-white/5"
                                            style={{
                                                background: `${modeColor}15`,
                                            }}
                                        >
                                            <td
                                                className="py-2 pr-4 font-semibold"
                                                style={{ color: modeColor }}
                                            >
                                                {scenario.name} (Your Line)
                                            </td>
                                            <td className="py-2 px-2 text-right text-[var(--color-text-primary)]">
                                                {scenario.result.lineLengthKm}km
                                            </td>
                                            <td className="py-2 px-2 text-right text-[var(--color-text-primary)]">
                                                $
                                                {formatNumber(
                                                    Math.round(
                                                        researchMetrics.costPerKm /
                                                            1000000,
                                                    ),
                                                )}
                                                M
                                            </td>
                                            <td className="py-2 px-2 text-right text-[var(--color-text-primary)]">
                                                {formatNumber(
                                                    Math.round(
                                                        researchMetrics.ridersPerKm,
                                                    ),
                                                )}
                                            </td>
                                            <td className="py-2 px-2 text-right text-[var(--color-text-primary)]">
                                                $
                                                {formatNumber(
                                                    Math.round(
                                                        researchMetrics.costPerRider,
                                                    ),
                                                )}
                                            </td>
                                        </tr>
                                        {/* Benchmark Projects - conditionally show by mode */}
                                        {scenario.mode === "subway" && (
                                            <>
                                                <tr className="border-b border-white/5">
                                                    <td className="py-2 pr-4 text-[var(--color-text-secondary)]">
                                                        Line 1 Extension (TYSSE)
                                                    </td>
                                                    <td className="py-2 px-2 text-right text-[var(--color-text-muted)]">
                                                        8.6km
                                                    </td>
                                                    <td className="py-2 px-2 text-right text-[var(--color-text-muted)]">
                                                        $380M
                                                    </td>
                                                    <td className="py-2 px-2 text-right text-[var(--color-text-muted)]">
                                                        ~12,000
                                                    </td>
                                                    <td className="py-2 px-2 text-right text-[var(--color-text-muted)]">
                                                        $32,000
                                                    </td>
                                                </tr>
                                                <tr className="border-b border-white/5">
                                                    <td className="py-2 pr-4 text-[var(--color-text-secondary)]">
                                                        Ontario Line (projected)
                                                    </td>
                                                    <td className="py-2 px-2 text-right text-[var(--color-text-muted)]">
                                                        15.6km
                                                    </td>
                                                    <td className="py-2 px-2 text-right text-[var(--color-text-muted)]">
                                                        $1,150M
                                                    </td>
                                                    <td className="py-2 px-2 text-right text-[var(--color-text-muted)]">
                                                        ~25,000
                                                    </td>
                                                    <td className="py-2 px-2 text-right text-[var(--color-text-muted)]">
                                                        $46,000
                                                    </td>
                                                </tr>
                                                <tr className="border-b border-white/5">
                                                    <td className="py-2 pr-4 text-[var(--color-text-secondary)]">
                                                        Scarborough Extension
                                                    </td>
                                                    <td className="py-2 px-2 text-right text-[var(--color-text-muted)]">
                                                        7.8km
                                                    </td>
                                                    <td className="py-2 px-2 text-right text-[var(--color-text-muted)]">
                                                        $705M
                                                    </td>
                                                    <td className="py-2 px-2 text-right text-[var(--color-text-muted)]">
                                                        ~5,000
                                                    </td>
                                                    <td className="py-2 px-2 text-right text-[var(--color-text-muted)]">
                                                        $110,000
                                                    </td>
                                                </tr>
                                            </>
                                        )}
                                        {scenario.mode === "surface_lrt" && (
                                            <>
                                                <tr className="border-b border-white/5">
                                                    <td className="py-2 pr-4 text-[var(--color-text-secondary)]">
                                                        Eglinton Crosstown
                                                    </td>
                                                    <td className="py-2 px-2 text-right text-[var(--color-text-muted)]">
                                                        19km
                                                    </td>
                                                    <td className="py-2 px-2 text-right text-[var(--color-text-muted)]">
                                                        $295M
                                                    </td>
                                                    <td className="py-2 px-2 text-right text-[var(--color-text-muted)]">
                                                        ~8,400
                                                    </td>
                                                    <td className="py-2 px-2 text-right text-[var(--color-text-muted)]">
                                                        $35,000
                                                    </td>
                                                </tr>
                                                <tr className="border-b border-white/5">
                                                    <td className="py-2 pr-4 text-[var(--color-text-secondary)]">
                                                        Finch West LRT
                                                    </td>
                                                    <td className="py-2 px-2 text-right text-[var(--color-text-muted)]">
                                                        11km
                                                    </td>
                                                    <td className="py-2 px-2 text-right text-[var(--color-text-muted)]">
                                                        $115M
                                                    </td>
                                                    <td className="py-2 px-2 text-right text-[var(--color-text-muted)]">
                                                        ~4,500
                                                    </td>
                                                    <td className="py-2 px-2 text-right text-[var(--color-text-muted)]">
                                                        $25,500
                                                    </td>
                                                </tr>
                                                <tr className="border-b border-white/5">
                                                    <td className="py-2 pr-4 text-[var(--color-text-secondary)]">
                                                        Waterfront LRT
                                                        (proposed)
                                                    </td>
                                                    <td className="py-2 px-2 text-right text-[var(--color-text-muted)]">
                                                        6km
                                                    </td>
                                                    <td className="py-2 px-2 text-right text-[var(--color-text-muted)]">
                                                        $150M
                                                    </td>
                                                    <td className="py-2 px-2 text-right text-[var(--color-text-muted)]">
                                                        ~6,000
                                                    </td>
                                                    <td className="py-2 px-2 text-right text-[var(--color-text-muted)]">
                                                        $25,000
                                                    </td>
                                                </tr>
                                            </>
                                        )}
                                        {scenario.mode === "enhanced_bus" && (
                                            <>
                                                <tr className="border-b border-white/5">
                                                    <td className="py-2 pr-4 text-[var(--color-text-secondary)]">
                                                        Dufferin Express Bus
                                                    </td>
                                                    <td className="py-2 px-2 text-right text-[var(--color-text-muted)]">
                                                        14km
                                                    </td>
                                                    <td className="py-2 px-2 text-right text-[var(--color-text-muted)]">
                                                        $5M
                                                    </td>
                                                    <td className="py-2 px-2 text-right text-[var(--color-text-muted)]">
                                                        ~3,200
                                                    </td>
                                                    <td className="py-2 px-2 text-right text-[var(--color-text-muted)]">
                                                        $1,600
                                                    </td>
                                                </tr>
                                                <tr className="border-b border-white/5">
                                                    <td className="py-2 pr-4 text-[var(--color-text-secondary)]">
                                                        Jane BRT (proposed)
                                                    </td>
                                                    <td className="py-2 px-2 text-right text-[var(--color-text-muted)]">
                                                        18km
                                                    </td>
                                                    <td className="py-2 px-2 text-right text-[var(--color-text-muted)]">
                                                        $15M
                                                    </td>
                                                    <td className="py-2 px-2 text-right text-[var(--color-text-muted)]">
                                                        ~4,000
                                                    </td>
                                                    <td className="py-2 px-2 text-right text-[var(--color-text-muted)]">
                                                        $3,750
                                                    </td>
                                                </tr>
                                                <tr className="border-b border-white/5">
                                                    <td className="py-2 pr-4 text-[var(--color-text-secondary)]">
                                                        Steeles BRT (proposed)
                                                    </td>
                                                    <td className="py-2 px-2 text-right text-[var(--color-text-muted)]">
                                                        25km
                                                    </td>
                                                    <td className="py-2 px-2 text-right text-[var(--color-text-muted)]">
                                                        $12M
                                                    </td>
                                                    <td className="py-2 px-2 text-right text-[var(--color-text-muted)]">
                                                        ~2,800
                                                    </td>
                                                    <td className="py-2 px-2 text-right text-[var(--color-text-muted)]">
                                                        $4,300
                                                    </td>
                                                </tr>
                                            </>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            <p className="text-[9px] text-[var(--color-text-muted)] mt-3 italic">
                                * Benchmark data from publicly available transit
                                planning documents. Cost/km and $/rider are
                                approximate and may not reflect final actual
                                costs.
                            </p>
                        </div>
                    )}

                    {/* Disclaimer */}
                    <div className="text-center pt-4 border-t border-white/10">
                        <p className="text-[10px] text-[var(--color-text-muted)] italic">
                            ⚠️ Screening-level estimates only. All projections
                            are based on simplified models and should not be
                            used for final planning decisions.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
