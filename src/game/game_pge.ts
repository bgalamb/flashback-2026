import type {
    InitPGE,
    LivePGE,
    PgeScriptEntry,
    PgeScriptNode,
    PgeOpcodeArgs
} from '../core/intern'
import { assert } from "../core/assert"
import type { PgeOpcodeHandler } from '../core/intern'
import type { Game } from './game'
import { Game as GameClass } from './game'
import { CT_DOWN_ROOM, CT_LEFT_ROOM, CT_RIGHT_ROOM, CT_UP_ROOM } from '../core/game_constants'
import {
    gameClearDynamicCollisionSlotState,
    gameGetCollisionLanePositionIndexByXY,
    gameRegisterPgeCollisionSegments
} from './game_collision'
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
} from '../core/game_constants'
import { gamePlayPgeAnimationSoundEffect as gameAudioPgePlayAnimSound } from './game_audio'
import { gameHandlePgeRoomTransition, gameRelocatePgeToRoom } from './game_room_transition'
import {
    gameAddPgeToInventoryChain as gameInventoryPgeAddToInventory,
    gameFindInventoryItemBeforePge as gameInventoryPgeGetInventoryItemBefore,
    gameRemovePgeFromInventoryChain as gameInventoryPgeRemoveFromInventory,
    gameReorderPgeInventoryLinks as gameInventoryPgeReorderInventory,
    gameSetCurrentInventoryPgeSelection as gameInventoryPgeSetCurrentInventoryObject,
    gameUpdatePgeInventoryLinks as gameInventoryPgeUpdateInventory
} from './game_inventory'
import { gameInpUpdate } from './game_world'
import { getGameCollisionState, getGamePgeState, getGameSessionState, getGameUiState, getGameWorldState } from './game_state'
import { getRuntimeRegistryState } from './game_runtime_data'

function shouldLogPgeInteraction(game: Game, pge?: LivePGE) {
    const session = getGameSessionState(game)
    const world = getGameWorldState(game)
    const isDirectStartStartup = session.startedFromLevelSelect && game.renders < 5 && (!pge || pge.index === 0)
    return isDirectStartStartup || game.renders > game.debugStartFrame || world.currentRoom === 39 || pge?.room_location === 39 || world.textToDisplay !== UINT16_MAX
}

function logPgeInteraction(game: Game, scope: string, message: string, pge?: LivePGE) {
    const world = getGameWorldState(game)
    if (!shouldLogPgeInteraction(game, pge)) {
        return
    }
    const prefix = pge
        ? `[${scope}] frame=${game.renders} currentRoom=${world.currentRoom} pge=${pge.index} pgeRoom=${pge.room_location} state=${pge.script_state_type}/${pge.first_script_entry_index}`
        : `[${scope}] frame=${game.renders} currentRoom=${world.currentRoom}`
    console.log(`${prefix} ${message}`)
}

function warnInvalidScriptEntryTransition(game: Game, pge: LivePGE, scriptNode: PgeScriptNode, scriptEntry: PgeScriptEntry) {
    const world = getGameWorldState(game)
    const maxEntryIndex = Math.min(scriptNode.last_obj_number, scriptNode.objects.length - 1)
    console.warn(
        `[pge-transition] frame=${game.renders} currentRoom=${world.currentRoom} pge=${pge.index} pgeRoom=${pge.room_location} scriptNode=${pge.init_PGE.script_node_index} objectType=${pge.init_PGE.object_type} state=${pge.script_state_type} currentEntry=${pge.first_script_entry_index} nextEntry=${scriptEntry.next_script_entry_index} maxEntry=${maxEntryIndex} nextState=${scriptEntry.next_script_state_type}`
    )
}


