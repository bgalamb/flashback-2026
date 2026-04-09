import type { InitPGE, LivePGE, PgeScriptNode } from '../core/intern'
import { CreatePGE, readBeUint16, readBeUint32, readLeUint32 } from '../core/intern'
import type { Game } from './game'
import { ctDownRoom, ctLeftRoom, ctRightRoom, ctUpRoom } from '../core/game_constants'
import { Mixer } from '../audio/mixer'
import { ObjectType } from '../resource/resource'
import { ctGridStride, ctHeaderSize, gamescreenH, gamescreenW } from '../core/game_constants'
import { pgeFlagFlipX, pgeFlagSpecialAnim, uint16Max, uint8Max } from '../core/game_constants'
import { _gameLevels } from '../core/staticres'
import { monsterListsByLevel } from '../core/staticres-monsters'
import { assert } from "../core/assert"
import { gameDebugLog, gameDebugTrace, gameDebugWarn } from './game_debug'
import { gameInitializePgeDefaultAnimation, gameLoadPgeForCurrentLevel, gameResetPgeGroupState } from './game_pge'
import { gameClearValidSaveState, gameCommitLoadedRoom, roomOverlayDurationFrames, gameResetLevelLifecycle } from './game_lifecycle'
import { getGameServices } from './game_services'
import { getGameCollisionState, getGameSessionState, getGameUiState, getGameWorldState } from './game_state'
import { getRenderDataState, getRoomPges, getRuntimeRegistryState } from './game_runtime_data'

const monsterPaletteSlot = 5

interface DirectLevelStartOverride {
    room: number
    posX?: number
    posY?: number
    stateType?: number
}

const directLevelStartOverrides: Record<number, DirectLevelStartOverride> = {
    // Inner-level direct starts need Conrad's post-intro grounded state.
    // The cinematic entry states (99/103) fall back into state 1 without the
    // original story-transition signals, which sends the player straight into
    // the default fall/death path.
    3: { room: 39, posX: 64, posY: 142, stateType: 57 },
    4: { room: 52, posX: 64, posY: 142, stateType: 57 },
    5: { room: 2, posX: 64, posY: 142, stateType: 57 },
    6: { room: 29, posX: 16, posY: 142, stateType: 57 }
}

function getLevelStartRoom(game: Game) {
    const session = getGameSessionState(game)
    const world = getGameWorldState(game)
    if (session.startedFromLevelSelect) {
        const override = directLevelStartOverrides[world.currentLevel]
        if (override) {
            return override.room
        }
    }
    return getGameServices(game).res.level.pgeAllInitialStateFromFile[0].initRoom
}

function applyDirectLevelStartOverride(game: Game) {
    const session = getGameSessionState(game)
    const world = getGameWorldState(game)
    if (!session.startedFromLevelSelect) {
        return
    }
    const override = directLevelStartOverrides[world.currentLevel]
    if (!override) {
        return
    }
    const conrad = getRuntimeRegistryState(game).livePgesByIndex[0]
    const conradScriptNode: PgeScriptNode = getGameServices(game).res.level.objectNodesMap[conrad.initPge.scriptNodeIndex]
    conrad.roomLocation = override.room
    if (typeof override.posX === 'number') {
        conrad.posX = override.posX
    }
    if (typeof override.posY === 'number') {
        conrad.posY = override.posY
    }
    if (typeof override.stateType === 'number') {
        conrad.scriptStateType = override.stateType
        const nextIndex = conradScriptNode.objects.findIndex((entry) => entry.type === override.stateType)
        if (nextIndex >= 0) {
            conrad.firstScriptEntryIndex = nextIndex
        } else {
            gameDebugWarn(game, 'world', `[direct-start] Missing Conrad script state ${override.stateType} for level ${world.currentLevel}`)
        }
        conrad.animSeq = 0
        gameInitializePgeDefaultAnimation(game, conrad)
    }
}

function isMonsterPge(initPge: InitPGE): boolean {
    return initPge.scriptNodeIndex === 0x49 || initPge.objectType === 10
}

