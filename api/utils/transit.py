from pathlib import Path
import json
from functools import lru_cache
from typing import Any, Sequence
from typing import cast

import geopandas as gpd
import pandas as pd
from shapely.geometry import LineString, Point
from shapely.geometry.base import BaseGeometry

from api.utils.density import load_neighbourhood_density
from api.utils.traffic import load_traffic_by_neighbourhood, load_top_intersections

DATA_DIR = Path(__file__).parent.parent / "data"
GTFS_DIR = DATA_DIR / "ttc"
NEIGHBOURHOOD_GEOSHAPES = DATA_DIR / "Neighbourhoods - 4326.geojson"


def _normalize(series: pd.Series) -> pd.Series:
    min_value = series.min()
    max_value = series.max()
    if pd.isna(min_value) or pd.isna(max_value) or min_value == max_value:
        return pd.Series([0.5] * len(series), index=series.index)
    return (series - min_value) / (max_value - min_value)


def _coerce_int(value: Any) -> int:
    """Convert pandas scalars to int in a type-checker-friendly way."""
    return int(float(value))


def _coerce_str(value: Any) -> str:
    """Convert pandas scalars to non-null strings."""
    return "" if pd.isna(value) else str(value)


def _line_from_lat_lng(path_lat_lng: list[tuple[float, float]]) -> LineString:
    return LineString([(lng, lat) for lat, lng in path_lat_lng])


def _project_to_32617(geometry: BaseGeometry) -> BaseGeometry:
    projected = gpd.GeoSeries([geometry], crs="EPSG:4326").to_crs(epsg=32617)
    return cast(BaseGeometry, projected.iloc[0])


def _to_lat_lng_tuple(value: tuple[float, float] | list[float]) -> tuple[float, float]:
    return (float(value[0]), float(value[1]))


@lru_cache(maxsize=16)
def _get_intersections_projected_cached(min_total_vehicle: int) -> gpd.GeoDataFrame:
    intersections = load_top_intersections(min_total_vehicle=min_total_vehicle, limit=None)
    if not intersections:
        return gpd.GeoDataFrame(columns=["location_name", "total_vehicle", "geometry"], geometry="geometry", crs="EPSG:32617")

    frame = pd.DataFrame(intersections)
    geometry = [Point(lon, lat) for lon, lat in zip(frame["longitude"], frame["latitude"])]
    gdf = gpd.GeoDataFrame(frame, geometry=geometry, crs="EPSG:4326").to_crs(epsg=32617)
    return gdf


def _line_shape_geojson_from_lat_lng(path_lat_lng: list[tuple[float, float]]) -> dict[str, Any]:
    return {
        "type": "LineString",
        "coordinates": [[lng, lat] for lat, lng in path_lat_lng],
    }


def _intersection_summary_for_path(
    candidate_path: list[tuple[float, float]],
    intersections_projected: gpd.GeoDataFrame,
    buffer_km: float,
) -> dict[str, Any]:
    if len(candidate_path) < 2 or intersections_projected.empty:
        return {
            "count": 0,
            "total_vehicle": 0,
            "top_intersections": [],
        }

    line = _project_to_32617(_line_from_lat_lng(candidate_path))
    line_buffer = line.buffer(buffer_km * 1000)

    nearby = intersections_projected[intersections_projected.geometry.intersects(line_buffer)].copy()
    if nearby.empty:
        return {
            "count": 0,
            "total_vehicle": 0,
            "top_intersections": [],
        }

    nearby = nearby.sort_values("total_vehicle", ascending=False)
    top = [
        {
            "location_name": _coerce_str(row["location_name"]),
            "latitude": round(float(row["latitude"]), 6),
            "longitude": round(float(row["longitude"]), 6),
            "total_vehicle": _coerce_int(row["total_vehicle"]),
        }
        for _, row in nearby.head(10).iterrows()
    ]

    return {
        "count": int(len(nearby)),
        "total_vehicle": int(float(nearby["total_vehicle"].fillna(0).sum())),
        "top_intersections": top,
    }


