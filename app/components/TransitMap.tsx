"use client";

import { useEffect, useRef, useCallback } from "react";
import {
    TransitLine,
    Scenario,
    HotspotCluster,
    LayerVisibility,
    Zone,
} from "../types";

function getDensityColor(ratio: number): string {
    // Low density (blue/cool) -> Medium (yellow) -> High density (red/hot)
    if (ratio < 0.15) return "#3b82f6"; // blue
    if (ratio < 0.3) return "#06b6d4"; // cyan
    if (ratio < 0.45) return "#22c55e"; // green
    if (ratio < 0.6) return "#eab308"; // yellow
    if (ratio < 0.75) return "#f97316"; // orange
    return "#ef4444"; // red
}

interface DensityGeoJSON {
    type: "FeatureCollection";
    features: {
        type: "Feature";
        geometry: any;
        properties: {
            neighbourhood: string;
            population: number;
            area_km2: number;
            density_per_km2: number;
        };
    }[];
}

interface TransitMapProps {
    transitLines: TransitLine[];
    zones: Zone[];
    selectedLine: TransitLine | null;
    onLineClick: (line: TransitLine) => void;
    onZoneClick: (zone: Zone) => void;
    onMapClick: (latlng: [number, number]) => void;
    layers: LayerVisibility;
    isDrawing: boolean;
    drawingPath: [number, number][];
    drawingWaypoints: [number, number][];
    scenarios: Scenario[];
    hotspots: HotspotCluster[];
    center: [number, number];
    zoom: number;
    densityGeoJSON: DensityGeoJSON | null;
}

