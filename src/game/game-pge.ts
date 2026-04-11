import type {
    InitPGE,
    LivePGE,
    PgeScriptEntry,
    PgeScriptNode,
    PgeOpcodeArgs
} from '../core/intern'
import { assert } from "../core/assert"
import type { Game } from './game'
import type { PgeOpcodeHandler } from './game-types'
import { ctDownRoom, ctLeftRoom, ctRightRoom, ctUpRoom } from '../core/game_constants'
import {
    gameClearDynamicCollisionSlotState,
    gameGetCollisionLanePositionIndexByXY,
    gameRegisterPgeCollisionSegments
} from './game-collision'
import {
    initPgeFlagHasCollision,
    initPgeFlagInCurrentRoomList,
    initPgeInitFlagsHasFlag3,
    initPgeFlagUnknownBit1,
    objFlagDecLife,
    objFlagIncLife,
    objFlagSetDead,
    objFlagToggleMirror,
    pgeFlagActive,
    pgeFlagAutoActivate,
    pgeFlagFlipX,
    pgeFlagForeground,
    pgeFlagMirrored,
    pgeFlagSpecialAnim,
    uint8Max,
    uint16Max,
    ctRoomSize
} from '../core/game_constants'
import { gamePlayPgeAnimationSoundEffect as gameAudioPgePlayAnimSound } from './game-audio'
import { gameDebugLog, gameDebugTrace, gameDebugWarn } from './game-debug'
import { gameHandlePgeRoomTransition, gameRelocatePgeToRoom } from './game-room-transition'
import {
    gameAddPgeToInventoryChain as gameInventoryPgeAddToInventory,
    gameFindInventoryItemBeforePge as gameInventoryPgeGetInventoryItemBefore,
    gameRemovePgeFromInventoryChain as gameInventoryPgeRemoveFromInventory,
    gameReorderPgeInventoryLinks as gameInventoryPgeReorderInventory,
    gameSetCurrentInventoryPgeSelection as gameInventoryPgeSetCurrentInventoryObject,
    gameUpdatePgeInventoryLinks as gameInventoryPgeUpdateInventory
} from './game-inventory'
import { gameInpUpdate } from './game-world'
import { scoreTable } from '../core/staticres'
import { getGameCollisionState, getGamePgeState, getGameSessionState, getGameUiState, getGameWorldState } from './game-state'
import { getRoomPges, getRuntimeRegistryState } from './game-runtime-data'

function shouldLogPgeInteraction(game: Game, pge?: LivePGE) {
    const session = getGameSessionState(game)
    const world = getGameWorldState(game)
    const isDirectStartStartup = session.startedFromLevelSelect && game.renders < 5 && (!pge || pge.index === 0)
    return isDirectStartStartup || game.renders > game.debugStartFrame || world.currentRoom === 39 || pge?.roomLocation === 39 || world.textToDisplay !== uint16Max
}

function logPgeInteraction(game: Game, scope: string, message: string, pge?: LivePGE) {
    const world = getGameWorldState(game)
    if (!shouldLogPgeInteraction(game, pge)) {
        return
    }
    const prefix = pge
        ? `[${scope}] frame=${game.renders} currentRoom=${world.currentRoom} pge=${pge.index} pgeRoom=${pge.roomLocation} state=${pge.scriptStateType}/${pge.firstScriptEntryIndex}`
        : `[${scope}] frame=${game.renders} currentRoom=${world.currentRoom}`
    gameDebugLog(game, 'pge', `${prefix} ${message}`)
}

