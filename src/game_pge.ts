import type {
    GroupPGE,
    InitPGE,
    LivePGE,
    Obj,
    ObjectNode,
    ObjectOpcodeArgs
} from './intern'
import type { pge_OpcodeProc } from './intern'
import type { Game } from './game'
import { CT_DOWN_ROOM, CT_LEFT_ROOM, CT_RIGHT_ROOM, CT_UP_ROOM, Game as GameClass } from './game'
import { GAMESCREEN_W } from './configs/config'
import {
    INIT_PGE_FLAG_HAS_COLLISION,
    INIT_PGE_FLAG_IN_CURRENT_ROOM_LIST,
    INIT_PGE_INIT_FLAGS_HAS_FLAG_3,
    INIT_PGE_FLAG_UNKNOWN_BIT_1,
    OBJ_FLAG_DEC_LIFE,
    OBJ_FLAG_INC_LIFE,
    OBJ_FLAG_SET_DEAD,
    OBJ_FLAG_TOGGLE_MIRROR,
    PGE_FLAG_ACTIVE,
    PGE_FLAG_FLIP_X,
    PGE_FLAG_MIRRORED,
    PGE_FLAG_SPECIAL_ANIM,
    UINT8_MAX,
    UINT16_MAX,
    CT_ROOM_SIZE
} from './game_constants'
import { gamePgePlayAnimSound as gameAudioPgePlayAnimSound } from './game_audio'
import {
    gamePgeAddToInventory as gameInventoryPgeAddToInventory,
    gamePgeGetInventoryItemBefore as gameInventoryPgeGetInventoryItemBefore,
    gamePgeRemoveFromInventory as gameInventoryPgeRemoveFromInventory,
    gamePgeReorderInventory as gameInventoryPgeReorderInventory,
    gamePgeSetCurrentInventoryObject as gameInventoryPgeSetCurrentInventoryObject,
    gamePgeUpdateInventory as gameInventoryPgeUpdateInventory
} from './game_inventory'


export function gamePgeLoadForCurrentLevel(game: Game, idx: number, currentRoom: number) {
    const initial_pge_from_file: InitPGE = game._res._pgeAllInitialStateFromFile[idx]
    const live_pge: LivePGE = game._pgeLiveAll[idx]

    live_pge.init_PGE = initial_pge_from_file
    live_pge.obj_type = initial_pge_from_file.type
    live_pge.pos_x = initial_pge_from_file.pos_x
    live_pge.pos_y = initial_pge_from_file.pos_y
    live_pge.anim_seq = 0
    live_pge.room_location = initial_pge_from_file.init_room

    live_pge.life = initial_pge_from_file.life
    if (game._skillLevel >= 2 && initial_pge_from_file.object_type === 10) {
        live_pge.life *= 2
    }
    live_pge.counter_value = 0
    live_pge.collision_slot = UINT8_MAX
    live_pge.next_inventory_PGE = UINT8_MAX
    live_pge.current_inventory_PGE = UINT8_MAX
    live_pge.unkF = UINT8_MAX
    live_pge.anim_number = 0
    live_pge.index = idx
    live_pge.next_PGE_in_room = null

    let flags = 0
    if (initial_pge_from_file.skill > game._skillLevel) {
        return
    }

    if (initial_pge_from_file.room_location !== 0 || ((initial_pge_from_file.flags & INIT_PGE_FLAG_IN_CURRENT_ROOM_LIST) && (currentRoom === initial_pge_from_file.init_room))) {
        flags |= PGE_FLAG_ACTIVE
        game._pge_liveFlatTableFilteredByRoomCurrentRoomOnly[idx] = live_pge
    }
    if (initial_pge_from_file.mirror_x !== 0) {
        flags |= PGE_FLAG_MIRRORED
    }
    if (initial_pge_from_file.init_flags & INIT_PGE_INIT_FLAGS_HAS_FLAG_3) {
        flags |= 0x10
    }
    flags |= (initial_pge_from_file.init_flags & 3) << 5
    if (initial_pge_from_file.flags & INIT_PGE_FLAG_UNKNOWN_BIT_1) {
        flags |= 0x80
    }

    live_pge.flags = flags
    if (initial_pge_from_file.obj_node_number >= game._res._numObjectNodes) {
        throw(`Assertion failed: ${initial_pge_from_file.obj_node_number} < ${game._res._numObjectNodes}}`)
    }
    const on: ObjectNode = game._res._objectNodesMap[initial_pge_from_file.obj_node_number]

    let obj = 0
    let i = 0
    while (on.objects[obj].type !== live_pge.obj_type) {
        ++i
        ++obj
    }
    if (i >= on.num_objects) {
        throw(`Assertion failed: ${i} < ${on.num_objects}`)
    }
    live_pge.first_obj_number = i
    game.pge_setupDefaultAnim(live_pge)
}

