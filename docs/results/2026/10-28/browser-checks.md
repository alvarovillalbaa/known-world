# Approved live browser checks

28 October 2026. Status: the supported focused checks are complete, with the
capability gaps below. Alvaro explicitly answered **“Approve Known World browser
checks”** for the [immutable proposal](https://github.com/alvarovillalbaa/known-world/blob/b1403f1e1485e623e3b2e69a04803e8dea8e91ce/docs/proposals/browser-checks.md)
under the supplied AGENTS.md §7. Checks used the canonical
[atlas](https://known-world-alvaro.vercel.app) in connected Chrome. No account,
installation, dependency/CI/configuration change, backend/model call or paid
service was used. The all-project goal remains active.

## Source and rendered fixes

The initial Chrome task tab opened the atlas directly without a login page at
documentation source `26d620cf2a201bbd0534b853d6abcc1ab1c84655`, whose runtime
was `b1403f1e1485e623e3b2e69a04803e8dea8e91ce`. Native WebGL drew both
continents, relief, labels and markers. The initial saved list contained zero
entries. This connected browser session does not establish clean anonymous access.

The 1440×900 [before image](screenshots/desktop-before-fog.jpg) exposed a
rectangular ocean seam around the terrain grid. The coarse water plane computed
and clamped fog at its distant corner vertices, unlike the finer terrain grid.
This defect was absent from the authored command/geometry proof.

Source [409299e7e999537db3bb531cce9ea4a8a1d20494](https://github.com/alvarovillalbaa/known-world/commit/409299e7e999537db3bb531cce9ea4a8a1d20494)
moved fog to the interpolated fragment world position and normalized distance
before `length()` to bound mediump intermediates. All **101 focused frontend
cases** and the source checker passed after the change. Exact-source deployment
`dpl_AZSEnPTSkiYCdoAvZHVWyv1ectXw` reached `READY`. A native reload and the
same-camera 1440×900 [after image](screenshots/desktop-after-fog.jpg) confirmed
that the shader renders and the rectangular seam is gone.

Narrow accessibility inspection then found Help and Share controls unnamed when
their visible text was hidden. Source
[78f0e8cb072b48868b070abff915283f04bfb61e](https://github.com/alvarovillalbaa/known-world/commit/78f0e8cb072b48868b070abff915283f04bfb61e)
adds two explicit HTML accessible names. Source checks passed; the fresh native
tab exposed **How to explore** and **Share view** at narrow width. Deployment
`dpl_6VH81frcWAeCyxpdpat6N2UUc6AU` reached `READY` at that exact source.
The runtime modules, styles and test files did not change in this HTML follow-up.

| Final changed artifact | SHA-256 at `78f0e8c` |
| --- | --- |
| `public/src/viewer.js` | `06da826bee47c6d66fb14af844b9402ad85aaada686be21188e7880c7961a78e` |
| `public/index.html` | `a444724453d4351fa66d1ffd2975f2dd4f8113d16cc677d1b68327ea919fd684` |

The other six public artifact hashes remain those frozen in the
[initial receipt](initial-delivery.md). Final receipt publication changes only
documentation and screenshot evidence.

## Native observations

| Check | Observed result |
| --- | --- |
| Viewpoints and depth | Essos showed its 24-place catalog and moved to `(137,40,315,0,1.08)`; The world returned to `(74,8,430,0,1.08)`. Orbit/tilt changed the actual perspective relief. Camera tuples are `(x,z,distance,yaw,pitch)`. |
| Navigation | Zoom/orbit/tilt reached distance `345.08`, yaw `0.22`, pitch `0.96`. Pointer drag changed camera position to `(46.71,-5.63)`; focused-map Right moved it to `(61.86,-9.02)`. |
| Search and result selection | Typing Winterfell left the camera unchanged and returned one castle. Selecting it restored matching details and camera `(-70,-72,68,0.22,0.85)`. |
| Filters and empty state | Disabling Castles while querying Winterfell yielded zero places and the empty message. Restoring Castles and searching Braavos yielded one city; Enter selected its geography and camera `(8,-20,68,0.22,0.85)`. |
| Rendered marker picking | A desktop click on the visible Lorath marker selected Lorath with matching details, while preserving the Braavos camera. This exercised the actual rendered marker. |
| Bookmark persistence | Starting from Saved 0, added only Winterfell through the UI. Reload retained Saved 1, selection and camera. Removed that owned entry through Saved; the fresh shared-link tab confirmed Saved 0. |
| Shared view | Share displayed `#v=1&x=-70&z=-72&d=68&yaw=0.22&pitch=0.85&place=winterfell` and reported copied. A fresh tab at that exact displayed URL restored Winterfell and the camera, without a bookmark. No OS clipboard readback was performed. |
| Layers | Native controls set `terrain=0&labels=0`; the scene visibly flattened and geographic labels disappeared while markers remained. Restored both layers, removing those flags. |
| Tour interruption | The journey advanced through The Wall, Winterfell and King's Landing. Manual Zoom stopped it. Same-tab navigation to a blank page and Back restored a coherent prior camera/selection/layer URL with the journey off. This does not distinguish BFCache from ordinary restoration. |
| Narrow layout | At 390×844, selected Winterfell remained visible above the scrolling detail sheet and camera controls. At 390×568, compact controls and the selected scene remained visible. Latest HTML exposed the two repaired accessible names. These were desktop viewport overrides. |
| Error inspection | The final inspected app-origin error log window was empty; no app error panel appeared during successful scene checks. This is a bounded log observation. |

One Westeros mouse-action acknowledgement timed out after its selected state and
24-place catalog appeared; its camera transition is not counted. A narrow marker
attempt also lacked confirmed selection; the later successful desktop marker
check supplies that proof. A browser-control timeout required reconnecting to the
same task tabs. These are tooling limits, not asserted application failures.
Opening a blank helper tab did not establish visibility change and is not counted
as hide/blur proof. No unsupported browser evaluation or raw storage inspection
was used to manufacture lifecycle results.

## Screenshots and cleanup

All images are unedited browser captures; their extensions reflect the JPEG
bytes returned by the browser tool.

| Capture | Viewport | Source |
| --- | --- | --- |
| [Before fog fix](screenshots/desktop-before-fog.jpg) | 1440×900 | `26d620c`, initial runtime `b1403f1` |
| [After fog fix](screenshots/desktop-after-fog.jpg) | 1440×900 | `409299e` |
| [Winterfell narrow](screenshots/narrow-winterfell.jpg) | 390×844 | `409299e` |
| [Short narrow layout](screenshots/narrow-short.jpg) | 390×568 | `78f0e8c` |
| [Final atlas](screenshots/desktop-final.jpg) | 1440×756 | `78f0e8c` |

The final tab has an empty query, 48 places, Saved 0, no selected place, both
layers on, the journey off and the default world camera. The temporary viewport
override was reset. Only the old task atlas tab and blank helper were closed;
the final atlas tab remains marked as the deliverable. Unrelated tabs, accounts
and browser data were preserved. No disposable bookmark remains.

## Published evidence checkpoint

Personal `main` matched `b9b37b39698ed117e0675c4bdbbca7dfa812eaa9` exactly.
Immutable GitHub readback matched all nine changed documentation/image blobs,
including the byte-preserving before-image rename. Canonical Vercel lookup
resolved to `READY` deployment `dpl_hQDxMdex3tAjEGXh7xnRSpCgkVxH` at that exact
commit. Connected GETs returned 200 and the expected MIME types for all eight
public assets; every complete body matched its checked immutable source. The
native captures above bind to runtime `78f0e8c`, unchanged by this documentation
publication. This checkpoint records delivery, not additional browser acceptance.

## Remaining proof limits

Native phone touch/pinch/twist, reduced-motion emulation, graphics-context
loss/restoration and a clean anonymous browser context were not supported by the
available browser capabilities. Authored tests cover corresponding source paths,
but do not establish those native outcomes. Exact OS clipboard contents and
clipboard-refusal fallback were not verified. Native hide/blur behavior, a
specific BFCache mechanism, device/GPU breadth and performance remain unverified.
Connected hosted GETs and this existing Chrome session are not independent
anonymous-access proof. No protection or account configuration was changed.
