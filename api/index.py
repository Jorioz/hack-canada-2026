from fastapi import FastAPI, Query
from fastapi.responses import JSONResponse
import logging
import os
from pathlib import Path
from pydantic import BaseModel, Field

# Load .env file so GEMINI_API_KEY is available
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from api.data_service import DataService
from api.utils.transit import (
    load_transit_benefit_scores,
    load_transit_benefit_geojson,
    generate_subway_route_candidates,
)
from api.utils.simulation import (
    compare_modes,
    run_sensitivity_analysis,
    pareto_rank_candidates,
    format_gemini_briefing,
    calculate_scenario,
    MODES,
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


# ---------------------------------------------------------------------------
# Simulation & Analysis endpoints
# ---------------------------------------------------------------------------

class SimulationRequest(BaseModel):
    path_lat_lng: list[tuple[float, float]] = Field(min_length=2)
    station_spacing_m: int = Field(default=800, ge=400, le=1200)
    buffer_km: float = Field(default=0.8, gt=0, le=5.0)


class AnalyzeRequest(BaseModel):
    path_lat_lng: list[tuple[float, float]] = Field(min_length=2)
    station_spacing_m: int = Field(default=800, ge=400, le=1200)
    buffer_km: float = Field(default=0.8, gt=0, le=5.0)
    user_question: str = Field(default="")


@app.post("/api/py/simulation/compare")
def post_compare_modes(payload: SimulationRequest):
    """Run the same corridor through all 3 transit modes and return comparison."""
    result = compare_modes(
        path=list(payload.path_lat_lng),
        station_spacing_m=payload.station_spacing_m,
        buffer_km=payload.buffer_km,
    )
    logger.info(
        "POST /api/py/simulation/compare success: corridor %.1f km, %d neighbourhoods",
        result["corridor"]["length_km"],
        len(result["corridor"]["covered_neighbourhoods"]),
    )
    return result


@app.post("/api/py/simulation/sensitivity")
def post_sensitivity_analysis(payload: SimulationRequest):
    """Run sensitivity analysis with 4 weight presets."""
    result = run_sensitivity_analysis(
        path=list(payload.path_lat_lng),
        buffer_km=payload.buffer_km,
    )
    logger.info("POST /api/py/simulation/sensitivity success: %d presets", len(result))
    return result


@app.post("/api/py/simulation/analyze")
def post_full_analysis(payload: AnalyzeRequest):
    """
    Full analysis pipeline: mode comparison + sensitivity + Gemini briefing.
    Returns structured data AND the formatted briefing string.
    """
    comparison = compare_modes(
        path=list(payload.path_lat_lng),
        station_spacing_m=payload.station_spacing_m,
        buffer_km=payload.buffer_km,
    )

    sensitivity = run_sensitivity_analysis(
        path=list(payload.path_lat_lng),
        buffer_km=payload.buffer_km,
    )

    briefing = format_gemini_briefing(
        corridor=comparison["corridor"],
        mode_comparison=comparison["modes"],
        sensitivity=sensitivity,
        user_question=payload.user_question,
    )

    logger.info("POST /api/py/simulation/analyze success: full pipeline complete")
    return {
        "comparison": comparison,
        "sensitivity": sensitivity,
        "briefing": briefing,
    }


@app.post("/api/py/simulation/analyze-with-ai")
def post_analyze_with_ai(payload: AnalyzeRequest):
    """
    Full pipeline + Gemini narration. Calls Gemini API to generate
    natural language analysis of the simulation results.
    """
    comparison = compare_modes(
        path=list(payload.path_lat_lng),
        station_spacing_m=payload.station_spacing_m,
        buffer_km=payload.buffer_km,
    )

    sensitivity = run_sensitivity_analysis(
        path=list(payload.path_lat_lng),
        buffer_km=payload.buffer_km,
    )

    briefing = format_gemini_briefing(
        corridor=comparison["corridor"],
        mode_comparison=comparison["modes"],
        sensitivity=sensitivity,
        user_question=payload.user_question,
    )

    # Call Gemini
    ai_analysis = ""
    api_key = os.environ.get("GEMINI_API_KEY", "")
    if api_key:
        try:
            import google.generativeai as genai
            genai.configure(api_key=api_key)
            model = genai.GenerativeModel("gemini-2.5-flash-lite")
            response = model.generate_content(briefing)
            ai_analysis = response.text
        except Exception as e:
            logger.error("Gemini API call failed: %s", e)
            ai_analysis = f"AI analysis unavailable: {e}"
    else:
        ai_analysis = "GEMINI_API_KEY not configured. Set the environment variable to enable AI analysis."

    logger.info("POST /api/py/simulation/analyze-with-ai success")
    return {
        "comparison": comparison,
        "sensitivity": sensitivity,
        "briefing": briefing,
        "ai_analysis": ai_analysis,
    }


class FullSimulationRequest(BaseModel):
    path_lat_lng: list[tuple[float, float]] = Field(min_length=2)
    station_spacing_m: int = Field(default=800, ge=400, le=1200)
    buffer_km: float = Field(default=1.0, gt=0, le=5.0)
    search_km: float = Field(default=3.0, gt=0, le=10.0)
    max_candidates: int = Field(default=6, ge=2, le=10)
    user_question: str = Field(default="")


@app.post("/api/py/simulation/full")
def post_full_simulation(payload: FullSimulationRequest):
    """
    Full simulation: generates multiple route candidates, scores each
    across all 3 modes, runs sensitivity + Pareto ranking, formats briefing.
    Returns candidates with paths for map animation + full analysis.
    """
    from dataclasses import asdict

    # Step 1: Generate route candidates
    candidates = generate_subway_route_candidates(
        waypoints_lat_lng=payload.path_lat_lng,
        max_candidates=payload.max_candidates,
        buffer_km=payload.buffer_km,
        search_km=payload.search_km,
    )

    # Step 2: Pareto-rank them
    ranked = pareto_rank_candidates(
        candidates=candidates,
        path_key="path_lat_lng",
        station_spacing_m=payload.station_spacing_m,
        buffer_km=payload.buffer_km,
    )

    # Step 3: For the top candidate, run full mode comparison + sensitivity
    best_path = [(p[0], p[1]) for p in ranked[0]["path_lat_lng"]] if ranked else list(payload.path_lat_lng)

    comparison = compare_modes(
        path=best_path,
        station_spacing_m=payload.station_spacing_m,
        buffer_km=payload.buffer_km,
    )

    sensitivity = run_sensitivity_analysis(
        path=best_path,
        buffer_km=payload.buffer_km,
    )

    briefing = format_gemini_briefing(
        corridor=comparison["corridor"],
        mode_comparison=comparison["modes"],
        sensitivity=sensitivity,
        user_question=payload.user_question,
    )

    # Step 4: Gemini narration + route naming (optional)
    ai_analysis = ""
    route_names: list[dict[str, str]] = []
    api_key = os.environ.get("GEMINI_API_KEY", "")
    if api_key:
        try:
            import google.generativeai as genai
            genai.configure(api_key=api_key)
            model = genai.GenerativeModel("gemini-2.5-flash-lite")

            # Generate AI analysis
            response = model.generate_content(briefing)
            ai_analysis = response.text

            # Generate route names for each candidate
            naming_prompt_parts = []
            for i, c in enumerate(ranked[:8]):
                hoods = [h["neighbourhood"] for h in c.get("covered_neighbourhoods", c.get("coverage", {}).get("covered_neighbourhoods", []))[:5]]
                naming_prompt_parts.append(
                    f"Route {i+1}: Score {c.get('candidate_score', 0):.0f}, "
                    f"Neighbourhoods: {', '.join(hoods) if hoods else 'unknown'}, "
                    f"Reason: {c.get('reason', 'N/A')}"
                )

            naming_prompt = (
                "You are a Toronto transit planner. For each route candidate below, generate:\n"
                "1. A short catchy name (5-8 words max) reflecting the corridor/neighbourhoods served\n"
                "2. A one-sentence description (under 25 words)\n\n"
                + "\n".join(naming_prompt_parts) + "\n\n"
                "Respond ONLY as a JSON array of objects with keys 'name' and 'description'. "
                "No markdown, no explanation. Example: [{\"name\": \"Waterfront Express\", \"description\": \"Connects lakeside communities to the downtown core.\"}]"
            )
            try:
                name_response = model.generate_content(naming_prompt)
                import json as _json
                raw = name_response.text.strip()
                # Strip markdown fences if present
                if raw.startswith("```"):
                    raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
                route_names = _json.loads(raw)
            except Exception as e:
                logger.warning("Route naming failed: %s", e)

        except Exception as e:
            logger.error("Gemini API call failed: %s", e)
            ai_analysis = f"AI analysis unavailable: {e}"
    else:
        ai_analysis = "GEMINI_API_KEY not configured. Set the environment variable to enable AI analysis."

    logger.info(
        "POST /api/py/simulation/full success: %d candidates, best corridor %.1f km",
        len(ranked),
        comparison["corridor"]["length_km"],
    )

    # Shape candidates for frontend
    shaped_candidates = []
    for i, c in enumerate(ranked):
        hoods_raw = c.get("covered_neighbourhoods", c.get("coverage", {}).get("covered_neighbourhoods", []))
        hood_names = []
        if isinstance(hoods_raw, list):
            for h in hoods_raw:
                if isinstance(h, dict):
                    hood_names.append(h.get("neighbourhood", ""))
                elif isinstance(h, str):
                    hood_names.append(h)

        name_info = route_names[i] if i < len(route_names) else {}
        shaped_candidates.append({
            "rank": c.get("pareto", {}).get("overall_rank", i + 1),
            "path_lat_lng": c.get("path_lat_lng", []),
            "candidate_score": c.get("pareto", {}).get("composite_score", c.get("candidate_score", 0)),
            "reason": c.get("reason", ""),
            "name": name_info.get("name", f"Route Candidate {i + 1}"),
            "description": name_info.get("description", c.get("reason", "")),
            "neighbourhoods": hood_names[:6],
            "pareto_front": c.get("pareto", {}).get("overall_rank", 99) <= 3,
            "coverage_km2": c.get("coverage", {}).get("population_served", 0) / 1000,
            "avg_benefit": c.get("coverage", {}).get("avg_benefit_score", 0),
            "num_neighbourhoods": len(hood_names) if hood_names else c.get("scenario", {}).get("num_stations", 0),
            "waypoint_count": len(c.get("path_lat_lng", [])),
        })

    return {
        "candidates": shaped_candidates,
        "best_candidate_index": 0,
        "comparison": comparison,
        "sensitivity": sensitivity,
        "briefing": briefing,
        "ai_analysis": ai_analysis,
    }
