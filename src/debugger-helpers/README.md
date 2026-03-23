# Debugger Helpers

This folder contains helper scripts for exporting and rebuilding CT (collision table) data.

## PGE Export Command

### `export:pge:json`
Parse every legacy raw `.PGE` file from `DATA/levels/legacy-level-data/` and write the generated JSON version used by the runtime.

```bash
npm run export:pge:json -- ./DATA
```

Output:

- `levels/level1/level1.pge.json`
- `levels/level2/level2.pge.json`
- `levels/level3/level3.pge.json`
- `levels/level4_1/level4.pge.json`
- `levels/level4_2/level4.pge.json`
- `levels/level5_1/level5.pge.json`
- `levels/level5_2/level5.pge.json`

The exporter also appends these generated files to `DATA/files.json` so the game can resolve them through its virtual filesystem.
Legacy source `.pge` files are expected under `DATA/levels/legacy-level-data/`.

## OBJ Export Command

### `export:obj:json`
Parse every legacy raw `.OBJ` file from `DATA/levels/legacy-level-data/` and write the generated JSON version used by the runtime.

```bash
npm run export:obj:json -- ./DATA
```

Output:

- `levels/level1/level1.obj.json`
- `levels/level2/level2.obj.json`
- `levels/level3/level3.obj.json`
- `levels/level4_1/level4.obj.json`
- `levels/level4_2/level4.obj.json`
- `levels/level5_1/level5.obj.json`
- `levels/level5_2/level5.obj.json`

The exporter also appends these generated files to `DATA/files.json` so the game can resolve them through its virtual filesystem.
Legacy source `.obj` files are expected under `DATA/levels/legacy-level-data/`.

## TBN Export Command

### `export:tbn:json`
Parse every legacy raw `.TBN` file from the `DATA/` root and write the generated JSON version used by the runtime.

```bash
npm run export:tbn:json -- ./DATA
```

Output:

- `levels/level1/level1.tbn.json`
- `levels/level2/level2.tbn.json`
- `levels/level3/level3.tbn.json`
- `levels/level4_1/level4.tbn.json`
- `levels/level4_2/level4.tbn.json`
- `levels/level5_1/level5.tbn.json`
- `levels/level5_2/level5.tbn.json`

The exporter also appends these generated files to `DATA/files.json` so the game can resolve them through its virtual filesystem.
Legacy source `.tbn` files are expected at the `DATA/` root.

## CT Export Commands

### `export:ct:all`
Export both adjacency maps and room grids for all levels.

```bash
npm run export:ct:all -- <dataDir> <outputBaseDir>
```

Example:

```bash
npm run export:ct:all -- ./DATA ./out/ct-all
```

Output layout:

- `<outputBaseDir>/<level>/<level>-ct-adjacency.txt`
- `<outputBaseDir>/<level>/<level>-ct-adjacency.json`
- `<outputBaseDir>/<level>/room-XX-grid.txt` (existing rooms only)

Notes:

- The `.json` file is the authoritative adjacency export. It preserves the raw per-room `up`, `down`, `left`, and `right` values exactly as stored in CT data.
- The `.txt` file is only a human-readable spatial visualization. It is useful for inspection, but it is lossy and should not be used as the source of truth for rebuilding CT adjacency.

### `export:ct-adj`
Export adjacency maps for all levels.

```bash
npm run export:ct-adj -- <dataDir> [outputBaseDir|legacyOutputFilePath]
```

Examples:

```bash
# preferred (base directory)
npm run export:ct-adj -- ./DATA ./out/ct-adjacency

# backward-compatible file-like argument
npm run export:ct-adj -- ./DATA ./out/ct-adjacency.txt
```

For each level, this writes:

- `<base>/<level>/<level>-ct-adjacency.txt`
- `<base>/<level>/<level>-ct-adjacency.json`

Notes:

- The JSON adjacency can contain negative values such as `-1`. In this context, `-1` means there is no valid destination room for that direction in the CT data.
- One practical example is a fall or transition that should not land in another room. The text map may still place rooms in a simple grid for visualization, but only the JSON preserves the exact transition value.

### `export:ct-adj:level`
Export adjacency map for one level.

```bash
npm run export:ct-adj:level -- <dataDir> <levelName> [outputTxt]
```

Example:

```bash
npm run export:ct-adj:level -- ./DATA level3 ./out/level3-ct-adjacency.txt
```

When `outputTxt` is provided, a sibling JSON file is also generated:

- `./out/level3-ct-adjacency.json`

### `export:ct-grid:all`
Export room grid ASCII tables for all levels and existing rooms only.

```bash
npm run export:ct-grid:all -- <dataDir> <outputDir>
```

Example:

```bash
npm run export:ct-grid:all -- ./DATA ./out/ct-grids
```

Output:

- `<outputDir>/<level>/room-XX-grid.txt`

### `export:ct-grid:level-room`
Export room grid ASCII table for one specific level + room.

```bash
npm run export:ct-grid:level-room -- <dataDir> <levelName> <room> <outputTxt>
```

Example:

```bash
npm run export:ct-grid:level-room -- ./DATA level1 29 ./out/level1-room29-grid.txt
```

### `export:ct-grid:merged-png`
Render one merged black/white PNG for a level by stitching the exported `room-XX-grid.txt` files according to the rendered adjacency text layout.

```bash
npm run export:ct-grid:merged-png -- <adjacency.txt> <gridDir> <output.png> [cellSize]
```

Example:

```bash
npm run export:ct-grid:merged-png -- \
  ./DATA/levels/generated/level10-collisions/level10-ct-adjacency.txt \
  ./DATA/levels/generated/level10-collisions \
  ./DATA/levels/generated/level10-collisions/level10-merged-grid.png \
  16
```

Output:

- `<output.png>`

Notes:

- This command uses the room placement from `<level>-ct-adjacency.txt`.
- It reads the per-room collision grids from `room-XX-grid.txt`.
- Neighboring rooms overlap by one collision cell on shared borders:
  left/right neighbors share the last/first column and up/down neighbors share the last/first row.
- The output is an RGB PNG with white background and black filled collision cells.
- `cellSize` is optional and defaults to `16`.

## Generated Collision Dataset Commands

### `generate:validated-room-collisions`
Generate a fresh collision dataset in a new folder using:

- a source room-id set
- source adjacency when available, otherwise a random room-transition graph
- validated room grid data
- the current room-grid validity rules for Conrad walkability

Usage:

```bash
npm run generate:validated-room-collisions -- <inputRoomGridDir> <outputDir> [seed]
```

Examples:

```bash
# generate a new random dataset; seed is derived from the output folder name + room ids
npm run generate:validated-room-collisions -- ./DATA/levels/generated/level10-collisions ./DATA/levels/generated/level11-collisions

# generate a reproducible random dataset with an explicit seed
npm run generate:validated-room-collisions -- ./DATA/levels/generated/level10-collisions ./DATA/levels/generated/level11-collisions 123456
```

Output:

- `<outputDir>/<levelName>-ct-adjacency.json`
- `<outputDir>/<levelName>-ct-adjacency.txt`
- `<outputDir>/room-XX-grid.txt`

Notes:

- The generator reuses the source adjacency graph when the input level already has a `<level>-ct-adjacency.json`. Otherwise it falls back to random adjacency generation.
- When no explicit seed is passed, the generator derives one from the output folder name and room id list, so the same inputs are reproducible.
- When an explicit seed is passed, you can rerun the command with the same seed to reproduce the exact same random graph and room layouts.
- The generator runs the in-memory validator and bounded repair pipeline before accepting output.
- For authored levels, if bounded synthesis cannot reach a clean result, it can fall back to copying a validator-clean source dataset.
- The implementation lives in [`src/level-generator`](/Users/balazsgalambos/git/flashback-web/src/level-generator).

## CT Rebuild Command

### `rebuild:ct:from-txt`
Rebuild CT arrays (`0x1D00` bytes) from the export layout.

```bash
npm run rebuild:ct:from-txt -- <txtExportRootDir> <outputDir>
```

Example:

```bash
npm run rebuild:ct:from-txt -- ./out/ct-all ./out/ct-rebuilt
```

Output:

- `<outputDir>/level1.ct.bin`
- `<outputDir>/level2.ct.bin`
- `<outputDir>/level3.ct.bin`
- `<outputDir>/level4.ct.bin`
- `<outputDir>/level5.ct.bin`

Notes:

- Rebuilt adjacency is read from `<level>-ct-adjacency.json`, not from `<level>-ct-adjacency.txt`.
- Rebuilt grid bytes are read from `room-XX-grid.txt`.
- This matters because the JSON preserves special adjacency values such as `-1`, while the text export is only a rendered view.
- In the rebuilt CT array, `-1` is written back as the original signed byte value and means there is no valid destination room for that direction.
- Rebuilt CT files are written only to the `outputDir` you pass. Use `DATA/levels/generated/<level>` for generated outputs.

## Sprite Export Command

### `export:sprite:image`
Export one sprite, or all resolved sprites from a `SPR` + `OFF` pair, as `PNG` image files.

Usage:

```bash
npm run export:sprite:image -- <spr> <off> <spriteIndex> <paletteRef> <output.png> [flags]
npm run export:sprite:image -- <spr> <off> all <paletteRef> <outputDir> [flags]
```

Examples:

```bash
# one Conrad sprite using Conrad palette variant 1
npm run export:sprite:image -- ./DATA/PERSO.SPR ./DATA/PERSO.OFF 0 conrad:1 ./out/conrad-0000.png

# all sprites from PERSO using Conrad palette variant 1
npm run export:sprite:image -- ./DATA/PERSO.SPR ./DATA/PERSO.OFF all conrad:1 ./out/perso-sprites

# all sprites from JUNKY using the monster palette defined for level 1, script-node 34
npm run export:sprite:image -- ./DATA/JUNKY.SPR ./DATA/JUNKY.OFF all monster:1:34 ./out/junky-sprites
```

Output:

- single-sprite mode writes one file to `<output.png>`
- `all` mode writes one file per resolved sprite entry into `<outputDir>`
- files are named like `sprite-0000.png`, `sprite-0001.png`, ...

#### Where `paletteRef` comes from

`paletteRef` is not read from the `SPR` or `OFF` files.

The sprite files only contain:

- sprite byte data (`SPR`)
- sprite offset/index entries (`OFF`)

They do **not** contain the palette choice the exporter should use to color the pixels.

So `paletteRef` is an explicit exporter input that tells the script which built-in palette source to use.

Currently the exporter supports:

- `conrad:<variantId>`
- `monster:<level>:<monsterScriptNodeIndex>`

These are resolved in [`sprite-image-exporter.ts`](/Users/balazsgalambos/git/flashback-web/src/debugger-helpers/sprite-image-exporter.ts):

- `conrad:<variantId>`
  - resolved from Conrad palette variants in [`staticres.ts`](/Users/balazsgalambos/git/flashback-web/src/staticres.ts)
  - specifically `_conradVisualVariants`

- `monster:<level>:<monsterScriptNodeIndex>`
  - resolved from monster palette definitions in [`staticres-monsters.ts`](/Users/balazsgalambos/git/flashback-web/src/staticres-monsters.ts)
  - specifically `monsterListsByLevel`

So for example:

- `conrad:1`
  - use Conrad palette variant `1`
- `monster:1:34`
  - use the palette for the monster entry in level `1` whose `monsterScriptNodeIndex` is `34`

This lookup happens in `SpriteImageExporter.resolvePalette()`.

## Room Layer PNG Workflow

The room-layer pipeline now uses indexed PNG files instead of legacy room image exports and instead of raw room byte dumps.

There are two related scripts:

- `export-all-level-layer-artifacts.ts`
- `merge-room-layer-png.ts`

The first one generates per-room indexed PNG assets from the legacy Amiga source files. The second one takes the split back/front layer PNGs and rebuilds the full room `pixeldata` PNG used by the runtime.

### Output Files

For each exported room, the generator writes three indexed PNG files:

- `<levelDir>/<levelName>-room<room>.pixeldata.png`
- `<levelDir>/<levelName>-room<room>-backlayer.png`
- `<levelDir>/<levelName>-room<room>-frontlayer.png`

Example:

- `DATA/levels/level1/level1-room26.pixeldata.png`
- `DATA/levels/level1/level1-room26-backlayer.png`
- `DATA/levels/level1/level1-room26-frontlayer.png`

The runtime only needs `*.pixeldata.png`.

The `-backlayer.png` and `-frontlayer.png` files are editing and generation artifacts. They are intentionally not added to `DATA/files.json`.

### Full Room PNG Semantics

The full room PNG is the runtime image.

It stores:

- exact room pixel bytes
- the full indexed palette table the room needs at runtime

Each pixel byte is preserved exactly:

- high nibble = palette slot
- low nibble = color index

For room rendering, the important runtime slots are:

- `0x0`, `0x1`, `0x2`, `0x3`
- `0x8`, `0x9`, `0xA`, `0xB`, `0xC`, `0xD`

The room loader reads this PNG directly and uses:

- the indexed pixel bytes as `_frontLayer`
- the PNG palette table as the source for room palette colors

### Split Layer PNG Semantics

The layer PNGs are not screenshots. They are also indexed pixeldata images.

They are constrained on purpose:

- back layer PNG uses palette slots `0` through `3`
- front layer PNG uses palette slots `8` through `B`
- transparent pixels use index `0xFF`

This is important because it makes the layer files easier to edit and merge deterministically.

The remapping rules are:

- back layer:
  - room slot `0x0` stays `0x0`
  - room slot `0x1` stays `0x1`
  - room slot `0x2` stays `0x2`
  - room slot `0x3` stays `0x3`
- front layer:
  - room slot `0x8` stays `0x8`
  - room slot `0x9` stays `0x9`
  - room slot `0xA` stays `0xA`
  - room slot `0xB` stays `0xB`

So the split files preserve the runtime room bytes directly for the visible layers:

- back = slots `0x0` / `0x1` / `0x2` / `0x3`
- front = slots `0x8` / `0x9` / `0xA` / `0xB`

