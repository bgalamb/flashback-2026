import { UINT16_MAX } from '../core/game_constants'
import type { Game } from './game'
import { getGamePgeState, getGameSessionState, getGameUiState, getGameWorldState } from './game_state'
import { gameClearStateRewind } from './game_world'

const MIN_STATE_SLOT = 1
const MAX_STATE_SLOT = 99

export const ROOM_OVERLAY_DURATION_FRAMES = 90

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
    session.frameTimestamp = game._stub.getTimeStamp()
    session.saveTimestamp = session.frameTimestamp
}

export function gameCompleteFrameTiming(game: Game) {
    getGameSessionState(game).frameTimestamp = game._stub.getTimeStamp()
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
    ui.currentRoomOverlayCounter = ROOM_OVERLAY_DURATION_FRAMES
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
    game._cut.setDeathCutSceneId(UINT16_MAX)
    pge.opcodeTempVar2 = UINT16_MAX
    world.deathCutsceneCounter = 0
    world.credits = 0
    ui.saveStateCompleted = false
    world.loadMap = true
    world.blinkingConradCounter = 0
    pge.shouldProcessCurrentPgeObjectNode = false
    pge.opcodeTempVar1 = 0
    world.textToDisplay = UINT16_MAX
    gameResetRoomOverlay(game)
}

export function gameQueueDeathCutscene(game: Game, counter: number, deathCutsceneId?: number) {
    const world = getGameWorldState(game)
    if (world.deathCutsceneCounter !== 0) {
        return false
    }
    world.deathCutsceneCounter = counter
    if (typeof deathCutsceneId === 'number') {
        game._cut.setDeathCutSceneId(deathCutsceneId)
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
    getGameSessionState(game).saveTimestamp = game._stub.getTimeStamp()
}

export function gameSetStateSlot(game: Game, slot: number) {
    const session = getGameSessionState(game)
    const nextSlot = Math.max(MIN_STATE_SLOT, Math.min(MAX_STATE_SLOT, slot))
    session.stateSlot = nextSlot
    return nextSlot
}

export function gameChangeStateSlot(game: Game, delta: number) {
    return gameSetStateSlot(game, getGameSessionState(game).stateSlot + delta)
}

export function gameSetCurrentLevel(game: Game, level: number) {
    getGameWorldState(game).currentLevel = level
}
