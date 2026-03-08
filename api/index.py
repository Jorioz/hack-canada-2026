from fastapi import FastAPI, Query
from fastapi.responses import JSONResponse
import logging
from pydantic import BaseModel, Field
from api.data_service import DataService
from api.utils.transit import (
    load_transit_benefit_scores,
    load_transit_benefit_geojson,
    generate_subway_route_candidates,
)

app = FastAPI(docs_url="/api/py/docs", openapi_url="/api/py/openapi.json")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

data = DataService()


class RouteCandidateRequest(BaseModel):
    waypoints_lat_lng: list[tuple[float, float]] = Field(min_length=2)
    max_candidates: int = Field(default=5, ge=1, le=20)
    buffer_km: float = Field(default=1.0, gt=0, le=5.0)
    search_km: float = Field(default=3.0, gt=0, le=10.0)

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


@app.get("/api/py/transit/benefit")
def get_transit_benefit_scores(
    density_weight: float = Query(default=0.35, ge=0),
    traffic_weight: float = Query(default=0.30, ge=0),
    distance_weight: float = Query(default=0.35, ge=0),
):
    use_default_weights = (
        density_weight == 0.35 and traffic_weight == 0.30 and distance_weight == 0.35
    )

    if use_default_weights:
        result = data.transit_benefit.to_dict(orient="records")
    else:
        result = load_transit_benefit_scores(
            density_weight=density_weight,
            traffic_weight=traffic_weight,
            distance_weight=distance_weight,
        ).to_dict(orient="records")

    logger.info(
        "GET /api/py/transit/benefit success: returned %d neighbourhoods (w=%.2f/%.2f/%.2f)",
        len(result),
        density_weight,
        traffic_weight,
        distance_weight,
    )
    return result


@app.get("/api/py/transit/benefit/geojson")
def get_transit_benefit_geojson(
    density_weight: float = Query(default=0.35, ge=0),
    traffic_weight: float = Query(default=0.30, ge=0),
    distance_weight: float = Query(default=0.35, ge=0),
):
    use_default_weights = (
        density_weight == 0.35 and traffic_weight == 0.30 and distance_weight == 0.35
    )

    if use_default_weights:
        geojson = data.transit_benefit_geojson
    else:
        geojson = load_transit_benefit_geojson(
            density_weight=density_weight,
            traffic_weight=traffic_weight,
            distance_weight=distance_weight,
        )

    logger.info(
        "GET /api/py/transit/benefit/geojson success: returned %d features (w=%.2f/%.2f/%.2f)",
        len(geojson["features"]),
        density_weight,
        traffic_weight,
        distance_weight,
    )
    return JSONResponse(content=geojson)


@app.post("/api/py/transit/route/candidates")
def get_subway_route_candidates(payload: RouteCandidateRequest):
    candidates = generate_subway_route_candidates(
        waypoints_lat_lng=payload.waypoints_lat_lng,
        max_candidates=payload.max_candidates,
        buffer_km=payload.buffer_km,
        search_km=payload.search_km,
    )

    logger.info(
        "POST /api/py/transit/route/candidates success: %d candidates from %d waypoints",
        len(candidates),
        len(payload.waypoints_lat_lng),
    )
    return {
        "waypoints_lat_lng": [[lat, lng] for lat, lng in payload.waypoints_lat_lng],
        "candidate_count": len(candidates),
        "candidates": candidates,
    }