function warnInvalidScriptEntryTransition(game: Game, pge: LivePGE, scriptNode: PgeScriptNode, scriptEntry: PgeScriptEntry) {
    const world = getGameWorldState(game)
    const maxEntryIndex = Math.min(scriptNode.lastObjNumber, scriptNode.objects.length - 1)
    gameDebugWarn(
        game,
        'pge',
        `[pge-transition] frame=${game.renders} currentRoom=${world.currentRoom} pge=${pge.index} pgeRoom=${pge.roomLocation} scriptNode=${pge.initPge.scriptNodeIndex} objectType=${pge.initPge.objectType} state=${pge.scriptStateType} currentEntry=${pge.firstScriptEntryIndex} nextEntry=${scriptEntry.nextScriptEntryIndex} maxEntry=${maxEntryIndex} nextState=${scriptEntry.nextScriptStateType}`
    )
}


export function gameLoadPgeForCurrentLevel(game: Game, idx: number, currentRoom: number) {
    const ui = getGameUiState(game)
    const runtime = getRuntimeRegistryState(game)
    const initialPgeFromFile: InitPGE = game.services.res.level.pgeAllInitialStateFromFile[idx]
    const livePge: LivePGE = runtime.livePgesByIndex[idx]

    livePge.initPge = initialPgeFromFile
    livePge.scriptStateType = initialPgeFromFile.type
    livePge.posX = initialPgeFromFile.posX
    livePge.posY = initialPgeFromFile.posY
    livePge.animSeq = 0
    livePge.roomLocation = initialPgeFromFile.initRoom

    // Conrad is PGE index 0. Override his starting shield count here instead of
    // changing the inventory counter item, which only mirrors Conrad's real life.
    livePge.life = idx === 0 ? 20 : initialPgeFromFile.life
    if (ui.skillLevel >= 2 && initialPgeFromFile.objectType === 10) {
        livePge.life *= 2
    }
    livePge.counterValue = 0
    livePge.collisionSlot = uint16Max
    livePge.inventoryOwnerPgeIndex = uint8Max
    livePge.animNumber = 0
    livePge.index = idx

    let flags = 0
    if (initialPgeFromFile.skill > ui.skillLevel) {
        return
    }

    if (initialPgeFromFile.roomLocation !== 0 || ((initialPgeFromFile.flags & initPgeFlagInCurrentRoomList) && (currentRoom === initialPgeFromFile.initRoom))) {
        flags |= pgeFlagActive
        runtime.livePgeStore.activeFrameByIndex[idx] = livePge
    }
    if (initialPgeFromFile.mirrorX !== 0) {
        flags |= pgeFlagMirrored
    }
    if (initialPgeFromFile.initFlags & initPgeInitFlagsHasFlag3) {
        flags |= pgeFlagForeground
    }
    flags |= (initialPgeFromFile.initFlags & 3) << 5
    if (initialPgeFromFile.flags & initPgeFlagUnknownBit1) {
        flags |= pgeFlagAutoActivate
    }

    livePge.flags = flags
    assert(!(initialPgeFromFile.scriptNodeIndex >= game.services.res.level.numObjectNodes), `Assertion failed: ${initialPgeFromFile.scriptNodeIndex} < ${game.services.res.level.numObjectNodes}}`)
    const on: PgeScriptNode = game.services.res.level.objectNodesMap[initialPgeFromFile.scriptNodeIndex]

    let scriptEntryIndex = 0
    let i = 0
    while (on.objects[scriptEntryIndex].type !== livePge.scriptStateType) {
        ++i
        ++scriptEntryIndex
    }
    assert(!(i >= on.numObjects), `Assertion failed: ${i} < ${on.numObjects}`)
    if (!on.objects[scriptEntryIndex]) {
        gameDebugWarn(
            game,
            'pge',
            `[pge-load] Missing initial script entry: pge=${livePge.index} scriptNode=${initialPgeFromFile.scriptNodeIndex} state=${livePge.scriptStateType} entry=${scriptEntryIndex} numObjects=${on.numObjects} lastObj=${on.lastObjNumber}`
        )
    }
    livePge.firstScriptEntryIndex = i
    gameInitializePgeDefaultAnimation(game, livePge)
}

