"""
Simulation engine: mode comparison, sensitivity analysis, Pareto ranking,
and Gemini briefing formatter.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, asdict
from typing import Any, Sequence

from api.utils.transit import (
    load_transit_benefit_scores,
    _get_scored_neighbourhood_geometries,
    _build_candidate_metrics,
    _line_from_lat_lng,
    _project_to_32617,
)
import geopandas as gpd

# ---------------------------------------------------------------------------
# Cost & timeline benchmarks (real Toronto project data, simplified)
# ---------------------------------------------------------------------------

COST_BENCHMARKS: dict[str, dict[str, float]] = {
    "subway": {"per_km_low": 300, "per_km_high": 500, "per_station_low": 150, "per_station_high": 250},
    "surface_lrt": {"per_km_low": 80, "per_km_high": 150, "per_station_low": 15, "per_station_high": 30},
    "enhanced_bus": {"per_km_low": 5, "per_km_high": 15, "per_station_low": 0.5, "per_station_high": 2},
}

TIMELINE_BENCHMARKS: dict[str, dict[str, float]] = {
    "subway": {"overhead_years": 3, "years_per_km": 0.8},
    "surface_lrt": {"overhead_years": 2, "years_per_km": 0.4},
    "enhanced_bus": {"overhead_years": 0.5, "years_per_km": 0.05},
}

CAPTURE_RATES: dict[str, dict[str, float]] = {
    "subway": {"existing": 0.35, "new_riders": 0.08},
    "surface_lrt": {"existing": 0.25, "new_riders": 0.05},
    "enhanced_bus": {"existing": 0.15, "new_riders": 0.03},
}

AVG_FARE = 3.35  # CAD


# ---------------------------------------------------------------------------
# Sensitivity presets
# ---------------------------------------------------------------------------

SENSITIVITY_PRESETS: dict[str, dict[str, float]] = {
    "balanced": {"density_weight": 0.35, "traffic_weight": 0.30, "distance_weight": 0.35},
    "equity_first": {"density_weight": 0.15, "traffic_weight": 0.15, "distance_weight": 0.70},
    "ridership_first": {"density_weight": 0.60, "traffic_weight": 0.15, "distance_weight": 0.25},
    "congestion_first": {"density_weight": 0.15, "traffic_weight": 0.60, "distance_weight": 0.25},
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _haversine(p1: tuple[float, float], p2: tuple[float, float]) -> float:
    """Haversine distance in km between two (lat, lng) points."""
    R = 6371.0
    d_lat = math.radians(p2[0] - p1[0])
    d_lng = math.radians(p2[1] - p1[1])
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(p1[0]))
        * math.cos(math.radians(p2[0]))
        * math.sin(d_lng / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _line_length_km(path: list[tuple[float, float]]) -> float:
    return sum(_haversine(path[i], path[i + 1]) for i in range(len(path) - 1))


# ---------------------------------------------------------------------------
# Single mode scenario calculation
# ---------------------------------------------------------------------------

@dataclass
class ScenarioResult:
    mode: str
    line_length_km: float
    num_stations: int
    cost_low: float
    cost_high: float
    daily_riders_low: int
    daily_riders_high: int
    car_trips_removed_low: int
    car_trips_removed_high: int
    annual_fare_revenue: float
    timeline_years_low: float
    timeline_years_high: float
    population_served: int
    jobs_served: int
    cost_per_rider: float  # cost_mid / daily_riders_mid
    roi_years: float  # cost_mid / annual_fare_revenue


def calculate_scenario(
    path: list[tuple[float, float]],
    mode: str,
    station_spacing_m: int = 800,
    population_served: int = 0,
    jobs_served: int = 0,
    existing_ridership: int = 0,
) -> ScenarioResult:
    """Calculate full scenario metrics for a single mode along a path."""
    length_km = _line_length_km(path)
    num_stations = max(2, round(length_km / (station_spacing_m / 1000)) + 1)

    bench = COST_BENCHMARKS[mode]
    cost_low = length_km * bench["per_km_low"] + num_stations * bench["per_station_low"]
    cost_high = length_km * bench["per_km_high"] + num_stations * bench["per_station_high"]

    rates = CAPTURE_RATES[mode]
    captured_existing = round(existing_ridership * rates["existing"])
    new_riders = round(population_served * rates["new_riders"])
    base_riders = captured_existing + new_riders

    daily_riders_low = round(base_riders * 0.8)
    daily_riders_high = round(base_riders * 1.2)

    car_trips_removed_low = round(new_riders * 0.5)
    car_trips_removed_high = round(new_riders * 0.7)

    avg_daily_riders = (daily_riders_low + daily_riders_high) / 2
    annual_fare_revenue = round(avg_daily_riders * AVG_FARE * 365)

    timeline = TIMELINE_BENCHMARKS[mode]
    base_years = timeline["overhead_years"] + length_km * timeline["years_per_km"]
    timeline_years_low = round(base_years, 1)
    timeline_years_high = round(base_years * 1.5, 1)

    cost_mid = (cost_low + cost_high) / 2
    riders_mid = max(1, (daily_riders_low + daily_riders_high) / 2)
    cost_per_rider = round(cost_mid * 1_000_000 / riders_mid, 0)  # $ per daily rider
    roi_years = round(cost_mid * 1_000_000 / max(1, annual_fare_revenue), 1)

    return ScenarioResult(
        mode=mode,
        line_length_km=round(length_km, 2),
        num_stations=num_stations,
        cost_low=round(cost_low),
        cost_high=round(cost_high),
        daily_riders_low=daily_riders_low,
        daily_riders_high=daily_riders_high,
        car_trips_removed_low=car_trips_removed_low,
        car_trips_removed_high=car_trips_removed_high,
        annual_fare_revenue=annual_fare_revenue,
        timeline_years_low=timeline_years_low,
        timeline_years_high=timeline_years_high,
        population_served=population_served,
        jobs_served=jobs_served,
        cost_per_rider=cost_per_rider,
        roi_years=roi_years,
    )


# ---------------------------------------------------------------------------
# Mode comparison: run same corridor across all 3 modes
# ---------------------------------------------------------------------------

MODES = ["subway", "surface_lrt", "enhanced_bus"]


def compare_modes(
    path: list[tuple[float, float]],
    station_spacing_m: int = 800,
    buffer_km: float = 0.8,
) -> dict[str, Any]:
    """Run the corridor through all 3 modes and return comparison + coverage data."""
    scored_hoods = _get_scored_neighbourhood_geometries()
    scored_projected = scored_hoods.to_crs(epsg=32617)

    # Get corridor coverage metrics
    coverage = _build_candidate_metrics(
        [(lat, lng) for lat, lng in path],
        scored_projected,
        buffer_km,
    )

    population_served = coverage.get("population_served", 0)
    traffic_served = coverage.get("traffic_served", 0)
    covered_neighbourhoods = coverage.get("covered_neighbourhoods", [])

    # Estimate jobs and existing ridership from population heuristic
    jobs_served = round(population_served * 0.6)
    existing_ridership = round(population_served * 0.15)

    results: dict[str, Any] = {}
    for mode in MODES:
        scenario = calculate_scenario(
            path=path,
            mode=mode,
            station_spacing_m=station_spacing_m,
            population_served=population_served,
            jobs_served=jobs_served,
            existing_ridership=existing_ridership,
        )
        results[mode] = asdict(scenario)

    return {
        "corridor": {
            "length_km": coverage.get("length_km", 0),
            "population_served": population_served,
            "jobs_served": jobs_served,
            "traffic_served": round(traffic_served, 2),
            "avg_benefit_score": coverage.get("avg_benefit_score", 0),
            "covered_neighbourhoods": covered_neighbourhoods,
        },
        "modes": results,
    }


# ---------------------------------------------------------------------------
# Sensitivity analysis: re-score neighbourhoods with different weight presets
# ---------------------------------------------------------------------------

def run_sensitivity_analysis(
    path: list[tuple[float, float]],
    buffer_km: float = 1.0,
) -> dict[str, Any]:
    """
    Re-rank neighbourhoods under 4 weight presets and score the corridor
    under each. Shows how the route's value changes based on priorities.

    Loads the base data ONCE, then re-weights the pre-normalized scores —
    no repeated GTFS/GeoJSON reloads.
    """
    # Load base scores (with default weights) — this gives us the normalized
    # component scores (density_score, traffic_score, distance_score)
    base_scores = load_transit_benefit_scores()  # single call

    # Load geometries once and merge with scores
    from api.utils.transit import NEIGHBOURHOOD_GEOSHAPES
    hoods_gdf = gpd.read_file(NEIGHBOURHOOD_GEOSHAPES)
    hoods_gdf = hoods_gdf[["AREA_NAME", "geometry"]].rename(columns={"AREA_NAME": "neighbourhood"})
    merged_geo = hoods_gdf.merge(base_scores, on="neighbourhood", how="inner")
    projected = merged_geo.to_crs(epsg=32617)

    # Pre-compute line buffer once
    if len(path) < 2:
        return {
            preset: {"weights": w, "corridor_avg_benefit": 0, "top_5_global": [], "covered_neighbourhoods": []}
            for preset, w in SENSITIVITY_PRESETS.items()
        }

    line = _project_to_32617(_line_from_lat_lng(path))
    line_buffer = line.buffer(buffer_km * 1000)
    covered_mask = projected.geometry.intersects(line_buffer)

    results: dict[str, Any] = {}

    for preset_name, weights in SENSITIVITY_PRESETS.items():
        total_w = weights["density_weight"] + weights["traffic_weight"] + weights["distance_weight"]

        # Recompute benefit score using the existing normalized components from merged_geo
        reweighted = (
            100 * (
                (weights["density_weight"] / total_w) * merged_geo["density_score"]
                + (weights["traffic_weight"] / total_w) * merged_geo["traffic_score"]
                + (weights["distance_weight"] / total_w) * merged_geo["distance_score"]
            )
        ).round(2)

        # Sort for global top-5
        sorted_df = merged_geo[["neighbourhood"]].copy()
        sorted_df["benefit_score"] = reweighted.values
        sorted_df = sorted_df.sort_values("benefit_score", ascending=False).reset_index(drop=True)

        # Corridor coverage under this weighting
        covered_reweighted = reweighted[covered_mask.values]
        avg_benefit = float(covered_reweighted.mean()) if len(covered_reweighted) > 0 else 0.0

        top_5_global = sorted_df.head(5)[["neighbourhood", "benefit_score"]].to_dict(orient="records")

        covered_geo = projected[covered_mask].copy()
        covered_geo["_reweighted"] = covered_reweighted.values
        covered_names = (
            covered_geo.sort_values("_reweighted", ascending=False)
            .head(5)["neighbourhood"]
            .tolist()
            if not covered_geo.empty
            else []
        )

        results[preset_name] = {
            "weights": weights,
            "corridor_avg_benefit": round(avg_benefit, 2),
            "top_5_global": top_5_global,
            "covered_neighbourhoods": covered_names,
        }

    return results


# ---------------------------------------------------------------------------
# Pareto ranking: multi-objective ranking across candidates
# ---------------------------------------------------------------------------

def pareto_rank_candidates(
    candidates: list[dict[str, Any]],
    path_key: str = "path_lat_lng",
    station_spacing_m: int = 800,
    buffer_km: float = 0.8,
) -> list[dict[str, Any]]:
    """
    Take route candidates and rank them across multiple objectives.
    Returns candidates with pareto_scores and dimension rankings.
    """
    if not candidates:
        return []

    scored_hoods = _get_scored_neighbourhood_geometries()
    scored_projected = scored_hoods.to_crs(epsg=32617)

    enriched = []
    for cand in candidates:
        path = [(p[0], p[1]) for p in cand[path_key]]
        if len(path) < 2:
            continue

        coverage = _build_candidate_metrics(path, scored_projected, buffer_km)
        pop = coverage.get("population_served", 0)
        jobs = round(pop * 0.6)
        existing_riders = round(pop * 0.15)

        # Use surface_lrt as the representative mode for Pareto ranking
        scenario = calculate_scenario(
            path=path,
            mode="surface_lrt",
            station_spacing_m=station_spacing_m,
            population_served=pop,
            jobs_served=jobs,
            existing_ridership=existing_riders,
        )

        enriched.append({
            **cand,
            "scenario": asdict(scenario),
            "coverage": {
                "population_served": pop,
                "jobs_served": jobs,
                "avg_benefit_score": coverage.get("avg_benefit_score", 0),
                "traffic_served": coverage.get("traffic_served", 0),
            },
        })

    if not enriched:
        return []

    # Rank across 4 objectives (lower rank = better)
    def _rank(items: list, reverse=True):
        sorted_items = sorted(range(len(items)), key=lambda i: items[i], reverse=reverse)
        ranks = [0] * len(items)
        for rank_pos, idx in enumerate(sorted_items, 1):
            ranks[idx] = rank_pos
        return ranks

    pop_vals = [e["coverage"]["population_served"] for e in enriched]
    benefit_vals = [e["coverage"]["avg_benefit_score"] for e in enriched]
    cost_efficiency_vals = [
        (e["scenario"]["daily_riders_low"] + e["scenario"]["daily_riders_high"])
        / max(1, (e["scenario"]["cost_low"] + e["scenario"]["cost_high"]) / 2)
        for e in enriched
    ]
    car_removal_vals = [e["scenario"]["car_trips_removed_high"] for e in enriched]

    pop_ranks = _rank(pop_vals)
    benefit_ranks = _rank(benefit_vals)
    efficiency_ranks = _rank(cost_efficiency_vals)
    car_ranks = _rank(car_removal_vals)

    for i, entry in enumerate(enriched):
        entry["pareto"] = {
            "population_rank": pop_ranks[i],
            "benefit_rank": benefit_ranks[i],
            "cost_efficiency_rank": efficiency_ranks[i],
            "car_removal_rank": car_ranks[i],
            "composite_score": round(
                (1 / max(1, pop_ranks[i])) * 0.25
                + (1 / max(1, benefit_ranks[i])) * 0.30
                + (1 / max(1, efficiency_ranks[i])) * 0.25
                + (1 / max(1, car_ranks[i])) * 0.20,
                4,
            ),
        }

    enriched.sort(key=lambda e: e["pareto"]["composite_score"], reverse=True)
    for i, entry in enumerate(enriched, 1):
        entry["pareto"]["overall_rank"] = i

    return enriched


# ---------------------------------------------------------------------------
# Gemini briefing formatter
# ---------------------------------------------------------------------------

def format_gemini_briefing(
    corridor: dict[str, Any],
    mode_comparison: dict[str, Any],
    sensitivity: dict[str, Any],
    user_question: str = "",
) -> str:
    """
    Format simulation results into a structured briefing string
    that Gemini can narrate clearly.
    """
    lines: list[str] = []
    lines.append("TRANSIT ROUTE ANALYSIS BRIEFING")
    lines.append("=" * 40)
    lines.append("")

    # Context
    lines.append("CONTEXT:")
    lines.append("- City: Toronto, Ontario")
    lines.append("- Total neighbourhoods analyzed: 158")
    lines.append("- Data sources: TTC GTFS schedules, StatsCan 2021 Census, City of Toronto traffic counts")
    lines.append("")

    # Corridor overview
    corr = corridor
    lines.append("CORRIDOR OVERVIEW:")
    lines.append(f"- Length: {corr.get('length_km', 0)} km")
    lines.append(f"- Population within 800m: {corr.get('population_served', 0):,}")
    lines.append(f"- Jobs within 800m: {corr.get('jobs_served', 0):,}")
    lines.append(f"- Average neighbourhood benefit score: {corr.get('avg_benefit_score', 0)}/100")
    hoods = corr.get("covered_neighbourhoods", [])
    if hoods:
        hood_names = [h["neighbourhood"] if isinstance(h, dict) else str(h) for h in hoods[:8]]
        lines.append(f"- Key neighbourhoods served: {', '.join(hood_names)}")
    lines.append("")

    # Mode comparison table
    lines.append("MODE COMPARISON:")
    lines.append(f"{'Metric':<25} {'Subway':<18} {'Surface LRT':<18} {'Enhanced Bus':<18}")
    lines.append("-" * 79)

    modes = mode_comparison
    for metric, key, fmt in [
        ("Cost ($M)", "cost_low", lambda r: f"${r['cost_low']:,}–${r['cost_high']:,}M"),
        ("Daily Riders", "daily_riders_low", lambda r: f"{r['daily_riders_low']:,}–{r['daily_riders_high']:,}"),
        ("Cars Removed/day", "car_trips_removed_low", lambda r: f"{r['car_trips_removed_low']:,}–{r['car_trips_removed_high']:,}"),
        ("Annual Revenue", "annual_fare_revenue", lambda r: f"${r['annual_fare_revenue']:,}"),
        ("Timeline (years)", "timeline_years_low", lambda r: f"{r['timeline_years_low']}–{r['timeline_years_high']}"),
        ("Cost per Rider ($)", "cost_per_rider", lambda r: f"${r['cost_per_rider']:,.0f}"),
        ("ROI (years)", "roi_years", lambda r: f"{r['roi_years']}"),
    ]:
        subway_val = fmt(modes.get("subway", {})) if "subway" in modes else "N/A"
        lrt_val = fmt(modes.get("surface_lrt", {})) if "surface_lrt" in modes else "N/A"
        bus_val = fmt(modes.get("enhanced_bus", {})) if "enhanced_bus" in modes else "N/A"
        lines.append(f"{metric:<25} {subway_val:<18} {lrt_val:<18} {bus_val:<18}")
    lines.append("")

    # Sensitivity analysis
    lines.append("SENSITIVITY ANALYSIS (how corridor value changes under different priorities):")
    for preset_name, data in sensitivity.items():
        weights = data.get("weights", {})
        w_str = f"density={weights.get('density_weight', 0):.0%}, traffic={weights.get('traffic_weight', 0):.0%}, distance={weights.get('distance_weight', 0):.0%}"
        lines.append(f"  {preset_name.upper()} ({w_str}):")
        lines.append(f"    Corridor avg benefit score: {data.get('corridor_avg_benefit', 0)}/100")
        top5 = data.get("top_5_global", [])
        if top5:
            names = [f"{n['neighbourhood']} ({n['benefit_score']})" for n in top5[:3]]
            lines.append(f"    Top global neighbourhoods: {', '.join(names)}")
        covered = data.get("covered_neighbourhoods", [])
        if covered:
            lines.append(f"    This corridor covers: {', '.join(covered[:5])}")
    lines.append("")

    # User question
    if user_question:
        lines.append(f"USER QUESTION: {user_question}")
    else:
        lines.append("USER QUESTION: Analyze this corridor and recommend the best transit mode with justification.")

    lines.append("")
    lines.append("INSTRUCTIONS: Provide analysis in 2-3 paragraphs. Reference specific numbers from the briefing.")
    lines.append("Explain tradeoffs between modes. Recommend the best mode for this corridor with justification.")
    lines.append("Mention which neighbourhoods benefit most and why. Be specific and data-driven.")

    return "\n".join(lines)
