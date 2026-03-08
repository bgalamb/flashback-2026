# Debugger Helpers Command Reference

This file summarizes what each script under `src/debugger-helpers` does and how to run it.

## Run style

Use direct Node commands with ts-node register:

- `node -r ts-node/register/transpile-only ./src/debugger-helpers/<file>.ts <args>`

## Former package.json script aliases

These aliases were removed from `package.json`. Use the direct command on the right:

- `export:amiga-room` -> `node -r ts-node/register/transpile-only ./src/debugger-helpers/export-amiga-level-image.ts ...`
- `export:all-amiga-rooms` -> `node -r ts-node/register/transpile-only ./src/debugger-helpers/export-all-amiga-level-images.ts ...`
- `export:all-layer-artifacts` -> `node -r ts-node/register/transpile-only ./src/debugger-helpers/export-all-level-layer-artifacts.ts ...`
- `export:mbk` -> `node -r ts-node/register/transpile-only ./src/debugger-helpers/export-mbk-image.ts ...`
- `export:all-mbk` -> `node -r ts-node/register/transpile-only ./src/debugger-helpers/export-all-mbk-images.ts ...`
- `export:bnq` -> `node -r ts-node/register/transpile-only ./src/debugger-helpers/export-bnq-image.ts ...`
- `export:all-bnq` -> `node -r ts-node/register/transpile-only ./src/debugger-helpers/export-all-bnq-images.ts ...`
- `export:palette` -> `node -r ts-node/register/transpile-only ./src/debugger-helpers/export-palette-image.ts ...`
- `export:all-palette` -> `node -r ts-node/register/transpile-only ./src/debugger-helpers/export-all-palette-images.ts ...`
- `export:cutscene` -> `node -r ts-node/register/transpile-only ./src/debugger-helpers/export-legacy-cutscene-video.ts ...`
- `export:cutscene:id` -> `node -r ts-node/register/transpile-only ./src/debugger-helpers/export-legacy-cutscene-video-by-id.ts ...`
- `export:cutscene:name` -> `node -r ts-node/register/transpile-only ./src/debugger-helpers/export-legacy-cutscene-video-by-name.ts ...`

## Room / Level exports

### `export-amiga-level-image.ts`
- Purpose: Export one fully composited room image (`.ppm`).
- Command:
    - `node -r ts-node/register/transpile-only ./src/debugger-helpers/export-amiga-level-image.ts <lev> <mbk> <pal> <sgd> <levelIndex> <room> <output.ppm>`
- Example:
    - `node -r ts-node/register/transpile-only ./src/debugger-helpers/export-amiga-level-image.ts DATA/level1.lev DATA/level1.mbk DATA/level1.pal DATA/level1.sgd 0 29 out/level1-room29.ppm`

### `export-room-layer-artifacts.ts`
- Purpose: Export one room as a full set of artifacts.
- Outputs:
    - `<outputPrefix>.ppm`
    - `<outputPrefix>.pixeldata.bin`
    - `<outputPrefix>-backlayer.ppm`
    - `<outputPrefix>-frontlayer.ppm`
- Command:
    - `node -r ts-node/register/transpile-only ./src/debugger-helpers/export-room-layer-artifacts.ts <lev> <mbk> <pal> <sgd> <levelIndex> <room> <outputPrefix>`

### `export-all-amiga-level-images.ts`
- Purpose: Export composited room images for all levels/rooms.
- Command:
    - `node -r ts-node/register/transpile-only ./src/debugger-helpers/export-all-amiga-level-images.ts <dataDir> <outputDir>`

### `export-all-level-layer-artifacts.ts`
- Purpose: Export full artifact set for all existing rooms only.
- Command:
    - `node -r ts-node/register/transpile-only ./src/debugger-helpers/export-all-level-layer-artifacts.ts <dataDir> <outputDir>`

### `export-all-level-palette-headers.ts`
- Purpose: Extract one palette header per level from `_lev` (slots 1-4 offsets; taken from the first valid room in that level).
- Output:
    - `<outputDir>/<levelName2>/<baseLevelName>.paletteheader.json`
    - Includes `sourceRoom`, slot offsets (`dec`/`hex`), and resolved `_pal` colors for each slot (`raw` Amiga value + converted `rgb`)
- Command:
    - `node -r ts-node/register/transpile-only ./src/debugger-helpers/export-all-level-palette-headers.ts <dataDir> [outputDir]`
- Example:
    - `node -r ts-node/register/transpile-only ./src/debugger-helpers/export-all-level-palette-headers.ts DATA DATA/levels`

## MBK / BNQ visualization

### `export-mbk-image.ts`
- Purpose: Export all tiles from one MBK file into a tile-atlas image.
- Command:
    - `node -r ts-node/register/transpile-only ./src/debugger-helpers/export-mbk-image.ts <mbk> <output.ppm> [pal] [paletteSlot] [tilesPerRow]`

