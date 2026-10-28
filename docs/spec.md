# The Known World product contract

Source: [Alvaro's personal parent](https://app.notion.com/p/311a1ee8bd06805caa21c5306dd315ac),
fetched on 28 October 2026. The returned snapshot is dated
`2026-10-27T08:34:42.323Z`, last edited `08:34:38.673Z`. Its three omitted blocks
are in other sections; this final project section is present in full:

> 3d westeros and essos map 🔴
>
> Like google earth for GoT
>
> https://quartermaester.info/

This is a standalone project outside New and Explore — Focus. The red marker is
preserved without assigning it a priority/status meaning. The active user goal
requires each project implemented end to end in a separate personal
`alvarovillalbaa` repository, with Vercel/Supabase where needed.

## Required outcome

A working, navigable **3D** map covering both Westeros and Essos, with the
exploratory character of Google Earth and the supplied fictional-world map
reference. A flat map or a decorative 3D screenshot does not establish that
outcome. Source publication alone does not establish a working rendered viewer.

## Implementation choices

- Name: The Known World; dedicated repository `known-world`. A dependency-free
  browser application with a native WebGL perspective terrain viewer.
- Orbit, pan, zoom and tilt across both continents; controls support pointer,
  touch and keyboard, with reset/home and continent viewpoints.
- Search a curated geographic place catalog, filter landmark kinds, select
  visible markers and fly to the same coordinates used by the terrain/labels.
  Place details describe geography without character/plot timelines.
- Switch terrain presentation and labels; bookmark places on this device and
  share selected place/view through the URL. Device storage is bounded and
  failures are visible without preventing exploration.
- An atlas interface: quiet parchment panels, deep-water map, restrained brass
  controls, readable labels and clear loading/empty/error states. Responsive
  controls must leave the scene usable on narrow screens.
- Preserve map/data provenance and required notices. Reuse requires explicit
  permission. Procedural relief is an interpretation with approximate positions,
  disclosed in the atlas; it is not canonically measured topography.
- No account/database or external tile/API service is needed for this version.
  The map, metadata and rendering source are served together.

## Acceptance and delivery

Pure geometry/state checks must cover geographic ownership, camera bounds,
projection/picking, URL/state validation and data consistency. Source checks must
validate native imports, DOM references, public assets and notices. Actual
desktop/mobile browser acceptance must then prove 3D navigation, both continents,
selection/search, touch/keyboard controls, share/reload, storage failure,
reduced-motion behavior and WebGL/context lifecycle states. Native rendering and
input need actual execution, separate from authored platform boundaries.

The separate personal GitHub repository, immutable source readback, exact-source
Vercel deployment and delivered module bytes establish publication. They do not
substitute for rendered acceptance. Browser execution requires the existing user
verification gate. The wider all-project goal remains active.

Storage Guard on 28 October reports 14.4 GiB free against 34.0 GiB required. No
local dependency installation, application build or test database is planned;
small first-party source authoring and hosted static validation can proceed.
