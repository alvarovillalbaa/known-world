// Original stylized cartography. Atlas units are not latitude, miles or measured
// elevation. Source choices and the geographic accuracy boundary are in docs/attribution.md.
export const WORLD_BOUNDS = Object.freeze({ minX: -120, maxX: 280, minZ: -140, maxZ: 150 });

function landmass(id, name, continent, ring) {
  return Object.freeze({ id, name, continent, ring: Object.freeze(ring.map(point => Object.freeze(point))) });
}

function island(id, name, continent, x, z, rx, rz, phase = 0) {
  const ring = Array.from({ length: 12 }, (_, index) => {
    const angle = index * Math.PI / 6;
    const coast = 1 + 0.12 * Math.sin(index * 2.7 + phase);
    return [x + Math.cos(angle) * rx * coast, z + Math.sin(angle) * rz * coast];
  });
  return landmass(id, name, continent, ring);
}

export const LANDMASSES = Object.freeze([
  landmass('westeros-mainland', 'Westeros', 'westeros', [
    [-108,-139],[-57,-139],[-54,-128],[-43,-125],[-43,-117],[-35,-111],
    [-42,-101],[-39,-94],[-32,-87],[-35,-75],[-43,-70],[-39,-59],
    [-32,-55],[-35,-45],[-42,-39],[-46,-28],[-54,-25],[-58,-14],
    [-54,-7],[-48,-1],[-40,0],[-36,8],[-28,5],[-27,13],[-19,17],
    [-25,22],[-19,29],[-23,37],[-34,39],[-40,46],[-33,51],
    [-34,56],[-26,60],[-24,67],[-32,69],[-29,77],[-22,81],
    [-27,89],[-37,94],[-34,102],[-27,107],[-21,120],[-30,127],
    [-41,128],[-53,124],[-67,127],[-80,121],[-85,112],[-95,111],
    [-99,102],[-97,94],[-102,86],[-108,74],[-104,62],[-98,57],
    [-101,48],[-99,38],[-96,29],[-87,26],[-83,16],[-77,12],
    [-77,4],[-72,-2],[-75,-12],[-84,-20],[-88,-29],[-99,-35],
    [-97,-44],[-106,-49],[-110,-60],[-108,-71],[-114,-77],
    [-111,-86],[-117,-92],[-111,-105],[-115,-115],[-109,-127],
  ]),
  landmass('essos-mainland', 'Essos', 'essos', [
    [0,-9],[20,-22],[30,-12],[42,-13],[54,-26],[65,-25],[77,-33],
    [99,-26],[115,-34],[137,-30],[158,-30],[179,-26],[201,-21],
    [225,-15],[244,-6],[265,4],[278,18],[270,39],[278,65],
    [272,89],[279,109],[269,128],[252,132],[241,120],[228,108],
    [214,114],[198,113],[190,124],[177,120],[174,105],[163,102],
    [157,87],[150,90],[147,107],[139,105],[133,97],[132,81],
    [125,67],[114,64],[113,74],[109,80],[114,93],[111,110],
    [102,124],[94,116],[89,96],[82,88],[70,94],[58,89],
    [45,96],[42,87],[40,80],[30,82],[25,72],[14,75],
    [12,65],[7,61],[11,51],[8,42],[10,35],[5,24],[10,14],[2,5],
  ]),
  island('pyke-island', 'Pyke', 'westeros', -110, 18, 4.7, 4, 1),
  island('great-wyk', 'Great Wyk', 'westeros', -113, 6, 5, 4, 2),
  island('harlaw', 'Harlaw', 'westeros', -101, 10, 4, 3.8, 3),
  island('skagos', 'Skagos', 'westeros', -27, -112, 5, 7, 4),
  island('dragonstone-island', 'Dragonstone', 'westeros', -14, 52, 4.5, 3.6, 5),
  island('tarth', 'Tarth', 'westeros', -13, 83, 4.8, 7, 6),
  island('arbor', 'The Arbor', 'westeros', -96, 123, 5.2, 6, 7),
  island('braavos-isles', 'Braavos', 'essos', 8, -20, 4.2, 3.8, 8),
  island('lorath-isles', 'Lorath', 'essos', 40, -31, 5.5, 4.4, 9),
  island('tyrosh-island', 'Tyrosh', 'essos', 0, 83, 4.3, 4, 10),
  island('lys-island', 'Lys', 'essos', 30, 108, 5.2, 4.5, 11),
  island('ibben', 'Ibben', 'essos', 93, -49, 13, 7.5, 12),
  island('new-ghis-island', 'New Ghis', 'essos', 153, 118, 4.3, 4, 13),
  island('leng', 'Leng', 'essos', 226, 133, 6, 11, 14),
  island('stepstones-north', 'Northern Stepstones', 'essos', -7, 96, 3.1, 3.5, 15),
  island('stepstones-middle', 'Central Stepstones', 'essos', 2, 103, 3.8, 3.6, 16),
  island('stepstones-south', 'Southern Stepstones', 'essos', 12, 110, 4, 3.4, 17),
]);

