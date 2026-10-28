import test from 'node:test';
import assert from 'node:assert/strict';
import { WORLD_BOUNDS, LANDMASSES, PLACES, CATEGORIES, REGION_VIEWS, TOUR_STOPS, getPlace, findPlaces, sampleTerrain } from '../public/src/world.js';

// Independent winding-number check of the authored geometry, not a terrain stub.
function inside(ring, x, z) {
  let winding = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const cross = (b[0] - a[0]) * (z - a[1]) - (x - a[0]) * (b[1] - a[1]);
    if (a[1] <= z && b[1] > z && cross > 0) winding++;
    if (a[1] > z && b[1] <= z && cross < 0) winding--;
  }
  return winding !== 0;
}

test('the curated catalog covers both continents and all three geographic kinds', () => {
  assert.ok(PLACES.length >= 35 && PLACES.length <= 50);
  assert.equal(new Set(PLACES.map(place => place.id)).size, PLACES.length);
  assert.deepEqual(CATEGORIES.map(category => category.id).sort(), ['castle', 'city', 'landmark']);
  for (const continent of ['westeros', 'essos']) assert.ok(PLACES.filter(place => place.continent === continent).length >= 15);
  for (const category of CATEGORIES) assert.ok(PLACES.some(place => place.type === category.id));
});

test('every place belongs to land on its declared continent and carries a geographic reference', () => {
  for (const place of PLACES) {
    assert.ok(LANDMASSES.some(land => land.continent === place.continent && inside(land.ring, place.x, place.z)), place.id);
    assert.equal(sampleTerrain(place.x, place.z).land, true, place.id);
    assert.ok(place.description.length > 15 && place.description.length < 160, place.id);
    assert.match(place.source, /^https:\/\/awoiaf\.westeros\.org\/index\.php\/[A-Za-z0-9_%]+$/);
    assert.equal(getPlace(place.id), place);
  }
  assert.equal(getPlace('unknown-place'), null);
});

test('all original coastlines are finite, bounded, nondegenerate simple rings', () => {
  assert.equal(new Set(LANDMASSES.map(land => land.id)).size, LANDMASSES.length);
  for (const land of LANDMASSES) {
    assert.ok(land.ring.length >= 8, land.id);
    let area = 0;
    for (let i = 0; i < land.ring.length; i++) {
      const a = land.ring[i], b = land.ring[(i + 1) % land.ring.length];
      for (const point of [a, b]) {
        assert.ok(point.every(Number.isFinite));
        assert.ok(point[0] >= WORLD_BOUNDS.minX && point[0] <= WORLD_BOUNDS.maxX, land.id);
        assert.ok(point[1] >= WORLD_BOUNDS.minZ && point[1] <= WORLD_BOUNDS.maxZ, land.id);
      }
      assert.notDeepEqual(a, b, land.id);
      area += a[0] * b[1] - b[0] * a[1];
      for (let j = i + 2; j < land.ring.length; j++) {
        if (i === 0 && j === land.ring.length - 1) continue;
        const c = land.ring[j], d = land.ring[(j + 1) % land.ring.length];
        const side = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
        assert.ok(!(side(a,b,c) * side(a,b,d) < 0 && side(c,d,a) * side(c,d,b) < 0), `${land.id}: intersecting edges ${i}/${j}`);
      }
    }
    assert.ok(Math.abs(area) > 10, land.id);
  }
});

test('geographic ordering preserves the north-south and west-east reading of the atlas', () => {
  assert.ok(getPlace('the-wall').z < getPlace('winterfell').z);
  assert.ok(getPlace('winterfell').z < getPlace('kings-landing').z);
  assert.ok(getPlace('kings-landing').z < getPlace('sunspear').z);
  assert.ok(getPlace('braavos').x > getPlace('winterfell').x);
  assert.ok(getPlace('volantis').x < getPlace('meereen').x);
  assert.ok(getPlace('meereen').x < getPlace('qarth').x);
  assert.ok(getPlace('qarth').x < getPlace('asshai').x);
  assert.ok(getPlace('pentos').z > getPlace('braavos').z);
  assert.ok(getPlace('astapor').z > getPlace('meereen').z);
});

test('the Narrow Sea, Slaver’s Bay and open-water margins remain water', () => {
  for (const [x,z] of [[-9,30], [-5,-60], [124,90], [60,125], [170,142], [-119,145]]) {
    assert.deepEqual(sampleTerrain(x,z), { height: 0, color: [0.045,0.15,0.19], land: false }, `${x},${z}`);
  }
});

