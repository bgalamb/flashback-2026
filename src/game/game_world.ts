import type { InitPGE, LivePGE, PgeScriptNode } from '../core/intern'
import { CreatePGE, READ_BE_UINT16, READ_BE_UINT32, READ_LE_UINT32 } from '../core/intern'
import type { Game } from './game'
import { CT_DOWN_ROOM, CT_LEFT_ROOM, CT_RIGHT_ROOM, CT_UP_ROOM } from '../core/game_constants'
import { Mixer } from '../audio/mixer'
import { ObjectType } from '../resource/resource'
import { CT_GRID_STRIDE, CT_HEADER_SIZE, GAMESCREEN_H, GAMESCREEN_W } from '../core/game_constants'
import { PGE_FLAG_FLIP_X, PGE_FLAG_SPECIAL_ANIM, UINT16_MAX, UINT8_MAX } from '../core/game_constants'
import { _gameLevels } from '../core/staticres'
import { monsterListsByLevel } from '../core/staticres-monsters'
import { assert } from "../core/assert"
import { gameInitializePgeDefaultAnimation, gameLoadPgeForCurrentLevel, gameResetPgeGroupState } from './game_pge'
import { gameClearValidSaveState, gameCommitLoadedRoom, ROOM_OVERLAY_DURATION_FRAMES, gameResetLevelLifecycle } from './game_lifecycle'
import { getGameServices } from './game_services'
import { getGameCollisionState, getGameSessionState, getGameUiState, getGameWorldState } from './game_state'
import { getRenderDataState, getRuntimeRegistryState } from './game_runtime_data'

const MONSTER_PALETTE_SLOT = 5

interface DirectLevelStartOverride {
    room: number
    posX?: number
    posY?: number
    stateType?: number
}

const DIRECT_LEVEL_START_OVERRIDES: Record<number, DirectLevelStartOverride> = {
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
        const override = DIRECT_LEVEL_START_OVERRIDES[world.currentLevel]
        if (override) {
            return override.room
        }
    }
    return getGameServices(game).res.level.pgeAllInitialStateFromFile[0].init_room
}

function applyDirectLevelStartOverride(game: Game) {
    const session = getGameSessionState(game)
    const world = getGameWorldState(game)
    if (!session.startedFromLevelSelect) {
        return
    }
    const override = DIRECT_LEVEL_START_OVERRIDES[world.currentLevel]
    if (!override) {
        return
    }
    const conrad = getRuntimeRegistryState(game).livePgesByIndex[0]
    const conradScriptNode: PgeScriptNode = getGameServices(game).res.level.objectNodesMap[conrad.init_PGE.script_node_index]
    conrad.room_location = override.room
    if (typeof override.posX === 'number') {
        conrad.pos_x = override.posX
    }
    if (typeof override.posY === 'number') {
        conrad.pos_y = override.posY
    }
    if (typeof override.stateType === 'number') {
        conrad.script_state_type = override.stateType
        const nextIndex = conradScriptNode.objects.findIndex((entry) => entry.type === override.stateType)
        if (nextIndex >= 0) {
            conrad.first_script_entry_index = nextIndex
        } else {
            console.warn(`[direct-start] Missing Conrad script state ${override.stateType} for level ${world.currentLevel}`)
        }
        conrad.anim_seq = 0
        gameInitializePgeDefaultAnimation(game, conrad)
    }
}

function isMonsterPge(initPge: InitPGE): boolean {
    return initPge.script_node_index === 0x49 || initPge.object_type === 10
}

function getLoadedMonsterVisualForPge(game: Game, pge: LivePGE) {
    if (!isMonsterPge(pge.init_PGE)) {
        return null
    }
    return game._loadedMonsterVisualsByScriptNodeIndex.get(pge.init_PGE.script_node_index) || null
}

export function gameGetRandomNumber(game: Game) {
    const session = getGameSessionState(game)
    let n = session.randSeed * 2
    if ((session.randSeed << 32 >> 32) >= 0) {
        n ^= 0x1D872B41
    }
    session.randSeed = n
    return n & UINT16_MAX
}

export async function gameChangeLevel(game: Game) {
    const world = getGameWorldState(game)
    const { vid } = getGameServices(game)
    await vid.fadeOut()
    game.clearStateRewind()
    await game.loadLevelData()
    await game.loadLevelMap(world.currentRoom)
    gameCommitLoadedRoom(game, world.currentRoom)
    vid.setPalette0xF()
    vid.setTextPalette()
    vid.fullRefresh()
}

export async function gameInpUpdate(game: Game) {
    await getGameServices(game).stub.processEvents()
}

