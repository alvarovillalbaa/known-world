// Pure geometry and current authored cartography; no browser or GPU executes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { WORLD_BOUNDS, PLACES, REGION_VIEWS, sampleTerrain } from '../public/src/world.js';
import { normalizeCamera } from '../public/src/view-state.js';
import { dot, cross, unit, multiplyMatrices, transformPoint, perspective, adaptiveFov, createCameraFrame, projectPoint, screenRay,
  intersectPlane, intersectTriangle, buildTerrainMesh, sampleMeshHeight, pickTerrain, terrainVisible, projectPlaces,
  pickProjectedPlace, navigateCamera, panPixels, drawingBufferSize, MAX_GRID_VERTICES } from '../public/src/geo.js';

const near = (a, b, tolerance = 0.001) => assert.ok(Math.abs(a - b) <= tolerance, `${a} should be near ${b}`);
const bounds = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };
const sample = (x, z, relief) => ({ height: relief ? 2 + x * 0.08 + z * 0.04 : 0, color: [0.3, 0.5, 0.2], land: true });

test('vector directions are orthogonal and invalid zero directions fail explicitly', () => {
  assert.deepEqual(cross([1, 0, 0], [0, 1, 0]), [0, 0, 1]);
  assert.equal(dot([1, 2, 3], [3, 2, 1]), 10);
  near(Math.hypot(...unit([4, 5, 6])), 1);
  assert.throws(() => unit([0, 0, 0]), /direction/);
  assert.throws(() => unit([Infinity, 1, 2]), /direction/);
});

test('column-major composition applies scale then translation without mutating either matrix', () => {
  const scale = new Float32Array([2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 4, 0, 0, 0, 0, 1]);
  const translation = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 6, 7, 1]);
  const before = [...translation];
  assert.deepEqual(transformPoint(multiplyMatrices(translation, scale), [1, 2, 3]), [7, 12, 19, 1]);
  assert.deepEqual([...translation], before);
});

test('perspective validates near/far bounds and widens vertical coverage in portrait', () => {
  assert.ok(adaptiveFov(390 / 844) > adaptiveFov(1440 / 900));
  for (const args of [[0], [-1], [NaN], [1, 0], [1, 10, 2]]) assert.throws(() => perspective(...args), /projection/);
  for (const aspect of [0.3, 1, 2]) assert.ok([...perspective(aspect)].every(Number.isFinite));
});

test('yaw zero keeps north above the target and east to its right', () => {
  const camera = normalizeCamera({ x: 0, z: 0, distance: 100, yaw: 0, pitch: 1 });
  const frame = createCameraFrame(camera, 900, 600);
  const center = projectPoint([0, 0, 0], frame), north = projectPoint([0, 0, -10], frame), east = projectPoint([10, 0, 0], frame);
  near(center.x, 450); near(center.y, 300);
  assert.ok(north.y < center.y); assert.ok(east.x > center.x);
  assert.ok(frame.eye[2] > frame.target[2]);
});

test('projection and CSS-pixel rays round-trip on desktop and portrait across camera yaw', () => {
  for (const [width, height] of [[1440, 900], [390, 844]]) for (const yaw of [0, 1.2, -2.5]) {
    const frame = createCameraFrame(normalizeCamera({ x: 4, z: -3, distance: 120, yaw, pitch: 0.8 }), width, height, () => 2);
    for (const point of [[4, 2, -3], [14, 2, 7], [-8, 2, -14]]) {
      const screen = projectPoint(point, frame); assert.equal(screen.visible, true);
      const hit = intersectPlane(screenRay(screen.x, screen.y, frame), 2);
      assert.ok(hit); point.forEach((value, i) => near(hit[i], value));
    }
  }
});

test('a close low-angle pose lifts the actual camera above adjacent steep relief', () => {
  const heightAt = (_x, z) => z > 15 ? 40 : 0;
  const frame = createCameraFrame(normalizeCamera({ x: 0, z: 0, distance: 28, yaw: 0, pitch: 0.28 }), 390, 844, heightAt);
  assert.ok(frame.eye[1] >= heightAt(frame.eye[0], frame.eye[2]) + 2.5);
  const target = projectPoint(frame.target, frame); near(target.x, 195); near(target.y, 422);
  const ray = screenRay(195, 422, frame), towardTarget = unit(frame.target.map((value, i) => value - frame.eye[i]));
  near(dot(ray.direction, towardTarget), 1, 1e-7);
  assert.ok([...frame.matrix].every(Number.isFinite));
});

