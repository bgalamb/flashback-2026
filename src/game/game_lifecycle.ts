import { UINT16_MAX } from '../core/game_constants'
import type { Game } from './game'
import { gameClearStateRewind } from './game_world'

const MIN_STATE_SLOT = 1
const MAX_STATE_SLOT = 99

export const ROOM_OVERLAY_DURATION_FRAMES = 90

type LifecycleGame = Record<string, unknown>

type WorldStateShape = {
        currentLevel: number
        currentRoom: number
        currentIcon: number
        loadMap: boolean
        printLevelCodeCounter: number
        credits: number
        blinkingConradCounter: number
        textToDisplay: number
        eraseBackground: boolean
        deathCutsceneCounter: number
}

type UiStateShape = {
        skillLevel: number
        score: number
        currentRoomOverlayCounter: number
        currentInventoryIconNum: number
        saveStateCompleted: boolean
}

type SessionStateShape = {
        randSeed: number
        endLoop: boolean
        skipNextLevelCutscene: boolean
        startedFromLevelSelect: boolean
        frameTimestamp: number
        autoSave: boolean
        saveTimestamp: number
        stateSlot: number
        validSaveState: boolean
}

type PgeStateShape = {
        shouldProcessCurrentPgeObjectNode: boolean
        opcodeTempVar1: number
        opcodeTempVar2: number
}

function getWorldState(game: Game) {
    const lifecycleGame = game as unknown as LifecycleGame
    const groupedState = lifecycleGame['world'] as WorldStateShape | undefined
    return groupedState ?? {
        get currentLevel() { return lifecycleGame['_currentLevel'] as number },
        set currentLevel(value: number) { lifecycleGame['_currentLevel'] = value },
        get currentRoom() { return lifecycleGame['_currentRoom'] as number },
        set currentRoom(value: number) { lifecycleGame['_currentRoom'] = value },
        get currentIcon() { return lifecycleGame['_currentIcon'] as number },
        set currentIcon(value: number) { lifecycleGame['_currentIcon'] = value },
        get loadMap() { return lifecycleGame['_loadMap'] as boolean },
        set loadMap(value: boolean) { lifecycleGame['_loadMap'] = value },
        get printLevelCodeCounter() { return lifecycleGame['_printLevelCodeCounter'] as number },
        set printLevelCodeCounter(value: number) { lifecycleGame['_printLevelCodeCounter'] = value },
        get credits() { return lifecycleGame['_credits'] as number },
        set credits(value: number) { lifecycleGame['_credits'] = value },
        get blinkingConradCounter() { return lifecycleGame['_blinkingConradCounter'] as number },
        set blinkingConradCounter(value: number) { lifecycleGame['_blinkingConradCounter'] = value },
        get textToDisplay() { return lifecycleGame['_textToDisplay'] as number },
        set textToDisplay(value: number) { lifecycleGame['_textToDisplay'] = value },
        get eraseBackground() { return lifecycleGame['_eraseBackground'] as boolean },
        set eraseBackground(value: boolean) { lifecycleGame['_eraseBackground'] = value },
        get deathCutsceneCounter() { return lifecycleGame['_deathCutsceneCounter'] as number },
        set deathCutsceneCounter(value: number) { lifecycleGame['_deathCutsceneCounter'] = value },
    }
}

function getUiState(game: Game) {
    const lifecycleGame = game as unknown as LifecycleGame
    const groupedState = lifecycleGame['ui'] as UiStateShape | undefined
    return groupedState ?? {
        get skillLevel() { return lifecycleGame['_skillLevel'] as number },
        set skillLevel(value: number) { lifecycleGame['_skillLevel'] = value },
        get score() { return lifecycleGame['_score'] as number },
        set score(value: number) { lifecycleGame['_score'] = value },
        get currentRoomOverlayCounter() { return lifecycleGame['_currentRoomOverlayCounter'] as number },
        set currentRoomOverlayCounter(value: number) { lifecycleGame['_currentRoomOverlayCounter'] = value },
        get currentInventoryIconNum() { return lifecycleGame['_currentInventoryIconNum'] as number },
        set currentInventoryIconNum(value: number) { lifecycleGame['_currentInventoryIconNum'] = value },
        get saveStateCompleted() { return lifecycleGame['_saveStateCompleted'] as boolean },
        set saveStateCompleted(value: number | boolean) { lifecycleGame['_saveStateCompleted'] = value as boolean },
    }
}

