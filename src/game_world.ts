import type { InitPGE, LivePGE } from './intern'
import { CreatePGE, READ_BE_UINT16, READ_BE_UINT32, READ_LE_UINT32 } from './intern'
import type { Game } from './game'
import { CT_DOWN_ROOM, CT_LEFT_ROOM, CT_RIGHT_ROOM, CT_UP_ROOM } from './game'
import { Mixer } from './mixer'
import { ObjectType } from './resource'
import { GAMESCREEN_H, GAMESCREEN_W } from './game_constants'
import { PGE_FLAG_FLIP_X, PGE_FLAG_SPECIAL_ANIM, UINT16_MAX, UINT8_MAX } from './game_constants'
import { _gameLevels } from './staticres'
import { monsterListsByLevel } from './staticres-monsters'
import { assert } from "./assert"

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
    game._currentRoom = game._res._pgeAllInitialStateFromFile[0].init_room
    game._cut.setDeathCutSceneId(UINT16_MAX)
    game._pge_opTempVar2 = UINT16_MAX
    game._deathCutsceneCounter = 0
    game._saveStateCompleted = false
    game._loadMap = true
    game.pge_resetGroups()
    game._blinkingConradCounter = 0
    game._pge_processOBJ = false
    game._pge_opTempVar1 = 0
    game._textToDisplay = UINT16_MAX
}

export async function gameLoadMonsterSprites(game: Game, pge: LivePGE, currentRoom: number) {
    const initPge: InitPGE = pge.init_PGE
    if (initPge.obj_node_number !== 0x49 && initPge.object_type !== 10) {
        return UINT16_MAX
    }
    if (initPge.obj_node_number === game._curMonsterFrame) {
        return UINT16_MAX
    }
    if (pge.room_location !== currentRoom) {
        return 0
    }

    const currentLevelMonsters = monsterListsByLevel[game._currentLevel]
    const currentMonster = currentLevelMonsters.find((monster) => monster.frame === initPge.obj_node_number)
    game._curMonsterFrame = currentMonster.frame
    if (game._curMonsterNum !== currentMonster.id) {
        game._curMonsterNum = currentMonster.id
        await game._res.load(currentMonster.name, ObjectType.OT_SPRM)
        await game._res.load_SPRITE_OFFSETS(currentMonster.name, game._res._sprm)
        game._vid.setPaletteSlotLE(5, currentMonster.palette)
    }
    return UINT16_MAX
}

export function gameHasLevelMap(game: Game, room: number) {
    if (game._res._lev) {
        return READ_BE_UINT32(game._res._lev, room * 4) !== 0
    }
    return false
}

export async function gameLoadLevelMap(game: Game, currentRoom: number) {
    game._currentIcon = UINT8_MAX
    game._vid.PC_decodeMap(game._currentLevel, currentRoom)
}

export function gameClearLivePGETables(game: Game) {
    game._pge_liveLinkedListTableByRoomAllRooms.fill(null).map(() => CreatePGE())
    game._pge_liveFlatTableFilteredByRoomCurrentRoomOnly.fill(null).map(() => CreatePGE())
}

export function gameCreatePgeLiveTable1(game: Game) {
    for (let i = 0; i < game._res._pgeTotalNumInFile; ++i) {
        if (game._res._pgeAllInitialStateFromFile[i].skill <= game._skillLevel) {
            game.renders > game.debugStartFrame && console.log(`i=${i} => skill!`)
            const pge = game._pgeLiveAll[i]
            pge.next_PGE_in_room = game._pge_liveLinkedListTableByRoomAllRooms[pge.room_location]
            game._pge_liveLinkedListTableByRoomAllRooms[pge.room_location] = pge
        }
    }
}

export async function gameLoadLevelData(game: Game): Promise<number> {
    game._res.clearLevelAllResources()
    const lvl = _gameLevels[game._currentLevel]

    await game._res.load(lvl.name, ObjectType.OT_MBK)
    await game._res.load(lvl.name, ObjectType.OT_CT)
    await game._res.load(lvl.name, ObjectType.OT_PAL)
    await game._res.load(lvl.name, ObjectType.OT_RP)
    if (game._currentLevel === 0) {
        await game._res.load(lvl.name, ObjectType.OT_SGD)
    }
    await game._res.load(lvl.name, ObjectType.OT_LEV)
    await game._res.load(lvl.name, ObjectType.OT_BNQ)
    await game._res.load(lvl.name2, ObjectType.OT_PGE)
    await game._res.load(lvl.name2, ObjectType.OT_OBJ)
    await game._res.load(lvl.name2, ObjectType.OT_ANI)
    await game._res.load(lvl.name2, ObjectType.OT_TBN)

    game._cut.setId(lvl.cutscene_id)
    game._curMonsterNum = UINT8_MAX
    game._curMonsterFrame = 0
    game._res.clearBankData()
    game._printLevelCodeCounter = 150
    game._col_slots2Cur = game._col_slots2[0]
    game._col_slots2Next = null

    gameClearLivePGETables(game)
    const currentRoom = game._res._pgeAllInitialStateFromFile[0].init_room
    game._currentRoom = currentRoom

    let n = game._res._pgeTotalNumInFile
    while (n--) {
        game.pge_loadForCurrentLevel(n, currentRoom)
    }
    gameCreatePgeLiveTable1(game)

    game.pge_resetGroups()
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

export async function gamePrepareAnimsHelper(game: Game, pge: LivePGE, dx: number, dy: number, currentRoom: number) {
    if (!(pge.flags & PGE_FLAG_SPECIAL_ANIM)) {
        if (pge.index !== 0 && await game.loadMonsterSprites(pge, currentRoom) === 0) {
            return
        }
        let dataPtr = null
        let dw = 0
        let dh = 0

        assert(!(pge.anim_number >= 1287), `Assertion failed: ${pge.anim_number} < 1287`)
        dataPtr = game._res._sprData[pge.anim_number]
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
        if (pge === game._pgeLiveAll[0]) {
            game._animBuffers.addState(1, xpos, ypos, dataPtr, pge, w, h)
        } else if (pge.flags & 0x10) {
            game._animBuffers.addState(2, xpos, ypos, dataPtr, pge, w, h)
        } else {
            game._animBuffers.addState(0, xpos, ypos, dataPtr, pge, w, h)
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
    let pge = game._pge_liveLinkedListTableByRoomAllRooms[currentRoom]
    while (pge) {
        await gamePrepareAnimsHelper(game, pge, 0, 0, currentRoom)
        pge = pge.next_PGE_in_room
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
        let pge = game._pge_liveLinkedListTableByRoomAllRooms[pge_room]
        while (pge) {
            if (shouldPrepare(game, pge)) {
                await gamePrepareAnimsHelper(game, pge, offsetX, offsetY, currentRoom)
            }
            pge = pge.next_PGE_in_room
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