export function gameInitializePgeDefaultAnimation(game: Game, pge: LivePGE) {
    const animData = game.services.res.getAniData(pge.scriptStateType)
    if (pge.animSeq < game.services.res.readUint16(animData)) {
        pge.animSeq = 0
    }
    const animFrame = animData.subarray(6 + pge.animSeq * 4)
    if (game.services.res.readUint16(animFrame) !== uint16Max) {
        let f = game.services.res.readUint16(animData)
        if (pge.flags & pgeFlagMirrored) {
            f ^= 0x8000
        }
        pge.flags &= ~pgeFlagFlipX
        if (f & 0x8000) {
            pge.flags |= pgeFlagFlipX
        }
        pge.flags &= ~pgeFlagSpecialAnim
        if (game.services.res.readUint16(animData, 4) & uint16Max) {
            pge.flags |= pgeFlagSpecialAnim
        }

        pge.animNumber = game.services.res.readUint16(animFrame) & 0x7FFF
    }
}

export function gameRemovePgeFromPendingGroups(game: Game, idx: number) {
    getRuntimeRegistryState(game).pendingSignalsByTargetPgeIndex.delete(idx)
}

export function gameExecutePgeObjectStep(game: Game, livePge: LivePGE, initPge: InitPGE, scriptEntry: PgeScriptEntry) {
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
        args.pge = livePge
        args.a = scriptEntry.opcodeArg1
        args.b = 0
        gameDebugTrace(game, 'pge', `pgeExecute op1=0x${scriptEntry.opcode1.toString(16)}`)
        op = game._opcodeHandlers[scriptEntry.opcode1]
        if (!op) {
            throw new Error(`Game::pgeExecute() missing call to pgeOpcode 0x${scriptEntry.opcode1.toString(16)}`)
        }
        if (!(op(args, game) & uint8Max)) {
            return 0
        }
    }
    if (scriptEntry.opcode2) {
        args.pge = livePge
        args.a = scriptEntry.opcodeArg2
        args.b = scriptEntry.opcodeArg1
        gameDebugTrace(game, 'pge', `pgeExecute op2=0x${scriptEntry.opcode2.toString(16)}`)
        const op2 = game._opcodeHandlers[scriptEntry.opcode2]
        if (!op2) {
            gameDebugWarn(game, 'pge', `Game::pgeExecute() missing call to pgeOpcode 0x${scriptEntry.opcode2.toString(16)}`)
            return 0
        }
        if (!(op2(args, game) & uint8Max)) {
            return 0
        }
    }
    if (scriptEntry.opcode3) {
        args.pge = livePge
        args.a = scriptEntry.opcodeArg3
        args.b = 0
        gameDebugTrace(game, 'pge', `pgeExecute op3=0x${scriptEntry.opcode3.toString(16)}`)
        op = game._opcodeHandlers[scriptEntry.opcode3]
        if (op) {
            op(args, game)
        } else {
            gameDebugWarn(game, 'pge', `Game::pgeExecute() missing call to pgeOpcode 0x${scriptEntry.opcode3.toString(16)}`)
        }
    }
    livePge.scriptStateType = scriptEntry.nextScriptStateType
    const nextScriptNode = game.services.res.level.objectNodesMap[livePge.initPge.scriptNodeIndex]
    if (scriptEntry.nextScriptEntryIndex < 0 || scriptEntry.nextScriptEntryIndex >= nextScriptNode.objects.length || scriptEntry.nextScriptEntryIndex > nextScriptNode.lastObjNumber) {
        warnInvalidScriptEntryTransition(game, livePge, nextScriptNode, scriptEntry)
    }
    livePge.firstScriptEntryIndex = scriptEntry.nextScriptEntryIndex
    livePge.animSeq = 0
    if (scriptEntry.flags & 0xF0) {
        ui.score += scoreTable[scriptEntry.flags >> 4]
    }
    if (scriptEntry.flags & objFlagToggleMirror) {
        livePge.flags ^= pgeFlagMirrored
    }
    if (scriptEntry.flags & objFlagDecLife) {
        --livePge.life
        if (initPge.objectType === 1) {
            pgeState.shouldProcessCurrentPgeObjectNode = true
        } else if (initPge.objectType === 10) {
            ui.score += 100
        }
    }
    if (scriptEntry.flags & objFlagIncLife) {
        ++livePge.life
    }
    if (scriptEntry.flags & objFlagSetDead) {
        livePge.life = -1
    }

    if (livePge.flags & pgeFlagMirrored) {
        livePge.posX -= scriptEntry.dx
    } else {
        livePge.posX += scriptEntry.dx
    }
    livePge.posY += scriptEntry.dy

    if (pgeState.shouldProcessCurrentPgeObjectNode && initPge.objectType === 1) {
        if (gameObjectNodeHasPgeGroupCondition(game, livePge) !== 0) {
            world.blinkingConradCounter = 60
            pgeState.shouldProcessCurrentPgeObjectNode = false
        }
    }
    return uint16Max
}

