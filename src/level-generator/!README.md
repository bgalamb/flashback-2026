# Level Generator

This folder contains scripts for building level assets from collision grids.

Shared default output root:

- `DATA/levels`

This is defined in:

- [`generation-config.ts`](/Users/balazsgalambos/git/flashback-web/src/tools/level-generator/generation-config.ts)

Scripts that allow an omitted output directory use that root by default.

Source collision grids now live under:

- `src/collisions/<level>`

The tools here currently cover these related tasks:

- work from manually authored collision datasets and room-transition data
- generate room layer PNGs from room grids
- rebuild `*.ct.bin` from adjacency/grid text exports
- rebuild adjacency JSON from rendered adjacency TXT
- merge `-backlayer.png` and `-frontlayer.png` into `.pixeldata.png`

## Intended Workflow

The intended room-art pipeline in this folder is:

1. Prepare a collision dataset manually:
   - author `room-XX-grid.txt`
   - author `<levelName>-ct-adjacency.txt`
   - rebuild `<levelName>-ct-adjacency.json`
2. Rebuild the level collision binary with [`rebuild-ct-from-txt.ts`](/Users/balazsgalambos/git/flashback-web/src/tools/level-generator/rebuild-ct-from-txt.ts).
3. Render editable room art layers from the collision grids with [`render_room_layers_from_grid.ts`](/Users/balazsgalambos/git/flashback-web/src/tools/level-generator/render_room_layers_from_grid.ts).
4. Optionally edit the generated `-backlayer.png` and `-frontlayer.png` files by hand.
5. Merge those layers into final runtime `*.pixeldata.png` files with [`merge-room-layer-png.ts`](/Users/balazsgalambos/git/flashback-web/src/tools/level-generator/merge-room-layer-png.ts).
6. Make sure the final runtime room PNGs are tracked in [`DATA/files.json`](/Users/balazsgalambos/git/flashback-web/DATA/files.json).

## Manual Collision Dataset Preparation

There is no repo script that generates a fresh collision dataset anymore.

To create a new level dataset, prepare these files manually in a collisions folder such as `src/collisions/level11`:

- `<levelName>-ct-adjacency.txt`
- `<levelName>-ct-adjacency.json`
- `room-XX-grid.txt`

Recommended manual workflow:

1. Copy an existing collisions folder that has the room-id set you want to start from.
2. Edit the room transitions in `<levelName>-ct-adjacency.txt`.
3. Rebuild the matching JSON with `npm run rebuild:adjacency:json:from-txt -- <input-adjacency.txt> <output-adjacency.json>`.
4. Edit each `room-XX-grid.txt` by hand.
5. Review the resulting collision grids and adjacency data manually before rebuilding level assets.

### Build A New Level From A Manual Collision Dataset

Once `src/collisions/level11` has been authored manually and validated:

```bash
npm run rebuild:ct:from-txt -- src/collisions DATA/levels/level11

npx ts-node --transpile-only ./src/tools/level-generator/render_room_layers_from_grid.ts \
  src/collisions/level11 \
  DATA/levels/level11 \
  all

for back in DATA/levels/level11/level11-room*-backlayer.png; do
  room_base=${back%-backlayer.png}
  front=${room_base}-frontlayer.png
  out=${room_base}.pixeldata.png
  npx ts-node --transpile-only ./src/tools/level-generator/merge-room-layer-png.ts "$back" "$front" "$out"
done
```

This produces:

- `DATA/levels/level11/level11.ct.bin`
- `DATA/levels/level11/level11-roomXX-backlayer.png`
- `DATA/levels/level11/level11-roomXX-frontlayer.png`
- `DATA/levels/level11/level11-roomXX.pixeldata.png`

## Room Layer PNG Generator

File:

- [`render_room_layers_from_grid.ts`](/Users/balazsgalambos/git/flashback-web/src/tools/level-generator/render_room_layers_from_grid.ts)

Purpose:

- read `room-XX-grid.txt`
- generate a back layer PNG and front layer PNG for each room
- align the rendered rock/floor geometry to the runtime collision coordinates

This generator is generic and supports:

- any collision folder
- any output level folder
- either one room number or all rooms in the folder

Usage:

```bash
npx ts-node --transpile-only ./src/tools/level-generator/render_room_layers_from_grid.ts <collisionDir> [outputDir] [room|all]
```

Examples:

Generate one room from a manually prepared collision dataset:

```bash
npx ts-node --transpile-only ./src/tools/level-generator/render_room_layers_from_grid.ts \
  src/collisions/level11 \
  DATA/levels/level11 \
  17
```

Generate all rooms:

```bash
npx ts-node --transpile-only ./src/tools/level-generator/render_room_layers_from_grid.ts \
  src/collisions/level11 \
  DATA/levels/level11 \
  all
```

Default-output example:

```bash
npx ts-node --transpile-only ./src/tools/level-generator/render_room_layers_from_grid.ts \
  DATA/levels/level10 \
  all
```

This writes to:

- `DATA/levels/generated/level10`

Output:

- `<outputDir>/<outputLevelName>-room<room>-backlayer.png`
- `<outputDir>/<outputLevelName>-room<room>-frontlayer.png`

Example output files:

- `DATA/levels/level11/level11-room17-backlayer.png`
- `DATA/levels/level11/level11-room17-frontlayer.png`

## Indexed PNG Layer Remapper

File:

- [`remap_room_layer_from_indexed_png.ts`](/Users/balazsgalambos/git/flashback-web/src/tools/level-generator/remap_room_layer_from_indexed_png.ts)

Purpose:

- convert a manually prepared indexed PNG into a runtime-compatible room layer PNG
- remap source palette banks into Flashback room palette slots
- emit either a `back`, `front`, or full `pixeldata` PNG