export function gameLoadPgeForCurrentLevel(game: Game, idx: number, currentRoom: number) {
    const ui = getGameUiState(game)
    const runtime = getRuntimeRegistryState(game)
    const initial_pge_from_file: InitPGE = game._res.level.pgeAllInitialStateFromFile[idx]
    const live_pge: LivePGE = runtime.livePgesByIndex[idx]

    live_pge.init_PGE = initial_pge_from_file
    live_pge.script_state_type = initial_pge_from_file.type
    live_pge.pos_x = initial_pge_from_file.pos_x
    live_pge.pos_y = initial_pge_from_file.pos_y
    live_pge.anim_seq = 0
    live_pge.room_location = initial_pge_from_file.init_room

    // Conrad is PGE index 0. Override his starting shield count here instead of
    // changing the inventory counter item, which only mirrors Conrad's real life.
    live_pge.life = idx === 0 ? 20 : initial_pge_from_file.life
    if (ui.skillLevel >= 2 && initial_pge_from_file.object_type === 10) {
        live_pge.life *= 2
    }
    live_pge.counter_value = 0
    live_pge.collision_slot = UINT16_MAX
    live_pge.unkF = UINT8_MAX
    live_pge.anim_number = 0
    live_pge.index = idx

    let flags = 0
    if (initial_pge_from_file.skill > ui.skillLevel) {
        return
    }

    if (initial_pge_from_file.room_location !== 0 || ((initial_pge_from_file.flags & INIT_PGE_FLAG_IN_CURRENT_ROOM_LIST) && (currentRoom === initial_pge_from_file.init_room))) {
        flags |= PGE_FLAG_ACTIVE
        runtime.livePgeStore.activeFrameByIndex[idx] = live_pge
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
    assert(!(initial_pge_from_file.script_node_index >= game._res.level.numObjectNodes), `Assertion failed: ${initial_pge_from_file.script_node_index} < ${game._res.level.numObjectNodes}}`)
    const on: PgeScriptNode = game._res.level.objectNodesMap[initial_pge_from_file.script_node_index]

    let scriptEntryIndex = 0
    let i = 0
    while (on.objects[scriptEntryIndex].type !== live_pge.script_state_type) {
        ++i
        ++scriptEntryIndex
    }
    assert(!(i >= on.num_objects), `Assertion failed: ${i} < ${on.num_objects}`)
    if (!on.objects[scriptEntryIndex]) {
        console.warn(
            `[pge-load] Missing initial script entry: pge=${live_pge.index} scriptNode=${initial_pge_from_file.script_node_index} state=${live_pge.script_state_type} entry=${scriptEntryIndex} numObjects=${on.num_objects} lastObj=${on.last_obj_number}`
        )
    }
    live_pge.first_script_entry_index = i
    gameInitializePgeDefaultAnimation(game, live_pge)
}

export function gameInitializePgeDefaultAnimation(game: Game, pge: LivePGE) {
    const anim_data = game._res.getAniData(pge.script_state_type)
    if (pge.anim_seq < game._res.readUint16(anim_data)) {
        pge.anim_seq = 0
    }
    const anim_frame = anim_data.subarray(6 + pge.anim_seq * 4)
    if (game._res.readUint16(anim_frame) !== UINT16_MAX) {
        let f = game._res.readUint16(anim_data)
        if (pge.flags & PGE_FLAG_MIRRORED) {
            f ^= 0x8000
        }
        pge.flags &= ~PGE_FLAG_FLIP_X
        if (f & 0x8000) {
            pge.flags |= PGE_FLAG_FLIP_X
        }
        pge.flags &= ~PGE_FLAG_SPECIAL_ANIM
        if (game._res.readUint16(anim_data, 4) & UINT16_MAX) {
            pge.flags |= PGE_FLAG_SPECIAL_ANIM
        }

        pge.anim_number = game._res.readUint16(anim_frame) & 0x7FFF
    }
}

export function gameRemovePgeFromPendingGroups(game: Game, idx: number) {
    getRuntimeRegistryState(game).pendingSignalsByTargetPgeIndex.delete(idx)
}

export function gameExecutePgeObjectStep(game: Game, live_pge: LivePGE, init_pge: InitPGE, scriptEntry: PgeScriptEntry) {
    const ui = getGameUiState(game)
    const world = getGameWorldState(game)
    const pgeState = getGamePgeState(game)
    let op: PgeOpcodeHandler
    const args: PgeOpcodeArgs = {
        pge: null,
        a: 0,
        b: 0,
    }
    if (scriptEntry.opcode1) {
        args.pge = live_pge
        args.a = scriptEntry.opcode_arg1
        args.b = 0
        game.renders > game.debugStartFrame && console.log(`pge_execute op1=0x${scriptEntry.opcode1.toString(16)}`)
        op = game._opcodeHandlers[scriptEntry.opcode1]
        if (!op) {
            debugger
            throw(`Game::pge_execute() missing call to pge_opcode 0x${scriptEntry.opcode1.toString(16)}`)
        }
        if (!(op(args, game) & UINT8_MAX)) {
            return 0
        }
    }
    if (scriptEntry.opcode2) {
        args.pge = live_pge
        args.a = scriptEntry.opcode_arg2
        args.b = scriptEntry.opcode_arg1
        game.renders > game.debugStartFrame && console.log(`pge_execute op2=0x${scriptEntry.opcode2.toString(16)}`)
        const op2 = game._opcodeHandlers[scriptEntry.opcode2]
        if (!op2) {
            debugger
            console.warn(`Game::pge_execute() missing call to pge_opcode 0x${scriptEntry.opcode2.toString(16)}`)
            return 0
        }
        if (!(op2(args, game) & UINT8_MAX)) {
            return 0
        }
    }
    if (scriptEntry.opcode3) {
        args.pge = live_pge
        args.a = scriptEntry.opcode_arg3
        args.b = 0
        game.renders > game.debugStartFrame && console.log(`pge_execute op3=0x${scriptEntry.opcode3.toString(16)}`)
        op = game._opcodeHandlers[scriptEntry.opcode3]
        if (op) {
            op(args, game)
        } else {
            debugger
            console.warn(`Game::pge_execute() missing call to pge_opcode 0x${scriptEntry.opcode3.toString(16)}`)
        }
    }
    live_pge.script_state_type = scriptEntry.next_script_state_type
    const nextScriptNode = game._res.level.objectNodesMap[live_pge.init_PGE.script_node_index]
    if (scriptEntry.next_script_entry_index < 0 || scriptEntry.next_script_entry_index >= nextScriptNode.objects.length || scriptEntry.next_script_entry_index > nextScriptNode.last_obj_number) {
        warnInvalidScriptEntryTransition(game, live_pge, nextScriptNode, scriptEntry)
    }
    live_pge.first_script_entry_index = scriptEntry.next_script_entry_index
    live_pge.anim_seq = 0
    if (scriptEntry.flags & 0xF0) {
        ui.score += GameClass._scoreTable[scriptEntry.flags >> 4]
    }
    if (scriptEntry.flags & OBJ_FLAG_TOGGLE_MIRROR) {
        live_pge.flags ^= PGE_FLAG_MIRRORED
    }
    if (scriptEntry.flags & OBJ_FLAG_DEC_LIFE) {
        --live_pge.life
        if (init_pge.object_type === 1) {
            pgeState.shouldProcessCurrentPgeObjectNode = true
        } else if (init_pge.object_type === 10) {
            ui.score += 100
        }
    }
    if (scriptEntry.flags & OBJ_FLAG_INC_LIFE) {
        ++live_pge.life
    }
    if (scriptEntry.flags & OBJ_FLAG_SET_DEAD) {
        live_pge.life = -1
    }

    if (live_pge.flags & PGE_FLAG_MIRRORED) {
        live_pge.pos_x -= scriptEntry.dx
    } else {
        live_pge.pos_x += scriptEntry.dx
    }
    live_pge.pos_y += scriptEntry.dy

    if (pgeState.shouldProcessCurrentPgeObjectNode && init_pge.object_type === 1) {
        if (gameObjectNodeHasPgeGroupCondition(game, live_pge) !== 0) {
            world.blinkingConradCounter = 60
            pgeState.shouldProcessCurrentPgeObjectNode = false
        }
    }
    return UINT16_MAX
}

export function gameObjectNodeHasPgeGroupCondition(game: Game, pge: LivePGE) {
    const init_pge: InitPGE = pge.init_PGE
    assert(!(init_pge.script_node_index >= game._res.level.numObjectNodes), `Assertion failed: ${init_pge.script_node_index} < ${game._res.level.numObjectNodes}`)
    const on: PgeScriptNode = game._res.level.objectNodesMap[init_pge.script_node_index]
    let objIndex = pge.first_script_entry_index
    let scriptEntry: PgeScriptEntry = on.objects[objIndex]
    let i = pge.first_script_entry_index
    while (i < on.last_obj_number && pge.script_state_type === scriptEntry.type) {
        if (scriptEntry.opcode2 === 0x6B) return UINT16_MAX
        if (scriptEntry.opcode2 === 0x22 && scriptEntry.opcode_arg2 <= 4) return UINT16_MAX
        if (scriptEntry.opcode1 === 0x6B) return UINT16_MAX
        if (scriptEntry.opcode1 === 0x22 && scriptEntry.opcode_arg1 <= 4) return UINT16_MAX
        objIndex++
        scriptEntry = on.objects[objIndex]
        ++i
    }
    return 0
}

export function gameReorderPgeInventory(game: Game, pge: LivePGE) {
    return gameInventoryPgeReorderInventory(game, pge)
}

export function gameUpdatePgeInventory(game: Game, pge1: LivePGE, pge2: LivePGE) {
    return gameInventoryPgeUpdateInventory(game, pge1, pge2)
}

export function gameQueuePgeGroupSignal(game: Game, senderPgeIndex: number, targetPgeIndex: number, signalId: number) {
    const world = getGameWorldState(game)
    const runtime = getRuntimeRegistryState(game)
    let pge: LivePGE = runtime.livePgesByIndex[targetPgeIndex]
    if (!(pge.flags & PGE_FLAG_ACTIVE)) {
        if (!(pge.init_PGE.flags & INIT_PGE_FLAG_HAS_COLLISION)) {
            return
        }
        pge.flags |= PGE_FLAG_ACTIVE
        runtime.livePgeStore.activeFrameByIndex[targetPgeIndex] = pge
    }
    if (signalId <= 4) {
        const pge_room = pge.room_location
        pge = runtime.livePgesByIndex[senderPgeIndex]
        if (pge_room !== pge.room_location) {
            return
        }
        if (targetPgeIndex === 0 && world.blinkingConradCounter !== 0) {
            return
        }
    }
    const pendingGroups = runtime.pendingSignalsByTargetPgeIndex.get(targetPgeIndex) ?? []
    pendingGroups.unshift({
        senderPgeIndex,
        signalId
    })
    runtime.pendingSignalsByTargetPgeIndex.set(targetPgeIndex, pendingGroups)
}

// Run one frame of OBJ-script logic for a single PGE. This consumes pending group signals,
// evaluates that PGE's current OBJ entries until one changes state or triggers movement,
// handles any resulting room transition / activation updates, advances the animation frame,
// and finally clears the consumed group entry for this PGE.
export function gameRunPgeFrameLogic(game: Game, pge: LivePGE, currentRoom: number) {
    const world = getGameWorldState(game)
    const pgeState = getGamePgeState(game)
    const runtime = getRuntimeRegistryState(game)
    game._shouldPlayPgeAnimationSound = true
    pgeState.currentPgeFacingIsMirrored = (pge.flags & PGE_FLAG_MIRRORED) !== 0
    pgeState.currentPgeRoom = pge.room_location
    const pendingGroups = runtime.pendingSignalsByTargetPgeIndex.get(pge.index)
    logPgeInteraction(game, 'pge-frame', `start currentRoomArg=${currentRoom} pos=(${pge.pos_x},${pge.pos_y}) animSeq=${pge.anim_seq} pendingGroups=${pendingGroups?.map(({ senderPgeIndex, signalId }) => `${senderPgeIndex}:${signalId}`).join(',') || 'none'}`, pge)
    game.renders > game.debugStartFrame && console.log(`currentPgeFacingIsMirrored=${pgeState.currentPgeFacingIsMirrored} currentPgeRoom=${pgeState.currentPgeRoom} pendingGroups=${pendingGroups?.length ?? 0}`)
    if (pendingGroups?.length) {
        gameApplyNextPgeAnimationFrameFromGroups(game, pge, pendingGroups)
    }
    let anim_data = game._res.getAniData(pge.script_state_type)
    game.renders > game.debugStartFrame && console.log(`read=${game._res.readUint16(anim_data)} anim_seq=${pge.anim_seq}`)
    if (game._res.readUint16(anim_data) <= pge.anim_seq) {
        game.renders > game.debugStartFrame && console.log('if')
        const init_pge: InitPGE = pge.init_PGE
        assert(!(init_pge.script_node_index >= game._res.level.numObjectNodes), `Assertion failed: ${init_pge.script_node_index} < ${game._res.level.numObjectNodes}`)

        const on: PgeScriptNode = game._res.level.objectNodesMap[init_pge.script_node_index]
        let objIndex = pge.first_script_entry_index
        let scriptEntry: PgeScriptEntry = on.objects[objIndex]
        let i = 0
        while (1) {
            game.renders > game.debugStartFrame && console.log(`** pge_process(${i++})`)
            logPgeInteraction(game, 'pge-step', `scriptEntryIndex=${objIndex} type=${scriptEntry.type} opcodes=0x${scriptEntry.opcode1.toString(16)}/0x${scriptEntry.opcode2.toString(16)}/0x${scriptEntry.opcode3.toString(16)} args=${scriptEntry.opcode_arg1}/${scriptEntry.opcode_arg2}/${scriptEntry.opcode_arg3}`, pge)
            if (scriptEntry.type !== pge.script_state_type) {
                game.renders > game.debugStartFrame && console.log('exiting pge_process loop: removing', pge.index)
                logPgeInteraction(game, 'pge-frame', `end reason=script-type-mismatch text=${world.textToDisplay}`, pge)
                gameRemovePgeFromPendingGroups(game, pge.index)
                return
            }
            const _ax = gameExecutePgeObjectStep(game, pge, init_pge, scriptEntry)
            logPgeInteraction(game, 'pge-step', `result=${_ax} nextState=${pge.script_state_type}/${pge.first_script_entry_index} pos=(${pge.pos_x},${pge.pos_y}) room=${pge.room_location} text=${world.textToDisplay} loadMap=${world.loadMap}`, pge)

            if (world.currentLevel === 6 && (currentRoom === 50 || currentRoom === 51)) {
                if (pge.index === 79 && _ax === UINT16_MAX && scriptEntry.opcode1 === 0x60 && scriptEntry.opcode2 === 0 && scriptEntry.opcode3 === 0) {
                    if (gameGetCollisionLanePositionIndexByXY(game, runtime.livePgesByIndex[79], 0) === gameGetCollisionLanePositionIndexByXY(game, runtime.livePgesByIndex[0], 0)) {
                        gameQueuePgeGroupSignal(game, 79, 0, 4)
                    }
                }
            }

            if (_ax !== 0) {
                game.renders > game.debugStartFrame && console.log('exiting pge_process loop room transition handling')
                anim_data = game._res.getAniData(pge.script_state_type)
                const snd = anim_data[2]

                if (snd) {
                    gamePlayPgeAnimationSound(game, pge, snd)
                }
                logPgeInteraction(game, 'pge-transition', `before roomTransition pos=(${pge.pos_x},${pge.pos_y}) room=${pge.room_location} loadMap=${world.loadMap}`, pge)
                gameHandlePgeRoomTransitionAndActivation(game, pge, init_pge)
                logPgeInteraction(game, 'pge-transition', `after roomTransition pos=(${pge.pos_x},${pge.pos_y}) room=${pge.room_location} currentRoom=${world.currentRoom} loadMap=${world.loadMap}`, pge)
                break
            }
            ++objIndex
            scriptEntry = on.objects[objIndex]
        }
    } else {
        game.renders > game.debugStartFrame && console.log('else')
    }
    gameAdvancePgeAnimationState(game, pge)
    ++pge.anim_seq
    gameRemovePgeFromPendingGroups(game, pge.index)
    logPgeInteraction(game, 'pge-frame', `end animSeq=${pge.anim_seq} animNumber=${pge.anim_number} text=${world.textToDisplay}`, pge)
}

export function gameAdvancePgeAnimationState(game: Game, pge: LivePGE) {
    const anim_data = game._res.getAniData(pge.script_state_type)
    if (game._res.readUint16(anim_data) < pge.anim_seq) {
        pge.anim_seq = 0
    }
    const anim_frame = anim_data.subarray(6 + pge.anim_seq * 4)

    if (game._res.readUint16(anim_frame) !== UINT16_MAX) {
        let fl = game._res.readUint16(anim_frame)
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
        if (game._res.readUint16(anim_data, 4) & UINT16_MAX) {
            pge.flags |= PGE_FLAG_SPECIAL_ANIM
        }
        pge.anim_number = game._res.readUint16(anim_frame) & 0x7FFF
    }
}

export function gameHandlePgeRoomTransitionAndActivation(game: Game, pge: LivePGE, init_pge: InitPGE) {
    gameHandlePgeRoomTransition(game, pge, init_pge, getGamePgeState(game).currentPgeRoom, (scope, message, targetPge = pge) => {
        logPgeInteraction(game, scope, message, targetPge)
    })
}

export function gameAddPgeToRoomLiveList(game: Game, pge: LivePGE, room: number) {
    gameRelocatePgeToRoom(game, pge, room, (scope, message, targetPge = pge) => {
        logPgeInteraction(game, scope, message, targetPge)
    })
}

export function gamePlayPgeAnimationSound(game: Game, pge: LivePGE, arg2: number) {
    return gameAudioPgePlayAnimSound(game, pge, arg2)
}

export function gameApplyNextPgeAnimationFrameFromGroups(game: Game, pge: LivePGE, pendingGroups: { senderPgeIndex: number; signalId: number }[]) {
    const pgeState = getGamePgeState(game)
    const collisionState = getGameCollisionState(game)
    const init_pge: InitPGE = pge.init_PGE
    assert(!(init_pge.script_node_index >= game._res.level.numObjectNodes), `Assertion failed: ${init_pge.script_node_index} < ${game._res.level.numObjectNodes}`)

    const set_anim = () => {
        const anim_data = game._res.getAniData(pge.script_state_type)
        const _dh = game._res.readUint16(anim_data) & 0x00FF
        let _dl = pge.anim_seq
        const anim_frame = anim_data.subarray(6 + _dl * 4)
        let index = 0
        while (_dh > _dl) {
            if (game._res.readUint16(anim_frame, index) !== UINT16_MAX) {
                if (pgeState.currentPgeFacingIsMirrored) {
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
        collisionState.currentPgeCollisionGridY = (pge.pos_y / 36) & ~1
        collisionState.currentPgeCollisionGridX = (pge.pos_x + 8) >> 4
    }

    const on: PgeScriptNode = game._res.level.objectNodesMap[init_pge.script_node_index]
    let onIndex = pge.first_script_entry_index
    let scriptEntry: PgeScriptEntry = on.objects[onIndex]
    let i = pge.first_script_entry_index

    while (i < on.last_obj_number && pge.script_state_type === scriptEntry.type) {
        for (const pendingGroup of pendingGroups) {
            const groupId = pendingGroup.signalId
            if (scriptEntry.opcode2 === 0x6B) {
                if (scriptEntry.opcode_arg2 === 0) {
                    if (groupId === 1 || groupId === 2) {
                        set_anim()
                        return
                    }
                }
                if (scriptEntry.opcode_arg2 === 1) {
                    if (groupId === 3 || groupId === 4) {
                        set_anim()
                        return
                    }
                }
            } else if (groupId === scriptEntry.opcode_arg2) {
                if (scriptEntry.opcode2 === 0x22 || scriptEntry.opcode2 === 0x6F) {
                    set_anim()
                    return
                }
            }
            if (scriptEntry.opcode1 === 0x6B) {
                if (scriptEntry.opcode_arg1 === 0) {
                    if (groupId === 1 || groupId === 2) {
                        set_anim()
                        return
                    }
                }
                if (scriptEntry.opcode_arg1 === 1) {
                    if (groupId === 3 || groupId === 4) {
                        set_anim()
                        return
                    }
                }
            } else if (groupId === scriptEntry.opcode_arg1) {
                if (scriptEntry.opcode1 === 0x22 || scriptEntry.opcode1 === 0x6F) {
                    set_anim()
                    return
                }
            }
        }
        ++onIndex
        scriptEntry = on.objects[onIndex]
        ++i
    }
}

export function gameFindInventoryItemBeforePge(game: Game, pge: LivePGE, last_pge: LivePGE) {
    return gameInventoryPgeGetInventoryItemBefore(game, pge, last_pge)
}

export function gameRemovePgeFromInventory(game: Game, pge1: LivePGE, pge2: LivePGE, pge3: LivePGE) {
    return gameInventoryPgeRemoveFromInventory(game, pge1, pge2, pge3)
}

export function gameAddPgeToInventory(game: Game, pge1: LivePGE, pge2: LivePGE, pge3: LivePGE) {
    return gameInventoryPgeAddToInventory(game, pge1, pge2, pge3)
}

export function gameSetCurrentInventoryPge(game: Game, pge: LivePGE) {
    return gameInventoryPgeSetCurrentInventoryObject(game, pge)
}

export function gameRebuildPgeCollisionStateForCurrentRoom(game: Game, currentRoom: number) {
    const runtime = getRuntimeRegistryState(game)
    // clear the collisions arrays
    gameClearDynamicCollisionSlotState(game)
    if (currentRoom & 0x80) return

    for (const pge of runtime.livePgeStore.liveByRoom[currentRoom]) {
        // this is going to prepare the collisions table for all the PGEs in current roon
        gameRegisterPgeCollisionSegments(game, pge)
        if (!(pge.flags & PGE_FLAG_ACTIVE) && (pge.init_PGE.flags & INIT_PGE_FLAG_IN_CURRENT_ROOM_LIST)) {
            runtime.livePgeStore.activeFrameByIndex[pge.index] = pge
            pge.flags |= PGE_FLAG_ACTIVE
        }
    }

    for (let i = 0; i < game._res.level.pgeTotalNumInFile; ++i) {
        const pge2 = runtime.livePgeStore.activeFrameByIndex[i]
        if (pge2 && currentRoom !== pge2.room_location) {
            gameRegisterPgeCollisionSegments(game, pge2)
        }
    }
}

export function gameRebuildActiveFramePgeList(game: Game) {
    const runtime = getRuntimeRegistryState(game)
    runtime.livePgeStore.activeFrameList.length = 0
    for (const pge of runtime.livePgeStore.activeFrameByIndex) {
        if (pge) {
            runtime.livePgeStore.activeFrameList.push(pge)
        }
    }
}

export async function gameUpdatePgeDirectionalInputState(game: Game) {
    const pgeState = getGamePgeState(game)
    await game.inp_update()

    game._inp_lastKeysHit = game._stub._pi.dirMask
    if ((game._inp_lastKeysHit & 0xC) && (game._inp_lastKeysHit & 0x3)) {
        const mask = (game._inp_lastKeysHit & 0xF0) | (game._inp_lastKeysHitLeftRight & 0xF)
        pgeState.currentPgeInputMask = mask
        game._inp_lastKeysHit = mask
    } else {
        pgeState.currentPgeInputMask = game._inp_lastKeysHit
        game._inp_lastKeysHitLeftRight = game._inp_lastKeysHit
    }
    if (game._stub._pi.enter) {
        pgeState.currentPgeInputMask |= 0x10
    }
    if (game._stub._pi.space) {
        pgeState.currentPgeInputMask |= 0x20
    }
    if (game._stub._pi.shift) {
        pgeState.currentPgeInputMask |= 0x40
    }
}

export function gameResetPgeGroupState(game: Game) {
    getRuntimeRegistryState(game).pendingSignalsByTargetPgeIndex.clear()
}
