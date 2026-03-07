"use client";

import { Zone, HotspotCluster } from "../types";
import { getScoreColor } from "../utils/scoring";
import { AlertTriangle, MapPin, Users, Car, Train } from "lucide-react";

interface HotspotPanelProps {
  hotspots: HotspotCluster[];
  zones: Zone[];
  onZoomToZone: (zone: Zone) => void;
}

export default function HotspotPanel({
  hotspots,
  zones,
  onZoomToZone,
}: HotspotPanelProps) {
  return (
    <div className="p-4 space-y-4 animate-fade-up">
      {/* Header */}
      <div>
        <h2 className="text-sm font-bold text-[var(--color-text-primary)] flex items-center gap-2">
          <AlertTriangle size={14} className="text-[var(--color-accent-red)]" />
          High-Need Hotspots
        </h2>
        <p className="text-[11px] text-[var(--color-text-muted)] mt-1">
          Top underserved areas ranked by Transit Need Score. These zones have the
          highest combination of density, congestion, and transit gap.
        </p>
      </div>

      {/* Hotspot Legend */}
      <div className="glass-card p-3">
        <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium mb-2">
          Scoring Weights (Transparent)
        </p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {[
            { label: "Pop. Density", weight: "25%" },
            { label: "Job Density", weight: "20%" },
            { label: "Traffic Level", weight: "20%" },
            { label: "Transit Distance", weight: "25%" },
            { label: "Equity (Income)", weight: "10%" },
          ].map(({ label, weight }) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-[10px] text-[var(--color-text-secondary)]">{label}</span>
              <span className="text-[10px] font-medium text-[var(--color-accent-cyan)]">
                {weight}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Hotspot List */}
      <div className="space-y-2">
        {hotspots.map((cluster, index) => {
          const zone = cluster.zones[0];
          if (!zone) return null;

          return (
            <button
              key={cluster.id}
              onClick={() => onZoomToZone(zone)}
              className="w-full glass-card p-3 text-left group cursor-pointer transition-all hover:scale-[1.01]"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold text-white"
                    style={{ backgroundColor: getScoreColor(cluster.avgScore) }}
                  >
                    {index + 1}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-[var(--color-text-primary)] group-hover:text-white transition">
                      {zone.name}
                    </p>
                    <p className="text-[10px] text-[var(--color-text-muted)]">
                      {cluster.label}
                    </p>
                  </div>
                </div>
                <span
                  className="score-badge"
                  style={{
                    backgroundColor: `${getScoreColor(cluster.avgScore)}20`,
                    color: getScoreColor(cluster.avgScore),
                  }}
                >
                  {cluster.avgScore}
                </span>
              </div>

              {/* Key Metrics Row */}
              <div className="flex items-center gap-3 text-[10px] text-[var(--color-text-muted)]">
                <span className="flex items-center gap-1">
                  <Users size={10} />
                  {(zone.populationDensity / 1000).toFixed(1)}k/km²
                </span>
                <span className="flex items-center gap-1">
                  <Car size={10} />
                  {zone.trafficLevel}/100
                </span>
                <span className="flex items-center gap-1">
                  <Train size={10} />
                  {zone.distanceToTransit.toFixed(1)} km
                </span>
                <span className="flex items-center gap-1 ml-auto">
                  <MapPin size={10} />
                  View
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Info box */}
      <div className="glass-card p-3">
        <p className="text-[10px] text-[var(--color-text-muted)] leading-relaxed">
          💡 <strong className="text-[var(--color-text-secondary)]">Tip:</strong> Click a
          hotspot to zoom in and see detailed stats. Use the Scenarios tab to draw a
          proposed transit line connecting these areas.
        </p>
      </div>
    </div>
  );
}