test('terrain grids retain bounded 16-bit indices, upward winding and normalized slope normals', () => {
  const mesh = buildTerrainMesh(bounds, sample, 8, 6), count = mesh.positions.length / 3;
  assert.equal(count, 63); assert.ok(count <= MAX_GRID_VERTICES);
  assert.ok(mesh.indices instanceof Uint16Array); assert.equal(mesh.indices.length, 8 * 6 * 6);
  for (const index of mesh.indices) assert.ok(index < count);
  for (let i = 0; i < mesh.normals.length; i += 3) {
    near(Math.hypot(...mesh.normals.slice(i, i + 3)), 1); assert.ok(mesh.normals[i + 1] > 0);
  }
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const p = [...mesh.indices.slice(i, i + 3)].map(index => [...mesh.positions.slice(index * 3, index * 3 + 3)]);
    assert.ok(cross(p[1].map((v, j) => v - p[0][j]), p[2].map((v, j) => v - p[0][j]))[1] > 0);
  }
});

test('oversized meshes reject before sampling and malformed terrain cannot produce GPU data', () => {
  let samples = 0;
  assert.throws(() => buildTerrainMesh(bounds, () => { samples++; return sample(0, 0, true); }, 512, 512), /16-bit/);
  assert.equal(samples, 0);
  assert.throws(() => buildTerrainMesh({ ...bounds, maxX: bounds.minX }, sample), /bounds/);
  for (const invalid of [NaN, Infinity, 201]) assert.throws(() => buildTerrainMesh(bounds, () => ({ height: invalid, color: [0, 0, 0] }), 1, 1), /sample/);
  assert.throws(() => buildTerrainMesh(bounds, () => ({ height: 0, color: [0, -1, 2] }), 1, 1), /sample/);
});

test('mesh surface sampling follows the same two triangles used for rendering', () => {
  const mesh = buildTerrainMesh(bounds, sample, 4, 4);
  for (const [x, z] of [[-10, -10], [-3.2, 2.7], [0, 0], [9, 8], [10, 10]]) near(sampleMeshHeight(mesh, x, z), sample(x, z, true).height + 0.08);
  near(sampleMeshHeight(mesh, 4, 5, 0), 0.08);
  assert.equal(sampleMeshHeight(mesh, 100, 100), 0);
});

test('triangle intersection rejects parallel, behind-camera and outside hits', () => {
  const a = [-1, 0, -1], b = [0, 0, 1], c = [1, 0, -1];
  near(intersectTriangle({ origin: [0, 4, 0], direction: [0, -1, 0] }, a, b, c), 4);
  assert.equal(intersectTriangle({ origin: [0, 4, 0], direction: [1, 0, 0] }, a, b, c), null);
  assert.equal(intersectTriangle({ origin: [0, 4, 0], direction: [0, 1, 0] }, a, b, c), null);
  assert.equal(intersectTriangle({ origin: [4, 4, 0], direction: [0, -1, 0] }, a, b, c), null);
  assert.equal(intersectPlane({ origin: [0, 4, 0], direction: [1, 0, 0] }), null);
});

test('a projected terrain point is picked on the actual raised and flattened triangles', () => {
  const mesh = buildTerrainMesh(bounds, sample, 6, 6);
  for (const scale of [0, 1]) {
    const heightAt = (x, z) => sampleMeshHeight(mesh, x, z, scale);
    const frame = createCameraFrame(normalizeCamera({ x: 0, z: 0, distance: 80, yaw: 0.4, pitch: 0.9 }), 800, 600, heightAt);
    for (const [x, z] of [[-5, -4], [0.5, 2.7], [8, 8]]) {
      const point = [x, heightAt(x, z), z], screen = projectPoint(point, frame), hit = pickTerrain(screenRay(screen.x, screen.y, frame), mesh, scale);
      assert.ok(hit); point.forEach((value, index) => near(hit[index], value));
    }
  }
});

test('terrain occlusion removes a marker behind a ridge while retaining a clear elevated sightline', () => {
  const ridge = (x) => x > 15 && x < 25 ? 20 : 0;
  assert.equal(terrainVisible([0, 12, 0], [40, 2, 0], ridge), false);
  assert.equal(terrainVisible([0, 65, 0], [40, 2, 0], ridge), true);
});

