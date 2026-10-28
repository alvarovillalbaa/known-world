// Pure atlas geometry. Matrices are column-major and use WebGL clip coordinates.
export const FOV_Y = 0.95;
export const MAX_GRID_VERTICES = 65_535;
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export function unit(vector) {
  const length = Math.hypot(...vector);
  if (!Number.isFinite(length) || length < 1e-12) throw new RangeError('A finite nonzero direction is required.');
  return vector.map(value => value / length);
}
export function multiplyMatrices(a, b) {
  const out = new Float32Array(16);
  for (let column = 0; column < 4; column++) for (let row = 0; row < 4; row++) {
    for (let inner = 0; inner < 4; inner++) out[column * 4 + row] += a[inner * 4 + row] * b[column * 4 + inner];
  }
  return out;
}
export function transformPoint(matrix, point) {
  const source = [point[0], point[1], point[2], point[3] ?? 1];
  return [0, 1, 2, 3].map(row => source.reduce((sum, value, column) => sum + value * matrix[column * 4 + row], 0));
}
export const adaptiveFov = aspect => Math.max(FOV_Y, 2 * Math.atan(Math.tan(1.12 / 2) / Math.max(0.1, aspect)));
export function perspective(aspect, near = 0.5, far = 2400) {
  if (![aspect, near, far].every(Number.isFinite) || aspect <= 0 || near <= 0 || far <= near) throw new RangeError('Invalid projection bounds.');
  const f = 1 / Math.tan(adaptiveFov(aspect) / 2), range = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * range, -1, 0, 0, 2 * far * near * range, 0]);
}
export function createCameraFrame(camera, width, height, heightAt = () => 0) {
  if (!['x', 'z', 'distance', 'yaw', 'pitch'].every(key => Number.isFinite(camera?.[key])) || camera.distance <= 0) throw new RangeError('A finite camera is required.');
  width = Math.max(1, finite(width, 1)); height = Math.max(1, finite(height, 1));
  const sampled = (x, z) => {
    const value = heightAt(x, z);
    if (!Number.isFinite(value)) throw new RangeError('Terrain height must be finite.');
    return value;
  };
  const target = [camera.x, sampled(camera.x, camera.z), camera.z];
  const horizontal = camera.distance * Math.cos(camera.pitch);
  const eye = [camera.x + Math.sin(camera.yaw) * horizontal, target[1] + Math.sin(camera.pitch) * camera.distance, camera.z + Math.cos(camera.yaw) * horizontal];
  // A close, low-angle pose must not put the actual camera inside a nearby ridge.
  eye[1] = Math.max(eye[1], sampled(eye[0], eye[2]) + 2.5);
  const forward = unit(target.map((value, index) => value - eye[index]));
  const right = [Math.cos(camera.yaw), 0, -Math.sin(camera.yaw)];
  const up = unit(cross(right, forward));
  const view = new Float32Array([
    right[0], up[0], -forward[0], 0,
    right[1], up[1], -forward[1], 0,
    right[2], up[2], -forward[2], 0,
    -dot(right, eye), -dot(up, eye), dot(forward, eye), 1,
  ]);
  return { eye, target, forward, right, up, width, height, tanHalfY: Math.tan(adaptiveFov(width / height) / 2), matrix: multiplyMatrices(perspective(width / height), view) };
}
export function projectPoint(point, frame) {
  const [x, y, z, w] = transformPoint(frame.matrix, point);
  if (![x, y, z, w].every(Number.isFinite) || w <= 0) return { x: 0, y: 0, visible: false, depth: Infinity };
  return { x: (x / w + 1) * frame.width / 2, y: (1 - y / w) * frame.height / 2, depth: w,
    visible: Math.abs(x) <= w && Math.abs(y) <= w && Math.abs(z) <= w };
}
export function screenRay(x, y, frame) {
  const horizontal = (2 * x / frame.width - 1) * frame.tanHalfY * frame.width / frame.height;
  const vertical = (1 - 2 * y / frame.height) * frame.tanHalfY;
  return { origin: [...frame.eye], direction: unit(frame.forward.map((value, i) => value + frame.right[i] * horizontal + frame.up[i] * vertical)) };
}
export function intersectPlane(ray, y = 0) {
  if (Math.abs(ray.direction[1]) < 1e-9) return null;
  const distance = (y - ray.origin[1]) / ray.direction[1];
  if (!Number.isFinite(distance) || distance < 0) return null;
  return ray.origin.map((value, index) => value + ray.direction[index] * distance);
}
export function intersectTriangle(ray, a, b, c) {
  const edgeA = b.map((value, i) => value - a[i]), edgeB = c.map((value, i) => value - a[i]);
  const p = cross(ray.direction, edgeB), determinant = dot(edgeA, p);
  if (Math.abs(determinant) < 1e-10) return null;
  const inverse = 1 / determinant, offset = ray.origin.map((value, i) => value - a[i]);
  const u = dot(offset, p) * inverse;
  if (u < -1e-8 || u > 1 + 1e-8) return null;
  const q = cross(offset, edgeA), v = dot(ray.direction, q) * inverse;
  if (v < -1e-8 || u + v > 1 + 1e-8) return null;
  const distance = dot(edgeB, q) * inverse;
  return distance > 1e-7 ? distance : null;
}

