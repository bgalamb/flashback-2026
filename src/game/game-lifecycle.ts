import { uint16Max } from '../core/game_constants'
import type { Game } from './game'
import { getGamePgeState, getGameSessionState, getGameUiState, getGameWorldState } from './game-state'
import { gameClearStateRewind } from './game-world'

const minStateSlot = 1
const maxStateSlot = 99

export const roomOverlayDurationFrames = 90

export function gameApplyTitleScreenSelection(game: Game) {
    const ui = getGameUiState(game)
    const world = getGameWorldState(game)
    const session = getGameSessionState(game)
    ui.skillLevel = game._menu._skill
    world.currentLevel = game._menu._level
    session.skipNextLevelCutscene = true
    session.startedFromLevelSelect = true
}

export function gameBeginPlaythrough(game: Game) {
    getGameUiState(game).score = 0
    gameClearStateRewind(game)
}

export function gameBeginFrameLoop(game: Game) {
    const session = getGameSessionState(game)
    session.endLoop = false
    session.frameTimestamp = game.services.stub.getTimeStamp()
    session.saveTimestamp = session.frameTimestamp
}

export function gameCompleteFrameTiming(game: Game) {
    getGameSessionState(game).frameTimestamp = game.services.stub.getTimeStamp()
}

export function gameEndLoop(game: Game) {
    getGameSessionState(game).endLoop = true
}

export function gameConsumeLevelCutsceneSkip(game: Game) {
    const session = getGameSessionState(game)
    const shouldSkip = session.skipNextLevelCutscene
    session.skipNextLevelCutscene = false
    return shouldSkip
}

export function gameRequestMapReload(game: Game, room: number) {
    const world = getGameWorldState(game)
    world.currentRoom = room
    world.loadMap = true
}

export function gameCommitLoadedRoom(game: Game, room: number) {
    const world = getGameWorldState(game)
    const ui = getGameUiState(game)
    world.currentRoom = room
    world.loadMap = false
    ui.currentRoomOverlayCounter = roomOverlayDurationFrames
}

export function gameResetRoomOverlay(game: Game) {
    getGameUiState(game).currentRoomOverlayCounter = 0
}

export function gameTickRoomOverlay(game: Game) {
    const ui = getGameUiState(game)
    if (ui.currentRoomOverlayCounter <= 0) {
        return false
    }
    --ui.currentRoomOverlayCounter
    return true
}

export function gameResetLevelLifecycle(game: Game, startRoom: number) {
    const world = getGameWorldState(game)
    const ui = getGameUiState(game)
    const pge = getGamePgeState(game)
    world.currentRoom = startRoom
    game.services.cut.setDeathCutSceneId(uint16Max)
    pge.opcodeTempVar2 = uint16Max
    world.deathCutsceneCounter = 0
    world.credits = 0
    ui.saveStateCompleted = false
    world.loadMap = true
    world.blinkingConradCounter = 0
    pge.shouldProcessCurrentPgeObjectNode = false
    pge.opcodeTempVar1 = 0
    world.textToDisplay = uint16Max
    gameResetRoomOverlay(game)
}

export function gameQueueDeathCutscene(game: Game, counter: number, deathCutsceneId?: number) {
    const world = getGameWorldState(game)
    if (world.deathCutsceneCounter !== 0) {
        return false
    }
    world.deathCutsceneCounter = counter
    if (typeof deathCutsceneId === 'number') {
        game.services.cut.setDeathCutSceneId(deathCutsceneId)
    }
    return true
}

export function gameTickDeathCutscene(game: Game) {
    const world = getGameWorldState(game)
    if (world.deathCutsceneCounter === 0) {
        return false
    }
    --world.deathCutsceneCounter
    return world.deathCutsceneCounter === 0
}

export function gameMarkSaveStateCompleted(game: Game) {
    getGameUiState(game).saveStateCompleted = true
    getGameSessionState(game).validSaveState = true
}

export function gameClearSaveStateCompleted(game: Game) {
    getGameUiState(game).saveStateCompleted = false
}

export function gameClearValidSaveState(game: Game) {
    getGameSessionState(game).validSaveState = false
}

export function gameSetSaveTimestamp(game: Game) {
    getGameSessionState(game).saveTimestamp = game.services.stub.getTimeStamp()
}

export function gameSetStateSlot(game: Game, slot: number) {
    const session = getGameSessionState(game)
    const nextSlot = Math.max(minStateSlot, Math.min(maxStateSlot, slot))
    session.stateSlot = nextSlot
    return nextSlot
}

export function gameChangeStateSlot(game: Game, delta: number) {
    return gameSetStateSlot(game, getGameSessionState(game).stateSlot + delta)
}

export function gameSetCurrentLevel(game: Game, level: number) {
    getGameWorldState(game).currentLevel = level
}
