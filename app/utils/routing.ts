/**
 * Road-snapping routing via OSRM (Open Source Routing Machine).
 * Uses the free public demo server — no API key needed.
 * Returns road-following coordinates between waypoints.
 */

const OSRM_BASE = "https://router.project-osrm.org/route/v1/driving";

export interface RouteResult {
  /** Road-snapped coordinates [lat, lng][] */
  coordinates: [number, number][];
  /** Total distance in km */
  distanceKm: number;
}

/**
 * Get a road-snapped route between an array of waypoints.
 * @param waypoints Array of [lat, lng] points
 * @returns Road-following polyline coordinates
 */
export async function getRoute(
  waypoints: [number, number][]
): Promise<RouteResult> {
  if (waypoints.length < 2) {
    return { coordinates: waypoints, distanceKm: 0 };
  }

  // OSRM expects lng,lat format (opposite of Leaflet's lat,lng)
  const coords = waypoints.map(([lat, lng]) => `${lng},${lat}`).join(";");
  const url = `${OSRM_BASE}/${coords}?overview=full&geometries=geojson`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.code !== "Ok" || !data.routes || data.routes.length === 0) {
      console.warn("OSRM routing failed, falling back to straight lines:", data);
      return { coordinates: waypoints, distanceKm: 0 };
    }

    const route = data.routes[0];
    // GeoJSON coordinates are [lng, lat], convert to [lat, lng] for Leaflet
    const coordinates: [number, number][] = route.geometry.coordinates.map(
      ([lng, lat]: [number, number]) => [lat, lng] as [number, number]
    );

    return {
      coordinates,
      distanceKm: route.distance / 1000,
    };
  } catch (error) {
    console.warn("OSRM request failed, falling back to straight lines:", error);
    return { coordinates: waypoints, distanceKm: 0 };
  }
}

/**
 * Get a road-snapped route incrementally — given existing snapped path
 * and a new waypoint, only fetches the route for the last segment.
 */
export async function getRouteSegment(
  fromPoint: [number, number],
  toPoint: [number, number]
): Promise<[number, number][]> {
  const result = await getRoute([fromPoint, toPoint]);
  return result.coordinates;
}