test('catalog projection filters exact categories and keeps depth-consistent CSS-pixel picking', () => {
  const places = Object.freeze([{ id: 'city', type: 'city', x: 0, z: 0 }, { id: 'castle', type: 'castle', x: 6, z: 2 }].map(Object.freeze));
  const frame = createCameraFrame(normalizeCamera({ x: 0, z: 0, distance: 80, yaw: 0, pitch: 1 }), 800, 600);
  const all = projectPlaces(places, frame, () => 0), city = all[0];
  assert.equal(pickProjectedPlace(all, city.x, city.y), 'city');
  assert.equal(projectPlaces(places, frame, () => 0, []).some(place => place.visible), false);
  const filtered = projectPlaces(places, frame, () => 0, ['castle']);
  assert.equal(filtered[0].visible, false); assert.equal(filtered[1].visible, true);
  assert.equal(pickProjectedPlace(filtered, city.x, city.y, 2), null);
  assert.equal(pickProjectedPlace([{ id: 'far', x: 5, y: 5, depth: 20, visible: true }, { id: 'near', x: 5, y: 5, depth: 10, visible: true }], 5, 5), 'near');
});

test('navigation uses screen-relative axes at every yaw and central camera bounds remain authoritative', () => {
  const camera = normalizeCamera({ x: 0, z: 0, distance: 100, yaw: 0, pitch: 1 });
  const east = navigateCamera(camera, { panX: 10 }, normalizeCamera); near(east.x, 10); near(east.z, 0);
  const rotated = navigateCamera({ ...camera, yaw: Math.PI / 2 }, { panX: 10, panZ: 4 }, normalizeCamera); near(rotated.x, 4); near(rotated.z, -10);
  const zoom = navigateCamera(camera, { zoom: 100, tilt: 100, panX: Infinity }, normalizeCamera);
  assert.equal(zoom.distance, 28); assert.equal(zoom.pitch, 1.42); near(zoom.x, 0);
  const dragged = panPixels(camera, 30, 20, 390, 844, normalizeCamera);
  assert.ok(dragged.x < camera.x); assert.ok(dragged.z < camera.z);
});

test('drawing buffers cap DPR, dimensions and pixel count independently of CSS coordinates', () => {
  for (const [w, h, dpr] of [[390, 844, 3], [1440, 900, 4], [100000, 50000, 5], [0, 0, NaN]]) {
    const size = drawingBufferSize(w, h, dpr);
    assert.ok(size.width >= 1 && size.height >= 1 && size.width <= 4096 && size.height <= 4096);
    assert.ok(size.width * size.height <= 2_000_000); assert.ok(size.scale <= 2);
  }
  const limited = drawingBufferSize(1000, 800, 2, 1024); assert.ok(limited.width <= 1024 && limited.height <= 1024);
});

test('all 48 places fit All home and each continent home on desktop and portrait with useful margins', () => {
  assert.equal(PLACES.length, 48);
  for (const [region, camera] of Object.entries(REGION_VIEWS)) for (const [width, height] of [[1440, 900], [390, 844]]) {
    const frame = createCameraFrame(camera, width, height, (x, z) => sampleTerrain(x, z).height);
    const places = PLACES.filter(place => region === 'all' || place.continent === region);
    for (const place of places) {
      const projected = projectPoint([place.x, sampleTerrain(place.x, place.z).height + 1.5, place.z], frame);
      assert.ok(projected.visible, `${region}/${width}: ${place.name} must fit.`);
      assert.ok(projected.x >= 24 && projected.x <= width - 24 && projected.y >= 24 && projected.y <= height - 24, `${region}/${width}: ${place.name} needs a visible margin.`);
    }
  }
});

test('the actual terrain dataset produces finite GPU arrays within the declared mesh budget', () => {
  const mesh = buildTerrainMesh(WORLD_BOUNDS, sampleTerrain);
  assert.equal(mesh.positions.length / 3, 27_985);
  for (const array of [mesh.positions, mesh.normals, mesh.colors, mesh.flatColors]) assert.ok(array.every(Number.isFinite));
  assert.ok(mesh.indices.every(index => index < MAX_GRID_VERTICES));
  for (const place of PLACES) assert.ok(Number.isFinite(sampleMeshHeight(mesh, place.x, place.z)));
});
