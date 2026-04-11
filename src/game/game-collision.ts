import type { CollisionSlot, LivePGE } from '../core/intern'
import type { Game } from './game'
import { ctDownRoom, ctLeftRoom, ctRightRoom, ctUpRoom } from '../core/game_constants'
import { gamescreenW, pgeFlagAutoActivate } from '../core/game_constants'
import { uint16Max } from '../core/game_constants'
import { ctGridHeight, ctGridStride, ctGridWidth, ctHeaderSize } from '../core/game_constants'
import { gameDebugLog, gameDebugTrace } from './game-debug'
import { getRuntimeRegistryState } from './game-runtime-data'

export function gameFindOverlappingPgeByObjectType(game: Game, pge: LivePGE, arg2: number) {
    if (pge.collisionSlot !== uint16Max) {
        let collisionGridPositionIndex = pge.collisionSlot
        while (collisionGridPositionIndex !== uint16Max) {
            const slotBucket = game.collision.dynamicPgeCollisionSlotsByPosition.get(collisionGridPositionIndex)
            let nextCollisionGridPositionIndex = uint16Max
            if (slotBucket) {
                for (const slot of slotBucket) {
                    if (slot.pge === pge) {
                        nextCollisionGridPositionIndex = slot.index
                    } else if (arg2 === uint16Max || arg2 === slot.pge.initPge.objectType) {
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
        pgeOut: pge
    }
    if (pge.collisionSlot !== uint16Max) {
        let collisionGridPositionIndex = pge.collisionSlot
        while (collisionGridPositionIndex !== uint16Max) {
            const slotBucket = game.collision.dynamicPgeCollisionSlotsByPosition.get(collisionGridPositionIndex)
            let nextCollisionGridPositionIndex = uint16Max
            if (slotBucket) {
                for (const slot of slotBucket) {
                    const colPge: LivePGE = slot.pge
                    res.pgeOut = colPge
                    if (slot.pge === pge) {
                        nextCollisionGridPositionIndex = slot.index
                    } else if (colPge.initPge.objectType === n1 ||
                        colPge.initPge.objectType === n2 ||
                        colPge.initPge.objectType === n3) {
                        res.obj = colPge.initPge.collidingIconNum
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
    game.collision.activeRoomCollisionSlotWindow.left.fill(null)
    game.collision.activeRoomCollisionSlotWindow.current.fill(null)
    game.collision.activeRoomCollisionSlotWindow.right.fill(null)
    game.collision.activeCollisionLeftRoom = game.services.res.level.ctData[ctLeftRoom + currentRoom]
    game.collision.activeCollisionRightRoom = game.services.res.level.ctData[ctRightRoom + currentRoom]

    game.collision.dynamicPgeCollisionSlotsByPosition.forEach((slotBucket, collisionGridPositionIndex) => {
        const localIndex = collisionGridPositionIndex & 0x3F
        const room = (collisionGridPositionIndex / 64) >> 0

        if (room === currentRoom) {
            game.collision.activeRoomCollisionSlotWindow.current[localIndex] = slotBucket
        } else if (room === game.collision.activeCollisionLeftRoom) {
            game.collision.activeRoomCollisionSlotWindow.left[localIndex] = slotBucket
        } else if (room === game.collision.activeCollisionRightRoom) {
            game.collision.activeRoomCollisionSlotWindow.right[localIndex] = slotBucket
        }
    })
    gameDebugLog(game, 'collision', `[collision-window] room=${currentRoom} left=${game.collision.activeCollisionLeftRoom} right=${game.collision.activeCollisionRightRoom} currentBuckets=${game.collision.activeRoomCollisionSlotWindow.current.filter(Boolean).length} leftBuckets=${game.collision.activeRoomCollisionSlotWindow.left.filter(Boolean).length} rightBuckets=${game.collision.activeRoomCollisionSlotWindow.right.filter(Boolean).length}`)
}

export function gameClearDynamicCollisionSlotState(game: Game) {
    game.collision.nextFreeDynamicPgeCollisionSlotPoolIndex = 0
    game.collision.dynamicPgeCollisionSlotsByPosition.clear()
}

export function gameFindCollisionSlotBucketByGridPosition(game: Game, pos: number) {
    return game.collision.dynamicPgeCollisionSlotsByPosition.get(pos) || null
}

export function gameGetRoomCollisionGridData(game: Game, pge: LivePGE, dy: number, dx: number) {
    if (game.pge.currentPgeFacingIsMirrored) {
        dx = -dx
    }
    const pgeGridY = game.collision.currentPgeCollisionGridY + dy
    const pgeGridX = game.collision.currentPgeCollisionGridX + dx
    let roomCtData: Int8Array
    let nextRoom = 0
    if (pgeGridX < 0) {
        roomCtData = game.services.res.level.ctData.subarray(ctLeftRoom)
        nextRoom = roomCtData[pge.roomLocation]
        if (nextRoom < 0) {
            return 1
        }

        roomCtData = roomCtData.subarray(pgeGridX + ctGridWidth + pgeGridY * ctGridWidth + nextRoom * ctGridStride)
        return roomCtData[ctDownRoom]
    } else if (pgeGridX >= ctGridWidth) {
        roomCtData = game.services.res.level.ctData.subarray(ctRightRoom)
        nextRoom = roomCtData[pge.roomLocation]
        if (nextRoom < 0) {
            return 1
        }
        roomCtData = roomCtData.subarray(pgeGridX - ctGridWidth + pgeGridY * ctGridWidth + nextRoom * ctGridStride)
        return roomCtData[0x80]
    } else if (pgeGridY < 1) {
        roomCtData = game.services.res.level.ctData.subarray(ctUpRoom)
        nextRoom = roomCtData[pge.roomLocation]
        if (nextRoom < 0) {
            return 1
        }
        roomCtData = roomCtData.subarray(pgeGridX + (pgeGridY + ctGridHeight - 1) * ctGridWidth + nextRoom * ctGridStride)
        return roomCtData[0x100]
    } else if (pgeGridY >= ctGridHeight) {
        roomCtData = game.services.res.level.ctData.subarray(ctDownRoom)
        nextRoom = roomCtData[pge.roomLocation]
        if (nextRoom < 0) {
            return 1
        }

        roomCtData = roomCtData.subarray(pgeGridX + (pgeGridY - (ctGridHeight - 1)) * ctGridWidth + nextRoom * ctGridStride)
        return roomCtData[0xC0]
    } else {
        roomCtData = game.services.res.level.ctData.subarray(ctHeaderSize)
        roomCtData = roomCtData.subarray(pgeGridX + pgeGridY * ctGridWidth + pge.roomLocation * ctGridStride)
        return roomCtData[0]
    }
}

// dx means the distance from the PGE. EG doors react when I'm very close while monsters see me from far away
export function gameGetCollisionLanePositionIndexByXY(game: Game, pge: LivePGE, dx: number) {

    let x = pge.posX + dx
    let y = pge.posY

    let collisionPointWithinRoom = pge.roomLocation
    if (collisionPointWithinRoom < 0) return uint16Max

    // each room has "64" collision points and they are in level.ctData
    // 0->64 up room, 64->128 down room, 128->192 left room, 192->256 right room
    // collision_point_within_room is only used to exit
    // this is used to check in which room's which coordinate is now the collision
    if (x < 0) {
        collisionPointWithinRoom = game.services.res.level.ctData[ctLeftRoom + collisionPointWithinRoom]
        if (collisionPointWithinRoom < 0) return uint16Max
        x += gamescreenW
    } else if (x >= gamescreenW) {
        collisionPointWithinRoom = game.services.res.level.ctData[ctRightRoom + collisionPointWithinRoom]
        if (collisionPointWithinRoom < 0) return uint16Max
        x -= gamescreenW
    } else if (y < 0) {
        collisionPointWithinRoom = game.services.res.level.ctData[ctUpRoom + collisionPointWithinRoom]
        if (collisionPointWithinRoom < 0) return uint16Max
        y += 216
    } else if (y >= 216) {
        collisionPointWithinRoom = game.services.res.level.ctData[ctDownRoom + collisionPointWithinRoom]
        if (collisionPointWithinRoom < 0) return uint16Max
        y -= 216
    }

    // Convert pixel-space XY into the coarse collision-lane grid used by dynamic PGE occupancy.
    // X becomes a 16-pixel-wide column index, while Y is collapsed into 3 broad gameplay bands
    // (top, middle, bottom) instead of using the full 16x7 room collision grid.
    x = (x + 8) >> 4
    y = ((y - 8) / 72) >> 0

    gameDebugTrace(game, 'collision', `getGridPos x=${x} y=${y}`)

    if (x < 0 || x > ctGridWidth - 1 || y < 0 || y > 2) {
        return uint16Max
    } else {
        // collision_grid_position_index is a packed value: local lane-cell index within the room
        // plus the room number encoded as room * 64, so the slot identifies both cell and room.
        // The local part also encodes which of the 3 vertical gameplay lanes this occupies:
        // lane 0 => 0..15, lane 1 => 16..31, lane 2 => 32..47.
        return y * 16 + x + collisionPointWithinRoom * 64
    }
}
export function gameRegisterPgeCollisionSegments(game: Game, pge: LivePGE) {
    const runtime = getRuntimeRegistryState(game)
    let previousPgeCollisionSegmentSlot: CollisionSlot = null
    let currentPgeCollisionSegmentSlot: CollisionSlot = null
    if (pge.initPge.numberOfCollisionSegments === 0) {
        pge.collisionSlot = uint16Max
        return
    }
    let i = 0
    // Each collision segment samples the PGE footprint at 16-pixel horizontal intervals.
    for (let collisionSegment = 0; collisionSegment < pge.initPge.numberOfCollisionSegments; ++collisionSegment, i += 0x10) {
        currentPgeCollisionSegmentSlot = game.collision.dynamicPgeCollisionSlotObjectPool[game.collision.nextFreeDynamicPgeCollisionSlotPoolIndex]
        game.collision.nextFreeDynamicPgeCollisionSlotPoolIndex++

        const pos = gameGetCollisionLanePositionIndexByXY(game, pge, i)

        // UINT16_MAX means this segment does not map to a valid collision lane cell.
        if (pos === uint16Max) {
            if (previousPgeCollisionSegmentSlot === null) {
                pge.collisionSlot = uint16Max
            } else {
                previousPgeCollisionSegmentSlot.index = uint16Max
            }
            return
        }

        currentPgeCollisionSegmentSlot.collisionGridPositionIndex = pos
        currentPgeCollisionSegmentSlot.pge = pge
        currentPgeCollisionSegmentSlot.index = uint16Max

        const existingSlotBucket = gameFindCollisionSlotBucketByGridPosition(game, pos)
        if (existingSlotBucket) {
            existingSlotBucket.push(currentPgeCollisionSegmentSlot)
        } else {
            game.collision.dynamicPgeCollisionSlotsByPosition.set(pos, [currentPgeCollisionSegmentSlot])
        }

        // Keep the PGE's own segment chain in collision_slot/index as packed position keys.
        if (previousPgeCollisionSegmentSlot === null) {
            pge.collisionSlot = pos
        } else {
            previousPgeCollisionSegmentSlot.index = pos
        }
        let tempPge = pge
        if (tempPge.flags & pgeFlagAutoActivate) {
            runtime.livePgeStore.activeFrameByIndex[tempPge.index] = tempPge
            tempPge.flags |= 4
        }
        if (existingSlotBucket) {
            for (const slot of existingSlotBucket) {
                tempPge = slot.pge
                if (tempPge.flags & pgeFlagAutoActivate) {
                    runtime.livePgeStore.activeFrameByIndex[tempPge.index] = tempPge
                    tempPge.flags |= 4
                }
            }
        }
        const bucketPges = (game.collision.dynamicPgeCollisionSlotsByPosition.get(pos) || []).map((slot) => slot.pge?.index ?? -1).join(',')
        gameDebugLog(game, 'collision', `[collision-segment] pge=${pge.index} segment=${collisionSegment} pos=${pos} room=${pge.roomLocation} bucket=[${bucketPges}]`)
        previousPgeCollisionSegmentSlot = currentPgeCollisionSegmentSlot

    }
}
