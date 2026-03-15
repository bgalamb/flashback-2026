# Legacy Level Data

This folder contains legacy level assets (`.lev`), legacy raw `.pge` files, legacy raw `.obj` files, and legacy palette files under `palettes/`.

## How level data is used now

Current runtime map rendering is driven by pre-generated assets in `DATA/levels/<levelName2>/`:

- Generated runtime room asset: `<levelName>-room<room>.pixeldata.png`
- Palette header metadata: `<levelName>.paletteheader.json` (or room-specific variant)

## `_lev` source (current behavior)

- `.lev` files in this folder are **legacy source assets**.
- Runtime no longer uses `_lev` as a fallback for palette offsets.
- Palette offsets are expected from JSON palette header files only.

## `_pal` source (current behavior)

- Legacy palette binaries are in `DATA/levels/legacy-level-data/palettes/`.
- Runtime no longer falls back to `_pal` offset reads when JSON color data is missing.
- Palette data is expected from JSON metadata (offsets and/or embedded colors).

## `_pge` source (current behavior)

- Legacy raw `.pge` files are stored in this folder as source assets only.
- Runtime no longer loads binary `.pge` files.
- Runtime expects parsed JSON PGE data under `DATA/levels/<levelName2>/`.

## `_obj` source (current behavior)

- Legacy raw `.obj` files are stored in this folder as source assets only.
- Runtime no longer loads binary `.obj` files.
- Runtime expects parsed JSON OBJ data under `DATA/levels/<levelName2>/`.

## Notes

- Export/rebuild helper scripts still support working with legacy data for tooling workflows.
- If JSON palette metadata is missing, runtime logs warnings and does not use `_lev` / `_pal` fallback paths.