export function gamePgeSetupDefaultAnim(game: Game, pge: LivePGE) {
    const anim_data = game._res.getAniData(pge.obj_type)
    if (pge.anim_seq < game._res._readUint16(anim_data)) {
        pge.anim_seq = 0
    }
    const anim_frame = anim_data.subarray(6 + pge.anim_seq * 4)
    if (game._res._readUint16(anim_frame) !== UINT16_MAX) {
        let f = game._res._readUint16(anim_data)
        if (pge.flags & PGE_FLAG_MIRRORED) {
            f ^= 0x8000
        }
        pge.flags &= ~PGE_FLAG_FLIP_X
        if (f & 0x8000) {
            pge.flags |= PGE_FLAG_FLIP_X
        }
        pge.flags &= ~PGE_FLAG_SPECIAL_ANIM
        if (game._res._readUint16(anim_data, 4) & UINT16_MAX) {
            pge.flags |= PGE_FLAG_SPECIAL_ANIM
        }

        pge.anim_number = game._res._readUint16(anim_frame) & 0x7FFF
    }
}

export function gamePgeRemoveFromGroup(game: Game, idx: number) {
    let le: GroupPGE = game._pge_groupsTable[idx]
    if (le) {
        game._pge_groupsTable[idx] = null
        let next: GroupPGE = game._pge_nextFreeGroup
        while (le) {
            const cur: GroupPGE = le.next_entry
            le.next_entry = next
            le.index = 0
            le.group_id = 0
            next = le
            le = cur
        }
        game._pge_nextFreeGroup = next
    }
}

