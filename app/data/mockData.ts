import { Zone, TransitLine } from "../types";

/**
 * Sample Toronto zones with realistic data.
 * Coordinates approximate real Toronto neighborhoods.
 * Data inspired by 2021 Census + TTC ridership.
 */
export const MOCK_ZONES: Zone[] = [
  {
    id: "z1",
    name: "Downtown Core",
    coordinates: [
      [-79.388, 43.648],
      [-79.375, 43.648],
      [-79.375, 43.658],
      [-79.388, 43.658],
    ],
    center: [43.653, -79.3815],
    populationDensity: 18500,
    jobDensity: 45000,
    trafficLevel: 85,
    distanceToTransit: 0.2,
    medianIncome: 62000,
    growthFlag: true,
    existingRidership: 42000,
    landUse: "commercial",
    needScore: 0,
  },
  {
    id: "z2",
    name: "Liberty Village",
    coordinates: [
      [-79.422, 43.636],
      [-79.41, 43.636],
      [-79.41, 43.643],
      [-79.422, 43.643],
    ],
    center: [43.6395, -79.416],
    populationDensity: 15200,
    jobDensity: 12000,
    trafficLevel: 72,
    distanceToTransit: 0.8,
    medianIncome: 58000,
    growthFlag: true,
    existingRidership: 8500,
    landUse: "mixed",
    needScore: 0,
  },
  {
    id: "z3",
    name: "Scarborough Centre",
    coordinates: [
      [-79.265, 43.77],
      [-79.245, 43.77],
      [-79.245, 43.785],
      [-79.265, 43.785],
    ],
    center: [43.7775, -79.255],
    populationDensity: 9200,
    jobDensity: 5800,
    trafficLevel: 78,
    distanceToTransit: 2.5,
    medianIncome: 42000,
    growthFlag: true,
    existingRidership: 15000,
    landUse: "mixed",
    needScore: 0,
  },
  {
    id: "z4",
    name: "Jane & Finch",
    coordinates: [
      [-79.518, 43.76],
      [-79.5, 43.76],
      [-79.5, 43.775],
      [-79.518, 43.775],
    ],
    center: [43.7675, -79.509],
    populationDensity: 11800,
    jobDensity: 3200,
    trafficLevel: 65,
    distanceToTransit: 3.2,
    medianIncome: 35000,
    growthFlag: false,
    existingRidership: 12000,
    landUse: "residential",
    needScore: 0,
  },
  {
    id: "z5",
    name: "North York Centre",
    coordinates: [
      [-79.42, 43.76],
      [-79.405, 43.76],
      [-79.405, 43.775],
      [-79.42, 43.775],
    ],
    center: [43.7675, -79.4125],
    populationDensity: 14500,
    jobDensity: 18000,
    trafficLevel: 70,
    distanceToTransit: 0.3,
    medianIncome: 55000,
    growthFlag: true,
    existingRidership: 25000,
    landUse: "commercial",
    needScore: 0,
  },
  {
    id: "z6",
    name: "Etobicoke Lakeshore",
    coordinates: [
      [-79.505, 43.605],
      [-79.485, 43.605],
      [-79.485, 43.618],
      [-79.505, 43.618],
    ],
    center: [43.6115, -79.495],
    populationDensity: 6800,
    jobDensity: 4200,
    trafficLevel: 55,
    distanceToTransit: 1.8,
    medianIncome: 72000,
    growthFlag: false,
    existingRidership: 5500,
    landUse: "residential",
    needScore: 0,
  },
  {
    id: "z7",
    name: "Thorncliffe Park",
    coordinates: [
      [-79.345, 43.7],
      [-79.33, 43.7],
      [-79.33, 43.713],
      [-79.345, 43.713],
    ],
    center: [43.7065, -79.3375],
    populationDensity: 19200,
    jobDensity: 6500,
    trafficLevel: 62,
    distanceToTransit: 1.5,
    medianIncome: 38000,
    growthFlag: false,
    existingRidership: 9800,
    landUse: "residential",
    needScore: 0,
  },
  {
    id: "z8",
    name: "Yonge & Eglinton",
    coordinates: [
      [-79.405, 43.705],
      [-79.39, 43.705],
      [-79.39, 43.718],
      [-79.405, 43.718],
    ],
    center: [43.7115, -79.3975],
    populationDensity: 16800,
    jobDensity: 14000,
    trafficLevel: 75,
    distanceToTransit: 0.2,
    medianIncome: 68000,
    growthFlag: true,
    existingRidership: 28000,
    landUse: "mixed",
    needScore: 0,
  },
  {
    id: "z9",
    name: "Weston - Mt. Dennis",
    coordinates: [
      [-79.525, 43.69],
      [-79.505, 43.69],
      [-79.505, 43.705],
      [-79.525, 43.705],
    ],
    center: [43.6975, -79.515],
    populationDensity: 8900,
    jobDensity: 4800,
    trafficLevel: 58,
    distanceToTransit: 2.8,
    medianIncome: 40000,
    growthFlag: true,
    existingRidership: 7200,
    landUse: "mixed",
    needScore: 0,
  },
  {
    id: "z10",
    name: "Danforth East",
    coordinates: [
      [-79.315, 43.685],
      [-79.295, 43.685],
      [-79.295, 43.698],
      [-79.315, 43.698],
    ],
    center: [43.6915, -79.305],
    populationDensity: 10500,
    jobDensity: 5500,
    trafficLevel: 52,
    distanceToTransit: 0.6,
    medianIncome: 54000,
    growthFlag: false,
    existingRidership: 14000,
    landUse: "mixed",
    needScore: 0,
  },
  {
    id: "z11",
    name: "Rexdale",
    coordinates: [
      [-79.58, 43.735],
      [-79.555, 43.735],
      [-79.555, 43.75],
      [-79.58, 43.75],
    ],
    center: [43.7425, -79.5675],
    populationDensity: 7600,
    jobDensity: 8500,
    trafficLevel: 68,
    distanceToTransit: 4.1,
    medianIncome: 39000,
    growthFlag: false,
    existingRidership: 6800,
    landUse: "industrial",
    needScore: 0,
  },
  {
    id: "z12",
    name: "Agincourt",
    coordinates: [
      [-79.29, 43.785],
      [-79.27, 43.785],
      [-79.27, 43.8],
      [-79.29, 43.8],
    ],
    center: [43.7925, -79.28],
    populationDensity: 8200,
    jobDensity: 4100,
    trafficLevel: 60,
    distanceToTransit: 3.5,
    medianIncome: 45000,
    growthFlag: true,
    existingRidership: 8900,
    landUse: "residential",
    needScore: 0,
  },
  {
    id: "z13",
    name: "Flemingdon Park",
    coordinates: [
      [-79.345, 43.718],
      [-79.33, 43.718],
      [-79.33, 43.731],
      [-79.345, 43.731],
    ],
    center: [43.7245, -79.3375],
    populationDensity: 17200,
    jobDensity: 5200,
    trafficLevel: 55,
    distanceToTransit: 1.8,
    medianIncome: 36000,
    growthFlag: false,
    existingRidership: 8200,
    landUse: "residential",
    needScore: 0,
  },
  {
    id: "z14",
    name: "Parkdale",
    coordinates: [
      [-79.445, 43.636],
      [-79.43, 43.636],
      [-79.43, 43.647],
      [-79.445, 43.647],
    ],
    center: [43.6415, -79.4375],
    populationDensity: 13800,
    jobDensity: 4800,
    trafficLevel: 48,
    distanceToTransit: 0.5,
    medianIncome: 41000,
    growthFlag: false,
    existingRidership: 11500,
    landUse: "residential",
    needScore: 0,
  },
  {
    id: "z15",
    name: "Malvern",
    coordinates: [
      [-79.22, 43.808],
      [-79.195, 43.808],
      [-79.195, 43.823],
      [-79.22, 43.823],
    ],
    center: [43.8155, -79.2075],
    populationDensity: 7100,
    jobDensity: 2800,
    trafficLevel: 50,
    distanceToTransit: 5.2,
    medianIncome: 37000,
    growthFlag: false,
    existingRidership: 5200,
    landUse: "residential",
    needScore: 0,
  },
  {
    id: "z16",
    name: "Midtown (St. Clair W)",
    coordinates: [
      [-79.43, 43.68],
      [-79.41, 43.68],
      [-79.41, 43.693],
      [-79.43, 43.693],
    ],
    center: [43.6865, -79.42],
    populationDensity: 12400,
    jobDensity: 8200,
    trafficLevel: 60,
    distanceToTransit: 0.4,
    medianIncome: 78000,
    growthFlag: false,
    existingRidership: 16000,
    landUse: "mixed",
    needScore: 0,
  },
  {
    id: "z17",
    name: "Kingston Rd Corridor",
    coordinates: [
      [-79.245, 43.715],
      [-79.225, 43.715],
      [-79.225, 43.728],
      [-79.245, 43.728],
    ],
    center: [43.7215, -79.235],
    populationDensity: 6500,
    jobDensity: 3200,
    trafficLevel: 58,
    distanceToTransit: 3.0,
    medianIncome: 48000,
    growthFlag: true,
    existingRidership: 6100,
    landUse: "mixed",
    needScore: 0,
  },
  {
    id: "z18",
    name: "Downsview",
    coordinates: [
      [-79.48, 43.745],
      [-79.46, 43.745],
      [-79.46, 43.76],
      [-79.48, 43.76],
    ],
    center: [43.7525, -79.47],
    populationDensity: 9800,
    jobDensity: 7200,
    trafficLevel: 63,
    distanceToTransit: 1.2,
    medianIncome: 46000,
    growthFlag: true,
    existingRidership: 10500,
    landUse: "mixed",
    needScore: 0,
  },
  {
    id: "z19",
    name: "The Waterfront",
    coordinates: [
      [-79.38, 43.635],
      [-79.365, 43.635],
      [-79.365, 43.645],
      [-79.38, 43.645],
    ],
    center: [43.64, -79.3725],
    populationDensity: 20500,
    jobDensity: 8800,
    trafficLevel: 70,
    distanceToTransit: 0.7,
    medianIncome: 75000,
    growthFlag: true,
    existingRidership: 18000,
    landUse: "mixed",
    needScore: 0,
  },
  {
    id: "z20",
    name: "Steeles Corridor",
    coordinates: [
      [-79.42, 43.795],
      [-79.395, 43.795],
      [-79.395, 43.81],
      [-79.42, 43.81],
    ],
    center: [43.8025, -79.4075],
    populationDensity: 7800,
    jobDensity: 6500,
    trafficLevel: 72,
    distanceToTransit: 2.2,
    medianIncome: 50000,
    growthFlag: true,
    existingRidership: 7500,
    landUse: "commercial",
    needScore: 0,
  },
];

