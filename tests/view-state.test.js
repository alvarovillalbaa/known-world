import test from 'node:test';
import assert from 'node:assert/strict';
import { PLACES } from '../public/src/world.js';
import {
  DEFAULT_CAMERA, CAMERA_LIMITS, MAX_BOOKMARKS, normalizeCamera,
  readViewHash, writeViewHash, normalizeBookmarks, loadBookmarks, writeBookmarks,
} from '../public/src/view-state.js';

test('missing, non-object and non-finite cameras retain finite defaults', () => {
  for (const value of [undefined, null, false, 'bad', { x: NaN, z: Infinity, distance: -Infinity, yaw: NaN, pitch: '0.8' }]) {
    const camera = normalizeCamera(value);
    assert.deepEqual(camera, normalizeCamera(DEFAULT_CAMERA));
    assert.ok(Object.values(camera).every(Number.isFinite));
  }
});

test('camera travel, zoom and tilt stay inside the published world bounds', () => {
  const low = normalizeCamera({ x: -1e6, z: -1e6, distance: -1e6, pitch: -1e6 });
  assert.equal(low.x, CAMERA_LIMITS.minX); assert.equal(low.z, CAMERA_LIMITS.minZ);
  assert.equal(low.distance, CAMERA_LIMITS.minDistance); assert.equal(low.pitch, CAMERA_LIMITS.minPitch);
  const high = normalizeCamera({ x: 1e6, z: 1e6, distance: 1e6, pitch: 1e6 });
  assert.equal(high.x, CAMERA_LIMITS.maxX); assert.equal(high.z, CAMERA_LIMITS.maxZ);
  assert.equal(high.distance, CAMERA_LIMITS.maxDistance); assert.equal(high.pitch, CAMERA_LIMITS.maxPitch);
});

test('zero positions and headings survive normalization and repeated headings wrap', () => {
  const camera = normalizeCamera({ x: 0, z: 0, yaw: 0 });
  assert.equal(camera.x, 0); assert.equal(camera.z, 0); assert.equal(camera.yaw, 0);
  for (const yaw of [-100 * Math.PI, -Math.PI, Math.PI, 95 * Math.PI, 1e20]) {
    const result = normalizeCamera({ yaw });
    assert.ok(result.yaw >= -Math.PI && result.yaw <= Math.PI);
  }
});

test('a complete shared view restores the selected place, camera and hidden layers', () => {
  const state = { camera: { x: 12.24, z: -38.5, distance: 72.4, yaw: 0.7654, pitch: 0.6655 }, placeId: PLACES[0].id, terrain: false, labels: false };
  const restored = readViewHash(writeViewHash(state));
  assert.equal(restored.placeId, state.placeId); assert.equal(restored.terrain, false); assert.equal(restored.labels, false);
  for (const key of Object.keys(state.camera)) assert.ok(Math.abs(restored.camera[key] - state.camera[key]) < 0.00001, key);
});

test('place-only URLs focus an existing geographic position without accepting arbitrary IDs', () => {
  const place = PLACES.find(item => item.continent === 'essos'); assert.ok(place);
  const restored = readViewHash(`#place=${encodeURIComponent(place.id)}`);
  assert.equal(restored.placeId, place.id); assert.equal(restored.camera.x, place.x); assert.equal(restored.camera.z, place.z);
  assert.ok(restored.camera.distance < DEFAULT_CAMERA.distance);
  assert.equal(readViewHash('#place=__proto__').placeId, null);
  assert.equal(readViewHash('#place=%3Cscript%3E').placeId, null);
});

test('an explicit camera takes precedence over place-only centering', () => {
  const place = PLACES[0];
  const restored = readViewHash(`#place=${place.id}&x=0&z=0&d=100`);
  assert.equal(restored.camera.x, 0); assert.equal(restored.camera.z, 0); assert.equal(restored.camera.distance, 100);
});

