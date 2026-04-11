import { Skill, createActiveRoomCollisionSlotWindow } from '../core/intern'
import type { ActiveRoomCollisionSlotWindow, CollisionSlot, RoomCollisionGridPatchRestoreSlot } from '../core/intern'
import { pgeNum } from '../core/game_constants'
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

export function createInitialGameWorldState(): GameWorldStateShape {
    return {
        currentLevel: 0,
        currentRoom: 0,
        currentIcon: 0,
        loadMap: false,
        printLevelCodeCounter: 0,
        credits: 0,
        blinkingConradCounter: 0,
        textToDisplay: 0,
        eraseBackground: false,
        deathCutsceneCounter: 0,
    }
}

export function createInitialGameUiState(): GameUiStateShape {
    return {
        skillLevel: Skill.kSkillNormal,
        score: 0,
        currentRoomOverlayCounter: 0,
        currentInventoryIconNum: 0,
        saveStateCompleted: false,
    }
}

export function createInitialGameSessionState(): GameSessionStateShape {
    return {
        randSeed: 0,
        endLoop: false,
        skipNextLevelCutscene: false,
        startedFromLevelSelect: false,
        frameTimestamp: 0,
        autoSave: false,
        saveTimestamp: 0,
        stateSlot: 1,
        validSaveState: false,
    }
}

export function createInitialGamePgeState(): GamePgeStateShape {
    return {
        currentPgeRoom: 0,
        currentPgeFacingIsMirrored: false,
        shouldProcessCurrentPgeObjectNode: false,
        currentPgeInputMask: 0,
        opcodeTempVar1: 0,
        opcodeTempVar2: 0,
        opcodeComparisonResult1: 0,
        opcodeComparisonResult2: 0,
    }
}

export function createInitialGameCollisionState(): GameCollisionStateShape {
    return {
        nextFreeDynamicPgeCollisionSlotPoolIndex: 0,
        dynamicPgeCollisionSlotsByPosition: new Map(),
        dynamicPgeCollisionSlotObjectPool: new Array(pgeNum).fill(null).map(() => ({
            collisionGridPositionIndex: 0,
            pge: null,
            index: 0
        })),
        roomCollisionGridPatchRestoreSlotPool: new Array(pgeNum).fill(null).map(() => ({
            nextPatchedRegionRestoreSlot: null,
            patchedGridDataView: null,
            patchedCellCount: 0,
            originalGridCellValues: new Uint8Array(0x10)
        })),
        nextFreeRoomCollisionGridPatchRestoreSlot: null,
        activeRoomCollisionGridPatchRestoreSlots: null,
        activeRoomCollisionSlotWindow: createActiveRoomCollisionSlotWindow(),
        activeCollisionLeftRoom: 0,
        activeCollisionRightRoom: 0,
        currentPgeCollisionGridX: 0,
        currentPgeCollisionGridY: 0,
    }
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
