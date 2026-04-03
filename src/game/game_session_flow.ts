import type { Color } from '../core/intern'
import type { Game } from './game'
import { Cutscene } from '../cutscene-players/cutscene'
import { LocaleData } from '../resource/resource'
import { dfFastmode, dfSetlife, dirDown, dirUp } from '../platform/systemstub_web'
import { charW, gamescreenW, uint8Max } from '../core/game_constants'
import { kAutoSaveSlot, kIngameSaveSlot, kRewindSize } from './game'
import { gameDebugLog } from './game_debug'
import { gameChangeStateSlot, gameCompleteFrameTiming, gameEndLoop, gameSetSaveTimestamp, gameTickDeathCutscene } from './game_lifecycle'
import { getRuntimeRegistryState } from './game_runtime_data'
import { getGameServices } from './game_services'
import { getGameSessionState, getGameUiState, getGameWorldState } from './game_state'
import { gameClearStateRewind, gameLoadLevelData, gameResetGameState } from './game_world'

export async function gamePlayCutscene(game: Game, id: number = -1) {
    const { cut, mix } = getGameServices(game)
    if (id !== -1) {
        cut.setId(id)
    }
    if (cut.getId() === -1) {
        gameDebugLog(game, 'session', '[cutscene] skip reason=no-cutscene-id')
        return
    }
    gameDebugLog(game, 'session', `[cutscene] play id=${cut.getId()} requestedId=${id}`)
    mix.stopMusic()
    if (cut.getId() !== 0x4A) {
        mix.playMusic(Cutscene._musicTable[cut.getId()])
    }
    await cut.play()
    if (id === 0xD && !cut.isInterrupted()) {
        cut.setId(0x4A)
        gameDebugLog(game, 'session', '[cutscene] chaining intro to id=74')
        await cut.play()
    }
    mix.stopMusic()
    gameDebugLog(game, 'session', `[cutscene] finished id=${cut.getId()} interrupted=${cut.isInterrupted()}`)
}

export async function gameShowFinalScore(game: Game) {
    await gamePlayCutscene(game, 0x49)

    const buf = getGameUiState(game).score.toString().padStart(8, '0')
    game._vid.drawString(buf, (gamescreenW - buf.length * charW) / 2, 40, 0xE5)
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
    const delay = game._stub.getTimeStamp() - getGameSessionState(game).frameTimestamp
    let pause = (game._stub._pi.dbgMask & dfFastmode) ? 20 : (1000 / frameHz)
    pause -= delay
    if (pause > 0) {
        await game._stub.sleep(pause)
    }
    gameCompleteFrameTiming(game)
}

