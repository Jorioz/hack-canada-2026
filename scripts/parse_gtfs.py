import csv
import json
import os
from collections import defaultdict, Counter

def parse_gtfs(data_dir, output_file):
    print(f"Parsing GTFS from {data_dir}...")
    
    # 1. Parse routes
    # route_type: 1=Subway, 0=Tram/LRT, 3=Bus
    routes = {}
    with open(os.path.join(data_dir, 'routes.txt'), 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            rtype = int(row['route_type'])
            mode = "bus"
            color = "#3b82f6" # default bus blue
            if rtype == 1:
                mode = "subway"
                color = "#22c55e" # Green for subway
            elif rtype == 0:
                mode = "lrt"
                color = "#eab308" # Yellow for LRT
            elif rtype == 3:
                mode = "bus"
                color = "#3b82f6" # Blue for bus
            else:
                continue # Skip other types if any
                
            routes[row['route_id']] = {
                "id": row['route_id'],
                "short_name": row['route_short_name'],
                "long_name": row['route_long_name'],
                "mode": mode,
                "color": color,
                "route_color_gtfs": row.get('route_color', '')
            }
            
    # 2. Parse trips to find the most common shape_id for each route_id
    # We want one shape_id per direction, or just the most common one overall to simplify
    route_shapes = defaultdict(list)
    with open(os.path.join(data_dir, 'trips.txt'), 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row['route_id'] in routes and row['shape_id']:
                route_shapes[row['route_id']].append(row['shape_id'])
                
    # Pick the most frequent 2 shapes for each route (one for each direction usually)
    selected_shapes = {} # shape_id -> route_id
    route_selected_shapes = defaultdict(list)
    for route_id, shapes in route_shapes.items():
        counter = Counter(shapes)
        # get top 2 most common shapes
        top_shapes = [s[0] for s in counter.most_common(2)]
        for sid in top_shapes:
            selected_shapes[sid] = route_id
            route_selected_shapes[route_id].append(sid)

    # 3. Parse shapes
    shape_points = defaultdict(list)
    with open(os.path.join(data_dir, 'shapes.txt'), 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            shape_id = row['shape_id']
            if shape_id in selected_shapes:
                shape_points[shape_id].append({
                    "lat": float(row['shape_pt_lat']),
                    "lon": float(row['shape_pt_lon']),
                    "seq": int(row['shape_pt_sequence'])
                })

    # Sort points for each shape
    for sid in shape_points:
        shape_points[sid].sort(key=lambda x: x["seq"])
        
    # 4. Build output
    transit_lines = []
    # If a route has two directions, let's keep them as one continuous line if possible?
    # No, leaflet Polyline takes an array of lines: [[lat, lng], [lat, lng]]
    # Or an array of array of coordinates for MultiPolyline.
    # In types.ts, `coordinates: [number, number][];` which is a single Polyline.
    # We'll just pick the MOST frequent shape (top 1) to represent the route
    
    for route_id, route_info in routes.items():
        if route_id not in route_selected_shapes: continue
        
        shapes = route_selected_shapes[route_id]
        if not shapes: continue
        best_shape_id = shapes[0] # Pick the single most common shape
        
        points = [[pt['lat'], pt['lon']] for pt in shape_points[best_shape_id]]
        
        name = route_info['long_name']
        if route_info['short_name']:
            name = f"{route_info['short_name']} {name}".strip()
            
        import random
        num_stops = 50 if route_info['id'] == '1' else random.randint(15, 80)
        daily_riders = 500000 if route_info['id'] == '1' else (25000 if route_info['mode'] == 'bus' else (100000 if route_info['mode'] == 'lrt' else 400000))
        
        # mock stops to match the 'Major Stops' count
        mock_stations = [{"name": f"Stop {i+1}", "position": [points[0][0], points[0][1]]} for i in range(num_stops)]
        
        # mock headway, speed, reliability
        headway = 3 if route_info['mode'] == 'subway' else (5 if route_info['mode'] == 'lrt' else random.randint(5, 20))
        speed = 40 if route_info['mode'] == 'subway' else (25 if route_info['mode'] == 'lrt' else random.randint(15, 25))
        reliability = 98 if route_info['mode'] == 'subway' else (92 if route_info['mode'] == 'lrt' else random.randint(70, 90))

        transit_lines.append({
            "id": route_info['id'],
            "name": name,
            "mode": route_info['mode'],
            "color": route_info['color'],
            "coordinates": points,
            "stations": mock_stations,
            "dailyRidership": daily_riders,
            "headway": headway,
            "avgSpeed": speed,
            "reliability": reliability
        })

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(transit_lines, f)
        
    print(f"Successfully exported {len(transit_lines)} transit lines to {output_file}")

if __name__ == "__main__":
    gtfs_dir = r"d:\hack-canada-2026\app\data\TTC Routes and Schedules Data"
    output_path = r"d:\hack-canada-2026\app\data\ttc_routes.json"
    parse_gtfs(gtfs_dir, output_path)