@lru_cache(maxsize=1)
def _get_scored_neighbourhood_geometries_cached() -> gpd.GeoDataFrame:
    scored = load_transit_benefit_scores()
    hoods = gpd.read_file(NEIGHBOURHOOD_GEOSHAPES)
    hoods = hoods[["AREA_NAME", "geometry"]].rename(columns={"AREA_NAME": "neighbourhood"})
    merged = hoods.merge(scored, on="neighbourhood", how="left")

    # Build centroids in projected CRS for geometric operations.
    projected = merged.to_crs(epsg=32617)
    projected["centroid"] = projected.geometry.centroid
    centroids = projected.set_geometry("centroid").to_crs(epsg=4326)
    merged["centroid_lat"] = centroids.geometry.y
    merged["centroid_lng"] = centroids.geometry.x
    return merged


def _get_scored_neighbourhood_geometries() -> gpd.GeoDataFrame:
    # Return a copy so callers can safely mutate without touching cache state.
    return _get_scored_neighbourhood_geometries_cached().copy()


def _build_candidate_metrics(
    candidate_path: list[tuple[float, float]],
    scored_neighbourhoods_projected: gpd.GeoDataFrame,
    buffer_km: float,
) -> dict[str, Any]:
    if len(candidate_path) < 2:
        return {
            "path_lat_lng": [[lat, lng] for lat, lng in candidate_path],
            "length_km": 0.0,
            "candidate_score": 0.0,
            "avg_benefit_score": 0.0,
            "population_served": 0,
            "traffic_served": 0,
            "covered_neighbourhoods": [],
        }

    line = _project_to_32617(_line_from_lat_lng(candidate_path))
    line_buffer = line.buffer(buffer_km * 1000)
    line_length_km = line.length / 1000

    covered = scored_neighbourhoods_projected[
        scored_neighbourhoods_projected.geometry.intersects(line_buffer)
    ].copy()

    if covered.empty:
        return {
            "path_lat_lng": [[lat, lng] for lat, lng in candidate_path],
            "length_km": round(float(line_length_km), 3),
            "candidate_score": 0.0,
            "avg_benefit_score": 0.0,
            "population_served": 0,
            "traffic_served": 0,
            "covered_neighbourhoods": [],
        }

    avg_benefit_score = float(covered["benefit_score"].mean())
    population_served = int(covered["population"].fillna(0).sum())
    traffic_served = float(covered["avg_daily_vehicles"].fillna(0).sum())

    # Weighted route score prioritizing neighbourhood need and coverage quality.
    # Length penalty discourages overly indirect lines.
    score = (
        0.55 * avg_benefit_score
        + 0.25 * min(100.0, population_served / 10000)
        + 0.20 * min(100.0, traffic_served / 1000)
        - 0.30 * line_length_km
    )

    covered_sorted = covered.sort_values("benefit_score", ascending=False)
    covered_neighbourhoods = [
        {
            "neighbourhood": _coerce_str(row["neighbourhood"]),
            "benefit_score": round(float(row["benefit_score"]), 2) if pd.notna(row["benefit_score"]) else 0,
            "centroid_lat": round(float(row["centroid_lat"]), 6) if pd.notna(row["centroid_lat"]) else 0,
            "centroid_lng": round(float(row["centroid_lng"]), 6) if pd.notna(row["centroid_lng"]) else 0,
        }
        for _, row in covered_sorted.head(10).iterrows()
    ]

    return {
        "path_lat_lng": [[lat, lng] for lat, lng in candidate_path],
        "length_km": round(float(line_length_km), 3),
        "candidate_score": round(float(score), 2),
        "avg_benefit_score": round(avg_benefit_score, 2),
        "population_served": population_served,
        "traffic_served": round(traffic_served, 2),
        "covered_neighbourhoods": covered_neighbourhoods,
    }


