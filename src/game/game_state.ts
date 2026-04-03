import type { ActiveRoomCollisionSlotWindow, CollisionSlot, RoomCollisionGridPatchRestoreSlot } from '../core/intern'
import type { Game } from './game'

type StateGame = Record<string, unknown>

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
    const stateGame = game as unknown as StateGame
    const groupedState = stateGame['world'] as GameWorldStateShape | undefined
    return groupedState ?? {
        get currentLevel() { return stateGame['_currentLevel'] as number },
        set currentLevel(value: number) { stateGame['_currentLevel'] = value },
        get currentRoom() { return stateGame['_currentRoom'] as number },
        set currentRoom(value: number) { stateGame['_currentRoom'] = value },
        get currentIcon() { return stateGame['_currentIcon'] as number },
        set currentIcon(value: number) { stateGame['_currentIcon'] = value },
        get loadMap() { return stateGame['_loadMap'] as boolean },
        set loadMap(value: boolean) { stateGame['_loadMap'] = value },
        get printLevelCodeCounter() { return stateGame['_printLevelCodeCounter'] as number },
        set printLevelCodeCounter(value: number) { stateGame['_printLevelCodeCounter'] = value },
        get credits() { return stateGame['_credits'] as number },
        set credits(value: number) { stateGame['_credits'] = value },
        get blinkingConradCounter() { return stateGame['_blinkingConradCounter'] as number },
        set blinkingConradCounter(value: number) { stateGame['_blinkingConradCounter'] = value },
        get textToDisplay() { return stateGame['_textToDisplay'] as number },
        set textToDisplay(value: number) { stateGame['_textToDisplay'] = value },
        get eraseBackground() { return stateGame['_eraseBackground'] as boolean },
        set eraseBackground(value: boolean) { stateGame['_eraseBackground'] = value },
        get deathCutsceneCounter() { return stateGame['_deathCutsceneCounter'] as number },
        set deathCutsceneCounter(value: number) { stateGame['_deathCutsceneCounter'] = value },
    }
}

export function getGameUiState(game: Game): GameUiStateShape {
    const stateGame = game as unknown as StateGame
    const groupedState = stateGame['ui'] as GameUiStateShape | undefined
    return groupedState ?? {
        get skillLevel() { return stateGame['_skillLevel'] as number },
        set skillLevel(value: number) { stateGame['_skillLevel'] = value },
        get score() { return stateGame['_score'] as number },
        set score(value: number) { stateGame['_score'] = value },
        get currentRoomOverlayCounter() { return stateGame['_currentRoomOverlayCounter'] as number },
        set currentRoomOverlayCounter(value: number) { stateGame['_currentRoomOverlayCounter'] = value },
        get currentInventoryIconNum() { return stateGame['_currentInventoryIconNum'] as number },
        set currentInventoryIconNum(value: number) { stateGame['_currentInventoryIconNum'] = value },
        get saveStateCompleted() { return stateGame['_saveStateCompleted'] as boolean },
        set saveStateCompleted(value: boolean) { stateGame['_saveStateCompleted'] = value },
    }
}

export function getGameSessionState(game: Game): GameSessionStateShape {
    const stateGame = game as unknown as StateGame
    const groupedState = stateGame['session'] as GameSessionStateShape | undefined
    return groupedState ?? {
        get randSeed() { return stateGame['_randSeed'] as number },
        set randSeed(value: number) { stateGame['_randSeed'] = value },
        get endLoop() { return stateGame['_endLoop'] as boolean },
        set endLoop(value: boolean) { stateGame['_endLoop'] = value },
        get skipNextLevelCutscene() { return stateGame['_skipNextLevelCutscene'] as boolean },
        set skipNextLevelCutscene(value: boolean) { stateGame['_skipNextLevelCutscene'] = value },
        get startedFromLevelSelect() { return stateGame['_startedFromLevelSelect'] as boolean },
        set startedFromLevelSelect(value: boolean) { stateGame['_startedFromLevelSelect'] = value },
        get frameTimestamp() { return stateGame['_frameTimestamp'] as number },
        set frameTimestamp(value: number) { stateGame['_frameTimestamp'] = value },
        get autoSave() { return stateGame['_autoSave'] as boolean },
        set autoSave(value: boolean) { stateGame['_autoSave'] = value },
        get saveTimestamp() { return stateGame['_saveTimestamp'] as number },
        set saveTimestamp(value: number) { stateGame['_saveTimestamp'] = value },
        get stateSlot() { return stateGame['_stateSlot'] as number },
        set stateSlot(value: number) { stateGame['_stateSlot'] = value },
        get validSaveState() { return stateGame['_validSaveState'] as boolean },
        set validSaveState(value: boolean) { stateGame['_validSaveState'] = value },
    }
}