function getLoadedMonsterVisualForPge(game: Game, pge: LivePGE) {
    if (!isMonsterPge(pge.initPge)) {
        return null
    }
    return game._loadedMonsterVisualsByScriptNodeIndex.get(pge.initPge.scriptNodeIndex) || null
}

export function gameGetRandomNumber(game: Game) {
    const session = getGameSessionState(game)
    let n = session.randSeed * 2
    if ((session.randSeed << 32 >> 32) >= 0) {
        n ^= 0x1D872B41
    }
    session.randSeed = n
    return n & uint16Max
}

export async function gameChangeLevel(game: Game) {
    const world = getGameWorldState(game)
    const { vid } = getGameServices(game)
    gameDebugLog(game, 'world', `[level-change] begin level=${world.currentLevel} room=${world.currentRoom}`)
    await vid.fadeOut()
    game.clearStateRewind()
    await game.loadLevelData()
    await game.loadLevelMap(world.currentRoom)
    gameCommitLoadedRoom(game, world.currentRoom)
    vid.setPalette0xF()
    vid.setTextPalette()
    vid.fullRefresh()
    gameDebugLog(game, 'world', `[level-change] complete level=${world.currentLevel} room=${world.currentRoom}`)
}

export async function gameInpUpdate(game: Game) {
    await getGameServices(game).stub.processEvents()
}

export function gameResetGameState(game: Game) {
    const render = getRenderDataState(game)
    const runtime = getRuntimeRegistryState(game)
    render.animBuffers._states[0] = render.animBuffer0State
    render.animBuffers._curPos[0] = uint8Max
    render.animBuffers._states[1] = render.animBuffer1State
    render.animBuffers._curPos[1] = uint8Max
    render.animBuffers._states[2] = render.animBuffer2State
    render.animBuffers._curPos[2] = uint8Max
    render.animBuffers._states[3] = render.animBuffer3State
    render.animBuffers._curPos[3] = uint8Max
    gameResetLevelLifecycle(game, getLevelStartRoom(game))
    game.resetPgeGroups()
    runtime.inventoryItemIndicesByOwner.clear()
}

export async function gameLoadMonsterSprites(game: Game, pge: LivePGE, currentRoom: number) {
    const world = getGameWorldState(game)
    const initPge: InitPGE = pge.initPge
    if (!isMonsterPge(initPge)) {
        return uint16Max
    }
    if (pge.roomLocation !== currentRoom) {
        gameDebugLog(game, 'world', `[monster-load] skip pge=${pge.index} room=${pge.roomLocation} currentRoom=${currentRoom}`)
        return 0
    }

    const currentLevelMonsters = monsterListsByLevel[world.currentLevel]
    const currentMonster = currentLevelMonsters.find((monster) => monster.monsterScriptNodeIndex === initPge.scriptNodeIndex)
    if (!currentMonster) {
        throw new Error(`Missing monster descriptor for script node ${initPge.scriptNodeIndex} on level ${world.currentLevel}`)
    }
    if (!game._loadedMonsterVisualsByScriptNodeIndex.has(currentMonster.monsterScriptNodeIndex)) {
        const { res, vid } = getGameServices(game)
        const resolvedSpriteSet = await res.loadMonsterResolvedSpriteSet(currentMonster.name)
        game._loadedMonsterVisualsByScriptNodeIndex.set(currentMonster.monsterScriptNodeIndex, {
            monsterId: currentMonster.id,
            monsterScriptNodeIndex: currentMonster.monsterScriptNodeIndex,
            palette: currentMonster.palette,
            paletteSlot: monsterPaletteSlot,
            resolvedSpriteSet
        })
        vid.setPaletteSlotLE(monsterPaletteSlot, currentMonster.palette)
        gameDebugLog(game, 'world', `[monster-load] loaded monster=${currentMonster.name} pge=${pge.index} scriptNode=${currentMonster.monsterScriptNodeIndex} paletteSlot=${monsterPaletteSlot}`)
    } else {
        gameDebugLog(game, 'world', `[monster-load] cache-hit pge=${pge.index} scriptNode=${currentMonster.monsterScriptNodeIndex}`)
    }
    return uint16Max
}