function getSessionState(game: Game) {
    const lifecycleGame = game as unknown as LifecycleGame
    const groupedState = lifecycleGame['session'] as SessionStateShape | undefined
    return groupedState ?? {
        get randSeed() { return lifecycleGame['_randSeed'] as number },
        set randSeed(value: number) { lifecycleGame['_randSeed'] = value },
        get endLoop() { return lifecycleGame['_endLoop'] as boolean },
        set endLoop(value: boolean) { lifecycleGame['_endLoop'] = value },
        get skipNextLevelCutscene() { return lifecycleGame['_skipNextLevelCutscene'] as boolean },
        set skipNextLevelCutscene(value: boolean) { lifecycleGame['_skipNextLevelCutscene'] = value },
        get startedFromLevelSelect() { return lifecycleGame['_startedFromLevelSelect'] as boolean },
        set startedFromLevelSelect(value: boolean) { lifecycleGame['_startedFromLevelSelect'] = value },
        get frameTimestamp() { return lifecycleGame['_frameTimestamp'] as number },
        set frameTimestamp(value: number) { lifecycleGame['_frameTimestamp'] = value },
        get autoSave() { return lifecycleGame['_autoSave'] as boolean },
        set autoSave(value: boolean) { lifecycleGame['_autoSave'] = value },
        get saveTimestamp() { return lifecycleGame['_saveTimestamp'] as number },
        set saveTimestamp(value: number) { lifecycleGame['_saveTimestamp'] = value },
        get stateSlot() { return lifecycleGame['_stateSlot'] as number },
        set stateSlot(value: number) { lifecycleGame['_stateSlot'] = value },
        get validSaveState() { return lifecycleGame['_validSaveState'] as boolean },
        set validSaveState(value: boolean) { lifecycleGame['_validSaveState'] = value },
    }
}

function getPgeState(game: Game) {
    const lifecycleGame = game as unknown as LifecycleGame
    const groupedState = lifecycleGame['pge'] as PgeStateShape | undefined
    return groupedState ?? {
        get shouldProcessCurrentPgeObjectNode() { return lifecycleGame['_shouldProcessCurrentPgeObjectNode'] as boolean },
        set shouldProcessCurrentPgeObjectNode(value: boolean) { lifecycleGame['_shouldProcessCurrentPgeObjectNode'] = value },
        get opcodeTempVar1() { return lifecycleGame['_opcodeTempVar1'] as number },
        set opcodeTempVar1(value: number) { lifecycleGame['_opcodeTempVar1'] = value },
        get opcodeTempVar2() { return lifecycleGame['_opcodeTempVar2'] as number },
        set opcodeTempVar2(value: number) { lifecycleGame['_opcodeTempVar2'] = value },
    }
}

export function gameApplyTitleScreenSelection(game: Game) {
    const ui = getUiState(game)
    const world = getWorldState(game)
    const session = getSessionState(game)
    ui.skillLevel = game._menu._skill
    world.currentLevel = game._menu._level
    session.skipNextLevelCutscene = true
    session.startedFromLevelSelect = true
}

export function gameBeginPlaythrough(game: Game) {
    getUiState(game).score = 0
    gameClearStateRewind(game)
}

export function gameBeginFrameLoop(game: Game) {
    const session = getSessionState(game)
    session.endLoop = false
    session.frameTimestamp = game._stub.getTimeStamp()
    session.saveTimestamp = session.frameTimestamp
}

export function gameCompleteFrameTiming(game: Game) {
    getSessionState(game).frameTimestamp = game._stub.getTimeStamp()
}

export function gameEndLoop(game: Game) {
    getSessionState(game).endLoop = true
}

export function gameConsumeLevelCutsceneSkip(game: Game) {
    const session = getSessionState(game)
    const shouldSkip = session.skipNextLevelCutscene
    session.skipNextLevelCutscene = false
    return shouldSkip
}

export function gameRequestMapReload(game: Game, room: number) {
    const world = getWorldState(game)
    world.currentRoom = room
    world.loadMap = true
}

export function gameCommitLoadedRoom(game: Game, room: number) {
    const world = getWorldState(game)
    const ui = getUiState(game)
    world.currentRoom = room
    world.loadMap = false
    ui.currentRoomOverlayCounter = ROOM_OVERLAY_DURATION_FRAMES
}

export function gameResetRoomOverlay(game: Game) {
    getUiState(game).currentRoomOverlayCounter = 0
}

export function gameTickRoomOverlay(game: Game) {
    const ui = getUiState(game)
    if (ui.currentRoomOverlayCounter <= 0) {
        return false
    }
    --ui.currentRoomOverlayCounter
    return true
}

export function gameResetLevelLifecycle(game: Game, startRoom: number) {
    const world = getWorldState(game)
    const ui = getUiState(game)
    const pge = getPgeState(game)
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
    const world = getWorldState(game)
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
    const world = getWorldState(game)
    if (world.deathCutsceneCounter === 0) {
        return false
    }
    --world.deathCutsceneCounter
    return world.deathCutsceneCounter === 0
}

export function gameMarkSaveStateCompleted(game: Game) {
    getUiState(game).saveStateCompleted = true
    getSessionState(game).validSaveState = true
}

export function gameClearSaveStateCompleted(game: Game) {
    getUiState(game).saveStateCompleted = false
}

export function gameClearValidSaveState(game: Game) {
    getSessionState(game).validSaveState = false
}

export function gameSetSaveTimestamp(game: Game) {
    getSessionState(game).saveTimestamp = game._stub.getTimeStamp()
}

export function gameSetStateSlot(game: Game, slot: number) {
    const session = getSessionState(game)
    const nextSlot = Math.max(MIN_STATE_SLOT, Math.min(MAX_STATE_SLOT, slot))
    session.stateSlot = nextSlot
    return nextSlot
}

export function gameChangeStateSlot(game: Game, delta: number) {
    return gameSetStateSlot(game, getSessionState(game).stateSlot + delta)
}

export function gameSetCurrentLevel(game: Game, level: number) {
    getWorldState(game).currentLevel = level
}
