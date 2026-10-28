// T2: the complete actual app runs against authored browser/viewer boundaries.
// These checks do not execute WebGL, layout, native clipboard or browser input.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as world from '../public/src/world.js';
import * as viewState from '../public/src/view-state.js';

const source = await readFile(process.env.KNOWN_WORLD_APP_SOURCE || new URL('../public/src/app.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const flush = async () => { for (let index = 0; index < 12; index++) await Promise.resolve(); };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

function environment(options = {}) {
  const nodes = new Map(), staticNodes = [], windowEvents = new Map(), documentEvents = new Map(), timers = new Map();
  const stored = options.storage || new Map([['another-app', 'leave this alone']]);
  const calls = { focus: [], camera: [], selection: [], home: [], layers: [], navigation: [], active: [], reduced: [], writes: [], history: [], clipboard: [], destroy: 0, resize: 0 };
  let timerID = 0, storageReads = 0, callbacks, sceneCamera = viewState.normalizeCamera();
  function element(tag) {
    const attributes = new Map(), classes = new Set(), events = new Map();
    const node = { tagName: tag.toUpperCase(), dataset: {}, style: {}, children: [], hidden: false, checked: false, disabled: false, value: '', open: false, textContent: '',
      set className(value) { classes.clear(); for (const name of value.split(/\s+/)) if (name) classes.add(name); }, get className() { return [...classes].join(' '); },
      classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name), toggle(name, force) { const value = force ?? !classes.has(name); if (value) classes.add(name); else classes.delete(name); return value; } },
      setAttribute(name, value) { attributes.set(name, String(value)); }, getAttribute: name => attributes.get(name) ?? null, removeAttribute(name) { attributes.delete(name); },
      append(...children) { node.children.push(...children); }, replaceChildren(...children) { node.children = [...children]; },
      addEventListener(name, callback) { const list = events.get(name) || []; list.push(callback); events.set(name, list); },
      dispatch(name, extra = {}) { let prevented = false; const event = { currentTarget: node, target: node, preventDefault() { prevented = true; }, ...extra }; if (name !== 'click' || !node.disabled) for (const callback of events.get(name) || []) callback(event); return { prevented }; },
      focus() { document.activeElement = node; }, select() { node.selected = true; },
      showModal() { node.open = true; }, close() { node.open = false; node.dispatch('close'); },
    }; return node;
  }
  for (const [markup, tag] of html.matchAll(/<([a-z][\w-]*)\b[^>]*>/gi)) {
    if (!/\bid="|\bdata-region=|\bdata-viewer-control\b/.test(markup)) continue;
    const node = element(tag); staticNodes.push(node);
    for (const [name, value] of [...markup.matchAll(/([\w:-]+)="([^"]*)"/g)].map(match => [match[1], match[2]])) {
      node.setAttribute(name, value);
      if (name === 'id') { node.id = value; nodes.set(value, node); }
      if (name === 'class') node.className = value;
      if (name.startsWith('data-')) node.dataset[name.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = value;
    }
    node.hidden = /\shidden(?:\s|>)/.test(markup); node.checked = /\schecked(?:\s|>)/.test(markup);
    if (/\bdata-viewer-control\b/.test(markup)) node.viewerControl = true;
  }
  const document = { hidden: Boolean(options.hidden), activeElement: null,
    getElementById(id) { assert.ok(nodes.has(id), `The actual HTML must contain #${id}`); return nodes.get(id); },
    createElement: element,
    querySelectorAll(selector) { if (selector === '[data-region]') return staticNodes.filter(node => node.dataset.region); if (selector === '[data-viewer-control]') return staticNodes.filter(node => node.viewerControl); throw new Error('Unmodeled selector: ' + selector); },
    addEventListener(name, callback) { const list = documentEvents.get(name) || []; list.push(callback); documentEvents.set(name, list); },
  };
  const media = new Map();
  const location = { href: 'https://atlas.example.test/?keep=1' + (options.hash || ''), hash: options.hash || '', reload() { calls.reload = (calls.reload || 0) + 1; } };
  const window = {
    location,
    history: { replaceState(state, title, hash) { if (options.historyFailure) throw new Error('History denied'); calls.history.push(hash); const next = new URL(hash, location.href); location.href = next.href; location.hash = next.hash; } },
    navigator: { clipboard: options.noClipboard ? undefined : { writeText(link) { calls.clipboard.push(link); return options.clipboard ? options.clipboard(link) : Promise.resolve(); } } },
    matchMedia(query) { if (!media.has(query)) { const listeners = []; media.set(query, { matches: query.includes('reduce') ? Boolean(options.reduced) : Boolean(options.narrow), addEventListener(name, callback) { assert.equal(name, 'change'); listeners.push(callback); }, change(value) { this.matches = value; for (const callback of listeners) callback({ matches: value }); } }); } return media.get(query); },
    addEventListener(name, callback) { const list = windowEvents.get(name) || []; list.push(callback); windowEvents.set(name, list); },
  };
  Object.defineProperty(window, 'localStorage', { get() { if (options.storageGetterFailure) throw new Error('Storage denied'); return { getItem(key) { if (options.initialStorageReadFailure && storageReads++ === 0) throw new Error('Initial read denied'); return stored.get(key) ?? null; }, setItem(key, value) { if (options.storageWriteFailure) throw new Error('Quota denied'); calls.writes.push({ key, value }); stored.set(key, value); } }; } });
  function cameraChanged(next) { sceneCamera = viewState.normalizeCamera(next); callbacks.onCamera(sceneCamera, { settled: true }); }
  const viewer = {
    getCamera: () => sceneCamera,
    setCamera(next, settings) { calls.camera.push({ camera: plain(next), settings: plain(settings) }); cameraChanged(next); },
    setSelection(id) { calls.selection.push(world.getPlace(id)?.id ?? null); },
    focusPlace(id, settings) { calls.focus.push({ id, settings: plain(settings) }); const place = world.getPlace(id); cameraChanged({ ...sceneCamera, x: place.x, z: place.z, distance: 68 }); },
    home(region, settings) { calls.home.push({ region, settings: plain(settings) }); cameraChanged(world.REGION_VIEWS[region]); },
    setLayers(value) { calls.layers.push(plain(value)); }, navigate(value) { calls.navigation.push(plain(value)); },
    setActive(value) { calls.active.push(value); }, setReducedMotion(value) { calls.reduced.push(value); }, resize() { calls.resize++; }, destroy() { calls.destroy++; },
  };
  vm.runInNewContext(source.replace(/^import [^\n]+;\s*$/gm, ''), {
    ...world, ...viewState, window, document, URL, Math, Set, Map,
    createViewer(canvas, handlers) { assert.equal(canvas, nodes.get('atlas')); callbacks = handlers; if (options.viewerFailure) throw new Error('WebGL unavailable'); handlers.onStatus({ state: 'ready' }); handlers.onCamera(viewState.DEFAULT_CAMERA, { settled: true }); return viewer; },
    setTimeout(callback, delay) { const timer = { id: ++timerID, callback, delay }; timers.set(timer.id, timer); return timer.id; }, clearTimeout(id) { timers.delete(id); },
    fetch() { throw new Error('Network is forbidden in app VM checks.'); },
  }, { filename: 'actual-app.js' });
  return { nodes, stored, calls, callbacks, document, window, media,
    click(id) { return nodes.get(id).dispatch('click'); },
    event(name, extra = {}) { for (const callback of windowEvents.get(name) || []) callback(extra); },
    visibility(hidden) { document.hidden = hidden; for (const callback of documentEvents.get('visibilitychange') || []) callback({}); },
    timer(delay = 6500) { return [...timers.values()].find(timer => timer.delay === delay); },
    pending(delay = 6500) { return [...timers.values()].filter(timer => timer.delay === delay).length; },
    fire(timer) { timers.delete(timer.id); timer.callback(); },
    pick(id = 'winterfell') { callbacks.onPick(id); },
    restore(hash) { location.hash = hash; location.href = new URL(hash, location.href).href; for (const callback of windowEvents.get('hashchange') || []) callback({}); },
    state() { return viewState.readViewHash(location.hash); },
  };
}

test('creation callbacks cannot overwrite the restored camera, selected place or layers', () => {
  const hash = viewState.writeViewHash({ camera: { x: 91, z: 17, distance: 88, yaw: 1, pitch: .72 }, placeId: 'qohor', terrain: false, labels: false });
  const h = environment({ hash });
  assert.deepEqual(h.calls.camera[0].camera, viewState.readViewHash(hash).camera);
  assert.equal(h.nodes.get('place-title').textContent, 'Qohor'); assert.equal(h.nodes.get('place-panel').hidden, false);
  assert.equal(h.calls.layers.at(-1).terrain, false); assert.equal(h.calls.layers.at(-1).labels, false);
  assert.equal(h.nodes.get('zoom-in').disabled, false); assert.equal(h.state().placeId, 'qohor');
});

test('actual result callbacks fly to the same catalog ID and show its geographic details', () => {
  const h = environment(), input = h.nodes.get('place-search'); input.value = 'winterfell'; input.dispatch('input');
  h.nodes.get('search-results').children[0].children[0].dispatch('click');
  const place = world.getPlace('winterfell'); assert.equal(h.calls.focus.at(-1).id, place.id);
  assert.equal(h.nodes.get('place-description').textContent, place.description); assert.equal(h.nodes.get('place-source').href, place.source);
  assert.equal(h.document.activeElement, h.nodes.get('place-title')); assert.equal(h.state().placeId, place.id);
  assert.equal(h.state().camera.x, place.x); assert.equal(h.state().camera.z, place.z);
});

test('continent and category controls filter the real catalog and the marker layers together', () => {
  const h = environment();
  const regionButton = h.document.querySelectorAll('[data-region]').find(node => node.dataset.region === 'essos'); regionButton.dispatch('click');
  assert.equal(h.calls.home.at(-1).region, 'essos');
  assert.equal(h.nodes.get('search-results').children.length, world.findPlaces('', { continent: 'essos' }).length);
  for (const label of h.nodes.get('category-filters').children) { label.children[0].checked = false; label.children[0].dispatch('change'); }
  assert.equal(h.nodes.get('search-results').children.length, 0); assert.equal(h.nodes.get('search-empty').hidden, false);
  assert.deepEqual(h.calls.layers.at(-1).categories, []); assert.match(h.nodes.get('search-empty').textContent, /choose a place type/i);
});

test('bookmark callbacks store only their own key and reload the saved catalog IDs', () => {
  const h = environment(); h.pick(); h.click('bookmark-place');
  assert.equal(h.nodes.get('bookmark-place').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(h.calls.writes.map(write => write.key), ['known-world.bookmarks.v1']);
  assert.deepEqual(JSON.parse(h.stored.get('known-world.bookmarks.v1')), ['winterfell']); assert.equal(h.stored.get('another-app'), 'leave this alone');
  const reloaded = environment({ storage: h.stored }); reloaded.click('saved-tab');
  assert.equal(reloaded.nodes.get('bookmark-results').children.length, 1); assert.equal(reloaded.nodes.get('bookmarks-empty').hidden, true);
  reloaded.nodes.get('bookmark-results').children[0].children[1].dispatch('click'); assert.deepEqual(JSON.parse(h.stored.get('known-world.bookmarks.v1')), []);
});

test('storage refusal preserves in-tab bookmarks, visible warning and unrelated storage', () => {
  const h = environment({ storageWriteFailure: true }); h.pick(); h.click('bookmark-place'); h.click('saved-tab');
  assert.equal(h.nodes.get('bookmark-results').children.length, 1); assert.equal(h.nodes.get('storage-notice').hidden, false);
  assert.equal(h.nodes.get('saved-count').textContent, '1'); assert.equal(h.stored.get('another-app'), 'leave this alone');
});

test('a denied storage getter leaves search and the 3D controls usable', () => {
  const h = environment({ storageGetterFailure: true }); assert.equal(h.nodes.get('search-results').children.length, world.PLACES.length);
  assert.equal(h.nodes.get('storage-notice').hidden, false); assert.equal(h.nodes.get('zoom-in').disabled, false);
  h.pick(); h.click('bookmark-place'); assert.equal(h.nodes.get('saved-count').textContent, '1');
});

test('explicit navigation calls bounded viewer intents and north-up preserves the current target', () => {
  const h = environment(); for (const id of ['zoom-in', 'zoom-out', 'orbit-left', 'orbit-right', 'tilt-up', 'tilt-down']) h.click(id);
  assert.deepEqual(h.calls.navigation, [{ zoom: .22 }, { zoom: -.22 }, { orbit: -.22 }, { orbit: .22 }, { tilt: .12 }, { tilt: -.12 }]);
  const camera = viewState.normalizeCamera({ x: 90, z: 20, yaw: 1.2, distance: 80, pitch: .6 }); h.callbacks.onCamera(camera, { settled: true });
  // The viewer's getCamera is authoritative when the north-up button is used.
  h.restore(viewState.writeViewHash({ camera })); h.click('north-up');
  assert.deepEqual(h.calls.camera.at(-1).camera, { ...camera, yaw: 0 });
});

test('label positioning uses viewer CSS pixels and a disabled label layer stays hidden', () => {
  const h = environment(), labels = h.nodes.get('map-labels').children;
  h.callbacks.onProject([{ id: world.PLACES[0].id, x: 103.4, y: 44.7, visible: true }]);
  assert.equal(labels[0].style.transform, 'translate(103px,45px)'); assert.equal(labels[0].hidden, false);
  h.nodes.get('labels-toggle').checked = false; h.nodes.get('labels-toggle').dispatch('change');
  h.callbacks.onProject([{ id: world.PLACES[0].id, x: 1, y: 2, visible: true }]); assert.equal(labels[0].hidden, true);
  assert.equal(h.state().labels, false);
});

test('hash restoration applies validated camera and layers without a feedback loop', () => {
  const h = environment(), before = h.calls.history.length;
  const hash = viewState.writeViewHash({ camera: { x: 25, z: 40, distance: 74, yaw: -.7, pitch: .8 }, placeId: 'pentos', terrain: false }); h.restore(hash);
  assert.equal(h.calls.history.length, before); assert.equal(h.nodes.get('place-title').textContent, 'Pentos');
  assert.equal(h.nodes.get('terrain-toggle').checked, false); assert.deepEqual(h.calls.camera.at(-1).camera, viewState.readViewHash(hash).camera);
});

test('the mobile skip link opens and focuses search without replacing the view hash', () => {
  const h = environment({ narrow: true }); const hash = h.window.location.hash;
  assert.equal(h.nodes.get('explore-panel').classList.contains('is-collapsed'), true);
  const event = h.click('skip-search'); assert.equal(event.prevented, true);
  assert.equal(h.nodes.get('explore-panel').classList.contains('is-collapsed'), false); assert.equal(h.document.activeElement, h.nodes.get('place-search'));
  assert.equal(h.window.location.hash, hash);
});

test('sharing copies the exact displayed view and excludes the bookmark list', async () => {
  const h = environment(); h.pick('braavos'); h.click('bookmark-place'); h.click('share-view'); await flush();
  const link = h.nodes.get('share-url').value; assert.equal(h.calls.clipboard.at(-1), link); assert.equal(new URL(link).search, '?keep=1');
  assert.equal(viewState.readViewHash(new URL(link).hash).placeId, 'braavos'); assert.doesNotMatch(link, /bookmarks/);
  assert.match(h.nodes.get('share-feedback').textContent, /this link is copied/i);
});

test('clipboard denial exposes the current selectable URL even when history writes fail', async () => {
  const h = environment({ noClipboard: true, historyFailure: true }); h.pick('winterfell'); h.click('share-view'); await flush();
  assert.equal(h.nodes.get('share-url').selected, true); assert.equal(h.document.activeElement, h.nodes.get('share-url'));
  assert.equal(viewState.readViewHash(new URL(h.nodes.get('share-url').value).hash).placeId, 'winterfell');
  assert.match(h.nodes.get('share-feedback').textContent, /select and copy/i);
});

test('an obsolete clipboard failure cannot replace a newer successful copy', async () => {
  const first = deferred(), second = deferred(); let request = 0;
  const h = environment({ clipboard: () => (++request === 1 ? first : second).promise });
  h.click('share-view'); h.click('copy-link'); second.resolve(); await flush(); const feedback = h.nodes.get('share-feedback').textContent;
  first.reject(new Error('Old refusal')); await flush(); assert.equal(h.nodes.get('share-feedback').textContent, feedback); assert.equal(h.nodes.get('share-url').selected, undefined);
});

test('closing a share dialog fences its pending clipboard result', async () => {
  const pending = deferred(), h = environment({ clipboard: () => pending.promise }); h.click('share-view'); h.click('close-share');
  const before = h.nodes.get('share-feedback').textContent; pending.reject(new Error('Late refusal')); await flush();
  assert.equal(h.nodes.get('share-feedback').textContent, before); assert.equal(h.nodes.get('share-url').selected, undefined);
});

test('manual canvas input cancels the guided journey and fences an already queued timer', () => {
  const h = environment(); h.click('tour-toggle'); const timer = h.timer(); assert.ok(timer); assert.equal(h.calls.focus.at(-1).id, world.TOUR_STOPS[0]);
  h.callbacks.onInteraction(); const before = h.calls.focus.length; h.fire(timer);
  assert.equal(h.calls.focus.length, before); assert.equal(h.pending(), 0); assert.equal(h.nodes.get('tour-toggle').getAttribute('aria-pressed'), 'false');
});

test('a tour advances one stop at a time and an older journey timer cannot disturb a restarted journey', () => {
  const h = environment(); h.click('tour-toggle'); h.fire(h.timer());
  assert.equal(h.calls.focus.at(-1).id, world.TOUR_STOPS[1]); assert.equal(h.pending(), 1);
  const stale = h.timer(); h.click('tour-toggle'); h.click('tour-toggle');
  const before = h.calls.focus.length; h.fire(stale);
  assert.equal(h.calls.focus.length, before); assert.equal(h.calls.focus.at(-1).id, world.TOUR_STOPS[0]);
  assert.equal(h.nodes.get('tour-toggle').getAttribute('aria-pressed'), 'true'); assert.equal(h.pending(), 1);
});

for (const action of ['saved-tab', 'places-tab', 'sheet-toggle', 'bookmark-place', 'share-view']) test(`the ${action} app action stops a guided journey`, async () => {
  const h = environment(); h.click('tour-toggle'); const timer = h.timer(); h.click(action); const before = h.calls.focus.length; h.fire(timer); await flush();
  assert.equal(h.calls.focus.length, before); assert.equal(h.pending(), 0);
});

for (const interruption of ['hidden', 'blur', 'context-lost', 'reduced-motion', 'pagehide']) test(`${interruption} stops automatic travel and stale timers cannot restart it`, () => {
  const h = environment(); h.click('tour-toggle'); const timer = h.timer();
  if (interruption === 'hidden') h.visibility(true);
  else if (interruption === 'blur') h.event('blur');
  else if (interruption === 'context-lost') h.callbacks.onStatus({ state: 'context-lost' });
  else if (interruption === 'reduced-motion') h.media.get('(prefers-reduced-motion: reduce)').change(true);
  else h.event('pagehide', { persisted: true });
  const before = h.calls.focus.length; h.fire(timer); h.callbacks.onStatus({ state: 'ready' });
  assert.equal(h.calls.focus.length, before); assert.equal(h.pending(), 0); assert.equal(h.nodes.get('tour-toggle').getAttribute('aria-pressed'), 'false');
  if (['hidden', 'blur', 'pagehide'].includes(interruption)) assert.equal(h.calls.active.at(-1), false);
});

test('initial hidden/reduced-motion state stays inactive and makes selected flights immediate', () => {
  const h = environment({ hidden: true, reduced: true }); h.callbacks.onStatus({ state: 'ready' });
  assert.equal(h.calls.active.at(-1), false); assert.equal(h.nodes.get('tour-toggle').disabled, true); assert.deepEqual(h.calls.reduced, [true]);
  h.pick(); h.click('fly-to'); assert.equal(h.calls.focus.at(-1).settings.animate, false);
});

test('BFCache retains the renderer, while terminal disposal is idempotent and fences UI work', () => {
  const h = environment(); h.event('pagehide', { persisted: true }); assert.equal(h.calls.destroy, 0); assert.equal(h.calls.active.at(-1), false);
  h.event('pageshow', { persisted: true }); assert.equal(h.calls.resize, 1); assert.equal(h.calls.active.at(-1), true);
  h.event('pagehide', { persisted: false }); h.event('pagehide', { persisted: false }); assert.equal(h.calls.destroy, 1);
  const before = h.calls.focus.length; h.callbacks.onPick('winterfell'); h.click('share-view'); assert.equal(h.calls.focus.length, before); assert.equal(h.nodes.get('share-dialog').open, false);
});

test('WebGL initialization failure keeps the catalog, details and in-tab bookmarks available', () => {
  const h = environment({ viewerFailure: true }); assert.equal(h.nodes.get('viewer-status').hidden, false);
  assert.match(h.nodes.get('viewer-status-title').textContent, /unavailable/i); assert.equal(h.nodes.get('zoom-in').disabled, true);
  h.nodes.get('search-results').children[0].children[0].dispatch('click'); h.click('bookmark-place');
  assert.equal(h.nodes.get('place-panel').hidden, false); assert.equal(h.nodes.get('saved-count').textContent, '1'); assert.equal(h.calls.focus.length, 0);
});

test('the initial selected place reaches the renderer without moving the shared camera', () => {
  const camera = viewState.normalizeCamera({ x: 91, z: 17, distance: 88, yaw: 1, pitch: .72 });
  const h = environment({ hash: viewState.writeViewHash({ camera, placeId: 'qohor' }) });
  assert.equal(h.calls.selection.at(-1), 'qohor'); assert.deepEqual(h.calls.camera.at(-1).camera, camera);
  assert.equal(h.calls.focus.length, 0);
});

test('restoring a different selected place updates the GPU selection and retains the exact validated viewpoint', () => {
  const h = environment({ hash: '#place=winterfell' });
  const hash = viewState.writeViewHash({ camera: { x: -19, z: 71, distance: 99, yaw: -.4, pitch: .9 }, placeId: 'braavos' });
  h.restore(hash); assert.equal(h.calls.selection.at(-1), 'braavos');
  assert.deepEqual(h.calls.camera.at(-1).camera, viewState.readViewHash(hash).camera); assert.equal(h.calls.focus.length, 0);
});

test('closing place details clears the renderer selection and URL without a camera move', () => {
  const h = environment({ hash: '#place=winterfell' }), cameraCalls = h.calls.camera.length, camera = h.state().camera;
  h.click('close-place'); assert.equal(h.calls.selection.at(-1), null); assert.equal(h.state().placeId, null);
  assert.equal(h.nodes.get('place-panel').hidden, true); assert.equal(h.calls.camera.length, cameraCalls);
  assert.deepEqual(h.state().camera, camera); assert.equal(h.calls.focus.length, 0);
});

test('an empty canvas pick clears details and marker selection while keeping keyboard focus on the map', () => {
  const h = environment({ hash: '#place=winterfell' }); h.nodes.get('atlas').focus(); const cameraCalls = h.calls.camera.length;
  h.callbacks.onPick(null); assert.equal(h.calls.selection.at(-1), null); assert.equal(h.state().placeId, null);
  assert.equal(h.nodes.get('catalog-view').hidden, false); assert.equal(h.nodes.get('place-panel').hidden, true);
  assert.equal(h.document.activeElement, h.nodes.get('atlas')); assert.equal(h.calls.camera.length, cameraCalls);
});

test('each projection snapshot hides labels omitted from the newest visible set', () => {
  const h = environment(), nodes = h.nodes.get('map-labels').children;
  h.callbacks.onProject(world.PLACES.slice(0, 2).map((place, index) => ({ id: place.id, x: index * 300, y: 50, visible: true })));
  assert.equal(nodes[0].hidden, false); assert.equal(nodes[1].hidden, false);
  h.callbacks.onProject([{ id: world.PLACES[1].id, x: 5, y: 6, visible: true }]);
  assert.equal(nodes[0].hidden, true); assert.equal(nodes[1].hidden, false);
});

test('empty projection snapshots clear all floating labels on context loss and errors', () => {
  const h = environment(), node = h.nodes.get('map-labels').children[0];
  for (const state of ['context-lost', 'error']) {
    h.callbacks.onProject([{ id: world.PLACES[0].id, x: 40, y: 50, visible: true }]); assert.equal(node.hidden, false);
    h.callbacks.onStatus({ state }); h.callbacks.onProject([]);
    assert.equal(h.nodes.get('map-labels').children.every(label => label.hidden), true);
  }
});

function placeLabel(h, id) {
  return h.nodes.get('map-labels').children.find(node => node.children[0].textContent === world.getPlace(id).name);
}

test('overlapping names reduce to one readable label while distant names and scene markers remain', () => {
  const h = environment(), layerCalls = h.calls.layers.length;
  h.callbacks.onProject([
    { id: 'braavos', x: 200, y: 180, visible: true },
    { id: 'winterfell', x: 200, y: 180, visible: true },
    { id: 'oldtown', x: 600, y: 350, visible: true },
  ]);
  assert.equal(['braavos', 'winterfell'].filter(id => !placeLabel(h, id).hidden).length, 1);
  assert.equal(placeLabel(h, 'oldtown').hidden, false); assert.equal(h.calls.layers.length, layerCalls);
  assert.equal(h.calls.layers.at(-1).categories.length, world.CATEGORIES.length);
});

test('the selected name wins an overlap regardless of projection order and keeps distant names visible', () => {
  const h = environment({ hash: '#place=dreadfort' });
  h.callbacks.onProject([
    { id: 'the-wall', x: 150, y: 120, visible: true },
    { id: 'white-harbor', x: 150, y: 120, visible: true },
    { id: 'dreadfort', x: 150, y: 120, visible: true },
    { id: 'starfall', x: 500, y: 300, visible: true },
  ]);
  assert.equal(placeLabel(h, 'dreadfort').hidden, false); assert.equal(placeLabel(h, 'the-wall').hidden, true);
  assert.equal(placeLabel(h, 'white-harbor').hidden, true); assert.equal(placeLabel(h, 'starfall').hidden, false);
});

test('selecting a previously hidden name re-evaluates the current projection without moving the camera', () => {
  const h = environment();
  h.callbacks.onProject([{ id: 'white-harbor', x: 200, y: 180, visible: true }, { id: 'dreadfort', x: 200, y: 180, visible: true }]);
  assert.equal(placeLabel(h, 'white-harbor').hidden, false); assert.equal(placeLabel(h, 'dreadfort').hidden, true);
  const cameraCalls = h.calls.camera.length; h.pick('dreadfort');
  assert.equal(placeLabel(h, 'dreadfort').hidden, false); assert.equal(placeLabel(h, 'white-harbor').hidden, true);
  assert.equal(h.calls.camera.length, cameraCalls); assert.equal(h.calls.focus.length, 0);
});

test('tour landmarks precede ordinary cities, which precede ordinary castle names in a dense cluster', () => {
  const h = environment();
  h.callbacks.onProject([{ id: 'dreadfort', x: 200, y: 180, visible: true }, { id: 'white-harbor', x: 200, y: 180, visible: true }]);
  assert.equal(placeLabel(h, 'white-harbor').hidden, false); assert.equal(placeLabel(h, 'dreadfort').hidden, true);
  h.callbacks.onProject([{ id: 'white-harbor', x: 200, y: 180, visible: true }, { id: 'the-wall', x: 200, y: 180, visible: true }]);
  assert.equal(placeLabel(h, 'the-wall').hidden, false); assert.equal(placeLabel(h, 'white-harbor').hidden, true);
});

test('selection priority does not expose a name outside the visible projection or with invalid coordinates', () => {
  const h = environment({ hash: '#place=dreadfort' });
  h.callbacks.onProject([{ id: 'dreadfort', x: 200, y: 180, visible: false }, { id: 'white-harbor', x: 200, y: 180, visible: true }]);
  assert.equal(placeLabel(h, 'dreadfort').hidden, true); assert.equal(placeLabel(h, 'white-harbor').hidden, false);
  h.callbacks.onProject([{ id: 'dreadfort', x: Infinity, y: 180, visible: true }]); assert.equal(placeLabel(h, 'dreadfort').hidden, true);
});

test('an initially unreadable bookmark list stays untouched if storage later recovers during an in-tab save', () => {
  const storage = new Map([['known-world.bookmarks.v1', '["winterfell"]'], ['another-app', 'leave this alone']]);
  const h = environment({ storage, initialStorageReadFailure: true });
  assert.equal(h.nodes.get('saved-count').textContent, '0'); assert.equal(h.nodes.get('storage-notice').hidden, false);
  h.pick('braavos'); h.click('bookmark-place'); h.click('saved-tab');
  assert.equal(h.nodes.get('saved-count').textContent, '1'); assert.equal(h.nodes.get('bookmark-results').children[0].children[0].children[1].children[0].textContent, 'Braavos');
  assert.equal(h.stored.get('known-world.bookmarks.v1'), '["winterfell"]'); assert.deepEqual(h.calls.writes, []);
  assert.equal(h.stored.get('another-app'), 'leave this alone'); assert.equal(h.nodes.get('storage-notice').hidden, false);
});
