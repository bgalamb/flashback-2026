import type { CollisionSlot, LivePGE } from './intern'
import type { Game } from './game'
import { CT_DOWN_ROOM, CT_LEFT_ROOM, CT_RIGHT_ROOM, CT_UP_ROOM } from './game'
import { GAMESCREEN_W } from './game_constants'
import { UINT16_MAX } from './game_constants'
import { CT_GRID_HEIGHT, CT_GRID_STRIDE, CT_GRID_WIDTH, CT_HEADER_SIZE } from './game_constants'

export function gameFindOverlappingPgeByObjectType(game: Game, pge: LivePGE, arg2: number) {
    if (pge.collision_slot !== UINT16_MAX) {
        let collisionGridPositionIndex = pge.collision_slot
        while (collisionGridPositionIndex !== UINT16_MAX) {
            const slotBucket = game._dynamicPgeCollisionSlotsByPosition.get(collisionGridPositionIndex)
            let nextCollisionGridPositionIndex = UINT16_MAX
            if (slotBucket) {
                for (const slot of slotBucket) {
                    if (slot.pge === pge) {
                        nextCollisionGridPositionIndex = slot.index
                    } else if (arg2 === UINT16_MAX || arg2 === slot.pge.init_PGE.object_type) {
                        return slot.pge
                    }
                }
            }
            collisionGridPositionIndex = nextCollisionGridPositionIndex
        }
    }

    return null
}

export function gameFindFirstMatchingCollidingObject(game: Game, pge: LivePGE, n1: number, n2: number, n3: number) {
    const res = {
        obj: 0,
        pge_out: pge
    }
    if (pge.collision_slot !== UINT16_MAX) {
        let collisionGridPositionIndex = pge.collision_slot
        while (collisionGridPositionIndex !== UINT16_MAX) {
            const slotBucket = game._dynamicPgeCollisionSlotsByPosition.get(collisionGridPositionIndex)
            let nextCollisionGridPositionIndex = UINT16_MAX
            if (slotBucket) {
                for (const slot of slotBucket) {
                    const col_pge: LivePGE = slot.pge
                    res.pge_out = col_pge
                    if (slot.pge === pge) {
                        nextCollisionGridPositionIndex = slot.index
                    } else if (col_pge.init_PGE.object_type === n1 ||
                        col_pge.init_PGE.object_type === n2 ||
                        col_pge.init_PGE.object_type === n3) {
                        res.obj = col_pge.init_PGE.colliding_icon_num
                        return res
                    }
                }
            }
            collisionGridPositionIndex = nextCollisionGridPositionIndex
        }
    }
    return res
}

export function gameRebuildActiveRoomCollisionSlotLookup(game: Game, currentRoom: number) {
    game._activeRoomCollisionSlotWindow.left.fill(null)
    game._activeRoomCollisionSlotWindow.current.fill(null)
    game._activeRoomCollisionSlotWindow.right.fill(null)
    game._activeCollisionLeftRoom = game._res._ctData[CT_LEFT_ROOM + currentRoom]
    game._activeCollisionRightRoom = game._res._ctData[CT_RIGHT_ROOM + currentRoom]

    game._dynamicPgeCollisionSlotsByPosition.forEach((slotBucket, collisionGridPositionIndex) => {
        const localIndex = collisionGridPositionIndex & 0x3F
        const room = (collisionGridPositionIndex / 64) >> 0

        if (room === currentRoom) {
            game._activeRoomCollisionSlotWindow.current[localIndex] = slotBucket
        } else if (room === game._activeCollisionLeftRoom) {
            game._activeRoomCollisionSlotWindow.left[localIndex] = slotBucket
        } else if (room === game._activeCollisionRightRoom) {
            game._activeRoomCollisionSlotWindow.right[localIndex] = slotBucket
        }
    })
}

export function gameClearDynamicCollisionSlotState(game: Game) {
    game._nextFreeDynamicPgeCollisionSlotPoolIndex = 0
    game._dynamicPgeCollisionSlotsByPosition.clear()
}

export function gameFindCollisionSlotBucketByGridPosition(game: Game, pos: number) {
    return game._dynamicPgeCollisionSlotsByPosition.get(pos) || null
}

