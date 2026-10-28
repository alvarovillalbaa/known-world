// Actual viewer module with authored canvas/WebGL/event/RAF boundaries. These
// checks do not compile shaders on a GPU or establish real browser rendering.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createViewer } from '../public/src/viewer.js';
import { PLACES, REGION_VIEWS } from '../public/src/world.js';

class Target {
  listeners = new Map();
  addEventListener(type, callback) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(callback); }
  removeEventListener(type, callback) { this.listeners.get(type)?.delete(callback); }
  emit(type, values = {}) {
    const event = { target: this, currentTarget: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...values };
    for (const callback of [...(this.listeners.get(type) ?? [])]) callback(event);
    return event;
  }
  count() { return [...this.listeners.values()].reduce((sum, value) => sum + value.size, 0); }
}

function harness(options = {}) {
  const window = new Target(), document = new Target(), canvas = new Target();
  document.defaultView = window; document.hidden = false; canvas.ownerDocument = document;
  const rect = { left: 17, top: 23, width: options.width ?? 900, height: options.height ?? 600 };
  canvas.style = { touchAction: 'pan-y' }; canvas.width = 300; canvas.height = 150;
  canvas.getBoundingClientRect = () => ({ ...rect }); canvas.focus = () => { canvas.focused = true; };
  const captures = new Set(); canvas.setPointerCapture = id => captures.add(id); canvas.releasePointerCapture = id => captures.delete(id);
  const frames = new Map(), canceled = [], timers = new Map(), observers = [];
  let sequence = 0, timestamp = 0;
  window.devicePixelRatio = options.dpr ?? 1;
  window.requestAnimationFrame = callback => { const id = ++sequence; frames.set(id, callback); return id; };
  window.cancelAnimationFrame = id => { if (frames.has(id)) canceled.push(frames.get(id)); frames.delete(id); };
  window.setTimeout = callback => { const id = ++sequence; timers.set(id, callback); return id; };
  window.clearTimeout = id => timers.delete(id);
  window.ResizeObserver = class {
    constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
    observe() {} disconnect() { this.disconnected = true; }
  };
  const gl = { lost: false, resources: [], draws: [], uploads: [], maxDimension: 4096, creation: 0, currentProgram: null, bindings: new Map() };
  ['ARRAY_BUFFER', 'ELEMENT_ARRAY_BUFFER', 'STATIC_DRAW', 'DYNAMIC_DRAW', 'VERTEX_SHADER', 'FRAGMENT_SHADER', 'COMPILE_STATUS', 'LINK_STATUS',
    'DEPTH_TEST', 'LEQUAL', 'CULL_FACE', 'BACK', 'MAX_RENDERBUFFER_SIZE', 'MAX_VIEWPORT_DIMS', 'ALIASED_POINT_SIZE_RANGE', 'TRIANGLES', 'POINTS', 'FLOAT', 'UNSIGNED_SHORT', 'COLOR_BUFFER_BIT', 'DEPTH_BUFFER_BIT']
    .forEach((key, index) => { gl[key] = index + 1; });
  function resource(kind) {
    gl.creation++;
    if (gl.lost) return null;
    if (gl.creation === options.failAt) return null;
    const value = { kind, id: gl.creation, deleted: false, uniforms: {} }; gl.resources.push(value);
    if (gl.creation === options.loseAt) { gl.lost = true; canvas.emit('webglcontextlost'); }
    return value;
  }
  gl.createShader = () => resource('shader'); gl.createProgram = () => resource('program'); gl.createBuffer = () => resource('buffer');
  for (const [method, kind] of [['deleteShader', 'shader'], ['deleteProgram', 'program'], ['deleteBuffer', 'buffer']]) gl[method] = value => {
    assert.equal(value.kind, kind); assert.equal(value.deleted, false, 'An owned GPU resource must be released once.'); value.deleted = true;
  };
  gl.isContextLost = () => gl.lost;
  gl.getParameter = parameter => parameter === gl.MAX_RENDERBUFFER_SIZE ? gl.maxDimension
    : parameter === gl.MAX_VIEWPORT_DIMS ? [gl.maxDimension, gl.maxDimension] : [1, 64];
  gl.getShaderParameter = () => !gl.lost && !options.shaderFailure;
  gl.getProgramParameter = () => !gl.lost;
  gl.getUniformLocation = (program, name) => ({ program, name });
  gl.useProgram = program => { gl.currentProgram = program; };
  gl.uniformMatrix4fv = (location, transpose, matrix) => { assert.equal(transpose, false); assert.equal(matrix.length, 16); location.program.uniforms[location.name] = [...matrix]; };
  gl.uniform1f = (location, value) => { assert.ok(Number.isFinite(value)); location.program.uniforms[location.name] = value; };
  gl.uniform3fv = (location, value) => { assert.equal(value.length, 3); assert.ok([...value].every(Number.isFinite)); location.program.uniforms[location.name] = [...value]; };
  gl.bindBuffer = (target, value) => gl.bindings.set(target, value);
  gl.bufferData = (target, data) => {
    const buffer = gl.bindings.get(target); assert.ok(buffer && !buffer.deleted);
    buffer.data = data;
    gl.uploads.push({ target, length: data.length, bytes: data.byteLength });
  };
  gl.drawElements = (mode, count, type, offset) => {
    if (options.drawFailure) throw new Error('Authored draw failure');
    assert.equal(type, gl.UNSIGNED_SHORT); assert.equal(offset, 0);
    assert.ok(gl.bindings.get(gl.ELEMENT_ARRAY_BUFFER).data instanceof Uint16Array);
    gl.draws.push({ mode, count, indexed: true });
  };
  gl.drawArrays = (mode, first, count) => gl.draws.push({ mode, first, count, size: gl.currentProgram.uniforms.uSize });
  for (const method of ['shaderSource', 'compileShader', 'attachShader', 'bindAttribLocation', 'linkProgram', 'enable', 'depthFunc', 'cullFace',
    'clearColor', 'viewport', 'clear', 'enableVertexAttribArray', 'vertexAttribPointer', 'disableVertexAttribArray']) gl[method] = () => {};
  canvas.getContext = type => {
    assert.equal(type, 'webgl');
    if (options.noContext) return null;
    if (options.loseAtCreation) { gl.lost = true; canvas.emit('webglcontextlost'); }
    return gl;
  };
  Object.defineProperties(gl, { drawingBufferWidth: { get: () => canvas.width }, drawingBufferHeight: { get: () => canvas.height } });
  const calls = { cameras: [], picks: [], statuses: [], projects: [], interactions: 0 };
  const viewer = createViewer(canvas, {
    onCamera(camera, meta) { calls.cameras.push({ camera, ...meta }); }, onPick(id) { calls.picks.push(id); },
    onStatus(status) { calls.statuses.push(status); }, onProject(projected) { calls.projects.push(projected); },
    onInteraction() { calls.interactions++; },
  });
  return {
    viewer, window, document, canvas, gl, calls, frames, timers, observers, captures, rect,
    frame(delta = 16) {
      timestamp += delta;
      const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(timestamp));
    },
    staleFrames() { canceled.splice(0).forEach(callback => callback(timestamp + 10_000)); },
    flushTimers() { const pending = [...timers.values()]; timers.clear(); pending.forEach(callback => callback()); },
    pointer(type, x, y, extra = {}) { return canvas.emit(type, { clientX: x + rect.left, clientY: y + rect.top, pointerId: 1, pointerType: 'mouse', button: 0, ...extra }); },
    lastProjection() { return calls.projects.at(-1) ?? []; },
  };
}