export async function gameHandleContinueAbort(game: Game) {
    let timeout = 100
    let currentColor = 0
    const colors = [0xE4, 0xE5]
    let colorInc = uint8Max
    const col: Color = { r: 0, g: 0, b: 0 }
    game._stub.getPaletteEntry(0xE4, col)
    game._vid.copyFrontLayerToTemp()
    while (timeout >= 0 && !game._stub._pi.quit) {
        let str = game._res.getMenuString(LocaleData.Id.li01ContinueOrAbort)
        game._vid.drawString(str, ((gamescreenW - str.length * charW) / 2) >> 0, 64, 0xE3)
        str = game._res.getMenuString(LocaleData.Id.li02Time)
        let buf = str + ' : ' + ((timeout / 10) >> 0)
        game._vid.drawString(buf, 96, 88, 0xE3)
        str = game._res.getMenuString(LocaleData.Id.li03Continue)
        game._vid.drawString(str, ((gamescreenW - str.length * charW) / 2) >> 0, 104, colors[0])
        str = game._res.getMenuString(LocaleData.Id.li04Abort)
        game._vid.drawString(str, ((gamescreenW - str.length * charW) / 2) >> 0, 112, colors[1])
        buf = 'SCORE  ' + getGameUiState(game).score.toString().padStart(8, '0')
        game._vid.drawString(buf, 64, 154, 0xE3)
        if (game._stub._pi.dirMask & dirUp) {
            game._stub._pi.dirMask &= ~dirUp
            if (currentColor > 0) {
                const color1 = colors[currentColor]
                colors[currentColor] = colors[currentColor - 1]
                colors[currentColor - 1] = color1
                --currentColor
            }
        }
        if (game._stub._pi.dirMask & dirDown) {
            game._stub._pi.dirMask &= ~dirDown
            if (currentColor < 1) {
                const color1 = colors[currentColor]
                colors[currentColor] = colors[currentColor + 1]
                colors[currentColor + 1] = color1
                ++currentColor
            }
        }
        if (game._stub._pi.enter) {
            game._stub._pi.enter = false
            return currentColor === 0
        }
        game._vid.presentFrontLayer()
        await game._stub.updateScreen(0)
        const colorStep = 8
        const colorMin = 16
        const colorMax = 256 - 16
        if (col.b >= colorMax) {
            colorInc = 0
        } else if (col.b < colorMin) {
            colorInc = uint8Max
        }
        if (colorInc === uint8Max) {
            col.b += colorStep
            col.g += colorStep
        } else {
            col.b -= colorStep
            col.g -= colorStep
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
    const session = getGameSessionState(game)
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
    const session = getGameSessionState(game)
    const world = getGameWorldState(game)
    if (!session.autoSave || game._stub.getTimeStamp() - session.saveTimestamp < autoSaveIntervalMs) {
        return
    }
    if (getRuntimeRegistryState(game).livePgesByIndex[0].life > 0 && world.deathCutsceneCounter === 0) {
        game.saveGameState(kAutoSaveSlot)
        gameSetSaveTimestamp(game)
        gameDebugLog(game, 'session', `[autosave] saved slot=${kAutoSaveSlot} timestamp=${session.saveTimestamp}`)
    } else {
        gameDebugLog(game, 'session', `[autosave] skipped conradLife=${getRuntimeRegistryState(game).livePgesByIndex[0].life} deathCutsceneCounter=${world.deathCutsceneCounter}`)
    }
}

export function gameInpHandleSpecialKeys(game: Game) {
    const session = getGameSessionState(game)
    if (game._stub._pi.dbgMask & dfSetlife) {
        getRuntimeRegistryState(game).livePgesByIndex[0].life = 0x7FFF
        gameDebugLog(game, 'session', '[debug-key] set Conrad life to max')
    }
    if (game._stub._pi.load) {
        gameDebugLog(game, 'session', `[debug-key] load requested slot=${session.stateSlot}`)
        game.loadGameState(session.stateSlot)
        game._stub._pi.load = false
    }
    if (game._stub._pi.save) {
        gameDebugLog(game, 'session', `[debug-key] save requested slot=${session.stateSlot}`)
        game.saveGameState(session.stateSlot)
        game._stub._pi.save = false
    }
    if (game._stub._pi.stateSlot !== 0) {
        const previousSlot = session.stateSlot
        const slot = gameChangeStateSlot(game, game._stub._pi.stateSlot)
        if (slot !== previousSlot) {
            gameDebugLog(game, 'session', `Current game state slot is ${session.stateSlot}`)
        }
        game._stub._pi.stateSlot = 0
    }
    if (game._stub._pi.rewind) {
        if (game._rewindLen !== 0) {
            gameDebugLog(game, 'session', `[rewind] loading previous state rewindLen=${game._rewindLen} rewindPtr=${game._rewindPtr}`)
            gameLoadStateRewind(game)
        } else {
            gameDebugLog(game, 'session', 'Rewind buffer is empty')
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
    gameDebugLog(game, 'session', `[rewind] loaded ptr=${ptr} nextPtr=${game._rewindPtr} remaining=${game._rewindLen}`)
    return !f.ioErr()
}
