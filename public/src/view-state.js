import { WORLD_BOUNDS, REGION_VIEWS, PLACES, getPlace } from './world.js';

export const DEFAULT_CAMERA = Object.freeze({ ...REGION_VIEWS.all });
export const CAMERA_LIMITS = Object.freeze({
  minX: WORLD_BOUNDS.minX, maxX: WORLD_BOUNDS.maxX,
  minZ: WORLD_BOUNDS.minZ, maxZ: WORLD_BOUNDS.maxZ,
  minDistance: 28, maxDistance: 580, minPitch: 0.28, maxPitch: 1.42,
});
export const MAX_BOOKMARKS = 64;
const BOOKMARK_KEY = 'known-world.bookmarks.v1';
const knownIds = new Set(PLACES.map(place => place.id));
const finite = (value, fallback) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function normalizeCamera(value = {}) {
  const input = value && typeof value === 'object' ? value : {};
  const yaw = finite(input.yaw, DEFAULT_CAMERA.yaw);
  return {
    x: clamp(finite(input.x, DEFAULT_CAMERA.x), CAMERA_LIMITS.minX, CAMERA_LIMITS.maxX),
    z: clamp(finite(input.z, DEFAULT_CAMERA.z), CAMERA_LIMITS.minZ, CAMERA_LIMITS.maxZ),
    distance: clamp(finite(input.distance, DEFAULT_CAMERA.distance), CAMERA_LIMITS.minDistance, CAMERA_LIMITS.maxDistance),
    yaw: ((yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI,
    pitch: clamp(finite(input.pitch, DEFAULT_CAMERA.pitch), CAMERA_LIMITS.minPitch, CAMERA_LIMITS.maxPitch),
  };
}

function hashNumber(params, key) {
  const value = params.get(key);
  if (value === null || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function readViewHash(hash = '') {
  const fallback = () => ({ camera: normalizeCamera(), placeId: null, terrain: true, labels: true });
  if (typeof hash !== 'string' || hash.length > 2048) return fallback();
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  if (params.has('v') && params.get('v') !== '1') return fallback();
  const place = getPlace(params.get('place'));
  const input = {
    x: hashNumber(params, 'x'), z: hashNumber(params, 'z'),
    distance: hashNumber(params, 'd'), yaw: hashNumber(params, 'yaw'),
    pitch: hashNumber(params, 'pitch'),
  };
  if (place && input.x === undefined && input.z === undefined) {
    input.x = place.x; input.z = place.z; input.distance ??= 68;
  }
  return {
    camera: normalizeCamera(input), placeId: place?.id ?? null,
    terrain: params.get('terrain') !== '0', labels: params.get('labels') !== '0',
  };
}

export function writeViewHash(state = {}) {
  const camera = normalizeCamera(state.camera);
  const round = (value, places) => String(Number(value.toFixed(places)));
  const yaw = clamp(Number(camera.yaw.toFixed(4)), -3.1415, 3.1415);
  const params = new URLSearchParams({
    v: '1', x: round(camera.x, 2), z: round(camera.z, 2),
    d: round(camera.distance, 2), yaw: String(yaw), pitch: round(camera.pitch, 4),
  });
  const place = getPlace(state.placeId);
  if (place) params.set('place', place.id);
  if (state.terrain === false) params.set('terrain', '0');
  if (state.labels === false) params.set('labels', '0');
  return `#${params}`;
}

export function normalizeBookmarks(ids) {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.filter(id => typeof id === 'string' && knownIds.has(id)))].slice(0, MAX_BOOKMARKS);
}

export function loadBookmarks(storage) {
  if (!storage) return { ids: [], available: false };
  try {
    const raw = storage.getItem(BOOKMARK_KEY);
    if (raw === null) return { ids: [], available: true };
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { ids: [], available: false };
    return { ids: normalizeBookmarks(parsed), available: true };
  } catch { return { ids: [], available: false }; }
}

export function writeBookmarks(storage, ids) {
  if (!storage) return false;
  try {
    const previous = storage.getItem(BOOKMARK_KEY);
    if (previous !== null && !Array.isArray(JSON.parse(previous))) return false;
    storage.setItem(BOOKMARK_KEY, JSON.stringify(normalizeBookmarks(ids))); return true;
  }
  catch { return false; }
}
