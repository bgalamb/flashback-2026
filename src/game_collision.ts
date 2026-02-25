import type { CollisionSlot, LivePGE } from './intern'
import type { Game } from './game'
import { CT_DOWN_ROOM, CT_LEFT_ROOM, CT_RIGHT_ROOM, CT_UP_ROOM } from './game'
import { GAMESCREEN_W } from './game_constants'
import { UINT16_MAX, UINT8_MAX } from './game_constants'

export function gameColFindPiege(game: Game, pge: LivePGE, arg2: number) {
    if (pge.collision_slot !== UINT8_MAX) {
        let slot: CollisionSlot = game._col_slotsTable[pge.collision_slot]
        while (slot) {
            if (slot.pge === pge) {
                slot = slot.prev_slot
            } else {
                if (arg2 === UINT16_MAX || arg2 === slot.pge.init_PGE.object_type) {
                    return slot.pge
                } else {
                    slot = slot.prev_slot
                }
            }
        }
    }

    return null
}

export function gameColFindCurrentCollidingObject(game: Game, pge: LivePGE, n1: number, n2: number, n3: number) {
    const res = {
        obj: 0,
        pge_out: pge
    }
    if (pge.collision_slot !== UINT8_MAX) {
        let cs: CollisionSlot = game._col_slotsTable[pge.collision_slot]
        while (cs) {
            const col_pge: LivePGE = cs.pge
            res.pge_out = col_pge

            if (col_pge.init_PGE.object_type === n1 ||
                col_pge.init_PGE.object_type === n2 ||
                col_pge.init_PGE.object_type === n3) {
                res.obj = col_pge.init_PGE.colliding_icon_num
                return res
            } else {
                cs = cs.prev_slot
            }
        }
    }
    return res
}

export function gameColPrepareRoomState(game: Game, currentRoom: number) {
    game._col_activeCollisionSlots.fill(UINT8_MAX)
    game._col_currentLeftRoom = game._res._ctData[CT_LEFT_ROOM + currentRoom]
    game._col_currentRightRoom = game._res._ctData[CT_RIGHT_ROOM + currentRoom]

    for (let i = 0; i !== game._col_collisions_slots_counter; ++i) {
        const _di: CollisionSlot = game._col_slotsTable[i]
        const room = (_di.ct_pos / 64) >> 0

        if (room === currentRoom) {
            game._col_activeCollisionSlots[0x30 + (_di.ct_pos & 0x3F)] = i
        } else if (room === game._col_currentLeftRoom) {
            game._col_activeCollisionSlots[0x00 + (_di.ct_pos & 0x3F)] = i
        } else if (room === game._col_currentRightRoom) {
            game._col_activeCollisionSlots[0x60 + (_di.ct_pos & 0x3F)] = i
        }
    }
}

export function gameColClearState(game: Game) {
    game._col_collisions_slots_counter = 0
    game._col_curSlot = game._col_slots[0]
}

export function gameColFindSlot(game: Game, pos: number) {
    for (let i = 0; i < game._col_collisions_slots_counter; ++i) {
        if (game._col_slotsTable[i].ct_pos === pos) {
            return i
        }
    }
    return -1
}

export function gameColGetGridData(game: Game, pge: LivePGE, dy: number, dx: number) {
    if (game._pge_currentPiegeFacingDir) {
        dx = -dx
    }
    const pge_grid_y = game._col_currentPiegeGridPosY + dy
    const pge_grid_x = game._col_currentPiegeGridPosX + dx
    let room_ct_data: Int8Array
    let next_room = 0
    if (pge_grid_x < 0) {
        room_ct_data = game._res._ctData.subarray(CT_LEFT_ROOM)
        next_room = room_ct_data[pge.room_location]
        if (next_room < 0) {
            return 1
        }

        room_ct_data = room_ct_data.subarray(pge_grid_x + 16 + pge_grid_y * 16 + next_room * 0x70)
        return room_ct_data[CT_DOWN_ROOM]
    } else if (pge_grid_x >= 16) {
        room_ct_data = game._res._ctData.subarray(CT_RIGHT_ROOM)
        next_room = room_ct_data[pge.room_location]
        if (next_room < 0) {
            return 1
        }
        room_ct_data = room_ct_data.subarray(pge_grid_x - 16 + pge_grid_y * 16 + next_room * 0x70)
        return room_ct_data[0x80]
    } else if (pge_grid_y < 1) {
        room_ct_data = game._res._ctData.subarray(CT_UP_ROOM)
        next_room = room_ct_data[pge.room_location]
        if (next_room < 0) {
            return 1
        }
        room_ct_data = room_ct_data.subarray(pge_grid_x + (pge_grid_y + 6) * 16 + next_room * 0x70)
        return room_ct_data[0x100]
    } else if (pge_grid_y >= 7) {
        room_ct_data = game._res._ctData.subarray(CT_DOWN_ROOM)
        next_room = room_ct_data[pge.room_location]
        if (next_room < 0) {
            return 1
        }

        room_ct_data = room_ct_data.subarray(pge_grid_x + (pge_grid_y - 6) * 16 + next_room * 0x70)
        return room_ct_data[0xC0]
    } else {
        room_ct_data = game._res._ctData.subarray(0x100)
        room_ct_data = room_ct_data.subarray(pge_grid_x + pge_grid_y * 16 + pge.room_location * 0x70)
        return room_ct_data[0]
    }
}

