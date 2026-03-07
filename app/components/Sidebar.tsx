"use client";

import { Zone, TransitLine, Scenario, ScenarioMode, LayerVisibility, HotspotCluster } from "../types";
import ExplorePanel from "./ExplorePanel";
import HotspotPanel from "./HotspotPanel";
import ScenarioPanel from "./ScenarioPanel";
import TransitLinePanel from "./TransitLinePanel";
import {
  Map,
  AlertTriangle,
  Route,
  Layers,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";

interface SidebarProps {
  zones: Zone[];
  selectedZone: Zone | null;
  selectedLine: TransitLine | null;
  activeTab: "explore" | "hotspots" | "scenarios";
  onTabChange: (tab: "explore" | "hotspots" | "scenarios") => void;
  hotspots: HotspotCluster[];
  scenarios: Scenario[];
  onZoneClick: (zone: Zone) => void;
  onZoomToZone: (zone: Zone) => void;
  onStartDrawing: () => void;
  onFinishDrawing: () => void;
  onCancelDrawing: () => void;
  isDrawing: boolean;
  drawingPath: [number, number][];
  scenarioMode: ScenarioMode;
  onScenarioModeChange: (mode: ScenarioMode) => void;
  stationSpacing: number;
  onStationSpacingChange: (spacing: number) => void;
  onDeleteScenario: (id: string) => void;
  onToggleScenario: (id: string) => void;
  layers: LayerVisibility;
  onToggleLayer: (layer: keyof LayerVisibility) => void;
}

const TAB_CONFIG = [
  { key: "explore" as const, label: "Explore", icon: Map },
  { key: "hotspots" as const, label: "Hotspots", icon: AlertTriangle },
  { key: "scenarios" as const, label: "Scenarios", icon: Route },
];

export default function Sidebar({
  zones,
  selectedZone,
  selectedLine,
  activeTab,
  onTabChange,
  hotspots,
  scenarios,
  onZoneClick,
  onZoomToZone,
  onStartDrawing,
  onFinishDrawing,
  onCancelDrawing,
  isDrawing,
  drawingPath,
  scenarioMode,
  onScenarioModeChange,
  stationSpacing,
  onStationSpacingChange,
  onDeleteScenario,
  onToggleScenario,
  layers,
  onToggleLayer,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <div className="relative z-[1000] flex flex-col items-center py-4 gap-3 bg-[var(--glass-bg)] backdrop-blur-xl border-r border-[var(--glass-border)]"
        style={{ width: 48 }}>
        <button
          onClick={() => setCollapsed(false)}
          className="p-2 rounded-lg hover:bg-[var(--color-bg-card)] transition"
          title="Expand sidebar"
        >
          <ChevronRight size={18} className="text-[var(--color-text-secondary)]" />
        </button>
        {TAB_CONFIG.map(({ key, icon: Icon }) => (
          <button
            key={key}
            onClick={() => {
              setCollapsed(false);
              onTabChange(key);
            }}
            className={`p-2 rounded-lg transition ${
              activeTab === key
                ? "text-[var(--color-accent-cyan)] bg-[rgba(6,182,212,0.1)]"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
            }`}
            title={key}
          >
            <Icon size={18} />
          </button>
        ))}
      </div>
    );
  }

  return (
    <div
      className="relative z-[1000] flex flex-col bg-[var(--glass-bg)] backdrop-blur-xl border-r border-[var(--glass-border)] animate-slide-in"
      style={{ width: 380, maxWidth: "100vw" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--color-accent-cyan)] to-[var(--color-accent-blue)] flex items-center justify-center">
            <Map size={16} className="text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-[var(--color-text-primary)] tracking-tight">
              TransitLens
            </h1>
            <p className="text-[10px] text-[var(--color-text-muted)]">
              Toronto Transit Planner
            </p>
          </div>
        </div>
        <button
          onClick={() => setCollapsed(true)}
          className="p-1.5 rounded-lg hover:bg-[var(--color-bg-card)] transition"
          title="Collapse sidebar"
        >
          <ChevronLeft size={16} className="text-[var(--color-text-secondary)]" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--color-border)]">
        {TAB_CONFIG.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => onTabChange(key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition ${
              activeTab === key ? "tab-active" : "tab-inactive"
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Layer Controls */}
      <div className="px-4 py-2 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-1.5 mb-1.5">
          <Layers size={12} className="text-[var(--color-text-muted)]" />
          <span className="text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wider">
            Map Layers
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[
            { key: "needScore" as const, label: "Population Density" },
            { key: "subwayLines" as const, label: "Subways" },
            { key: "lrtLines" as const, label: "LRTs" },
            { key: "busLines" as const, label: "Buses" },
            { key: "trafficHotspots" as const, label: "Hotspots" },
            { key: "zoneLabels" as const, label: "Labels" },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => onToggleLayer(key)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition ${
                layers[key]
                  ? "bg-[rgba(6,182,212,0.15)] text-[var(--color-accent-cyan)] border border-[rgba(6,182,212,0.3)]"
                  : "bg-transparent text-[var(--color-text-muted)] border border-[var(--color-border)] hover:border-[var(--color-border-hover)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Panel Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "explore" && (
          <>
            {!selectedZone && !selectedLine && (
              <div className="p-8 text-center text-sm text-[var(--color-text-muted)] animate-fade-in flex flex-col items-center gap-4">
                <Map size={32} className="text-[var(--color-border-hover)] opacity-50" />
                <p>Click on a <strong className="text-[var(--color-text-secondary)]">Zone</strong> or an existing <strong className="text-[var(--color-text-secondary)]">Transit Line</strong> on the map to explore detailed insights and demographics.</p>
              </div>
            )}
            {selectedZone && !selectedLine && (
              <ExplorePanel
                zones={zones}
                selectedZone={selectedZone}
                onZoneClick={onZoneClick}
              />
            )}
            {selectedLine && (
              <TransitLinePanel
                line={selectedLine}
                zones={zones}
              />
            )}
          </>
        )}
        {activeTab === "hotspots" && (
          <HotspotPanel
            hotspots={hotspots}
            zones={zones}
            onZoomToZone={onZoomToZone}
          />
        )}
        {activeTab === "scenarios" && (
          <ScenarioPanel
            scenarios={scenarios}
            onStartDrawing={onStartDrawing}
            onFinishDrawing={onFinishDrawing}
            onCancelDrawing={onCancelDrawing}
            isDrawing={isDrawing}
            drawingPath={drawingPath}
            scenarioMode={scenarioMode}
            onScenarioModeChange={onScenarioModeChange}
            stationSpacing={stationSpacing}
            onStationSpacingChange={onStationSpacingChange}
            onDeleteScenario={onDeleteScenario}
            onToggleScenario={onToggleScenario}
          />
        )}
      </div>

      {/* Data Attribution */}
      <div className="px-4 py-2 border-t border-[var(--color-border)]">
        <p className="text-[9px] text-[var(--color-text-muted)] leading-relaxed">
          Data: City of Toronto Open Data • TTC GTFS & Ridership • 2021 Census •
          Screening-level estimates only
        </p>
      </div>
    </div>
  );
}
