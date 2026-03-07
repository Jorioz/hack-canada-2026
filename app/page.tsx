"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Zone, TransitLine, Scenario, ScenarioMode, LayerVisibility, HotspotCluster } from "./types";
import { MOCK_ZONES, MOCK_TRANSIT_LINES } from "./data/mockData";
import { computeNeedScore } from "./utils/scoring";
import { calculateScenario } from "./utils/simulation";
import { DEFAULT_WEIGHTS } from "./types";

import TransitMap from "./components/TransitMap";
import Sidebar from "./components/Sidebar";

export default function Home() {
  // Compute Need Scores for all zones
  const [zones, setZones] = useState<Zone[]>([]);
  const [selectedZone, setSelectedZone] = useState<Zone | null>(null);
  const [selectedLine, setSelectedLine] = useState<TransitLine | null>(null);
  const [activeTab, setActiveTab] = useState<"explore" | "hotspots" | "scenarios">("explore");
  const [layers, setLayers] = useState<LayerVisibility>({
    needScore: true,
    transitLines: true,
    trafficHotspots: true,
    zoneLabels: false,
  });

  // Scenario state
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingWaypoints, setDrawingWaypoints] = useState<[number, number][]>([]);
  const [drawingPath, setDrawingPath] = useState<[number, number][]>([]);
  const [isRouting, setIsRouting] = useState(false);
  const [scenarioMode, setScenarioMode] = useState<ScenarioMode>("subway");
  const [stationSpacing, setStationSpacing] = useState(800);
  const [mapCenter, setMapCenter] = useState<[number, number]>([43.7, -79.4]);
  const [mapZoom, setMapZoom] = useState(11);

  // Hotspot clusters
  const [hotspots, setHotspots] = useState<HotspotCluster[]>([]);

  // Compute scores on mount
  useEffect(() => {
    const scored = MOCK_ZONES.map((zone) => ({
      ...zone,
      needScore: computeNeedScore(zone, MOCK_ZONES, DEFAULT_WEIGHTS),
    }));
    setZones(scored);

    // Compute hotspot clusters (simple: top 8 zones by score)
    const sorted = [...scored].sort((a, b) => b.needScore - a.needScore);
    const topZones = sorted.slice(0, 8);
    const clusters: HotspotCluster[] = topZones.map((zone, i) => ({
      id: `cluster-${i}`,
      label: `Hotspot ${String.fromCharCode(65 + i)}`,
      zones: [zone],
      avgScore: zone.needScore,
      center: zone.center,
    }));
    setHotspots(clusters);
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
            const { getRouteSegment } = await import("./utils/routing");
            const prevPoint = newWaypoints[newWaypoints.length - 2];
            const segment = await getRouteSegment(prevPoint, latlng);
            // Append segment (skip first point to avoid duplicates)
            setDrawingPath((prev) => [...prev, ...segment.slice(prev.length > 0 ? 1 : 0)]);
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
    [isDrawing, isRouting, drawingWaypoints, scenarioMode]
  );

  const handleStartDrawing = useCallback(() => {
    setIsDrawing(true);
    setDrawingWaypoints([]);
    setDrawingPath([]);
  }, []);

  const handleFinishDrawing = useCallback(() => {
    if (drawingPath.length < 2) return;
    setIsDrawing(false);

    const result = calculateScenario(drawingPath, scenarioMode, stationSpacing, zones, MOCK_TRANSIT_LINES);
    const newScenario: Scenario = {
      id: `scenario-${Date.now()}`,
      name: `Scenario ${scenarios.length + 1}`,
      mode: scenarioMode,
      path: [...drawingPath],
      stationSpacing,
      result,
      createdAt: new Date(),
      visible: true,
    };

    setScenarios((prev) => [...prev, newScenario]);
    setDrawingWaypoints([]);
    setDrawingPath([]);
    setActiveTab("scenarios");
  }, [drawingPath, scenarioMode, stationSpacing, zones, scenarios.length]);

  const handleCancelDrawing = useCallback(() => {
    setIsDrawing(false);
    setDrawingWaypoints([]);
    setDrawingPath([]);
  }, []);

  const handleDeleteScenario = useCallback((id: string) => {
    setScenarios((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const handleToggleScenario = useCallback((id: string) => {
    setScenarios((prev) =>
      prev.map((s) => (s.id === id ? { ...s, visible: !s.visible } : s))
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
        layers={layers}
        onToggleLayer={toggleLayer}
      />

      {/* Map */}
      <div className="flex-1 relative">
        <TransitMap
          zones={zones}
          transitLines={MOCK_TRANSIT_LINES}
          selectedZone={selectedZone}
          selectedLine={selectedLine}
          onZoneClick={handleZoneClick}
          onLineClick={handleLineClick}
          onMapClick={handleMapClick}
          layers={layers}
          isDrawing={isDrawing}
          drawingPath={drawingPath}
          drawingWaypoints={drawingWaypoints}
          scenarios={scenarios}
          hotspots={hotspots}
          center={mapCenter}
          zoom={mapZoom}
        />

        {/* Drawing Mode Overlay */}
        {isDrawing && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] glass-panel px-6 py-3 flex items-center gap-4 animate-fade-up">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-sm font-medium text-[var(--color-text-primary)]">
              Click on the map to draw your transit line
            </span>
            <span className="text-xs text-[var(--color-text-muted)]">
              {drawingWaypoints.length} waypoint{drawingWaypoints.length !== 1 ? "s" : ""}
            </span>
            {isRouting && (
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 border-2 border-[var(--color-accent-cyan)] border-t-transparent rounded-full animate-spin" />
                <span className="text-[10px] text-[var(--color-accent-cyan)]">Routing...</span>
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
      </div>
    </main>
  );
}