export function gameResetGameState(game: Game) {
    const render = getRenderDataState(game)
    const runtime = getRuntimeRegistryState(game)
    render.animBuffers._states[0] = render.animBuffer0State
    render.animBuffers._curPos[0] = UINT8_MAX
    render.animBuffers._states[1] = render.animBuffer1State
    render.animBuffers._curPos[1] = UINT8_MAX
    render.animBuffers._states[2] = render.animBuffer2State
    render.animBuffers._curPos[2] = UINT8_MAX
    render.animBuffers._states[3] = render.animBuffer3State
    render.animBuffers._curPos[3] = UINT8_MAX
    gameResetLevelLifecycle(game, getLevelStartRoom(game))
    game.resetPgeGroups()
    runtime.inventoryItemIndicesByOwner.clear()
}

export async function gameLoadMonsterSprites(game: Game, pge: LivePGE, currentRoom: number) {
    const world = getGameWorldState(game)
    const initPge: InitPGE = pge.init_PGE
    if (!isMonsterPge(initPge)) {
        return UINT16_MAX
    }
    if (pge.room_location !== currentRoom) {
        return 0
    }

    const currentLevelMonsters = monsterListsByLevel[world.currentLevel]
    const currentMonster = currentLevelMonsters.find((monster) => monster.monsterScriptNodeIndex === initPge.script_node_index)
    if (!currentMonster) {
        throw new Error(`Missing monster descriptor for script node ${initPge.script_node_index} on level ${world.currentLevel}`)
    }
    if (!game._loadedMonsterVisualsByScriptNodeIndex.has(currentMonster.monsterScriptNodeIndex)) {
        const { res, vid } = getGameServices(game)
        const resolvedSpriteSet = await res.loadMonsterResolvedSpriteSet(currentMonster.name)
        game._loadedMonsterVisualsByScriptNodeIndex.set(currentMonster.monsterScriptNodeIndex, {
            monsterId: currentMonster.id,
            monsterScriptNodeIndex: currentMonster.monsterScriptNodeIndex,
            palette: currentMonster.palette,
            paletteSlot: MONSTER_PALETTE_SLOT,
            resolvedSpriteSet
        })
        vid.setPaletteSlotLE(MONSTER_PALETTE_SLOT, currentMonster.palette)
    }
    return UINT16_MAX
}

export function gameHasLevelMap(game: Game, room: number) {
    if (room < 0 || room >= 0x40) {
        return false
    }
    const ct = getGameServices(game).res.level.ctData
    if (
        ct[CT_UP_ROOM + room] !== 0 ||
        ct[CT_DOWN_ROOM + room] !== 0 ||
        ct[CT_RIGHT_ROOM + room] !== 0 ||
        ct[CT_LEFT_ROOM + room] !== 0
    ) {
        return true
    }
    const gridOffset = CT_HEADER_SIZE + room * CT_GRID_STRIDE
    for (let i = 0; i < CT_GRID_STRIDE; ++i) {
        if (ct[gridOffset + i] !== 0) {
            return true
        }
    }
    return false
}

export async function gameLoadLevelMap(game: Game, currentRoom: number) {
    const world = getGameWorldState(game)
    world.currentIcon = UINT8_MAX
    await getGameServices(game).vid.PC_decodeMap(world.currentLevel, currentRoom)
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
            game.renders > game.debugStartFrame && console.log(`i=${i} => skill!`)
            const pge = runtime.livePgesByIndex[i]
            runtime.livePgeStore.liveByRoom[pge.room_location].push(pge)
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

    await res.load(lvl.name2, ObjectType.OT_MBK)
    await res.loadCollisionData(lvl.name2)
    await res.load(lvl.name2, ObjectType.OT_RP)
    await res.load(lvl.name2, ObjectType.OT_BNQ)
    await res.load(lvl.name2, ObjectType.OT_PGE)
    await res.load(lvl.name2, ObjectType.OT_OBJ)
    await res.load(lvl.name2, ObjectType.OT_ANI)
    await res.load(lvl.name2, ObjectType.OT_TBN)
    if (!res.level.ani) {
        throw new Error(`Missing ANI data for ${lvl.name2}`)
    }

    cut.setId(lvl.cutscene_id)
    game._loadedMonsterVisualsByScriptNodeIndex.clear()
    res.clearBankData()
    world.printLevelCodeCounter = 150
    collision.nextFreeRoomCollisionGridPatchRestoreSlot = collision.roomCollisionGridPatchRestoreSlotPool[0]
    collision.activeRoomCollisionGridPatchRestoreSlots = null

    gameClearLivePGETables(game)
    runtime.livePgeStore.initByIndex = res.level.pgeAllInitialStateFromFile
    const currentRoom = getLevelStartRoom(game)
    world.currentRoom = currentRoom

    let n = res.level.pgeTotalNumInFile
    while (n--) {
        game.loadPgeForCurrentLevel(n, currentRoom)
    }
    applyDirectLevelStartOverride(game)
    gameCreatePgeLiveTable1(game)

    game.resetPgeGroups()
    gameClearValidSaveState(game)
    mix.playMusic(Mixer.MUSIC_TRACK + lvl.track)
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
    debugger
}