export function gamePgeExecute(game: Game, live_pge: LivePGE, init_pge: InitPGE, obj: Obj) {
    let op: pge_OpcodeProc
    const args: ObjectOpcodeArgs = {
        pge: null,
        a: 0,
        b: 0,
    }
    if (obj.opcode1) {
        args.pge = live_pge
        args.a = obj.opcode_arg1
        args.b = 0
        game.renders > game.debugStartFrame && console.log(`pge_execute op1=0x${obj.opcode1.toString(16)}`)
        op = game._pge_opcodeTable[obj.opcode1]
        if (!op) {
            debugger
            throw(`Game::pge_execute() missing call to pge_opcode 0x${obj.opcode1.toString(16)}`)
        }
        if (!(op(args, game) & UINT8_MAX)) {
            return 0
        }
    }
    if (obj.opcode2) {
        args.pge = live_pge
        args.a = obj.opcode_arg2
        args.b = obj.opcode_arg1
        game.renders > game.debugStartFrame && console.log(`pge_execute op2=0x${obj.opcode2.toString(16)}`)
        const op2 = game._pge_opcodeTable[obj.opcode2]
        if (!op2) {
            debugger
            console.warn(`Game::pge_execute() missing call to pge_opcode 0x${obj.opcode2.toString(16)}`)
            return 0
        }
        if (!(op2(args, game) & UINT8_MAX)) {
            return 0
        }
    }
    if (obj.opcode3) {
        args.pge = live_pge
        args.a = obj.opcode_arg3
        args.b = 0
        game.renders > game.debugStartFrame && console.log(`pge_execute op3=0x${obj.opcode3.toString(16)}`)
        op = game._pge_opcodeTable[obj.opcode3]
        if (op) {
            op(args, game)
        } else {
            debugger
            console.warn(`Game::pge_execute() missing call to pge_opcode 0x${obj.opcode3.toString(16)}`)
        }
    }
    live_pge.obj_type = obj.init_obj_type
    live_pge.first_obj_number = obj.init_obj_number
    live_pge.anim_seq = 0
    if (obj.flags & 0xF0) {
        game._score += GameClass._scoreTable[obj.flags >> 4]
    }
    if (obj.flags & OBJ_FLAG_TOGGLE_MIRROR) {
        live_pge.flags ^= PGE_FLAG_MIRRORED
    }
    if (obj.flags & OBJ_FLAG_DEC_LIFE) {
        --live_pge.life
        if (init_pge.object_type === 1) {
            game._pge_processOBJ = true
        } else if (init_pge.object_type === 10) {
            game._score += 100
        }
    }
    if (obj.flags & OBJ_FLAG_INC_LIFE) {
        ++live_pge.life
    }
    if (obj.flags & OBJ_FLAG_SET_DEAD) {
        live_pge.life = -1
    }

    if (live_pge.flags & PGE_FLAG_MIRRORED) {
        live_pge.pos_x -= obj.dx
    } else {
        live_pge.pos_x += obj.dx
    }
    live_pge.pos_y += obj.dy

    if (game._pge_processOBJ && init_pge.object_type === 1) {
        if (game.pge_processOBJ(live_pge) !== 0) {
            game._blinkingConradCounter = 60
            game._pge_processOBJ = false
        }
    }
    return UINT16_MAX
}

export function gamePgeProcessOBJ(game: Game, pge: LivePGE) {
    const init_pge: InitPGE = pge.init_PGE
    if (init_pge.obj_node_number >= game._res._numObjectNodes) {
        throw(`Assertion failed: ${init_pge.obj_node_number} < ${game._res._numObjectNodes}`)
    }
    const on: ObjectNode = game._res._objectNodesMap[init_pge.obj_node_number]
    let objIndex = pge.first_obj_number
    let obj: Obj = on.objects[objIndex]
    let i = pge.first_obj_number
    while (i < on.last_obj_number && pge.obj_type === obj.type) {
        if (obj.opcode2 === 0x6B) return UINT16_MAX
        if (obj.opcode2 === 0x22 && obj.opcode_arg2 <= 4) return UINT16_MAX
        if (obj.opcode1 === 0x6B) return UINT16_MAX
        if (obj.opcode1 === 0x22 && obj.opcode_arg1 <= 4) return UINT16_MAX
        objIndex++
        obj = on.objects[objIndex]
        ++i
    }
    return 0
}

export function gamePgeReorderInventory(game: Game, pge: LivePGE) {
    return gameInventoryPgeReorderInventory(game, pge)
}

export function gamePgeUpdateInventory(game: Game, pge1: LivePGE, pge2: LivePGE) {
    return gameInventoryPgeUpdateInventory(game, pge1, pge2)
}

export function gamePgeUpdateGroup(game: Game, idx: number, unk1: number, unk2: number) {
    let pge: LivePGE = game._pgeLiveAll[unk1]
    if (!(pge.flags & PGE_FLAG_ACTIVE)) {
        if (!(pge.init_PGE.flags & INIT_PGE_FLAG_HAS_COLLISION)) {
            return
        }
        pge.flags |= PGE_FLAG_ACTIVE
        game._pge_liveFlatTableFilteredByRoomCurrentRoomOnly[unk1] = pge
    }
    if (unk2 <= 4) {
        const pge_room = pge.room_location
        pge = game._pgeLiveAll[idx]
        if (pge_room !== pge.room_location) {
            return
        }
        if (unk1 === 0 && game._blinkingConradCounter !== 0) {
            return
        }
    }
    const le: GroupPGE = game._pge_nextFreeGroup
    if (le) {
        game._pge_nextFreeGroup = le.next_entry
        const _ax: GroupPGE = game._pge_groupsTable[unk1]
        game._pge_groupsTable[unk1] = le
        le.next_entry = _ax
        le.index = idx
        le.group_id = unk2
    }
}