/**
 * Existing TTC rapid transit lines.
 * Coordinates are [lat, lng] waypoints.
 */
export const MOCK_TRANSIT_LINES: TransitLine[] = [
  {
    id: "line1",
    name: "Line 1 Yonge-University",
    description: "Toronto's oldest and busiest subway line. Opened in 1954 as the Yonge subway, it forms a U-shape connecting Finch in the north to Union Station downtown, and up to Vaughan Metropolitan Centre. It is the backbone of the TTC network, relieving massive surface traffic congestion on Yonge Street.",
    mode: "subway",
    color: "#22c55e",
    coordinates: [
      [43.7825, -79.4153], // Finch
      [43.7709, -79.4128], // North York Centre
      [43.7615, -79.4111], // Sheppard-Yonge
      [43.7254, -79.4000], // Eglinton
      [43.7066, -79.3989], // St. Clair
      [43.6836, -79.3933], // Bloor-Yonge
      [43.6629, -79.3832], // Dundas
      [43.6510, -79.3802], // Union
      [43.6557, -79.3927], // St. Andrew
      [43.6664, -79.4029], // Museum
      [43.6722, -79.4069], // St. George
      [43.6857, -79.4118], // Dupont
      [43.6990, -79.4350], // Eglinton West
      [43.7252, -79.4511], // Glencairn
      [43.7494, -79.4636], // Wilson
      [43.7585, -79.4696], // Downsview
      [43.7671, -79.4773], // Sheppard West
    ],
    stations: [
      { name: "Finch", position: [43.7825, -79.4153] },
      { name: "North York Centre", position: [43.7709, -79.4128] },
      { name: "Sheppard-Yonge", position: [43.7615, -79.4111] },
      { name: "Eglinton", position: [43.7254, -79.4000] },
      { name: "Bloor-Yonge", position: [43.6836, -79.3933] },
      { name: "Union", position: [43.6510, -79.3802] },
      { name: "St. George", position: [43.6722, -79.4069] },
      { name: "Downsview Park", position: [43.7585, -79.4696] },
    ],
    dailyRidership: 795000,
    avgSpeed: 32,
    headway: 2.5,
    reliability: 91,
  },
  {
    id: "line2",
    name: "Line 2 Bloor-Danforth",
    description: "Opened in 1966, this major east-west subway artery runs perfectly parallel to the lakeshore across the city. It replaced a heavily congested streetcar route and connected the growing suburban regions of Etobicoke (Kipling) and Scarborough (Kennedy) directly to the downtown core.",
    mode: "subway",
    color: "#22c55e",
    coordinates: [
      [43.6451, -79.5363], // Kipling
      [43.6466, -79.5225], // Islington
      [43.6479, -79.5079], // Royal York
      [43.6516, -79.4795], // Old Mill
      [43.6559, -79.4685], // Jane
      [43.6595, -79.4526], // Runnymede
      [43.6635, -79.4372], // High Park
      [43.6644, -79.4252], // Keele
      [43.6677, -79.4181], // Dundas West
      [43.6737, -79.4061], // Ossington
      [43.6690, -79.3989], // Christie
      [43.6748, -79.3933], // Bathurst
      [43.6775, -79.3899], // Spadina
      [43.6722, -79.4069], // St. George
      [43.6836, -79.3933], // Bloor-Yonge
      [43.6813, -79.3792], // Sherbourne
      [43.6782, -79.3617], // Castle Frank
      [43.6768, -79.3528], // Broadview
      [43.6832, -79.3371], // Pape
      [43.6903, -79.3117], // Woodbine
      [43.6954, -79.2927], // Main Street
      [43.6996, -79.2772], // Victoria Park
      [43.7088, -79.2619], // Warden
      [43.7233, -79.2389], // Kennedy
    ],
    stations: [
      { name: "Kipling", position: [43.6451, -79.5363] },
      { name: "Islington", position: [43.6466, -79.5225] },
      { name: "Bloor-Yonge", position: [43.6836, -79.3933] },
      { name: "Pape", position: [43.6832, -79.3371] },
      { name: "Kennedy", position: [43.7233, -79.2389] },
    ],
    dailyRidership: 540000,
    avgSpeed: 30,
    headway: 3,
    reliability: 93,
  },
  {
    id: "line3",
    name: "Line 4 Sheppard",
    description: "A short east-west subway line in North York opened in 2002. It was originally planned to span from Downsview to Scarborough, but was cut short due to funding. It acts as a catalyst for dense, transit-oriented development (TOD) along the Sheppard East corridor.",
    mode: "subway",
    color: "#22c55e",
    coordinates: [
      [43.7615, -79.4111], // Sheppard-Yonge
      [43.7602, -79.3919], // Bayview
      [43.7592, -79.3765], // Bessarion
      [43.7572, -79.3537], // Leslie
      [43.7529, -79.3339], // Don Mills
    ],
    stations: [
      { name: "Sheppard-Yonge", position: [43.7615, -79.4111] },
      { name: "Bayview", position: [43.7602, -79.3919] },
      { name: "Don Mills", position: [43.7529, -79.3339] },
    ],
    dailyRidership: 50000,
    avgSpeed: 30,
    headway: 5,
    reliability: 95,
  },
  {
    id: "line5",
    name: "Eglinton Crosstown LRT",
    description: "A massive multi-billion dollar light rail transit (LRT) project running 19km across Midtown Toronto. Once fully operational, it is expected to cut travel times by up to 60%, removing thousands of cars from the highly congested Eglinton Avenue.",
    mode: "lrt",
    color: "#eab308",
    coordinates: [
      [43.6912, -79.5065], // Mt. Dennis
      [43.6942, -79.4875], // Keelesdale
      [43.6985, -79.4655], // Caledonia
      [43.7035, -79.4486], // Dufferin
      [43.7095, -79.4310], // Oakwood
      [43.7145, -79.4155], // Chaplin
      [43.7200, -79.4020], // Eglinton
      [43.7254, -79.3888], // Mt. Pleasant
      [43.7282, -79.3645], // Bayview
      [43.7320, -79.3415], // Don Mills
      [43.7368, -79.3185], // Birchmount
      [43.7405, -79.2975], // Kennedy
    ],
    stations: [
      { name: "Mt. Dennis", position: [43.6912, -79.5065] },
      { name: "Eglinton", position: [43.7200, -79.4020] },
      { name: "Don Mills", position: [43.7320, -79.3415] },
      { name: "Kennedy", position: [43.7405, -79.2975] },
    ],
    dailyRidership: 115000,
  },
  // Add major streetcars / LRTs
  {
    id: "route504",
    name: "504 King Streetcar",
    description: "The busiest surface transit route in Toronto. In 2017, the city implemented the 'King Street Transit Pilot' which restricted car traffic, dramatically improving streetcar speed and reliability, and increasing ridership by over 16%.",
    mode: "lrt",
    color: "#eab308", // Yellow
    coordinates: [
      [43.6538, -79.4542], // Dundas West
      [43.6395, -79.4162], // Liberty Village / King & Dufferin
      [43.6441, -79.4024], // King & Bathurst
      [43.6477, -79.3852], // St Andrew
      [43.6492, -79.3789], // King
      [43.6525, -79.3496], // King & Sumach
      [43.6768, -79.3528], // Broadview Stn
    ],
    stations: [], // Streetcars have too many stops, omit for map clarity
    dailyRidership: 85000,
    avgSpeed: 16,
    headway: 4,
    reliability: 84, // King St pilot improved this
  },
  {
    id: "route510",
    name: "510 Spadina Streetcar",
    description: "A dedicated right-of-way streetcar line acting as the primary transit spine for the dense Spadina Avenue corridor, connecting the Bloor subway down to the waterfront. Its dedicated lanes allow it to bypass regular street traffic.",
    mode: "lrt",
    color: "#eab308", // Yellow
    coordinates: [
      [43.6672, -79.4038], // Spadina Stn
      [43.6592, -79.4005], // College
      [43.6521, -79.3980], // Dundas
      [43.6483, -79.3965], // Queen
      [43.6455, -79.3952], // King
      [43.6385, -79.3920], // Queens Quay
      [43.6415, -79.3802], // Union
    ],
    stations: [],
    dailyRidership: 45000,
    avgSpeed: 18,
    headway: 5,
    reliability: 82,
  },
  // Add major bus / BRT corridors
  {
    id: "route939",
    name: "939 Finch Express",
    description: "A vital express bus service spanning the northern suburbs. It provides crucial east-west connectivity across Finch Avenue, linking the Yonge subway line directly to Scarborough, serving thousands of commuters in transit-deprived areas.",
    mode: "bus",
    color: "#3b82f6", // Blue
    coordinates: [
      [43.7825, -79.4153], // Finch Stn
      [43.7871, -79.3992], // Willowdale
      [43.7915, -79.3815], // Bayview
      [43.7958, -79.3621], // Leslie
      [43.8002, -79.3458], // Don Mills
      [43.8041, -79.3241], // Victoria Park
      [43.8115, -79.2941], // Warden
      [43.8155, -79.2785], // Birchmount
      [43.8205, -79.2605], // Kennedy
    ],
    stations: [
      { name: "Finch Stn", position: [43.7825, -79.4153] },
      { name: "Don Mills", position: [43.8002, -79.3458] },
      { name: "Kennedy", position: [43.8205, -79.2605] }
    ],
    dailyRidership: 38000,
    avgSpeed: 22,
    headway: 8,
    reliability: 78,
  },
  {
    id: "route35",
    name: "35 Jane Terminal",
    description: "One of the most heavily utilized local bus routes in the city, driving straight north-south through the Jane corridor. This area is known as an 'equity-deserving community', and this bus line serves as a critical lifeline to rapid transit for lower-income residents.",
    mode: "bus",
    color: "#3b82f6",
    coordinates: [
      [43.6495, -79.4842], // Jane Stn
      [43.6559, -79.4905], // Annette
      [43.6705, -79.4975], // St Clair
      [43.6895, -79.5052], // Eglinton
      [43.7225, -79.5158], // Lawrence
      [43.7435, -79.5215], // Wilson
      [43.7545, -79.5245], // Sheppard
      [43.7675, -79.5090], // Jane & Finch
      [43.7745, -79.5285], // Steeles
    ],
    stations: [
      { name: "Jane Stn", position: [43.6495, -79.4842] },
      { name: "Eglinton", position: [43.6895, -79.5052] },
      { name: "Jane/Finch", position: [43.7675, -79.5090] }
    ],
    dailyRidership: 42000,
    avgSpeed: 19,
    headway: 6,
    reliability: 75,
  },
  {
    id: "route52",
    name: "52 Lawrence West",
    description: "An essential cross-town bus linking the Yonge subway to Toronto Pearson Airport via Lawrence Avenue West. It navigates dense residential neighborhoods, alleviating high car traffic to and from the region's largest airport.",
    mode: "bus",
    color: "#3b82f6",
    coordinates: [
      [43.7258, -79.4022], // Lawrence Stn
      [43.7205, -79.4215], // Bathurst
      [43.7175, -79.4358], // Allen Rd
      [43.7145, -79.4525], // Dufferin
      [43.7105, -79.4755], // Keele
      [43.7055, -79.4985], // Jane
      [43.6985, -79.5285], // Scarlett
      [43.6945, -79.5458], // Royal York
      [43.6885, -79.5755], // Dixon / Airport
    ],
    stations: [
      { name: "Lawrence Stn", position: [43.7258, -79.4022] },
      { name: "Lawrence West", position: [43.7175, -79.4358] },
      { name: "Airport", position: [43.6885, -79.5755] }
    ],
    dailyRidership: 44000,
  }
];