export function gameObjectNodeHasPgeGroupCondition(game: Game, pge: LivePGE) {
    const initPge: InitPGE = pge.initPge
    assert(!(initPge.scriptNodeIndex >= game.services.res.level.numObjectNodes), `Assertion failed: ${initPge.scriptNodeIndex} < ${game.services.res.level.numObjectNodes}`)
    const on: PgeScriptNode = game.services.res.level.objectNodesMap[initPge.scriptNodeIndex]
    let objIndex = pge.firstScriptEntryIndex
    let scriptEntry: PgeScriptEntry = on.objects[objIndex]
    let i = pge.firstScriptEntryIndex
    while (i < on.lastObjNumber && pge.scriptStateType === scriptEntry.type) {
        if (scriptEntry.opcode2 === 0x6B) return uint16Max
        if (scriptEntry.opcode2 === 0x22 && scriptEntry.opcodeArg2 <= 4) return uint16Max
        if (scriptEntry.opcode1 === 0x6B) return uint16Max
        if (scriptEntry.opcode1 === 0x22 && scriptEntry.opcodeArg1 <= 4) return uint16Max
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
    if (!(pge.flags & pgeFlagActive)) {
        pge.flags |= pgeFlagActive
        runtime.livePgeStore.activeFrameByIndex[targetPgeIndex] = pge
        gameDebugLog(game, 'pge', `[group-signal] activated target=${targetPgeIndex} room=${pge.roomLocation} signal=${signalId}`)
    }
    if (signalId <= 4) {
        const pgeRoom = pge.roomLocation
        pge = runtime.livePgesByIndex[senderPgeIndex]
        if (pgeRoom !== pge.roomLocation) {
            gameDebugLog(game, 'pge', `[group-signal] skip sender=${senderPgeIndex} target=${targetPgeIndex} signal=${signalId} reason=room-mismatch senderRoom=${pge.roomLocation} targetRoom=${pgeRoom}`)
            return
        }
        if (targetPgeIndex === 0 && world.blinkingConradCounter !== 0) {
            gameDebugLog(game, 'pge', `[group-signal] skip sender=${senderPgeIndex} target=0 signal=${signalId} reason=conrad-blinking counter=${world.blinkingConradCounter}`)
            return
        }
    }
    const pendingGroups = runtime.pendingSignalsByTargetPgeIndex.get(targetPgeIndex) ?? []
    pendingGroups.unshift({
        senderPgeIndex,
        signalId
    })
    runtime.pendingSignalsByTargetPgeIndex.set(targetPgeIndex, pendingGroups)
    gameDebugLog(game, 'pge', `[group-signal] queued sender=${senderPgeIndex} target=${targetPgeIndex} signal=${signalId} pending=${pendingGroups.length}`)
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
    pgeState.currentPgeFacingIsMirrored = (pge.flags & pgeFlagMirrored) !== 0
    pgeState.currentPgeRoom = pge.roomLocation
    const pendingGroups = runtime.pendingSignalsByTargetPgeIndex.get(pge.index)
    logPgeInteraction(game, 'pge-frame', `start currentRoomArg=${currentRoom} pos=(${pge.posX},${pge.posY}) animSeq=${pge.animSeq} pendingGroups=${pendingGroups?.map(({ senderPgeIndex, signalId }) => `${senderPgeIndex}:${signalId}`).join(',') || 'none'}`, pge)
    gameDebugTrace(game, 'pge', `currentPgeFacingIsMirrored=${pgeState.currentPgeFacingIsMirrored} currentPgeRoom=${pgeState.currentPgeRoom} pendingGroups=${pendingGroups?.length ?? 0}`)
    if (pendingGroups?.length) {
        gameApplyNextPgeAnimationFrameFromGroups(game, pge, pendingGroups)
    }
    let animData = game.services.res.getAniData(pge.scriptStateType)
    gameDebugTrace(game, 'pge', `read=${game.services.res.readUint16(animData)} animSeq=${pge.animSeq}`)
    if (game.services.res.readUint16(animData) <= pge.animSeq) {
        gameDebugTrace(game, 'pge', 'if')
        const initPge: InitPGE = pge.initPge
        assert(!(initPge.scriptNodeIndex >= game.services.res.level.numObjectNodes), `Assertion failed: ${initPge.scriptNodeIndex} < ${game.services.res.level.numObjectNodes}`)

        const on: PgeScriptNode = game.services.res.level.objectNodesMap[initPge.scriptNodeIndex]
        let objIndex = pge.firstScriptEntryIndex
        let scriptEntry: PgeScriptEntry = on.objects[objIndex]
        let i = 0
        while (1) {
            gameDebugTrace(game, 'pge', `** pgeProcess(${i++})`)
            logPgeInteraction(game, 'pge-step', `scriptEntryIndex=${objIndex} type=${scriptEntry.type} opcodes=0x${scriptEntry.opcode1.toString(16)}/0x${scriptEntry.opcode2.toString(16)}/0x${scriptEntry.opcode3.toString(16)} args=${scriptEntry.opcodeArg1}/${scriptEntry.opcodeArg2}/${scriptEntry.opcodeArg3}`, pge)
            if (scriptEntry.type !== pge.scriptStateType) {
                gameDebugTrace(game, 'pge', `exiting pge_process loop: removing ${pge.index}`)
                logPgeInteraction(game, 'pge-frame', `end reason=script-type-mismatch text=${world.textToDisplay}`, pge)
                gameRemovePgeFromPendingGroups(game, pge.index)
                return
            }
            const _ax = gameExecutePgeObjectStep(game, pge, initPge, scriptEntry)
            logPgeInteraction(game, 'pge-step', `result=${_ax} nextState=${pge.scriptStateType}/${pge.firstScriptEntryIndex} pos=(${pge.posX},${pge.posY}) room=${pge.roomLocation} text=${world.textToDisplay} loadMap=${world.loadMap}`, pge)

            if (world.currentLevel === 6 && (currentRoom === 50 || currentRoom === 51)) {
                if (pge.index === 79 && _ax === uint16Max && scriptEntry.opcode1 === 0x60 && scriptEntry.opcode2 === 0 && scriptEntry.opcode3 === 0) {
                    if (gameGetCollisionLanePositionIndexByXY(game, runtime.livePgesByIndex[79], 0) === gameGetCollisionLanePositionIndexByXY(game, runtime.livePgesByIndex[0], 0)) {
                        gameQueuePgeGroupSignal(game, 79, 0, 4)
                    }
                }
            }

            if (_ax !== 0) {
                gameDebugTrace(game, 'pge', 'exiting pge_process loop room transition handling')
                animData = game.services.res.getAniData(pge.scriptStateType)
                const snd = animData[2]

                if (snd) {
                    gamePlayPgeAnimationSound(game, pge, snd)
                }
                logPgeInteraction(game, 'pge-transition', `before roomTransition pos=(${pge.posX},${pge.posY}) room=${pge.roomLocation} loadMap=${world.loadMap}`, pge)
                gameHandlePgeRoomTransitionAndActivation(game, pge, initPge)
                logPgeInteraction(game, 'pge-transition', `after roomTransition pos=(${pge.posX},${pge.posY}) room=${pge.roomLocation} currentRoom=${world.currentRoom} loadMap=${world.loadMap}`, pge)
                break
            }
            ++objIndex
            scriptEntry = on.objects[objIndex]
        }
    } else {
        gameDebugTrace(game, 'pge', 'else')
    }
    gameAdvancePgeAnimationState(game, pge)
    ++pge.animSeq
    gameRemovePgeFromPendingGroups(game, pge.index)
    logPgeInteraction(game, 'pge-frame', `end animSeq=${pge.animSeq} animNumber=${pge.animNumber} text=${world.textToDisplay}`, pge)
}

export function gameAdvancePgeAnimationState(game: Game, pge: LivePGE) {
    const animData = game.services.res.getAniData(pge.scriptStateType)
    if (game.services.res.readUint16(animData) < pge.animSeq) {
        pge.animSeq = 0
    }
    const animFrame = animData.subarray(6 + pge.animSeq * 4)

    if (game.services.res.readUint16(animFrame) !== uint16Max) {
        let fl = game.services.res.readUint16(animFrame)
        if (pge.flags & pgeFlagMirrored) {
            fl ^= 0x8000
            pge.posX = pge.posX - (animFrame[2] << 24 >> 24)
        } else {
            pge.posX = pge.posX + (animFrame[2] << 24 >> 24)
        }
        pge.posY = pge.posY + (animFrame[3] << 24 >> 24)
        pge.flags &= ~pgeFlagFlipX
        if (fl & 0x8000) {
            pge.flags |= pgeFlagFlipX
        }
        pge.flags &= ~pgeFlagSpecialAnim
        if (game.services.res.readUint16(animData, 4) & uint16Max) {
            pge.flags |= pgeFlagSpecialAnim
        }
        pge.animNumber = game.services.res.readUint16(animFrame) & 0x7FFF
    }
}

export function gameHandlePgeRoomTransitionAndActivation(game: Game, pge: LivePGE, initPge: InitPGE) {
    gameHandlePgeRoomTransition(game, pge, initPge, getGamePgeState(game).currentPgeRoom, (scope, message, targetPge = pge) => {
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
    const initPge: InitPGE = pge.initPge
    assert(!(initPge.scriptNodeIndex >= game.services.res.level.numObjectNodes), `Assertion failed: ${initPge.scriptNodeIndex} < ${game.services.res.level.numObjectNodes}`)

    const setAnim = () => {
        const animData = game.services.res.getAniData(pge.scriptStateType)
        const _dh = game.services.res.readUint16(animData) & 0x00FF
        const previousAnimSeq = pge.animSeq
        const previousPosX = pge.posX
        const previousPosY = pge.posY
        let _dl = pge.animSeq
        const animFrame = animData.subarray(6 + _dl * 4)
        let index = 0
        while (_dh > _dl) {
            if (game.services.res.readUint16(animFrame, index) !== uint16Max) {
                if (pgeState.currentPgeFacingIsMirrored) {
                    pge.posX = pge.posX - (animFrame[2 + index] << 24 >> 24)
                } else {
                    pge.posX = pge.posX + (animFrame[2 + index] << 24 >> 24)
                }
                pge.posY = pge.posY + (animFrame[3 + index] << 24 >> 24)
            }
            index += 4
            ++_dl
        }
        pge.animSeq = _dh
        collisionState.currentPgeCollisionGridY = (pge.posY / 36) & ~1
        collisionState.currentPgeCollisionGridX = (pge.posX + 8) >> 4
        gameDebugLog(game, 'pge', `[group-anim] pge=${pge.index} animSeq=${previousAnimSeq}->${pge.animSeq} pos=(${previousPosX},${previousPosY})->(${pge.posX},${pge.posY}) collisionOrigin=(${collisionState.currentPgeCollisionGridX},${collisionState.currentPgeCollisionGridY})`)
    }

    const on: PgeScriptNode = game.services.res.level.objectNodesMap[initPge.scriptNodeIndex]
    let onIndex = pge.firstScriptEntryIndex
    let scriptEntry: PgeScriptEntry = on.objects[onIndex]
    let i = pge.firstScriptEntryIndex

    while (i < on.lastObjNumber && pge.scriptStateType === scriptEntry.type) {
        for (const pendingGroup of pendingGroups) {
            const groupId = pendingGroup.signalId
            if (scriptEntry.opcode2 === 0x6B) {
                if (scriptEntry.opcodeArg2 === 0) {
                    if (groupId === 1 || groupId === 2) {
                        gameDebugLog(game, 'pge', `[group-anim] match opcode2=0x6B arg=${scriptEntry.opcodeArg2} group=${groupId} pge=${pge.index}`)
                        setAnim()
                        return
                    }
                }
                if (scriptEntry.opcodeArg2 === 1) {
                    if (groupId === 3 || groupId === 4) {
                        gameDebugLog(game, 'pge', `[group-anim] match opcode2=0x6B arg=${scriptEntry.opcodeArg2} group=${groupId} pge=${pge.index}`)
                        setAnim()
                        return
                    }
                }
            } else if (groupId === scriptEntry.opcodeArg2) {
                if (scriptEntry.opcode2 === 0x22 || scriptEntry.opcode2 === 0x6F) {
                    gameDebugLog(game, 'pge', `[group-anim] match opcode2=0x${scriptEntry.opcode2.toString(16)} arg=${scriptEntry.opcodeArg2} group=${groupId} pge=${pge.index}`)
                    setAnim()
                    return
                }
            }
            if (scriptEntry.opcode1 === 0x6B) {
                if (scriptEntry.opcodeArg1 === 0) {
                    if (groupId === 1 || groupId === 2) {
                        gameDebugLog(game, 'pge', `[group-anim] match opcode1=0x6B arg=${scriptEntry.opcodeArg1} group=${groupId} pge=${pge.index}`)
                        setAnim()
                        return
                    }
                }
                if (scriptEntry.opcodeArg1 === 1) {
                    if (groupId === 3 || groupId === 4) {
                        gameDebugLog(game, 'pge', `[group-anim] match opcode1=0x6B arg=${scriptEntry.opcodeArg1} group=${groupId} pge=${pge.index}`)
                        setAnim()
                        return
                    }
                }
            } else if (groupId === scriptEntry.opcodeArg1) {
                if (scriptEntry.opcode1 === 0x22 || scriptEntry.opcode1 === 0x6F) {
                    gameDebugLog(game, 'pge', `[group-anim] match opcode1=0x${scriptEntry.opcode1.toString(16)} arg=${scriptEntry.opcodeArg1} group=${groupId} pge=${pge.index}`)
                    setAnim()
                    return
                }
            }
        }
        ++onIndex
        scriptEntry = on.objects[onIndex]
        ++i
    }
    gameDebugLog(game, 'pge', `[group-anim] no-match pge=${pge.index} pending=${pendingGroups.map(({ senderPgeIndex, signalId }) => `${senderPgeIndex}:${signalId}`).join(',') || 'none'}`)
}

export function gameFindInventoryItemBeforePge(game: Game, pge: LivePGE, lastPge: LivePGE) {
    return gameInventoryPgeGetInventoryItemBefore(game, pge, lastPge)
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
    if (currentRoom & 0x80) {
        gameDebugLog(game, 'collision', `[collision-rebuild] skip room=${currentRoom} reason=invalid-room-flag`)
        return
    }
    let registeredSegments = 0

    for (const pge of getRoomPges(game, currentRoom)) {
        // this is going to prepare the collisions table for all the PGEs in current roon
        const previousCount = getGameCollisionState(game).nextFreeDynamicPgeCollisionSlotPoolIndex
        gameRegisterPgeCollisionSegments(game, pge)
        registeredSegments += getGameCollisionState(game).nextFreeDynamicPgeCollisionSlotPoolIndex - previousCount
        if (!(pge.flags & pgeFlagActive) && (pge.initPge.flags & initPgeFlagInCurrentRoomList)) {
            runtime.livePgeStore.activeFrameByIndex[pge.index] = pge
            pge.flags |= pgeFlagActive
        }
    }

    for (let i = 0; i < game.services.res.level.pgeTotalNumInFile; ++i) {
        const pge2 = runtime.livePgeStore.activeFrameByIndex[i]
        if (pge2 && currentRoom !== pge2.roomLocation) {
            const previousCount = getGameCollisionState(game).nextFreeDynamicPgeCollisionSlotPoolIndex
            gameRegisterPgeCollisionSegments(game, pge2)
            registeredSegments += getGameCollisionState(game).nextFreeDynamicPgeCollisionSlotPoolIndex - previousCount
        }
    }
    gameDebugLog(game, 'collision', `[collision-rebuild] room=${currentRoom} activeFrame=${runtime.livePgeStore.activeFrameByIndex.filter(Boolean).length} buckets=${game.collision.dynamicPgeCollisionSlotsByPosition.size} segments=${registeredSegments}`)
}

export function gameRebuildActiveFramePgeList(game: Game) {
    const runtime = getRuntimeRegistryState(game)
    runtime.livePgeStore.activeFrameList.length = 0
    for (const pge of runtime.livePgeStore.activeFrameByIndex) {
        if (pge) {
            runtime.livePgeStore.activeFrameList.push(pge)
        }
    }
    gameDebugLog(game, 'runtime', `[frame-list] rebuilt count=${runtime.livePgeStore.activeFrameList.length}`)
}

export async function gameUpdatePgeDirectionalInputState(game: Game) {
    const pgeState = getGamePgeState(game)
    await game.inpUpdate()

    const rawDirMask = game.services.stub._pi.dirMask
    game._inpLastkeyshit = game.services.stub._pi.dirMask
    if ((game._inpLastkeyshit & 0xC) && (game._inpLastkeyshit & 0x3)) {
        const mask = (game._inpLastkeyshit & 0xF0) | (game._inpLastkeyshitleftright & 0xF)
        pgeState.currentPgeInputMask = mask
        game._inpLastkeyshit = mask
    } else {
        pgeState.currentPgeInputMask = game._inpLastkeyshit
        game._inpLastkeyshitleftright = game._inpLastkeyshit
    }
    if (game.services.stub._pi.enter) {
        pgeState.currentPgeInputMask |= 0x10
    }
    if (game.services.stub._pi.space) {
        pgeState.currentPgeInputMask |= 0x20
    }
    if (game.services.stub._pi.shift) {
        pgeState.currentPgeInputMask |= 0x40
    }
    gameDebugLog(game, 'session', `[input] rawDirMask=0x${rawDirMask.toString(16)} enter=${game.services.stub._pi.enter} space=${game.services.stub._pi.space} shift=${game.services.stub._pi.shift} resolvedMask=0x${pgeState.currentPgeInputMask.toString(16)}`)
}

export function gameResetPgeGroupState(game: Game) {
    getRuntimeRegistryState(game).pendingSignalsByTargetPgeIndex.clear()
}
