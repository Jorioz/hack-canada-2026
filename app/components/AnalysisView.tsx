"use client";

import { useEffect, useState, useMemo } from "react";
import {
  FullSimulationResponse,
  SimulationCandidate,
  SimulationPhase,
  ModeScenarioResult,
  Scenario,
  SCENARIO_MODE_COLORS,
} from "../types";
import {
  X,
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
  Brain,
  Sparkles,
  TrendingUp,
  CheckCircle2,
  ArrowRight,
  Zap,
  Shield,
  Target,
  ChevronDown,
  ChevronUp,
  Activity,
} from "lucide-react";

interface AnalysisViewProps {
  scenario: Scenario;
  simulation: FullSimulationResponse | null;
  phase: SimulationPhase;
  candidateProgress: number; // 0 to candidates.length — how many shown so far
  onClose: () => void;
}

function formatCost(millions: number): string {
  if (millions >= 1000) return `$${(millions / 1000).toFixed(1)}B`;
  return `$${millions.toFixed(0)}M`;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

const MODE_ICONS: Record<string, typeof TrainFront> = {
  subway: TrainFront,
  surface_lrt: TramFront,
  enhanced_bus: Bus,
};

const MODE_LABELS: Record<string, string> = {
  subway: "Subway",
  surface_lrt: "Surface LRT",
  enhanced_bus: "Enhanced Bus",
};

const MODE_COLORS: Record<string, string> = {
  subway: "#c6da14",
  surface_lrt: "#a855f7",
  enhanced_bus: "#3b82f6",
};

const SENSITIVITY_ICONS: Record<string, typeof Target> = {
  balanced: Target,
  equity_first: Shield,
  ridership_first: Users,
  congestion_first: Car,
};

const SENSITIVITY_COLORS: Record<string, string> = {
  balanced: "#06b6d4",
  equity_first: "#22c55e",
  ridership_first: "#f59e0b",
  congestion_first: "#ef4444",
};

export default function AnalysisView({
  scenario,
  simulation,
  phase,
  candidateProgress,
  onClose,
}: AnalysisViewProps) {
  const [expandedAI, setExpandedAI] = useState(false);
  const [activeMode, setActiveMode] = useState<string | null>(null);

  const modeColor = SCENARIO_MODE_COLORS[scenario.mode] || "#3b82f6";

  // Find best mode (lowest cost_per_rider)
  const bestMode = useMemo(() => {
    if (!simulation?.comparison?.modes) return null;
    const modes = simulation.comparison.modes;
    let best: string | null = null;
    let bestVal = Infinity;
    for (const [key, m] of Object.entries(modes)) {
      if (m.cost_per_rider < bestVal) {
        bestVal = m.cost_per_rider;
        best = key;
      }
    }
    return best;
  }, [simulation]);

  // During simulating/analyzing phases, the carousel on the map handles the UI
  if (phase === "simulating" || phase === "analyzing") {
    return null;
  }

  // No data yet
  if (!simulation) return null;

  const { comparison, sensitivity, ai_analysis, candidates } = simulation;
  const corridor = comparison.corridor;
  const modes = comparison.modes;

  return (
    <div className="analysis-overlay">
      {/* Header */}
      <div className="analysis-header">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: `${modeColor}20`, border: `1px solid ${modeColor}40` }}
          >
            {scenario.mode === "subway" && <TrainFront size={20} color={modeColor} />}
            {scenario.mode === "surface_lrt" && <TramFront size={20} color={modeColor} />}
            {scenario.mode === "enhanced_bus" && <Bus size={20} color={modeColor} />}
          </div>
          <div>
            <h2 className="text-lg font-bold text-[var(--color-text-primary)]">
              {scenario.name} — Full Analysis
            </h2>
            <p className="text-xs text-[var(--color-text-muted)]">
              {candidates.length} routes evaluated · {corridor.covered_neighbourhoods.length} neighbourhoods covered
            </p>
          </div>
        </div>
        <button onClick={onClose} className="analysis-close-btn">
          <X size={18} />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="analysis-content">
        {/* ==================== SECTION: Corridor Overview ==================== */}
        <section className="analysis-section">
          <h3 className="analysis-section-title">
            <MapPin size={14} className="text-cyan-400" />
            Corridor Overview
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="analysis-stat-card">
              <Ruler size={16} className="text-cyan-400" />
              <div className="analysis-stat-value text-cyan-400">{corridor.length_km.toFixed(1)}</div>
              <div className="analysis-stat-label">KM LENGTH</div>
            </div>
            <div className="analysis-stat-card">
              <Users size={16} className="text-green-400" />
              <div className="analysis-stat-value text-green-400">{formatNumber(corridor.population_served)}</div>
              <div className="analysis-stat-label">POP. SERVED</div>
            </div>
            <div className="analysis-stat-card">
              <BarChart3 size={16} className="text-amber-400" />
              <div className="analysis-stat-value text-amber-400">{formatNumber(corridor.jobs_served)}</div>
              <div className="analysis-stat-label">JOBS SERVED</div>
            </div>
            <div className="analysis-stat-card">
              <Car size={16} className="text-red-400" />
              <div className="analysis-stat-value text-red-400">{formatNumber(corridor.traffic_served)}</div>
              <div className="analysis-stat-label">TRAFFIC VOL.</div>
            </div>
          </div>
        </section>

        {/* ==================== SECTION: Route Candidates ==================== */}
        <section className="analysis-section">
          <h3 className="analysis-section-title">
            <Activity size={14} className="text-purple-400" />
            Route Candidates ({candidates.length} evaluated)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {candidates.map((c, i) => (
              <div
                key={i}
                className={`rounded-lg p-3 border transition-all ${
                  i === 0
                    ? "border-cyan-500/40 bg-cyan-500/5"
                    : "border-[var(--color-border)] bg-[rgba(0,0,0,0.2)]"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        i === 0
                          ? "bg-cyan-500/20 text-cyan-400"
                          : "bg-[rgba(255,255,255,0.05)] text-[var(--color-text-muted)]"
                      }`}
                    >
                      #{c.rank}
                    </span>
                    {i === 0 && (
                      <span className="text-[9px] font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1">
                        <CheckCircle2 size={10} /> Best
                      </span>
                    )}
                    {c.pareto_front && i !== 0 && (
                      <span className="text-[9px] font-medium text-purple-400 uppercase tracking-wider">
                        Pareto
                      </span>
                    )}
                  </div>
                  <span className="text-lg font-black text-[var(--color-text-primary)]">
                    {c.candidate_score.toFixed(1)}
                  </span>
                </div>
                <p className="text-[10px] text-[var(--color-text-muted)] leading-relaxed">{c.reason}</p>
                <div className="flex gap-3 mt-2 text-[10px] text-[var(--color-text-muted)]">
                  {c.num_neighbourhoods != null && (
                    <span>{c.num_neighbourhoods} areas</span>
                  )}
                  {c.avg_benefit != null && (
                    <span>score {c.avg_benefit.toFixed(1)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ==================== SECTION: Mode Comparison ==================== */}
        <section className="analysis-section">
          <h3 className="analysis-section-title">
            <Brain size={14} className="text-purple-400" />
            Mode Comparison
          </h3>

          {/* Mode cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {(["subway", "surface_lrt", "enhanced_bus"] as const).map((modeKey) => {
              const m = modes[modeKey];
              if (!m) return null;
              const Icon = MODE_ICONS[modeKey];
              const color = MODE_COLORS[modeKey];
              const isBest = modeKey === bestMode;
              const isActive = activeMode === modeKey;

              return (
                <button
                  key={modeKey}
                  onClick={() => setActiveMode(isActive ? null : modeKey)}
                  className={`relative rounded-xl p-4 text-left border transition-all hover:scale-[1.01] ${
                    isBest
                      ? "border-cyan-500/40 bg-cyan-500/5"
                      : "border-[var(--color-border)] bg-[rgba(0,0,0,0.2)]"
                  } ${isActive ? "ring-1 ring-purple-500/50" : ""}`}
                >
                  {isBest && (
                    <div className="absolute -top-2 right-3 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                      Recommended
                    </div>
                  )}

                  <div className="flex items-center gap-2 mb-3">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ background: `${color}20` }}
                    >
                      <Icon size={18} color={color} />
                    </div>
                    <span className="text-sm font-bold" style={{ color }}>
                      {MODE_LABELS[modeKey]}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-[var(--color-text-muted)]">Cost</span>
                      <span className="font-bold text-amber-400">
                        {formatCost(m.cost_low)}–{formatCost(m.cost_high)}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-[var(--color-text-muted)]">Riders/day</span>
                      <span className="font-bold text-cyan-400">
                        {formatNumber(m.daily_riders_low)}–{formatNumber(m.daily_riders_high)}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-[var(--color-text-muted)]">Cars removed</span>
                      <span className="font-bold text-green-400">
                        {formatNumber(m.car_trips_removed_high)}/day
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-[var(--color-text-muted)]">Timeline</span>
                      <span className="font-bold text-[var(--color-text-secondary)]">
                        {m.timeline_years_low}–{m.timeline_years_high} years
                      </span>
                    </div>

                    {/* Cost efficiency bar */}
                    <div className="pt-2 border-t border-[rgba(255,255,255,0.06)]">
                      <div className="flex justify-between text-[10px] mb-1">
                        <span className="text-[var(--color-text-muted)]">Cost per rider</span>
                        <span className="font-bold text-[var(--color-text-primary)]">
                          ${m.cost_per_rider.toLocaleString()}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-[rgba(255,255,255,0.05)] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.min(100, (1 - m.cost_per_rider / 200000) * 100)}%`,
                            background: `linear-gradient(to right, ${color}, ${color}88)`,
                          }}
                        />
                      </div>
                    </div>

                    <div className="flex justify-between text-[10px]">
                      <span className="text-[var(--color-text-muted)]">ROI payback</span>
                      <span className="font-bold text-[var(--color-text-primary)]">{m.roi_years} years</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Expanded comparison detail */}
          {activeMode && modes[activeMode] && (
            <div
              className="mt-3 rounded-lg p-4 border border-purple-500/20 animate-fade-up"
              style={{ background: "rgba(139,92,246,0.05)" }}
            >
              <h4 className="text-xs font-bold text-purple-400 mb-3 uppercase tracking-wider">
                {MODE_LABELS[activeMode]} — Detailed Metrics
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Stations", value: modes[activeMode]!.num_stations, icon: MapPin, color: "#06b6d4" },
                  { label: "Line Length", value: `${modes[activeMode]!.line_length_km.toFixed(1)} km`, icon: Ruler, color: "#3b82f6" },
                  { label: "Pop. Served", value: formatNumber(modes[activeMode]!.population_served), icon: Users, color: "#22c55e" },
                  { label: "Jobs Served", value: formatNumber(modes[activeMode]!.jobs_served), icon: BarChart3, color: "#f59e0b" },
                  { label: "Annual Revenue", value: formatNumber(modes[activeMode]!.annual_fare_revenue), icon: DollarSign, color: "#a855f7" },
                  { label: "Cars Removed Low", value: formatNumber(modes[activeMode]!.car_trips_removed_low), icon: Car, color: "#22c55e" },
                  { label: "Cars Removed High", value: formatNumber(modes[activeMode]!.car_trips_removed_high), icon: Car, color: "#16a34a" },
                  { label: "Timeline", value: `${modes[activeMode]!.timeline_years_low}-${modes[activeMode]!.timeline_years_high}yr`, icon: Clock, color: "#64748b" },
                ].map((item) => (
                  <div key={item.label} className="rounded-md p-2" style={{ background: "rgba(0,0,0,0.3)" }}>
                    <item.icon size={12} color={item.color} />
                    <div className="text-xs font-bold text-[var(--color-text-primary)] mt-1">{item.value}</div>
                    <div className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wider">{item.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ==================== SECTION: Sensitivity Analysis ==================== */}
        {sensitivity && Object.keys(sensitivity).length > 0 && (
          <section className="analysis-section">
            <h3 className="analysis-section-title">
              <Zap size={14} className="text-amber-400" />
              Sensitivity Analysis
            </h3>
            <p className="text-[11px] text-[var(--color-text-muted)] mb-3">
              How the corridor scores under different priority frameworks
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Object.entries(sensitivity).map(([preset, data]) => {
                const Icon = SENSITIVITY_ICONS[preset] || Target;
                const color = SENSITIVITY_COLORS[preset] || "#06b6d4";
                return (
                  <div
                    key={preset}
                    className="rounded-xl p-4 border border-[var(--color-border)] bg-[rgba(0,0,0,0.2)]"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center"
                        style={{ background: `${color}20` }}
                      >
                        <Icon size={14} color={color} />
                      </div>
                      <span className="text-sm font-bold capitalize" style={{ color }}>
                        {preset.replace(/_/g, " ")}
                      </span>
                    </div>

                    {/* Score bar */}
                    <div className="mb-3">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-[var(--color-text-muted)]">Corridor Score</span>
                        <span className="font-bold text-[var(--color-text-primary)]">
                          {data.corridor_avg_benefit}
                          <span className="text-[var(--color-text-muted)] font-normal">/100</span>
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-[rgba(255,255,255,0.05)] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${data.corridor_avg_benefit}%`,
                            background: `linear-gradient(to right, ${color}88, ${color})`,
                          }}
                        />
                      </div>
                    </div>

                    {/* Weights */}
                    <div className="flex gap-2 text-[9px] text-[var(--color-text-muted)] mb-2">
                      <span>Density: {(data.weights.density_weight * 100).toFixed(0)}%</span>
                      <span>Traffic: {(data.weights.traffic_weight * 100).toFixed(0)}%</span>
                      <span>Distance: {(data.weights.distance_weight * 100).toFixed(0)}%</span>
                    </div>

                    {/* Top neighbourhoods */}
                    {data.top_5_global && data.top_5_global.length > 0 && (
                      <div>
                        <span className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wider">
                          Top areas
                        </span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {data.top_5_global.slice(0, 3).map((n) => (
                            <span
                              key={n.neighbourhood}
                              className="text-[8px] px-1.5 py-0.5 rounded-full border"
                              style={{
                                background: `${color}10`,
                                borderColor: `${color}30`,
                                color: color,
                              }}
                            >
                              {n.neighbourhood} ({n.benefit_score})
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ==================== SECTION: Neighbourhood Coverage ==================== */}
        {corridor.covered_neighbourhoods.length > 0 && (
          <section className="analysis-section">
            <h3 className="analysis-section-title">
              <Target size={14} className="text-green-400" />
              Neighbourhood Coverage ({corridor.covered_neighbourhoods.length})
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {corridor.covered_neighbourhoods
                .sort((a, b) => b.benefit_score - a.benefit_score)
                .map((n) => {
                  const hue = n.benefit_score > 60 ? 160 : n.benefit_score > 40 ? 45 : 0;
                  return (
                    <div
                      key={n.neighbourhood}
                      className="rounded-lg px-2.5 py-1.5 border"
                      style={{
                        background: `hsla(${hue}, 80%, 50%, 0.08)`,
                        borderColor: `hsla(${hue}, 80%, 50%, 0.25)`,
                      }}
                    >
                      <span className="text-[10px] font-medium text-[var(--color-text-secondary)]">
                        {n.neighbourhood}
                      </span>
                      <span
                        className="ml-1.5 text-[10px] font-bold"
                        style={{ color: `hsl(${hue}, 80%, 60%)` }}
                      >
                        {n.benefit_score}
                      </span>
                    </div>
                  );
                })}
            </div>
          </section>
        )}

        {/* ==================== SECTION: AI Insight ==================== */}
        {ai_analysis && (
          <section className="analysis-section">
            <button
              onClick={() => setExpandedAI(!expandedAI)}
              className="analysis-section-title cursor-pointer hover:text-purple-300 transition w-full text-left"
            >
              <Sparkles size={14} className="text-purple-400" />
              AI Analysis
              {expandedAI ? <ChevronUp size={14} className="ml-auto" /> : <ChevronDown size={14} className="ml-auto" />}
            </button>
            {expandedAI && (
              <div
                className="rounded-xl p-4 text-[12px] text-[var(--color-text-secondary)] leading-relaxed whitespace-pre-wrap animate-fade-up"
                style={{
                  background: "linear-gradient(135deg, rgba(139,92,246,0.06), rgba(6,182,212,0.06))",
                  border: "1px solid rgba(139,92,246,0.15)",
                }}
              >
                {ai_analysis}
              </div>
            )}
          </section>
        )}

        {/* Footer benefit score */}
        <div className="text-center py-4 border-t border-[var(--color-border)]">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[rgba(6,182,212,0.1)] border border-cyan-500/20">
            <TrendingUp size={14} className="text-cyan-400" />
            <span className="text-xs text-[var(--color-text-muted)]">Avg. Benefit Score:</span>
            <span className="text-lg font-black text-cyan-400">
              {corridor.avg_benefit_score}
              <span className="text-xs font-normal text-[var(--color-text-muted)]">/100</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
