import os
import json
import time
import math
from google import genai
from google.genai import types
from dotenv import load_dotenv

# Load .env file at module import time
load_dotenv()

# Model to use
GEMINI_MODEL = "gemini-2.5-flash-lite"


def _distance(p1: list, p2: list) -> float:
    """Calculate distance between two [lat, lng] points in km (approximate)."""
    lat1, lng1 = p1
    lat2, lng2 = p2
    # Approximate conversion: 1 degree lat ≈ 111km, 1 degree lng ≈ 85km at Toronto's latitude
    dlat = (lat2 - lat1) * 111
    dlng = (lng2 - lng1) * 85
    return math.sqrt(dlat**2 + dlng**2)


def _angle_between(p1: list, p2: list, p3: list) -> float:
    """Calculate the angle at p2 formed by p1-p2-p3 in degrees."""
    v1 = [p1[0] - p2[0], p1[1] - p2[1]]
    v2 = [p3[0] - p2[0], p3[1] - p2[1]]
    
    dot = v1[0] * v2[0] + v1[1] * v2[1]
    mag1 = math.sqrt(v1[0]**2 + v1[1]**2)
    mag2 = math.sqrt(v2[0]**2 + v2[1]**2)
    
    if mag1 == 0 or mag2 == 0:
        return 180.0
    
    cos_angle = max(-1, min(1, dot / (mag1 * mag2)))
    return math.degrees(math.acos(cos_angle))


def smooth_path(path: list, iterations: int = 2) -> list:
    """
    Smooth a path using Chaikin's corner-cutting algorithm.
    This creates smooth curves from jagged lines.
    """
    if len(path) < 3:
        return path
    
    result = path
    for _ in range(iterations):
        if len(result) < 3:
            break
        smoothed = [result[0]]  # Keep start point
        
        for i in range(len(result) - 1):
            p1 = result[i]
            p2 = result[i + 1]
            
            # Create two new points at 25% and 75% along the segment
            q = [p1[0] * 0.75 + p2[0] * 0.25, p1[1] * 0.75 + p2[1] * 0.25]
            r = [p1[0] * 0.25 + p2[0] * 0.75, p1[1] * 0.25 + p2[1] * 0.75]
            
            smoothed.append(q)
            smoothed.append(r)
        
        smoothed.append(result[-1])  # Keep end point
        result = smoothed
    
    return result


def simplify_path(path: list, min_angle: float = 150.0) -> list:
    """
    Remove points that create sharp zigzags (angles < min_angle).
    Metro lines should have mostly straight segments with gentle curves.
    """
    if len(path) < 3:
        return path
    
    result = [path[0]]
    
    for i in range(1, len(path) - 1):
        angle = _angle_between(result[-1], path[i], path[i + 1])
        # Keep point if it doesn't create a sharp turn
        if angle >= min_angle:
            result.append(path[i])
    
    result.append(path[-1])
    return result


def clean_metro_path(path: list) -> list:
    """
    Clean up a raw path to look like a proper metro line:
    1. Remove duplicate/very close points
    2. Remove sharp zigzags
    3. Apply smoothing for curves
    4. Resample to consistent spacing
    """
    if len(path) < 2:
        return path
    
    # Step 1: Remove duplicate/very close points (< 100m apart)
    cleaned = [path[0]]
    for i in range(1, len(path)):
        if _distance(cleaned[-1], path[i]) > 0.1:  # > 100m
            cleaned.append(path[i])
    
    if len(cleaned) < 2:
        return path
    
    # Step 2: Remove points that create sharp zigzags (but allow gentle curves)
    cleaned = simplify_path(cleaned, min_angle=100.0)  # Allow curves up to 80 degrees
    
    # Step 3: Apply Chaikin smoothing for gentle curves
    if len(cleaned) >= 3:
        cleaned = smooth_path(cleaned, iterations=1)
    
    # Step 4: Resample to ~300-500m spacing
    resampled = [cleaned[0]]
    accumulated_dist = 0.0
    target_spacing = 0.4  # 400m
    
    for i in range(1, len(cleaned)):
        dist = _distance(cleaned[i-1], cleaned[i])
        accumulated_dist += dist
        
        if accumulated_dist >= target_spacing:
            resampled.append(cleaned[i])
            accumulated_dist = 0.0
    
    # Always include endpoint
    if resampled[-1] != cleaned[-1]:
        resampled.append(cleaned[-1])
    
    return resampled