export function gameHasLevelMap(game: Game, room: number) {
    if (room < 0 || room >= 0x40) {
        gameDebugLog(game, 'world', `[level-map] room=${room} hasMap=false reason=out-of-range`)
        return false
    }
    const ct = getGameServices(game).res.level.ctData
    if (
        ct[ctUpRoom + room] !== 0 ||
        ct[ctDownRoom + room] !== 0 ||
        ct[ctRightRoom + room] !== 0 ||
        ct[ctLeftRoom + room] !== 0
    ) {
        gameDebugLog(game, 'world', `[level-map] room=${room} hasMap=true reason=neighbor-link`)
        return true
    }
    const gridOffset = ctHeaderSize + room * ctGridStride
    for (let i = 0; i < ctGridStride; ++i) {
        if (ct[gridOffset + i] !== 0) {
            gameDebugLog(game, 'world', `[level-map] room=${room} hasMap=true reason=grid-data cell=${i}`)
            return true
        }
    }
    gameDebugLog(game, 'world', `[level-map] room=${room} hasMap=false`)
    return false
}

export async function gameLoadLevelMap(game: Game, currentRoom: number) {
    const world = getGameWorldState(game)
    world.currentIcon = uint8Max
    gameDebugLog(game, 'world', `[level-map] decode level=${world.currentLevel} room=${currentRoom}`)
    await getGameServices(game).vid.pcDecodemap(world.currentLevel, currentRoom)
}

export function gameClearLivePGETables(game: Game) {
    const runtime = getRuntimeRegistryState(game)
    runtime.livePgeStore.liveByRoom.forEach((roomList) => {
        roomList.length = 0
    })
    runtime.livePgeStore.activeFrameByIndex.fill(null)
    runtime.livePgeStore.activeFrameList.length = 0
    runtime.inventoryItemIndicesByOwner.clear()
}

export function gameCreatePgeLiveTable1(game: Game) {
    const runtime = getRuntimeRegistryState(game)
    const ui = getGameUiState(game)
    runtime.livePgeStore.liveByRoom.forEach((roomList) => {
        roomList.length = 0
    })
    for (let i = 0; i < game._res.level.pgeTotalNumInFile; ++i) {
        if (game._res.level.pgeAllInitialStateFromFile[i].skill <= ui.skillLevel) {
            gameDebugTrace(game, 'world', `i=${i} => skill!`)
            const pge = runtime.livePgesByIndex[i]
            runtime.livePgeStore.liveByRoom[pge.roomLocation].push(pge)
        }
    }
}

export async function gameLoadLevelData(game: Game): Promise<number> {
    const runtime = getRuntimeRegistryState(game)
    const world = getGameWorldState(game)
    const collision = getGameCollisionState(game)
    const { res, cut, mix } = getGameServices(game)
    res.clearLevelAllResources()
    const lvl = _gameLevels[world.currentLevel]
    gameDebugLog(game, 'world', `[level-load] begin level=${world.currentLevel} name=${lvl.name2} cutscene=${lvl.cutsceneId} track=${lvl.track}`)

    await res.load(lvl.name2, ObjectType.otMbk)
    await res.loadCollisionData(lvl.name2)
    await res.load(lvl.name2, ObjectType.otRp)
    await res.load(lvl.name2, ObjectType.otBnq)
    await res.load(lvl.name2, ObjectType.otPge)
    await res.load(lvl.name2, ObjectType.otObj)
    await res.load(lvl.name2, ObjectType.otAni)
    await res.load(lvl.name2, ObjectType.otTbn)
    if (!res.level.ani) {
        throw new Error(`Missing ANI data for ${lvl.name2}`)
    }

    cut.setId(lvl.cutsceneId)
    game._loadedMonsterVisualsByScriptNodeIndex.clear()
    res.clearBankData()
    world.printLevelCodeCounter = 150
    collision.nextFreeRoomCollisionGridPatchRestoreSlot = collision.roomCollisionGridPatchRestoreSlotPool[0]
    collision.activeRoomCollisionGridPatchRestoreSlots = null

    gameClearLivePGETables(game)
    runtime.livePgeStore.initByIndex = res.level.pgeAllInitialStateFromFile
    const currentRoom = getLevelStartRoom(game)
    world.currentRoom = currentRoom
    gameDebugLog(game, 'world', `[level-load] start-room level=${world.currentLevel} room=${currentRoom} directStart=${getGameSessionState(game).startedFromLevelSelect}`)

    let n = res.level.pgeTotalNumInFile
    while (n--) {
        game.loadPgeForCurrentLevel(n, currentRoom)
    }
    applyDirectLevelStartOverride(game)
    gameCreatePgeLiveTable1(game)

    game.resetPgeGroups()
    gameClearValidSaveState(game)
    mix.playMusic(Mixer.musicTrack + lvl.track)
    gameDebugLog(game, 'world', `[level-load] complete level=${world.currentLevel} room=${currentRoom} totalPges=${res.level.pgeTotalNumInFile}`)
    return currentRoom
}