def generate_subway_route_candidates(
    waypoints_lat_lng: Sequence[tuple[float, float] | list[float]],
    max_candidates: int = 5,
    buffer_km: float = 1.0,
    search_km: float = 3.0,
) -> list[dict[str, Any]]:
    """
    Generate ranked subway corridor candidates from user waypoints.

    Input and output coordinate order is always [lat, lng] for frontend compatibility.
    """
    normalized_points = [_to_lat_lng_tuple(p) for p in waypoints_lat_lng]
    if len(normalized_points) < 2:
        raise ValueError("At least 2 waypoints are required")

    scored_hoods = _get_scored_neighbourhood_geometries()
    scored_projected = scored_hoods.to_crs(epsg=32617)

    candidates: list[dict[str, Any]] = []

    # Candidate 1: direct user-selected corridor.
    direct_metrics = _build_candidate_metrics(normalized_points, scored_projected, buffer_km)
    direct_metrics["candidate_id"] = "candidate_direct"
    direct_metrics["reason"] = "Direct corridor through user-selected waypoint sequence"
    candidates.append(direct_metrics)

    # Additional candidates: insert high-benefit centroids near each segment.
    centroid_series = gpd.GeoSeries(
        [Point(lng, lat) for lat, lng in zip(scored_hoods["centroid_lat"], scored_hoods["centroid_lng"])],
        crs="EPSG:4326",
    ).to_crs(epsg=32617)
    for i in range(len(normalized_points) - 1):
        a = normalized_points[i]
        b = normalized_points[i + 1]
        segment_line = _project_to_32617(_line_from_lat_lng([a, b]))
        seg_buffer = segment_line.buffer(search_km * 1000)
        nearby = scored_projected[centroid_series.intersects(seg_buffer)].copy()
        if nearby.empty:
            continue

        pivot = nearby.sort_values("benefit_score", ascending=False).iloc[0]
        pivot_point = (float(pivot["centroid_lat"]), float(pivot["centroid_lng"]))

        variant = normalized_points[: i + 1] + [pivot_point] + normalized_points[i + 1 :]
        metrics = _build_candidate_metrics(variant, scored_projected, buffer_km)
        metrics["candidate_id"] = f"candidate_via_{i + 1}"
        metrics["reason"] = (
            f"Detour via high-need neighbourhood '{_coerce_str(pivot['neighbourhood'])}' "
            f"between waypoint {i + 1} and {i + 2}"
        )
        candidates.append(metrics)

    # Deduplicate by normalized path signature.
    dedup: dict[str, dict[str, Any]] = {}
    for candidate in candidates:
        signature = "|".join(
            [f"{round(point[0], 5)},{round(point[1], 5)}" for point in candidate["path_lat_lng"]]
        )
        existing = dedup.get(signature)
        if existing is None or candidate["candidate_score"] > existing["candidate_score"]:
            dedup[signature] = candidate

    ranked = sorted(dedup.values(), key=lambda c: c["candidate_score"], reverse=True)
    for index, candidate in enumerate(ranked[:max_candidates], start=1):
        candidate["rank"] = index
    return ranked[:max_candidates]


