import type { ActiveRoomCollisionSlotWindow, CollisionSlot, RoomCollisionGridPatchRestoreSlot } from '../core/intern'
import type { Game } from './game'

export type GameWorldStateShape = {
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

export type GameUiStateShape = {
    skillLevel: number
    score: number
    currentRoomOverlayCounter: number
    currentInventoryIconNum: number
    saveStateCompleted: boolean
}

export type GameSessionStateShape = {
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

export type GamePgeStateShape = {
    currentPgeRoom: number
    currentPgeFacingIsMirrored: boolean
    shouldProcessCurrentPgeObjectNode: boolean
    currentPgeInputMask: number
    opcodeTempVar1: number
    opcodeTempVar2: number
    opcodeComparisonResult1: number
    opcodeComparisonResult2: number
}

export type GameCollisionStateShape = {
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

export function getGameWorldState(game: Game): GameWorldStateShape {
    return game.world
}

export function getGameUiState(game: Game): GameUiStateShape {
    return game.ui
}

export function getGameSessionState(game: Game): GameSessionStateShape {
    return game.session
}

export function getGamePgeState(game: Game): GamePgeStateShape {
    return game.pge
}

export function getGameCollisionState(game: Game): GameCollisionStateShape {
    return game.collision
}