export function gameClearStateRewind(game: Game) {
    for (let i = 0; i < game._rewindLen; ++i) {
        let ptr = game._rewindPtr - i
        if (ptr < 0) {
            ptr += 120
        }
        game._rewindBuffer[ptr].close()
    }
    game._rewindPtr = -1
    game._rewindLen = 0
}

export function gameLoadState(_game: Game, _f: any) {
    throw new Error('gameLoadState() is not implemented')
}

function getPgeObjectType(pge: LivePGE | null | undefined): number | null {
    if (!pge || !pge.initPge || typeof pge.initPge.objectType !== 'number') {
        return null
    }
    return pge.initPge.objectType
}

function getPgeAxisPosition(pge: LivePGE | null | undefined, axis: 'x' | 'y'): number | null {
    const value = axis === 'x' ? pge?.posX : pge?.posY
    return typeof value === 'number' ? value : null
}

export function gameIsAboveRoomPge(_game: Game, pge: LivePGE): boolean {
    const objectType = getPgeObjectType(pge)
    const posY = getPgeAxisPosition(pge, 'y')
    if (objectType === null || posY === null) {
        return false
    }
    return (objectType !== 10 && posY > 176) ||
        (objectType === 10 && posY > 216)
}

export function gameIsBelowRoomPge(_game: Game, pge: LivePGE): boolean {
    const posY = getPgeAxisPosition(pge, 'y')
    return posY !== null && posY < 48
}

export function gameIsLeftRoomPge(_game: Game, pge: LivePGE): boolean {
    const posX = getPgeAxisPosition(pge, 'x')
    return posX !== null && posX > gamescreenH
}

export function gameIsRightRoomPge(_game: Game, pge: LivePGE): boolean {
    const posX = getPgeAxisPosition(pge, 'x')
    return posX !== null && posX <= 32
}

function getPaletteColorMaskOverrideForPge(game: Game, pge: LivePGE) {
    if (pge.index !== 0) {
        const loadedMonsterVisual = getLoadedMonsterVisualForPge(game, pge)
        if (loadedMonsterVisual) {
            return loadedMonsterVisual.paletteSlot << 4
        }
    }
    // Doors/barriers, switches, and elevators should not share the room
    // front-layer banks.
    if (pge.initPge.objectType === 6 || pge.initPge.objectType === 7 || pge.initPge.objectType === 8) {
        return 0x60
    }
    return -1
}

