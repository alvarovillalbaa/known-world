import { WORLD_BOUNDS, PLACES, REGION_VIEWS, getPlace, sampleTerrain } from './world.js';
import { DEFAULT_CAMERA, normalizeCamera } from './view-state.js';
import { buildTerrainMesh, sampleMeshHeight, createCameraFrame, projectPlaces, pickProjectedPlace, navigateCamera, panPixels, drawingBufferSize } from './geo.js';

const SKY = [0.045, 0.105, 0.14];
const WATER = sampleTerrain(WORLD_BOUNDS.minX - 1, WORLD_BOUNDS.minZ - 1, false).color;
let terrainCache;
const VERTEX = `
attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec3 aColor;
attribute vec3 aFlatColor;
uniform mat4 uMatrix;
uniform vec3 uEye;
uniform float uRelief;
uniform float uOffset;
uniform float uFogNear;
uniform float uFogFar;
varying vec3 vColor;
varying float vFog;
void main() {
  vec3 position = vec3(aPosition.x, aPosition.y * uRelief + uOffset, aPosition.z);
  vec3 normal = normalize(mix(vec3(0.0, 1.0, 0.0), aNormal, uRelief));
  float light = 0.65 + 0.35 * max(0.0, dot(normal, normalize(vec3(-0.6, 1.0, 0.5))));
  vColor = mix(aFlatColor, aColor, uRelief) * light;
  vFog = clamp((distance(position, uEye) - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  gl_Position = uMatrix * vec4(position, 1.0);
}`;
const FRAGMENT = `
precision mediump float;
uniform vec3 uFogColor;
varying vec3 vColor;
varying float vFog;
void main() { gl_FragColor = vec4(mix(vColor, uFogColor, vFog * vFog), 1.0); }`;
const POINT_VERTEX = `
attribute vec3 aPosition;
uniform mat4 uMatrix;
uniform float uSize;
void main() { gl_Position = uMatrix * vec4(aPosition, 1.0); gl_PointSize = uSize; }`;
const POINT_FRAGMENT = `
precision mediump float;
uniform vec3 uTint;
void main() {
  vec2 point = gl_PointCoord * 2.0 - 1.0;
  float radius = dot(point, point);
  if (radius > 1.0) discard;
  gl_FragColor = vec4(radius > 0.52 ? vec3(0.12, 0.19, 0.19) : uTint, 1.0);
}`;
const sameCamera = (a, b) => ['x', 'z', 'distance', 'yaw', 'pitch'].every(key => a[key] === b[key]);
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const angleDelta = value => Math.atan2(Math.sin(value), Math.cos(value));