export function gamePgeInnerProcess(game: Game, pge: LivePGE, currentRoom: number) {
    game._pge_playAnimSound = true
    game._pge_currentPiegeFacingDir = (pge.flags & PGE_FLAG_MIRRORED) !== 0
    game._pge_currentPiegeRoom = pge.room_location
    const le: GroupPGE = game._pge_groupsTable[pge.index]
    game.renders > game.debugStartFrame && console.log(`_pge_currentPiegeFacingDir=${game._pge_currentPiegeFacingDir} _pge_currentPiegeRoom=${game._pge_currentPiegeRoom} le=${le}`)
    if (le) {
        game.pge_setupNextAnimFrame(pge, le)
    }
    let anim_data = game._res.getAniData(pge.obj_type)
    game.renders > game.debugStartFrame && console.log(`read=${game._res._readUint16(anim_data)} anim_seq=${pge.anim_seq}`)
    if (game._res._readUint16(anim_data) <= pge.anim_seq) {
        game.renders > game.debugStartFrame && console.log('if')
        const init_pge: InitPGE = pge.init_PGE
        if (init_pge.obj_node_number >= game._res._numObjectNodes) {
            throw(`Assertion failed: ${init_pge.obj_node_number} < ${game._res._numObjectNodes}`)
        }

        const on: ObjectNode = game._res._objectNodesMap[init_pge.obj_node_number]
        let objIndex = pge.first_obj_number
        let obj: Obj = on.objects[objIndex]
        let i = 0
        while (1) {
            game.renders > game.debugStartFrame && console.log(`** pge_process(${i++})`)
            if (obj.type !== pge.obj_type) {
                game.renders > game.debugStartFrame && console.log('exiting pge_process loop: removing', pge.index)
                game.pge_removeFromGroup(pge.index)
                return
            }
            const _ax = game.pge_execute(pge, init_pge, obj)

            if (game._currentLevel === 6 && (currentRoom === 50 || currentRoom === 51)) {
                if (pge.index === 79 && _ax === UINT16_MAX && obj.opcode1 === 0x60 && obj.opcode2 === 0 && obj.opcode3 === 0) {
                    if (game.col_getGridPos(game._pgeLiveAll[79], 0) === game.col_getGridPos(game._pgeLiveAll[0], 0)) {
                        game.pge_updateGroup(79, 0, 4)
                    }
                }
            }

            if (_ax !== 0) {
                game.renders > game.debugStartFrame && console.log('exiting pge_process loop setup other pieges')
                anim_data = game._res.getAniData(pge.obj_type)
                const snd = anim_data[2]

                if (snd) {
                    game.pge_playAnimSound(pge, snd)
                }
                game.pge_setupOtherPieges(pge, init_pge)
                break
            }
            ++objIndex
            obj = on.objects[objIndex]
        }
    } else {
        game.renders > game.debugStartFrame && console.log('else')
    }
    game.pge_setupAnim(pge)
    ++pge.anim_seq
    game.pge_removeFromGroup(pge.index)
}