export function gameIsAboveRoomPge(_game: Game, pge: LivePGE): boolean {
    return (pge.init_PGE.object_type !== 10 && pge.pos_y > 176) ||
        (pge.init_PGE.object_type === 10 && pge.pos_y > 216)
}

export function gameIsBelowRoomPge(_game: Game, pge: LivePGE): boolean {
    return pge.pos_y < 48
}

export function gameIsLeftRoomPge(_game: Game, pge: LivePGE): boolean {
    return pge.pos_x > GAMESCREEN_H
}

export function gameIsRightRoomPge(_game: Game, pge: LivePGE): boolean {
    return pge.pos_x <= 32
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
    if (pge.init_PGE.object_type === 6 || pge.init_PGE.object_type === 7 || pge.init_PGE.object_type === 8) {
        return 0x60
    }
    return -1
}

export async function gamePrepareAnimsHelper(game: Game, pge: LivePGE, dx: number, dy: number, currentRoom: number) {
    const runtime = getRuntimeRegistryState(game)
    const render = getRenderDataState(game)
    if (!(pge.flags & PGE_FLAG_SPECIAL_ANIM)) {
        if (pge.index !== 0 && await game.loadMonsterSprites(pge, currentRoom) === 0) {
            return
        }
        let dataPtr = null
        let dw = 0
        let dh = 0

        assert(!(pge.anim_number >= 1287), `Assertion failed: ${pge.anim_number} < 1287`)
        const loadedMonsterVisual = getLoadedMonsterVisualForPge(game, pge)
        const resolvedSpriteSet = loadedMonsterVisual ? loadedMonsterVisual.resolvedSpriteSet : game._res.sprites.resolvedSpriteSet
        const paletteColorMaskOverride = getPaletteColorMaskOverrideForPge(game, pge)
        dataPtr = resolvedSpriteSet.spritesByIndex[pge.anim_number]
        if (dataPtr === null) {
            return
        }
        dw = dataPtr[0] << 24 >> 24
        dh = dataPtr[1] << 24 >> 24
        let w = dataPtr[2]
        let h = dataPtr[3]
        dataPtr = dataPtr.subarray(4)

        let ypos = dy + pge.pos_y - dh + 2
        let xpos = dx + pge.pos_x - dw
        if (pge.flags & PGE_FLAG_FLIP_X) {
            xpos = dx + pge.pos_x + dw
            let _cl = w
            if (_cl & 0x40) {
                _cl = h
            } else {
                _cl &= 0x3F
            }
            xpos -= _cl
        }
        if (xpos <= -32 || xpos >= GAMESCREEN_W || ypos < -48 || ypos >= GAMESCREEN_H) {
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
        assert(!(pge.anim_number >= game._res.sprites.numSpc), `Assertion failed: ${pge.anim_number} < ${game._res.sprites.numSpc}`)
        const dataPtr = game._res.sprites.spc.subarray(READ_BE_UINT16(game._res.sprites.spc, pge.anim_number * 2))
        const xpos = dx + pge.pos_x + 8
        const ypos = dy + pge.pos_y + 2
        if (pge.init_PGE.object_type === 11) {
            render.animBuffers.addState(3, xpos, ypos, dataPtr, pge)
        } else if (pge.flags & 0x10) {
            render.animBuffers.addState(2, xpos, ypos, dataPtr, pge)
        } else {
            render.animBuffers.addState(0, xpos, ypos, dataPtr, pge)
        }
    }
}

export async function gamePrepareCurrentRoomAnims(game: Game, currentRoom: number) {
    for (const pge of getRuntimeRegistryState(game).livePgeStore.liveByRoom[currentRoom]) {
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
    const pge_room = game._res.level.ctData[roomOffset + currentRoom]
    if (pge_room >= 0 && pge_room < 0x40) {
        for (const pge of getRuntimeRegistryState(game).livePgeStore.liveByRoom[pge_room]) {
            if (shouldPrepare(game, pge)) {
                await gamePrepareAnimsHelper(game, pge, offsetX, offsetY, currentRoom)
            }
        }
    }
}

export async function gamePrepareAnimationsInRooms(game: Game, currentRoom: number) {
    if (!(currentRoom & 0x80) && currentRoom < 0x40) {
        await gamePrepareCurrentRoomAnims(game, currentRoom)
        await gamePrepareAdjacentRoomAnims(game, CT_UP_ROOM, 0, -216, gameIsAboveRoomPge, currentRoom)
        await gamePrepareAdjacentRoomAnims(game, CT_DOWN_ROOM, 0, 216, gameIsBelowRoomPge, currentRoom)
        await gamePrepareAdjacentRoomAnims(game, CT_LEFT_ROOM, -GAMESCREEN_W, 0, gameIsLeftRoomPge, currentRoom)
        await gamePrepareAdjacentRoomAnims(game, CT_RIGHT_ROOM, GAMESCREEN_W, 0, gameIsRightRoomPge, currentRoom)
    }
}