test('untrusted URL values are finite and bounded while unrelated query keys are ignored', () => {
  const state = readViewHash('#v=1&x=Infinity&z=-999999&d=0&yaw=NaN&pitch=9999&terrain=no&labels=0&token=authored');
  assert.equal(state.camera.x, DEFAULT_CAMERA.x); assert.equal(state.camera.z, CAMERA_LIMITS.minZ);
  assert.equal(state.camera.distance, CAMERA_LIMITS.minDistance); assert.equal(state.camera.pitch, CAMERA_LIMITS.maxPitch);
  assert.equal(state.camera.yaw, normalizeCamera().yaw); assert.equal(state.terrain, true); assert.equal(state.labels, false);
  assert.doesNotMatch(writeViewHash(state), /token|authored/);
});

test('unknown URL versions and oversized or non-string hashes use clean defaults', () => {
  const expected = readViewHash('');
  for (const hash of ['#v=999&x=10&labels=0', '#' + 'x'.repeat(2048), null, {}, 23]) assert.deepEqual(readViewHash(hash), expected);
});

test('canonical shared URLs are stable at wrapping headings and navigation extremes', () => {
  for (const yaw of [-Math.PI, -3.14159, -1.34, 0, 1.34, 3.14159, Math.PI, 1000]) {
    for (const x of [CAMERA_LIMITS.minX, 0, CAMERA_LIMITS.maxX]) {
      const first = writeViewHash({ camera: { x, z: 0, yaw, pitch: 1.42, distance: 28 }, placeId: PLACES[0].id });
      const second = writeViewHash(readViewHash(first));
      assert.equal(second, first, `Canonical camera changed at yaw ${yaw}`);
    }
  }
});

test('invalid selection never survives serialization into a share link', () => {
  const hash = writeViewHash({ camera: { x: 2 }, placeId: 'unknown-place', terrain: true, labels: true });
  assert.doesNotMatch(hash, /place=/); assert.equal(readViewHash(hash).placeId, null);
});

test('bookmarks retain known unique IDs in insertion order without mutating their source', () => {
  const source = [PLACES[0].id, 'unrelated', PLACES[1].id, PLACES[0].id, null, {}, '__proto__'];
  const result = normalizeBookmarks(source);
  assert.deepEqual(result, [PLACES[0].id, PLACES[1].id]); assert.equal(source.length, 7);
  assert.deepEqual(normalizeBookmarks({}), []); assert.ok(normalizeBookmarks(PLACES.map(place => place.id)).length <= MAX_BOOKMARKS);
});

test('missing or unavailable bookmark storage is explicit and never prevents navigation', () => {
  assert.deepEqual(loadBookmarks(null), { ids: [], available: false });
  assert.deepEqual(loadBookmarks({ getItem() { throw new Error('denied'); } }), { ids: [], available: false });
  assert.deepEqual(loadBookmarks({ getItem: () => null }), { ids: [], available: true });
  assert.equal(writeBookmarks(null, [PLACES[0].id]), false);
});

test('corrupt bookmark data is not rewritten or erased during loading', () => {
  for (const raw of ['{bad', '{}', 'null']) {
    const writes = [], storage = { getItem: () => raw, setItem(...args) { writes.push(args); } };
    assert.deepEqual(loadBookmarks(storage), { ids: [], available: false }); assert.deepEqual(writes, []);
  }
});

test('bookmark writes affect only this atlas key and report quota failures', () => {
  const storage = new Map([['other-app', 'preserve']]);
  const adapter = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  assert.equal(writeBookmarks(adapter, [PLACES[0].id, PLACES[0].id, 'bad']), true);
  assert.deepEqual(loadBookmarks(adapter), { ids: [PLACES[0].id], available: true });
  assert.equal(storage.get('other-app'), 'preserve'); assert.equal(storage.size, 2);
  let quotaWrites = 0;
  assert.equal(writeBookmarks({ getItem: () => null, setItem() { quotaWrites++; throw new Error('quota'); } }, [PLACES[0].id]), false);
  assert.equal(quotaWrites, 1);
});

test('a new in-tab bookmark does not overwrite an unread existing saved list', () => {
  for (const raw of ['{bad', '{}', 'null']) {
    const writes = [], storage = { getItem: () => raw, setItem(...args) { writes.push(args); } };
    assert.equal(writeBookmarks(storage, [PLACES[0].id]), false);
    assert.deepEqual(writes, []); assert.equal(storage.getItem(), raw);
  }
});