def build_llm_route_package(
    waypoints_lat_lng: Sequence[tuple[float, float] | list[float]],
    max_candidates: int = 5,
    buffer_km: float = 1.0,
    search_km: float = 3.0,
    intersection_min_total_vehicle: int = 5000,
    intersection_buffer_km: float = 0.5,
) -> dict[str, Any]:
    """
    Build an LLM-ready payload to rank subway route candidates and return best line shapes.

    Includes:
    - candidate metrics,
    - intersected neighbourhood and intersection context,
    - strict output schema the LLM should follow.
    """
    normalized_waypoints = [_to_lat_lng_tuple(p) for p in waypoints_lat_lng]
    candidates = generate_subway_route_candidates(
        waypoints_lat_lng=normalized_waypoints,
        max_candidates=max_candidates,
        buffer_km=buffer_km,
        search_km=search_km,
    )

    intersections_projected = _get_intersections_projected_cached(intersection_min_total_vehicle)

    enriched_candidates = []
    for candidate in candidates:
        path_lat_lng = [
            _to_lat_lng_tuple(point)
            for point in candidate.get("path_lat_lng", [])
        ]
        intersection_summary = _intersection_summary_for_path(
            candidate_path=path_lat_lng,
            intersections_projected=intersections_projected,
            buffer_km=intersection_buffer_km,
        )

        enriched_candidates.append(
            {
                "candidate_id": candidate.get("candidate_id"),
                "rank": candidate.get("rank"),
                "reason": candidate.get("reason"),
                "candidate_score": candidate.get("candidate_score"),
                "length_km": candidate.get("length_km"),
                "avg_benefit_score": candidate.get("avg_benefit_score"),
                "population_served": candidate.get("population_served"),
                "traffic_served": candidate.get("traffic_served"),
                "covered_neighbourhoods": candidate.get("covered_neighbourhoods", []),
                "intersection_summary": intersection_summary,
                "line_shape_geojson": _line_shape_geojson_from_lat_lng(path_lat_lng),
                "path_lat_lng": [[lat, lng] for lat, lng in path_lat_lng],
            }
        )

    llm_instruction = (
        "You are a transit planning assistant. Rank and refine subway route candidates based on: "
        "coverage of high-benefit neighbourhoods, traffic relief potential, line feasibility and directness. "
        "Return up to 3 best routes. Preserve coordinate integrity and use candidate geometry as source of truth."
    )

    llm_output_schema = {
        "type": "object",
        "properties": {
            "selected_routes": {
                "type": "array",
                "maxItems": 3,
                "items": {
                    "type": "object",
                    "properties": {
                        "candidate_id": {"type": "string"},
                        "rank": {"type": "integer"},
                        "why": {"type": "string"},
                        "line_shape_geojson": {
                            "type": "object",
                            "properties": {
                                "type": {"const": "LineString"},
                                "coordinates": {
                                    "type": "array",
                                    "items": {
                                        "type": "array",
                                        "minItems": 2,
                                        "maxItems": 2,
                                        "items": {"type": "number"},
                                    },
                                },
                            },
                            "required": ["type", "coordinates"],
                        },
                    },
                    "required": ["candidate_id", "rank", "why", "line_shape_geojson"],
                },
            }
        },
        "required": ["selected_routes"],
    }

    return {
        "input_waypoints_lat_lng": [[lat, lng] for lat, lng in normalized_waypoints],
        "candidate_count": len(enriched_candidates),
        "candidates": enriched_candidates,
        "llm_prompt": {
            "system": llm_instruction,
            "user": {
                "planning_objective": (
                    "Propose best subway line shapes connecting the provided waypoints while maximizing neighbourhood transit benefit and relieving traffic."
                ),
                "constraints": {
                    "use_candidate_geometry_only": True,
                    "max_routes": 3,
                },
                "candidates": enriched_candidates,
            },
            "output_schema": llm_output_schema,
        },
    }