const wiki = page => `https://awoiaf.westeros.org/index.php/${page}`;
const place = (id, name, type, continent, x, z, description, page) =>
  Object.freeze({ id, name, type, continent, x, z, description, source: wiki(page) });

export const PLACES = Object.freeze([
  place('castle-black', 'Castle Black', 'castle', 'westeros', -66, -110, 'A fortress along the southern side of the Wall.', 'Castle_Black'),
  place('the-wall', 'The Wall', 'landmark', 'westeros', -80, -111, 'The great northern barrier across Westeros.', 'Wall'),
  place('winterfell', 'Winterfell', 'castle', 'westeros', -70, -72, 'An inland stronghold near the heart of the North.', 'Winterfell'),
  place('white-harbor', 'White Harbor', 'city', 'westeros', -46, -38, 'A northern port facing the Bite.', 'White_Harbor'),
  place('dreadfort', 'The Dreadfort', 'castle', 'westeros', -47, -76, 'A stronghold in the eastern North.', 'Dreadfort'),
  place('last-hearth', 'Last Hearth', 'castle', 'westeros', -50, -96, 'A northern castle south of the Wall.', 'Last_Hearth'),
  place('moat-cailin', 'Moat Cailin', 'castle', 'westeros', -68, -15, 'Ruined towers guarding the narrow approach to the North.', 'Moat_Cailin'),
  place('pyke', 'Pyke', 'castle', 'westeros', -110, 18, 'An island stronghold off the western mainland.', 'Pyke'),
  place('riverrun', 'Riverrun', 'castle', 'westeros', -76, 31, 'A riverlands castle at a meeting of rivers.', 'Riverrun'),
  place('the-twins', 'The Twins', 'castle', 'westeros', -70, 8, 'Paired castles controlling a river crossing.', 'Twins'),
  place('harrenhal', 'Harrenhal', 'castle', 'westeros', -55, 43, 'A vast ruined castle beside the Gods Eye.', 'Harrenhal'),
  place('the-eyrie', 'The Eyrie', 'castle', 'westeros', -30, 22, 'A high mountain castle overlooking the Vale.', 'Eyrie'),
  place('gulltown', 'Gulltown', 'city', 'westeros', -25, 33, 'The principal port on the Vale’s southern coast.', 'Gulltown'),
  place('casterly-rock', 'Casterly Rock', 'castle', 'westeros', -97, 46, 'A coastal stronghold above the western sea.', 'Casterly_Rock'),
  place('lannisport', 'Lannisport', 'city', 'westeros', -96, 51, 'A western harbor beside Casterly Rock.', 'Lannisport'),
  place('kings-landing', 'King’s Landing', 'city', 'westeros', -42, 58, 'A city on the shore of Blackwater Bay.', 'King%27s_Landing'),
  place('dragonstone', 'Dragonstone', 'castle', 'westeros', -14, 52, 'An island castle beyond Blackwater Bay.', 'Dragonstone'),
  place('highgarden', 'Highgarden', 'castle', 'westeros', -77, 82, 'A stronghold amid the fertile lands of the Reach.', 'Highgarden'),
  place('oldtown', 'Oldtown', 'city', 'westeros', -92, 103, 'A southwestern port near the mouth of the Honeywine.', 'Oldtown'),
  place('storms-end', 'Storm’s End', 'castle', 'westeros', -29, 80, 'A stormlands castle above Shipbreaker Bay.', 'Storm%27s_End'),
  place('sunspear', 'Sunspear', 'castle', 'westeros', -28, 122, 'A stronghold on Dorne’s eastern coast.', 'Sunspear'),
  place('starfall', 'Starfall', 'castle', 'westeros', -74, 115, 'A Dornish castle at the mouth of the Torrentine.', 'Starfall'),
  place('frostfangs', 'The Frostfangs', 'landmark', 'westeros', -98, -117, 'Mountains in the country beyond the Wall.', 'Frostfangs'),
  place('the-neck', 'The Neck', 'landmark', 'westeros', -67, -3, 'The marshy waist between northern and southern Westeros.', 'Neck'),
  place('braavos', 'Braavos', 'city', 'essos', 8, -20, 'An island port at the northwestern edge of Essos.', 'Braavos'),
  place('lorath', 'Lorath', 'city', 'essos', 40, -31, 'A Free City on islands in the northern sea.', 'Lorath'),
  place('pentos', 'Pentos', 'city', 'essos', 13, 43, 'A western port across the Narrow Sea.', 'Pentos'),
  place('myr', 'Myr', 'city', 'essos', 20, 67, 'A coastal Free City south of Pentos.', 'Myr'),
  place('tyrosh', 'Tyrosh', 'city', 'essos', 0, 83, 'An island city near the Stepstones.', 'Tyrosh'),
  place('lys', 'Lys', 'city', 'essos', 30, 108, 'An island Free City off southern Essos.', 'Lys'),
  place('volantis', 'Volantis', 'city', 'essos', 65, 91, 'A southern port at the mouth of the Rhoyne.', 'Volantis'),
  place('norvos', 'Norvos', 'city', 'essos', 54, 17, 'An inland Free City in hilly western Essos.', 'Norvos'),
  place('qohor', 'Qohor', 'city', 'essos', 77, 39, 'An inland city beside a great forest.', 'Qohor'),
  place('forest-of-qohor', 'Forest of Qohor', 'landmark', 'essos', 77, 26, 'Wooded country east of the western Free Cities.', 'Forest_of_Qohor'),
  place('dothraki-sea', 'Dothraki Sea', 'landmark', 'essos', 116, 25, 'The broad grassland interior of western Essos.', 'Dothraki_sea'),
  place('vaes-dothrak', 'Vaes Dothrak', 'city', 'essos', 140, 13, 'A city beneath the Mother of Mountains.', 'Vaes_Dothrak'),
  place('valyria', 'Valyria', 'landmark', 'essos', 99, 110, 'Ruins on the broken peninsula of southern Essos.', 'Valyria'),
  place('meereen', 'Meereen', 'city', 'essos', 136, 68, 'A city near the northern end of Slaver’s Bay.', 'Meereen'),
  place('yunkai', 'Yunkai', 'city', 'essos', 140, 79, 'A city along the eastern side of Slaver’s Bay.', 'Yunkai'),
  place('astapor', 'Astapor', 'city', 'essos', 141, 93, 'A southern city on the shore of Slaver’s Bay.', 'Astapor'),
  place('qarth', 'Qarth', 'city', 'essos', 183, 112, 'A port beside the passage into the Jade Sea.', 'Qarth'),
  place('red-waste', 'The Red Waste', 'landmark', 'essos', 168, 67, 'Arid country inland from Qarth.', 'Red_waste'),
  place('bone-mountains', 'Bone Mountains', 'landmark', 'essos', 182, 19, 'A long mountain barrier across inland Essos.', 'Bone_Mountains'),
  place('yin', 'Yin', 'city', 'essos', 221, 91, 'The capital city of Yi Ti.', 'Yin'),
  place('asshai', 'Asshai', 'city', 'essos', 262, 118, 'A distant port at the edge of the Shadow Lands.', 'Asshai'),
  place('ibben', 'Ibben', 'landmark', 'essos', 93, -49, 'A large island north of mainland Essos.', 'Ibben'),
  place('leng', 'Leng', 'landmark', 'essos', 226, 133, 'An island in the Jade Sea south of Yi Ti.', 'Leng'),
  place('new-ghis', 'New Ghis', 'city', 'essos', 153, 118, 'An island city south of Ghiscar.', 'New_Ghis'),
]);