export function getGamePgeState(game: Game): GamePgeStateShape {
    const stateGame = game as unknown as StateGame
    const groupedState = stateGame['pge'] as GamePgeStateShape | undefined
    return groupedState ?? {
        get currentPgeRoom() { return stateGame['_currentPgeRoom'] as number },
        set currentPgeRoom(value: number) { stateGame['_currentPgeRoom'] = value },
        get currentPgeFacingIsMirrored() { return stateGame['_currentPgeFacingIsMirrored'] as boolean },
        set currentPgeFacingIsMirrored(value: boolean) { stateGame['_currentPgeFacingIsMirrored'] = value },
        get shouldProcessCurrentPgeObjectNode() { return stateGame['_shouldProcessCurrentPgeObjectNode'] as boolean },
        set shouldProcessCurrentPgeObjectNode(value: boolean) { stateGame['_shouldProcessCurrentPgeObjectNode'] = value },
        get currentPgeInputMask() { return stateGame['_currentPgeInputMask'] as number },
        set currentPgeInputMask(value: number) { stateGame['_currentPgeInputMask'] = value },
        get opcodeTempVar1() { return stateGame['_opcodeTempVar1'] as number },
        set opcodeTempVar1(value: number) { stateGame['_opcodeTempVar1'] = value },
        get opcodeTempVar2() { return stateGame['_opcodeTempVar2'] as number },
        set opcodeTempVar2(value: number) { stateGame['_opcodeTempVar2'] = value },
        get opcodeComparisonResult1() { return stateGame['_opcodeComparisonResult1'] as number },
        set opcodeComparisonResult1(value: number) { stateGame['_opcodeComparisonResult1'] = value },
        get opcodeComparisonResult2() { return stateGame['_opcodeComparisonResult2'] as number },
        set opcodeComparisonResult2(value: number) { stateGame['_opcodeComparisonResult2'] = value },
    }
}

export function getGameCollisionState(game: Game): GameCollisionStateShape {
    const stateGame = game as unknown as StateGame
    const groupedState = stateGame['collision'] as GameCollisionStateShape | undefined
    return groupedState ?? {
        get nextFreeDynamicPgeCollisionSlotPoolIndex() { return stateGame['_nextFreeDynamicPgeCollisionSlotPoolIndex'] as number },
        set nextFreeDynamicPgeCollisionSlotPoolIndex(value: number) { stateGame['_nextFreeDynamicPgeCollisionSlotPoolIndex'] = value },
        get dynamicPgeCollisionSlotsByPosition() { return stateGame['_dynamicPgeCollisionSlotsByPosition'] as Map<number, CollisionSlot[]> },
        set dynamicPgeCollisionSlotsByPosition(value: Map<number, CollisionSlot[]>) { stateGame['_dynamicPgeCollisionSlotsByPosition'] = value },
        get dynamicPgeCollisionSlotObjectPool() { return stateGame['_dynamicPgeCollisionSlotObjectPool'] as CollisionSlot[] },
        set dynamicPgeCollisionSlotObjectPool(value: CollisionSlot[]) { stateGame['_dynamicPgeCollisionSlotObjectPool'] = value },
        get roomCollisionGridPatchRestoreSlotPool() { return stateGame['_roomCollisionGridPatchRestoreSlotPool'] as RoomCollisionGridPatchRestoreSlot[] },
        set roomCollisionGridPatchRestoreSlotPool(value: RoomCollisionGridPatchRestoreSlot[]) { stateGame['_roomCollisionGridPatchRestoreSlotPool'] = value },
        get nextFreeRoomCollisionGridPatchRestoreSlot() { return stateGame['_nextFreeRoomCollisionGridPatchRestoreSlot'] as RoomCollisionGridPatchRestoreSlot },
        set nextFreeRoomCollisionGridPatchRestoreSlot(value: RoomCollisionGridPatchRestoreSlot) { stateGame['_nextFreeRoomCollisionGridPatchRestoreSlot'] = value },
        get activeRoomCollisionGridPatchRestoreSlots() { return stateGame['_activeRoomCollisionGridPatchRestoreSlots'] as RoomCollisionGridPatchRestoreSlot },
        set activeRoomCollisionGridPatchRestoreSlots(value: RoomCollisionGridPatchRestoreSlot) { stateGame['_activeRoomCollisionGridPatchRestoreSlots'] = value },
        get activeRoomCollisionSlotWindow() { return stateGame['_activeRoomCollisionSlotWindow'] as ActiveRoomCollisionSlotWindow },
        set activeRoomCollisionSlotWindow(value: ActiveRoomCollisionSlotWindow) { stateGame['_activeRoomCollisionSlotWindow'] = value },
        get activeCollisionLeftRoom() { return stateGame['_activeCollisionLeftRoom'] as number },
        set activeCollisionLeftRoom(value: number) { stateGame['_activeCollisionLeftRoom'] = value },
        get activeCollisionRightRoom() { return stateGame['_activeCollisionRightRoom'] as number },
        set activeCollisionRightRoom(value: number) { stateGame['_activeCollisionRightRoom'] = value },
        get currentPgeCollisionGridX() { return stateGame['_currentPgeCollisionGridX'] as number },
        set currentPgeCollisionGridX(value: number) { stateGame['_currentPgeCollisionGridX'] = value },
        get currentPgeCollisionGridY() { return stateGame['_currentPgeCollisionGridY'] as number },
        set currentPgeCollisionGridY(value: number) { stateGame['_currentPgeCollisionGridY'] = value },
    }
}
