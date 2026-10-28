# Native module contract

Coordinates are atlas units: **x east, z south, y up**. Bounds are
`{minX:-120,maxX:280,minZ:-140,maxZ:150}`. Positions/relief are original
stylizations. Camera `{x,z,distance,yaw,pitch}` targets the terrain at x/z;
yaw zero views from the south with north at the top. Pitch is elevation above
ground, in radians. Every module uses native ESM; there is no framework/build step.

## `world.js` — cartography and catalog

- `WORLD_BOUNDS`: the bounds above.
- `LANDMASSES`: `{id,name,continent,ring:[[x,z],...]}`; continents are
  `westeros` or `essos`.
- `PLACES`: `{id,name,type,continent,x,z,description,source}`. Types are
  `city`, `castle`, `landmark`. Descriptions are original, geographic text.
- `CATEGORIES`: `[{id,label}]` for the three types.
- `REGION_VIEWS`: `all`, `westeros`, `essos` camera presets.
- `TOUR_STOPS`: existing place IDs; includes stops on both continents.
- `getPlace(id)`: a known place or null.
- `findPlaces(query,{continent='all',categories})`: case-insensitive catalog
  search; omitted categories allows all, an empty array allows none.
- `sampleTerrain(x,z,relief=true)`: `{height,color:[r,g,b],land:boolean}` with
  finite height, normalized RGB and sea at height zero. Relief is deterministic.
  Disabling relief flattens land while preserving geographic/color identity.

Keep external source/provenance choices and notices in `docs/attribution.md`.
No external artwork, geometry or tiles may be silently imported.

## `view-state.js` — pure bounds, URL and bookmarks

- `DEFAULT_CAMERA`, `CAMERA_LIMITS`, `normalizeCamera(value)`.
  Limits: distance 28–580, pitch 0.28–1.42; x/z within world bounds, yaw wraps
  to [-π,π]. Invalid components fall back to the default camera.
- `readViewHash(hash)` -> `{camera,placeId,terrain,labels}`; invalid place IDs
  become null. Missing state uses default presets; a place-only hash centers it.
- `writeViewHash({camera,placeId,terrain,labels})` -> canonical `#v=1&...` string.
  Keys are `x,z,d,yaw,pitch,place,terrain,labels`. Parse untrusted input defensively.
- `MAX_BOOKMARKS=64`, `normalizeBookmarks(ids)`,
  `loadBookmarks(storage)` -> `{ids,available}`,
  `writeBookmarks(storage,ids)` -> boolean. Only known IDs are retained, with
  no duplicates. The sole key is `known-world.bookmarks.v1`.
  A malformed existing saved list is retained; new bookmarks remain in-tab
  instead of overwriting unread device data.

## `geo.js`, `viewer.js` — scene, camera and browser input

`geo.js` owns pure vector/matrix, bounded navigation, projection/picking and mesh
helpers. `viewer.js` exports:

```js
createViewer(canvas, {
  onCamera(camera, { settled }),
  onPick(placeIdOrNull),
  onStatus({ state, message }), // loading | ready | context-lost | error
  onProject([{ id, x, y, visible }]),
  onInteraction(), // direct canvas input; cancels an app tour
})
```

It returns:

```js
{
  getCamera(), setCamera(camera, { animate = false }),
  setSelection(placeIdOrNull), // highlight only; preserves the current camera
  focusPlace(id, { animate = true }), home(region, { animate = true }),
  setLayers({ terrain, labels, categories }),
  navigate({ zoom = 0, orbit = 0, tilt = 0, panX = 0, panZ = 0 }),
  setActive(active), setReducedMotion(reduced), resize(), destroy(),
}
```

Navigation deltas are normalized: positive zoom approaches (distance scaled by
`exp(-zoom)`), orbit/tilt are radians, panX/panZ are screen-relative map movement
in atlas units, with yaw applied by the viewer. The viewer owns pointer, wheel
and keyboard handlers on the canvas, projection and pick consistency, bounded
DPR/resolution, WebGL initialization, context loss/restoration and resource
cleanup. It emits projected coordinates in **CSS pixels** for DOM labels and
renders selectable place markers from the same catalog/category filters.

Canvas gestures: drag to pan; shift-drag/right-drag to orbit/tilt; wheel to zoom;
two touch pointers pinch/twist to zoom/orbit. Keyboard while canvas-focused:
arrows pan, +/- zoom, Q/E orbit, W/S tilt, Home reset. Prevent only handled input.
Keyboard repeat can supply repeated bounded steps; hide/blur/pointer cancellation
clears gesture state. No global shortcut may consume typing in search fields.

Callbacks may run during creation; app callbacks must not dereference an
unassigned viewer. Hidden/inactive or lost-context scenes cancel animation and
gestures. Restoration rebuilds resources without duplicating listeners. Reduced
motion makes flight transitions immediate. Destroy is terminal/idempotent.

## `app.js`, HTML and CSS — atlas experience

The app owns DOM search/results/details, filters, explicit navigation buttons,
bookmarks, tour scheduling and URL state. The viewer owns scene math; the app
never derives separate marker coordinates. Manual input stops tours; hide/blur,
context loss and reduced motion stop/disable automatic motion. URL writes occur
for settled/clamped views and must not create a hash callback loop.

Share uses the current URL; clipboard failure exposes selectable link text.
Storage failure preserves in-tab bookmarks and visible feedback. Context/error
states retain the textual geographic catalog. Narrow screens use one exploration
sheet so list/detail/bookmarks do not cover each other. All controls are keyboard
reachable, labelled, visibly focused and at least 44px in their primary dimension.
