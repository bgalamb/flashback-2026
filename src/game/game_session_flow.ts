import type { Color } from '../core/intern'
import type { Game } from './game'
import { Cutscene } from '../cutscene-players/cutscene'
import { LocaleData } from '../resource/resource'
import { dfFastmode, dfSetlife, dirDown, dirLeft, dirUp } from '../platform/system-port'
import { charW, gamescreenW, uint8Max } from '../core/game_constants'
import { kAutoSaveSlot, kIngameSaveSlot } from './game'
import { gameDebugLog } from './game_debug'
import { gameChangeStateSlot, gameCompleteFrameTiming, gameEndLoop, gameSetSaveTimestamp, gameTickDeathCutscene } from './game_lifecycle'
import { gameLoadGameState, gameLoadRewindState, gameSaveGameState } from './game_runtime'
import { getRuntimeRegistryState } from './game_runtime_data'
import { getGameServices } from './game_services'
import { getGameRewindState, getGameSessionState, getGameTransientState, getGameUiState, getGameWorldState } from './game_state'
import { gameClearStateRewind, gameLoadLevelData, gameResetGameState } from './game_world'

type ContinueAbortAction = 'abort' | 'continue' | 'rewind'

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
    const { stub, vid } = getGameServices(game)
    await gamePlayCutscene(game, 0x49)

    const buf = getGameUiState(game).score.toString().padStart(8, '0')
    vid.drawString(buf, (gamescreenW - buf.length * charW) / 2, 40, 0xE5)
    while (!stub.input.quit) {
        vid.presentFrontLayer()
        await stub.updateScreen(0)
        await stub.processEvents()
        if (stub.input.enter) {
            stub.input.enter = false
            break
        }
        await stub.sleep(100)
    }
}

export async function gameUpdateTiming(game: Game) {
    const { stub } = getGameServices(game)
    const frameHz = 30
    const delay = stub.getTimeStamp() - getGameSessionState(game).frameTimestamp
    let pause = (stub.input.dbgMask & dfFastmode) ? 20 : (1000 / frameHz)
    pause -= delay
    if (pause > 0) {
        await stub.sleep(pause)
    }
    gameCompleteFrameTiming(game)
}

export async function gameHandleContinueAbort(game: Game) {
    const { res, stub, vid } = getGameServices(game)
    const rewind = getGameRewindState(game)
    console.log(`[rewind-death] screen-open len=${rewind.len} ptr=${rewind.ptr} autoSave=${getGameSessionState(game).autoSave ? 1 : 0}`)
    let timeout = 100
    let currentColor = 0
    const colors = [0xE4, 0xE5]
    let colorInc = uint8Max
    const col: Color = { r: 0, g: 0, b: 0 }
    stub.getPaletteEntry(0xE4, col)
    vid.copyFrontLayerToTemp()
    while (timeout >= 0 && !stub.input.quit) {
        let str = res.getMenuString(LocaleData.Id.li01ContinueOrAbort)
        vid.drawString(str, ((gamescreenW - str.length * charW) / 2) >> 0, 64, 0xE3)
        str = res.getMenuString(LocaleData.Id.li02Time)
        let buf = str + ' : ' + ((timeout / 10) >> 0)
        vid.drawString(buf, 96, 88, 0xE3)
        str = res.getMenuString(LocaleData.Id.li03Continue)
        vid.drawString(str, ((gamescreenW - str.length * charW) / 2) >> 0, 104, colors[0])
        str = res.getMenuString(LocaleData.Id.li04Abort)
        vid.drawString(str, ((gamescreenW - str.length * charW) / 2) >> 0, 112, colors[1])
        buf = 'SCORE  ' + getGameUiState(game).score.toString().padStart(8, '0')
        vid.drawString(buf, 64, 154, 0xE3)
        const rewindHint = 'LEFT / R / CTRL+R : REWIND'
        vid.drawString(rewindHint, ((gamescreenW - rewindHint.length * charW) / 2) >> 0, 170, 0xE3)
        if (stub.input.dirMask & dirUp) {
            stub.input.dirMask &= ~dirUp
            if (currentColor > 0) {
                const color1 = colors[currentColor]
                colors[currentColor] = colors[currentColor - 1]
                colors[currentColor - 1] = color1
                --currentColor
            }
        }
        if (stub.input.dirMask & dirDown) {
            stub.input.dirMask &= ~dirDown
            if (currentColor < 1) {
                const color1 = colors[currentColor]
                colors[currentColor] = colors[currentColor + 1]
                colors[currentColor + 1] = color1
                ++currentColor
            }
        }
        if (stub.input.enter) {
            stub.input.enter = false
            console.log(`[rewind-death] continue-abort enter selection=${currentColor === 0 ? 'continue' : 'abort'} len=${rewind.len} ptr=${rewind.ptr}`)
            return currentColor === 0 ? 'continue' : 'abort'
        }
        if (stub.input.dirMask & dirLeft) {
            stub.input.dirMask &= ~dirLeft
            if (rewind.len !== 0) {
                console.log(`[rewind-death] rewind-request accepted via=left len=${rewind.len} ptr=${rewind.ptr}`)
                return 'rewind'
            }
            console.log('[rewind-death] rewind-request ignored via=left reason=empty-buffer')
        }
        if (stub.input.rewind) {
            stub.input.rewind = false
            if (rewind.len !== 0) {
                console.log(`[rewind-death] rewind-request accepted len=${rewind.len} ptr=${rewind.ptr}`)
                return 'rewind'
            }
            console.log('[rewind-death] rewind-request ignored reason=empty-buffer')
        }
        vid.presentFrontLayer()
        await stub.updateScreen(0)
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
        stub.setPaletteEntry(0xE4, col)
        await stub.processEvents()
        await stub.sleep(100)
        --timeout
        vid.restoreFrontLayerFromTemp()
    }
    return 'abort'
}

