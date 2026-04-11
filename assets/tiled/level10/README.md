# Level 10 Authored Tile Assets

This folder is the authored source layout for the level 10 Tiled workflow.

Use these directories consistently:

- `tilesets/`
  Contains reusable Tiled tileset definitions such as [level10.tsx](/Users/balazsgalambos/git/flashback-web/assets/tiled/level10/tilesets/level10.tsx:1).
- `tilesets/png/`
  Contains the rendered tile PNGs grouped by semantic family instead of keeping one flat folder.
- `rooms/`
  Contains per-room `.tmx` maps. Each room points at `../tilesets/level10.tsx`.
- `refs/`
  Contains full-room visual references used while authoring.
- `source/xcf/`
  Contains editable GIMP source files.
- `source/rough/`
  Contains rough references and throwaway source material that should not be referenced by `.tmx` or `.tsx`.
- `manifests/`
  Contains human-readable catalogs and naming guidance.
- `project/`
  Contains Tiled project and session files.

## Naming Rules

Prefer names that describe structure before variation:

- `edge`, `passage`, `middle`, `wall`, `platform`, `water`, `transition`
- direction before size: `left-edge-1wide`, `right-passage-up-2wide`
- append variants at the end: `-b`, `-c`, `-with-wall`, `-up`

For new assets, prefer normalized names like these:

- `left-edge-1wide-with-wall.png`
- `middle-rusted-up-2wide-a.png`
- `water-2wide-a.png`
- `floating-platform-broken-2wide-2high.png`

Some legacy filenames are still preserved exactly to avoid breaking the current tileset:

- `left_edge_1wide_with_wall.png`
- `middle-rusted-up-2wide.xcf.png`
- `water-2wideb.png`
- `floating-platform-broken-2wide-2heigh.png`

Those should be normalized in a follow-up pass once the tileset references are updated deliberately.