test('actual viewer allocates WebGL1 geometry and draws depth-compatible terrain water and catalog points', () => {
  const h = harness(); assert.equal(h.calls.statuses.at(-1).state, 'loading');
  h.frame(); assert.equal(h.calls.statuses.at(-1).state, 'ready');
  assert.ok(h.gl.draws.some(draw => draw.indexed && draw.count > 100_000));
  assert.ok(h.gl.draws.some(draw => draw.mode === h.gl.TRIANGLES && !draw.indexed && draw.count === 6));
  assert.ok(h.gl.draws.some(draw => draw.mode === h.gl.POINTS && draw.count === PLACES.length));
  assert.equal(h.lastProjection().length, PLACES.length);
  assert.equal(h.frames.size, 0, 'A stationary atlas must not run a permanent animation loop.');
  h.viewer.destroy();
});

test('DPR and resource caps do not change CSS-pixel place projections', () => {
  const first = harness({ width: 390, height: 844, dpr: 1 }), second = harness({ width: 390, height: 844, dpr: 4 });
  first.frame(); second.frame();
  assert.deepEqual(first.lastProjection(), second.lastProjection());
  for (const h of [first, second]) { assert.ok(h.canvas.width * h.canvas.height <= 2_000_000); assert.ok(h.canvas.width <= 4096 && h.canvas.height <= 4096); h.viewer.destroy(); }
});