def load_rail_lines_from_gtfs() -> gpd.GeoDataFrame:
    """Build rail line geometries from GTFS routes, trips, and shapes."""
    routes = pd.read_csv(GTFS_DIR / "routes.txt", usecols=["route_id", "route_short_name", "route_long_name", "route_type"])
    trips = pd.read_csv(GTFS_DIR / "trips.txt", usecols=["route_id", "shape_id"]).dropna()
    shapes = pd.read_csv(
        GTFS_DIR / "shapes.txt",
        usecols=["shape_id", "shape_pt_lat", "shape_pt_lon", "shape_pt_sequence"],
    )

    # GTFS route_type=1 is subway/metro. Keep route_type=2 as well for completeness.
    rail_routes = routes[routes["route_type"].isin([1, 2])]
    rail_trips = trips.merge(rail_routes, on="route_id", how="inner").drop_duplicates(subset=["route_id", "shape_id"])

    rail_shape_points = shapes[shapes["shape_id"].isin(rail_trips["shape_id"])].copy()
    rail_shape_points.sort_values(["shape_id", "shape_pt_sequence"], inplace=True)

    lines = []
    route_lookup: dict[int, dict[str, Any]] = {
        _coerce_int(row["shape_id"]): {
            "route_id": row["route_id"],
            "route_short_name": row["route_short_name"],
            "route_long_name": row["route_long_name"],
            "route_type": row["route_type"],
        }
        for _, row in rail_trips.drop_duplicates(subset="shape_id").iterrows()
    }

    for shape_id, group in rail_shape_points.groupby("shape_id", sort=False):
        if len(group) < 2:
            continue

        line = LineString(zip(group["shape_pt_lon"], group["shape_pt_lat"]))
        route_meta = route_lookup.get(_coerce_int(shape_id))
        if route_meta is None:
            continue

        lines.append(
            {
                "shape_id": _coerce_int(shape_id),
                "route_id": _coerce_int(route_meta["route_id"]),
                "route_short_name": _coerce_str(route_meta["route_short_name"]),
                "route_long_name": _coerce_str(route_meta["route_long_name"]),
                "route_type": _coerce_int(route_meta["route_type"]),
                "geometry": line,
            }
        )

    return gpd.GeoDataFrame(lines, geometry="geometry", crs="EPSG:4326")


def load_transit_benefit_scores(
    density_weight: float = 0.35,
    traffic_weight: float = 0.30,
    distance_weight: float = 0.35,
) -> pd.DataFrame:
    """
    Score neighbourhoods by potential benefit from more transit service.

    Higher score means:
    - higher population density,
    - higher traffic volume,
    - farther from existing rail lines.
    """
    total_weight = density_weight + traffic_weight + distance_weight
    if total_weight <= 0:
        raise ValueError("At least one weight must be greater than 0")

    density_df = load_neighbourhood_density()[["neighbourhood", "population", "area_km2", "density_per_km2"]]
    traffic_df = load_traffic_by_neighbourhood()[
        ["neighbourhood", "count_locations", "avg_daily_vehicles", "max_daily_vehicles"]
    ]

    neighbourhoods = gpd.read_file(NEIGHBOURHOOD_GEOSHAPES)
    neighbourhoods = neighbourhoods[["AREA_NAME", "geometry"]].rename(columns={"AREA_NAME": "neighbourhood"})

    rail_lines = load_rail_lines_from_gtfs()
    if rail_lines.empty:
        raise ValueError("No rail line geometries could be built from GTFS data")

    neighbourhoods_projected = neighbourhoods.to_crs(epsg=32617)
    rail_network = rail_lines.to_crs(epsg=32617).union_all()
    neighbourhoods_projected["distance_to_rail_km"] = neighbourhoods_projected.geometry.distance(rail_network) / 1000

    dist_df = neighbourhoods_projected[["neighbourhood", "distance_to_rail_km"]]

    merged = density_df.merge(traffic_df, on="neighbourhood", how="left")
    merged = merged.merge(dist_df, on="neighbourhood", how="left")

    merged["count_locations"] = merged["count_locations"].fillna(0).astype(int)
    merged["avg_daily_vehicles"] = merged["avg_daily_vehicles"].fillna(0.0)
    merged["max_daily_vehicles"] = merged["max_daily_vehicles"].fillna(0.0)
    merged["distance_to_rail_km"] = merged["distance_to_rail_km"].fillna(merged["distance_to_rail_km"].max())

    density_norm = _normalize(merged["density_per_km2"])
    traffic_norm = _normalize(merged["avg_daily_vehicles"])
    distance_norm = _normalize(merged["distance_to_rail_km"])

    merged["density_score"] = density_norm.round(4)
    merged["traffic_score"] = traffic_norm.round(4)
    merged["distance_score"] = distance_norm.round(4)

    merged["benefit_score"] = (
        100
        * (
            (density_weight / total_weight) * density_norm
            + (traffic_weight / total_weight) * traffic_norm
            + (distance_weight / total_weight) * distance_norm
        )
    ).round(2)

    merged = merged.sort_values("benefit_score", ascending=False).reset_index(drop=True)
    merged["benefit_rank"] = merged.index + 1

    return merged[
        [
            "benefit_rank",
            "neighbourhood",
            "benefit_score",
            "population",
            "area_km2",
            "density_per_km2",
            "count_locations",
            "avg_daily_vehicles",
            "max_daily_vehicles",
            "distance_to_rail_km",
            "density_score",
            "traffic_score",
            "distance_score",
        ]
    ]


