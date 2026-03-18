# Level Generator

This folder contains scripts for generating and validating room layouts from collision grids.

Shared default output root:

- `DATA/levels/generated`

This is defined in:

- [`generation-config.ts`](/Users/balazsgalambos/git/flashback-web/src/level-generator/generation-config.ts)

Scripts that allow an omitted output directory use that root by default.

Source collision grids now live under:

- `DATA/levels/generated/<level>-collisions`

The tools here currently cover three related tasks:

- validate `room-XX-grid.txt` files against Conrad walkability rules
- generate a new collision dataset with random room transitions and fresh room grids
- generate room layer PNGs from room grids
- rebuild `*.ct.bin` from adjacency/grid text exports
- rebuild adjacency JSON from rendered adjacency TXT
- merge `-backlayer.png` and `-frontlayer.png` into `.pixeldata.png`

## Room Grid Validator

File:

- [`check-room-grid-validity.ts`](/Users/balazsgalambos/git/flashback-web/src/level-generator/check-room-grid-validity.ts)

Support code:

- [`room-grid-validity-checker.ts`](/Users/balazsgalambos/git/flashback-web/src/level-generator/room-grid-validity-checker.ts)

Package command:

```bash
npm run check:room-grid -- <room-grid.txt> [more-room-grid.txt...]
```

Repair search can be tuned from the CLI:

```bash
npm run check:room-grid -- --repair-cluster=26,27 --repair-max-depth=6 --repair-max-nodes=40000 DATA/levels/generated/level10-collisions/room-*-grid.txt
```

Example:

```bash
npm run check:room-grid -- DATA/levels/generated/level10-collisions/room-17-grid.txt
```

The validator checks:

- grid shape is `16 x 7`
- grid values are binary (`0` or `1`)
- Conrad has stable standing support on at least one floor
- top-floor support is not one row too low
- every horizontal solid run of `1` cells has even length
- adjacent column top surfaces never form a 1-row stair step Conrad cannot climb
- small enclosed `0` pockets that do not touch any room edge and cannot be stood in are not allowed
- stable top/middle platforms are reachable from a lower floor in the room or from a same-floor adjacent room edge
- horizontal room-to-room edge consistency, when adjacency JSON is present
- falling through an open room bottom into a `down` adjacent room must line up with top-floor landing support at the same columns
- all active rooms in the level must be reachable from Conrad's start room through the traversable room graph
- vertical transition alignment as heuristic warnings

It prints Conrad’s stable standing columns for:

- top floor: `pos_y = 70`
- middle floor: `pos_y = 142`
- bottom floor: `pos_y = 214`

### Auto-fix top-floor support

The validator can also patch the specific top-floor error where support is one row too low:

```bash
npm run check:room-grid -- --fix-top-floor-support DATA/levels/generated/level10-collisions/room-17-grid.txt
```

It can also patch isolated upper platforms by carving matching support on the next lower floor:

```bash
npm run check:room-grid -- --fix-unreachable-platforms DATA/levels/generated/level10-collisions/room-*-grid.txt
```

It can also patch 1-row stair-step obstacles by raising the lower side to the same top height:

```bash
npm run check:room-grid -- --fix-one-step-obstacles DATA/levels/generated/level10-collisions/room-*-grid.txt
```

It can also fill small enclosed unreachable `0` pockets:

```bash
npm run check:room-grid -- --fix-enclosed-voids DATA/levels/generated/level10-collisions/room-*-grid.txt
```

## Random Collision Dataset Generator

File:

- [`generate-validated-room-collisions.ts`](/Users/balazsgalambos/git/flashback-web/src/level-generator/generate-validated-room-collisions.ts)

Package command:

```bash
npm run generate:validated-room-collisions -- [--prefer-open-areas] [--generation-attempts=1200] [--repair-max-depth=6] [--repair-max-nodes=40000] <inputRoomGridDir> [outputDir] [seed]
```

Purpose:

- discover which room ids exist from an input collision folder
- generate a new collision dataset for those rooms
- write a new adjacency JSON/TXT pair and `room-XX-grid.txt` files

Important note:

- when the input level already has a `<level>-ct-adjacency.json`, the generator reuses that source adjacency graph
- otherwise it falls back to random adjacency generation
- the generator validates the emitted dataset against the current room-grid rules before accepting it
- if bounded synthesis cannot reach a clean dataset for an authored level, it falls back to copying the validator-clean source dataset

Example:

```bash
npm run generate:validated-room-collisions -- \
  ./DATA/levels/generated/level10-collisions \
  ./DATA/levels/generated/level11-collisions
```

Default-output example:

```bash
npm run generate:validated-room-collisions -- ./DATA/levels/generated/level10-collisions
```

This writes to:

- `DATA/levels/generated/level10-collisions`

Reproducible example with explicit seed:

```bash
npm run generate:validated-room-collisions -- \
  ./DATA/levels/generated/level10-collisions \
  ./DATA/levels/generated/level11-collisions \
  123456
```

Output:

- `<outputDir>/<levelName>-ct-adjacency.json`
- `<outputDir>/<levelName>-ct-adjacency.txt`
- `<outputDir>/room-XX-grid.txt`

Notes:

- the output level name is taken from the output folder basename
- when no seed is provided, a deterministic seed is derived from the output folder name and room id list
- the generator uses the in-memory validator and bounded repair pipeline before accepting output
- for authored levels, the preferred source of truth is the source adjacency JSON and source collision grids
- the synthetic generation path is still heuristic; the authoritative guarantee comes from final validation
- `--prefer-open-areas` biases the synthetic generator toward fewer filled floor/support spans and more open `0` space across rooms

### Generate A New Level

To generate a brand new level dataset called `level11` using `level10` as the source room-id set:

```bash
npm run generate:validated-room-collisions -- \
  DATA/levels/generated/level10-collisions \
  DATA/levels/generated/level11-collisions \
  123456

npm run rebuild:ct:from-txt -- DATA/levels/generated DATA/levels/generated/level11

npx ts-node --transpile-only ./src/level-generator/generate_room_layers_from_grid.ts \
  DATA/levels/generated/level11-collisions \
  DATA/levels/generated/level11 \
  all

for back in DATA/levels/generated/level11/level11-room*-backlayer.png; do
  room_base=${back%-backlayer.png}
  front=${room_base}-frontlayer.png
  out=${room_base}.pixeldata.png
  npx ts-node --transpile-only ./src/level-generator/merge-room-layer-png.ts "$back" "$front" "$out"
done
```

This produces:

- `DATA/levels/generated/level11-collisions`
- `DATA/levels/generated/level11/level11.ct.bin`
- `DATA/levels/generated/level11/level11-roomXX-backlayer.png`
- `DATA/levels/generated/level11/level11-roomXX-frontlayer.png`
- `DATA/levels/generated/level11/level11-roomXX.pixeldata.png`

## Room Layer PNG Generator

File:

- [`generate_room_layers_from_grid.ts`](/Users/balazsgalambos/git/flashback-web/src/level-generator/generate_room_layers_from_grid.ts)

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
npx ts-node --transpile-only ./src/level-generator/generate_room_layers_from_grid.ts <collisionDir> [outputDir] [room|all]
```

Examples:

Generate one room from a generated collision dataset:

```bash
npx ts-node --transpile-only ./src/level-generator/generate_room_layers_from_grid.ts \
  DATA/levels/generated/level11-collisions \
  DATA/levels/generated/level11 \
  17
```

Generate all rooms:

```bash
npx ts-node --transpile-only ./src/level-generator/generate_room_layers_from_grid.ts \
  DATA/levels/generated/level11-collisions \
  DATA/levels/generated/level11 \
  all
```

Default-output example:

```bash
npx ts-node --transpile-only ./src/level-generator/generate_room_layers_from_grid.ts \
  DATA/levels/generated/level10-collisions \
  all
