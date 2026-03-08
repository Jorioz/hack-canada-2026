"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import {
    Zone,
    TransitLine,
    Scenario,
    ScenarioMode,
    ScenarioAIAnalysis,
    LayerVisibility,
    HotspotCluster,
} from "./types";
import { MOCK_TRANSIT_LINES } from "./data/mockData";
import ttcRoutesRaw from "./data/ttc_routes.json";
import {
    calculateScenario,
    calculateStationPositions,
} from "./utils/simulation";
import { computeNeedScore } from "./utils/scoring";

import TransitMap from "./components/TransitMap";
import Sidebar from "./components/Sidebar";
import ScenarioAnalysisOverlay from "./components/ScenarioAnalysisOverlay";
import { TrainFront } from "lucide-react";

interface DensityGeoJSON {
    type: "FeatureCollection";
    features: {
        type: "Feature";
        geometry: any;
        properties: {
            neighbourhood: string;
            population: number;
            area_km2: number;
            density_per_km2: number;
        };
    }[];
}

interface TrafficIntersection {
    location_name: string;
    latitude: number;
    longitude: number;
    total_vehicle: number;
    total_bike: number;
    total_pedestrian: number;
    am_peak_vehicle: number;
    pm_peak_vehicle: number;
}

interface RouteCandidateResponse {
    waypoints_lat_lng: [number, number][];
    candidate_count: number;
    candidates: AIRouteCandidate[];
    analysis_summary?: string;
    corridor_insights?: CorridorInsights;
}

interface AIRouteCandidate {
    rank: number;
    candidate_id: string;
    name: string;
    path_lat_lng: [number, number][];
    candidate_score: number;
    reason: string;
    reasoning?: string;
    key_neighbourhoods?: string[];
    tradeoffs?: string;
    estimated_length_km?: number;
    estimated_stations?: number;
    neighbourhood_impacts?: string;
    traffic_summary?: string;
    connectivity_summary?: string;
    ridership_estimate?: string;
}

interface CorridorInsights {
    total_population_served?: number;
    transit_desert_score?: number;
    corridor_summary?: string;
}

interface AIRouteResponse {
    candidates: AIRouteCandidate[];
    analysis_summary?: string;
    corridor_insights?: CorridorInsights;
}