This tool expects:

- one indexed source PNG
- at most `64` source colors total
- those colors to fit into `4` source banks of `16` colors each

Usage:

```bash
npx ts-node --transpile-only ./src/tools/level-generator/remap_room_layer_from_indexed_png.ts <input.png> <back|front|pixeldata> <output.png>
```

Modes:

- `back`: remap the image into runtime palette banks `0x0` through `0x3`
- `front`: remap the image into runtime palette banks `0x8` through `0xB`
- `pixeldata`: write a full runtime room PNG using the source image as the pixeldata layer

Notes:

- transparent source entries are converted to layer transparency index `0xFF` for `back` and `front`
- `pixeldata` mode preserves compacted source pixel indices and rebuilds the runtime palette layout around them
- this helper is specialized to the level-10-era room palette layout even though it can be used on any compatible indexed room PNG

Examples:

```bash
npx ts-node --transpile-only ./src/tools/level-generator/remap_room_layer_from_indexed_png.ts \
  /tmp/room17-source.png \
  back \
  /tmp/level10-room17-backlayer.png
```

```bash
npx ts-node --transpile-only ./src/tools/level-generator/remap_room_layer_from_indexed_png.ts \
  /tmp/room17-source.png \
  front \
  /tmp/level10-room17-frontlayer.png
```

```bash
npx ts-node --transpile-only ./src/tools/level-generator/remap_room_layer_from_indexed_png.ts \
  /tmp/room17-source.png \
  pixeldata \
  /tmp/level10-room17.pixeldata.png
```

## CT Rebuild

Files:

- [`rebuild-ct-from-txt.ts`](/Users/balazsgalambos/git/flashback-web/src/tools/level-generator/rebuild-ct-from-txt.ts)
- [`ct-array-rebuilder.ts`](/Users/balazsgalambos/git/flashback-web/src/tools/level-generator/ct-array-rebuilder.ts)

Package command:

```bash
npm run rebuild:ct:from-txt -- <txtExportRootDir> [outputDir]
```

Example:

```bash
npm run rebuild:ct:from-txt -- src/collisions DATA/levels/level10
```

Default-output example:

```bash
npm run rebuild:ct:from-txt -- DATA/levels
```

This writes rebuilt `*.ct.bin` files under:

- `DATA/levels/<level>`

This rebuilds:

- `<outputDir>/<levelName>.ct.bin`

using:

- `<level>-ct-adjacency.json` for room transitions
- `room-XX-grid.txt` for room collision cells

### Regenerate A Full Level Output

To rebuild the collision binary and regenerate all room PNG artifacts for `level10` after editing collision grids:

```bash
npm run rebuild:ct:from-txt -- src/collisions DATA/levels/level10
npx ts-node --transpile-only ./src/tools/level-generator/render_room_layers_from_grid.ts src/collisions/level10 DATA/levels/level10 all
for back in DATA/levels/level10/level10-room*-backlayer.png; do
  room_base=${back%-backlayer.png}
  front=${room_base}-frontlayer.png
  out=${room_base}.pixeldata.png
  npx ts-node --transpile-only ./src/tools/level-generator/merge-room-layer-png.ts "$back" "$front" "$out"
done
```

This writes:

- `DATA/levels/generated/level10/level10.ct.bin`
- `DATA/levels/level10/level10-roomXX-backlayer.png`
- `DATA/levels/level10/level10-roomXX-frontlayer.png`
- `DATA/levels/level10/level10-roomXX.pixeldata.png`

## Adjacency TXT To JSON

File:

- [`rebuild-adjacency-json-from-txt.ts`](/Users/balazsgalambos/git/flashback-web/src/tools/level-generator/rebuild-adjacency-json-from-txt.ts)

Package command:

```bash
npm run rebuild:adjacency:json:from-txt -- <input-adjacency.txt> <output-adjacency.json>
```

Example:

```bash
npm run rebuild:adjacency:json:from-txt -- \
  src/collisions/level10/level10-ct-adjacency.txt \
  /tmp/level10-ct-adjacency-from-txt.json
```

Notes:

- this is a lossy reconstruction
- it infers adjacency only from room positions in the rendered TXT table
- it cannot recover special CT values like `-1`
- it cannot preserve inconsistencies that were already collapsed by the visual map renderer

## Pixeldata Merge

File:

- [`merge-room-layer-png.ts`](/Users/balazsgalambos/git/flashback-web/src/tools/level-generator/merge-room-layer-png.ts)

Usage:

```bash
npx ts-node --transpile-only ./src/tools/level-generator/merge-room-layer-png.ts <backlayer.png> <frontlayer.png> <output.pixeldata.png>
```

Example:

```bash
npx ts-node --transpile-only ./src/tools/level-generator/merge-room-layer-png.ts \
  DATA/levels/level10/level10-room17-backlayer.png \
  DATA/levels/level10/level10-room17-frontlayer.png \
  DATA/levels/level10/level10-room17.pixeldata.png
```

This merges the two indexed layer PNGs into the final room pixeldata PNG used by the existing room-art workflow.

## Coordinate Model

The generators and validator assume the same collision mapping used by the runtime:

- room grid size: `16 x 7`
- X column width: `16px`
- Y row height: `36px`
- visible rendering height: `224px`
- collision room height: effectively `216px`, with the final row clipped into the visible bottom strip

Conrad standing rules used by the validator:

- top floor:
  - `pos_y = 70`
  - clearance row `1`
  - support row `2`
- middle floor:
  - `pos_y = 142`
  - clearance row `3`
  - support row `4`
- bottom floor:
  - `pos_y = 214`
  - clearance row `5`
  - support row `6`

These rules are used both for validation and for checking whether adjacent rooms line up horizontally for walk transitions.
