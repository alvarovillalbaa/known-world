import { PLACES, CATEGORIES, TOUR_STOPS, getPlace, findPlaces } from './world.js';
import { normalizeCamera, readViewHash, writeViewHash, MAX_BOOKMARKS, loadBookmarks, writeBookmarks, normalizeBookmarks } from './view-state.js';
import { createViewer } from './viewer.js';

const byId = id => document.getElementById(id);
const canvas = byId('atlas');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const narrowScreen = window.matchMedia('(max-width: 760px)');
const initial = readViewHash(window.location.hash);
let camera = initial.camera, selectedId = initial.placeId, terrain = initial.terrain, labels = initial.labels;
let viewer, viewerState = 'loading', region = 'all', panel = selectedId ? 'detail' : 'catalog';
let initializing = true, applyingHash = false, disposed = false, windowFocused = true, pageActive = true;
let storage;
try { storage = window.localStorage; } catch { storage = null; }
const loaded = loadBookmarks(storage);
if (!loaded.available) storage = null;
let bookmarks = loaded.ids, storageAvailable = loaded.available, results = [];
let tourRunning = false, tourIndex = 0, tourTimer, tourGeneration = 0, noticeTimer, shareGeneration = 0;
let sheetExpanded = !narrowScreen.matches || Boolean(selectedId), urlAvailable = true;
const categories = new Set(CATEGORIES.map(category => category.id));
const labelNodes = new Map();
let projectedPlaces = [];
const symbols = { city: '◉', castle: '♜', landmark: '△' };
const categoryName = type => CATEGORIES.find(category => category.id === type)?.label || type;
const continentName = id => id === 'westeros' ? 'Westeros' : 'Essos';
const active = () => !disposed && pageActive && windowFocused && !document.hidden;