export async function gameDidFinishAllLevels(game: Game) {
    if (getGameServices(game).cut.getId() === 0x3D) {
        await gameShowFinalScore(game)
        gameEndLoop(game)
        return true
    }
    return false
}

export async function gameDidDie(game: Game) {
    const { cut } = getGameServices(game)
    const session = getGameSessionState(game)
    if (gameTickDeathCutscene(game)) {
        const rewind = getGameRewindState(game)
        console.log(`[rewind-death] death-triggered len=${rewind.len} ptr=${rewind.ptr} autoSave=${session.autoSave ? 1 : 0} validSave=${session.validSaveState ? 1 : 0}`)
        await gamePlayCutscene(game, cut.getDeathCutSceneId())
        const action = await gameHandleContinueAbort(game)
        if (action === 'abort') {
            console.log('[rewind-death] action=abort')
            await gamePlayCutscene(game, 0x41)
            gameEndLoop(game)
        } else if (action === 'rewind') {
            if (session.autoSave && gameLoadRewindState(game)) {
                console.log('[rewind-death] action=rewind result=loaded')
                gameResetInputAfterDeathRewind(game)
            } else {
                console.log('[rewind-death] action=rewind result=failed')
                gameResetInputAfterDeathRewind(game)
            }
        } else {
            console.log('[rewind-death] action=continue')
            if (session.validSaveState && game.loadGameState(kIngameSaveSlot)) {
                console.log('[rewind-death] continue result=loaded-ingame-save')
            } else {
                console.log('[rewind-death] continue result=reload-level')
                gameClearStateRewind(game)
                await gameLoadLevelData(game)
                gameResetGameState(game)
            }
        }
        return true
    }
    return false
}

function gameResetInputAfterDeathRewind(game: Game) {
    const input = getGameServices(game).stub.input
    const transient = getGameTransientState(game)
    input.dirMask = 0
    input.enter = false
    input.space = false
    input.shift = false
    input.backspace = false
    input.rewind = false
    transient.lastInputMask = 0
    transient.lastLeftRightInputMask = 0
}

export function gameMaybeAutoSave(game: Game, autoSaveIntervalMs: number) {
    const { stub } = getGameServices(game)
    const session = getGameSessionState(game)
    const world = getGameWorldState(game)
    if (!session.autoSave || stub.getTimeStamp() - session.saveTimestamp < autoSaveIntervalMs) {
        return
    }
    if (getRuntimeRegistryState(game).livePgesByIndex[0].life > 0 && world.deathCutsceneCounter === 0) {
        gameSaveGameState(game, kAutoSaveSlot)
        gameSetSaveTimestamp(game)
        gameDebugLog(game, 'session', `[autosave] saved slot=${kAutoSaveSlot} timestamp=${session.saveTimestamp}`)
    } else {
        gameDebugLog(game, 'session', `[autosave] skipped conradLife=${getRuntimeRegistryState(game).livePgesByIndex[0].life} deathCutsceneCounter=${world.deathCutsceneCounter}`)
    }
}

export function gameInpHandleSpecialKeys(game: Game) {
    const { stub } = getGameServices(game)
    const rewind = getGameRewindState(game)
    const session = getGameSessionState(game)
    if (stub.input.dbgMask & dfSetlife) {
        getRuntimeRegistryState(game).livePgesByIndex[0].life = 0x7FFF
        gameDebugLog(game, 'session', '[debug-key] set Conrad life to max')
    }
    if (stub.input.load) {
        gameDebugLog(game, 'session', `[debug-key] load requested slot=${session.stateSlot}`)
        game.loadGameState(session.stateSlot)
        stub.input.load = false
    }
    if (stub.input.save) {
        gameDebugLog(game, 'session', `[debug-key] save requested slot=${session.stateSlot}`)
        gameSaveGameState(game, session.stateSlot)
        stub.input.save = false
    }
    if (stub.input.stateSlot !== 0) {
        const previousSlot = session.stateSlot
        const slot = gameChangeStateSlot(game, stub.input.stateSlot)
        if (slot !== previousSlot) {
            gameDebugLog(game, 'session', `Current game state slot is ${session.stateSlot}`)
        }
        stub.input.stateSlot = 0
    }
    if (stub.input.rewind) {
        if (rewind.len !== 0) {
            gameDebugLog(game, 'session', `[rewind] loading previous state rewindLen=${rewind.len} rewindPtr=${rewind.ptr}`)
            gameLoadStateRewind(game)
        } else {
            gameDebugLog(game, 'session', 'Rewind buffer is empty')
        }
        stub.input.rewind = false
    }
}

export function gameLoadStateRewind(game: Game) {
    const rewind = getGameRewindState(game)
    const ptr = rewind.ptr
    const loaded = gameLoadRewindState(game)
    console.log(`[rewind-runtime] load-request ptr=${ptr} nextPtr=${rewind.ptr} remaining=${rewind.len} loaded=${loaded ? 1 : 0}`)
    gameDebugLog(game, 'session', `[rewind] loaded ptr=${ptr} nextPtr=${rewind.ptr} remaining=${rewind.len}`)
    return loaded
}