export function gameGetRoomCollisionGridData(game: Game, pge: LivePGE, dy: number, dx: number) {
    if (game._currentPgeFacingIsMirrored) {
        dx = -dx
    }
    const pge_grid_y = game._currentPgeCollisionGridY + dy
    const pge_grid_x = game._currentPgeCollisionGridX + dx
    let room_ct_data: Int8Array
    let next_room = 0
    if (pge_grid_x < 0) {
        room_ct_data = game._res._ctData.subarray(CT_LEFT_ROOM)
        next_room = room_ct_data[pge.room_location]
        if (next_room < 0) {
            return 1
        }

        room_ct_data = room_ct_data.subarray(pge_grid_x + CT_GRID_WIDTH + pge_grid_y * CT_GRID_WIDTH + next_room * CT_GRID_STRIDE)
        return room_ct_data[CT_DOWN_ROOM]
    } else if (pge_grid_x >= CT_GRID_WIDTH) {
        room_ct_data = game._res._ctData.subarray(CT_RIGHT_ROOM)
        next_room = room_ct_data[pge.room_location]
        if (next_room < 0) {
            return 1
        }
        room_ct_data = room_ct_data.subarray(pge_grid_x - CT_GRID_WIDTH + pge_grid_y * CT_GRID_WIDTH + next_room * CT_GRID_STRIDE)
        return room_ct_data[0x80]
    } else if (pge_grid_y < 1) {
        room_ct_data = game._res._ctData.subarray(CT_UP_ROOM)
        next_room = room_ct_data[pge.room_location]
        if (next_room < 0) {
            return 1
        }
        room_ct_data = room_ct_data.subarray(pge_grid_x + (pge_grid_y + CT_GRID_HEIGHT - 1) * CT_GRID_WIDTH + next_room * CT_GRID_STRIDE)
        return room_ct_data[0x100]
    } else if (pge_grid_y >= CT_GRID_HEIGHT) {
        room_ct_data = game._res._ctData.subarray(CT_DOWN_ROOM)
        next_room = room_ct_data[pge.room_location]
        if (next_room < 0) {
            return 1
        }

        room_ct_data = room_ct_data.subarray(pge_grid_x + (pge_grid_y - (CT_GRID_HEIGHT - 1)) * CT_GRID_WIDTH + next_room * CT_GRID_STRIDE)
        return room_ct_data[0xC0]
    } else {
        room_ct_data = game._res._ctData.subarray(CT_HEADER_SIZE)
        room_ct_data = room_ct_data.subarray(pge_grid_x + pge_grid_y * CT_GRID_WIDTH + pge.room_location * CT_GRID_STRIDE)
        return room_ct_data[0]
    }
}

// dx means the distance from the PGE. EG doors react when I'm very close while monsters see me from far away
export function gameGetCollisionLanePositionIndexByXY(game: Game, pge: LivePGE, dx: number) {

    let x = pge.pos_x + dx
    let y = pge.pos_y

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

    // Convert pixel-space XY into the coarse collision-lane grid used by dynamic PGE occupancy.
    // X becomes a 16-pixel-wide column index, while Y is collapsed into 3 broad gameplay bands
    // (top, middle, bottom) instead of using the full 16x7 room collision grid.
    x = (x + 8) >> 4
    y = ((y - 8) / 72) >> 0

    game.renders > game.debugStartFrame && console.log(`getGridPos x=${x} y=${y}`)

    if (x < 0 || x > CT_GRID_WIDTH - 1 || y < 0 || y > 2) {
        return UINT16_MAX
    } else {
        // collision_grid_position_index is a packed value: local lane-cell index within the room
        // plus the room number encoded as room * 64, so the slot identifies both cell and room.
        // The local part also encodes which of the 3 vertical gameplay lanes this occupies:
        // lane 0 => 0..15, lane 1 => 16..31, lane 2 => 32..47.
        return y * 16 + x + collision_point_within_room * 64
    }
}
export function gameRegisterPgeCollisionSegments(game: Game, pge: LivePGE) {
    let previousPgeCollisionSegmentSlot: CollisionSlot = null
    let currentPgeCollisionSegmentSlot: CollisionSlot = null
    if (pge.init_PGE.number_of_collision_segments === 0) {
        pge.collision_slot = UINT16_MAX
        return
    }
    let i = 0
    // Each collision segment samples the PGE footprint at 16-pixel horizontal intervals.
    for (let collision_segment = 0; collision_segment < pge.init_PGE.number_of_collision_segments; ++collision_segment, i += 0x10) {
        currentPgeCollisionSegmentSlot = game._dynamicPgeCollisionSlotObjectPool[game._nextFreeDynamicPgeCollisionSlotPoolIndex]
        game._nextFreeDynamicPgeCollisionSlotPoolIndex++

        const pos = gameGetCollisionLanePositionIndexByXY(game, pge, i)

        // UINT16_MAX means this segment does not map to a valid collision lane cell.
        if (pos === UINT16_MAX) {
            if (previousPgeCollisionSegmentSlot === null) {
                pge.collision_slot = UINT16_MAX
            } else {
                previousPgeCollisionSegmentSlot.index = UINT16_MAX
            }
            return
        }

        currentPgeCollisionSegmentSlot.collision_grid_position_index = pos
        currentPgeCollisionSegmentSlot.pge = pge
        currentPgeCollisionSegmentSlot.index = UINT16_MAX

        const existingSlotBucket = gameFindCollisionSlotBucketByGridPosition(game, pos)
        if (existingSlotBucket) {
            existingSlotBucket.push(currentPgeCollisionSegmentSlot)
        } else {
            game._dynamicPgeCollisionSlotsByPosition.set(pos, [currentPgeCollisionSegmentSlot])
        }

        // Keep the PGE's own segment chain in collision_slot/index as packed position keys.
        if (previousPgeCollisionSegmentSlot === null) {
            pge.collision_slot = pos
        } else {
            previousPgeCollisionSegmentSlot.index = pos
        }
        let temp_pge = pge
        if (temp_pge.flags & 0x80) {
            game._livePgeStore.activeFrameByIndex[temp_pge.index] = temp_pge
            temp_pge.flags |= 4
        }
        if (existingSlotBucket) {
            for (const slot of existingSlotBucket) {
                temp_pge = slot.pge
                if (temp_pge.flags & 0x80) {
                    game._livePgeStore.activeFrameByIndex[temp_pge.index] = temp_pge
                    temp_pge.flags |= 4
                }
            }
        }
        previousPgeCollisionSegmentSlot = currentPgeCollisionSegmentSlot

    }
}