export function createViewer(canvas, callbacks = {}) {
  if (!canvas || typeof canvas.getContext !== 'function') throw new TypeError('A canvas is required for the 3D atlas.');
  const document = canvas.ownerDocument ?? globalThis.document;
  const window = document?.defaultView ?? globalThis.window;
  if (!window?.requestAnimationFrame || !window?.cancelAnimationFrame) throw new Error('Animation frames are unavailable.');
  let camera = normalizeCamera(DEFAULT_CAMERA), selectedId = null;
  const layers = { terrain: true, labels: true, categories: ['city', 'castle', 'landmark'] };
  let gl = null, gpu = null, mesh = null, ready = false, lost = false, failed = false, destroyed = false;
  let wantedActive = true, hidden = Boolean(document?.hidden), blurred = false, reduced = false;
  let scheduled = null, animation = null, wheelTimer = null, projected = [], gestureMoved = false, clickId = null;
  let viewport = { cssWidth: 1, cssHeight: 1, width: 1, height: 1, scale: 1 }, maxDimension = 4096;
  const pointers = new Map(), removers = [];
  const oldTouchAction = canvas.style?.touchAction;
  if (canvas.style) canvas.style.touchAction = 'none';
  const emit = (name, ...args) => { if (!destroyed) callbacks[name]?.(...args); };
  const active = () => wantedActive && !hidden && !blurred && !destroyed;
  const heightAt = (x, z) => mesh ? sampleMeshHeight(mesh, x, z, layers.terrain ? 1 : 0) : 0;
  const emitCamera = settled => emit('onCamera', { ...camera }, { settled });
  function listen(target, type, handler, options) {
    target?.addEventListener(type, handler, options);
    removers.push(() => target?.removeEventListener(type, handler, options));
  }
  function cancelFrame() {
    const pending = scheduled; scheduled = null;
    if (pending) window.cancelAnimationFrame(pending.id);
  }
  function clearWheel() {
    const pending = wheelTimer; wheelTimer = null;
    if (pending) window.clearTimeout(pending.id);
  }
  function clearGestures() {
    const pending = [...pointers.keys()]; pointers.clear(); clickId = null; gestureMoved = false;
    for (const id of pending) { try { canvas.releasePointerCapture(id); } catch { /* Already released or never captured. */ } }
  }
  function interrupt() {
    const moving = animation || wheelTimer || pointers.size;
    animation = null; clearWheel(); clearGestures(); cancelFrame();
    if (moving) emitCamera(true);
  }
  function release(bundle) {
    if (!bundle) return;
    for (const { method, value } of bundle.owned.splice(0).reverse()) {
      try { gl[method](value); } catch { /* Release the remaining owned objects too. */ }
    }
  }
  function reportError(error) {
    ready = false; failed = true; interrupt(); release(gpu); gpu = null;
    emit('onProject', []);
    emit('onStatus', { state: 'error', message: error instanceof Error ? error.message : 'The 3D view could not start.' });
  }
  function contextLost(event) {
    event?.preventDefault?.();
    if (destroyed || lost) return;
    lost = true; ready = false; interrupt(); release(gpu); gpu = null; projected = [];
    emit('onProject', []);
    emit('onStatus', { state: 'context-lost', message: 'The graphics context was interrupted. Your place and view are kept while it restores.' });
  }
  function own(bundle, method, value) {
    if (!value) {
      if (gl.isContextLost()) contextLost();
      throw new Error('The graphics device could not allocate this view.');
    }
    bundle.owned.push({ method, value }); return value;
  }
  function program(bundle, vertexSource, fragmentSource, attributes) {
    const shaders = [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragmentSource]].map(([type, text]) => {
      const shader = own(bundle, 'deleteShader', gl.createShader(type));
      gl.shaderSource(shader, text); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        if (gl.isContextLost()) contextLost();
        throw new Error('The graphics device could not compile the 3D view.');
      }
      return shader;
    });
    const value = own(bundle, 'deleteProgram', gl.createProgram());
    shaders.forEach(shader => gl.attachShader(value, shader));
    attributes.forEach((name, index) => gl.bindAttribLocation(value, index, name));
    gl.linkProgram(value);
    if (!gl.getProgramParameter(value, gl.LINK_STATUS)) {
      if (gl.isContextLost()) contextLost();
      throw new Error('The graphics device could not link the 3D view.');
    }
    return value;
  }
  function buffer(bundle, values, target = gl.ARRAY_BUFFER) {
    const value = own(bundle, 'deleteBuffer', gl.createBuffer());
    gl.bindBuffer(target, value); gl.bufferData(target, values, gl.STATIC_DRAW); return value;
  }
  function uniformLocations(value, names) { return Object.fromEntries(names.map(name => [name, gl.getUniformLocation(value, name)])); }
  function refreshLimits() {
    const maximum = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), viewportLimit = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
    maxDimension = Math.max(1, Math.min(4096, finite(maximum, 4096), finite(viewportLimit?.[0], 4096), finite(viewportLimit?.[1], 4096)));
  }
  function initialize() {
    if (destroyed || lost || failed || ready) return;
    const bundle = { owned: [] };
    try {
      mesh = terrainCache ??= buildTerrainMesh(WORLD_BOUNDS, sampleTerrain);
      bundle.main = program(bundle, VERTEX, FRAGMENT, ['aPosition', 'aNormal', 'aColor', 'aFlatColor']);
      bundle.mainUniforms = uniformLocations(bundle.main, ['uMatrix', 'uEye', 'uRelief', 'uOffset', 'uFogNear', 'uFogFar', 'uFogColor']);
      bundle.points = program(bundle, POINT_VERTEX, POINT_FRAGMENT, ['aPosition']);
      bundle.pointUniforms = uniformLocations(bundle.points, ['uMatrix', 'uSize', 'uTint']);
      bundle.terrain = [mesh.positions, mesh.normals, mesh.colors, mesh.flatColors].map(values => buffer(bundle, values));
      bundle.indices = buffer(bundle, mesh.indices, gl.ELEMENT_ARRAY_BUFFER);
      const pad = 1300, b = WORLD_BOUNDS;
      const sea = new Float32Array([b.minX - pad, 0, b.minZ - pad, b.minX - pad, 0, b.maxZ + pad, b.maxX + pad, 0, b.minZ - pad,
        b.maxX + pad, 0, b.minZ - pad, b.minX - pad, 0, b.maxZ + pad, b.maxX + pad, 0, b.maxZ + pad]);
      const normals = new Float32Array(18), colors = new Float32Array(18);
      for (let index = 0; index < 6; index++) { normals.set([0, 1, 0], index * 3); colors.set(WATER, index * 3); }
      bundle.water = [sea, normals, colors, colors].map(values => buffer(bundle, values));
      bundle.markers = buffer(bundle, new Float32Array(0));
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
      gl.clearColor(...SKY, 1);
      const size = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE);
      bundle.maxPointSize = Number.isFinite(size?.[1]) ? size[1] : 16;
      if (gl.isContextLost() || lost) { contextLost(); release(bundle); return; }
      gpu = bundle; ready = true;
      emit('onStatus', { state: 'ready', message: '3D atlas ready. Drag to pan, or shift-drag to orbit.' });
    } catch (error) {
      release(bundle);
      if (!lost) reportError(error);
    }
  }
  function setAttributes(buffers) {
    buffers.forEach((value, index) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, value); gl.enableVertexAttribArray(index); gl.vertexAttribPointer(index, 3, gl.FLOAT, false, 0, 0);
    });
  }
  function draw() {
    if (!ready || lost || destroyed || !active()) return;
    const frame = createCameraFrame(camera, viewport.cssWidth, viewport.cssHeight, heightAt);
    gl.viewport(0, 0, gl.drawingBufferWidth || viewport.width, gl.drawingBufferHeight || viewport.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(gpu.main);
    const u = gpu.mainUniforms;
    gl.uniformMatrix4fv(u.uMatrix, false, frame.matrix); gl.uniform3fv(u.uEye, frame.eye); gl.uniform3fv(u.uFogColor, SKY);
    gl.uniform1f(u.uFogNear, camera.distance * 1.4); gl.uniform1f(u.uFogFar, camera.distance * 1.4 + 1000);
    gl.uniform1f(u.uRelief, 0); gl.uniform1f(u.uOffset, 0); setAttributes(gpu.water); gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.uniform1f(u.uRelief, layers.terrain ? 1 : 0); gl.uniform1f(u.uOffset, 0.08); setAttributes(gpu.terrain);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gpu.indices); gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_SHORT, 0);
    projected = projectPlaces(PLACES, frame, heightAt, layers.categories);
    const markers = PLACES.filter(place => layers.categories.includes(place.type));
    const positions = new Float32Array(markers.flatMap(place => [place.x, heightAt(place.x, place.z) + 1.5, place.z]));
    gl.useProgram(gpu.points); const p = gpu.pointUniforms;
    gl.uniformMatrix4fv(p.uMatrix, false, frame.matrix); gl.uniform3fv(p.uTint, [0.98, 0.82, 0.48]);
    gl.uniform1f(p.uSize, Math.min(gpu.maxPointSize, 8 * viewport.scale));
    gl.bindBuffer(gl.ARRAY_BUFFER, gpu.markers); gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    for (let index = 1; index <= 3; index++) gl.disableVertexAttribArray(index);
    gl.drawArrays(gl.POINTS, 0, markers.length);
    const selected = markers.findIndex(place => place.id === selectedId);
    if (selected >= 0) {
      gl.uniform3fv(p.uTint, [1, 0.96, 0.78]); gl.uniform1f(p.uSize, Math.min(gpu.maxPointSize, 14 * viewport.scale));
      gl.drawArrays(gl.POINTS, selected, 1);
    }
    if (gl.isContextLost()) { contextLost(); return; }
    emit('onProject', projected.map(({ id, x, y, visible }) => ({ id, x, y, visible: layers.labels && visible })));
  }
  function requestFrame() {
    if (scheduled || !active() || lost || failed || !gl) return;
    const pending = { id: null }; scheduled = pending;
    pending.id = window.requestAnimationFrame(timestamp => {
      if (scheduled !== pending || destroyed) return;
      scheduled = null;
      if (!active() || lost || failed) return;
      try {
        initialize();
        if (!ready) return;
        const transition = animation;
        if (transition) {
          transition.start ??= timestamp;
          const progress = Math.max(0, Math.min(1, (timestamp - transition.start) / 650)), eased = 1 - (1 - progress) ** 3;
          const from = transition.from, to = transition.to;
          camera = normalizeCamera({ x: from.x + (to.x - from.x) * eased, z: from.z + (to.z - from.z) * eased,
            distance: from.distance + (to.distance - from.distance) * eased, yaw: from.yaw + angleDelta(to.yaw - from.yaw) * eased,
            pitch: from.pitch + (to.pitch - from.pitch) * eased });
          if (progress === 1 && animation === transition) animation = null;
          emitCamera(progress === 1);
        }
        draw();
        if (animation) requestFrame();
      } catch (error) { if (gl.isContextLost()) contextLost(); else reportError(error); }
    });
  }
  function resize() {
    if (destroyed) return;
    const rect = canvas.getBoundingClientRect();
    viewport = drawingBufferSize(rect.width || canvas.clientWidth || 1, rect.height || canvas.clientHeight || 1, window.devicePixelRatio || 1, maxDimension);
    if (canvas.width !== viewport.width) canvas.width = viewport.width;
    if (canvas.height !== viewport.height) canvas.height = viewport.height;
    requestFrame();
  }
  function setCamera(value, { animate = false } = {}) {
    if (destroyed) return;
    const target = normalizeCamera(value);
    clearWheel(); animation = null;
    if (animate && !reduced && active() && !lost && !failed && !sameCamera(camera, target)) {
      animation = { from: { ...camera }, to: target, start: null }; requestFrame();
    } else { camera = target; emitCamera(true); requestFrame(); }
  }
  function manual() { animation = null; clearWheel(); emit('onInteraction'); }
  function change(next, settled) { camera = next; emitCamera(settled); requestFrame(); }
  function navigate(changes = {}) {
    if (destroyed) return;
    manual(); change(navigateCamera(camera, changes, normalizeCamera), true);
  }
  function point(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: finite(event.clientX) - finite(rect.left), y: finite(event.clientY) - finite(rect.top) };
  }
  const interactive = () => active() && ready && !lost && !failed;
  function pointerDown(event) {
    if (!interactive() || pointers.size >= 2 || (event.pointerType === 'mouse' && ![0, 2].includes(event.button))) return;
    event.preventDefault(); manual(); canvas.focus({ preventScroll: true });
    const p = point(event);
    pointers.set(event.pointerId, { ...p, startX: p.x, startY: p.y, orbit: event.shiftKey || event.button === 2 });
    try { canvas.setPointerCapture(event.pointerId); } catch { /* The window release handler still cancels the gesture. */ }
    if (pointers.size === 1) { clickId = event.button === 2 ? null : event.pointerId; gestureMoved = false; }
    else { clickId = null; gestureMoved = true; }
  }
  function pointerMove(event) {
    const previous = pointers.get(event.pointerId);
    if (!previous || !interactive()) return;
    event.preventDefault(); manual();
    const before = [...pointers.values()].map(p => ({ ...p })), next = point(event);
    if (Math.hypot(next.x - previous.startX, next.y - previous.startY) > 5) gestureMoved = true;
    const dx = next.x - previous.x, dy = next.y - previous.y;
    previous.x = next.x; previous.y = next.y;
    if (pointers.size === 2) {
      const after = [...pointers.values()], oldLength = Math.hypot(before[1].x - before[0].x, before[1].y - before[0].y), newLength = Math.hypot(after[1].x - after[0].x, after[1].y - after[0].y);
      if (oldLength > 3 && newLength > 3) {
        const oldAngle = Math.atan2(before[1].y - before[0].y, before[1].x - before[0].x), newAngle = Math.atan2(after[1].y - after[0].y, after[1].x - after[0].x);
        change(navigateCamera(camera, { zoom: Math.log(newLength / oldLength), orbit: -angleDelta(newAngle - oldAngle) }, normalizeCamera), false);
      }
    } else change(previous.orbit
      ? navigateCamera(camera, { orbit: -dx * 0.008, tilt: dy * 0.006 }, normalizeCamera)
      : panPixels(camera, dx, dy, viewport.cssWidth, viewport.cssHeight, normalizeCamera), false);
  }
  function pointerUp(event) {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    const released = point(event), pick = clickId === event.pointerId && !gestureMoved && Math.hypot(released.x - previous.startX, released.y - previous.startY) <= 5;
    pointers.delete(event.pointerId); clickId = null;
    try { canvas.releasePointerCapture(event.pointerId); } catch { /* Already released. */ }
    if (!pointers.size) emitCamera(true);
    if (pick && interactive()) {
      const current = projected.filter(place => layers.categories.includes(getPlace(place.id)?.type));
      selectedId = pickProjectedPlace(current, released.x, released.y); emit('onPick', selectedId); requestFrame();
    }
  }
  function wheel(event) {
    if (!interactive()) return;
    event.preventDefault(); manual();
    const multiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.cssHeight : 1;
    change(navigateCamera(camera, { zoom: Math.max(-0.7, Math.min(0.7, -finite(event.deltaY) * multiplier / 600)) }, normalizeCamera), false);
    const pending = { id: null }; wheelTimer = pending;
    pending.id = window.setTimeout(() => { if (wheelTimer === pending && active() && !lost) { wheelTimer = null; emitCamera(true); } }, 160);
  }
  function keyDown(event) {
    if (!interactive() || event.metaKey || event.ctrlKey || event.altKey || event.target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target?.tagName)) return;
    const step = camera.distance * 0.045;
    const changes = { ArrowLeft: { panX: -step }, ArrowRight: { panX: step }, ArrowUp: { panZ: -step }, ArrowDown: { panZ: step },
      KeyQ: { orbit: -0.09 }, KeyE: { orbit: 0.09 }, KeyW: { tilt: 0.065 }, KeyS: { tilt: -0.065 },
      Equal: { zoom: 0.15 }, NumpadAdd: { zoom: 0.15 }, Minus: { zoom: -0.15 }, NumpadSubtract: { zoom: -0.15 } }[event.code];
    if (event.code === 'Home') { event.preventDefault(); manual(); setCamera(REGION_VIEWS.all, { animate: true }); }
    else if (changes) { event.preventDefault(); navigate(changes); }
  }
  listen(canvas, 'webglcontextlost', contextLost);
  listen(canvas, 'webglcontextrestored', () => {
    if (destroyed || !gl) return;
    lost = false; failed = false; ready = false; release(gpu); gpu = null;
    emit('onStatus', { state: 'loading', message: 'Restoring the 3D atlas…' });
    try { refreshLimits(); resize(); requestFrame(); } catch (error) { reportError(error); }
  });
  listen(canvas, 'pointerdown', pointerDown);
  listen(canvas, 'pointermove', pointerMove);
  listen(canvas, 'pointerup', pointerUp);
  listen(window, 'pointerup', pointerUp);
  listen(window, 'pointermove', event => { if (event.target !== canvas && pointers.has(event.pointerId)) pointerMove(event); });
  const cancelPointer = () => { if (pointers.size) { clearGestures(); emitCamera(true); } };
  listen(canvas, 'pointercancel', cancelPointer); listen(canvas, 'lostpointercapture', cancelPointer);
  listen(window, 'pointercancel', cancelPointer);
  listen(canvas, 'wheel', wheel, { passive: false }); listen(canvas, 'keydown', keyDown);
  listen(canvas, 'blur', interrupt);
  listen(canvas, 'contextmenu', event => { if (interactive()) event.preventDefault(); });
  listen(window, 'blur', () => { blurred = true; interrupt(); });
  listen(window, 'focus', () => { blurred = false; resize(); });
  listen(document, 'visibilitychange', () => { hidden = Boolean(document.hidden); if (hidden) interrupt(); else resize(); });
  listen(window, 'resize', resize, { passive: true });
  let observer = null;
  if (window.ResizeObserver) { observer = new window.ResizeObserver(resize); observer.observe(canvas); }
  emit('onStatus', { state: 'loading', message: 'Preparing the 3D atlas…' });
  try {
    gl = canvas.getContext('webgl', { alpha: false, antialias: true, depth: true, stencil: false, preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL is unavailable. The geographic catalog is still available; try a browser with 3D graphics enabled.');
    refreshLimits();
    if (gl.isContextLost()) contextLost();
    resize(); emitCamera(true);
  } catch (error) { reportError(error); }
  return {
    getCamera: () => ({ ...camera }), setCamera,
    setSelection(id) { if (!destroyed) { selectedId = getPlace(id)?.id ?? null; requestFrame(); } },
    focusPlace(id, options = {}) {
      if (destroyed) return false;
      const place = getPlace(id); if (!place) return false;
      selectedId = place.id; setCamera({ ...camera, x: place.x, z: place.z, distance: 68, pitch: 0.85 }, { animate: true, ...options }); return true;
    },
    home(region = 'all', options = {}) { if (!destroyed) { selectedId = null; setCamera(REGION_VIEWS[region] ?? REGION_VIEWS.all, { animate: true, ...options }); } },
    setLayers(value = {}) {
      if (destroyed) return;
      if (typeof value.terrain === 'boolean') layers.terrain = value.terrain;
      if (typeof value.labels === 'boolean') layers.labels = value.labels;
      if (Array.isArray(value.categories)) layers.categories = ['city', 'castle', 'landmark'].filter(type => value.categories.includes(type));
      requestFrame();
    },
    navigate,
    setActive(value) { if (!destroyed) { wantedActive = Boolean(value); if (!active()) interrupt(); else resize(); } },
    setReducedMotion(value) { if (!destroyed) { reduced = Boolean(value); if (reduced && animation) { const target = animation.to; animation = null; setCamera(target); } } },
    resize,
    destroy() {
      if (destroyed) return;
      destroyed = true; interrupt(); ready = false; observer?.disconnect();
      removers.splice(0).reverse().forEach(remove => remove()); release(gpu); gpu = null;
      if (canvas.style) canvas.style.touchAction = oldTouchAction;
    },
  };
}
