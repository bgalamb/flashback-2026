# Debugger Helpers

This folder contains helper scripts for exporting and rebuilding CT (collision table) data.

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

- Rebuilt adjacency is read from `<level>-ct-adjacency.json`.
- Rebuilt grid bytes are read from `room-XX-grid.txt`.