export async function gamePrepareAnimsHelper(game: Game, pge: LivePGE, dx: number, dy: number, currentRoom: number) {
    const runtime = getRuntimeRegistryState(game)
    const render = getRenderDataState(game)
    if (!(pge.flags & pgeFlagSpecialAnim)) {
        if (pge.index !== 0 && await game.loadMonsterSprites(pge, currentRoom) === 0) {
            return
        }
        let dataPtr = null
        let dw = 0
        let dh = 0

        assert(!(pge.animNumber >= 1287), `Assertion failed: ${pge.animNumber} < 1287`)
        const loadedMonsterVisual = getLoadedMonsterVisualForPge(game, pge)
        const resolvedSpriteSet = loadedMonsterVisual ? loadedMonsterVisual.resolvedSpriteSet : game._res.sprites.resolvedSpriteSet
        const paletteColorMaskOverride = getPaletteColorMaskOverrideForPge(game, pge)
        dataPtr = resolvedSpriteSet.spritesByIndex[pge.animNumber]
        if (dataPtr === null) {
            return
        }
        dw = dataPtr[0] << 24 >> 24
        dh = dataPtr[1] << 24 >> 24
        let w = dataPtr[2]
        let h = dataPtr[3]
        dataPtr = dataPtr.subarray(4)

        let ypos = dy + pge.posY - dh + 2
        let xpos = dx + pge.posX - dw
        if (pge.flags & pgeFlagFlipX) {
            xpos = dx + pge.posX + dw
            let _cl = w
            if (_cl & 0x40) {
                _cl = h
            } else {
                _cl &= 0x3F
            }
            xpos -= _cl
        }
        if (xpos <= -32 || xpos >= gamescreenW || ypos < -48 || ypos >= gamescreenH) {
            return
        }
        xpos += 8
        if (pge === runtime.livePgesByIndex[0]) {
            render.animBuffers.addState(1, xpos, ypos, dataPtr, pge, w, h, paletteColorMaskOverride)
        } else if (pge.flags & 0x10) {
            render.animBuffers.addState(2, xpos, ypos, dataPtr, pge, w, h, paletteColorMaskOverride)
        } else {
            render.animBuffers.addState(0, xpos, ypos, dataPtr, pge, w, h, paletteColorMaskOverride)
        }
    } else {
        assert(!(pge.animNumber >= game._res.sprites.numSpc), `Assertion failed: ${pge.animNumber} < ${game._res.sprites.numSpc}`)
        const dataPtr = game._res.sprites.spc.subarray(readBeUint16(game._res.sprites.spc, pge.animNumber * 2))
        const xpos = dx + pge.posX + 8
        const ypos = dy + pge.posY + 2
        if (pge.initPge.objectType === 11) {
            render.animBuffers.addState(3, xpos, ypos, dataPtr, pge)
        } else if (pge.flags & 0x10) {
            render.animBuffers.addState(2, xpos, ypos, dataPtr, pge)
        } else {
            render.animBuffers.addState(0, xpos, ypos, dataPtr, pge)
        }
    }
}

export async function gamePrepareCurrentRoomAnims(game: Game, currentRoom: number) {
    const roomPges = getRoomPges(game, currentRoom)
    gameDebugLog(game, 'world', `[anim-prep] current-room room=${currentRoom} pges=${roomPges.length}`)
    for (const pge of roomPges) {
        await gamePrepareAnimsHelper(game, pge, 0, 0, currentRoom)
    }
}

export async function gamePrepareAdjacentRoomAnims(
    game: Game,
    roomOffset: number,
    offsetX: number,
    offsetY: number,
    shouldPrepare: (game: Game, pge: LivePGE) => boolean,
    currentRoom: number
) {
    const pgeRoom = game._res.level.ctData[roomOffset + currentRoom]
    if (pgeRoom >= 0 && pgeRoom < 0x40) {
        const roomPges = getRoomPges(game, pgeRoom)
        gameDebugLog(game, 'world', `[anim-prep] adjacent sourceRoom=${currentRoom} targetRoom=${pgeRoom} offset=(${offsetX},${offsetY}) candidates=${roomPges.length}`)
        for (const pge of roomPges) {
            if (pge && shouldPrepare(game, pge)) {
                await gamePrepareAnimsHelper(game, pge, offsetX, offsetY, currentRoom)
            }
        }
    }
}

export async function gamePrepareAnimationsInRooms(game: Game, currentRoom: number) {
    if (!(currentRoom & 0x80) && currentRoom < 0x40) {
        await gamePrepareCurrentRoomAnims(game, currentRoom)
        await gamePrepareAdjacentRoomAnims(game, ctUpRoom, 0, -216, gameIsAboveRoomPge, currentRoom)
        await gamePrepareAdjacentRoomAnims(game, ctDownRoom, 0, 216, gameIsBelowRoomPge, currentRoom)
        await gamePrepareAdjacentRoomAnims(game, ctLeftRoom, -gamescreenW, 0, gameIsLeftRoomPge, currentRoom)
        await gamePrepareAdjacentRoomAnims(game, ctRightRoom, gamescreenW, 0, gameIsRightRoomPge, currentRoom)
    }
}