test('canvas picking uses the projected catalog and exact category filters', () => {
  const h = harness(); h.frame();
  const place = h.lastProjection().find(p => p.visible && h.lastProjection().every(other => p === other || Math.hypot(other.x - p.x, other.y - p.y) > 3));
  assert.ok(place);
  h.pointer('pointerdown', place.x, place.y); h.pointer('pointerup', place.x, place.y);
  assert.equal(h.calls.picks.at(-1), place.id);
  h.viewer.setLayers({ categories: [] });
  h.pointer('pointerdown', place.x, place.y); h.pointer('pointerup', place.x, place.y);
  assert.equal(h.calls.picks.at(-1), null, 'A queued frame must not leave an excluded category selectable.');
  h.frame();
  assert.ok(h.lastProjection().every(p => !p.visible));
  h.pointer('pointerdown', place.x, place.y); h.pointer('pointerup', place.x, place.y);
  assert.equal(h.calls.picks.at(-1), null);
  h.viewer.setLayers({ categories: ['city'], labels: false }); h.frame();
  assert.ok(h.lastProjection().every(p => !p.visible));
  assert.ok(h.gl.draws.some(draw => draw.mode === h.gl.POINTS && draw.count === PLACES.filter(p => p.type === 'city').length));
  h.viewer.destroy();
});

test('selection synchronization changes only the selected marker without moving the shared camera or emitting a pick', () => {
  const h = harness(); h.frame(); const before = h.viewer.getCamera(), cameraEvents = h.calls.cameras.length;
  h.gl.draws = []; h.viewer.setSelection(PLACES[0].id); h.frame();
  assert.deepEqual(h.viewer.getCamera(), before); assert.equal(h.calls.cameras.length, cameraEvents); assert.deepEqual(h.calls.picks, []);
  assert.ok(h.gl.draws.some(draw => draw.mode === h.gl.POINTS && draw.count === 1 && draw.size === 14));
  h.gl.draws = []; h.viewer.setSelection(null); h.frame();
  assert.ok(!h.gl.draws.some(draw => draw.mode === h.gl.POINTS && draw.count === 1));
  h.viewer.setSelection('not-a-place'); assert.deepEqual(h.viewer.getCamera(), before);
  h.viewer.destroy();
});

test('keyboard and wheel handle only declared canvas input and publish settled bounded views', () => {
  const h = harness(); h.frame(); const original = h.viewer.getCamera();
  assert.equal(h.canvas.emit('keydown', { code: 'Tab' }).defaultPrevented, false);
  assert.equal(h.canvas.emit('keydown', { code: 'ArrowRight', ctrlKey: true }).defaultPrevented, false);
  assert.equal(h.canvas.emit('keydown', { code: 'ArrowRight', target: { tagName: 'INPUT' } }).defaultPrevented, false);
  assert.equal(h.canvas.emit('keydown', { code: 'ArrowRight' }).defaultPrevented, true);
  assert.ok(h.viewer.getCamera().x > original.x);
  const wheel = h.canvas.emit('wheel', { deltaY: -100, deltaMode: 0 }); assert.equal(wheel.defaultPrevented, true);
  assert.ok(h.viewer.getCamera().distance < original.distance); assert.equal(h.calls.cameras.at(-1).settled, false);
  h.flushTimers(); assert.equal(h.calls.cameras.at(-1).settled, true);
  h.viewer.destroy();
});