export function gamePgeSetupAnim(game: Game, pge: LivePGE) {
    const anim_data = game._res.getAniData(pge.obj_type)
    if (game._res._readUint16(anim_data) < pge.anim_seq) {
        pge.anim_seq = 0
    }
    const anim_frame = anim_data.subarray(6 + pge.anim_seq * 4)

    if (game._res._readUint16(anim_frame) !== UINT16_MAX) {
        let fl = game._res._readUint16(anim_frame)
        if (pge.flags & PGE_FLAG_MIRRORED) {
            fl ^= 0x8000
            pge.pos_x = pge.pos_x - (anim_frame[2] << 24 >> 24)
        } else {
            pge.pos_x = pge.pos_x + (anim_frame[2] << 24 >> 24)
        }
        pge.pos_y = pge.pos_y + (anim_frame[3] << 24 >> 24)
        pge.flags &= ~PGE_FLAG_FLIP_X
        if (fl & 0x8000) {
            pge.flags |= PGE_FLAG_FLIP_X
        }
        pge.flags &= ~PGE_FLAG_SPECIAL_ANIM
        if (game._res._readUint16(anim_data, 4) & UINT16_MAX) {
            pge.flags |= PGE_FLAG_SPECIAL_ANIM
        }
        pge.anim_number = game._res._readUint16(anim_frame) & 0x7FFF
    }
}

export function gamePgeSetupOtherPieges(game: Game, pge: LivePGE, init_pge: InitPGE) {
    let room_ct_data: Int8Array = null
    if (pge.pos_x <= -10) {
        pge.pos_x += GAMESCREEN_W
        room_ct_data = game._res._ctData.subarray(CT_LEFT_ROOM)
    } else if (pge.pos_x >= GAMESCREEN_W) {
        pge.pos_x -= GAMESCREEN_W
        room_ct_data = game._res._ctData.subarray(CT_RIGHT_ROOM)
    } else if (pge.pos_y < 0) {
        pge.pos_y += 216
        room_ct_data = game._res._ctData.subarray(CT_UP_ROOM)
    } else if (pge.pos_y >= 216) {
        pge.pos_y -= 216
        room_ct_data = game._res._ctData.subarray(CT_DOWN_ROOM)
    }
    if (room_ct_data) {
        let room = pge.room_location << 24 >> 24
        if (room >= 0) {
            room = room_ct_data[room]
            pge.room_location = room
        }
        if (init_pge.object_type === 1) {
            game._currentRoom = room
            game.col_prepareRoomState(game._currentRoom)
            game._loadMap = true
            if (!(game._currentRoom & 0x80) && game._currentRoom < 0x40) {
                let pge_it: LivePGE = game._pge_liveLinkedListTableByRoomAllRooms[game._currentRoom]
                while (pge_it) {
                    if (pge_it.init_PGE.flags & INIT_PGE_FLAG_IN_CURRENT_ROOM_LIST) {
                        game._pge_liveFlatTableFilteredByRoomCurrentRoomOnly[pge_it.index] = pge_it
                        pge_it.flags |= PGE_FLAG_ACTIVE
                    }
                    pge_it = pge_it.next_PGE_in_room
                }
                room = game._res._ctData[CT_UP_ROOM + game._currentRoom]
                if (room >= 0 && room < 0x40) {
                    pge_it = game._pge_liveLinkedListTableByRoomAllRooms[room]
                    while (pge_it) {
                        if (pge_it.init_PGE.object_type !== 10 && pge_it.pos_y >= 48 && (pge_it.init_PGE.flags & INIT_PGE_FLAG_IN_CURRENT_ROOM_LIST)) {
                            game._pge_liveFlatTableFilteredByRoomCurrentRoomOnly[pge_it.index] = pge_it
                            pge_it.flags |= PGE_FLAG_ACTIVE
                        }
                        pge_it = pge_it.next_PGE_in_room
                    }
                }
                room = game._res._ctData[CT_DOWN_ROOM + game._currentRoom]
                if (room >= 0 && room < 0x40) {
                    pge_it = game._pge_liveLinkedListTableByRoomAllRooms[room]
                    while (pge_it) {
                        if (pge_it.init_PGE.object_type !== 10 && pge_it.pos_y >= 176 && (pge_it.init_PGE.flags & INIT_PGE_FLAG_IN_CURRENT_ROOM_LIST)) {
                            game._pge_liveFlatTableFilteredByRoomCurrentRoomOnly[pge_it.index] = pge_it
                            pge_it.flags |= PGE_FLAG_ACTIVE
                        }
                        pge_it = pge_it.next_PGE_in_room
                    }
                }
            }
        }
    }
    game.pge_addToCurrentRoomList(pge, game._pge_currentPiegeRoom)
}

