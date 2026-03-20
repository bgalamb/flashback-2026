# How flashback works

## Level loading and rooms
Level are loaded from level<n>.ct.bin files.
This file contains two sections:
- Level header
- Rooms

The level header is always 0x10 bytes long. This contains the room map. Which rooms is present in the level,
and which is UP,DOWN,LEFT,RIGHT of each room. 0x00 means no room. The file is 0xC0 + 0x40 + 16x7 bytes long.
Collision data is like an array of arrays. Rooms "data" in the header is indexed by the following constants:
```
const CT_ROOM_SIZE = 0x40
const CT_UP_ROOM = 0x00
const CT_DOWN_ROOM = 0x40
const CT_RIGHT_ROOM = 0x80
const CT_LEFT_ROOM = 0xC0
```
So for room 2, CT_UP_ROOM is 0x02, CT_DOWN_ROOM is 0x42, CT_RIGHT_ROOM is 0x82, CT_LEFT_ROOM is 0xC2.
At this address wi will find the index of the room in the room map.
The index will point to where the room data (array nr.2 ) which holds the 16x7 tile data starts.


This file can be rebuilt from the level files that ct_adjacency and ct_grid exporter script generates.
These files will contain the adjacency map generated in ascii art table for easy understanding and the grid map of each room.
in the grid map 0 means no obstacle, while 1 means wall or walkway. In some rarae cases, it can be 2? for a dynamical walkway.
See this folder for the outputs of the exporter script. `DATA/decoded-room-static-collisions-all-flat`

It's important to note that the grid data for a room is exacltly 17x6 bytes long, because it's 17x6 tiles.

## Room image layer drawing loading and rooms
Each room has a layer of image data. it's all stored in one canvas, where we populate and paing the pixels.
The pixeldata is completely separated from the colors. Coloring is the last step.
Each pixel is two bytes long, eg: 0x31 means this pixel uses the 1.st color from the 3rd palette. Each palette has 16 colors.
But there can be 16 palettes in total. Each palette color uses RGB encoding and can effectively have FFFFFF (16^6) colors + transparency.

At the end when all pixeldata has been loadad, the enginge will color the pixels in ascendin order.
So first pixels from the first palette, then second etc. This way the palette index also represents the layer priority.
So things we want to see in the front is the one fron the highest palette index.


Palette slots are loaded from the level file, or it might have dedicated palette files.(for conrad, monsters etc)
For drawing the rooms, only 4 palettes are used, and they are read from the level file.

See:
```
// background
this.setPaletteColors(0x0, jsonColors.slot1)
// objects
this.setPaletteColors(0x1, jsonColors.slot2)
this.setPaletteColors(0x2, jsonColors.slot3)
this.setPaletteColors(0x3, jsonColors.slot4)
// conrad
if (this._unkPalSlot1 === this._map_palette_offset_slot3) {
    this.setPaletteSlotLE(4, Video._conrad_palette1)
} else {
    this.setPaletteSlotLE(4, Video._conrad_palette2)
}
// slot 5 is monster palette
// foreground
this.setPaletteColors(0x8, jsonColors.slot1)
this.setPaletteColors(0x9, level === 0 ? jsonColors.slot1 : jsonColors.slot2)
// inventory
const inventoryColors = this.getJsonPaletteColorsForOffset(level, this._unkPalSlot2) || jsonColors.slot3
this.setPaletteColors(0xA, inventoryColors)
this.setPaletteColors(0xB, jsonColors.slot4)
this.setTextPalette()
```

## Adding a door and switch to a room

The fastest working pattern is to copy the level 1 room 37 door/switch pair and then adapt it.

Reference files:

- [DATA/levels/level1/level1.pge.json](/Users/balazsgalambos/git/flashback-web/DATA/levels/level1/level1.pge.json)
- [DATA/levels/level1/level1.obj.json](/Users/balazsgalambos/git/flashback-web/DATA/levels/level1/level1.obj.json)
- [DATA/levels/level10/level10.pge.json](/Users/balazsgalambos/git/flashback-web/DATA/levels/level10/level10.pge.json)
- [DATA/levels/level10/level10.obj.json](/Users/balazsgalambos/git/flashback-web/DATA/levels/level10/level10.obj.json)

### What has to exist

You need 4 pieces to line up:

1. A door PGE in `levelX.pge.json`
2. A switch PGE in `levelX.pge.json`
3. A switch object node in `levelX.obj.json`
4. A door object node in `levelX.obj.json`

If any of those 4 are missing or point at the wrong index, the level will either fail to load or the door will not react.

### PGE setup

Door:

- `object_type: 6`
- use `type: 289` for the normal door/barrier family
- `obj_node_number` must point to the door node in `levelX.obj.json`
- `counter_values` can stay `[0, 0, 0, 0]`

Switch:

- `object_type: 7`
- `counter_values[0]` must be the PGE index of the target door
- `obj_node_number` must point to the switch node in `levelX.obj.json`

Working level10 example:

- door PGE index `1`
  - room `17`
  - grid `(10,5)` -> `pos_x: 160`, `pos_y: 214`
  - `type: 289`
  - `object_type: 6`
  - `obj_node_number: 10`
- switch PGE index `2`
  - room `17`
  - grid `(6,5)` -> `pos_x: 96`, `pos_y: 214`
  - `type: 327`
  - `object_type: 7`
  - `obj_node_number: 2`
  - `counter_values: [1, 0, 0, 0]`

Grid conversion used here:

- `pos_x = grid_x * 16`
- floor rows used in this project are typically:
  - top lane `pos_y = 70`
  - middle lane `pos_y = 142`
  - bottom lane `pos_y = 214`

### OBJ setup

The easiest approach is to copy the logic pattern from level 1 room 37.

Switch node pattern:

- level 1 uses node `2`
- it emits signal `20`
- it uses `opcode2: 61` and `opcode3: 35`
- the target door is looked up through the switch PGE `counter_values[0]`

Door node pattern:

- level 1 uses node `9`
- it waits for signal `20`
- then it steps through the `289 -> 291 -> ... -> 290` door states

Working level10 example:

- switch logic copied into `objectNodesMap[2]`
- door logic copied into `objectNodesMap[10]`
- `numObjectNodes` increased to `11`

Important:

- `obj_node_number` in the PGE must be `< numObjectNodes`
- the node index must actually exist in `objectNodesMap`
- the PGE initial `type` must match one of the node entry `type` values

If those do not line up, you will hit load-time errors in `game_pge.ts`.

### Which switch state pair to use by lane

Verified stock switch placements:

- top lane `pos_y = 70`
  - stock `307/306` works
  - verified by level 1 room 35 switch PGE `3`
- middle lane `pos_y = 142`
  - stock `307/306` works
  - verified by level 1 room 37 switch PGE `6`
- bottom lane `pos_y = 214`
  - stock `307/306` can also work
  - verified by level 1 room 47 elevator switch PGE `16`

So the default choice is still:

- idle `307`
- activated `306`

The custom level10 pair is not a general bottom-lane requirement. It is a level10 room17-specific workaround that we kept because that setup was already validated and gave the desired visible blink/chirp behavior there.

For the custom level10 room17-style bottom-floor switch, use:

- idle `327`
- activated `328`

These states were added in:

- [DATA/level10.ani](/Users/balazsgalambos/git/flashback-web/DATA/level10.ani)

Current behavior of the custom level10 pair:

- `327` is the visible idle state
- `328` is the visible activated blink state
- `328` has the chirp sound
- `328` was extended to a `17` frame hold so it chirps at the same cadence as the stock switch

### Palette / colors

Doors, switches, and elevators now render through a dedicated runtime palette slot `0x6`.

Current implementation:

- [src/game_world.ts](/Users/balazsgalambos/git/flashback-web/src/game_world.ts)
- [src/game_draw.ts](/Users/balazsgalambos/git/flashback-web/src/game_draw.ts)
- [src/video.ts](/Users/balazsgalambos/git/flashback-web/src/video.ts)

Important details:

- only `object_type 6`, `7`, and `8` are routed to slot `0x6`
- slot `0x6` is resolved from the current level palette header `slot1` mapping
- this is global runtime behavior, not level10-only

This was needed because the room PNG foreground banks and runtime object colors were otherwise interfering with each other.

### Common door / switch states

Useful states to recognize quickly:

- `307`
  - stock switch idle state
  - one-frame resting image
  - used by original level 1 switches
- `306`
  - stock switch activated state
  - blinking / chirping animation
  - normally transitions back to `307`
- `327`
  - custom level10 switch idle state
  - only needed for the custom validated level10 room17 variant
- `328`
  - custom level10 switch activated state
  - custom blink/chirp partner for `327`
- `289`
  - door idle / closed base state used by the room37-style barrier
- `291` to `297`
  - intermediate door animation states
- `290`
  - final steady door state in that room37-style door sequence
- `352`
  - elevator upper resting state
  - use this when the elevator starts high and should move down when called
- `349`
  - elevator lower resting state
  - use this when the elevator starts low and should move up when called
- `353`, `354`, `350`, `351`, `357`, `358`
  - elevator transition / movement states used by the reusable level1 elevator controller
- `355`
  - elevator busy / hold state inside the same controller family

### Adding an elevator and switch

The reusable elevator example is level 1:

- room `47` for the upper-to-lower variant
- room `38` for the lower-to-upper variant

Reference files:

- [DATA/levels/level1/level1.pge.json](/Users/balazsgalambos/git/flashback-web/DATA/levels/level1/level1.pge.json)
- [DATA/levels/level1/level1.obj.json](/Users/balazsgalambos/git/flashback-web/DATA/levels/level1/level1.obj.json)
- [DATA/levels/level10/level10.pge.json](/Users/balazsgalambos/git/flashback-web/DATA/levels/level10/level10.pge.json)
- [DATA/levels/level10/level10.obj.json](/Users/balazsgalambos/git/flashback-web/DATA/levels/level10/level10.obj.json)