test('pointer pan and shifted orbit use captured input without selecting after a drag', () => {
  const h = harness(); h.frame(); const original = h.viewer.getCamera();
  h.pointer('pointerdown', 100, 100); assert.equal(h.captures.size, 1);
  h.pointer('pointermove', 140, 120); h.pointer('pointerup', 140, 120);
  assert.ok(h.viewer.getCamera().x < original.x); assert.ok(h.viewer.getCamera().z < original.z); assert.equal(h.calls.picks.length, 0);
  const pan = h.viewer.getCamera();
  h.pointer('pointerdown', 100, 100, { shiftKey: true }); h.pointer('pointermove', 140, 120); h.pointer('pointerup', 140, 120);
  assert.notEqual(h.viewer.getCamera().yaw, pan.yaw); assert.notEqual(h.viewer.getCamera().pitch, pan.pitch);
  assert.equal(h.captures.size, 0); assert.equal(h.calls.cameras.at(-1).settled, true);
  h.viewer.destroy();
});

test('two touch pointers pinch and twist, and cancellation clears every capture and prevents a click', () => {
  const h = harness(); h.frame(); const before = h.viewer.getCamera();
  h.pointer('pointerdown', 100, 100, { pointerType: 'touch' });
  h.pointer('pointerdown', 200, 100, { pointerType: 'touch', pointerId: 2 });
  h.pointer('pointermove', 250, 130, { pointerType: 'touch', pointerId: 2 });
  assert.ok(h.viewer.getCamera().distance < before.distance); assert.notEqual(h.viewer.getCamera().yaw, before.yaw);
  h.canvas.emit('pointercancel', { pointerId: 2 }); assert.equal(h.captures.size, 0);
  h.pointer('pointerup', 100, 100, { pointerType: 'touch' }); assert.equal(h.calls.picks.length, 0);
  h.viewer.destroy();
});

test('manual navigation and reduced motion cancel flights without an obsolete RAF restoring them', () => {
  const h = harness(); h.frame(); h.viewer.focusPlace(PLACES[0].id, { animate: true }); h.frame();
  h.canvas.emit('keydown', { code: 'KeyE' }); const manual = h.viewer.getCamera();
  h.frame(1000); assert.deepEqual(h.viewer.getCamera(), manual);
  h.viewer.setReducedMotion(true); h.viewer.home('essos', { animate: true });
  assert.deepEqual(h.viewer.getCamera(), REGION_VIEWS.essos);
  assert.equal(h.calls.cameras.at(-1).settled, true);
  h.viewer.focusPlace(PLACES[1].id, { animate: true }); h.viewer.setActive(false);
  const inactive = h.viewer.getCamera(); h.staleFrames(); assert.deepEqual(h.viewer.getCamera(), inactive);
  assert.equal(h.frames.size, 0); h.viewer.destroy();
});

test('hidden and blurred scenes stop gestures timers and transitions until active again', () => {
  const h = harness(); h.frame();
  h.pointer('pointerdown', 100, 100); h.canvas.emit('wheel', { deltaY: 50 });
  h.document.hidden = true; h.document.emit('visibilitychange');
  assert.equal(h.captures.size, 0); assert.equal(h.timers.size, 0); assert.equal(h.frames.size, 0);
  const hidden = h.viewer.getCamera(); h.staleFrames(); h.pointer('pointermove', 200, 200); assert.deepEqual(h.viewer.getCamera(), hidden);
  h.document.hidden = false; h.document.emit('visibilitychange'); h.frame();
  h.pointer('pointerdown', 100, 100); h.window.emit('blur'); assert.equal(h.captures.size, 0); assert.equal(h.frames.size, 0);
  h.window.emit('focus'); h.frame(); assert.equal(h.calls.statuses.at(-1).state, 'ready');
  h.viewer.destroy();
});

test('context loss preserves the camera and selection, then rebuilds every GPU object and rereads size limits', () => {
  const h = harness(); h.frame(); h.viewer.setSelection(PLACES[0].id); h.viewer.navigate({ orbit: 0.2 }); h.frame();
  const camera = h.viewer.getCamera(), originals = [...h.gl.resources], listenerCount = h.canvas.count() + h.window.count() + h.document.count();
  h.gl.lost = true; const event = h.canvas.emit('webglcontextlost'); assert.equal(event.defaultPrevented, true);
  assert.equal(h.calls.statuses.at(-1).state, 'context-lost'); assert.deepEqual(h.calls.projects.at(-1), []);
  assert.ok(originals.every(resource => resource.deleted)); assert.equal(h.frames.size, 0);
  h.gl.maxDimension = 512; h.gl.lost = false; h.canvas.emit('webglcontextrestored'); h.staleFrames(); h.frame();
  assert.equal(h.calls.statuses.at(-1).state, 'ready'); assert.deepEqual(h.viewer.getCamera(), camera);
  assert.ok(h.canvas.width <= 512 && h.canvas.height <= 512);
  assert.ok(h.gl.resources.slice(originals.length).every(resource => !resource.deleted));
  assert.equal(h.canvas.count() + h.window.count() + h.document.count(), listenerCount);
  h.viewer.destroy(); assert.ok(h.gl.resources.every(resource => resource.deleted));
});