export function gamePgeAddToCurrentRoomList(game: Game, pge: LivePGE, room: number) {
    if (room !== pge.room_location) {
        let cur_pge: LivePGE = game._pge_liveLinkedListTableByRoomAllRooms[room]
        let prev_pge: LivePGE = null

        while (cur_pge && cur_pge !== pge) {
            prev_pge = cur_pge
            cur_pge = cur_pge.next_PGE_in_room
        }

        if (cur_pge) {
            if (!prev_pge) {
                game._pge_liveLinkedListTableByRoomAllRooms[room] = pge.next_PGE_in_room
            } else {
                prev_pge.next_PGE_in_room = cur_pge.next_PGE_in_room
            }

            const temp: LivePGE = game._pge_liveLinkedListTableByRoomAllRooms[pge.room_location]
            pge.next_PGE_in_room = temp
            game._pge_liveLinkedListTableByRoomAllRooms[pge.room_location] = pge
        }
    }
}

export function gamePgePlayAnimSound(game: Game, pge: LivePGE, arg2: number) {
    return gameAudioPgePlayAnimSound(game, pge, arg2)
}

export function gamePgeSetupNextAnimFrame(game: Game, pge: LivePGE, le: GroupPGE) {
    const init_pge: InitPGE = pge.init_PGE
    if (init_pge.obj_node_number >= game._res._numObjectNodes) {
        throw(`Assertion failed: ${init_pge.obj_node_number} < ${game._res._numObjectNodes}`)
    }

    const set_anim = () => {
        const anim_data = game._res.getAniData(pge.obj_type)
        const _dh = game._res._readUint16(anim_data) & 0x00FF
        let _dl = pge.anim_seq
        const anim_frame = anim_data.subarray(6 + _dl * 4)
        let index = 0
        while (_dh > _dl) {
            if (game._res._readUint16(anim_frame, index) !== UINT16_MAX) {
                if (game._pge_currentPiegeFacingDir) {
                    pge.pos_x = pge.pos_x - (anim_frame[2 + index] << 24 >> 24)
                } else {
                    pge.pos_x = pge.pos_x + (anim_frame[2 + index] << 24 >> 24)
                }
                pge.pos_y = pge.pos_y + (anim_frame[3 + index] << 24 >> 24)
            }
            index += 4
            ++_dl
        }
        pge.anim_seq = _dh
        game._col_currentPiegeGridPosY = (pge.pos_y / 36) & ~1
        game._col_currentPiegeGridPosX = (pge.pos_x + 8) >> 4
    }

    const on: ObjectNode = game._res._objectNodesMap[init_pge.obj_node_number]
    let onIndex = pge.first_obj_number
    let obj: Obj = on.objects[onIndex]
    let i = pge.first_obj_number

    while (i < on.last_obj_number && pge.obj_type === obj.type) {
        let next_le: GroupPGE = le
        while (next_le) {
            const groupId = next_le.group_id
            if (obj.opcode2 === 0x6B) {
                if (obj.opcode_arg2 === 0) {
                    if (groupId === 1 || groupId === 2) {
                        set_anim()
                        return
                    }
                }
                if (obj.opcode_arg2 === 1) {
                    if (groupId === 3 || groupId === 4) {
                        set_anim()
                        return
                    }
                }
            } else if (groupId === obj.opcode_arg2) {
                if (obj.opcode2 === 0x22 || obj.opcode2 === 0x6F) {
                    set_anim()
                    return
                }
            }
            if (obj.opcode1 === 0x6B) {
                if (obj.opcode_arg1 === 0) {
                    if (groupId === 1 || groupId === 2) {
                        set_anim()
                        return
                    }
                }
                if (obj.opcode_arg1 === 1) {
                    if (groupId === 3 || groupId === 4) {
                        set_anim()
                        return
                    }
                }
            } else if (groupId === obj.opcode_arg1) {
                if (obj.opcode1 === 0x22 || obj.opcode1 === 0x6F) {
                    set_anim()
                    return
                }
            }
            next_le = next_le.next_entry
        }
        ++onIndex
        obj = on.objects[onIndex]
        ++i
    }
}