export default function Home() {
    // Compute Need Scores for all zones
    const [zones, setZones] = useState<Zone[]>([]);
    const [selectedZone, setSelectedZone] = useState<Zone | null>(null);
    const [selectedLine, setSelectedLine] = useState<TransitLine | null>(null);
    const [activeTab, setActiveTab] = useState<
        "explore" | "insights" | "scenarios"
    >("explore");
    const [layers, setLayers] = useState<LayerVisibility>({
        needScore: true,
        busLines: true,
        lrtLines: true,
        subwayLines: true,
        trafficHotspots: true,
        stations: true,
    });

    // Scenario state
    const [scenarios, setScenarios] = useState<Scenario[]>([]);
    const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(
        null,
    );
    const [analysisScenario, setAnalysisScenario] = useState<Scenario | null>(
        null,
    );
    const [isDrawing, setIsDrawing] = useState(false);
    const [drawingWaypoints, setDrawingWaypoints] = useState<
        [number, number][]
    >([]);
    const [drawingPath, setDrawingPath] = useState<[number, number][]>([]);
    const [isRouting, setIsRouting] = useState(false);
    const [scenarioMode, setScenarioMode] = useState<ScenarioMode>("subway");
    const [stationSpacing, setStationSpacing] = useState(1200);
    const [mapCenter, setMapCenter] = useState<[number, number]>([43.7, -79.4]);
    const [mapZoom, setMapZoom] = useState(11);

    // Recommended spacing by mode
    const SPACING_DEFAULTS: Record<ScenarioMode, number> = {
        subway: 1200,
        surface_lrt: 600,
        enhanced_bus: 400,
    };

    // Handle mode change and update spacing to recommended value
    const handleScenarioModeChange = useCallback(
        (mode: ScenarioMode) => {
            setScenarioMode(mode);
            setStationSpacing(SPACING_DEFAULTS[mode]);
        },
        [SPACING_DEFAULTS],
    );

    // AI Route selection state
    const [aiRouteCandidates, setAiRouteCandidates] = useState<
        AIRouteCandidate[]
    >([]);
    const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
    const [showRouteSelector, setShowRouteSelector] = useState(false);
    const [showRouteDetails, setShowRouteDetails] = useState(false);
    const [analysisSummary, setAnalysisSummary] = useState<string>("");
    const [corridorInsights, setCorridorInsights] =
        useState<CorridorInsights | null>(null);
    const [userWaypoints, setUserWaypoints] = useState<[number, number][]>([]);

    // AI analysis loading state with cycling messages
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisStep, setAnalysisStep] = useState(0);
    const analysisMessages = [
        "Analyzing neighbourhood density...",
        "Evaluating traffic patterns...",
        "Identifying transit deserts...",
        "Computing optimal corridors...",
        "Scoring route candidates...",
        "Generating recommendations...",
    ];

    // Cycle through analysis messages
    useEffect(() => {
        if (!isAnalyzing) return;
        const interval = setInterval(() => {
            setAnalysisStep((prev) => (prev + 1) % analysisMessages.length);
        }, 2500);
        return () => clearInterval(interval);
    }, [isAnalyzing, analysisMessages.length]);

    // Hotspot clusters
    const [hotspots, setHotspots] = useState<HotspotCluster[]>([]);

    // Merge GTFS routes with hand-crafted mock lines (which have better descriptions)
    const [transitLines] = useState<TransitLine[]>(() => {
        const gtfsById = new Map<string, any>();
        (ttcRoutesRaw as any[]).forEach((r) => gtfsById.set(r.id, r));

        // Map mock IDs → GTFS IDs for subway lines so we can use GTFS coordinates
        const mockToGtfs: Record<string, string> = {
            line1: "1",
            line2: "2",
            line3: "4",
        };

        // Enhance mock lines: replace subway coordinates with accurate GTFS paths
        const enhanced = MOCK_TRANSIT_LINES.map((line) => {
            const gtfsId = mockToGtfs[line.id];
            if (gtfsId && gtfsById.has(gtfsId)) {
                return {
                    ...line,
                    coordinates: gtfsById.get(gtfsId).coordinates,
                };
            }
            return line;
        });

        // IDs already covered by mock lines (including GTFS equivalents)
        const coveredGtfsIds = new Set([
            "1",
            "2",
            "4",
            "5",
            "504",
            "510",
            "939",
            "35",
            "52",
        ]);
        const extraGtfs: TransitLine[] = (ttcRoutesRaw as any[])
            .filter((r) => !coveredGtfsIds.has(r.id))
            .map((r) => ({
                ...r,
                stations: [], // GTFS stations are all at the same point (parser bug)
            }));

        return [...enhanced, ...extraGtfs];
    });

    // Density GeoJSON from API
    const [densityGeoJSON, setDensityGeoJSON] = useState<DensityGeoJSON | null>(
        null,
    );

    // Traffic intersections from API
    const [allTrafficIntersections, setAllTrafficIntersections] = useState<
        TrafficIntersection[]
    >([]);
    const [trafficLevels, setTrafficLevels] = useState<Set<string>>(
        () => new Set(["veryHigh"]),
    );

    const trafficIntersections = useMemo(() => {
        return allTrafficIntersections.filter((i) => {
            const v = i.total_vehicle;
            if (v < 15000) return trafficLevels.has("low");
            if (v < 30000) return trafficLevels.has("moderate");
            if (v < 50000) return trafficLevels.has("high");
            return trafficLevels.has("veryHigh");
        });
    }, [allTrafficIntersections, trafficLevels]);

    // Fetch density GeoJSON from API
    useEffect(() => {
        fetch("/api/py/density/geojson")
            .then((res) => res.json())
            .then((data: DensityGeoJSON) => {
                setDensityGeoJSON(data);

                // Generate Zones from GeoJSON features
                const generatedZones: Zone[] = data.features.map(
                    (feature, index) => {
                        const p = feature.properties;

                        // Generate realistic mock data based on population density
                        // E.g. high density -> high job density, higher traffic, closer to transit
                        const isHighDensity = p.density_per_km2 > 10000;
                        const isMediumDensity = p.density_per_km2 > 5000;

                        const jobMultiplier = isHighDensity
                            ? 2.5
                            : isMediumDensity
                              ? 1.0
                              : 0.5;
                        const jobDensity = Math.round(
                            p.density_per_km2 * jobMultiplier,
                        );

                        const trafficLevel = isHighDensity
                            ? 85 - (index % 15)
                            : isMediumDensity
                              ? 65 - (index % 10)
                              : 45 - (index % 10);
                        const distanceToTransit = isHighDensity
                            ? 0.2 + (index % 5) * 0.1
                            : isMediumDensity
                              ? 1.5 + (index % 10) * 0.2
                              : 3.5 + (index % 15) * 0.3;

                        const medianIncomeBase = isHighDensity
                            ? 65000
                            : isMediumDensity
                              ? 85000
                              : 95000;
                        const medianIncome =
                            medianIncomeBase + (index % 20) * 1000 - 10000;

                        const existingRidershipBase = isHighDensity
                            ? 35000
                            : isMediumDensity
                              ? 15000
                              : 5000;
                        const existingRidership =
                            existingRidershipBase + (index % 30) * 500;

                        // Use bbox center approximation for center point
                        const coords = feature.geometry.coordinates[0][0];
                        let latSum = 0,
                            lngSum = 0;
                        coords.forEach((coord: number[]) => {
                            lngSum += coord[0];
                            latSum += coord[1];
                        });
                        const center: [number, number] = [
                            latSum / coords.length,
                            lngSum / coords.length,
                        ];

                        // Simplify polygon for app state
                        const coordinates: [number, number][] = coords.map(
                            (c: number[]) => [c[0], c[1]],
                        );

                        return {
                            id: `zone-${index}`,
                            name: p.neighbourhood,
                            coordinates,
                            center,
                            populationDensity: Math.round(p.density_per_km2),
                            jobDensity,
                            trafficLevel,
                            distanceToTransit: Number(
                                distanceToTransit.toFixed(1),
                            ),
                            medianIncome,
                            growthFlag: index % 3 === 0,
                            existingRidership,
                            landUse: isHighDensity ? "mixed" : "residential",
                            needScore: 0, // Computed below
                        };
                    },
                );

                // Compute need scores
                const zonesWithScores = generatedZones.map((zone) => ({
                    ...zone,
                    needScore: computeNeedScore(zone, generatedZones),
                }));

                setZones(zonesWithScores);

                // Generate hotspot clusters from top-scoring zones
                const sortedZones = [...zonesWithScores].sort(
                    (a, b) => b.needScore - a.needScore,
                );
                const topZones = sortedZones.slice(0, 10); // Top 10 hotspots
                const hotspotClusters: HotspotCluster[] = topZones.map(
                    (zone, index) => {
                        // Generate descriptive labels based on zone characteristics
                        let label = "High transit need";
                        if (zone.distanceToTransit > 2.5) {
                            label = "Transit desert - far from rapid transit";
                        } else if (zone.populationDensity > 12000) {
                            label = "High density, needs capacity";
                        } else if (zone.trafficLevel > 70) {
                            label = "High congestion corridor";
                        } else if (zone.medianIncome < 45000) {
                            label = "Equity priority area";
                        }

                        return {
                            id: `hotspot-${index + 1}`,
                            label,
                            zones: [zone],
                            avgScore: zone.needScore,
                            center: zone.center,
                        };
                    },
                );
                setHotspots(hotspotClusters);
            })
            .catch((err) =>
                console.error("Failed to fetch density GeoJSON:", err),
            );
    }, []);

    // Fetch all traffic intersections once
    useEffect(() => {
        fetch("/api/py/traffic/intersections?min_total_vehicle=5000")
            .then((res) => res.json())
            .then((data: TrafficIntersection[]) =>
                setAllTrafficIntersections(data),
            )
            .catch((err) =>
                console.error("Failed to fetch traffic intersections:", err),
            );
    }, []);

    const toggleTrafficLevel = useCallback((level: string) => {
        setTrafficLevels((prev) => {
            const next = new Set(prev);
            if (next.has(level)) next.delete(level);
            else next.add(level);
            return next;
        });
    }, []);

    const handleZoneClick = useCallback((zone: Zone) => {
        setSelectedLine(null);
        setSelectedZone(zone);
        setActiveTab("explore");
    }, []);

    const handleLineClick = useCallback((line: TransitLine) => {
        setSelectedZone(null);
        setSelectedLine(line);
        setActiveTab("explore");
    }, []);

    const handleMapClick = useCallback(
        async (latlng: [number, number]) => {
            if (!isDrawing || isRouting) return;

            const newWaypoints = [...drawingWaypoints, latlng];
            setDrawingWaypoints(newWaypoints);

            if (newWaypoints.length >= 2) {
                if (scenarioMode === "subway") {
                    // Subways go underground, straight point-to-point
                    setDrawingPath((prev) => [...prev, latlng]);
                } else {
                    // Fetch road-snapped route for surface modes
                    setIsRouting(true);
                    try {
                        const { getRouteSegment } =
                            await import("./utils/routing");
                        const prevPoint = newWaypoints[newWaypoints.length - 2];
                        const segment = await getRouteSegment(
                            prevPoint,
                            latlng,
                        );
                        // Append segment (skip first point to avoid duplicates)
                        setDrawingPath((prev) => [
                            ...prev,
                            ...segment.slice(prev.length > 0 ? 1 : 0),
                        ]);
                    } catch {
                        // Fallback: straight line
                        setDrawingPath((prev) => [...prev, latlng]);
                    } finally {
                        setIsRouting(false);
                    }
                }
            } else {
                // First point
                setDrawingPath([latlng]);
            }
        },
        [isDrawing, isRouting, drawingWaypoints, scenarioMode],
    );

    const savedLayersRef = useRef<LayerVisibility | null>(null);

    const handleStartDrawing = useCallback(() => {
        savedLayersRef.current = { ...layers };
        setLayers({
            needScore: false,
            busLines: false,
            lrtLines: false,
            subwayLines: false,
            trafficHotspots: false,
            stations: false,
        });
        setIsDrawing(true);
        setDrawingWaypoints([]);
        setDrawingPath([]);
    }, [layers]);

    const handleFinishDrawing = useCallback(() => {
        if (drawingPath.length < 2) return;
        setIsDrawing(false);
        if (savedLayersRef.current) {
            setLayers(savedLayersRef.current);
            savedLayersRef.current = null;
        }

        const run = async () => {
            // For non-subway modes, create scenario directly with user's path
            if (scenarioMode !== "subway" || drawingWaypoints.length < 2) {
                const result = calculateScenario(
                    drawingPath,
                    scenarioMode,
                    stationSpacing,
                    zones,
                    transitLines,
                );
                const stations = calculateStationPositions(
                    drawingPath,
                    stationSpacing,
                    scenarioMode,
                );
                const newScenario: Scenario = {
                    id: `scenario-${Date.now()}`,
                    name: `Scenario ${scenarios.length + 1}`,
                    mode: scenarioMode,
                    path: [...drawingPath],
                    stations,
                    stationSpacing,
                    result,
                    createdAt: new Date(),
                    visible: true,
                };
                setScenarios((prev) => [...prev, newScenario]);
                setDrawingWaypoints([]);
                setDrawingPath([]);
                setActiveTab("scenarios");
                return;
            }

            // For subway mode, fetch AI route suggestions
            setIsRouting(true);
            setIsAnalyzing(true);
            setAnalysisStep(0);
            setUserWaypoints([...drawingWaypoints]);
            try {
                const response = await fetch("/api/py/transit/route/optimize", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        waypoints_lat_lng: drawingWaypoints,
                        max_candidates: 5,
                        buffer_km: 1.0,
                        search_km: 5.0,
                    }),
                });

                if (response.ok) {
                    const payload: RouteCandidateResponse =
                        await response.json();
                    if (payload.candidates && payload.candidates.length > 0) {
                        setAiRouteCandidates(payload.candidates);
                        setSelectedRouteIndex(0);
                        setAnalysisSummary(payload.analysis_summary || "");
                        setCorridorInsights(payload.corridor_insights || null);
                        setShowRouteSelector(true);
                        // Don't clear waypoints yet - keep them visible
                    } else {
                        // No candidates, fall back to user's path
                        console.warn("No AI route candidates returned");
                        setDrawingWaypoints([]);
                        setDrawingPath([]);
                    }
                } else {
                    console.error(
                        "Failed to fetch AI routes:",
                        response.status,
                    );
                    setDrawingWaypoints([]);
                    setDrawingPath([]);
                }
            } catch (error) {
                console.error(
                    "Failed to fetch backend subway candidates:",
                    error,
                );
                setDrawingWaypoints([]);
                setDrawingPath([]);
            } finally {
                setIsRouting(false);
                setIsAnalyzing(false);
            }
        };

        void run();
    }, [
        drawingPath,
        drawingWaypoints,
        scenarioMode,
        stationSpacing,
        zones,
        scenarios.length,
        transitLines,
    ]);

    const handleCancelDrawing = useCallback(() => {
        setIsDrawing(false);
        if (savedLayersRef.current) {
            setLayers(savedLayersRef.current);
            savedLayersRef.current = null;
        }
        setDrawingWaypoints([]);
        setDrawingPath([]);
    }, []);

    // AI Route selection handlers
    const handleSelectRoute = useCallback((index: number) => {
        setSelectedRouteIndex(index);
    }, []);

    const handleConfirmRoute = useCallback(() => {
        const selectedRoute = aiRouteCandidates[selectedRouteIndex];
        if (!selectedRoute || selectedRoute.path_lat_lng.length < 2) return;

        const result = calculateScenario(
            selectedRoute.path_lat_lng,
            scenarioMode,
            stationSpacing,
            zones,
            transitLines,
        );
        const stations = calculateStationPositions(
            selectedRoute.path_lat_lng,
            stationSpacing,
            scenarioMode,
        );

        // Build AI analysis object to preserve insights
        const aiAnalysis: ScenarioAIAnalysis = {
            candidateId: selectedRoute.candidate_id,
            reason: selectedRoute.reason,
            reasoning: selectedRoute.reasoning,
            keyNeighbourhoods: selectedRoute.key_neighbourhoods,
            tradeoffs: selectedRoute.tradeoffs,
            neighbourhoodImpacts: selectedRoute.neighbourhood_impacts,
            trafficSummary: selectedRoute.traffic_summary,
            connectivitySummary: selectedRoute.connectivity_summary,
            ridershipEstimate: selectedRoute.ridership_estimate,
            candidateScore: selectedRoute.candidate_score,
            totalPopulationServed: corridorInsights?.total_population_served,
            transitDesertScore: corridorInsights?.transit_desert_score,
            corridorSummary: corridorInsights?.corridor_summary,
            analysisSummary: analysisSummary || undefined,
            allCandidates: aiRouteCandidates.map((c) => ({
                rank: c.rank,
                name: c.name,
                reason: c.reason,
                candidateScore: c.candidate_score,
            })),
        };

        const newScenario: Scenario = {
            id: `scenario-${Date.now()}`,
            name: selectedRoute.name || `Scenario ${scenarios.length + 1}`,
            mode: scenarioMode,
            path: [...selectedRoute.path_lat_lng],
            stations,
            stationSpacing,
            result,
            createdAt: new Date(),
            visible: true,
            aiAnalysis,
        };

        setScenarios((prev) => [...prev, newScenario]);
        setShowRouteSelector(false);
        setAiRouteCandidates([]);
        setDrawingWaypoints([]);
        setDrawingPath([]);
        setActiveTab("scenarios");
    }, [
        aiRouteCandidates,
        selectedRouteIndex,
        scenarioMode,
        stationSpacing,
        zones,
        transitLines,
        scenarios.length,
        corridorInsights,
        analysisSummary,
    ]);

    const handleCancelRouteSelection = useCallback(() => {
        setShowRouteSelector(false);
        setAiRouteCandidates([]);
        setDrawingWaypoints([]);
        setDrawingPath([]);
        setUserWaypoints([]);
    }, []);

    // Arrow key navigation for route selection
    useEffect(() => {
        if (!showRouteSelector) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "ArrowLeft") {
                setSelectedRouteIndex((prev) =>
                    prev > 0 ? prev - 1 : aiRouteCandidates.length - 1,
                );
            } else if (e.key === "ArrowRight") {
                setSelectedRouteIndex((prev) =>
                    prev < aiRouteCandidates.length - 1 ? prev + 1 : 0,
                );
            } else if (e.key === "Enter") {
                handleConfirmRoute();
            } else if (e.key === "Escape") {
                handleCancelRouteSelection();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [
        showRouteSelector,
        aiRouteCandidates.length,
        handleConfirmRoute,
        handleCancelRouteSelection,
    ]);

    const handleDeleteScenario = useCallback((id: string) => {
        setScenarios((prev) => prev.filter((s) => s.id !== id));
    }, []);

    const handleToggleScenario = useCallback((id: string) => {
        setScenarios((prev) =>
            prev.map((s) => (s.id === id ? { ...s, visible: !s.visible } : s)),
        );
    }, []);

    const handleZoomToZone = useCallback((zone: Zone) => {
        setMapCenter(zone.center);
        setMapZoom(14);
        setSelectedZone(zone);
    }, []);

    const toggleLayer = useCallback((layer: keyof LayerVisibility) => {
        setLayers((prev) => ({ ...prev, [layer]: !prev[layer] }));
    }, []);

    return (
        <main className="flex h-screen w-screen overflow-hidden bg-[var(--color-bg-primary)]">
            {/* Sidebar */}
            <Sidebar
                zones={zones}
                selectedZone={selectedZone}
                selectedLine={selectedLine}
                activeTab={activeTab}
                onTabChange={setActiveTab}
                hotspots={hotspots}
                transitLines={transitLines}
                trafficIntersections={trafficIntersections}
                scenarios={scenarios}
                onZoneClick={handleZoneClick}
                onZoomToZone={handleZoomToZone}
                onStartDrawing={handleStartDrawing}
                onFinishDrawing={handleFinishDrawing}
                onCancelDrawing={handleCancelDrawing}
                isDrawing={isDrawing}
                drawingPath={drawingPath}
                scenarioMode={scenarioMode}
                onScenarioModeChange={handleScenarioModeChange}
                stationSpacing={stationSpacing}
                onStationSpacingChange={setStationSpacing}
                onDeleteScenario={handleDeleteScenario}
                onToggleScenario={handleToggleScenario}
                selectedScenarioId={selectedScenarioId}
                onScenarioSelect={setSelectedScenarioId}
                onViewAnalysis={setAnalysisScenario}
                layers={layers}
                onToggleLayer={toggleLayer}
            />

            {/* Map */}
            <div className="flex-1 relative">
                <TransitMap
                    transitLines={transitLines}
                    zones={zones}
                    selectedLine={selectedLine}
                    onLineClick={handleLineClick}
                    onZoneClick={handleZoneClick}
                    onMapClick={handleMapClick}
                    layers={layers}
                    isDrawing={isDrawing}
                    drawingPath={drawingPath}
                    drawingWaypoints={drawingWaypoints}
                    scenarios={scenarios}
                    hotspots={hotspots}
                    center={mapCenter}
                    zoom={mapZoom}
                    densityGeoJSON={densityGeoJSON}
                    trafficIntersections={trafficIntersections}
                    aiRoutePreview={
                        showRouteSelector && aiRouteCandidates.length > 0
                            ? aiRouteCandidates[selectedRouteIndex]
                                  ?.path_lat_lng
                            : undefined
                    }
                    userWaypointsPreview={
                        showRouteSelector ? userWaypoints : undefined
                    }
                    onScenarioClick={(scenario) =>
                        setSelectedScenarioId(scenario.id)
                    }
                />

                <div className="absolute bottom-6 right-4 z-[1000] glass-panel px-4 py-3">
                    <div className="text-xs text-[var(--color-text-muted)] mb-2">
                        Traffic Filter
                    </div>
                    <div className="flex gap-2">
                        {[
                            {
                                key: "low",
                                label: "Low",
                                color: "#22c55e",
                                border: "#16a34a",
                            },
                            {
                                key: "moderate",
                                label: "Med",
                                color: "#eab308",
                                border: "#ca8a04",
                            },
                            {
                                key: "high",
                                label: "High",
                                color: "#f97316",
                                border: "#ea580c",
                            },
                            {
                                key: "veryHigh",
                                label: "Critical",
                                color: "#ef4444",
                                border: "#dc2626",
                            },
                        ].map((lvl) => {
                            const active = trafficLevels.has(lvl.key);
                            return (
                                <button
                                    key={lvl.key}
                                    onClick={() => toggleTrafficLevel(lvl.key)}
                                    className="px-3 py-1.5 rounded text-xs font-medium transition-all"
                                    style={{
                                        backgroundColor: active
                                            ? lvl.color
                                            : "transparent",
                                        color: active ? "#000" : lvl.color,
                                        border: `1.5px solid ${active ? lvl.border : lvl.color + "66"}`,
                                        opacity: active ? 1 : 0.5,
                                    }}
                                >
                                    {lvl.label}
                                </button>
                            );
                        })}
                    </div>
                    <div className="mt-2 text-xs text-[var(--color-text-muted)]">
                        Showing {trafficIntersections.length} intersections
                    </div>
                </div>

                {/* Drawing Mode Overlay */}
                {isDrawing && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] glass-panel px-6 py-3 flex items-center gap-4 animate-fade-up">
                        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        <span className="text-sm font-medium text-[var(--color-text-primary)]">
                            Click on the map to draw your transit line
                        </span>
                        <span className="text-xs text-[var(--color-text-muted)]">
                            {drawingWaypoints.length} waypoint
                            {drawingWaypoints.length !== 1 ? "s" : ""}
                        </span>
                        {isRouting && (
                            <div className="flex items-center gap-1.5">
                                <div className="w-3 h-3 border-2 border-[var(--color-accent-cyan)] border-t-transparent rounded-full animate-spin" />
                                <span className="text-[10px] text-[var(--color-accent-cyan)]">
                                    Routing...
                                </span>
                            </div>
                        )}
                        <button
                            onClick={handleFinishDrawing}
                            disabled={drawingWaypoints.length < 2 || isRouting}
                            className="px-3 py-1 rounded-md text-xs font-medium bg-[var(--color-accent-green)] text-white disabled:opacity-30 disabled:cursor-not-allowed hover:brightness-110 transition"
                        >
                            Finish
                        </button>
                        <button
                            onClick={handleCancelDrawing}
                            className="px-3 py-1 rounded-md text-xs font-medium bg-[var(--color-accent-red)] text-white hover:brightness-110 transition"
                        >
                            Cancel
                        </button>
                    </div>
                )}

                {/* AI Route Selection Overlay */}
                {showRouteSelector && aiRouteCandidates.length > 0 && (
                    <div className="absolute inset-0 z-[2000] pointer-events-none">
                        {/* Route info panel at top */}
                        <div className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-auto glass-panel px-6 py-4 max-w-2xl">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
                                    AI Route Suggestions
                                </h3>
                                <span className="text-sm text-[var(--color-text-muted)]">
                                    {selectedRouteIndex + 1} /{" "}
                                    {aiRouteCandidates.length}
                                </span>
                            </div>

                            <div className="mb-3">
                                <h4 className="text-base font-medium text-[var(--color-accent-cyan)]">
                                    {
                                        aiRouteCandidates[selectedRouteIndex]
                                            ?.name
                                    }
                                </h4>
                                <p className="text-sm text-[var(--color-text-secondary)] mt-1">
                                    {
                                        aiRouteCandidates[selectedRouteIndex]
                                            ?.reason
                                    }
                                </p>
                                {aiRouteCandidates[selectedRouteIndex]
                                    ?.key_neighbourhoods && (
                                    <div className="mt-2 flex flex-wrap gap-1">
                                        {aiRouteCandidates[
                                            selectedRouteIndex
                                        ].key_neighbourhoods
                                            ?.slice(0, 5)
                                            .map((n, i) => (
                                                <span
                                                    key={i}
                                                    className="px-2 py-0.5 text-xs bg-[var(--color-bg-tertiary)] rounded-full text-[var(--color-text-muted)]"
                                                >
                                                    {n}
                                                </span>
                                            ))}
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)]">
                                <span>
                                    Score:{" "}
                                    {
                                        aiRouteCandidates[selectedRouteIndex]
                                            ?.candidate_score
                                    }
                                </span>
                                <button
                                    onClick={() => setShowRouteDetails(true)}
                                    className="px-2 py-1 rounded text-[var(--color-accent-cyan)] hover:bg-[var(--color-bg-tertiary)] transition"
                                >
                                    View Full Details →
                                </button>
                                <span>
                                    {aiRouteCandidates[selectedRouteIndex]
                                        ?.path_lat_lng?.length || 0}{" "}
                                    waypoints
                                </span>
                            </div>
                        </div>

                        {/* Navigation controls at bottom */}
                        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 pointer-events-auto glass-panel px-4 py-3">
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={() =>
                                        setSelectedRouteIndex((prev) =>
                                            prev > 0
                                                ? prev - 1
                                                : aiRouteCandidates.length - 1,
                                        )
                                    }
                                    className="px-3 py-2 rounded-md bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-bg-secondary)] transition flex items-center gap-1"
                                >
                                    <span className="text-lg">←</span>
                                    <span className="text-xs text-[var(--color-text-muted)]">
                                        Prev
                                    </span>
                                </button>

                                <div className="flex gap-1">
                                    {aiRouteCandidates.map((_, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() =>
                                                handleSelectRoute(idx)
                                            }
                                            className={`w-2.5 h-2.5 rounded-full transition ${
                                                idx === selectedRouteIndex
                                                    ? "bg-[var(--color-accent-cyan)]"
                                                    : "bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-text-muted)]"
                                            }`}
                                        />
                                    ))}
                                </div>

                                <button
                                    onClick={() =>
                                        setSelectedRouteIndex((prev) =>
                                            prev < aiRouteCandidates.length - 1
                                                ? prev + 1
                                                : 0,
                                        )
                                    }
                                    className="px-3 py-2 rounded-md bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-bg-secondary)] transition flex items-center gap-1"
                                >
                                    <span className="text-xs text-[var(--color-text-muted)]">
                                        Next
                                    </span>
                                    <span className="text-lg">→</span>
                                </button>

                                <div className="w-px h-6 bg-[var(--color-border)]" />

                                <button
                                    onClick={handleConfirmRoute}
                                    className="px-4 py-2 rounded-md bg-[var(--color-accent-green)] text-white text-sm font-medium hover:brightness-110 transition"
                                >
                                    Select Route
                                </button>
                                <button
                                    onClick={handleCancelRouteSelection}
                                    className="px-4 py-2 rounded-md bg-[var(--color-accent-red)] text-white text-sm font-medium hover:brightness-110 transition"
                                >
                                    Cancel
                                </button>
                            </div>
                            <div className="mt-2 text-center text-[10px] text-[var(--color-text-muted)]">
                                Use ← → arrow keys to browse • Enter to select •
                                Esc to cancel
                            </div>
                        </div>
                    </div>
                )}

                {/* Route Details Modal */}
                {showRouteDetails && aiRouteCandidates.length > 0 && (
                    <div className="absolute inset-0 z-[3000] bg-black/60 flex items-center justify-center p-4">
                        <div className="glass-panel max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-xl font-bold text-[var(--color-text-primary)]">
                                    Route Analysis Details
                                </h2>
                                <button
                                    onClick={() => setShowRouteDetails(false)}
                                    className="p-2 rounded-md hover:bg-[var(--color-bg-tertiary)] transition text-[var(--color-text-muted)]"
                                >
                                    ✕
                                </button>
                            </div>

                            {/* Analysis Summary */}
                            {analysisSummary && (
                                <div className="mb-6 p-4 bg-[var(--color-bg-tertiary)] rounded-lg">
                                    <h3 className="text-sm font-semibold text-[var(--color-accent-cyan)] mb-2">
                                        Corridor Analysis
                                    </h3>
                                    <p className="text-sm text-[var(--color-text-secondary)]">
                                        {analysisSummary}
                                    </p>
                                </div>
                            )}

                            {/* Corridor Insights */}
                            {corridorInsights && (
                                <div className="mb-6 grid grid-cols-2 md:grid-cols-3 gap-4">
                                    {corridorInsights.total_population_served && (
                                        <div className="p-3 bg-[var(--color-bg-tertiary)] rounded-lg text-center">
                                            <div className="text-2xl font-bold text-[var(--color-accent-green)]">
                                                {corridorInsights.total_population_served.toLocaleString()}
                                            </div>
                                            <div className="text-xs text-[var(--color-text-muted)]">
                                                Population Served
                                            </div>
                                        </div>
                                    )}
                                    {corridorInsights.transit_desert_score !==
                                        undefined && (
                                        <div className="p-3 bg-[var(--color-bg-tertiary)] rounded-lg text-center">
                                            <div className="text-2xl font-bold text-[var(--color-accent-amber)]">
                                                {
                                                    corridorInsights.transit_desert_score
                                                }
                                            </div>
                                            <div className="text-xs text-[var(--color-text-muted)]">
                                                Transit Desert Score
                                            </div>
                                        </div>
                                    )}
                                    {corridorInsights.corridor_summary && (
                                        <div className="p-3 bg-[var(--color-bg-tertiary)] rounded-lg col-span-2 md:col-span-1">
                                            <div className="text-xs text-[var(--color-text-muted)] mb-1">
                                                Summary
                                            </div>
                                            <div className="text-sm text-[var(--color-text-primary)]">
                                                {
                                                    corridorInsights.corridor_summary
                                                }
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Selected Route Details */}
                            {(() => {
                                const route =
                                    aiRouteCandidates[selectedRouteIndex];
                                if (!route) return null;
                                return (
                                    <div className="space-y-4">
                                        <div className="border-b border-[var(--color-border)] pb-4">
                                            <h3 className="text-lg font-semibold text-[var(--color-accent-cyan)]">
                                                {route.name}
                                            </h3>
                                            <p className="text-sm text-[var(--color-text-secondary)] mt-1">
                                                {route.reason}
                                            </p>
                                        </div>

                                        {/* Route Stats */}
                                        <div className="grid grid-cols-3 gap-4">
                                            <div className="p-3 bg-[var(--color-bg-secondary)] rounded-lg">
                                                <div className="text-lg font-bold text-[var(--color-text-primary)]">
                                                    {route.estimated_length_km?.toFixed(
                                                        1,
                                                    ) || "—"}{" "}
                                                    km
                                                </div>
                                                <div className="text-xs text-[var(--color-text-muted)]">
                                                    Route Length
                                                </div>
                                            </div>
                                            <div className="p-3 bg-[var(--color-bg-secondary)] rounded-lg">
                                                <div className="text-lg font-bold text-[var(--color-text-primary)]">
                                                    {route.estimated_stations ||
                                                        "—"}
                                                </div>
                                                <div className="text-xs text-[var(--color-text-muted)]">
                                                    Est. Stations
                                                </div>
                                            </div>
                                            <div className="p-3 bg-[var(--color-bg-secondary)] rounded-lg">
                                                <div className="text-lg font-bold text-[var(--color-accent-green)]">
                                                    {route.candidate_score}
                                                </div>
                                                <div className="text-xs text-[var(--color-text-muted)]">
                                                    Priority Score
                                                </div>
                                            </div>
                                        </div>

                                        {/* Reasoning */}
                                        {route.reasoning && (
                                            <div className="p-4 bg-[var(--color-bg-secondary)] rounded-lg">
                                                <h4 className="text-sm font-semibold text-[var(--color-text-primary)] mb-2">
                                                    Planning Rationale
                                                </h4>
                                                <p className="text-sm text-[var(--color-text-secondary)]">
                                                    {route.reasoning}
                                                </p>
                                            </div>
                                        )}

                                        {/* Neighbourhood Impacts */}
                                        {route.neighbourhood_impacts && (
                                            <div className="p-4 bg-[var(--color-bg-secondary)] rounded-lg">
                                                <h4 className="text-sm font-semibold text-[var(--color-text-primary)] mb-2">
                                                    Neighbourhood Impact
                                                </h4>
                                                <p className="text-sm text-[var(--color-text-secondary)]">
                                                    {
                                                        route.neighbourhood_impacts
                                                    }
                                                </p>
                                            </div>
                                        )}

                                        {/* Traffic Summary */}
                                        {route.traffic_summary && (
                                            <div className="p-4 bg-[var(--color-bg-secondary)] rounded-lg">
                                                <h4 className="text-sm font-semibold text-[var(--color-text-primary)] mb-2">
                                                    Traffic Impact
                                                </h4>
                                                <p className="text-sm text-[var(--color-text-secondary)]">
                                                    {route.traffic_summary}
                                                </p>
                                            </div>
                                        )}

                                        {/* Connectivity Summary */}
                                        {route.connectivity_summary && (
                                            <div className="p-4 bg-[var(--color-bg-secondary)] rounded-lg">
                                                <h4 className="text-sm font-semibold text-[var(--color-accent-cyan)] mb-2">
                                                    Transit Connectivity
                                                </h4>
                                                <p className="text-sm text-[var(--color-text-secondary)]">
                                                    {route.connectivity_summary}
                                                </p>
                                            </div>
                                        )}

                                        {/* Ridership Estimate */}
                                        {route.ridership_estimate && (
                                            <div className="p-4 bg-[var(--color-bg-secondary)] rounded-lg">
                                                <h4 className="text-sm font-semibold text-[var(--color-accent-green)] mb-2">
                                                    Ridership Projection
                                                </h4>
                                                <p className="text-sm text-[var(--color-text-secondary)]">
                                                    {route.ridership_estimate}
                                                </p>
                                            </div>
                                        )}

                                        {/* Tradeoffs */}
                                        {route.tradeoffs && (
                                            <div className="p-4 bg-[var(--color-accent-amber)]/10 border border-[var(--color-accent-amber)]/30 rounded-lg">
                                                <h4 className="text-sm font-semibold text-[var(--color-accent-amber)] mb-2">
                                                    Considerations & Tradeoffs
                                                </h4>
                                                <p className="text-sm text-[var(--color-text-secondary)]">
                                                    {route.tradeoffs}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}

                            <div className="mt-6 flex justify-end">
                                <button
                                    onClick={() => setShowRouteDetails(false)}
                                    className="px-4 py-2 rounded-md bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-bg-secondary)] transition text-sm"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* AI Analysis Loading Overlay */}
            {isAnalyzing && (
                <div className="ai-loading-overlay">
                    <div className="relative flex items-center justify-center mb-8">
                        <div className="ai-loading-ring" />
                        <div className="ai-loading-train">
                            <TrainFront
                                size={48}
                                className="text-[var(--color-accent-cyan)]"
                            />
                        </div>
                    </div>
                    <h2 className="text-xl font-semibold text-[var(--color-text-primary)] mb-3">
                        Generating Route Candidates
                    </h2>
                    <p className="text-[var(--color-accent-cyan)] text-sm animate-pulse min-h-[20px]">
                        {analysisMessages[analysisStep]}
                    </p>
                    <div className="mt-6 flex gap-1">
                        {analysisMessages.map((_, i) => (
                            <div
                                key={i}
                                className={`w-2 h-2 rounded-full transition-all duration-300 ${
                                    i === analysisStep
                                        ? "bg-[var(--color-accent-cyan)] scale-125"
                                        : i < analysisStep
                                          ? "bg-[var(--color-accent-cyan)] opacity-50"
                                          : "bg-[var(--color-text-muted)] opacity-30"
                                }`}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Scenario Analysis Overlay */}
            {analysisScenario && (
                <ScenarioAnalysisOverlay
                    scenario={analysisScenario}
                    zones={zones}
                    onClose={() => setAnalysisScenario(null)}
                />
            )}
        </main>
    );
}
