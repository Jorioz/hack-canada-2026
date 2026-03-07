import pandas as pd
from api.utils.density import load_neighbourhood_density


class DataService:
    def __init__(self):
        self.density = load_neighbourhood_density()


if __name__ == "__main__":
    service = DataService()
    print(service.density.to_string())