export function gamePgeGetInventoryItemBefore(game: Game, pge: LivePGE, last_pge: LivePGE) {
    return gameInventoryPgeGetInventoryItemBefore(game, pge, last_pge)
}

export function gamePgeRemoveFromInventory(game: Game, pge1: LivePGE, pge2: LivePGE, pge3: LivePGE) {
    return gameInventoryPgeRemoveFromInventory(game, pge1, pge2, pge3)
}

export function gamePgeAddToInventory(game: Game, pge1: LivePGE, pge2: LivePGE, pge3: LivePGE) {
    return gameInventoryPgeAddToInventory(game, pge1, pge2, pge3)
}

export function gamePgeSetCurrentInventoryObject(game: Game, pge: LivePGE) {
    return gameInventoryPgeSetCurrentInventoryObject(game, pge)
}

export function gamePgePrepare(game: Game, currentRoom: number) {
    // clear the collisions arrays
    game.col_clearState()
    if (currentRoom & 0x80) return

    let pge = game._pge_liveLinkedListTableByRoomAllRooms[currentRoom]
    while (pge) {
        // this is going to prepare the collisions table for all the PGEs in current roon
        game.col_preparePiegeState(pge)
        if (!(pge.flags & PGE_FLAG_ACTIVE) && (pge.init_PGE.flags & INIT_PGE_FLAG_IN_CURRENT_ROOM_LIST)) {
            game._pge_liveFlatTableFilteredByRoomCurrentRoomOnly[pge.index] = pge
            pge.flags |= PGE_FLAG_ACTIVE
        }
        pge = pge.next_PGE_in_room
    }

    for (let i = 0; i < game._res._pgeTotalNumInFile; ++i) {
        const pge2 = game._pge_liveFlatTableFilteredByRoomCurrentRoomOnly[i]
        if (pge2 && currentRoom !== pge2.room_location) {
            game.col_preparePiegeState(pge2)
        }
    }
}

export async function gamePgeGetUserLeftRightUpDownKeyInput(game: Game) {
    await game.inp_update()

    game._inp_lastKeysHit = game._stub._pi.dirMask
    if ((game._inp_lastKeysHit & 0xC) && (game._inp_lastKeysHit & 0x3)) {
        const mask = (game._inp_lastKeysHit & 0xF0) | (game._inp_lastKeysHitLeftRight & 0xF)
        game._pge_inpKeysMask = mask
        game._inp_lastKeysHit = mask
    } else {
        game._pge_inpKeysMask = game._inp_lastKeysHit
        game._inp_lastKeysHitLeftRight = game._inp_lastKeysHit
    }
    if (game._stub._pi.enter) {
        game._pge_inpKeysMask |= 0x10
    }
    if (game._stub._pi.space) {
        game._pge_inpKeysMask |= 0x20
    }
    if (game._stub._pi.shift) {
        game._pge_inpKeysMask |= 0x40
    }
}

export function gamePgeResetGroups(game: Game) {
    game._pge_groupsTable.fill(null)
    let index = 0
    let le = game._pge_groups[index]
    game._pge_nextFreeGroup = le
    let n = UINT8_MAX
    while (n--) {
        le.next_entry = game._pge_groups[index + 1]
        le.index = 0
        le.group_id = 0
        index++
        le = game._pge_groups[index]
    }
    le.next_entry = null
    le.index = 0
    le.group_id = 0
}
