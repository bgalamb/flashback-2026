import type { CollisionSlot, LivePGE } from './intern'
import type { Game } from './game'
import { CT_DOWN_ROOM, CT_LEFT_ROOM, CT_RIGHT_ROOM, CT_UP_ROOM } from './game'
import { GAMESCREEN_W } from './configs/config'

export function gameColFindPiege(game: Game, pge: LivePGE, arg2: number) {
    if (pge.collision_slot !== 0xFF) {
        let slot: CollisionSlot = game._col_slotsTable[pge.collision_slot]
        while (slot) {
            if (slot.live_pge === pge) {
                slot = slot.prev_slot
            } else {
                if (arg2 === 0xFFFF || arg2 === slot.live_pge.init_PGE.object_type) {
                    return slot.live_pge
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
    if (pge.collision_slot !== 0xFF) {
        let cs: CollisionSlot = game._col_slotsTable[pge.collision_slot]
        while (cs) {
            const col_pge: LivePGE = cs.live_pge
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
    game._col_activeCollisionSlots.fill(0xFF)
    game._col_currentLeftRoom = game._res._ctData[CT_LEFT_ROOM + currentRoom]
    game._col_currentRightRoom = game._res._ctData[CT_RIGHT_ROOM + currentRoom]

    for (let i = 0; i !== game._col_curPos; ++i) {
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
    game._col_curPos = 0
    game._col_curSlot = game._col_slots[0]
}

export function gameColFindSlot(game: Game, pos: number) {
    for (let i = 0; i < game._col_curPos; ++i) {
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
        return room_ct_data[0x40]
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

export function gameColGetGridPos(game: Game, pge: LivePGE, dx: number) {
    let x = pge.pos_x + dx
    let y = pge.pos_y

    let c = pge.room_location
    if (c < 0) return 0xFFFF

    if (x < 0) {
        c = game._res._ctData[CT_LEFT_ROOM + c]
        if (c < 0) return 0xFFFF
        x += GAMESCREEN_W
    } else if (x >= GAMESCREEN_W) {
        c = game._res._ctData[CT_RIGHT_ROOM + c]
        if (c < 0) return 0xFFFF
        x -= GAMESCREEN_W
    } else if (y < 0) {
        c = game._res._ctData[CT_UP_ROOM + c]
        if (c < 0) return 0xFFFF
        y += 216
    } else if (y >= 216) {
        c = game._res._ctData[CT_DOWN_ROOM + c]
        if (c < 0) return 0xFFFF
        y -= 216
    }

    x = (x + 8) >> 4
    y = ((y - 8) / 72) >> 0

    game.renders > game.debugStartFrame && console.log(`getGridPos x=${x} y=${y}`)

    if (x < 0 || x > 15 || y < 0 || y > 2) {
        return 0xFFFF
    } else {
        return y * 16 + x + c * 64
    }
}

export function gameColPreparePiegeState(game: Game, pge: LivePGE) {
    let ct_slot1: CollisionSlot
    let ct_slot2: CollisionSlot
    if (pge.init_PGE.unk1C === 0) {
        pge.collision_slot = 0xFF
        return
    }
    let i = 0
    ct_slot1 = null
    for (let c = 0; c < pge.init_PGE.unk1C; ++c) {
        ct_slot2 = game._col_curSlot
        const nextIndex = game._col_slots.findIndex((el) => el === ct_slot2) + 1

        game._col_curSlot = game._col_slots[nextIndex]
        const pos = game.col_getGridPos(pge, i)
        if (c < 3) {
            game.renders > game.debugStartFrame && console.log(`gridPos = ${pos}`)
        }
        if (pos < 0) {
            if (ct_slot1 === null) {
                pge.collision_slot = 0xFF
            } else {
                ct_slot1.index = 0xFFFF
            }
            return
        }
        ct_slot2.ct_pos = pos
        ct_slot2.live_pge = pge
        ct_slot2.index = 0xFFFF
        const _ax = game.col_findSlot(pos)
        if (c < 3) {
            game.renders > game.debugStartFrame && console.log(`_ax=${_ax}`)
        }
        if (_ax >= 0) {
            ct_slot2.prev_slot = game._col_slotsTable[_ax]
            game._col_slotsTable[_ax] = ct_slot2
            if (ct_slot1 === null) {
                pge.collision_slot = _ax & 0x00FF
            } else {
                ct_slot1.index = _ax
            }
            let temp_pge = ct_slot2.live_pge
            if (temp_pge.flags & 0x80) {
                game._pge_liveTable2[temp_pge.index] = temp_pge
                temp_pge.flags |= 4
            }
            if (ct_slot2.prev_slot) {
                temp_pge = ct_slot2.prev_slot.live_pge
                if (temp_pge.flags & 0x80) {
                    game._pge_liveTable2[temp_pge.index] = temp_pge
                    temp_pge.flags |= 4
                }
            }
        } else {
            ct_slot2.prev_slot = null
            game._col_slotsTable[game._col_curPos] = ct_slot2
            if (ct_slot1 == null) {
                pge.collision_slot = game._col_curPos
            } else {
                ct_slot1.index = game._col_curPos
            }
            game._col_curPos++
        }
        ct_slot1 = ct_slot2
        i += 0x10
    }
}
