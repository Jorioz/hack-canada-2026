from pathlib import Path
import json
from typing import Any

import geopandas as gpd
import pandas as pd
from shapely.geometry import LineString

from api.utils.density import load_neighbourhood_density
from api.utils.traffic import load_traffic_by_neighbourhood

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


if __name__ == "__main__":
    print(load_transit_benefit_scores().head(20).to_string(index=False))