You need 4 pieces:

1. elevator PGE
2. switch PGE
3. elevator OBJ node
4. switch OBJ node

### Elevator PGE setup

Use:

- `object_type: 8`
- `number_of_collision_segments: 4`
- `flags: 3`
- `life: 1`

Choose the initial elevator state from the direction you want:

- `type: 352`
  - elevator starts in the upper position
  - intended call direction is down
  - reusable controller branch begins at node16 entry type `352`
- `type: 349`
  - elevator starts in the lower position
  - intended call direction is up
  - reusable controller branch begins at node16 entry type `349`

### Elevator switch setup

Use:

- `object_type: 7`
- `type: 307`
- `counter_values[0] = <elevator PGE index>`

There are two reusable floor-switch variants:

- switch node `12`
  - use with the `352` elevator branch
  - sends signal `21`
  - original example: level1 room47 elevator switch
- switch node `11`
  - use with the `349` elevator branch
  - sends signal `20`
  - original example: level1 room38 elevator switch

So the matching pairs are:

- `352` elevator + switch node `12`
- `349` elevator + switch node `11`

Do not mix those unless you intentionally want the opposite travel direction.

### Reusable elevator controller node

The reusable elevator controller is level1 `objectNodesMap[16]`.

It contains both main branches:

- entries with `type 352`
  - upper-rest branch
  - call signal `21`
  - drives the elevator down
- entries with `type 349`
  - lower-rest branch
  - call signal `20`
  - drives the elevator up

This is why the elevator direction is determined by both:

- the elevator PGE initial `type`
- the matching switch node signal id

### Working level10 example

Current room18 example in level10:

- elevator PGE index `3`
  - room `18`
  - start position `(0,4)` -> `pos_x: 0`, `pos_y: 142`
  - `type: 352`
  - `obj_node_number: 12`
- switch PGE index `4`
  - room `18`
  - position `(6,6)` -> `pos_x: 96`, `pos_y: 214`
  - `type: 307`
  - `obj_node_number: 11`
  - `counter_values[0] = 3`

Important note:

- the room18 example keeps the reusable elevator controller in node `12`
- but its switch logic was copied separately into node `11`
- always verify the signal id in the switch node against the elevator branch you want

### Elevator sound gotcha

The rapid chirping we hit was not the switch chirp. It came from elevator movement states in `level10.ani`.

Movement states can carry their own sound bytes, for example:

- `353`
- `350`
- `358`

If the elevator movement sound is wrong or too repetitive:

1. inspect the ANI sound byte for the elevator transition states
2. mute or change those states instead of changing the switch chirp

The switch chirp is still the normal stock switch sound from `306`.

### Fast elevator recipe

For the next elevator edit:

1. Add the elevator PGE with `object_type: 8`.
2. Choose start state:
   - upper/down variant: `352`
   - lower/up variant: `349`
3. Add the switch PGE with `object_type: 7`, `type: 307`, and `counter_values[0] = elevator index`.
4. Copy the reusable elevator controller branch from level1 node `16`.
5. Copy the matching switch node:
   - node `12` for signal `21`
   - node `11` for signal `20`
6. Make sure `obj_node_number`, PGE initial `type`, and `numObjectNodes` all match.
7. If the movement sound is wrong, check elevator ANI states before changing the switch.

### Static room art

The animated switch sprite does not include the whole switch housing.

The small blinking/beeping part is runtime sprite animation, but the grey body seen in original rooms is static room art in the room PNG layers.

So if you place a switch in a new room and only add the PGE/OBJ data:

- the switch can work
- the beeper can blink/chirp
- but the housing may still be missing until you paint it into the room art

Do not treat this as a runtime bug unless the original room art already contains the housing.

### Rebuild checklist

After changing a door/switch setup:

1. Validate JSON and TypeScript:
   - `npm run check -- --pretty false`
2. Rebuild the frontend bundle if runtime code changed:
   - `npm run build`
3. If collision grids changed, rebuild:
   - `levelX.ct.bin`
   - room PNGs
4. If you want generated outputs, write them to:
   - `DATA/levels/generated/levelX`

For level10 in this repo, the generated target folder used during rebuilds is:

- [DATA/levels/generated/level10](/Users/balazsgalambos/git/flashback-web/DATA/levels/generated/level10)

### Fast recipe

For the next door/switch edit:

1. Copy the room 37 level 1 door PGE and switch PGE.
2. Change room id and `pos_x` / `pos_y`.
3. Set switch `counter_values[0]` to the new door PGE index.
4. Copy level 1 node `2` into a free OBJ node for the switch.
5. Copy level 1 node `9` into a free OBJ node for the door.
6. Point the PGEs at those new node indices.
7. Increase `numObjectNodes` if needed.
8. Default to stock switch states `307/306`.
9. Only use the level10 custom `327/328` pair if you specifically need the validated level10 room17-style bottom-floor variant.
10. If the housing is missing, add it to the room art separately.
