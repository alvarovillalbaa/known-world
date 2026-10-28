# Approved live browser checks

28 October 2026. Status: owner approval received for the [focused proposal](../../../proposals/browser-checks.md);
checks are in progress. No account, installation, CI change, backend/model call
or paid service is authorized by this scope. The all-project goal remains active.

## Initial native observation

The connected Chrome task tab opened the canonical atlas directly, without a
login page, at documentation source `26d620cf2a201bbd0534b853d6abcc1ab1c84655`
(runtime source `b1403f1e1485e623e3b2e69a04803e8dea8e91ce`). Native WebGL drew
both continents, relief, geographic labels and markers with the atlas UI. The
initial saved list showed zero entries. Access in this connected Chrome session
does not establish a clean anonymous session.

At the explicit 1440×900 desktop viewport, the [before image](screenshots/desktop-before-fog.png)
exposed a rectangular ocean seam around the terrain grid. The coarse water plane
computed/clamped fog at its far corner vertices, so its entire two-triangle
surface used the sky fog while nearby grid-water vertices did not. This visual
defect was absent from the authored command/geometry proof.

The follow-up shader computes fog from the perspective-interpolated fragment
world position. It normalizes eye distance by the far bound before `length()`
to keep mediump intermediates bounded. Mesh, lighting, uniforms, camera, input
and geographic data are preserved. Source checks and all 101 frontend cases
passed after the change. Native shader compilation and before/after visual
closure still require the deployed follow-up and same-view browser recheck.

Browser automation missed one mouse-response acknowledgement; the next
accessibility snapshot showed the Westeros control selected and its 24-place
catalog. It is not counted as a completed viewpoint transition. No repeated
click was issued. App-origin errors were not established by that timeout.

## Remaining scope

Finish desktop/narrow navigation, selected-place/search/filter behavior, owned
bookmark add/reload/remove, share/restore, interruption and supported lifecycle
checks. Capture final screenshots. Reset the temporary viewport override and
close only task-created tabs. Native touch and graphics loss/restoration require
actual supported tooling; record any capability gap explicitly.
