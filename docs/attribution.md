# Cartography, sources and attribution

## Assets used

The coastline control points, island outlines, atlas coordinates, procedural
terrain, colors and geographic summaries in
[`world.js`](../public/src/world.js) were authored for this application on
28 October 2026. They were not traced, extracted or converted from another
map. No third-party map image, tile pyramid, coordinate dataset, heightmap,
3D model, portrait, heraldic artwork or wiki prose is distributed by this atlas.
The terrain algorithm uses fixed-seed mathematical noise and original ridge
segments rather than measured elevations.

Westeros, Essos and the fictional locations originate in George R. R. Martin’s
*A Song of Ice and Fire*. *Game of Thrones* is associated with HBO. This is an
unofficial fan atlas, without endorsement or affiliation. Original drawing and
implementation do not transfer ownership of the underlying fictional setting.

## Geographic reading and accuracy

The catalog’s `source` links lead to the relevant **A Wiki of Ice and Fire**
entries as references for readers. Names and broad geographic relationships were
checked against its [Westeros](https://awoiaf.westeros.org/index.php/Westeros),
[Essos](https://awoiaf.westeros.org/index.php/Essos) and
[Free Cities](https://awoiaf.westeros.org/index.php/Free_Cities) overviews, with
additional references for
[Dragonstone](https://awoiaf.westeros.org/index.php/Dragonstone),
[Dorne](https://awoiaf.westeros.org/index.php/Dorne),
[the Reach](https://awoiaf.westeros.org/index.php/Reach),
[the stormlands](https://awoiaf.westeros.org/index.php/Stormlands),
[Slaver’s Bay](https://awoiaf.westeros.org/index.php/Slaver%27s_Bay) and
[Yi Ti](https://awoiaf.westeros.org/index.php/Yi_Ti). These pages were retrieved
on 28 October 2026. Individual catalog links are reader references, not a claim
that every linked article was separately reviewed. Summaries are newly written
geographic descriptions; character journeys and plot timelines are omitted.

This is a curated, stylized regional atlas of **48 places**, not an official or
complete map of the fictional planet. Coordinates are approximate atlas units:
x increases east and z increases south. They are not degrees, miles or a
georeferenced projection. Islands are enlarged for exploration; coastlines,
distances, bays and passes are simplified. The northern and eastern limits are
an illustration’s bounds, not a claim that the fictional continents end there.
The Stepstones are grouped with Essos for this atlas’s two-continent filter.
Procedural mountains, colors and all height values are an artistic interpretation,
not canonical topography, climate measurements or navigational evidence.

## Reference maps reviewed, not imported

The supplied reference is [Quartermaester](https://quartermaester.info/), which
credits its map drawing to **theMountainGoat**, based on **Tear**’s work, and
warns that parts differ from the official *The Lands of Ice and Fire* maps.
Its [source repository](https://github.com/carpiediem/game-of-thrones-map/tree/256beaa4189f3a4db90897fb5ec01b55d73baaf2)
has an [MIT software license](https://github.com/carpiediem/game-of-thrones-map/blob/256beaa4189f3a4db90897fb5ec01b55d73baaf2/LICENSE),
copyright 2016 Ryan Carpenter. That software notice is not treated as permission
to redistribute the separately credited map artwork. No code or data from that
repository was incorporated here.

Three potential geography sources were reviewed:

| Candidate | Evidence and reuse boundary | Decision |
| --- | --- | --- |
| [theMountainGoat’s speculative world map](https://www.sermountaingoat.co.uk/map/) | The creator permits noncommercial fan remix under Creative Commons; the exact license notice/version is embedded in the artwork and was not verified here. The page identifies speculative eastern geography and gives a 27 February 2012 map version. Raster variants and a Google Earth overlay are offered, not a measured terrain dataset. | No artwork, tiles or overlay imported. |
| [Abjiklam’s Known World — Coordinates SVG](https://awoiaf.westeros.org/index.php/File:The_Known_World_-_Coordinates.svg) | The file page declares own work by Abjiklam, drawing on official geographic sources, under **CC BY-NC-SA 4.0**. Its derived [Location map Known world SVG](https://awoiaf.westeros.org/index.php/File:Location_map_Known_world.svg) instead carries a **CC BY-SA 3.0** tag; that metadata conflict was not resolved. Neither is an elevation model. | No SVG or coordinate data imported; the derivative’s tag is not assumed to resolve its source terms. |
| [Meshal2013/known-world-atlas](https://github.com/Meshal2013/known-world-atlas) | Its README describes original coarse vector outlines and generated terrain symbols. On the retrieval date, its root had no license file, package metadata supplied no license grant, and GitHub reported `license: null`. Public source and an originality claim alone do not establish reuse permission. | No code, geometry or catalog imported. |

For any later use of Abjiklam’s explicitly licensed source map, retain the
creator credit and source link, link the
[CC BY-NC-SA 4.0 terms](https://creativecommons.org/licenses/by-nc-sa/4.0/),
identify modifications, keep the use noncommercial and distribute the adapted
map under those terms. That conditional path was not used for this release.
Any future imported asset needs its own pinned source, applicable permission,
modification record and required notices before redistribution.
