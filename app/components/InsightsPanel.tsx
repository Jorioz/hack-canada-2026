"use client";

import { useMemo } from "react";
import { Zone, TransitLine } from "../types";
import {
  Lightbulb,
  TrendingUp,
  AlertTriangle,
  MapPin,
  Users,
  Car,
  Train,
  ArrowRight,
  Target,
  Zap,
} from "lucide-react";

interface TrafficIntersection {
  location_name: string;
  latitude: number;
  longitude: number;
  total_vehicle: number;
}

interface InsightsPanelProps {
  zones: Zone[];
  transitLines: TransitLine[];
  trafficIntersections: TrafficIntersection[];
  onZoomToZone: (zone: Zone) => void;
}

interface Insight {
  id: string;
  type: "opportunity" | "warning" | "trend" | "action";
  title: string;
  description: string;
  zones: Zone[];
  priority: "high" | "medium" | "low";
  metric?: string;
}

function getInsightIcon(type: Insight["type"]) {
  switch (type) {
    case "opportunity": return <Target size={14} className="text-[var(--color-accent-green)]" />;
    case "warning": return <AlertTriangle size={14} className="text-[var(--color-accent-amber)]" />;
    case "trend": return <TrendingUp size={14} className="text-[var(--color-accent-cyan)]" />;
    case "action": return <Zap size={14} className="text-[var(--color-accent-blue)]" />;
  }
}

function getPriorityColor(priority: Insight["priority"]) {
  switch (priority) {
    case "high": return "#ef4444";
    case "medium": return "#f59e0b";
    case "low": return "#22c55e";
  }
}

