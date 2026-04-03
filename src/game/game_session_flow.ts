import type { Color } from '../core/intern'
import type { Game } from './game'
import { Cutscene } from '../cutscene-players/cutscene'
import { LocaleData } from '../resource/resource'
import { DF_FASTMODE, DF_SETLIFE, DIR_DOWN, DIR_UP } from '../platform/systemstub_web'
import { CHAR_W, GAMESCREEN_W, UINT8_MAX } from '../core/game_constants'
import { kAutoSaveSlot, kIngameSaveSlot, kRewindSize } from './game'
import { gameChangeStateSlot, gameCompleteFrameTiming, gameEndLoop, gameSetSaveTimestamp, gameTickDeathCutscene } from './game_lifecycle'
import { getRuntimeRegistryState } from './game_runtime_data'
import { gameClearStateRewind, gameLoadLevelData, gameResetGameState } from './game_world'

type SessionFlowGame = Record<string, unknown>

function getSessionFlowUiState(game: Game) {
    const sessionGame = game as unknown as SessionFlowGame
    return (sessionGame['ui'] as { score: number } | undefined) ?? {
        get score() { return sessionGame['_score'] as number },
        set score(value: number) { sessionGame['_score'] = value },
    }
}

function getSessionFlowSessionState(game: Game) {
    const sessionGame = game as unknown as SessionFlowGame
    return (sessionGame['session'] as { autoSave: boolean; validSaveState: boolean; stateSlot: number; frameTimestamp: number; endLoop: boolean; saveTimestamp: number } | undefined) ?? {
        get autoSave() { return sessionGame['_autoSave'] as boolean },
        set autoSave(value: boolean) { sessionGame['_autoSave'] = value },
        get validSaveState() { return sessionGame['_validSaveState'] as boolean },
        set validSaveState(value: boolean) { sessionGame['_validSaveState'] = value },
        get stateSlot() { return sessionGame['_stateSlot'] as number },
        set stateSlot(value: number) { sessionGame['_stateSlot'] = value },
        get frameTimestamp() { return sessionGame['_frameTimestamp'] as number },
        set frameTimestamp(value: number) { sessionGame['_frameTimestamp'] = value },
        get endLoop() { return sessionGame['_endLoop'] as boolean },
        set endLoop(value: boolean) { sessionGame['_endLoop'] = value },
        get saveTimestamp() { return sessionGame['_saveTimestamp'] as number },
        set saveTimestamp(value: number) { sessionGame['_saveTimestamp'] = value },
    }
}

function getSessionFlowWorldState(game: Game) {
    const sessionGame = game as unknown as SessionFlowGame
    return (sessionGame['world'] as { deathCutsceneCounter: number } | undefined) ?? {
        get deathCutsceneCounter() { return sessionGame['_deathCutsceneCounter'] as number },
        set deathCutsceneCounter(value: number) { sessionGame['_deathCutsceneCounter'] = value },
    }
}

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

export async function gameShowFinalScore(game: Game) {
    await gamePlayCutscene(game, 0x49)

    const buf = getSessionFlowUiState(game).score.toString().padStart(8, '0')
    game._vid.drawString(buf, (GAMESCREEN_W - buf.length * CHAR_W) / 2, 40, 0xE5)
    while (!game._stub._pi.quit) {
        game._vid.presentFrontLayer()
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
    const delay = game._stub.getTimeStamp() - getSessionFlowSessionState(game).frameTimestamp
    let pause = (game._stub._pi.dbgMask & DF_FASTMODE) ? 20 : (1000 / frameHz)
    pause -= delay
    if (pause > 0) {
        await game._stub.sleep(pause)
    }
    gameCompleteFrameTiming(game)
}

export async function gameHandleContinueAbort(game: Game) {
    let timeout = 100
    let current_color = 0
    const colors = [0xE4, 0xE5]
    let color_inc = UINT8_MAX
    const col: Color = { r: 0, g: 0, b: 0 }
    game._stub.getPaletteEntry(0xE4, col)
    game._vid.copyFrontLayerToTemp()
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
        buf = 'SCORE  ' + getSessionFlowUiState(game).score.toString().padStart(8, '0')
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
        game._vid.presentFrontLayer()
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
        game._vid.restoreFrontLayerFromTemp()
    }
    return false
}

export async function gameDidFinishAllLevels(game: Game) {
    if (game._cut.getId() === 0x3D) {
        await gameShowFinalScore(game)
        gameEndLoop(game)
        return true
    }
    return false
}

export async function gameDidDie(game: Game) {
    const session = getSessionFlowSessionState(game)
    if (gameTickDeathCutscene(game)) {
        await gamePlayCutscene(game, game._cut.getDeathCutSceneId())
        if (!await gameHandleContinueAbort(game)) {
            await gamePlayCutscene(game, 0x41)
            gameEndLoop(game)
        } else {
            if (session.autoSave && game._rewindLen !== 0 && game.loadGameState(kAutoSaveSlot)) {
            } else if (session.validSaveState && game.loadGameState(kIngameSaveSlot)) {
            } else {
                game.clearStateRewind()
                await game.loadLevelData()
                game.resetGameState()
            }
        }
        return true
    }
    return false
}

export function gameMaybeAutoSave(game: Game, autoSaveIntervalMs: number) {
    const session = getSessionFlowSessionState(game)
    const world = getSessionFlowWorldState(game)
    if (!session.autoSave || game._stub.getTimeStamp() - session.saveTimestamp < autoSaveIntervalMs) {
        return
    }
    if (getRuntimeRegistryState(game).livePgesByIndex[0].life > 0 && world.deathCutsceneCounter === 0) {
        game.saveGameState(kAutoSaveSlot)
        gameSetSaveTimestamp(game)
    }
}

export function gameInpHandleSpecialKeys(game: Game) {
    const session = getSessionFlowSessionState(game)
    if (game._stub._pi.dbgMask & DF_SETLIFE) {
        getRuntimeRegistryState(game).livePgesByIndex[0].life = 0x7FFF
    }
    if (game._stub._pi.load) {
        game.loadGameState(session.stateSlot)
        game._stub._pi.load = false
    }
    if (game._stub._pi.save) {
        game.saveGameState(session.stateSlot)
        game._stub._pi.save = false
    }
    if (game._stub._pi.stateSlot !== 0) {
        const previousSlot = session.stateSlot
        const slot = gameChangeStateSlot(game, game._stub._pi.stateSlot)
        if (slot !== previousSlot) {
            console.log(`Current game state slot is ${session.stateSlot}`)
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
