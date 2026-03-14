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

## Sprite Export Command

### `export:sprite:image`
Export one sprite, or all resolved sprites from a `SPR` + `OFF` pair, as `PPM` image files.

Usage:

```bash
npm run export:sprite:image -- <spr> <off> <spriteIndex> <paletteRef> <output.ppm> [flags]
npm run export:sprite:image -- <spr> <off> all <paletteRef> <outputDir> [flags]
```

Examples:

```bash
# one Conrad sprite using Conrad palette variant 1
npm run export:sprite:image -- ./DATA/PERSO.SPR ./DATA/PERSO.OFF 0 conrad:1 ./out/conrad-0000.ppm

# all sprites from PERSO using Conrad palette variant 1
npm run export:sprite:image -- ./DATA/PERSO.SPR ./DATA/PERSO.OFF all conrad:1 ./out/perso-sprites

# all sprites from JUNKY using the monster palette defined for level 1, script-node 34
npm run export:sprite:image -- ./DATA/JUNKY.SPR ./DATA/JUNKY.OFF all monster:1:34 ./out/junky-sprites
```

Output:

- single-sprite mode writes one file to `<output.ppm>`
- `all` mode writes one file per resolved sprite entry into `<outputDir>`
- files are named like `sprite-0000.ppm`, `sprite-0001.ppm`, ...

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