def load_transit_benefit_geojson(
    density_weight: float = 0.35,
    traffic_weight: float = 0.30,
    distance_weight: float = 0.35,
) -> dict[str, Any]:
    """Return neighbourhood polygons with transit benefit score properties."""
    scored = load_transit_benefit_scores(
        density_weight=density_weight,
        traffic_weight=traffic_weight,
        distance_weight=distance_weight,
    )

    hoods = gpd.read_file(NEIGHBOURHOOD_GEOSHAPES)
    hoods = hoods[["AREA_NAME", "geometry"]].rename(columns={"AREA_NAME": "neighbourhood"})
    merged = hoods.merge(scored, on="neighbourhood", how="left")

    features = []
    for _, row in merged.iterrows():
        feature = {
            "type": "Feature",
            "geometry": json.loads(gpd.GeoSeries([row.geometry]).to_json())["features"][0]["geometry"],
            "properties": {
                "benefit_rank": int(row["benefit_rank"]) if pd.notna(row["benefit_rank"]) else 0,
                "neighbourhood": row["neighbourhood"],
                "benefit_score": round(float(row["benefit_score"]), 2) if pd.notna(row["benefit_score"]) else 0,
                "population": int(row["population"]) if pd.notna(row["population"]) else 0,
                "area_km2": round(float(row["area_km2"]), 4) if pd.notna(row["area_km2"]) else 0,
                "density_per_km2": round(float(row["density_per_km2"]), 2) if pd.notna(row["density_per_km2"]) else 0,
                "count_locations": int(row["count_locations"]) if pd.notna(row["count_locations"]) else 0,
                "avg_daily_vehicles": round(float(row["avg_daily_vehicles"]), 2) if pd.notna(row["avg_daily_vehicles"]) else 0,
                "max_daily_vehicles": round(float(row["max_daily_vehicles"]), 2) if pd.notna(row["max_daily_vehicles"]) else 0,
                "distance_to_rail_km": round(float(row["distance_to_rail_km"]), 3) if pd.notna(row["distance_to_rail_km"]) else 0,
                "density_score": round(float(row["density_score"]), 4) if pd.notna(row["density_score"]) else 0,
                "traffic_score": round(float(row["traffic_score"]), 4) if pd.notna(row["traffic_score"]) else 0,
                "distance_score": round(float(row["distance_score"]), 4) if pd.notna(row["distance_score"]) else 0,
            },
        }
        features.append(feature)

    return {"type": "FeatureCollection", "features": features}


