import type { InitPGE, LivePGE, PgeScriptNode } from './intern'
import { CreatePGE, READ_BE_UINT16, READ_BE_UINT32, READ_LE_UINT32 } from './intern'
import type { Game } from './game'
import { CT_DOWN_ROOM, CT_LEFT_ROOM, CT_RIGHT_ROOM, CT_UP_ROOM } from './game'
import { Mixer } from './mixer'
import { ObjectType } from './resource/resource'
import { CT_GRID_STRIDE, CT_HEADER_SIZE, GAMESCREEN_H, GAMESCREEN_W } from './game_constants'
import { PGE_FLAG_FLIP_X, PGE_FLAG_SPECIAL_ANIM, UINT16_MAX, UINT8_MAX } from './game_constants'
import { _gameLevels } from './staticres'
import { monsterListsByLevel } from './staticres-monsters'
import { assert } from "./assert"
import { gameInitializePgeDefaultAnimation } from './game_pge'

const MONSTER_PALETTE_SLOT = 5
const ROOM_OVERLAY_DURATION_FRAMES = 90
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
    if (game._startedFromLevelSelect) {
        const override = DIRECT_LEVEL_START_OVERRIDES[game._currentLevel]
        if (override) {
            return override.room
        }
    }
    return game._res._pgeAllInitialStateFromFile[0].init_room
}

function applyDirectLevelStartOverride(game: Game) {
    if (!game._startedFromLevelSelect) {
        return
    }
    const override = DIRECT_LEVEL_START_OVERRIDES[game._currentLevel]
    if (!override) {
        return
    }
    const conrad = game._livePgesByIndex[0]
    const conradScriptNode: PgeScriptNode = game._res._objectNodesMap[conrad.init_PGE.script_node_index]
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
            console.warn(`[direct-start] Missing Conrad script state ${override.stateType} for level ${game._currentLevel}`)
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
    let n = game._randSeed * 2
    if ((game._randSeed << 32 >> 32) >= 0) {
        n ^= 0x1D872B41
    }
    game._randSeed = n
    return n & UINT16_MAX
}

export async function gameChangeLevel(game: Game) {
    await game._vid.fadeOut()
    game.clearStateRewind()
    await game.loadLevelData()
    await game.loadLevelMap(game._currentRoom)
    game._currentRoomOverlayCounter = ROOM_OVERLAY_DURATION_FRAMES
    game._vid.setPalette0xF()
    game._vid.setTextPalette()
    game._vid.fullRefresh()
}

export async function gameInpUpdate(game: Game) {
    await game._stub.processEvents()
}

export function gameResetGameState(game: Game) {
    game._animBuffers._states[0] = game._animBuffer0State
    game._animBuffers._curPos[0] = UINT8_MAX
    game._animBuffers._states[1] = game._animBuffer1State
    game._animBuffers._curPos[1] = UINT8_MAX
    game._animBuffers._states[2] = game._animBuffer2State
    game._animBuffers._curPos[2] = UINT8_MAX
    game._animBuffers._states[3] = game._animBuffer3State
    game._animBuffers._curPos[3] = UINT8_MAX
    game._currentRoom = getLevelStartRoom(game)
    game._cut.setDeathCutSceneId(UINT16_MAX)
    game._opcodeTempVar2 = UINT16_MAX
    game._deathCutsceneCounter = 0
    game._credits = 0
    game._saveStateCompleted = false
    game._loadMap = true
    game.resetPgeGroups()
    game._inventoryItemIndicesByOwner.clear()
    game._blinkingConradCounter = 0
    game._currentRoomOverlayCounter = 0
    game._shouldProcessCurrentPgeObjectNode = false
    game._opcodeTempVar1 = 0
    game._textToDisplay = UINT16_MAX
}

export async function gameLoadMonsterSprites(game: Game, pge: LivePGE, currentRoom: number) {
    const initPge: InitPGE = pge.init_PGE
    if (!isMonsterPge(initPge)) {
        return UINT16_MAX
    }
    if (pge.room_location !== currentRoom) {
        return 0
    }

    const currentLevelMonsters = monsterListsByLevel[game._currentLevel]
    const currentMonster = currentLevelMonsters.find((monster) => monster.monsterScriptNodeIndex === initPge.script_node_index)
    if (!currentMonster) {
        throw new Error(`Missing monster descriptor for script node ${initPge.script_node_index} on level ${game._currentLevel}`)
    }
    if (!game._loadedMonsterVisualsByScriptNodeIndex.has(currentMonster.monsterScriptNodeIndex)) {
        const resolvedSpriteSet = await game._res.loadMonsterResolvedSpriteSet(currentMonster.name)
        game._loadedMonsterVisualsByScriptNodeIndex.set(currentMonster.monsterScriptNodeIndex, {
            monsterId: currentMonster.id,
            monsterScriptNodeIndex: currentMonster.monsterScriptNodeIndex,
            palette: currentMonster.palette,
            paletteSlot: MONSTER_PALETTE_SLOT,
            resolvedSpriteSet
        })
        game._vid.setPaletteSlotLE(MONSTER_PALETTE_SLOT, currentMonster.palette)
    }
    return UINT16_MAX
}