### Export All Layer Artifacts

Generate room PNGs and split layer PNGs for all levels:

```bash
npx ts-node --transpile-only ./src/debugger-helpers/export-all-level-layer-artifacts.ts ./DATA ./DATA/levels
```

This command reads the legacy sources from:

- `DATA/*.mbk`
- `DATA/*.sgd` when present
- `DATA/levels/legacy-level-data/*.lev`
- `DATA/levels/legacy-level-data/palettes/*.pal`

and writes the generated PNGs into `DATA/levels/<levelDir>/`.

Internally, the exporter:

1. decodes the room from the legacy `LEV` / `MBK` / `SGD` data
2. applies the room palette slots from the legacy `PAL`
3. writes the full indexed room PNG
4. writes the split back/front indexed PNGs

The implementation lives in [`legacy-room-png-exporter.ts`](/Users/balazsgalambos/git/flashback-web/src/debugger-helpers/legacy-room-png-exporter.ts).

### Export One Room

Generate the three PNGs for one room:

```bash
npx ts-node --transpile-only ./src/debugger-helpers/export-room-layer-artifacts.ts \
  DATA/levels/legacy-level-data/level1.lev \
  DATA/level1.mbk \
  DATA/levels/legacy-level-data/palettes/level1.pal \
  DATA/level1.sgd \
  0 \
  26 \
  /tmp/level1-room26
```

This writes:

- `/tmp/level1-room26.pixeldata.png`
- `/tmp/level1-room26-backlayer.png`
- `/tmp/level1-room26-frontlayer.png`

Arguments:

- `<lev>`: legacy room container
- `<mbk>`: tile bank
- `<pal>`: legacy palette banks
- `<sgd>`: optional SGD overlay data
- `<levelIndex>`: zero-based game level index
- `<room>`: room number
- `<outputPrefix>`: output path prefix without extension

### Merge Split Layers Back Into One Room PNG

To rebuild the runtime room PNG from the split layer PNGs:

```bash
npx ts-node --transpile-only ./src/debugger-helpers/merge-room-layer-png.ts \
  DATA/levels/level1/level1-room26-backlayer.png \
  DATA/levels/level1/level1-room26-frontlayer.png \
  /tmp/level1-room26.pixeldata.png
```

This command:

1. loads the back layer PNG
2. loads the front layer PNG
3. checks that back uses only slots `0` / `1` / `2` / `3` or transparent `0xFF`
4. checks that front uses only slots `8` / `9` / `A` / `B` or transparent `0xFF`
5. overlays the front bytes directly
6. writes a full `*.pixeldata.png`

The merge back into the runtime byte layout is:

- merged back slot `0x0` = back slot `0x0`
- merged back slot `0x1` = back slot `0x1`
- merged back slot `0x2` = back slot `0x2`
- merged back slot `0x3` = back slot `0x3`
- merged front slot `0x8` = front slot `0x8`
- merged front slot `0x9` = front slot `0x9`
- merged front slot `0xA` = front slot `0xA`
- merged front slot `0xB` = front slot `0xB`

The merge script also rebuilds the full room palette table for the runtime PNG:

- slot `0x0` from back slot `0x0`
- slot `0x1` from back slot `0x1`
- slot `0x2` from back slot `0x2`
- slot `0x3` from back slot `0x3`
- slot `0x8` from back slot `0x0`
- slot `0x9` from:
  - back slot `0x0` for level 1
  - back slot `0x1` for the other levels
- slot `0x8` may be overridden by front slot `0x8` when present
- slot `0x9` may be overridden by front slot `0x9` when present
- slot `0xA` from front slot `0xA`
- slot `0xB` from front slot `0xB`
- slot `0xC` from front slot `0xA`
- slot `0xD` from front slot `0xB`

This matches the runtime room-palette layout used by the current PNG loader.

### Round-Trip Expectation

If the split layer PNGs were generated from a room PNG by the current exporter, then:

- merging them should reproduce the same room pixel bytes
- the merged `*.pixeldata.png` should decode to the same room byte buffer as the original full room PNG

This is the intended workflow:

1. generate room layer PNGs from legacy data
2. edit `-backlayer.png` and `-frontlayer.png`
3. merge them into `*.pixeldata.png`
4. run the game using the merged room PNG

### Important Limitation

This split-layer workflow currently covers the room-layer bytes that end up in the room PNG:

- back slots `0x0` / `0x1`
- back slots `0x2` / `0x3`
- front slots `0x8` / `0x9` / `0xA` / `0xB`

It does not separately preserve every possible palette slot in the runtime palette table as independent editable layers.

That is intentional for now because the goal is:

- editable back/front layer PNGs
- deterministic reconstruction of the full room pixeldata PNG
- runtime loading from one indexed PNG per room