def rank_subway_routes(prompt: dict) -> dict:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("Missing gemini api key")
    
    client = genai.Client(api_key=api_key)
    system_text = prompt["system"]
    user_payload = prompt["user"]
    output_schema = prompt["output_schema"]

    max_retries = 3
    for attempt in range(max_retries):
        try:
            response = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=[
                    {"role": "user", "parts": [{"text": json.dumps(user_payload)}]}
                ],
                config=types.GenerateContentConfig(
                    system_instruction=system_text,
                    response_mime_type="application/json",
                    response_schema=output_schema,
                    temperature=0.2
                )
            )
            break
        except Exception as e:
            if "429" in str(e) and attempt < max_retries - 1:
                wait_time = (2 ** attempt) * 10
                print(f"Rate limited. Waiting {wait_time}s before retry...")
                time.sleep(wait_time)
                continue
            raise

    if response.text is None:
        raise ValueError("Empty response from Gemini API")
    return json.loads(response.text)


# Schema for optimized route generation - simplified to avoid Gemini schema limits
ROUTE_GENERATION_SCHEMA = {
    "type": "object",
    "properties": {
        "routes": {
            "type": "array",
            "description": "Generated route options",
            "items": {
                "type": "object",
                "properties": {
                    "route_id": {"type": "string"},
                    "name": {"type": "string"},
                    "description": {"type": "string"},
                    "reasoning": {"type": "string"},
                    "path_coordinates": {
                        "type": "array",
                        "items": {
                            "type": "array",
                            "items": {"type": "number"}
                        }
                    },
                    "estimated_length_km": {"type": "number"},
                    "estimated_stations": {"type": "integer"},
                    "key_neighbourhoods": {
                        "type": "array",
                        "items": {"type": "string"}
                    },
                    "neighbourhood_impacts": {"type": "string"},
                    "traffic_summary": {"type": "string"},
                    "connectivity_summary": {"type": "string"},
                    "ridership_estimate": {"type": "string"},
                    "tradeoffs": {"type": "string"},
                    "priority_score": {"type": "number"}
                },
                "required": ["route_id", "name", "description", "path_coordinates", "priority_score"]
            }
        },
        "analysis_summary": {"type": "string"},
        "corridor_summary": {"type": "string"},
        "total_population_served": {"type": "integer"},
        "transit_desert_score": {"type": "number"}
    },
    "required": ["routes", "analysis_summary"]
}


