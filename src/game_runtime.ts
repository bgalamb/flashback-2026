import type { Color, LivePGE } from './intern'
import type { Game } from './game'
import { Cutscene } from './cutscene-players/cutscene'
import { Menu } from './menu'
import { ObjectType, LocaleData } from './resource/resource'
import { DF_FASTMODE, DF_SETLIFE, DIR_DOWN, DIR_UP } from './systemstub_web'
import { CHAR_W, GAMESCREEN_W } from './game_constants'
import { kAutoSaveIntervalMs, kAutoSaveSlot, kIngameSaveSlot, kRewindSize } from './game'
import { UINT8_MAX } from './game_constants'
import { gameDrawAnims, gameDrawCurrentInventoryItem, gameDrawLevelTexts, gameDrawStoryTexts } from './game_draw'
import { gameRebuildActiveRoomCollisionSlotLookup } from './game_collision'
import { gameHandleConfigPanel, gameHandleInventory } from './game_inventory'
import { gameRebuildActiveFramePgeList, gameRebuildPgeCollisionStateForCurrentRoom, gameRunPgeFrameLogic, gameUpdatePgeDirectionalInputState } from './game_pge'
import { gameChangeLevel, gameHasLevelMap, gameLoadLevelMap, gamePrepareAnimationsInRooms } from './game_world'

export async function gamePlayCutscene(game: Game, id: number = -1) {
    if (id !== -1) {
        game._cut.setId(id)
    }
    if (game._cut.getId() === -1) {
        return
    }
    game._mix.stopMusic()
    if (game._cut.getId() !== 0x4A) {
        game._mix.playMusic(Cutscene._musicTable[game._cut.getId()])
    }
    await game._cut.play()
    if (id === 0xD && !game._cut.isInterrupted()) {
        game._cut.setId(0x4A)
        await game._cut.play()
    }
    game._mix.stopMusic()
}

export async function gameRunLoop(game: Game) {
    await gameMainLoop(game)
    if (!game._stub._pi.quit && !game._endLoop) {
        requestAnimationFrame(() => gameRunLoop(game))
    } else {
        // @ts-ignore
        game.renderDone()
    }
}

export async function gameRun(game: Game) {
    game._randSeed = new Date().getTime()
    game._res.load_TEXT()
    await game._res.load('FB_TXT', ObjectType.OT_FNT)
    game._mix.init()

    await gamePlayCutscene(game, 0x40)
    await gamePlayCutscene(game, 0x0D)

    await game._res.load('GLOBAL', ObjectType.OT_ICN)
    await game._res.load('GLOBAL', ObjectType.OT_SPC)
    await game._res.load('PERSO', ObjectType.OT_SPR)
    await game._res.load_SPRITE_OFFSETS('PERSO', game._res._spr1)
    game._res.initializeConradVisuals()
    await game._res.load_FIB('GLOBAL')

    const presentMenu = true
    while (!game._stub._pi.quit) {
        if (presentMenu) {
            game._mix.playMusic(1)
            await game._menu.handleTitleScreen()
            if (game._menu._selectedOption === Menu.MENU_OPTION_ITEM_QUIT || game._stub._pi.quit) {
                game._stub._pi.quit = true
                break
            }
            game._skillLevel = game._menu._skill
            game._currentLevel = game._menu._level
            game._skipNextLevelCutscene = true
            game._startedFromLevelSelect = true
            game._mix.stopMusic()
        }
        if (game._stub._pi.quit) {
            break
        }
        game._vid.setTextPalette()
        game._vid.setPalette0xF()
        game._stub.setOverscanColor(0xE0)
        game._vid._unkPalSlot1 = 0
        game._vid._unkPalSlot2 = 0
        game._score = 0
        game.clearStateRewind()
        await game.loadLevelData()

        game.resetGameState()
        game._endLoop = false
        game._frameTimestamp = game._stub.getTimeStamp()
        game._saveTimestamp = game._frameTimestamp
        game.renders = 0
        game.debugStartFrame = 10650
        game.renderPromise = new Promise<void>((resolve) => {
            game.renderDone = () => resolve()
        })
        new Promise(() => requestAnimationFrame(() => gameRunLoop(game)))
        await game.renderPromise

        game._stub._pi.dirMask = 0
        game._stub._pi.enter = false
        game._stub._pi.space = false
        game._stub._pi.shift = false
    }
}

