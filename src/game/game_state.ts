import type { ActiveRoomCollisionSlotWindow, CollisionSlot, LoadedMonsterVisual, RoomCollisionGridPatchRestoreSlot } from '../core/intern'
import type { PgeOpcodeHandler } from '../core/intern'
import type { Game } from './game'

export type GameWorldState = {
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

export type GameUiState = {
    skillLevel: number
    score: number
    currentRoomOverlayCounter: number
    currentInventoryIconNum: number
    saveStateCompleted: boolean
}

export type GameSessionState = {
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

export type GamePgeExecutionState = {
    currentPgeRoom: number
    currentPgeFacingIsMirrored: boolean
    shouldProcessCurrentPgeObjectNode: boolean
    currentPgeInputMask: number
    gunVar: number
    opcodeTempVar1: number
    opcodeTempVar2: number
    opcodeComparisonResult1: number
    opcodeComparisonResult2: number
}

export type GameCollisionState = {
    nextFreeDynamicPgeCollisionSlotPoolIndex: number
    dynamicPgeCollisionSlotsByPosition: Map<number, CollisionSlot[]>
    dynamicPgeCollisionSlotObjectPool: CollisionSlot[]
    roomCollisionGridPatchRestoreSlotPool: RoomCollisionGridPatchRestoreSlot[]
    nextFreeRoomCollisionGridPatchRestoreSlot: RoomCollisionGridPatchRestoreSlot
    activeRoomCollisionGridPatchRestoreSlots: RoomCollisionGridPatchRestoreSlot
    activeRoomCollisionSlotWindow: ActiveRoomCollisionSlotWindow
    activeCollisionLeftRoom: number
    activeCollisionRightRoom: number
    currentPgeCollisionGridX: number
    currentPgeCollisionGridY: number
}

export type GameTransientState = {
    lastInputMask: number
    lastLeftRightInputMask: number
    shouldPlayPgeAnimationSound: boolean
}

export type GameRewindState = {
    buffer: unknown[]
    ptr: number
    len: number
}

export type GameMonsterVisualRegistry = Map<number, LoadedMonsterVisual>

export type GameOpcodeHandlers = PgeOpcodeHandler[]

export function getGameWorldState(game: Game): GameWorldState {
    return game.world
}

export function getGameUiState(game: Game): GameUiState {
    return game.ui
}

export function getGameSessionState(game: Game): GameSessionState {
    return game.session
}

export function getGamePgeState(game: Game): GamePgeExecutionState {
    return game.pge
}

export function getGameCollisionState(game: Game): GameCollisionState {
    return game.collision
}

export function getGameTransientState(game: Game): GameTransientState {
    return game.transient
}

export function getGameRewindState(game: Game): GameRewindState {
    return game.rewind
}

export function getGameMonsterVisualRegistry(game: Game): GameMonsterVisualRegistry {
    return game.monsterVisualsByScriptNodeIndex
}

export function getGameOpcodeHandlers(game: Game): GameOpcodeHandlers {
    return game.opcodeHandlers
}
