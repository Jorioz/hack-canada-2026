"use client";

import { useMemo } from "react";
import { TransitLine, Zone, SCENARIO_MODE_COLORS } from "../types";
import { calculateScenario } from "../utils/simulation";
import {
  TrainFront,
  TramFront,
  Bus,
  DollarSign,
  Users,
  Car,
  BarChart3,
  Ruler,
  MapPin,
  Clock,
  Info,
} from "lucide-react";

interface TransitLinePanelProps {
  line: TransitLine;
  zones: Zone[];
}

function formatCost(millions: number): string {
  if (millions >= 1000) return `$${(millions / 1000).toFixed(1)}B`;
  return `$${millions.toFixed(0)}M`;
}

function formatRevenue(amount: number): string {
  if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(0)}M`;
  return `$${(amount / 1_000).toFixed(0)}K`;
}

export default function TransitLinePanel({ line, zones }: TransitLinePanelProps) {
  // Simulate the impact of this existing line as if it were a scenario
  // This shows users the estimated "value" and cost of the existing infrastructure
  const simulatedImpact = useMemo(() => {
    // Map existing line mode to scenario mode for calculation
    let calcMode: "subway" | "surface_lrt" | "enhanced_bus" = "subway";
    if (line.mode === "lrt") calcMode = "surface_lrt";
    if (line.mode === "bus") calcMode = "enhanced_bus";

    // Assume average station spacing based on actual stations
    const approxSpacing = line.stations.length > 1
      ? 1000 // roughly 1km average default
      : 800;

    return calculateScenario(line.coordinates, calcMode, approxSpacing, zones, []);
  }, [line, zones]);

  const Icon = line.mode === "subway" ? TrainFront : line.mode === "lrt" ? TramFront : Bus;
  const color = SCENARIO_MODE_COLORS[line.mode === "subway" ? "subway" : line.mode === "lrt" ? "surface_lrt" : "enhanced_bus"];

  const routeStats = [
    {
      icon: Users,
      label: "Daily Riders",
      value: `${line.dailyRidership.toLocaleString()}`,
      unit: "/day",
      color: "var(--color-accent-blue)",
    },
    {
      icon: Ruler,
      label: "Line Length",
      value: `${simulatedImpact.lineLengthKm}`,
      unit: " km",
      color: "var(--color-accent-cyan)",
    },
    {
      icon: MapPin,
      label: "Major Stops",
      value: `${line.stations.length > 0 ? line.stations.length : simulatedImpact.numStations}`,
      unit: "",
      color: "var(--color-accent-blue)",
    },
    {
      icon: Clock,
      label: "Peak Headway",
      value: line.headway ? `${line.headway}` : "N/A",
      unit: line.headway ? " min" : "",
      color: "var(--color-accent-amber)",
    },
    {
      icon: TrainFront,
      label: "Avg Speed",
      value: line.avgSpeed ? `${line.avgSpeed}` : "N/A",
      unit: line.avgSpeed ? " km/h" : "",
      color: "var(--color-accent-green)",
    },
    {
      icon: BarChart3,
      label: "Reliability",
      value: line.reliability ? `${line.reliability}` : "N/A",
      unit: line.reliability ? "%" : "",
      color: line.reliability && line.reliability < 80 ? "var(--color-accent-red)" : "var(--color-accent-cyan)",
    },
  ];

  const simulatedStats = [
    {
      icon: DollarSign,
      label: "Est. Cost To Build",
      value: `${formatCost(simulatedImpact.costLow)}–${formatCost(simulatedImpact.costHigh)}`,
      unit: "",
      color: "var(--color-accent-amber)",
    },
    {
      icon: BarChart3,
      label: "Model Ridership",
      value: `${(simulatedImpact.dailyRidersLow / 1000).toFixed(0)}k–${(simulatedImpact.dailyRidersHigh / 1000).toFixed(0)}k`,
      unit: "/day",
      color: "var(--color-accent-cyan)",
    },
    {
      icon: Car,
      label: "Cars Removed",
      value: `${(simulatedImpact.carTripsRemovedLow / 1000).toFixed(0)}k–${(simulatedImpact.carTripsRemovedHigh / 1000).toFixed(0)}k`,
      unit: "/day",
      color: "var(--color-accent-green)",
    },
    {
      icon: Clock,
      label: "Build Timeline",
      value: `${simulatedImpact.timelineYearsLow}–${simulatedImpact.timelineYearsHigh}`,
      unit: " yrs",
      color: "var(--color-accent-blue)",
    },
  ];

  return (
    <div className="p-4 space-y-4 animate-fade-up">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Icon size={18} color={color} />
            <h2 className="text-base font-bold text-[var(--color-text-primary)]">
              {line.name}
            </h2>
          </div>
        </div>
        <p className="text-[11px] text-[var(--color-text-muted)]">
          Existing {line.mode === "lrt" ? "Streetcar/LRT" : line.mode} route operated by the TTC.
        </p>
      </div>

      {/* Historical Context Callout */}
      {line.description && (
        <div className="glass-card p-3">
          <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium mb-1.5">
            Context & Analysis
          </p>
          <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
            {line.description}
          </p>
        </div>
      )}

      {/* Route Profile Grid */}
      <div className="grid grid-cols-2 gap-2 mt-4">
        {routeStats.map(({ icon: IconComponent, label, value, unit, color: sColor }) => (
          <div key={label} className="stat-card">
            <div className="flex items-center gap-1.5 mb-1">
              <IconComponent size={12} style={{ color: sColor }} />
              <span className="stat-label">{label}</span>
            </div>
            <div className="stat-value" style={{ color: sColor }}>
              {value}
              <span className="text-xs font-normal text-[var(--color-text-muted)] whitespace-nowrap">
                {unit}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Simulated Replacement Value */}
      <div className="glass-card p-3 space-y-3 mt-4">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium mb-1.5">
            Simulated Replacement Value
          </p>
          <p className="text-[10px] text-[var(--color-text-secondary)] leading-relaxed">
            If this line were built today using our scenario engine, here is its estimated impact and cost to construct.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {simulatedStats.map(({ icon: IconComponent, label, value, unit, color: sColor }) => (
            <div key={label} className="stat-card bg-[var(--color-bg-base)]">
              <div className="flex items-center gap-1.5 mb-1">
                <IconComponent size={12} style={{ color: sColor }} />
                <span className="stat-label">{label}</span>
              </div>
              <div className="stat-value" style={{ color: sColor, fontSize: '16px' }}>
                {value}
                <span className="text-[10px] font-normal text-[var(--color-text-muted)] whitespace-nowrap">
                  {unit}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
