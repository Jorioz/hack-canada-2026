from fastapi import FastAPI, Query, HTTPException
from fastapi.responses import JSONResponse
import logging
from pydantic import BaseModel, Field
from typing import Literal
from api.data_service import DataService
from api.utils.transit import (
    load_transit_benefit_scores,
    load_transit_benefit_geojson,
    generate_subway_route_candidates,
    build_llm_route_package,
    build_route_optimization_context,
)
from api.utils.gemini import generate_optimized_routes, rank_subway_routes

app = FastAPI(docs_url="/api/py/docs", openapi_url="/api/py/openapi.json")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

data = DataService()


class RouteCandidateRequest(BaseModel):
    waypoints_lat_lng: list[tuple[float, float]] = Field(min_length=2)
    max_candidates: int = Field(default=5, ge=1, le=20)
    buffer_km: float = Field(default=1.0, gt=0, le=5.0)
    search_km: float = Field(default=3.0, gt=0, le=10.0)


class RouteLLMPackageRequest(BaseModel):
    waypoints_lat_lng: list[tuple[float, float]] = Field(min_length=2)
    max_candidates: int = Field(default=5, ge=1, le=20)
    buffer_km: float = Field(default=1.0, gt=0, le=5.0)
    search_km: float = Field(default=3.0, gt=0, le=10.0)
    intersection_min_total_vehicle: int = Field(default=5000, ge=0)
    intersection_buffer_km: float = Field(default=0.5, gt=0, le=3.0)

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


@app.post("/api/py/transit/route/llm-package")
def get_subway_route_llm_package(payload: RouteLLMPackageRequest):
    llm_package = build_llm_route_package(
        waypoints_lat_lng=payload.waypoints_lat_lng,
        max_candidates=payload.max_candidates,
        buffer_km=payload.buffer_km,
        search_km=payload.search_km,
        intersection_min_total_vehicle=payload.intersection_min_total_vehicle,
        intersection_buffer_km=payload.intersection_buffer_km,
    )

    logger.info(
        "POST /api/py/transit/route/llm-package success: %d candidates from %d waypoints",
        llm_package.get("candidate_count", 0),
        len(payload.waypoints_lat_lng),
    )
    return llm_package


class RouteOptimizationRequest(BaseModel):
    """Request body for AI-powered route optimization."""
    waypoints_lat_lng: list[tuple[float, float]] = Field(
        min_length=2,
        description="User-selected waypoints as [lat, lng] pairs. Minimum 2 required."
    )
    # Primary params
    num_routes: int = Field(
        default=3, ge=1, le=5,
        description="Number of route options to generate"
    )
    search_radius_km: float = Field(
        default=5.0, gt=0, le=15.0,
        description="Radius to search for relevant neighbourhoods around the corridor"
    )
    max_neighbourhoods: int = Field(
        default=20, ge=5, le=50,
        description="Maximum neighbourhoods to include in context"
    )
    prioritize: Literal["balanced", "coverage", "directness", "traffic_relief"] = Field(
        default="balanced",
        description="Optimization priority: balanced, coverage, directness, or traffic_relief"
    )
    # Aliases for compatibility with frontend/candidates endpoint params
    max_candidates: int | None = Field(
        default=None,
        description="Alias for num_routes (for compatibility)"
    )
    buffer_km: float | None = Field(
        default=None,
        description="Buffer for route scoring (for compatibility)"
    )
    search_km: float | None = Field(
        default=None,
        description="Alias for search_radius_km (for compatibility)"
    )


class RouteOptimizationResponse(BaseModel):
    """Response from AI-powered route optimization."""
    success: bool
    waypoints_lat_lng: list[list[float]]  # Match frontend expectation
    candidate_count: int
    candidates: list[dict]  # Mapped from Gemini routes
    analysis_summary: str
    context_summary: dict
    corridor_insights: dict | None = None  # Overall corridor analysis