// dx means the distance from the PGE. EG doors react when I'm very close while monsters see me from far away
export function gameColGetGridPos(game: Game, pge: LivePGE, dx: number) {

    // so let' say a room is 100 wide and pg is at 99 and walks roght.
    // his collision zone is 99 + [10,20..] (=dx)
    // but that coordinate might be out from this room...
    let x = pge.pos_x + dx
    let y = pge.pos_y

    // TODO what's room location?
    let collision_point_within_room = pge.room_location
    if (collision_point_within_room < 0) return UINT16_MAX

    // each room has "64" collision points and they are in _ctData
    // 0->64 up room, 64->128 down room, 128->192 left room, 192->256 right room
    // collision_point_within_room is only used to exit
    // this is used to check in which room's which coordinate is now the collision
    if (x < 0) {
        collision_point_within_room = game._res._ctData[CT_LEFT_ROOM + collision_point_within_room]
        if (collision_point_within_room < 0) return UINT16_MAX
        x += GAMESCREEN_W
    } else if (x >= GAMESCREEN_W) {
        collision_point_within_room = game._res._ctData[CT_RIGHT_ROOM + collision_point_within_room]
        if (collision_point_within_room < 0) return UINT16_MAX
        x -= GAMESCREEN_W
    } else if (y < 0) {
        collision_point_within_room = game._res._ctData[CT_UP_ROOM + collision_point_within_room]
        if (collision_point_within_room < 0) return UINT16_MAX
        y += 216
    } else if (y >= 216) {
        collision_point_within_room = game._res._ctData[CT_DOWN_ROOM + collision_point_within_room]
        if (collision_point_within_room < 0) return UINT16_MAX
        y -= 216
    }

    x = (x + 8) >> 4
    y = ((y - 8) / 72) >> 0

    game.renders > game.debugStartFrame && console.log(`getGridPos x=${x} y=${y}`)

    if (x < 0 || x > 15 || y < 0 || y > 2) {
        return UINT16_MAX
    } else {
        // this constructing a number, where X bits represent x and Y represent y coordinate?
        return y * 16 + x + collision_point_within_room * 64
    }
}
// Here’s a concise, code-accurate walkthrough of what this function does and how the key variables relate.
// Purpose gameColPreparePiegeState prepares collision slots for a single LivePGE (likely a game entity) by inserting it into a collision grid/list structure maintained by game. It creates or links a chain of collision slots corresponding to multiple grid positions.
// Step-by-step
// 1.
// Early exit if no collision slots are needed
// ◦
// If pge.init_PGE.number_of_collision_segments === 0, it sets pge.collision_slot = UINT8_MAX and returns.
// ◦
// UINT8_MAX is used as “no slot”.
// 2.
// Iterate number_of_collision_segments times
// ◦
// number_of_collision_segments appears to be the number of collision "segments" to build for the entity.
// ◦
// i starts at 0, then increases by 0x10 each loop, likely stepping through multiple grid cells.
// 3.
// Pick the next collision slot
// ◦
// ct_slot2 is set to the current slot.
// ◦
// Then _col_curSlot is advanced to the next slot in _col_slots.
// 4.
// Compute grid position
// ◦
// pos = game.col_getGridPos(pge, i).
// ◦
// Debug logs show pos and _ax for the first 3 iterations.
// 5.
// Handle invalid grid positions
// ◦
// If pos < 0, the function either:
// ▪
// Sets pge.collision_slot = UINT8_MAX if this was the first slot, or
// ▪
// Marks the previous slot’s index = UINT16_MAX.
// ◦
// Then it returns.
// 6.
// Populate the slot
// ◦
// ct_slot2.ct_pos = pos
// ◦
// ct_slot2.live_pge = pge
// ◦
// ct_slot2.index = UINT16_MAX (default placeholder)
// Find or create a slot list entry
// ◦
// _ax = game.col_findSlot(pos)
// ◦
// If _ax >= 0:
// ▪
// Insert ct_slot2 at the head of _col_slotsTable[_ax].
// ▪
// Update either pge.collision_slot (first slot) or ct_slot1.index (link from previous).
// ▪
// Touch game._pge_liveTable2 and set flag 4 for this entity and the previous head, but only if they have flags & 0x80.
// ◦
// Else (no existing slot for that position):
// ▪
// Set ct_slot2.prev_slot = null.
// ▪
// Insert ct_slot2 at _col_slotsTable[_col_curPos].
// ▪
// Update pge.collision_slot or ct_slot1.index to _col_curPos.
// ▪
// Increment _col_curPos.
// 8.
// Link the chain
// ◦
// ct_slot1 = ct_slot2 so the next iteration can link back.
// ◦
// i += 0x10.
export function gameColPreparePiegeState(game: Game, pge: LivePGE) {
    let ct_previous_collision_slot: CollisionSlot = null
    let ct_current_collision_slot: CollisionSlot = null
    if (pge.init_PGE.number_of_collision_segments === 0) {
        pge.collision_slot = UINT8_MAX
        return
    }
    let i = 0
    for (let collision_segment = 0; collision_segment < pge.init_PGE.number_of_collision_segments; ++collision_segment) {
        // this is given by the game.. I guess this starts being empty
        ct_current_collision_slot = game._col_curSlot

        // _col_slots and _col_slotsTable are different things...
        // _col_slots is just a simple table for all "CollisionSlots" Total fix/max 256
        const currCollisionArrayIndex = game._col_slots.findIndex((el) => el === ct_current_collision_slot)

        //advance _col_curSlot by one in the array
        game._col_curSlot = game._col_slots[currCollisionArrayIndex + 1]

        // i=0, i=10, i=20, i=30..
        const pos = game.col_getGridPos(pge, i)

        //handle invalid grid positions
        if (pos < 0) {
            if (ct_previous_collision_slot === null) {
                pge.collision_slot = UINT8_MAX
            } else {
                ct_previous_collision_slot.index = UINT16_MAX
            }
            return
        }
        //populate the slot
        ct_current_collision_slot.ct_pos = pos // this is actually an x,y coordinate within the room.
        ct_current_collision_slot.pge = pge    // this is the PGE
        ct_current_collision_slot.index = UINT16_MAX

        // TODO find something?
        // search in _col_slotsTable and find the index of the table where it collides with something
        // col_slots_table is also a table of collisionSlots...
        // but this one only holds the CollisionSlots that collide in pos
        const _col_slot_table_idx = game.col_findSlot(pos)

        // if we found a "position" (and the index in this table) that collides
        if (_col_slot_table_idx >= 0) {
            ct_current_collision_slot.prev_slot = game._col_slotsTable[_col_slot_table_idx]
            game._col_slotsTable[_col_slot_table_idx] = ct_current_collision_slot
            // if this is the first element
            if (ct_previous_collision_slot === null) {
                pge.collision_slot = _col_slot_table_idx & 0x00FF
            }
            // if there are other slots already
            else {
                ct_previous_collision_slot.index = _col_slot_table_idx
            }
            //let temp_pge = ct_current_collision_slot.pge
            let temp_pge = pge
            if (temp_pge.flags & 0x80) {
                game._pge_liveFlatTableFilteredByRoomCurrentRoomOnly[temp_pge.index] = temp_pge
                temp_pge.flags |= 4
            }
            if (ct_current_collision_slot.prev_slot) {
                temp_pge = ct_current_collision_slot.prev_slot.pge
                if (temp_pge.flags & 0x80) {
                    game._pge_liveFlatTableFilteredByRoomCurrentRoomOnly[temp_pge.index] = temp_pge
                    temp_pge.flags |= 4
                }
            }
        } else {
            ct_current_collision_slot.prev_slot = null
            // TODO what's in _col_curPos?
            game._col_slotsTable[game._col_collisions_slots_counter] = ct_current_collision_slot
            if (ct_previous_collision_slot == null) {
                pge.collision_slot = game._col_collisions_slots_counter
            } else {
                ct_previous_collision_slot.index = game._col_collisions_slots_counter
            }
            game._col_collisions_slots_counter++
        }
        ct_previous_collision_slot = ct_current_collision_slot
        i += 0x10
    }
}
