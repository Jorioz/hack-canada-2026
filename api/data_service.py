import pandas as pd
from api.utils.density import load_neighbourhood_density, load_density_geojson
from api.utils.traffic import load_traffic_by_neighbourhood, load_traffic_geojson, load_top_intersections


class DataService:
    def __init__(self):
        self.density = load_neighbourhood_density()
        self.density_geojson = load_density_geojson()
        self.traffic = load_traffic_by_neighbourhood()
        self.traffic_geojson = load_traffic_geojson()
        self.traffic_intersections = load_top_intersections(min_total_vehicle=0, limit=None)


if __name__ == "__main__":
    service = DataService()
    print(service.density.to_string())
