"use client";

import { Zone } from "../types";
import { generateExplanation, getScoreColor, getScoreLabel } from "../utils/scoring";
import {
  Users,
  Briefcase,
  Car,
  Train,
  TrendingUp,
  DollarSign,
  Building2,
  MapPin,
} from "lucide-react";

interface ExplorePanelProps {
  zones: Zone[];
  selectedZone: Zone | null;
  onZoneClick: (zone: Zone) => void;
}

export default function ExplorePanel({
  zones,
  selectedZone,
  onZoneClick,
}: ExplorePanelProps) {
  if (!selectedZone) {
    return (
      <div className="p-4 flex flex-col items-center justify-center text-center gap-3 min-h-[300px]">
        <div className="w-16 h-16 rounded-full bg-[var(--color-bg-card)] flex items-center justify-center">
          <MapPin size={28} className="text-[var(--color-text-muted)]" />
        </div>
        <div>
          <p className="text-sm font-medium text-[var(--color-text-secondary)]">
            Select a zone on the map
          </p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            Click any colored zone to see detailed stats and transit need analysis
          </p>
        </div>

        {/* Quick zone list */}
        <div className="w-full mt-4">
          <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium mb-2 text-left">
            All Zones
          </p>
          <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
            {[...zones]
              .sort((a, b) => b.needScore - a.needScore)
              .map((zone) => (
                <button
                  key={zone.id}
                  onClick={() => onZoneClick(zone)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg glass-card text-left group"
                >
                  <span className="text-xs text-[var(--color-text-primary)] group-hover:text-white transition">
                    {zone.name}
                  </span>
                  <span
                    className="score-badge"
                    style={{
                      backgroundColor: `${getScoreColor(zone.needScore)}20`,
                      color: getScoreColor(zone.needScore),
                    }}
                  >
                    {zone.needScore}
                  </span>
                </button>
              ))}
          </div>
        </div>
      </div>
    );
  }

  const explanation = generateExplanation(selectedZone, zones);

  const stats = [
    {
      icon: Users,
      label: "Population Density",
      value: `${selectedZone.populationDensity.toLocaleString()}`,
      unit: "/km²",
      color: "var(--color-accent-blue)",
    },
    {
      icon: Briefcase,
      label: "Job Density",
      value: `${selectedZone.jobDensity.toLocaleString()}`,
      unit: "/km²",
      color: "var(--color-accent-cyan)",
    },
    {
      icon: Car,
      label: "Traffic Level",
      value: `${selectedZone.trafficLevel}`,
      unit: "/100",
      color: selectedZone.trafficLevel > 60 ? "var(--color-accent-red)" : "var(--color-accent-amber)",
    },
    {
      icon: Train,
      label: "Nearest Rapid Transit",
      value: `${selectedZone.distanceToTransit.toFixed(1)}`,
      unit: " km",
      color: selectedZone.distanceToTransit > 1.5 ? "var(--color-accent-red)" : "var(--color-accent-green)",
    },
    {
      icon: DollarSign,
      label: "Median Income",
      value: `$${(selectedZone.medianIncome / 1000).toFixed(0)}k`,
      unit: "",
      color: "var(--color-text-secondary)",
    },
    {
      icon: TrendingUp,
      label: "Existing Ridership",
      value: `${(selectedZone.existingRidership / 1000).toFixed(1)}k`,
      unit: "/day",
      color: "var(--color-accent-amber)",
    },
  ];

  return (
    <div className="p-4 space-y-4 animate-fade-up">
      {/* Zone Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-bold text-[var(--color-text-primary)]">
            {selectedZone.name}
          </h2>
          <div className="flex items-center gap-2 mt-1">
            <span
              className="score-badge"
              style={{
                backgroundColor: `${getScoreColor(selectedZone.needScore)}20`,
                color: getScoreColor(selectedZone.needScore),
              }}
            >
              {selectedZone.needScore}
            </span>
            <span className="text-xs text-[var(--color-text-muted)]">
              {getScoreLabel(selectedZone.needScore)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Building2 size={12} className="text-[var(--color-text-muted)]" />
          <span className="text-[10px] text-[var(--color-text-muted)] capitalize">
            {selectedZone.landUse}
          </span>
          {selectedZone.growthFlag && (
            <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-[rgba(245,158,11,0.15)] text-[var(--color-accent-amber)]">
              GROWTH
            </span>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-2">
        {stats.map(({ icon: Icon, label, value, unit, color }) => (
          <div key={label} className="stat-card">
            <div className="flex items-center gap-1.5 mb-1">
              <Icon size={12} style={{ color }} />
              <span className="stat-label">{label}</span>
            </div>
            <div className="stat-value" style={{ color }}>
              {value}
              <span className="text-xs font-normal text-[var(--color-text-muted)]">
                {unit}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Explanation */}
      <div className="glass-card p-3">
        <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium mb-1.5">
          Analysis
        </p>
        <p
          className="text-xs text-[var(--color-text-secondary)] leading-relaxed"
          dangerouslySetInnerHTML={{
            __html: explanation
              .replace(/\*\*(.*?)\*\*/g, '<strong class="text-[var(--color-text-primary)]">$1</strong>'),
          }}
        />
      </div>

      {/* Score Breakdown Bar */}
      <div className="glass-card p-3">
        <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium mb-2">
          Score Breakdown
        </p>
        <div className="space-y-2">
          {[
            {
              label: "Population",
              value: Math.min(100, Math.round((selectedZone.populationDensity / 20000) * 100)),
              color: "var(--color-accent-blue)",
            },
            {
              label: "Jobs",
              value: Math.min(100, Math.round((selectedZone.jobDensity / 45000) * 100)),
              color: "var(--color-accent-cyan)",
            },
            {
              label: "Traffic",
              value: selectedZone.trafficLevel,
              color: "var(--color-accent-amber)",
            },
            {
              label: "Transit Gap",
              value: Math.min(100, Math.round((selectedZone.distanceToTransit / 5) * 100)),
              color: "var(--color-accent-red)",
            },
          ].map(({ label, value, color }) => (
            <div key={label}>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px] text-[var(--color-text-muted)]">{label}</span>
                <span className="text-[10px] text-[var(--color-text-secondary)]">{value}%</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-[rgba(255,255,255,0.05)]">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${value}%`,
                    backgroundColor: color,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