### `export-bnq-image.ts`
- Purpose: Export all tiles from one BNQ file into a tile-atlas image.
- Command:
    - `node -r ts-node/register/transpile-only ./src/debugger-helpers/export-bnq-image.ts <bnq> <output.ppm> [pal] [paletteSlot] [tilesPerRow]`

### `export-mbk-entry-image.ts`
- Purpose: Export a single MBK entry by index.
- Notes:
    - Auto-falls back to same entry index from BNQ if MBK entry is empty.
    - Output filename includes data source (`-src-mbk` or `-src-bnq`).
    - Default output folder: `out/mbk-entry-images`.
- Command:
    - `node -r ts-node/register/transpile-only ./src/debugger-helpers/export-mbk-entry-image.ts <mbk> <entryIndex> [pal] [paletteSlot] [outputDir]`
- Example:
    - `node -r ts-node/register/transpile-only ./src/debugger-helpers/export-mbk-entry-image.ts DATA/level1.mbk 29 DATA/level1.pal 1`

### `export-mbk-bnq-map-table.ts`
- Purpose: Generate MBK↔BNQ index mapping tables.
- Outputs (default folder `out/mbk-bnq-maps`):
    - `<mbkBase>-<bnqBase>-index-map.csv`
    - `<mbkBase>-<bnqBase>-index-map.txt` (ASCII art table)
- Command:
    - `node -r ts-node/register/transpile-only ./src/debugger-helpers/export-mbk-bnq-map-table.ts <mbk> <bnq> [outputDir]`

### `export-all-mbk-images.ts`
- Purpose: Export MBK atlases for all levels found under a data directory.
- Command:
    - `node -r ts-node/register/transpile-only ./src/debugger-helpers/export-all-mbk-images.ts <dataDir> <outputDir> [paletteSlot] [tilesPerRow]`

### `export-all-bnq-images.ts`
- Purpose: Export BNQ atlases for all levels found under a data directory.
- Command:
    - `node -r ts-node/register/transpile-only ./src/debugger-helpers/export-all-bnq-images.ts <dataDir> <outputDir> [paletteSlot] [tilesPerRow]`

## Palette exports

### `export-palette-image.ts`
- Purpose: Export one `.pal` file to a palette preview image.
- Command:
    - `node -r ts-node/register/transpile-only ./src/debugger-helpers/export-palette-image.ts <pal> <output.ppm> [squareSize]`

### `export-all-palette-images.ts`
- Purpose: Export palette preview images for all palette files in data dir.
- Command:
    - `node -r ts-node/register/transpile-only ./src/debugger-helpers/export-all-palette-images.ts <dataDir> <outputDir> [squareSize]`

## Legacy cutscene video exports

### `export-legacy-cutscene-video.ts`
- Purpose: Export a cutscene by low-level index/offset.
- Command:
    - `node -r ts-node/register/transpile-only ./src/debugger-helpers/export-legacy-cutscene-video.ts <dataDir> <cutNameIndex> <cutOffset> <output.(avi|mpg|mpeg)>`

### `export-legacy-cutscene-video-by-id.ts`
- Purpose: Export a cutscene by game cutscene id.
- Command:
    - `node -r ts-node/register/transpile-only ./src/debugger-helpers/export-legacy-cutscene-video-by-id.ts <dataDir> <cutsceneId> <output.(avi|mpg|mpeg)>`

### `export-legacy-cutscene-video-by-name.ts`
- Purpose: Export a cutscene by symbolic name.
- Command:
    - `node -r ts-node/register/transpile-only ./src/debugger-helpers/export-legacy-cutscene-video-by-name.ts <dataDir> <cutName> <output.(avi|mpg|mpeg)> [cutOffset]`

### `export-all-legacy-cutscene-videos.ts`
- Purpose: Export all legacy cutscenes in one run.
- Command:
    - `node -r ts-node/register/transpile-only ./src/debugger-helpers/export-all-legacy-cutscene-videos.ts <dataDir> <outputDir> [avi|mpg|mpeg]`

### `export-legacy-cutscene-video-by-scene.ts`
- Purpose: Export one legacy cutscene by scene name.
- Command:
    - `node -r ts-node/register/transpile-only ./src/debugger-helpers/export-legacy-cutscene-video-by-scene.ts <dataDir> <sceneName> <output.(avi|mpg|mpeg)>`

## Internal helper modules (not CLI scripts)

These files are support modules used by the scripts above:
- `amiga-level-image-exporter.ts`
- `mbk-image-exporter.ts`
- `bnq-image-exporter.ts`
- `palette-image-exporter.ts`
- `legacy-cutscene-video-exporter.ts`
- `front-layer-image.ts`