export async function gameShowFinalScore(game: Game) {
    await gamePlayCutscene(game, 0x49)

    const buf = game._score.toString().padStart(8, '0')
    game._vid.drawString(buf, (GAMESCREEN_W - buf.length * CHAR_W) / 2, 40, 0xE5)
    while (!game._stub._pi.quit) {
        game._stub.copyRect(0, 0, game._vid._w, game._vid._h, game._vid._frontLayer, game._vid._w)
        await game._stub.updateScreen(0)
        await game._stub.processEvents()
        if (game._stub._pi.enter) {
            game._stub._pi.enter = false
            break
        }
        await game._stub.sleep(100)
    }
}

export async function gameUpdateTiming(game: Game) {
    const frameHz = 30
    const delay = game._stub.getTimeStamp() - game._frameTimestamp
    let pause = (game._stub._pi.dbgMask & DF_FASTMODE) ? 20 : (1000 / frameHz)
    pause -= delay
    if (pause > 0) {
        await game._stub.sleep(pause)
    }
    game._frameTimestamp = game._stub.getTimeStamp()
}

export function gameSaveGameState(_game: Game, _slot: number) {
    return
}

export function gameLoadGameState(_game: Game, _slot: number) {
    return true
}

export async function gameHandleContinueAbort(game: Game) {
    let timeout = 100
    let current_color = 0
    const colors = [0xE4, 0xE5]
    let color_inc = UINT8_MAX
    const col: Color = { r: 0, g: 0, b: 0 }
    game._stub.getPaletteEntry(0xE4, col)
    game._vid._tempLayer.set(game._vid._frontLayer.subarray(0, game._vid._layerSize))
    while (timeout >= 0 && !game._stub._pi.quit) {
        let str = game._res.getMenuString(LocaleData.Id.LI_01_CONTINUE_OR_ABORT)
        game._vid.drawString(str, ((GAMESCREEN_W - str.length * CHAR_W) / 2) >> 0, 64, 0xE3)
        str = game._res.getMenuString(LocaleData.Id.LI_02_TIME)
        let buf = str + ' : ' + ((timeout / 10) >> 0)
        game._vid.drawString(buf, 96, 88, 0xE3)
        str = game._res.getMenuString(LocaleData.Id.LI_03_CONTINUE)
        game._vid.drawString(str, ((GAMESCREEN_W - str.length * CHAR_W) / 2) >> 0, 104, colors[0])
        str = game._res.getMenuString(LocaleData.Id.LI_04_ABORT)
        game._vid.drawString(str, ((GAMESCREEN_W - str.length * CHAR_W) / 2) >> 0, 112, colors[1])
        buf = 'SCORE  ' + game._score.toString().padStart(8, '0')
        game._vid.drawString(buf, 64, 154, 0xE3)
        if (game._stub._pi.dirMask & DIR_UP) {
            game._stub._pi.dirMask &= ~DIR_UP
            if (current_color > 0) {
                const color1 = colors[current_color]
                colors[current_color] = colors[current_color - 1]
                colors[current_color - 1] = color1
                --current_color
            }
        }
        if (game._stub._pi.dirMask & DIR_DOWN) {
            game._stub._pi.dirMask &= ~DIR_DOWN
            if (current_color < 1) {
                const color1 = colors[current_color]
                colors[current_color] = colors[current_color + 1]
                colors[current_color + 1] = color1
                ++current_color
            }
        }
        if (game._stub._pi.enter) {
            game._stub._pi.enter = false
            return current_color === 0
        }
        game._stub.copyRect(0, 0, game._vid._w, game._vid._h, game._vid._frontLayer, game._vid._w)
        await game._stub.updateScreen(0)
        const COLOR_STEP = 8
        const COLOR_MIN = 16
        const COLOR_MAX = 256 - 16
        if (col.b >= COLOR_MAX) {
            color_inc = 0
        } else if (col.b < COLOR_MIN) {
            color_inc = UINT8_MAX
        }
        if (color_inc === UINT8_MAX) {
            col.b += COLOR_STEP
            col.g += COLOR_STEP
        } else {
            col.b -= COLOR_STEP
            col.g -= COLOR_STEP
        }
        game._stub.setPaletteEntry(0xE4, col)
        await game._stub.processEvents()
        await game._stub.sleep(100)
        --timeout
        game._vid._frontLayer.set(game._vid._tempLayer.subarray(0, game._vid._layerSize))
    }
    return false
}

