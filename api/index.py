from fastapi import FastAPI
<<<<<<< HEAD
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

@app.get("/api/py/density/{neighbourhood}")
def get_density_by_neighbourhood(neighbourhood: str):
    match = data.density[data.density["neighbourhood"].str.lower() == neighbourhood.lower()]
    if match.empty:
        return {"error": f"Neighbourhood '{neighbourhood}' not found"}
    result = match[["neighbourhood", "population", "area_km2", "density_per_km2"]].to_dict(orient="records")[0]
    logger.info("GET /api/py/density/%s success", neighbourhood)
    return result
=======

### Create FastAPI instance with custom docs and openapi url
app = FastAPI(docs_url="/api/py/docs", openapi_url="/api/py/openapi.json")

@app.get("/api/py/helloFastApi")
def hello_fast_api():
    return {"message": "Hello from FastAPI"}
>>>>>>> master
