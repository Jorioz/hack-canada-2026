"use client";

import { Scenario, ScenarioMode } from "../types";
import {
  Plus,
  Pencil,
  Trash2,
  TrainFront,
  TramFront,
  Bus,
  DollarSign,
  Users,
  Car,
  Clock,
  Ruler,
  MapPin,
  BarChart3,
  Eye,
  EyeOff,
} from "lucide-react";

import { SCENARIO_MODE_COLORS } from "../types";

interface ScenarioPanelProps {
  scenarios: Scenario[];
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
}

const MODE_OPTIONS: {
  value: ScenarioMode;
  label: string;
  icon: typeof TrainFront;
  description: string;
}[] = [
  {
    value: "subway",
    label: "Subway",
    icon: TrainFront,
    description: "Underground metro (highest capacity, highest cost)",
  },
  {
    value: "surface_lrt",
    label: "Surface LRT",
    icon: TramFront,
    description: "Light rail on dedicated lanes (medium capacity)",
  },
  {
    value: "enhanced_bus",
    label: "Enhanced Bus",
    icon: Bus,
    description: "Bus rapid transit with priority lanes (lowest cost)",
  },
];

function formatCost(millions: number): string {
  if (millions >= 1000) return `$${(millions / 1000).toFixed(1)}B`;
  return `$${millions.toFixed(0)}M`;
}

