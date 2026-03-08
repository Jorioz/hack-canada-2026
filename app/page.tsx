"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import {
    Zone,
    TransitLine,
    Scenario,
    ScenarioMode,
    LayerVisibility,
    HotspotCluster,
    FullAnalysisResponse,
    FullSimulationResponse,
    SimulationCandidate,
    SimulationPhase,
} from "./types";
import { MOCK_TRANSIT_LINES } from "./data/mockData";
import ttcRoutesRaw from "./data/ttc_routes.json";
import { calculateScenario } from "./utils/simulation";
import { computeNeedScore } from "./utils/scoring";

import TransitMap from "./components/TransitMap";
import Sidebar from "./components/Sidebar";
import AnalysisView from "./components/AnalysisView";
import RouteSuggestionCarousel from "./components/RouteSuggestionCarousel";

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
    candidates: {
        rank: number;
        path_lat_lng: [number, number][];
        candidate_score: number;
        reason: string;
    }[];
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
    const [isDrawing, setIsDrawing] = useState(false);
    const [drawingWaypoints, setDrawingWaypoints] = useState<
        [number, number][]
    >([]);
    const [drawingPath, setDrawingPath] = useState<[number, number][]>([]);
    const [isRouting, setIsRouting] = useState(false);
    const [scenarioMode, setScenarioMode] = useState<ScenarioMode>("subway");
    const [stationSpacing, setStationSpacing] = useState(800);
    const [mapCenter, setMapCenter] = useState<[number, number]>([43.7, -79.4]);
    const [mapZoom, setMapZoom] = useState(11);

    // Hotspot clusters
    const [hotspots, setHotspots] = useState<HotspotCluster[]>([]);

    // AI Analysis state
    const [analysisResults, setAnalysisResults] = useState<Record<string, FullAnalysisResponse>>({});
    const [analyzingScenarioId, setAnalyzingScenarioId] = useState<string | null>(null);

    // Full simulation state (dedicated analysis page)
    const [simulationPhase, setSimulationPhase] = useState<SimulationPhase>("idle");
    const [simulationResult, setSimulationResult] = useState<FullSimulationResponse | null>(null);
    const [simulationCandidates, setSimulationCandidates] = useState<SimulationCandidate[]>([]);
    const [candidateProgress, setCandidateProgress] = useState(0);
    const [showAnalysisView, setShowAnalysisView] = useState(false);
    const [analysisScenarioId, setAnalysisScenarioId] = useState<string | null>(null);
    const [carouselIndex, setCarouselIndex] = useState(0);

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
            let scenarioPath: [number, number][] = [...drawingPath];

            if (scenarioMode === "subway" && drawingWaypoints.length >= 2) {
                setIsRouting(true);
                try {
                    const response = await fetch(
                        "/api/py/transit/route/candidates",
                        {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                waypoints_lat_lng: drawingWaypoints,
                                max_candidates: 5,
                                buffer_km: 1.0,
                                search_km: 3.0,
                            }),
                        },
                    );

                    if (response.ok) {
                        const payload: RouteCandidateResponse =
                            await response.json();
                        const bestCandidate = payload.candidates?.[0];
                        if (
                            bestCandidate &&
                            bestCandidate.path_lat_lng.length >= 2
                        ) {
                            scenarioPath = bestCandidate.path_lat_lng;
                        }
                    }
                } catch (error) {
                    console.error(
                        "Failed to fetch backend subway candidates:",
                        error,
                    );
                } finally {
                    setIsRouting(false);
                }
            }

            const result = calculateScenario(
                scenarioPath,
                scenarioMode,
                stationSpacing,
                zones,
                transitLines,
            );
            const newScenario: Scenario = {
                id: `scenario-${Date.now()}`,
                name: `Scenario ${scenarios.length + 1}`,
                mode: scenarioMode,
                path: [...scenarioPath],
                stationSpacing,
                result,
                createdAt: new Date(),
                visible: true,
            };

            setScenarios((prev) => [...prev, newScenario]);
            setDrawingWaypoints([]);
            setDrawingPath([]);
            setActiveTab("scenarios");
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

    const handleDeleteScenario = useCallback((id: string) => {
        setScenarios((prev) => prev.filter((s) => s.id !== id));
    }, []);

    const handleToggleScenario = useCallback((id: string) => {
        setScenarios((prev) =>
            prev.map((s) => (s.id === id ? { ...s, visible: !s.visible } : s)),
        );
    }, []);

    const handleAnalyzeScenario = useCallback(
        async (id: string) => {
            const scenario = scenarios.find((s) => s.id === id);
            if (!scenario || scenario.path.length < 2) return;

            // Open the analysis view and start simulation
            setAnalysisScenarioId(id);
            setShowAnalysisView(true);
            setSimulationPhase("simulating");
            setSimulationResult(null);
            setSimulationCandidates([]);
            setCandidateProgress(0);
            setCarouselIndex(0);
            setAnalyzingScenarioId(id);

            try {
                // ── Phase 1: Fetch route candidates quickly and animate them on the map ──
                let candidateRoutes: SimulationCandidate[] = [];
                try {
                    const candidatesRes = await fetch("/api/py/transit/route/candidates", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            waypoints_lat_lng: scenario.path,
                            max_candidates: 6,
                            buffer_km: 1.0,
                            search_km: 3.0,
                        }),
                    });
                    if (candidatesRes.ok) {
                        const candidatesData: RouteCandidateResponse = await candidatesRes.json();
                        candidateRoutes = (candidatesData.candidates || []).map((c, i) => ({
                            rank: c.rank,
                            path_lat_lng: c.path_lat_lng,
                            candidate_score: c.candidate_score,
                            reason: c.reason,
                            name: `Route Candidate ${i + 1}`,
                            description: c.reason,
                            neighbourhoods: [],
                            pareto_front: i < 3,
                        }));
                    }
                } catch (e) {
                    console.warn("Route candidates fetch failed, continuing with full sim:", e);
                }

                // Animate candidates appearing on map one by one
                if (candidateRoutes.length > 0) {
                    setSimulationCandidates(candidateRoutes);
                    for (let i = 1; i <= candidateRoutes.length; i++) {
                        await new Promise((resolve) => setTimeout(resolve, 800));
                        setCandidateProgress(i);
                    }
                    // Brief pause to let user see all routes
                    await new Promise((resolve) => setTimeout(resolve, 600));
                }

                // ── Phase 2: Run full analysis (mode comparison, sensitivity, AI) ──
                setSimulationPhase("analyzing");

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 90000);

                const response = await fetch("/api/py/simulation/full", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        path_lat_lng: scenario.path,
                        station_spacing_m: scenario.stationSpacing,
                        buffer_km: 0.8,
                        search_km: 3.0,
                        max_candidates: 6,
                        user_question: `Analyze this ${scenario.mode} corridor and recommend the best transit mode. Explain tradeoffs between cost, ridership, and timeline.`,
                    }),
                    signal: controller.signal,
                });
                clearTimeout(timeoutId);

                if (response.ok) {
                    const data: FullSimulationResponse = await response.json();

                    // Update candidates with Pareto-ranked versions from full analysis
                    if (data.candidates && data.candidates.length > 0) {
                        setSimulationCandidates(data.candidates);
                        setCandidateProgress(data.candidates.length);
                    }

                    setSimulationResult(data);
                    setSimulationPhase("complete");

                    setAnalysisResults((prev) => ({
                        ...prev,
                        [id]: {
                            comparison: data.comparison,
                            sensitivity: data.sensitivity,
                            briefing: data.briefing,
                            ai_analysis: data.ai_analysis,
                        },
                    }));
                } else {
                    // Fallback to the simpler analyze endpoint
                    const fallbackResponse = await fetch("/api/py/simulation/analyze", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            path_lat_lng: scenario.path,
                            station_spacing_m: scenario.stationSpacing,
                            buffer_km: 0.8,
                            user_question: "",
                        }),
                    });
                    if (fallbackResponse.ok) {
                        const data: FullAnalysisResponse = await fallbackResponse.json();
                        setSimulationResult({
                            candidates: candidateRoutes,
                            best_candidate_index: 0,
                            comparison: data.comparison,
                            sensitivity: data.sensitivity,
                            briefing: data.briefing,
                            ai_analysis: data.ai_analysis,
                        });
                        setSimulationPhase("complete");
                        setAnalysisResults((prev) => ({ ...prev, [id]: data }));
                    }
                }
            } catch (error) {
                console.error("Failed to run full simulation:", error);
                setSimulationPhase("idle");
                setShowAnalysisView(false);
            } finally {
                setAnalyzingScenarioId(null);
            }
        },
        [scenarios],
    );

    const handleCloseAnalysis = useCallback(() => {
        setShowAnalysisView(false);
        setSimulationPhase("idle");
        setSimulationCandidates([]);
        setCandidateProgress(0);
        setCarouselIndex(0);
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
                onScenarioModeChange={setScenarioMode}
                stationSpacing={stationSpacing}
                onStationSpacingChange={setStationSpacing}
                onDeleteScenario={handleDeleteScenario}
                onToggleScenario={handleToggleScenario}
                onAnalyzeScenario={handleAnalyzeScenario}
                analysisResults={analysisResults}
                analyzingScenarioId={analyzingScenarioId}
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
                    simulationCandidates={simulationCandidates}
                    simulationPhase={simulationPhase}
                    candidateProgress={candidateProgress}
                    highlightedCandidateIndex={carouselIndex}
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

                {/* Route Suggestion Carousel (shown during all simulation phases) */}
                {showAnalysisView && simulationCandidates.length > 0 &&
                  simulationPhase !== "idle" && (
                    <RouteSuggestionCarousel
                        candidates={simulationCandidates}
                        currentIndex={carouselIndex}
                        onIndexChange={setCarouselIndex}
                        onSelect={() => {
                            // User picked a route — let the full analysis continue running
                            // The AnalysisView will show results when phase becomes "complete"
                        }}
                        onCancel={handleCloseAnalysis}
                    />
                )}

                {/* Analysis View Overlay */}
                {showAnalysisView && analysisScenarioId && (() => {
                    const scenario = scenarios.find((s) => s.id === analysisScenarioId);
                    if (!scenario) return null;
                    return (
                        <AnalysisView
                            scenario={scenario}
                            simulation={simulationResult}
                            phase={simulationPhase}
                            candidateProgress={candidateProgress}
                            onClose={handleCloseAnalysis}
                        />
                    );
                })()}
            </div>
        </main>
    );
}
