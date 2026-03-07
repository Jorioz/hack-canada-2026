from fastapi import FastAPI, Query
from fastapi.responses import JSONResponse
import logging
from api.data_service import DataService

app = FastAPI(docs_url="/api/py/docs", openapi_url="/api/py/openapi.json")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

data = DataService()

@app.get("/api/py/density")
def get_density():
    result = data.density[["neighbourhood", "population", "area_km2", "density_per_km2"]].to_dict(orient="records")
    logger.info("GET /api/py/density success: returned %d neighbourhoods", len(result))
    return result

@app.get("/api/py/density/geojson")
def get_density_geojson():
    logger.info("GET /api/py/density/geojson success: returned %d features", len(data.density_geojson["features"]))
    return JSONResponse(content=data.density_geojson)

@app.get("/api/py/density/{neighbourhood}")
def get_density_by_neighbourhood(neighbourhood: str):
    match = data.density[data.density["neighbourhood"].str.lower() == neighbourhood.lower()]
    if match.empty:
        return {"error": f"Neighbourhood '{neighbourhood}' not found"}
    result = match[["neighbourhood", "population", "area_km2", "density_per_km2"]].to_dict(orient="records")[0]
    logger.info("GET /api/py/density/%s success", neighbourhood)
    return result

@app.get("/api/py/traffic")
def get_traffic():
    result = data.traffic.to_dict(orient="records")
    logger.info("GET /api/py/traffic success: returned %d neighbourhoods", len(result))
    return result

@app.get("/api/py/traffic/geojson")
def get_traffic_geojson():
    logger.info("GET /api/py/traffic/geojson success: returned %d features", len(data.traffic_geojson["features"]))
    return JSONResponse(content=data.traffic_geojson)

@app.get("/api/py/traffic/intersections")
def get_traffic_intersections(
    min_total_vehicle: int = Query(default=30000, ge=0),
    limit: int | None = Query(default=None, ge=1),
):
    result = [
        item
        for item in data.traffic_intersections
        if item["total_vehicle"] >= min_total_vehicle
    ]
    if limit is not None:
        result = result[:limit]

    logger.info(
        "GET /api/py/traffic/intersections success: returned %d intersections (min_total_vehicle=%d)",
        len(result),
        min_total_vehicle,
    )
    return result

@app.get("/api/py/traffic/{neighbourhood}")
def get_traffic_by_neighbourhood(neighbourhood: str):
    match = data.traffic[data.traffic["neighbourhood"].str.lower() == neighbourhood.lower()]
    if match.empty:
        return {"error": f"Neighbourhood '{neighbourhood}' not found"}
    result = match.to_dict(orient="records")[0]
    logger.info("GET /api/py/traffic/%s success", neighbourhood)
    return result
