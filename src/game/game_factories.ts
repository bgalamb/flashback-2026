import { AnimBuffers, Skill, createActiveRoomCollisionSlotWindow, createLivePGE, createLivePgeRegistry } from '../core/intern'
import type { CollisionSlot, LoadedMonsterVisual, RoomCollisionGridPatchRestoreSlot } from '../core/intern'
import { pgeNum } from '../core/game_constants'
import type {
    GameCollisionState,
    GamePgeExecutionState,
    GameRewindState,
    GameSessionState,
    GameTransientState,
    GameUiState,
    GameWorldState,
} from './game_state'
import type { RenderDataState, RuntimeRegistryState } from './game_runtime_data'

const createAnimBufferState = (count: number) =>
    new Array(count).fill(null).map(() => ({
        x: 0,
        y: 0,
        w: 0,
        h: 0,
        dataPtr: null,
        pge: null,
        paletteColorMaskOverride: -1,
    }))

const createDynamicCollisionSlot = (): CollisionSlot => ({
    collisionGridPositionIndex: 0,
    pge: null,
    index: 0,
})

const createRoomCollisionPatchRestoreSlot = (): RoomCollisionGridPatchRestoreSlot => ({
    nextPatchedRegionRestoreSlot: null,
    patchedGridDataView: null,
    patchedCellCount: 0,
    originalGridCellValues: new Uint8Array(0x10),
})

export function createGameWorldState(): GameWorldState {
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

export function createGameUiState(): GameUiState {
    return {
        skillLevel: Skill.kSkillNormal,
        score: 0,
        currentRoomOverlayCounter: 0,
        currentInventoryIconNum: 0,
        saveStateCompleted: false,
    }
}

export function createGameSessionState(): GameSessionState {
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

export function createGamePgeExecutionState(): GamePgeExecutionState {
    return {
        currentPgeRoom: 0,
        currentPgeFacingIsMirrored: false,
        shouldProcessCurrentPgeObjectNode: false,
        currentPgeInputMask: 0,
        gunVar: 0,
        opcodeTempVar1: 0,
        opcodeTempVar2: 0,
        opcodeComparisonResult1: 0,
        opcodeComparisonResult2: 0,
    }
}

export function createGameCollisionState(): GameCollisionState {
    return {
        nextFreeDynamicPgeCollisionSlotPoolIndex: 0,
        dynamicPgeCollisionSlotsByPosition: new Map(),
        dynamicPgeCollisionSlotObjectPool: new Array(pgeNum).fill(null).map(createDynamicCollisionSlot),
        roomCollisionGridPatchRestoreSlotPool: new Array(pgeNum).fill(null).map(createRoomCollisionPatchRestoreSlot),
        nextFreeRoomCollisionGridPatchRestoreSlot: null,
        activeRoomCollisionGridPatchRestoreSlots: null,
        activeRoomCollisionSlotWindow: createActiveRoomCollisionSlotWindow(),
        activeCollisionLeftRoom: 0,
        activeCollisionRightRoom: 0,
        currentPgeCollisionGridX: 0,
        currentPgeCollisionGridY: 0,
    }
}

export function createMonsterVisualRegistry(): Map<number, LoadedMonsterVisual> {
    return new Map()
}

export function createRenderDataState(): RenderDataState {
    return {
        animBuffer0State: createAnimBufferState(41),
        animBuffer1State: createAnimBufferState(6),
        animBuffer2State: createAnimBufferState(42),
        animBuffer3State: createAnimBufferState(12),
        animBuffers: new AnimBuffers(),
    }
}

export function createRuntimeRegistryState(): RuntimeRegistryState {
    const livePgesByIndex = new Array(pgeNum).fill(null).map(() => createLivePGE())
    return {
        livePgesByIndex,
        livePgeStore: createLivePgeRegistry(livePgesByIndex),
        pendingSignalsByTargetPgeIndex: new Map(),
        inventoryItemIndicesByOwner: new Map(),
    }
}

export function createGameTransientState(): GameTransientState {
    return {
        lastInputMask: 0,
        lastLeftRightInputMask: 0,
        shouldPlayPgeAnimationSound: false,
    }
}

export function createGameRewindState(): GameRewindState {
    return {
        buffer: [],
        ptr: -1,
        len: 0,
    }
}