test('sampling is deterministic, finite and normalized over a grid spanning the whole atlas', () => {
  for (let x = WORLD_BOUNDS.minX; x <= WORLD_BOUNDS.maxX; x += 11) {
    for (let z = WORLD_BOUNDS.minZ; z <= WORLD_BOUNDS.maxZ; z += 11) {
      const sample = sampleTerrain(x,z);
      assert.deepEqual(sample, sampleTerrain(x,z));
      assert.ok(Number.isFinite(sample.height) && sample.height >= 0 && sample.height < 20);
      assert.equal(sample.color.length, 3);
      assert.ok(sample.color.every(channel => Number.isFinite(channel) && channel >= 0 && channel <= 1));
      if (!sample.land) assert.equal(sample.height, 0);
    }
  }
});

test('flat presentation preserves the same land and color identity while removing relief', () => {
  let mountains = 0;
  for (const place of PLACES) {
    const terrain = sampleTerrain(place.x,place.z), flat = sampleTerrain(place.x,place.z,false);
    assert.equal(flat.land, terrain.land);
    assert.deepEqual(flat.color, terrain.color);
    assert.equal(flat.height, 0.65);
    if (terrain.height > 8) mountains++;
  }
  assert.ok(mountains >= 3, 'both continents must have visible invented relief');
  assert.ok(sampleTerrain(-98,-117).height > 8);
  assert.ok(sampleTerrain(182,19).height > 8);
});

test('invalid or out-of-bounds coordinates cannot produce invalid mesh heights', () => {
  for (const [x,z] of [[NaN,0], [0,Infinity], [-Infinity,0], [281,20], [-121,0], [0,151], [0,-141]]) {
    const sample = sampleTerrain(x,z);
    assert.equal(sample.land, false);
    assert.equal(sample.height, 0);
  }
});

test('search is case-insensitive, whitespace-tolerant and apostrophe-tolerant', () => {
  assert.deepEqual(findPlaces('  WINTERFELL  ').map(place => place.id), ['winterfell']);
  assert.deepEqual(findPlaces("king's landing").map(place => place.id), ['kings-landing']);
  assert.deepEqual(findPlaces('King’s Landing').map(place => place.id), ['kings-landing']);
  assert.ok(findPlaces('island essos').length >= 5);
  assert.deepEqual(findPlaces('no-such-place'), []);
});

test('continent and category filters compose, with an explicit empty selection showing nothing', () => {
  assert.equal(findPlaces('').length, PLACES.length);
  assert.deepEqual(findPlaces('', { categories: [] }), []);
  assert.deepEqual(findPlaces('', { continent: 'essos', categories: ['castle'] }), []);
  const matches = findPlaces('', { continent: 'westeros', categories: ['city'] });
  assert.ok(matches.length >= 4);
  assert.ok(matches.every(place => place.continent === 'westeros' && place.type === 'city'));
  assert.deepEqual(findPlaces('bay', { continent: 'essos', categories: ['city'] }).map(place => place.id), ['meereen', 'yunkai', 'astapor']);
  assert.deepEqual(findPlaces('', { continent: 'invalid' }), []);
});

test('view presets and the guided tour refer to real geography on both continents', () => {
  assert.deepEqual(Object.keys(REGION_VIEWS).sort(), ['all', 'essos', 'westeros']);
  for (const camera of Object.values(REGION_VIEWS)) {
    assert.ok(Object.values(camera).every(Number.isFinite));
    assert.ok(camera.x >= WORLD_BOUNDS.minX && camera.x <= WORLD_BOUNDS.maxX);
    assert.ok(camera.z >= WORLD_BOUNDS.minZ && camera.z <= WORLD_BOUNDS.maxZ);
    assert.ok(camera.distance >= 28 && camera.distance <= 580);
    assert.ok(camera.pitch >= 0.28 && camera.pitch <= 1.42);
  }
  assert.ok(TOUR_STOPS.length >= 4);
  assert.ok(TOUR_STOPS.every(id => getPlace(id)));
  assert.deepEqual([...new Set(TOUR_STOPS.map(id => getPlace(id).continent))].sort(), ['essos', 'westeros']);
});

test('callers cannot mutate the geographic source through returned arrays or samples', () => {
  const matches = findPlaces('');
  matches.pop();
  assert.equal(findPlaces('').length, PLACES.length);
  assert.throws(() => { getPlace('winterfell').x = 200; }, TypeError);
  assert.throws(() => { LANDMASSES[0].ring[0][0] = 200; }, TypeError);
  const sample = sampleTerrain(-70,-72), expected = sampleTerrain(-70,-72);
  sample.color[0] = 99;
  assert.deepEqual(sampleTerrain(-70,-72), expected);
});