def build_route_optimization_context(
    waypoints_lat_lng: Sequence[tuple[float, float] | list[float]],
    search_radius_km: float = 5.0,
    max_neighbourhoods: int = 20,
    max_intersections: int = 15,
    num_routes: int = 3,
    max_candidates: int = 5,
    buffer_km: float = 1.0,
) -> dict[str, Any]:
    """
    Build comprehensive context for Gemini route optimization.
    
    Gathers neighbourhood scores, traffic intersections, and candidate routes
    within the search radius of user waypoints.
    
    Args:
        waypoints_lat_lng: User-selected waypoints as [lat, lng] pairs
        search_radius_km: Radius to search for relevant neighbourhoods
        max_neighbourhoods: Maximum neighbourhoods to include in context
        max_intersections: Maximum traffic intersections to include
        num_routes: Number of route options to generate
        max_candidates: Number of pre-computed candidates to include
        buffer_km: Buffer for candidate route scoring
    
    Returns:
        Dict ready to pass to Gemini's generate_optimized_routes()
    """
    normalized_waypoints = [_to_lat_lng_tuple(p) for p in waypoints_lat_lng]
    if len(normalized_waypoints) < 2:
        raise ValueError("At least 2 waypoints are required")

    # Get scored neighbourhoods
    scored_hoods = _get_scored_neighbourhood_geometries()
    scored_projected = scored_hoods.to_crs(epsg=32617)

    # Create a buffered corridor around waypoints to find relevant neighbourhoods
    corridor_line = _project_to_32617(_line_from_lat_lng(normalized_waypoints))
    corridor_buffer = corridor_line.buffer(search_radius_km * 1000)

    # Find neighbourhoods intersecting the corridor
    nearby_hoods = scored_projected[scored_projected.geometry.intersects(corridor_buffer)].copy()
    
    # Sort by benefit score and take top N
    nearby_hoods = nearby_hoods.sort_values("benefit_score", ascending=False).head(max_neighbourhoods)

    # Build neighbourhood context for LLM
    neighbourhood_context = []
    for _, row in nearby_hoods.iterrows():
        neighbourhood_context.append({
            "name": _coerce_str(row["neighbourhood"]),
            "benefit_score": round(float(row["benefit_score"]), 2) if pd.notna(row["benefit_score"]) else 0,
            "population": _coerce_int(row["population"]) if pd.notna(row["population"]) else 0,
            "density_per_km2": round(float(row["density_per_km2"]), 2) if pd.notna(row["density_per_km2"]) else 0,
            "avg_daily_vehicles": round(float(row["avg_daily_vehicles"]), 2) if pd.notna(row["avg_daily_vehicles"]) else 0,
            "distance_to_rail_km": round(float(row["distance_to_rail_km"]), 3) if pd.notna(row["distance_to_rail_km"]) else 0,
            "centroid_lat": round(float(row["centroid_lat"]), 6) if pd.notna(row["centroid_lat"]) else 0,
            "centroid_lng": round(float(row["centroid_lng"]), 6) if pd.notna(row["centroid_lng"]) else 0,
        })

    # Get high-traffic intersections near the corridor
    intersections_projected = _get_intersections_projected_cached(min_total_vehicle=5000)
    nearby_intersections = intersections_projected[
        intersections_projected.geometry.intersects(corridor_buffer)
    ].copy()
    nearby_intersections = nearby_intersections.sort_values("total_vehicle", ascending=False).head(max_intersections)

    traffic_context = [
        {
            "location_name": _coerce_str(row["location_name"]),
            "latitude": round(float(row["latitude"]), 6),
            "longitude": round(float(row["longitude"]), 6),
            "total_vehicle": _coerce_int(row["total_vehicle"]),
        }
        for _, row in nearby_intersections.iterrows()
    ]

    # Generate pre-computed candidate routes for reference
    candidates = generate_subway_route_candidates(
        waypoints_lat_lng=normalized_waypoints,
        max_candidates=max_candidates,
        buffer_km=buffer_km,
        search_km=search_radius_km,
    )

    # Simplify candidate data for LLM context
    candidate_reference = [
        {
            "candidate_id": c.get("candidate_id"),
            "reason": c.get("reason"),
            "candidate_score": c.get("candidate_score"),
            "length_km": c.get("length_km"),
            "avg_benefit_score": c.get("avg_benefit_score"),
            "population_served": c.get("population_served"),
            "path_lat_lng": c.get("path_lat_lng"),
            "covered_neighbourhoods": [
                n.get("neighbourhood") for n in c.get("covered_neighbourhoods", [])
            ],
        }
        for c in candidates
    ]

    return {
        "user_waypoints": [[lat, lng] for lat, lng in normalized_waypoints],
        "neighbourhoods": neighbourhood_context,
        "traffic_intersections": traffic_context,
        "existing_candidates": candidate_reference,
        "constraints": {
            "num_routes": num_routes,
            "max_length_km": 30,
            "prioritize": "balanced",
        },
    }


if __name__ == "__main__":
    print(load_transit_benefit_scores().head(20).to_string(index=False))
