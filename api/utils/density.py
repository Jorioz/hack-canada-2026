from pathlib import Path
import json
import pandas as pd
import geopandas as gpd

DATA_DIR = Path(__file__).parent.parent / 'data'
NEIGHBOURHOOD_DATA = 'neighbourhood-profiles-2021-158-model.xlsx'
NEIGHBOURHOOD_GEOSHAPES = 'Neighbourhoods - 4326.geojson'

def load_neighbourhood_density() -> pd.DataFrame:
    file_path = DATA_DIR / NEIGHBOURHOOD_DATA
    raw = pd.read_excel(file_path, header=None)

    neighbourhoods = raw.iloc[0, 1:].tolist()
    population = raw.iloc[3, 1:].tolist()

    pop_df = pd.DataFrame({'neighbourhood': neighbourhoods, 'population': population})

    gdf = gpd.read_file(DATA_DIR / NEIGHBOURHOOD_GEOSHAPES)
    gdf = gdf.to_crs(epsg=32617)
    gdf['area_km2'] = gdf.geometry.area / 1e6

    area_df = gdf[['AREA_NAME', 'area_km2']].rename(columns={'AREA_NAME': 'neighbourhood'})

    merged = pop_df.merge(area_df, on='neighbourhood')
    merged['density_per_km2'] = merged['population'] / merged['area_km2']

    return merged


def load_density_geojson() -> dict:
    """Return a GeoJSON FeatureCollection with density properties on each neighbourhood."""
    density_df = load_neighbourhood_density()

    gdf = gpd.read_file(DATA_DIR / NEIGHBOURHOOD_GEOSHAPES)
    # Keep original CRS (4326) for frontend map display
    gdf = gdf.rename(columns={'AREA_NAME': 'neighbourhood'})

    merged = gdf.merge(density_df[['neighbourhood', 'population', 'area_km2', 'density_per_km2']],
                       on='neighbourhood', how='left')

    # Build a clean GeoJSON FeatureCollection
    features = []
    for _, row in merged.iterrows():
        feature = {
            "type": "Feature",
            "geometry": json.loads(gpd.GeoSeries([row.geometry]).to_json())["features"][0]["geometry"],
            "properties": {
                "neighbourhood": row["neighbourhood"],
                "population": float(row["population"]) if pd.notna(row["population"]) else 0,
                "area_km2": round(float(row["area_km2"]), 4) if pd.notna(row["area_km2"]) else 0,
                "density_per_km2": round(float(row["density_per_km2"]), 2) if pd.notna(row["density_per_km2"]) else 0,
            }
        }
        features.append(feature)

    return {"type": "FeatureCollection", "features": features}


if __name__ == "__main__":
    print(load_neighbourhood_density().to_string())