```

This writes to:

- `DATA/levels/generated/level10`

Output:

- `<outputDir>/<outputLevelName>-room<room>-backlayer.png`
- `<outputDir>/<outputLevelName>-room<room>-frontlayer.png`

Example output files:

- `DATA/levels/generated/level11/level11-room17-backlayer.png`
- `DATA/levels/generated/level11/level11-room17-frontlayer.png`

## CT Rebuild

Files:

- [`rebuild-ct-from-txt.ts`](/Users/balazsgalambos/git/flashback-web/src/level-generator/rebuild-ct-from-txt.ts)
- [`ct-array-rebuilder.ts`](/Users/balazsgalambos/git/flashback-web/src/level-generator/ct-array-rebuilder.ts)

Package command:

```bash
npm run rebuild:ct:from-txt -- <txtExportRootDir> [outputDir]
```

Example:

```bash
npm run rebuild:ct:from-txt -- DATA/levels/generated DATA/levels/generated/level10
```

Default-output example:

```bash
npm run rebuild:ct:from-txt -- DATA/levels
```

This writes rebuilt `*.ct.bin` files under:

- `DATA/levels/generated`

When `outputDir` is provided and is not `DATA/levels/generated`, the rebuild is also mirrored into:

- `DATA/levels/generated`

This rebuilds:

- `<outputDir>/<levelName>.ct.bin`

using:

- `<level>-ct-adjacency.json` for room transitions
- `room-XX-grid.txt` for room collision cells

### Regenerate A Full Level Output

To rebuild the collision binary and regenerate all room PNG artifacts for `level10` after editing collision grids:

```bash
npm run rebuild:ct:from-txt -- DATA/levels/generated DATA/levels/generated/level10
npx ts-node --transpile-only ./src/level-generator/generate_room_layers_from_grid.ts DATA/levels/generated/level10-collisions DATA/levels/generated/level10 all
for back in DATA/levels/generated/level10/level10-room*-backlayer.png; do
  room_base=${back%-backlayer.png}
  front=${room_base}-frontlayer.png
  out=${room_base}.pixeldata.png
  npx ts-node --transpile-only ./src/level-generator/merge-room-layer-png.ts "$back" "$front" "$out"
done
```

This writes:

- `DATA/levels/generated/level10/level10.ct.bin`
- `DATA/levels/generated/level10/level10-roomXX-backlayer.png`
- `DATA/levels/generated/level10/level10-roomXX-frontlayer.png`
- `DATA/levels/generated/level10/level10-roomXX.pixeldata.png`

## Adjacency TXT To JSON

File:

- [`rebuild-adjacency-json-from-txt.ts`](/Users/balazsgalambos/git/flashback-web/src/level-generator/rebuild-adjacency-json-from-txt.ts)

Package command:

```bash
npm run rebuild:adjacency:json:from-txt -- <input-adjacency.txt> <output-adjacency.json>
```

Example:

```bash
npm run rebuild:adjacency:json:from-txt -- \
  DATA/levels/generated/level10-collisions/level10-ct-adjacency.txt \
  /tmp/level10-ct-adjacency-from-txt.json
```

Notes:

- this is a lossy reconstruction
- it infers adjacency only from room positions in the rendered TXT table
- it cannot recover special CT values like `-1`
- it cannot preserve inconsistencies that were already collapsed by the visual map renderer

## Pixeldata Merge

File:

- [`merge-room-layer-png.ts`](/Users/balazsgalambos/git/flashback-web/src/level-generator/merge-room-layer-png.ts)

Usage:

```bash
npx ts-node --transpile-only ./src/level-generator/merge-room-layer-png.ts <backlayer.png> <frontlayer.png> <output.pixeldata.png>
```

Example:

```bash
npx ts-node --transpile-only ./src/level-generator/merge-room-layer-png.ts \
  DATA/levels/generated/level10/level10-room17-backlayer.png \
  DATA/levels/generated/level10/level10-room17-frontlayer.png \
  DATA/levels/generated/level10/level10-room17.pixeldata.png
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
