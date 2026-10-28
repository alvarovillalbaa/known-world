# The Known World initial source delivery

28 October 2026. Status: implementation and 101 focused frontend checks passed;
GitHub source and Vercel publication readback are pending. Native browser
acceptance remains unverified. The all-project goal is active.

The [source brief](../../../spec.md) preserves the standalone Notion requirement:
a 3D Westeros and Essos map with a Google Earth-like exploration experience and
the supplied Quartermaester reference. This is a new dedicated personal project,
not a renamed earlier application or a flat-map fallback.

## Implementation

Native WebGL renders perspective terrain, water and catalog markers, with depth,
directional lighting and fog. The original regional height mesh contains 27,985
vertices and 55,296 triangles within a 16-bit index budget. Its 19 authored
landmasses and 48 curated places cover both continents. Camera, CSS-pixel label
projection and picking use the same geometry; close camera poses clear adjacent
relief. Adaptive projection keeps the home viewpoints useful on portrait screens.
Drawing buffers cap DPR at two, dimensions at 4,096 and area at two million pixels.

The atlas includes pointer/keyboard/two-pointer navigation, continent views,
search/type filters, geographic details, selection highlight, label spacing,
terrain/label layers, eight tour stops, local bookmarks and shareable views.
Selected labels receive priority. A narrow exploration sheet retains internal
scrolling and explicit camera controls. The public About dialog explains
original cartography, approximate coordinates, procedural relief and references.

Manual input, hide/blur and reduced motion stop automatic travel. Timers and
animation frames carry ownership so obsolete callbacks cannot restart movement.
WebGL loss retains view/selection, hides stale labels and rebuilds resources on
restoration. Partial initialization failure releases its owned GPU objects;
terminal departure disposes the renderer. A graphics failure retains textual
search/details and in-tab bookmarks. Shared selection stays synchronized without
overwriting its camera. Initial unread bookmark storage remains untouched even
if reads later recover; new bookmarks stay in memory for that visit. The sole
storage key is `known-world.bookmarks.v1`; unrelated browser storage is preserved.

No framework/runtime dependency, account, database, external tile/artwork/API,
analytics, model call, paid plan or CI workflow was added. The [attribution
record](../../../attribution.md) distinguishes reviewed maps from the original
geometry actually shipped. No external geometry, artwork, wiki prose or code
was imported. Source architecture and API ownership are in the [module
contract](../../../module-contract.md).

## Focused evidence

The same repository shell recorded Node `v24.21.0` and its executable before:

```sh
npm test
npm run check
git diff --check
```

**101 cases passed, zero failures/skips/cancellations**:

| File | Cases | Evidence boundary |
| --- | ---: | --- |
| `world.test.js` | 12 | Independent polygon winding, geographic membership/order, simple rings, sea channels, deterministic terrain, filters and immutability |
| `view-state.test.js` | 15 | Finite camera bounds, stable versioned URLs, validated selections and owner-key bookmark failure handling |
| `geo.test.js` | 17 | Real mesh/matrices, projection/rays/triangle picking, camera clearance, responsive fits and bounded GPU arrays |
| `viewer.test.js` | 16 | Actual viewer with authored WebGL/event/RAF boundaries: drawing commands, pointers, selection, loss/restore, allocation failure, timers and cleanup |
| `app.test.js` | 41 | Complete actual app with controlled platform/viewer boundaries: catalog, selection, hash/share, label snapshots/spacing, tours, storage and lifecycle |

Pure projection checks fit all 48 catalog positions in All home at 390×844,
and each continent's places in its own home at 390×844 and 1440×900. These are
mathematical frustum checks, not screenshots or proof that UI chrome leaves
every projected point unobscured. The actual geometry sampling and GPU command
boundaries do not establish native shader compilation or signal the presence of
a working browser graphics device.

During implementation, identical app harnesses exposed the six selection/label
integration failures in their pre-fix source (29 pass / 6 fail, 35-case stage),
five label-spacing failures in its prior source (35 pass / 5 fail, 40-case stage),
and the unread-storage guard regression (40 pass / 1 fail, final 41-case harness).
Earlier targeted mutations also established camera initialization, clipboard,
tour timer and label-layer sensitivity. These are scoped development receipts,
not a claim that every final test ran unchanged against one earlier release.
All failures were ordinary assertions; owned temporary copies were removed.

The source checker passed five native modules, five frontend test files,
syntax/imports, 75 unique DOM IDs, public assets and the provenance record.
Storage Guard measured 14.4 GiB free versus 34.0 GiB required. No local package
install, application build, test database or dev server ran.

| Frozen runtime artifact | SHA-256 |
| --- | --- |
| `app.js` | `b710cc8b8cd9edffa67a2bb9f2ed7fbe5fd833b5cd9479764d2fdd083120dd08` |
| `geo.js` | `8d64e90ba4f78cc30ed37708eb96aef1215f44a1908ffeeff6b9707ae3146abc` |
| `view-state.js` | `a640b697e57995b577aa34a06b7b67732f51c51af22b634157c0cec3100eab40` |
| `viewer.js` | `64def82cf53e7df8cd70c1ceae3b489daebeef7c93ff15b0cdf0cdec6540ecfb` |
| `world.js` | `d767e4b8137d85b754265062095948153b76ef71bc7991d9659a7d4651b894e0` |
| HTML | `9fb6e6328642804e775c209d564726285b37b808f20ab3fcea5d8e2719a308de` |
| CSS | `c984bdb3af9c62ef8349df44944e1b4e10f80e8c7eff45fc1698f7af6190aca7` |
| Icon | `8767a9302ddaff8efb697719f4fd7c668569e9904ae390a1e5839aac344c981d` |

## Remaining acceptance

Actual desktop/mobile rendering, geographic recognizability, control layout,
native touch, WebGL/shader loss/restoration, clipboard, browser storage/cache
lifecycle and performance remain unverified. Hosted bytes are publication proof.
The concrete [browser proposal](../../../proposals/browser-checks.md) awaits owner
approval under the supplied AGENTS.md §7. This source release does not complete
the application acceptance or the wider all-project goal.