test('loss during getContext is handled before initialization and can restore without an error state', () => {
  const h = harness({ loseAtCreation: true });
  assert.equal(h.calls.statuses.at(-1).state, 'context-lost'); assert.equal(h.frames.size, 0);
  h.gl.lost = false; h.canvas.emit('webglcontextrestored'); h.frame();
  assert.equal(h.calls.statuses.at(-1).state, 'ready'); assert.ok(!h.calls.statuses.some(status => status.state === 'error'));
  h.viewer.destroy();
});

test('partial GPU allocation failure releases all previously allocated shaders programs and buffers', () => {
  const h = harness({ failAt: 10 }); h.frame();
  assert.equal(h.calls.statuses.at(-1).state, 'error'); assert.ok(h.gl.resources.length > 0);
  assert.ok(h.gl.resources.every(resource => resource.deleted)); assert.equal(h.frames.size, 0);
  h.viewer.destroy(); assert.ok(h.gl.resources.every(resource => resource.deleted));
});

test('context loss during partial initialization is a recoverable interruption rather than a fatal renderer error', () => {
  const h = harness({ loseAt: 8 }); h.frame();
  assert.equal(h.calls.statuses.at(-1).state, 'context-lost'); assert.ok(h.gl.resources.every(resource => resource.deleted));
  h.gl.lost = false; h.canvas.emit('webglcontextrestored'); h.frame();
  assert.equal(h.calls.statuses.at(-1).state, 'ready'); assert.ok(!h.calls.statuses.some(status => status.state === 'error'));
  h.viewer.destroy();
});

test('unavailable WebGL leaves a truthful error state and does not claim a 2D replacement is ready', () => {
  const h = harness({ noContext: true });
  assert.equal(h.calls.statuses.at(-1).state, 'error'); assert.match(h.calls.statuses.at(-1).message, /WebGL/);
  assert.deepEqual(h.calls.projects.at(-1), []); assert.equal(h.frames.size, 0); assert.equal(h.gl.resources.length, 0);
  h.viewer.destroy();
});

test('a draw failure releases the owned graph and stops further animation', () => {
  const h = harness({ drawFailure: true }); h.frame();
  assert.equal(h.calls.statuses.at(-1).state, 'error'); assert.ok(h.gl.resources.every(resource => resource.deleted));
  assert.equal(h.frames.size, 0); h.viewer.destroy();
});

test('destroy is terminal and idempotent across stale frames observers and subsequent public API calls', () => {
  const h = harness(); h.frame(); h.viewer.focusPlace(PLACES[0].id); h.viewer.destroy();
  const calls = structuredClone(h.calls), resources = h.gl.resources.length, camera = h.viewer.getCamera();
  h.viewer.destroy(); h.staleFrames(); h.observers.forEach(observer => observer.callback());
  h.viewer.setCamera(REGION_VIEWS.essos); h.viewer.setSelection(PLACES[1].id); h.viewer.home('all'); h.viewer.navigate({ zoom: 1 });
  h.viewer.setActive(true); h.viewer.setReducedMotion(false); h.viewer.resize(); h.canvas.emit('webglcontextrestored');
  assert.deepEqual(h.calls, calls); assert.deepEqual(h.viewer.getCamera(), camera); assert.equal(h.gl.resources.length, resources);
  assert.ok(h.gl.resources.every(resource => resource.deleted)); assert.ok(h.observers.every(observer => observer.disconnected));
  assert.equal(h.canvas.count() + h.window.count() + h.document.count(), 0); assert.equal(h.frames.size, 0); assert.equal(h.timers.size, 0);
  assert.equal(h.canvas.style.touchAction, 'pan-y');
});