export default function TransitMap({
    transitLines,
    zones,
    selectedLine,
    onLineClick,
    onZoneClick,
    onMapClick,
    layers,
    isDrawing,
    drawingPath,
    drawingWaypoints,
    scenarios,
    hotspots,
    center,
    zoom,
    densityGeoJSON,
}: TransitMapProps) {
    const mapRef = useRef<any>(null);
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const layerGroupsRef = useRef<{
        density: any;
        transitLines: any;
        stations: any;
        hotspots: any;
        drawing: any;
        scenarios: any;
    }>({
        density: null,
        transitLines: null,
        stations: null,
        hotspots: null,
        drawing: null,
        scenarios: null,
    });
    const onLineClickRef = useRef(onLineClick);
    const onMapClickRef = useRef(onMapClick);

    // Keep refs up to date
    useEffect(() => {
        onLineClickRef.current = onLineClick;
    }, [onLineClick]);

    useEffect(() => {
        onMapClickRef.current = onMapClick;
    }, [onMapClick]);

    // Initialize map
    useEffect(() => {
        if (!mapContainerRef.current) return;

        // Prevent double initialization in React Strict Mode
        if (mapRef.current) {
            mapRef.current.remove();
            mapRef.current = null;
        }

        let mounted = true;

        const initMap = async () => {
            const L = (await import("leaflet")).default;

            if (!mounted || !mapContainerRef.current) return;

            // Fix default icon
            delete (L.Icon.Default.prototype as any)._getIconUrl;
            L.Icon.Default.mergeOptions({
                iconRetinaUrl:
                    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
                iconUrl:
                    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
                shadowUrl:
                    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
            });

            const map = L.map(mapContainerRef.current, {
                center: [43.7, -79.4],
                zoom: 12,
                zoomControl: true,
                attributionControl: true,
                zoomSnap: 0,
                wheelPxPerZoomLevel: 200,
            });

            L.tileLayer(
                "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
                {
                    attribution:
                        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
                    subdomains: "abcd",
                    maxZoom: 19,
                },
            ).addTo(map);

            // Create layer groups
            layerGroupsRef.current = {
                density: L.layerGroup().addTo(map),
                transitLines: L.layerGroup().addTo(map),
                stations: L.layerGroup().addTo(map),
                hotspots: L.layerGroup().addTo(map),
                drawing: L.layerGroup().addTo(map),
                scenarios: L.layerGroup().addTo(map),
            };

            // Map click handler
            map.on("click", (e: any) => {
                onMapClickRef.current([e.latlng.lat, e.latlng.lng]);
            });

            mapRef.current = map;
        };

        initMap();

        return () => {
            mounted = false;
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
            }
        };
    }, []);

    // Fly to center/zoom when changed
    useEffect(() => {
        if (mapRef.current) {
            mapRef.current.flyTo(center, zoom, { duration: 1 });
        }
    }, [center, zoom]);

    // Update density GeoJSON choropleth
    useEffect(() => {
        const lg = layerGroupsRef.current.density;
        if (!lg || !mapRef.current) return;

        // Make onZoneClick accessible in the Leaflet event handler
        const currentOnZoneClick = onZoneClick;

        const updateDensity = async () => {
            const L = (await import("leaflet")).default;
            lg.clearLayers();

            if (!layers.needScore || !densityGeoJSON) return;

            // Find max density for color scaling
            const densities = densityGeoJSON.features.map(
                (f) => f.properties.density_per_km2,
            );
            const maxDensity = Math.max(...densities);

            L.geoJSON(densityGeoJSON as any, {
                style: (feature: any) => {
                    const density = feature.properties.density_per_km2 || 0;
                    const ratio = maxDensity > 0 ? density / maxDensity : 0;
                    return {
                        fillColor: getDensityColor(ratio),
                        fillOpacity: 0.45,
                        color: "#94a3b8",
                        weight: 1,
                    };
                },
                onEachFeature: (feature: any, layer: any) => {
                    const p = feature.properties;
                    layer.bindPopup(
                        `<div style="color:#1e293b;font-size:13px;line-height:1.5">
              <strong style="font-size:14px">${p.neighbourhood}</strong><br/>
              Population: <strong>${Number(p.population).toLocaleString()}</strong><br/>
              Area: ${p.area_km2} km²<br/>
              Density: <strong>${Number(p.density_per_km2).toLocaleString()}/km²</strong>
            </div>`,
                    );

                    layer.on("click", () => {
                        const matchingZone = zones.find(
                            (z) => z.name.toLowerCase() === p.neighbourhood.toLowerCase()
                        );
                        if (matchingZone) {
                            currentOnZoneClick(matchingZone);
                        }
                    });
                },
            }).addTo(lg);
        };

        updateDensity();
    }, [densityGeoJSON, layers.needScore, zones, onZoneClick]);

    // Update transit lines
    useEffect(() => {
        const lgLines = layerGroupsRef.current.transitLines;
        const lgStations = layerGroupsRef.current.stations;
        if (!lgLines || !lgStations || !mapRef.current) return;

        const updateLines = async () => {
            const L = (await import("leaflet")).default;
            lgLines.clearLayers();
            lgStations.clearLayers();

            const visibleModes = new Set<string>();
            if (layers.subwayLines) visibleModes.add("subway");
            if (layers.lrtLines) visibleModes.add("lrt");
            if (layers.busLines) visibleModes.add("bus");

            if (visibleModes.size === 0) return;

            transitLines.filter(line => visibleModes.has(line.mode)).forEach((line) => {
                const polyline = L.polyline(line.coordinates, {
                    color: line.color,
                    weight: line.mode === "subway" ? 4 : 3,
                    opacity: 0.6,
                    dashArray: line.mode === "lrt" ? "8, 6" : undefined,
                });

                const tooltipContent = `<div style="color:#1e293b;font-size:12px;white-space:nowrap">
          <strong style="color:${line.color}">${line.name}</strong><br/>
          Run by: TTC<br/>
          Daily Riders: ${line.dailyRidership.toLocaleString()}
        </div>`;

                polyline.bindTooltip(tooltipContent, {
                    sticky: true,
                    className: "transit-tooltip",
                });

                polyline.on("mouseover", function (e) {
                    const layer = e.target;
                    layer.setStyle({
                        weight: line.mode === "subway" ? 7 : 6,
                        opacity: 1,
                    });
                    layer.bringToFront();
                });

                polyline.on("mouseout", function (e) {
                    const layer = e.target;
                    layer.setStyle({
                        weight: line.mode === "subway" ? 4 : 3,
                        opacity: 0.6,
                    });
                });

                polyline.on("click", () => {
                    onLineClickRef.current(line);
                });

                polyline.addTo(lgLines);

                // Stations
                line.stations.forEach((station) => {
                    const marker = L.circleMarker(station.position, {
                        radius: 4,
                        fillColor: line.color,
                        fillOpacity: 1,
                        color: "#fff",
                        weight: 1.5,
                    });

                    marker.bindTooltip(
                        `<div style="color:#1e293b;font-size:11px">
              <strong>${station.name}</strong>
            </div>`,
                        { direction: "top", offset: [0, -5] },
                    );
                    marker.addTo(lgStations);
                });
            });
        };

        updateLines();
    }, [transitLines, layers.subwayLines, layers.lrtLines, layers.busLines]);

    // Update hotspots
    useEffect(() => {
        const lg = layerGroupsRef.current.hotspots;
        if (!lg || !mapRef.current) return;

        const updateHotspots = async () => {
            const L = (await import("leaflet")).default;
            lg.clearLayers();

            if (!layers.trafficHotspots) return;

            hotspots.forEach((cluster) => {
                const marker = L.circleMarker(cluster.center, {
                    radius: 12,
                    fillColor: "#ef4444",
                    fillOpacity: 0.3,
                    color: "#ef4444",
                    weight: 2,
                    className: "hotspot-pulse",
                });

                marker.bindPopup(
                    `<div style="color:#1e293b;font-size:13px">
            <strong>${cluster.label}</strong><br/>
            ${cluster.zones[0]?.name || ""}<br/>
            Score: ${cluster.avgScore}/100
          </div>`,
                );
                marker.addTo(lg);
            });
        };

        updateHotspots();
    }, [hotspots, layers.trafficHotspots]);

    // Update drawing path
    useEffect(() => {
        const lg = layerGroupsRef.current.drawing;
        if (!lg || !mapRef.current) return;

        const updateDrawing = async () => {
            const L = (await import("leaflet")).default;
            lg.clearLayers();

            if (!isDrawing) return;

            // Draw road-snapped path as smooth line
            if (drawingPath.length > 1) {
                L.polyline(drawingPath, {
                    color: "#06b6d4",
                    weight: 4,
                    opacity: 0.85,
                    lineCap: "round",
                    lineJoin: "round",
                }).addTo(lg);
            }

            // Draw waypoint markers at user click points
            drawingWaypoints.forEach((point, i) => {
                L.circleMarker(point, {
                    radius: 7,
                    fillColor: i === 0 ? "#22c55e" : "#06b6d4",
                    fillOpacity: 1,
                    color: "#fff",
                    weight: 2.5,
                }).addTo(lg);
            });
        };

        updateDrawing();
    }, [isDrawing, drawingPath, drawingWaypoints]);

    // Update saved scenarios
    useEffect(() => {
        const lg = layerGroupsRef.current.scenarios;
        if (!lg || !mapRef.current) return;

        const updateScenarios = async () => {
            const L = (await import("leaflet")).default;
            const { SCENARIO_MODE_COLORS } = await import("../types");

            lg.clearLayers();

            scenarios.forEach((scenario) => {
                if (scenario.visible === false) return;

                const polyline = L.polyline(scenario.path, {
                    color: SCENARIO_MODE_COLORS[scenario.mode] || "#3b82f6",
                    weight: 4,
                    opacity: 0.8,
                });

                let popupContent = `<div style="color:#1e293b;font-size:13px">
          <strong>${scenario.name}</strong><br/>
          Mode: ${scenario.mode.replace("_", " ")}`;

                if (scenario.result) {
                    popupContent += `<br/>Length: ${scenario.result.lineLengthKm} km
            <br/>Est. Riders: ${scenario.result.dailyRidersLow.toLocaleString()}-${scenario.result.dailyRidersHigh.toLocaleString()}/day`;
                }

                popupContent += "</div>";
                polyline.bindPopup(popupContent);
                polyline.addTo(lg);
            });
        };

        updateScenarios();
    }, [scenarios]);

    return (
        <div
            ref={mapContainerRef}
            id="transit-map"
            className="h-full w-full"
            style={{ cursor: isDrawing ? "crosshair" : "grab" }}
        />
    );
}