export async function gameDidFinishAllLevels(game: Game) {
    if (game._cut.getId() === 0x3D) {
        await gameShowFinalScore(game)
        game._endLoop = true
        return true
    }
    return false
}

export async function gameDidDie(game: Game) {
    if (game._deathCutsceneCounter) {
        --game._deathCutsceneCounter
        if (game._deathCutsceneCounter === 0) {
            await gamePlayCutscene(game, game._cut.getDeathCutSceneId())
            if (!await gameHandleContinueAbort(game)) {
                await gamePlayCutscene(game, 0x41)
                game._endLoop = true
            } else {
                if (game._autoSave && game._rewindLen !== 0 && game.loadGameState(kAutoSaveSlot)) {
                } else if (game._validSaveState && game.loadGameState(kIngameSaveSlot)) {
                } else {
                    game.clearStateRewind()
                    await game.loadLevelData()
                    game.resetGameState()
                }
            }
            return true
        }
    }
    return false
}

// Process each active PGE once for this frame after the dynamic collision slots and the
// active left/current/right room collision window have been rebuilt. For each non-null PGE
// entry, this loop refreshes the per-PGE collision-grid origin used by room-collision queries
// and then hands control to gameRunPgeFrameLogic() to run that entity's frame logic.
export function gameProcessActivePgesForFrame(game: Game, activeFramePges: LivePGE[], currentRoom: number) {
    for (const pge of activeFramePges) {
        game._currentPgeCollisionGridY = ((pge.pos_y / 36) >> 0) & ~1
        game._currentPgeCollisionGridX = (pge.pos_x + 8) >> 4
        gameRunPgeFrameLogic(game, pge, currentRoom)
    }
}