export function gameHasLevelMap(game: Game, room: number) {
    if (room < 0 || room >= 0x40) {
        return false
    }
    const ct = game._res._ctData
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
    game._currentIcon = UINT8_MAX
    await game._vid.PC_decodeMap(game._currentLevel, currentRoom)
}

export function gameClearLivePGETables(game: Game) {
    game._livePgeStore.liveByRoom.forEach((roomList) => {
        roomList.length = 0
    })
    game._livePgeStore.activeFrameByIndex.fill(null)
    game._livePgeStore.activeFrameList.length = 0
    game._inventoryItemIndicesByOwner.clear()
}

export function gameCreatePgeLiveTable1(game: Game) {
    game._livePgeStore.liveByRoom.forEach((roomList) => {
        roomList.length = 0
    })
    for (let i = 0; i < game._res._pgeTotalNumInFile; ++i) {
        if (game._res._pgeAllInitialStateFromFile[i].skill <= game._skillLevel) {
            game.renders > game.debugStartFrame && console.log(`i=${i} => skill!`)
            const pge = game._livePgesByIndex[i]
            game._livePgeStore.liveByRoom[pge.room_location].push(pge)
        }
    }
}

export async function gameLoadLevelData(game: Game): Promise<number> {
    game._res.clearLevelAllResources()
    const lvl = _gameLevels[game._currentLevel]

    await game._res.load(lvl.name2, ObjectType.OT_MBK)
    await game._res.loadCollisionData(lvl.name2)
    await game._res.load(lvl.name2, ObjectType.OT_RP)
    await game._res.load(lvl.name2, ObjectType.OT_BNQ)
    await game._res.load(lvl.name2, ObjectType.OT_PGE)
    await game._res.load(lvl.name2, ObjectType.OT_OBJ)
    await game._res.load(lvl.name2, ObjectType.OT_ANI)
    await game._res.load(lvl.name2, ObjectType.OT_TBN)
    if (!game._res._ani) {
        throw new Error(`Missing ANI data for ${lvl.name2}`)
    }

    game._cut.setId(lvl.cutscene_id)
    game._loadedMonsterVisualsByScriptNodeIndex.clear()
    game._res.clearBankData()
    game._printLevelCodeCounter = 150
    game._nextFreeRoomCollisionGridPatchRestoreSlot = game._roomCollisionGridPatchRestoreSlotPool[0]
    game._activeRoomCollisionGridPatchRestoreSlots = null

    gameClearLivePGETables(game)
    game._livePgeStore.initByIndex = game._res._pgeAllInitialStateFromFile
    const currentRoom = getLevelStartRoom(game)
    game._currentRoom = currentRoom

    let n = game._res._pgeTotalNumInFile
    while (n--) {
        game.loadPgeForCurrentLevel(n, currentRoom)
    }
    applyDirectLevelStartOverride(game)
    gameCreatePgeLiveTable1(game)

    game.resetPgeGroups()
    game._validSaveState = false
    game._mix.playMusic(Mixer.MUSIC_TRACK + lvl.track)
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
    if (!(pge.flags & PGE_FLAG_SPECIAL_ANIM)) {
        if (pge.index !== 0 && await game.loadMonsterSprites(pge, currentRoom) === 0) {
            return
        }
        let dataPtr = null
        let dw = 0
        let dh = 0

        assert(!(pge.anim_number >= 1287), `Assertion failed: ${pge.anim_number} < 1287`)
        const loadedMonsterVisual = getLoadedMonsterVisualForPge(game, pge)
        const resolvedSpriteSet = loadedMonsterVisual ? loadedMonsterVisual.resolvedSpriteSet : game._res._resolvedSpriteSet
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
        if (pge === game._livePgesByIndex[0]) {
            game._animBuffers.addState(1, xpos, ypos, dataPtr, pge, w, h, paletteColorMaskOverride)
        } else if (pge.flags & 0x10) {
            game._animBuffers.addState(2, xpos, ypos, dataPtr, pge, w, h, paletteColorMaskOverride)
        } else {
            game._animBuffers.addState(0, xpos, ypos, dataPtr, pge, w, h, paletteColorMaskOverride)
        }
    } else {
        assert(!(pge.anim_number >= game._res._numSpc), `Assertion failed: ${pge.anim_number} < ${game._res._numSpc}`)
        const dataPtr = game._res._spc.subarray(READ_BE_UINT16(game._res._spc, pge.anim_number * 2))
        const xpos = dx + pge.pos_x + 8
        const ypos = dy + pge.pos_y + 2
        if (pge.init_PGE.object_type === 11) {
            game._animBuffers.addState(3, xpos, ypos, dataPtr, pge)
        } else if (pge.flags & 0x10) {
            game._animBuffers.addState(2, xpos, ypos, dataPtr, pge)
        } else {
            game._animBuffers.addState(0, xpos, ypos, dataPtr, pge)
        }
    }
}

export async function gamePrepareCurrentRoomAnims(game: Game, currentRoom: number) {
    for (const pge of game._livePgeStore.liveByRoom[currentRoom]) {
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
    const pge_room = game._res._ctData[roomOffset + currentRoom]
    if (pge_room >= 0 && pge_room < 0x40) {
        for (const pge of game._livePgeStore.liveByRoom[pge_room]) {
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