@app.post("/api/py/transit/route/optimize", response_model=RouteOptimizationResponse)
def optimize_transit_routes(payload: RouteOptimizationRequest):
    """
    Generate optimized transit routes using AI analysis.
    
    Flow:
    1. Takes user pins (waypoints) from POST
    2. Identifies neighbourhoods the corridor passes through
    3. Gets scores, density, traffic data for those neighbourhoods
    4. Passes context to Gemini API for intelligent route reasoning
    5. Returns multiple route options with full lat-lng coordinates
    
    Each returned route includes:
    - path_lat_lng: [[lat, lng], ...] for drawing on map (frontend compatible)
    - candidate_score for ranking
    - reason for user display
    """
    try:
        # Resolve aliased parameters for frontend compatibility
        num_routes = payload.max_candidates if payload.max_candidates else payload.num_routes
        search_radius = payload.search_km if payload.search_km else payload.search_radius_km

        # Build context from user waypoints
        context = build_route_optimization_context(
            waypoints_lat_lng=payload.waypoints_lat_lng,
            search_radius_km=search_radius,
            max_neighbourhoods=payload.max_neighbourhoods,
            num_routes=num_routes,
        )
        
        # Update constraints based on user preference
        context["constraints"]["prioritize"] = payload.prioritize
        context["constraints"]["num_routes"] = num_routes

        # Debug: Print context summary to console
        print("\n" + "="*60)
        print("ROUTE OPTIMIZATION REQUEST")
        print("="*60)
        print(f"User Waypoints: {context['user_waypoints']}")
        print(f"Neighbourhoods in context: {len(context['neighbourhoods'])}")
        for n in context['neighbourhoods'][:5]:
            print(f"  - {n['name']}: score={n['benefit_score']}, pop={n['population']}")
        if len(context['neighbourhoods']) > 5:
            print(f"  ... and {len(context['neighbourhoods']) - 5} more")
        print(f"Traffic intersections: {len(context['traffic_intersections'])}")
        print(f"Candidate routes: {len(context['existing_candidates'])}")
        print(f"Constraints: {context['constraints']}")
        print("="*60)
        print("Calling Gemini API...")

        # Call Gemini for intelligent route generation
        gemini_response = generate_optimized_routes(context)

        # Debug: Print Gemini response
        print("\n" + "="*60)
        print("GEMINI RESPONSE")
        print("="*60)
        print(f"Analysis: {gemini_response.get('analysis_summary', 'N/A')[:200]}...")
        print(f"Routes generated: {len(gemini_response.get('routes', []))}")
        for route in gemini_response.get('routes', []):
            print(f"\n  Route: {route.get('name', 'Unnamed')}")
            print(f"    Score: {route.get('priority_score', 0)}")
            print(f"    Coords: {len(route.get('path_coordinates', []))} waypoints")
            if route.get('path_coordinates'):
                print(f"    First: {route['path_coordinates'][0]}")
                print(f"    Last:  {route['path_coordinates'][-1]}")
            print(f"    Reasoning: {route.get('reasoning', 'N/A')[:100]}...")
        print("="*60 + "\n")

        # Map Gemini response to frontend-compatible format
        candidates = []
        for idx, route in enumerate(gemini_response.get("routes", []), start=1):
            candidates.append({
                "rank": idx,
                "candidate_id": route.get("route_id", f"route_{idx}"),
                "path_lat_lng": route.get("path_coordinates", []),
                "candidate_score": route.get("priority_score", 0),
                "reason": route.get("description", route.get("reasoning", "")),
                "name": route.get("name", f"Route {idx}"),
                "reasoning": route.get("reasoning", ""),
                "key_neighbourhoods": route.get("key_neighbourhoods", []),
                "tradeoffs": route.get("tradeoffs", ""),
                "estimated_length_km": route.get("estimated_length_km"),
                "estimated_stations": route.get("estimated_stations"),
                "neighbourhood_impacts": route.get("neighbourhood_impacts", ""),
                "traffic_summary": route.get("traffic_summary", ""),
                "connectivity_summary": route.get("connectivity_summary", ""),
                "ridership_estimate": route.get("ridership_estimate", ""),
            })

        logger.info(
            "POST /api/py/transit/route/optimize success: %d routes from %d waypoints",
            len(candidates),
            len(payload.waypoints_lat_lng),
        )

        # Build corridor insights from top-level response fields
        corridor_insights = None
        if gemini_response.get("total_population_served") or gemini_response.get("transit_desert_score") or gemini_response.get("corridor_summary"):
            corridor_insights = {
                "total_population_served": gemini_response.get("total_population_served"),
                "transit_desert_score": gemini_response.get("transit_desert_score"),
                "corridor_summary": gemini_response.get("corridor_summary"),
            }

        return {
            "success": True,
            "waypoints_lat_lng": [[lat, lng] for lat, lng in payload.waypoints_lat_lng],
            "candidate_count": len(candidates),
            "candidates": candidates,
            "analysis_summary": gemini_response.get("analysis_summary", ""),
            "corridor_insights": corridor_insights,
            "context_summary": {
                "neighbourhoods_analyzed": len(context.get("neighbourhoods", [])),
                "traffic_intersections_analyzed": len(context.get("traffic_intersections", [])),
                "candidate_routes_considered": len(context.get("existing_candidates", [])),
            },
        }

    except ValueError as e:
        logger.error("Route optimization failed: %s", str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Route optimization error: %s", str(e))
        raise HTTPException(status_code=500, detail=f"Route optimization failed: {str(e)}")


@app.post("/api/py/transit/route/rank")
def rank_routes_with_llm(payload: RouteLLMPackageRequest):
    """
    Rank existing route candidates using Gemini LLM.
    
    First builds the LLM package with candidates, then calls Gemini
    to rank and select the best routes.
    """
    try:
        # Build LLM package with candidates
        llm_package = build_llm_route_package(
            waypoints_lat_lng=payload.waypoints_lat_lng,
            max_candidates=payload.max_candidates,
            buffer_km=payload.buffer_km,
            search_km=payload.search_km,
            intersection_min_total_vehicle=payload.intersection_min_total_vehicle,
            intersection_buffer_km=payload.intersection_buffer_km,
        )

        # Call Gemini to rank routes
        ranked_result = rank_subway_routes(llm_package["llm_prompt"])

        logger.info(
            "POST /api/py/transit/route/rank success: ranked %d routes from %d candidates",
            len(ranked_result.get("selected_routes", [])),
            llm_package.get("candidate_count", 0),
        )

        return {
            "success": True,
            "input_waypoints": llm_package.get("input_waypoints_lat_lng"),
            "selected_routes": ranked_result.get("selected_routes", []),
            "all_candidates": llm_package.get("candidates", []),
        }

    except ValueError as e:
        logger.error("Route ranking failed: %s", str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Route ranking error: %s", str(e))
        raise HTTPException(status_code=500, detail=f"Route ranking failed: {str(e)}")