function formatRevenue(amount: number): string {
  if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(0)}M`;
  return `$${(amount / 1_000).toFixed(0)}K`;
}

export default function ScenarioPanel({
  scenarios,
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
}: ScenarioPanelProps) {
  return (
    <div className="p-4 space-y-4 animate-fade-up">
      {/* Header */}
      <div>
        <h2 className="text-sm font-bold text-[var(--color-text-primary)]">
          Transit Scenario Builder
        </h2>
        <p className="text-[11px] text-[var(--color-text-muted)] mt-1">
          Draw proposed transit lines on the map and get instant cost, ridership, and
          impact estimates.
        </p>
      </div>

      {/* Mode Selection */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium mb-2">
          Transit Mode
        </p>
        <div className="space-y-1.5">
          {MODE_OPTIONS.map(({ value, label, icon: Icon, description }) => (
            <button
              key={value}
              onClick={() => onScenarioModeChange(value)}
              className={`mode-btn w-full text-left ${
                scenarioMode === value ? "active" : ""
              }`}
            >
              <Icon size={16} />
              <div className="flex-1">
                <span className="text-xs font-medium">{label}</span>
                <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                  {description}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Station Spacing Slider */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium">
            Station Spacing
          </p>
          <span className="text-xs font-medium text-[var(--color-accent-cyan)]">
            {stationSpacing}m
          </span>
        </div>
        <input
          type="range"
          min={400}
          max={1200}
          step={100}
          value={stationSpacing}
          onChange={(e) => onStationSpacingChange(Number(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
          style={{
            background: `linear-gradient(to right, var(--color-accent-cyan) 0%, var(--color-accent-cyan) ${
              ((stationSpacing - 400) / 800) * 100
            }%, rgba(255,255,255,0.1) ${
              ((stationSpacing - 400) / 800) * 100
            }%, rgba(255,255,255,0.1) 100%)`,
          }}
        />
        <div className="flex justify-between mt-1">
          <span className="text-[9px] text-[var(--color-text-muted)]">400m</span>
          <span className="text-[9px] text-[var(--color-text-muted)]">1200m</span>
        </div>
      </div>

      {/* Draw Button */}
      {!isDrawing ? (
        <button
          onClick={onStartDrawing}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-gradient-to-r from-[var(--color-accent-cyan)] to-[var(--color-accent-blue)] text-white font-medium text-sm hover:brightness-110 transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <Plus size={16} />
          Draw New Transit Line
        </button>
      ) : (
        <div className="glass-card p-3 space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs font-medium text-[var(--color-text-primary)]">
              Drawing Mode Active
            </span>
          </div>
          <p className="text-[10px] text-[var(--color-text-muted)]">
            Click on the map to place waypoints. Min. 2 points required.
          </p>
          <p className="text-[10px] text-[var(--color-accent-cyan)]">
            {drawingPath.length} point{drawingPath.length !== 1 ? "s" : ""} placed
          </p>
          <div className="flex gap-2">
            <button
              onClick={onFinishDrawing}
              disabled={drawingPath.length < 2}
              className="flex-1 py-2 rounded-md text-xs font-medium bg-[var(--color-accent-green)] text-white disabled:opacity-30 disabled:cursor-not-allowed hover:brightness-110 transition"
            >
              Finish Line
            </button>
            <button
              onClick={onCancelDrawing}
              className="py-2 px-3 rounded-md text-xs font-medium bg-[rgba(239,68,68,0.15)] text-[var(--color-accent-red)] hover:bg-[rgba(239,68,68,0.25)] transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Saved Scenarios */}
      {scenarios.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium mb-2">
            Saved Scenarios ({scenarios.length})
          </p>
          <div className="space-y-3">
            {scenarios.map((scenario) => (
              <div key={scenario.id} className="glass-card p-3 space-y-3">
                {/* Scenario Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {scenario.mode === "subway" && (
                      <TrainFront size={14} color={SCENARIO_MODE_COLORS.subway} />
                    )}
                    {scenario.mode === "surface_lrt" && (
                      <TramFront size={14} color={SCENARIO_MODE_COLORS.surface_lrt} />
                    )}
                    {scenario.mode === "enhanced_bus" && (
                      <Bus size={14} color={SCENARIO_MODE_COLORS.enhanced_bus} />
                    )}
                    <span
                      className={`text-xs font-semibold ${
                        scenario.visible ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-muted)] line-through"
                      }`}
                    >
                      {scenario.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onToggleScenario(scenario.id)}
                      className="p-1 rounded hover:bg-[rgba(6,182,212,0.15)] transition"
                      title={scenario.visible ? "Hide scenario" : "Show scenario"}
                    >
                      {scenario.visible ? (
                        <Eye size={12} className="text-[var(--color-accent-cyan)]" />
                      ) : (
                        <EyeOff size={12} className="text-[var(--color-text-muted)]" />
                      )}
                    </button>
                    <button
                      onClick={() => onDeleteScenario(scenario.id)}
                      className="p-1 rounded hover:bg-[rgba(239,68,68,0.15)] transition"
                      title="Delete scenario"
                    >
                      <Trash2
                        size={12}
                        className="text-[var(--color-text-muted)] hover:text-[var(--color-accent-red)]"
                      />
                    </button>
                  </div>
                </div>

                {/* Results (Dimmed if hidden) */}
                {scenario.result && (
                  <div className={scenario.visible ? "" : "opacity-40 grayscale pointer-events-none"}>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="stat-card">
                        <div className="flex items-center gap-1 mb-0.5">
                          <DollarSign size={10} className="text-[var(--color-accent-amber)]" />
                          <span className="stat-label">Est. Cost</span>
                        </div>
                        <p className="text-sm font-bold text-[var(--color-accent-amber)]">
                          {formatCost(scenario.result.costLow)}–{formatCost(scenario.result.costHigh)}
                        </p>
                      </div>
                      <div className="stat-card">
                        <div className="flex items-center gap-1 mb-0.5">
                          <Users size={10} className="text-[var(--color-accent-cyan)]" />
                          <span className="stat-label">Daily Riders</span>
                        </div>
                        <p className="text-sm font-bold text-[var(--color-accent-cyan)]">
                          {scenario.result.dailyRidersLow.toLocaleString()}–
                          {scenario.result.dailyRidersHigh.toLocaleString()}
                        </p>
                      </div>
                      <div className="stat-card">
                        <div className="flex items-center gap-1 mb-0.5">
                          <Car size={10} className="text-[var(--color-accent-green)]" />
                          <span className="stat-label">Cars Removed</span>
                        </div>
                        <p className="text-sm font-bold text-[var(--color-accent-green)]">
                          {scenario.result.carTripsRemovedLow.toLocaleString()}–
                          {scenario.result.carTripsRemovedHigh.toLocaleString()}
                          <span className="text-[10px] font-normal text-[var(--color-text-muted)]">
                            /day
                          </span>
                        </p>
                      </div>
                      <div className="stat-card">
                        <div className="flex items-center gap-1 mb-0.5">
                          <BarChart3 size={10} className="text-[var(--color-accent-blue)]" />
                          <span className="stat-label">Annual Revenue</span>
                        </div>
                        <p className="text-sm font-bold text-[var(--color-accent-blue)]">
                          {formatRevenue(scenario.result.annualFareRevenue)}
                        </p>
                      </div>
                    </div>

                    {/* Additional Stats */}
                    <div className="flex items-center gap-4 text-[10px] text-[var(--color-text-muted)] pt-1 border-t border-[var(--color-border)]">
                      <span className="flex items-center gap-1">
                        <Ruler size={10} />
                        {scenario.result.lineLengthKm} km
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin size={10} />
                        {scenario.result.numStations} stations
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={10} />
                        {scenario.result.timelineYearsLow}–
                        {scenario.result.timelineYearsHigh} yrs
                      </span>
                    </div>

                    {/* Served area */}
                    <div className="text-[10px] text-[var(--color-text-muted)]">
                      Serves ~{scenario.result.populationServed.toLocaleString()} residents
                      and ~{scenario.result.jobsServed.toLocaleString()} jobs within 800m
                    </div>

                    {/* Disclaimer */}
                    <p className="text-[9px] text-[var(--color-text-muted)] italic">
                      ⚠️ Screening-level estimates only. Based on benchmark costs from
                      real Toronto projects and simplified capture rate assumptions.
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Instructions */}
      {scenarios.length === 0 && !isDrawing && (
        <div className="glass-card p-3">
          <p className="text-[10px] text-[var(--color-text-muted)] leading-relaxed">
            🚇 <strong className="text-[var(--color-text-secondary)]">How it works:</strong>{" "}
            Select a transit mode, adjust station spacing, then click {'"'}Draw New Transit
            Line{'"'}. Click on the map to place waypoints for your route. When done, click
            Finish to see instant cost and ridership estimates.
          </p>
        </div>
      )}
    </div>
  );
}