export async function gameMainLoop(game: Game) {
    if (game._skipNextLevelCutscene) {
        game._skipNextLevelCutscene = false
    } else {
        await gamePlayCutscene(game)
    }
    if (await gameDidFinishAllLevels(game)) return
    if (await gameDidDie(game)) return

    game._vid._frontLayer.set(game._vid._backLayer.subarray(0, game._vid._layerSize))
    await gameUpdatePgeDirectionalInputState(game)
    gameRebuildPgeCollisionStateForCurrentRoom(game, game._currentRoom)
    gameRebuildActiveRoomCollisionSlotLookup(game, game._currentRoom)
    gameRebuildActiveFramePgeList(game)

    const oldLevel = game._currentLevel
    gameProcessActivePgesForFrame(game, game._livePgeStore.activeFrameList, game._currentRoom)
    if (game._startedFromLevelSelect && game.renders < 5) {
        const conrad = game._livePgesByIndex[0]
        console.log(
            `[direct-start] frame=${game.renders} level=${game._currentLevel} currentRoom=${game._currentRoom} conradRoom=${conrad.room_location} pos=(${conrad.pos_x},${conrad.pos_y}) state=${conrad.script_state_type}/${conrad.first_script_entry_index} anim=${conrad.anim_number} deathCounter=${game._deathCutsceneCounter} loadMap=${game._loadMap}`
        )
    }

    if (oldLevel !== game._currentLevel) {
        await gameChangeLevel(game)
        game._opcodeTempVar1 = 0
        return
    }

    if (game._loadMap) {
        if (game._currentRoom === UINT8_MAX || !gameHasLevelMap(game, game._livePgesByIndex[0].room_location)) {
            const conrad = game._livePgesByIndex[0]
            console.warn(
                `[direct-start] triggering death cutscene due to missing map: frame=${game.renders} level=${game._currentLevel} currentRoom=${game._currentRoom} conradRoom=${conrad.room_location} pos=(${conrad.pos_x},${conrad.pos_y}) state=${conrad.script_state_type}/${conrad.first_script_entry_index} anim=${conrad.anim_number}`
            )
            game._cut.setId(6)
            game._deathCutsceneCounter = 1
        } else {
            game._currentRoom = game._livePgesByIndex[0].room_location
            await gameLoadLevelMap(game, game._currentRoom)
            game._loadMap = false
            game._vid.fullRefresh()
        }
    }
    await gamePrepareAnimationsInRooms(game, game._currentRoom)
    await gameDrawAnims(game)
    game.renders++
    gameDrawCurrentInventoryItem(game)
    gameDrawLevelTexts(game)

    if (game._blinkingConradCounter !== 0) {
        --game._blinkingConradCounter
    }
    await game._vid.updateScreen()
    await gameUpdateTiming(game)
    await gameDrawStoryTexts(game)
    if (game._stub._pi.backspace) {
        game._stub._pi.backspace = false
        await gameHandleInventory(game)
    }
    if (game._stub._pi.escape) {
        if (await gameHandleConfigPanel(game)) {
            game._endLoop = true
            return
        }
        game._stub._pi.escape = false
    }
    gameInpHandleSpecialKeys(game)
    if (game._autoSave && game._stub.getTimeStamp() - game._saveTimestamp >= kAutoSaveIntervalMs) {
        if (game._livePgesByIndex[0].life > 0 && game._deathCutsceneCounter === 0) {
            game.saveGameState(kAutoSaveSlot)
            game._saveTimestamp = game._stub.getTimeStamp()
        }
    }
}

export function gameInpHandleSpecialKeys(game: Game) {
    if (game._stub._pi.dbgMask & DF_SETLIFE) {
        game._livePgesByIndex[0].life = 0x7FFF
    }
    if (game._stub._pi.load) {
        game.loadGameState(game._stateSlot)
        game._stub._pi.load = false
    }
    if (game._stub._pi.save) {
        game.saveGameState(game._stateSlot)
        game._stub._pi.save = false
    }
    if (game._stub._pi.stateSlot !== 0) {
        const slot = game._stateSlot + game._stub._pi.stateSlot
        if (slot >= 1 && slot < 100) {
            game._stateSlot = slot
            console.log(`Current game state slot is ${game._stateSlot}`)
        }
        game._stub._pi.stateSlot = 0
    }
    if (game._stub._pi.rewind) {
        if (game._rewindLen !== 0) {
            gameLoadStateRewind(game)
        } else {
            console.log('Rewind buffer is empty')
        }
        game._stub._pi.rewind = false
    }
}

export function gameLoadStateRewind(game: Game) {
    const ptr = game._rewindPtr
    if (game._rewindPtr === 0) {
        game._rewindPtr = kRewindSize - 1
    } else {
        --game._rewindPtr
    }
    const f = game._rewindBuffer[ptr]
    f.seek(0)
    game.loadState(f)
    if (game._rewindLen > 0) {
        --game._rewindLen
    }
    return !f.ioErr()
}
