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
