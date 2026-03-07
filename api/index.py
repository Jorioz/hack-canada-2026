from fastapi import FastAPI
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

import json

@app.get("/api/py/transit-lines")
def get_transit_lines():
    try:
        with open("app/data/ttc_routes.json", "r", encoding="utf-8") as f:
            routes = json.load(f)
        logger.info("GET /api/py/transit-lines success: returned %d routes", len(routes))
        return routes
    except Exception as e:
        logger.error(f"Failed to load transit lines: {e}")
        return {"error": "Internal Server Error"}
