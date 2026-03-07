from pathlib import Path
import json
import pandas as pd
import geopandas as gpd
from shapely.geometry import Point

DATA_DIR = Path(__file__).parent.parent / 'data'
TRAFFIC_CSV = DATA_DIR / 'traffic' / 'tmc_summary_data.csv'
NEIGHBOURHOOD_GEOSHAPES = DATA_DIR / 'Neighbourhoods - 4326.geojson'


def load_traffic_by_neighbourhood() -> pd.DataFrame:
    """Spatially join traffic counts to neighbourhoods and aggregate per neighbourhood."""
    df = pd.read_csv(TRAFFIC_CSV)

    # Build GeoDataFrame from traffic points
    geometry = [Point(lon, lat) for lon, lat in zip(df['longitude'], df['latitude'])]
    traffic_gdf = gpd.GeoDataFrame(df, geometry=geometry, crs='EPSG:4326')

    # Load neighbourhood polygons
    hoods = gpd.read_file(NEIGHBOURHOOD_GEOSHAPES)
    hoods = hoods[['AREA_NAME', 'geometry']].rename(columns={'AREA_NAME': 'neighbourhood'})

    # Spatial join: assign each traffic point to its neighbourhood
    joined = gpd.sjoin(traffic_gdf, hoods, how='inner', predicate='within')

    # Aggregate per neighbourhood
    agg = joined.groupby('neighbourhood').agg(
        count_locations=('count_id', 'nunique'),
        total_counts=('count_id', 'count'),
        avg_daily_vehicles=('total_vehicle', 'mean'),
        max_daily_vehicles=('total_vehicle', 'max'),
        avg_daily_bikes=('total_bike', 'mean'),
        avg_daily_pedestrians=('total_pedestrian', 'mean'),
        avg_am_peak_vehicles=('am_peak_vehicle', 'mean'),
        avg_pm_peak_vehicles=('pm_peak_vehicle', 'mean'),
    ).reset_index()

    # Round floats
    for col in agg.select_dtypes(include='float').columns:
        agg[col] = agg[col].round(1)

    return agg


def load_traffic_geojson() -> dict:
    """Return a GeoJSON FeatureCollection with traffic stats per neighbourhood."""
    traffic_df = load_traffic_by_neighbourhood()

    hoods = gpd.read_file(NEIGHBOURHOOD_GEOSHAPES)
    hoods = hoods[['AREA_NAME', 'geometry']].rename(columns={'AREA_NAME': 'neighbourhood'})

    merged = hoods.merge(traffic_df, on='neighbourhood', how='left')

    features = []
    for _, row in merged.iterrows():
        feature = {
            "type": "Feature",
            "geometry": json.loads(gpd.GeoSeries([row.geometry]).to_json())["features"][0]["geometry"],
            "properties": {
                "neighbourhood": row["neighbourhood"],
                "count_locations": int(row["count_locations"]) if pd.notna(row["count_locations"]) else 0,
                "total_counts": int(row["total_counts"]) if pd.notna(row["total_counts"]) else 0,
                "avg_daily_vehicles": float(row["avg_daily_vehicles"]) if pd.notna(row["avg_daily_vehicles"]) else 0,
                "max_daily_vehicles": float(row["max_daily_vehicles"]) if pd.notna(row["max_daily_vehicles"]) else 0,
                "avg_daily_bikes": float(row["avg_daily_bikes"]) if pd.notna(row["avg_daily_bikes"]) else 0,
                "avg_daily_pedestrians": float(row["avg_daily_pedestrians"]) if pd.notna(row["avg_daily_pedestrians"]) else 0,
                "avg_am_peak_vehicles": float(row["avg_am_peak_vehicles"]) if pd.notna(row["avg_am_peak_vehicles"]) else 0,
                "avg_pm_peak_vehicles": float(row["avg_pm_peak_vehicles"]) if pd.notna(row["avg_pm_peak_vehicles"]) else 0,
            }
        }
        features.append(feature)

    return {"type": "FeatureCollection", "features": features}


def load_top_intersections(min_total_vehicle: int = 0, limit: int | None = None) -> list[dict]:
    """Return intersections filtered by minimum vehicle count, deduplicated by location."""
    df = pd.read_csv(TRAFFIC_CSV)

    # Keep the most recent count per unique location
    df = df.sort_values('count_date', ascending=False).drop_duplicates(subset='location_name', keep='first')

    filtered = df[df['total_vehicle'] >= min_total_vehicle]
    if limit is not None:
        filtered = filtered.nlargest(limit, 'total_vehicle')

    records = []
    for _, row in filtered.iterrows():
        records.append({
            "location_name": row["location_name"],
            "latitude": round(float(row["latitude"]), 6),
            "longitude": round(float(row["longitude"]), 6),
            "total_vehicle": int(row["total_vehicle"]),
            "total_bike": int(row["total_bike"]) if pd.notna(row["total_bike"]) else 0,
            "total_pedestrian": int(row["total_pedestrian"]) if pd.notna(row["total_pedestrian"]) else 0,
            "am_peak_vehicle": int(row["am_peak_vehicle"]) if pd.notna(row["am_peak_vehicle"]) else 0,
            "pm_peak_vehicle": int(row["pm_peak_vehicle"]) if pd.notna(row["pm_peak_vehicle"]) else 0,
        })

    return records


if __name__ == "__main__":
    print(load_traffic_by_neighbourhood().to_string())