export const CATEGORIES = Object.freeze([
  Object.freeze({ id: 'city', label: 'Cities' }),
  Object.freeze({ id: 'castle', label: 'Castles' }),
  Object.freeze({ id: 'landmark', label: 'Landmarks' }),
]);

export const REGION_VIEWS = Object.freeze({
  all: Object.freeze({ x: 74, z: 8, distance: 430, yaw: 0, pitch: 1.08 }),
  westeros: Object.freeze({ x: -67, z: -3, distance: 290, yaw: 0, pitch: 1.1 }),
  essos: Object.freeze({ x: 137, z: 40, distance: 315, yaw: 0, pitch: 1.08 }),
});

export const TOUR_STOPS = Object.freeze([
  'the-wall', 'winterfell', 'kings-landing', 'braavos',
  'volantis', 'meereen', 'qarth', 'asshai',
]);

const byId = new Map(PLACES.map(entry => [entry.id, entry]));
const searchText = text => String(text ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[’']/g, '').toLowerCase();
const searchable = new Map(PLACES.map(entry => [entry.id, searchText(`${entry.name} ${entry.description} ${entry.continent}`)]));

export function getPlace(id) {
  return byId.get(id) ?? null;
}

export function findPlaces(query = '', { continent = 'all', categories } = {}) {
  const terms = searchText(query).trim().split(/\s+/).filter(Boolean);
  const allowed = categories === undefined ? null : new Set(Array.isArray(categories) ? categories : []);
  return PLACES.filter(entry => (continent === 'all' || entry.continent === continent)
    && (allowed === null || allowed.has(entry.type))
    && terms.every(term => searchable.get(entry.id).includes(term)));
}

const indexedLand = LANDMASSES.map(entry => ({
  ...entry,
  minX: Math.min(...entry.ring.map(point => point[0])),
  maxX: Math.max(...entry.ring.map(point => point[0])),
  minZ: Math.min(...entry.ring.map(point => point[1])),
  maxZ: Math.max(...entry.ring.map(point => point[1])),
}));

function segmentDistance(x, z, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
}

function contains(ring, x, z) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if (segmentDistance(x, z, a, b) < 1e-8) return true;
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

const smooth = value => value * value * (3 - 2 * value);
const mix = (a, b, t) => a + (b - a) * t;
const clamp = value => Math.max(0, Math.min(1, value));

// Fixed-seed value noise: no randomness, requests, imagery or elevation data.
function noise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), tx = smooth(x - ix), tz = smooth(z - iz);
  const hash = (a, b) => {
    const value = Math.sin(a * 127.1 + b * 311.7 + 19.37) * 43758.5453;
    return value - Math.floor(value);
  };
  return mix(mix(hash(ix, iz), hash(ix + 1, iz), tx), mix(hash(ix, iz + 1), hash(ix + 1, iz + 1), tx), tz);
}