def generate_optimized_routes(context: dict) -> dict:
    """
    Generate optimized transit routes using Gemini based on user pins and neighbourhood context.
    
    Args:
        context: Dict containing:
            - user_waypoints: List of [lat, lng] user-selected points
            - neighbourhoods: List of neighbourhood data with scores
            - traffic_intersections: High-traffic intersections nearby
            - existing_candidates: Pre-computed candidate routes
            - constraints: User constraints and preferences
    
    Returns:
        Dict with generated routes and analysis
    """
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("Missing GEMINI_API_KEY environment variable")
    
    client = genai.Client(api_key=api_key)
    
    system_prompt = """You are an expert urban transit planner specializing in subway and metro systems.
Your task is to generate optimal subway routes using neighbourhood data, traffic patterns, and user guidance.

YOUR ROLE:
The user provides waypoints indicating a GENERAL CORRIDOR of interest. Your job is to:
1. ANALYZE the neighbourhood_context to find high-value areas (high benefit_score, density, traffic)
2. REASON about which neighbourhoods the route should serve
3. DESIGN routes that connect high-need areas while maintaining efficient, buildable paths
4. CONSIDER connections to existing transit where relevant

DATA YOU WILL RECEIVE:
- user_waypoints: General corridor guidance (start, end, and areas of interest)
- neighbourhood_context: List of neighbourhoods with:
  - neighbourhood: Name
  - centroid_lat, centroid_lng: Center coordinates
  - density_per_km2: Population density
  - benefit_score: Overall transit need score
  - subway_distance_km: Distance from nearest subway
- traffic_context: High-traffic intersections with lat/lng coordinates

ROUTE DESIGN PRINCIPLES:
1. HIGH-VALUE TARGETING: Route through neighbourhoods with high benefit_score and density
2. TRANSIT GAPS: Prioritize areas far from existing subway (high subway_distance_km)
3. TRAFFIC RELIEF: Consider routing near high-traffic intersections
4. CONNECTIVITY: Think about where routes could connect to existing transit
5. PRACTICALITY: Routes should be buildable - mostly straight with gentle curves

PATH CONSTRUCTION RULES:
- Start near the first user waypoint, end near the last
- Route through HIGH-VALUE neighbourhoods between start and end
- Use centroid_lat/centroid_lng from neighbourhoods as waypoints
- Connect waypoints with smooth segments (add 2-3 intermediate points between each)
- Maintain a logical flow - no random jumps across the city
- Gentle curves are OK, but avoid sharp 90-degree turns or zigzags

COORDINATE FORMAT: [latitude, longitude]
Toronto bounds: lat 43.6-43.85, lng -79.65 to -79.1

GENERATE DIVERSE OPTIONS:
1. Coverage Route: Maximize neighbourhood benefit - route through highest-score areas even if not perfectly direct
2. Direct Route: More direct path, still serving key neighbourhoods along the way
3. Connection Route: Optimize for connecting to existing transit or serving transit deserts

Each route should have a DISTINCT character and serve different planning priorities."""

    user_payload = {
        "task": "Generate optimal transit route options based on the user's points of interest",
        "user_waypoints": context.get("user_waypoints", []),
        "neighbourhood_context": context.get("neighbourhoods", []),
        "traffic_context": context.get("traffic_intersections", []),
        "candidate_reference": context.get("existing_candidates", []),
        "constraints": context.get("constraints", {
            "num_routes": 3,
            "max_length_km": 30,
            "prioritize": "balanced"  # or "coverage", "directness", "traffic_relief"
        }),
        "instructions": """
You are designing subway routes for Toronto. Use the data provided to make intelligent routing decisions.

STEP 1 - ANALYZE THE DATA:
- Review neighbourhood_context: identify the TOP 3-5 neighbourhoods by benefit_score
- Note their centroid coordinates - these are potential routing targets
- Check traffic_context for high-traffic areas that need transit relief
- User waypoints show the general corridor - use as guidance, not strict path

STEP 2 - DESIGN EACH ROUTE VARIANT:

Route 1 (Coverage Focus):
- Start near first user waypoint
- Route THROUGH the highest benefit_score neighbourhood centroids
- Detours of 1-2 km to serve high-need areas are acceptable
- End near last user waypoint
- Explain WHY you chose each neighbourhood

Route 2 (Balanced):
- Balance directness with coverage
- Include top 2-3 high-value neighbourhoods
- Minimize total route length while still serving key areas

Route 3 (Direct/Express):
- Most direct path from start to end
- Still consider neighbourhoods directly along the corridor
- Prioritize speed and efficiency

STEP 3 - BUILD SMOOTH PATHS:
For each route, create path_coordinates:
1. List your key waypoints (start, neighbourhood centroids, end)
2. Add 2-3 interpolation points between each pair
3. Ensure smooth flow - each point should be close to the previous
4. 15-25 total points per route

OUTPUT QUALITY:
- Each route should be visually DISTINCT when plotted
- Routes should make geographic sense
- Explain your reasoning for each route choice
"""
    }

    # Debug: Print the full prompt being sent
    print("\n" + "-"*60)
    print("GEMINI PROMPT (user_payload):")
    print("-"*60)
    print(json.dumps(user_payload, indent=2)[:2000])
    if len(json.dumps(user_payload)) > 2000:
        print(f"... (truncated, total {len(json.dumps(user_payload))} chars)")
    print("-"*60 + "\n")

    # Retry with exponential backoff for rate limits
    max_retries = 3
    for attempt in range(max_retries):
        try:
            response = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=[
                    {"role": "user", "parts": [{"text": json.dumps(user_payload, indent=2)}]}
                ],
                config=types.GenerateContentConfig(
                    system_instruction=system_prompt,
                    response_mime_type="application/json",
                    response_schema=ROUTE_GENERATION_SCHEMA,
                    temperature=0.5  # Higher for creative routing variety
                )
            )
            break  # Success
        except Exception as e:
            if "429" in str(e) and attempt < max_retries - 1:
                wait_time = (2 ** attempt) * 10  # 10s, 20s, 40s
                print(f"Rate limited. Waiting {wait_time}s before retry {attempt + 2}/{max_retries}...")
                time.sleep(wait_time)
                continue
            raise

    if response.text is None:
        raise ValueError("Empty response from Gemini API")
    
    result = json.loads(response.text)
    
    # Post-process: clean up paths to remove zigzags and smooth lines
    if "routes" in result:
        for route in result["routes"]:
            if "path_coordinates" in route and len(route["path_coordinates"]) >= 2:
                original_path = route["path_coordinates"]
                cleaned_path = clean_metro_path(original_path)
                route["path_coordinates"] = cleaned_path
                print(f"Path cleaned: {len(original_path)} points -> {len(cleaned_path)} points")
    
    return result