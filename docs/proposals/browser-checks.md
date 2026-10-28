# Focused published-browser acceptance

Status: prepared for explicit owner approval under the supplied AGENTS.md §7.
No browser/dev-server execution is authorized by this document alone. Source
implementation, authored checks and exact hosted delivery have separate evidence.

## Scope

Use the published atlas in the connected browser. Inspect desktop and a narrow
viewport where supported. Budget: approximately 20 minutes, with no account,
backend, model call, paid service, dependency installation or CI change.

1. Confirm an actual rendered 3D height scene, both continent viewpoints and
   visible depth/relief under orbit/tilt. Check for browser/graphics errors.
2. Exercise drag/pan, zoom, orbit, tilt, north-up and reset. Use canvas keyboard
   controls, and supported native touch/pinch/twist input when available. Ensure
   typing in search does not move the camera.
3. Search Westeros and Essos places; filter categories; select list results and
   rendered markers; confirm matching detail, camera and selected highlight.
   Check label spacing and usable controls with the narrow exploration sheet.
4. Add disposable bookmarks through the UI, reload and remove only the added
   entries. First inspect the visible saved list; preserve existing user entries.
   Verify the shared URL restores the selected place, camera and layer choices;
   clipboard refusal must retain a selectable link.
5. Check tour interruption on manual input, hide/blur and navigation; verify
   reduced-motion behavior if the browser exposes that setting safely. Confirm
   back/forward navigation retains coherent view and selection.
6. Inspect loading/error/context recovery only through supported browser
   capabilities. Ensure textual exploration remains available on graphics
   failure. Do not bypass the browser tool's evaluation/permission boundaries.

Capture bounded screenshots and observations with exact source/deployment and
viewport bindings. Do not inspect browser cookies, session stores or raw browser
storage. Use the atlas UI and visible links. Clean only task-created tabs and
bookmark fixtures; preserve unrelated tabs, browser data and accounts. The share
check may copy the atlas's public view URL to the clipboard.

If a capability is unavailable, record the missing proof precisely. Desktop
input at a narrow width does not prove native touch; authored WebGL loss mocks
do not prove native restoration. Request a concrete separate check scope if
additional tooling is needed. No completion claim rests on absent coverage.