// Broad, deliberately invented ridges evoke regional terrain; their heights,
// profiles and locations are an illustration, not a canonical height model.
const RIDGES = [
  { continent: 'westeros', a: [-98,-130], b: [-94,-93], width: 7, height: 10.8 },
  { continent: 'westeros', a: [-87,-86], b: [-94,-57], width: 6, height: 6.2 },
  { continent: 'westeros', a: [-40,4], b: [-30,31], width: 6, height: 11.2 },
  { continent: 'westeros', a: [-92,39], b: [-87,65], width: 8, height: 5.2 },
  { continent: 'westeros', a: [-83,103], b: [-41,104], width: 5, height: 7.5 },
  { continent: 'essos', a: [52,5], b: [62,25], width: 8, height: 5.2 },
  { continent: 'essos', a: [139,-3], b: [146,20], width: 6, height: 10.7 },
  { continent: 'essos', a: [177,-18], b: [184,80], width: 8, height: 11.8 },
  { continent: 'essos', a: [255,68], b: [266,114], width: 8, height: 9.8 },
  { continent: 'essos', a: [96,98], b: [101,116], width: 5, height: 6.8 },
];

export function sampleTerrain(x, z, relief = true) {
  const sea = () => ({ height: 0, color: [0.045, 0.15, 0.19], land: false });
  if (!Number.isFinite(x) || !Number.isFinite(z)
    || x < WORLD_BOUNDS.minX || x > WORLD_BOUNDS.maxX
    || z < WORLD_BOUNDS.minZ || z > WORLD_BOUNDS.maxZ) return sea();
  const ground = indexedLand.find(entry => x >= entry.minX && x <= entry.maxX
    && z >= entry.minZ && z <= entry.maxZ && contains(entry.ring, x, z));
  if (!ground) return sea();
  let coast = Infinity;
  for (let i = 0; i < ground.ring.length; i++) {
    coast = Math.min(coast, segmentDistance(x, z, ground.ring[i], ground.ring[(i + 1) % ground.ring.length]));
  }
  let ridge = 0;
  for (const range of RIDGES) {
    if (range.continent !== ground.continent) continue;
    const distance = segmentDistance(x, z, range.a, range.b);
    ridge += range.height * Math.exp(-(distance * distance) / (range.width * range.width));
  }
  const grain = noise(x / 7, z / 7);
  const height = relief ? 0.65 + smooth(clamp(coast / 5)) * (0.6 + 1.4 * noise(x / 23, z / 23) + ridge * (0.8 + grain * 0.2)) : 0.65;
  let color = ground.continent === 'westeros' ? [0.33, 0.43, 0.28] : [0.57, 0.55, 0.32];
  if (ground.continent === 'westeros' && z > 102) color = [0.69, 0.53, 0.32];
  if (ground.continent === 'essos' && x > 158 && z > 35) color = [0.7, 0.52, 0.32];
  if (ground.continent === 'essos' && x > 204 && z < 106) color = [0.34, 0.47, 0.28];
  if (ground.continent === 'essos' && x > 89 && x < 112 && z > 94) color = [0.35, 0.34, 0.29];
  const snow = ground.continent === 'westeros' ? clamp((-z - 88) / 40) : 0;
  const stone = clamp((ridge - 4) / 10);
  color = color.map((channel, index) => {
    const rock = mix(channel, [0.64, 0.63, 0.56][index], stone);
    const winter = mix(rock, [0.85, 0.87, 0.83][index], snow);
    const beach = mix([0.66, 0.59, 0.4][index], winter, clamp(coast / 2));
    return clamp(beach + (grain - 0.5) * 0.045);
  });
  return { height, color, land: true };
}