export function buildTerrainMesh(bounds, sample, columns = 192, rows = 144) {
  if (![columns, rows].every(value => Number.isInteger(value) && value >= 1 && value <= 512)
    || (columns + 1) * (rows + 1) > MAX_GRID_VERTICES) throw new RangeError('Terrain exceeds the bounded 16-bit mesh budget.');
  if (!['minX', 'maxX', 'minZ', 'maxZ'].every(key => Number.isFinite(bounds?.[key])) || bounds.minX >= bounds.maxX || bounds.minZ >= bounds.maxZ) throw new RangeError('Invalid atlas bounds.');
  const count = (columns + 1) * (rows + 1), positions = new Float32Array(count * 3), normals = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3), flatColors = new Float32Array(count * 3), indices = new Uint16Array(columns * rows * 6);
  const dx = (bounds.maxX - bounds.minX) / columns, dz = (bounds.maxZ - bounds.minZ) / rows;
  for (let row = 0; row <= rows; row++) for (let column = 0; column <= columns; column++) {
    const index = row * (columns + 1) + column, x = bounds.minX + column * dx, z = bounds.minZ + row * dz;
    const relief = sample(x, z, true), flat = sample(x, z, false);
    if (!Number.isFinite(relief?.height) || Math.abs(relief.height) > 200 || ![relief?.color, flat?.color].every(color => Array.isArray(color) && color.length === 3 && color.every(value => Number.isFinite(value) && value >= 0 && value <= 1))) throw new RangeError('Invalid terrain sample.');
    positions.set([x, relief.height, z], index * 3); colors.set(relief.color, index * 3); flatColors.set(flat.color, index * 3);
  }
  for (let row = 0; row <= rows; row++) for (let column = 0; column <= columns; column++) {
    const at = (r, c) => positions[(r * (columns + 1) + c) * 3 + 1];
    const left = Math.max(0, column - 1), right = Math.min(columns, column + 1), north = Math.max(0, row - 1), south = Math.min(rows, row + 1);
    const normal = unit([-(at(row, right) - at(row, left)) / ((right - left) * dx), 1, -(at(south, column) - at(north, column)) / ((south - north) * dz)]);
    normals.set(normal, (row * (columns + 1) + column) * 3);
  }
  let offset = 0;
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const a = row * (columns + 1) + column, b = a + columns + 1, c = a + 1, d = b + 1;
    indices.set([a, b, c, c, b, d], offset); offset += 6;
  }
  return { bounds: { ...bounds }, columns, rows, positions, normals, colors, flatColors, indices };
}
export function sampleMeshHeight(mesh, x, z, scale = 1, offset = 0.08) {
  const { bounds, columns, rows, positions } = mesh;
  if (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ) return 0;
  const u = clamp((x - bounds.minX) / (bounds.maxX - bounds.minX) * columns, 0, columns), v = clamp((z - bounds.minZ) / (bounds.maxZ - bounds.minZ) * rows, 0, rows);
  const column = Math.min(columns - 1, Math.floor(u)), row = Math.min(rows - 1, Math.floor(v)), tx = u - column, tz = v - row;
  const a = (row * (columns + 1) + column) * 3 + 1, b = a + (columns + 1) * 3, c = a + 3, d = b + 3;
  const height = tx + tz <= 1 ? positions[a] + (positions[c] - positions[a]) * tx + (positions[b] - positions[a]) * tz
    : positions[d] + (positions[b] - positions[d]) * (1 - tx) + (positions[c] - positions[d]) * (1 - tz);
  return height * scale + offset;
}
export function pickTerrain(ray, mesh, scale = 1, offset = 0.08) {
  let nearest = Infinity;
  const vertex = index => [mesh.positions[index * 3], mesh.positions[index * 3 + 1] * scale + offset, mesh.positions[index * 3 + 2]];
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const distance = intersectTriangle(ray, vertex(mesh.indices[index]), vertex(mesh.indices[index + 1]), vertex(mesh.indices[index + 2]));
    if (distance !== null && distance < nearest) nearest = distance;
  }
  return Number.isFinite(nearest) ? ray.origin.map((value, i) => value + ray.direction[i] * nearest) : null;
}
export function terrainVisible(eye, point, heightAt) {
  for (let step = 1; step < 40; step++) {
    const fraction = step / 40, x = eye[0] + (point[0] - eye[0]) * fraction, z = eye[2] + (point[2] - eye[2]) * fraction;
    if (eye[1] + (point[1] - eye[1]) * fraction < heightAt(x, z) - 0.15) return false;
  }
  return true;
}
export function projectPlaces(places, frame, heightAt, categories) {
  const allowed = categories === undefined ? null : new Set(categories);
  return places.map(place => {
    const point = [place.x, heightAt(place.x, place.z) + 1.5, place.z], projected = projectPoint(point, frame);
    return { id: place.id, ...projected, visible: projected.visible && (!allowed || allowed.has(place.type)) && terrainVisible(frame.eye, point, heightAt) };
  });
}
export function pickProjectedPlace(projected, x, y, radius = 18) {
  let best = null, distance = radius * radius, depth = Infinity;
  for (const place of projected) {
    if (!place.visible) continue;
    const candidate = (place.x - x) ** 2 + (place.y - y) ** 2;
    if (candidate < distance || (candidate === distance && place.depth < depth)) { best = place.id; distance = candidate; depth = place.depth; }
  }
  return best;
}
export function navigateCamera(camera, changes, normalize = value => value) {
  const zoom = clamp(finite(changes.zoom), -2, 2), panX = clamp(finite(changes.panX), -1000, 1000), panZ = clamp(finite(changes.panZ), -1000, 1000);
  const cosine = Math.cos(camera.yaw), sine = Math.sin(camera.yaw);
  return normalize({ ...camera, x: camera.x + panX * cosine + panZ * sine, z: camera.z - panX * sine + panZ * cosine,
    distance: camera.distance * Math.exp(-zoom), yaw: camera.yaw + clamp(finite(changes.orbit), -Math.PI, Math.PI), pitch: camera.pitch + clamp(finite(changes.tilt), -Math.PI, Math.PI) });
}
export function panPixels(camera, dx, dy, width, height, normalize = value => value) {
  const scale = 2 * camera.distance * Math.tan(adaptiveFov(width / height) / 2) / Math.max(1, height);
  return navigateCamera(camera, { panX: -finite(dx) * scale, panZ: -finite(dy) * scale / Math.max(0.2, Math.sin(camera.pitch)) }, normalize);
}
export function drawingBufferSize(width, height, dpr = 1, maxDimension = 4096, maxPixels = 2_000_000) {
  width = clamp(finite(width, 1), 1, 32_768); height = clamp(finite(height, 1), 1, 32_768);
  maxDimension = clamp(finite(maxDimension, 4096), 1, 4096); maxPixels = clamp(finite(maxPixels, 2_000_000), 1, 2_000_000);
  const scale = Math.min(clamp(finite(dpr, 1), 0.5, 2), maxDimension / width, maxDimension / height, Math.sqrt(maxPixels / (width * height)));
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)), scale, cssWidth: width, cssHeight: height };
}