function announce(message) {
  if (disposed) return;
  clearTimeout(noticeTimer);
  byId('announcement').textContent = message;
  byId('announcement').classList.add('visible');
  noticeTimer = setTimeout(() => byId('announcement').classList.remove('visible'), 5000);
}
function persistView() {
  if (disposed || initializing || applyingHash) return;
  const hash = writeViewHash({ camera, placeId: selectedId, terrain, labels });
  if (window.location.hash === hash) return;
  try { window.history.replaceState(null, '', hash); }
  catch { if (urlAvailable) announce('This browser could not update the view link. You can still explore.'); urlAvailable = false; }
}
function renderSheet() {
  byId('explore-panel').classList.toggle('is-collapsed', !sheetExpanded);
  byId('sheet-toggle').setAttribute('aria-expanded', String(sheetExpanded));
  byId('sheet-toggle').setAttribute('aria-label', sheetExpanded ? 'Collapse exploration panel' : 'Expand exploration panel');
}
function updateControls() {
  const ready = viewerState === 'ready' && !disposed;
  for (const button of document.querySelectorAll('[data-viewer-control]')) button.disabled = !ready;
  byId('tour-toggle').disabled = !ready || reducedMotion.matches || !TOUR_STOPS.length;
  byId('tour-toggle').title = reducedMotion.matches ? 'Automatic journeys are disabled with reduced motion.' : 'Visit places across both continents';
  byId('tour-toggle').setAttribute('aria-pressed', String(tourRunning));
  byId('tour-icon').textContent = tourRunning ? 'Ⅱ' : '▷';
  byId('tour-label').textContent = tourRunning ? 'Pause the journey' : 'Take the long way';
  byId('tour-status').textContent = tourRunning ? `STOP ${tourIndex + 1} OF ${TOUR_STOPS.length}` : reducedMotion.matches ? 'Reduced motion · explore at your own pace' : 'A guided journey across both continents';
}
function renderPanel() {
  byId('catalog-view').hidden = panel !== 'catalog';
  byId('place-panel').hidden = panel !== 'detail';
  byId('bookmarks-panel').hidden = panel !== 'bookmarks';
  byId('places-tab').setAttribute('aria-pressed', String(panel !== 'bookmarks'));
  byId('saved-tab').setAttribute('aria-pressed', String(panel === 'bookmarks'));
  byId('saved-count').textContent = String(bookmarks.length);
  byId('storage-notice').hidden = storageAvailable;
  renderSheet();
}
function makePlaceButton(place) {
  const button = document.createElement('button'); button.type = 'button'; button.className = 'place-result';
  const symbol = document.createElement('span'); symbol.className = 'place-symbol'; symbol.setAttribute('aria-hidden', 'true'); symbol.textContent = symbols[place.type] || '◇';
  const text = document.createElement('span'); text.className = 'result-text';
  const name = document.createElement('span'); name.className = 'result-name'; name.textContent = place.name;
  const meta = document.createElement('span'); meta.className = 'result-meta'; meta.textContent = `${continentName(place.continent)} · ${categoryName(place.type)}`;
  const arrow = document.createElement('span'); arrow.className = 'result-arrow'; arrow.setAttribute('aria-hidden', 'true'); arrow.textContent = '↗';
  text.append(name, meta); button.append(symbol, text, arrow);
  button.addEventListener('click', () => showPlace(place.id, { fly: true, focus: true }));
  return button;
}
function renderSearch() {
  results = findPlaces(byId('place-search').value, { continent: region, categories: [...categories] });
  const list = byId('search-results'); list.replaceChildren();
  for (const place of results) { const item = document.createElement('li'); item.append(makePlaceButton(place)); list.append(item); }
  byId('result-count').textContent = `${results.length} ${results.length === 1 ? 'PLACE' : 'PLACES'}`;
  byId('search-empty').hidden = results.length > 0;
  byId('search-empty').textContent = categories.size ? 'No places found. Try another name or a different continent.' : 'Choose a place type above to see places on the atlas.';
  byId('clear-search').hidden = !byId('place-search').value;
}
function renderBookmarks() {
  const list = byId('bookmark-results'); list.replaceChildren();
  for (const id of bookmarks) {
    const place = getPlace(id); if (!place) continue;
    const item = document.createElement('li'); item.className = 'bookmark-row'; item.append(makePlaceButton(place));
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'remove-bookmark';
    remove.setAttribute('aria-label', `Remove ${place.name} from saved places`); remove.textContent = '×';
    remove.addEventListener('click', () => changeBookmark(id)); item.append(remove); list.append(item);
  }
  byId('bookmarks-empty').hidden = bookmarks.length > 0;
  byId('saved-count').textContent = String(bookmarks.length);
}
function renderPlace() {
  const place = getPlace(selectedId); if (!place) return;
  byId('place-title').textContent = place.name;
  byId('place-region').textContent = continentName(place.continent).toUpperCase();
  byId('place-type').textContent = categoryName(place.type);
  byId('place-description').textContent = place.description;
  const source = byId('place-source');
  const safeSource = typeof place.source === 'string' && /^https?:\/\//i.test(place.source);
  source.hidden = !safeSource;
  if (safeSource) source.href = place.source; else source.removeAttribute('href');
  const saved = bookmarks.includes(place.id);
  byId('bookmark-place').setAttribute('aria-pressed', String(saved));
  byId('bookmark-label').textContent = saved ? 'Place saved' : 'Save place';
}
function renderSelection() {
  viewer?.setSelection(selectedId);
  for (const [id, node] of labelNodes) node.classList.toggle('is-selected', id === selectedId);
  renderProjectedLabels(); renderPlace(); renderPanel();
}
function renderProjectedLabels() {
  for (const node of labelNodes.values()) node.hidden = true;
  if (!labels) return;
  const priority = place => place.id === selectedId ? 0 : TOUR_STOPS.includes(place.id) ? 1 : place.type === 'city' ? 2 : place.type === 'castle' ? 3 : 4;
  const candidates = projectedPlaces.filter(point => point.visible && Number.isFinite(point.x) && Number.isFinite(point.y) && labelNodes.has(point.id))
    .map(point => ({ ...point, place: getPlace(point.id) }))
    .sort((a, b) => priority(a.place) - priority(b.place) || a.id.localeCompare(b.id));
  const occupied = [];
  for (const point of candidates) {
    const selected = point.id === selectedId;
    // Conservative CSS-pixel text bounds; this hides names, never scene markers.
    const width = point.place.name.length * (selected ? 7 : 6.5) + (selected ? 22 : 8);
    const height = selected ? 30 : 18;
    const bounds = { left: point.x - width / 2 - 4, right: point.x + width / 2 + 4, top: point.y - 12 - height - 4, bottom: point.y - 8 };
    if (occupied.some(other => bounds.left < other.right && bounds.right > other.left && bounds.top < other.bottom && bounds.bottom > other.top)) continue;
    const node = labelNodes.get(point.id); node.hidden = false;
    node.style.transform = `translate(${Math.round(point.x)}px,${Math.round(point.y)}px)`;
    occupied.push(bounds);
  }
}
function showPlace(id, { fly = false, focus = false, fromTour = false } = {}) {
  if (disposed || !getPlace(id)) return;
  if (!fromTour) stopTour();
  selectedId = id; panel = 'detail'; sheetExpanded = true; renderSelection();
  if (fly && viewerState === 'ready') viewer?.focusPlace(id, { animate: !reducedMotion.matches });
  persistView();
  if (focus) byId('place-title').focus({ preventScroll: true });
}
function changeBookmark(id) {
  if (disposed || !getPlace(id)) return;
  stopTour();
  const removing = bookmarks.includes(id);
  if (!removing && bookmarks.length >= MAX_BOOKMARKS) { announce(`You have saved ${MAX_BOOKMARKS} places. Remove one to make room for another.`); return; }
  bookmarks = normalizeBookmarks(removing ? bookmarks.filter(value => value !== id) : [...bookmarks, id]);
  storageAvailable = writeBookmarks(storage, bookmarks);
  renderBookmarks(); renderPlace(); renderPanel();
  announce(`${getPlace(id).name} ${removing ? 'removed from' : 'added to'} your saved places.${storageAvailable ? '' : ' Kept for this visit; device storage is unavailable.'}`);
}
function stopTour() {
  tourGeneration++; clearTimeout(tourTimer); tourTimer = undefined;
  if (!tourRunning) return;
  tourRunning = false; updateControls();
}
function visitTourStop(generation) {
  if (generation !== tourGeneration || !tourRunning || !active() || viewerState !== 'ready' || reducedMotion.matches) { stopTour(); return; }
  showPlace(TOUR_STOPS[tourIndex], { fly: true, fromTour: true }); updateControls();
  tourTimer = setTimeout(() => { if (generation !== tourGeneration) return; tourIndex = (tourIndex + 1) % TOUR_STOPS.length; visitTourStop(generation); }, 6500);
}
function toggleTour() {
  if (disposed) return;
  if (tourRunning) { stopTour(); return; }
  if (!active() || viewerState !== 'ready' || reducedMotion.matches || !TOUR_STOPS.length) return;
  tourRunning = true; tourIndex = 0; const generation = ++tourGeneration; visitTourStop(generation);
}
function updateLayers() {
  viewer?.setLayers({ terrain, labels, categories: [...categories] });
  if (!labels) for (const node of labelNodes.values()) node.hidden = true;
}
function navigate(delta) {
  if (disposed || viewerState !== 'ready') return;
  stopTour(); viewer?.navigate(delta);
}
function home(nextRegion = region) {
  if (disposed) return;
  stopTour(); region = nextRegion; selectedId = null; panel = 'catalog';
  for (const button of document.querySelectorAll('[data-region]')) button.setAttribute('aria-pressed', String(button.dataset.region === region));
  renderSearch(); renderSelection();
  if (viewerState === 'ready') viewer?.home(region, { animate: !reducedMotion.matches });
  persistView();
}
function setStatus({ state, message }) {
  if (disposed) return;
  viewerState = state;
  const ready = state === 'ready'; byId('viewer-status').hidden = ready;
  const titles = { loading: 'Unfolding the atlas', 'context-lost': 'The view is taking a breath', error: 'The 3D view is unavailable' };
  byId('viewer-status-title').textContent = titles[state] || 'The atlas';
  byId('viewer-status-message').textContent = message || (state === 'context-lost' ? 'Your browser paused the graphics view. It will return when the graphics context is restored. You can still browse places.' : state === 'error' ? 'This browser could not open WebGL. Try another browser or reload. The place catalog is still available.' : 'Preparing the coastlines and the shape of the land.');
  byId('retry-view').hidden = state !== 'error' && state !== 'context-lost';
  if (!ready) stopTour();
  updateControls();
}
function updateActivity() {
  if (disposed) return;
  if (!active()) stopTour();
  viewer?.setActive(active());
}
function applyHash() {
  if (disposed) return;
  const state = readViewHash(window.location.hash); stopTour(); applyingHash = true;
  try {
    camera = state.camera; selectedId = state.placeId; terrain = state.terrain; labels = state.labels;
    panel = selectedId ? 'detail' : 'catalog'; if (selectedId) sheetExpanded = true;
    byId('terrain-toggle').checked = terrain; byId('labels-toggle').checked = labels;
    renderSelection(); updateLayers(); viewer?.setCamera(camera, { animate: false });
  } finally { applyingHash = false; }
  persistView();
}
function openDialog(id) {
  if (disposed) return;
  stopTour(); const dialog = byId(id); if (!dialog.open) dialog.showModal();
}
async function copyLink() {
  if (disposed) return;
  const generation = ++shareGeneration, link = byId('share-url').value;
  try {
    if (!window.navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await window.navigator.clipboard.writeText(link);
    if (disposed || generation !== shareGeneration || !byId('share-dialog').open) return;
    byId('share-feedback').textContent = 'This link is copied and ready to share.';
  } catch {
    if (disposed || generation !== shareGeneration || !byId('share-dialog').open) return;
    byId('share-feedback').textContent = 'Select and copy the link above with your browser’s copy command.';
    byId('share-url').focus(); byId('share-url').select();
  }
}

for (const place of PLACES) {
  const node = document.createElement('span'); node.className = 'place-label'; node.dataset.type = place.type; node.hidden = true;
  const text = document.createElement('span'); text.textContent = place.name; node.append(text);
  labelNodes.set(place.id, node); byId('map-labels').append(node);
}
for (const category of CATEGORIES) {
  const label = document.createElement('label'), input = document.createElement('input'), text = document.createElement('span');
  input.type = 'checkbox'; input.checked = true; input.value = category.id; text.textContent = category.label;
  input.addEventListener('change', () => { if (disposed) return; stopTour(); if (input.checked) categories.add(category.id); else categories.delete(category.id); renderSearch(); updateLayers(); });
  label.append(input, text); byId('category-filters').append(label);
}
byId('terrain-toggle').checked = terrain; byId('labels-toggle').checked = labels;
renderSearch(); renderBookmarks(); renderSelection(); updateControls();

try {
  viewer = createViewer(canvas, {
    onCamera(next, { settled } = {}) {
      if (disposed) return; camera = normalizeCamera(next);
      byId('compass-needle').style.transform = `rotate(${-camera.yaw}rad)`;
      byId('bearing').textContent = `${String(Math.round((camera.yaw * 180 / Math.PI + 360) % 360) % 360).padStart(3, '0')}°`;
      if (settled) persistView();
    },
    onPick(id) {
      if (disposed) return;
      if (id) { showPlace(id); return; }
      stopTour(); selectedId = null; panel = 'catalog'; renderSelection(); persistView();
    },
    onStatus: setStatus,
    onProject(points) {
      if (disposed) return;
      projectedPlaces = points; renderProjectedLabels();
    },
    onInteraction: stopTour,
  });
  viewer.setReducedMotion(reducedMotion.matches); viewer.setCamera(initial.camera, { animate: false }); viewer.setSelection(selectedId); updateLayers(); updateActivity();
} catch { setStatus({ state: 'error', message: 'The browser could not initialize the 3D map. Reload or try a WebGL-capable browser. You can still search and save places.' }); }
initializing = false; persistView();

byId('skip-search').addEventListener('click', event => { event.preventDefault(); if (disposed) return; stopTour(); panel = 'catalog'; sheetExpanded = true; renderPanel(); byId('place-search').focus({ preventScroll: true }); });
byId('sheet-toggle').addEventListener('click', () => { if (disposed) return; stopTour(); sheetExpanded = !sheetExpanded; renderSheet(); });
byId('places-tab').addEventListener('click', () => { if (disposed) return; stopTour(); panel = 'catalog'; sheetExpanded = true; renderPanel(); });
byId('saved-tab').addEventListener('click', () => { if (disposed) return; stopTour(); panel = 'bookmarks'; sheetExpanded = true; renderPanel(); });
byId('place-search').addEventListener('input', () => { if (disposed) return; stopTour(); renderSearch(); });
byId('search-form').addEventListener('submit', event => { event.preventDefault(); if (results[0]) showPlace(results[0].id, { fly: true, focus: true }); });
byId('clear-search').addEventListener('click', () => { if (disposed) return; stopTour(); byId('place-search').value = ''; renderSearch(); byId('place-search').focus(); });
byId('close-place').addEventListener('click', () => { if (disposed) return; stopTour(); selectedId = null; panel = 'catalog'; renderSelection(); persistView(); byId('place-search').focus({ preventScroll: true }); });
byId('bookmark-place').addEventListener('click', () => changeBookmark(selectedId));
byId('fly-to').addEventListener('click', () => { if (selectedId) showPlace(selectedId, { fly: true }); });
for (const button of document.querySelectorAll('[data-region]')) button.addEventListener('click', () => home(button.dataset.region));
for (const [id, delta] of Object.entries({ 'zoom-in': { zoom: .22 }, 'zoom-out': { zoom: -.22 }, 'orbit-left': { orbit: -.22 }, 'orbit-right': { orbit: .22 }, 'tilt-up': { tilt: .12 }, 'tilt-down': { tilt: -.12 } })) byId(id).addEventListener('click', () => navigate(delta));
byId('north-up').addEventListener('click', () => { if (disposed || viewerState !== 'ready') return; stopTour(); viewer?.setCamera({ ...viewer.getCamera(), yaw: 0 }, { animate: !reducedMotion.matches }); });
byId('home-view').addEventListener('click', () => home());
byId('tour-toggle').addEventListener('click', toggleTour);
byId('terrain-toggle').addEventListener('change', () => { if (disposed) return; stopTour(); terrain = byId('terrain-toggle').checked; updateLayers(); persistView(); });
byId('labels-toggle').addEventListener('change', () => { if (disposed) return; stopTour(); labels = byId('labels-toggle').checked; updateLayers(); persistView(); });
byId('layers-panel').addEventListener('toggle', () => { if (byId('layers-panel').open) stopTour(); });
byId('help-button').addEventListener('click', () => openDialog('controls-dialog'));
for (const id of ['about-button', 'panel-about', 'credits-button']) byId(id).addEventListener('click', () => openDialog('about-dialog'));
for (const [button, dialog] of [['close-controls', 'controls-dialog'], ['close-about', 'about-dialog'], ['close-share', 'share-dialog']]) byId(button).addEventListener('click', () => byId(dialog).close());
byId('share-dialog').addEventListener('close', () => { shareGeneration++; });
byId('focus-map').addEventListener('click', () => { byId('controls-dialog').close(); canvas.focus({ preventScroll: true }); });
byId('share-view').addEventListener('click', () => { if (disposed) return; persistView(); const link = new URL(window.location.href); link.hash = writeViewHash({ camera, placeId: selectedId, terrain, labels }); byId('share-url').value = link.href; byId('share-feedback').textContent = 'Copy this link to share the view.'; openDialog('share-dialog'); void copyLink(); });
byId('copy-link').addEventListener('click', () => { void copyLink(); });
byId('retry-view').addEventListener('click', () => { if (!disposed) window.location.reload(); });
window.addEventListener('hashchange', applyHash);
document.addEventListener('visibilitychange', updateActivity);
window.addEventListener('blur', () => { windowFocused = false; updateActivity(); });
window.addEventListener('focus', () => { windowFocused = true; updateActivity(); });
window.addEventListener('pagehide', event => { if (disposed) return; pageActive = false; stopTour(); updateActivity(); if (!event.persisted) { disposed = true; shareGeneration++; clearTimeout(noticeTimer); viewer?.destroy(); updateControls(); } });
window.addEventListener('pageshow', event => { if (event.persisted && !disposed) { pageActive = true; updateActivity(); viewer?.resize(); } });
reducedMotion.addEventListener('change', () => { if (disposed) return; if (reducedMotion.matches) stopTour(); viewer?.setReducedMotion(reducedMotion.matches); updateControls(); });
narrowScreen.addEventListener('change', () => { if (disposed) return; if (!narrowScreen.matches) sheetExpanded = true; renderSheet(); });