export default function InsightsPanel({
  zones,
  transitLines,
  trafficIntersections,
  onZoomToZone,
}: InsightsPanelProps) {
  const insights = useMemo(() => {
    if (zones.length === 0) return [];

    const results: Insight[] = [];

    // Sort zones by need score
    const sorted = [...zones].sort((a, b) => b.needScore - a.needScore);

    // 1. Transit deserts — high density but far from transit
    const transitDeserts = zones.filter(
      (z) => z.populationDensity > 5000 && z.distanceToTransit > 2.0
    ).sort((a, b) => b.populationDensity - a.populationDensity);

    if (transitDeserts.length > 0) {
      const totalPop = transitDeserts.reduce((s, z) => s + z.populationDensity, 0);
      results.push({
        id: "transit-deserts",
        type: "opportunity",
        title: "Transit Deserts Identified",
        description: `${transitDeserts.length} neighbourhoods with 5,000+ people/km² are over 2km from rapid transit. These areas represent the highest-impact opportunities for new transit investment.`,
        zones: transitDeserts.slice(0, 5),
        priority: "high",
        metric: `${transitDeserts.length} areas`,
      });
    }

    // 2. Congestion corridors — high traffic + high density
    const congestedAreas = zones.filter(
      (z) => z.trafficLevel > 70 && z.populationDensity > 6000
    ).sort((a, b) => b.trafficLevel - a.trafficLevel);

    if (congestedAreas.length > 0) {
      results.push({
        id: "congestion-corridors",
        type: "warning",
        title: "Congestion Hotspots",
        description: `${congestedAreas.length} dense neighbourhoods have traffic levels above 70/100. Surface transit here (LRT or BRT) could divert significant car trips and reduce gridlock.`,
        zones: congestedAreas.slice(0, 5),
        priority: "high",
        metric: `Avg traffic: ${Math.round(congestedAreas.reduce((s, z) => s + z.trafficLevel, 0) / congestedAreas.length)}/100`,
      });
    }

    // 3. Equity focus — low income + poor transit access
    const equityZones = zones.filter(
      (z) => z.medianIncome < 60000 && z.distanceToTransit > 1.5
    ).sort((a, b) => a.medianIncome - b.medianIncome);

    if (equityZones.length > 0) {
      results.push({
        id: "equity-priority",
        type: "action",
        title: "Equity Priority Areas",
        description: `${equityZones.length} lower-income neighbourhoods (median < $60K) are underserved by transit. Prioritizing these areas addresses both mobility and social equity goals.`,
        zones: equityZones.slice(0, 5),
        priority: "high",
        metric: `Avg income: $${Math.round(equityZones.reduce((s, z) => s + z.medianIncome, 0) / equityZones.length / 1000)}K`,
      });
    }

    // 4. Growth areas — flagged for high growth
    const growthZones = zones.filter((z) => z.growthFlag).sort((a, b) => b.needScore - a.needScore);
    if (growthZones.length > 0) {
      results.push({
        id: "growth-areas",
        type: "trend",
        title: "Projected Growth Zones",
        description: `${growthZones.length} neighbourhoods are flagged for high projected growth. Building transit now in these areas locks in ridership before development outpaces infrastructure.`,
        zones: growthZones.slice(0, 5),
        priority: "medium",
        metric: `${growthZones.length} zones`,
      });
    }

    // 5. Top underserved — highest need scores
    const topUnderserved = sorted.slice(0, 5);
    if (topUnderserved.length > 0) {
      results.push({
        id: "top-underserved",
        type: "action",
        title: "Most Underserved Neighbourhoods",
        description: `These ${topUnderserved.length} zones have the highest Transit Need Scores, combining density, congestion, and transit gaps. They should be the primary focus for any new transit planning.`,
        zones: topUnderserved,
        priority: "high",
        metric: `Avg score: ${Math.round(topUnderserved.reduce((s, z) => s + z.needScore, 0) / topUnderserved.length)}/100`,
      });
    }

    // 6. Well-served but congested — close to transit but still congested
    const congestedNearTransit = zones.filter(
      (z) => z.distanceToTransit < 0.8 && z.trafficLevel > 65
    ).sort((a, b) => b.trafficLevel - a.trafficLevel);

    if (congestedNearTransit.length > 0) {
      results.push({
        id: "capacity-issues",
        type: "warning",
        title: "Capacity Bottlenecks",
        description: `${congestedNearTransit.length} areas near existing transit still have high traffic. This suggests existing lines may be at capacity — consider parallel routes or frequency upgrades.`,
        zones: congestedNearTransit.slice(0, 5),
        priority: "medium",
        metric: `${congestedNearTransit.length} areas`,
      });
    }

    // 7. Mixed-use corridors — good candidates for LRT
    const mixedUse = zones.filter(
      (z) => z.landUse === "mixed" && z.populationDensity > 8000
    ).sort((a, b) => b.populationDensity - a.populationDensity);

    if (mixedUse.length > 0) {
      results.push({
        id: "lrt-corridors",
        type: "opportunity",
        title: "LRT-Ready Corridors",
        description: `${mixedUse.length} high-density mixed-use neighbourhoods are ideal candidates for surface LRT. Mixed residential/commercial areas generate bidirectional ridership throughout the day.`,
        zones: mixedUse.slice(0, 5),
        priority: "medium",
        metric: `Avg density: ${Math.round(mixedUse.reduce((s, z) => s + z.populationDensity, 0) / mixedUse.length).toLocaleString()}/km²`,
      });
    }

    return results;
  }, [zones]);

  // Summary stats
  const stats = useMemo(() => {
    if (zones.length === 0) return null;
    const totalPop = zones.reduce((s, z) => s + z.populationDensity, 0);
    const avgNeedScore = Math.round(zones.reduce((s, z) => s + z.needScore, 0) / zones.length);
    const highNeedCount = zones.filter((z) => z.needScore >= 60).length;
    const avgTransitDist = (zones.reduce((s, z) => s + z.distanceToTransit, 0) / zones.length).toFixed(1);
    return { avgNeedScore, highNeedCount, avgTransitDist, totalZones: zones.length };
  }, [zones]);

  return (
    <div className="p-4 space-y-4 animate-fade-up">
      {/* Header */}
      <div>
        <h2 className="text-sm font-bold text-[var(--color-text-primary)] flex items-center gap-2">
          <Lightbulb size={14} className="text-[var(--color-accent-amber)]" />
          Data Insights
        </h2>
        <p className="text-[11px] text-[var(--color-text-muted)] mt-1">
          Automated analysis of density, traffic, and transit data to guide your
          research and scenario planning.
        </p>
      </div>

      {/* Quick Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg p-2 text-center" style={{ background: "rgba(6,182,212,0.1)", border: "1px solid rgba(6,182,212,0.2)" }}>
            <p className="text-lg font-black text-[var(--color-accent-cyan)]">{stats.avgNeedScore}</p>
            <p className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wider">Avg Need</p>
          </div>
          <div className="rounded-lg p-2 text-center" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
            <p className="text-lg font-black text-[var(--color-accent-red)]">{stats.highNeedCount}</p>
            <p className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wider">High Need</p>
          </div>
          <div className="rounded-lg p-2 text-center" style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)" }}>
            <p className="text-lg font-black text-[var(--color-accent-amber)]">{stats.avgTransitDist}km</p>
            <p className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wider">Avg Gap</p>
          </div>
        </div>
      )}

      {/* Insights */}
      <div className="space-y-3">
        {insights.map((insight) => (
          <div
            key={insight.id}
            className="relative rounded-lg overflow-hidden"
            style={{
              background: "rgba(15,23,42,0.8)",
              border: `1px solid ${getPriorityColor(insight.priority)}30`,
            }}
          >
            {/* Priority accent */}
            <div
              className="absolute left-0 top-0 bottom-0 w-1"
              style={{ background: getPriorityColor(insight.priority) }}
            />

            <div className="pl-4 pr-3 py-3 space-y-2">
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  {getInsightIcon(insight.type)}
                  <span className="text-xs font-bold text-[var(--color-text-primary)]">
                    {insight.title}
                  </span>
                </div>
                {insight.metric && (
                  <span
                    className="text-[9px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                    style={{
                      background: `${getPriorityColor(insight.priority)}20`,
                      color: getPriorityColor(insight.priority),
                    }}
                  >
                    {insight.metric}
                  </span>
                )}
              </div>

              {/* Description */}
              <p className="text-[11px] text-[var(--color-text-secondary)] leading-relaxed">
                {insight.description}
              </p>

              {/* Zone chips */}
              {insight.zones.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {insight.zones.map((zone) => (
                    <button
                      key={zone.id}
                      onClick={() => onZoomToZone(zone)}
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all hover:scale-[1.03] active:scale-[0.97]"
                      style={{
                        background: "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        color: "var(--color-text-secondary)",
                      }}
                    >
                      <MapPin size={9} />
                      {zone.name.length > 20 ? zone.name.slice(0, 18) + "…" : zone.name}
                      <ArrowRight size={8} className="opacity-50" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Guidance */}
      <div className="rounded-lg p-3" style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.15)" }}>
        <p className="text-[10px] text-[var(--color-text-muted)] leading-relaxed">
          💡 <strong className="text-[var(--color-text-secondary)]">How to use:</strong>{" "}
          Click any neighbourhood chip to zoom in and explore. Use these insights to
          inform where you draw scenarios — target high-need areas for maximum impact.
        </p>
      </div>
    </div>
  );
}
