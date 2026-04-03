import { Level, LivePGE, AnimBufferState, AnimBuffers,  Skill, PgeScriptEntry, PgeScriptNode, PendingPgeSignal, CollisionSlot, ActiveRoomCollisionSlotWindow, RoomCollisionGridPatchRestoreSlot, InitPGE, Color, READ_BE_UINT16, READ_LE_UINT32, READ_BE_UINT32, createLivePGE, createLivePgeRegistry, createActiveRoomCollisionSlotWindow, LivePgeRegistry, LoadedMonsterVisual } from '../core/intern'
import type { PgeOpcodeHandler } from '../core/intern'
import { Cutscene } from '../cutscene-players/cutscene'
import { Mp4CutscenePlayer } from '../cutscene-players/mp4-cutscene-player'
import { Mixer } from '../audio/mixer'
import { Resource, ObjectType, LocaleData } from '../resource/resource'
import { Video } from '../video/video'
import { DF_FASTMODE, DF_SETLIFE, DIR_DOWN, DIR_UP, SystemStub } from '../platform/systemstub_web'
import { FileSystem } from '../resource/fs'
import { Menu } from './menu'
import { GAMESCREEN_W, GAMESCREEN_H, CHAR_W } from '../core/game_constants'

import {
    scoreTable,
    _gameLevels,
    _pge_modKeysTable as modifierKeyMasksData,
    _protectionCodeData,
    _protectionPal,
    _protectionWordData,
} from '../core/staticres'
import {
    monsterListsByLevel
} from '../core/staticres-monsters'
import { File } from '../resource/file'
import { _pge_opcodeTable as opcodeHandlers } from './game_opcodes'
import {
    UINT8_MAX,
    kIngameSaveSlot,
    kRewindSize,
    kAutoSaveSlot,
    kAutoSaveIntervalMs,
    CT_ROOM_SIZE,
    CT_UP_ROOM,
    CT_DOWN_ROOM,
    CT_RIGHT_ROOM,
    CT_LEFT_ROOM,
    PGE_NUM,
} from '../core/game_constants'
import { gamePlaySound } from './game_audio'
import {
    gameDrawAnimBuffer,
    gameDrawCharacter,
    gameDrawIcon,
    gameDrawObject,
    gameDrawObjectFrame,
    gameDrawPge,
    gameDrawString
} from './game_draw'
import {
    gameLoadGameState,
    gameRun,
    gameSaveGameState,
} from './game_runtime'
import {
    gameClearStateRewind,
    gameInpUpdate,
    gameLoadLevelData,
    gameLoadLevelMap,
    gameLoadMonsterSprites,
    gameLoadState,
    gameResetGameState
} from './game_world'
import {
    gameAddPgeToInventory,
    gameFindInventoryItemBeforePge,
    gameLoadPgeForCurrentLevel,
    gameQueuePgeGroupSignal,
    gameRemovePgeFromInventory,
    gameReorderPgeInventory,
    gameResetPgeGroupState,
    gameSetCurrentInventoryPge,
    gameUpdatePgeInventory
} from './game_pge'
import {
    gameGetCurrentInventoryItemIndex,
    gameGetInventoryItemIndices,
    gameGetNextInventoryItemIndex
} from './game_inventory'
import type { GameServicesShape } from './game_services'

type col_Callback1 = (livePGE1: LivePGE, livePGE2: LivePGE, p1: number, p2: number, game: Game) => number
type col_Callback2 = (livePGE: LivePGE, p1: number, p2: number, p3: number, game: Game) => number

interface GameWorldState {
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

interface GameUiState {
    skillLevel: number
    score: number
    currentRoomOverlayCounter: number
    currentInventoryIconNum: number
    saveStateCompleted: boolean
}

interface GameSessionState {
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

interface GamePgeExecutionState {
    currentPgeRoom: number
    currentPgeFacingIsMirrored: boolean
    shouldProcessCurrentPgeObjectNode: boolean
    currentPgeInputMask: number
    opcodeTempVar1: number
    opcodeTempVar2: number
    opcodeComparisonResult1: number
    opcodeComparisonResult2: number
}

interface GameCollisionState {
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

interface GameRuntimeDataState {
    livePgesByIndex: LivePGE[]
    livePgeStore: LivePgeRegistry
    pendingSignalsByTargetPgeIndex: Map<number, PendingPgeSignal[]>
    inventoryItemIndicesByOwner: Map<number, number[]>
}

interface GameRenderDataState {
    animBuffer0State: AnimBufferState[]
    animBuffer1State: AnimBufferState[]
    animBuffer2State: AnimBufferState[]
    animBuffer3State: AnimBufferState[]
    animBuffers: AnimBuffers
}

class Game {
    static _gameLevels: Level[] = _gameLevels
    static _scoreTable: Uint16Array = scoreTable
    _opcodeHandlers: PgeOpcodeHandler[] = opcodeHandlers
    static _modifierKeyMasks: Uint8Array = modifierKeyMasksData
    static _protectionCodeData: Uint8Array = _protectionCodeData
    static _protectionWordData: Uint8Array = _protectionWordData
    static _protectionPal: Uint8Array = _protectionPal

    renderPromise: Promise<unknown>
    renderDone: { (): void; (value: unknown): void }

    _cut: Cutscene
    _menu: Menu
    _mix: Mixer
    _res: Resource
    _vid: Video
    _stub: SystemStub
    _fs: FileSystem
    _rewindBuffer: File[]
    _rewindPtr: number
    _rewindLen: number
    readonly services: GameServicesShape = {
        res: null,
        vid: null,
        mix: null,
        cut: null,
        stub: null,
        fs: null,
    }
    readonly world: GameWorldState = {
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
    readonly ui: GameUiState = {
        skillLevel: Skill.kSkillNormal,
        score: 0,
        currentRoomOverlayCounter: 0,
        currentInventoryIconNum: 0,
        saveStateCompleted: false,
    }
    readonly session: GameSessionState = {
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
    readonly pge: GamePgeExecutionState = {
        currentPgeRoom: 0,
        currentPgeFacingIsMirrored: false,
        shouldProcessCurrentPgeObjectNode: false,
        currentPgeInputMask: 0,
        opcodeTempVar1: 0,
        opcodeTempVar2: 0,
        opcodeComparisonResult1: 0,
        opcodeComparisonResult2: 0,
    }
    readonly collision: GameCollisionState = {
        nextFreeDynamicPgeCollisionSlotPoolIndex: 0,
        dynamicPgeCollisionSlotsByPosition: new Map(),
        dynamicPgeCollisionSlotObjectPool: new Array(PGE_NUM).fill(null).map(() => ({
            collision_grid_position_index: 0,
            pge: null,
            index: 0
        })),
        roomCollisionGridPatchRestoreSlotPool: new Array(PGE_NUM).fill(null).map(() => ({
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

    // Loaded monster visuals keep sprite data and palette data together.
    // Monsters currently still render through palette slot 5, but the map keeps
    // the visual data grouped by monster script-node index.
    _loadedMonsterVisualsByScriptNodeIndex: Map<number, LoadedMonsterVisual> = new Map()
    readonly renderData: GameRenderDataState = {
        animBuffer0State: new Array(41).fill(null).map(() => ({
        x: 0,
        y: 0,
        w: 0,
        h: 0,
        dataPtr: null,
        pge: null,
        paletteColorMaskOverride: -1,
    })),
        animBuffer1State: new Array(6).fill(null).map(() => ({
        x: 0,
        y: 0,
        w: 0,
        h: 0,
        dataPtr: null,
        pge: null,
        paletteColorMaskOverride: -1,
    })),
        animBuffer2State: new Array(42).fill(null).map(() => ({
        x: 0,
        y: 0,
        w: 0,
        h: 0,
        dataPtr: null,
        pge: null,
        paletteColorMaskOverride: -1,
    })),
        animBuffer3State: new Array(12).fill(null).map(() => ({
        x: 0,
        y: 0,
        w: 0,
        h: 0,
        dataPtr: null,
        pge: null,
        paletteColorMaskOverride: -1,
    })),
        animBuffers: new AnimBuffers(),
    }

    _inp_lastKeysHit: number
    _inp_lastKeysHitLeftRight: number
    _shouldPlayPgeAnimationSound: boolean

    readonly runtimeData: GameRuntimeDataState = {
        livePgesByIndex: new Array<LivePGE>(PGE_NUM).fill(null).map(() => createLivePGE()),
        livePgeStore: null,
        pendingSignalsByTargetPgeIndex: new Map(),
        inventoryItemIndicesByOwner: new Map(),
    }
    renders: number
    debugStartFrame: number

    constructor(stub: SystemStub, fs: FileSystem, savePath: string, level: number, autoSave: boolean) {
        this.services.res = new Resource(fs) // there is only one resource class for the whole game
        this.services.vid = new Video(this.services.res, stub)
        this.services.cut = new Cutscene(this.services.res, stub, this.services.vid)
        this._menu = new Menu(this.services.res, stub, this.services.vid)
        this.services.mix = new Mixer(fs, stub)
        this.services.stub = stub
        this.services.fs = fs
        this._res = this.services.res
        this._vid = this.services.vid
        this._cut = this.services.cut
        this._mix = this.services.mix
        this._stub = this.services.stub
        this._fs = this.services.fs
        this.runtimeData.livePgeStore = createLivePgeRegistry(this.runtimeData.livePgesByIndex)
        this.session.stateSlot = 1
        this.ui.skillLevel = this._menu._skill = Skill.kSkillNormal
        this.world.currentLevel = this._menu._level = level
        this.world.credits = 0
        this.session.autoSave = autoSave
        this.ui.currentRoomOverlayCounter = 0
        this._rewindPtr = -1
        this._rewindLen = 0
        this.session.skipNextLevelCutscene = false
        this.session.startedFromLevelSelect = false
    }

    loadPgeForCurrentLevel(idx: number, currentRoom: number) {
        return gameLoadPgeForCurrentLevel(this, idx, currentRoom)
    }

    async playMpegCutscene(path: string) {
        const player = new Mp4CutscenePlayer(this.services.stub, this.services.fs)
        return player.play(path)
    }

    // run -> gameRunLoop -> gameMainLoop
    async run() {
        return gameRun(this)
    }

    reorderPgeInventory(pge: LivePGE) {
        return gameReorderPgeInventory(this, pge)
    }

    updatePgeInventory(pge1: LivePGE, pge2: LivePGE) {
        return gameUpdatePgeInventory(this, pge1, pge2)
    }

    queuePgeGroupSignal(senderPgeIndex: number, targetPgeIndex: number, signalId: number) {
        return gameQueuePgeGroupSignal(this, senderPgeIndex, targetPgeIndex, signalId)
    }

    playSound(num: number, softVol: number) {
        return gamePlaySound(this, num, softVol)
    }

    drawIcon(iconNum: number, x: number, y: number, colMask: number) {
        return gameDrawIcon(this, iconNum, x, y, colMask)
    }

    printSaveStateCompleted() {
        if (this.ui.saveStateCompleted) {
            const str = this._res.getMenuString(LocaleData.Id.LI_05_COMPLETED)
            this._vid.drawString(str, ((176 - str.length * CHAR_W) / 2) >> 0, 34, 0xE6)
        }
    }

    saveGameState(slot: number) {
        return gameSaveGameState(this, slot)
    }

    loadGameState(slot: number) {
        return gameLoadGameState(this, slot)
    }

    static getLineLength(str: Uint8Array) {
        let len = 0
        let index = 0
        while (str[index] && str[index] !== 0xB && str[index] !== 0xA) {
            ++index
            ++len
        }
        return len
    }

    loadState(f: File) {
        return gameLoadState(this, f)
    }

    async inp_update() {
        return gameInpUpdate(this)
    }

    drawString(p: Uint8Array, x: number, y: number, color: number, hcenter: boolean) {
        return gameDrawString(this, p, x, y, color, hcenter)
    }

    async drawAnimBuffer(stateNum: number, state: AnimBufferState[]) {
        return gameDrawAnimBuffer(this, stateNum, state)
    }


    drawPge(state: AnimBufferState) {
        return gameDrawPge(this, state)
    }
    
    drawObject(dataPtr: Uint8Array, x: number, y: number, flags: number, paletteColorMaskOverride: number = -1) {
        return gameDrawObject(this, dataPtr, x, y, flags, paletteColorMaskOverride)
    }
    
    drawObjectFrame(bankDataPtr: Uint8Array, dataPtr: Uint8Array, x: number, y: number, flags: number, paletteColorMaskOverride: number = -1) {
        return gameDrawObjectFrame(this, bankDataPtr, dataPtr, x, y, flags, paletteColorMaskOverride)
    }
    
    drawCharacter(dataPtr: Uint8Array, pos_x: number, pos_y: number, a: number, b: number, flags: number, paletteColorMaskOverride: number = -1) {
        return gameDrawCharacter(this, dataPtr, pos_x, pos_y, a, b, flags, paletteColorMaskOverride)
    }

    findInventoryItemBeforePge(pge: LivePGE, last_pge: LivePGE) {
        return gameFindInventoryItemBeforePge(this, pge, last_pge)
    }

    getInventoryItemIndices(ownerPge: LivePGE) {
        return gameGetInventoryItemIndices(this, ownerPge)
    }

    getCurrentInventoryItemIndex(ownerPge: LivePGE) {
        return gameGetCurrentInventoryItemIndex(this, ownerPge)
    }

    getNextInventoryItemIndex(ownerPge: LivePGE, inventoryItemIndex: number) {
        return gameGetNextInventoryItemIndex(this, ownerPge, inventoryItemIndex)
    }

    removePgeFromInventory(pge1: LivePGE, pge2: LivePGE, pge3: LivePGE) {
        return gameRemovePgeFromInventory(this, pge1, pge2, pge3)
    }

    addPgeToInventory(pge1: LivePGE, pge2: LivePGE, pge3: LivePGE) {
        return gameAddPgeToInventory(this, pge1, pge2, pge3)
    }

    resetGameState() {
        return gameResetGameState(this)
    }

    async loadMonsterSprites(pge: LivePGE, currentRoom:number) {
        return gameLoadMonsterSprites(this, pge, currentRoom)
    }

    async loadLevelMap(currentRoom:number) {
        return gameLoadLevelMap(this, currentRoom)
    }

    async loadLevelData(): Promise<number> {
        return gameLoadLevelData(this)
    }

    resetPgeGroups() {
        return gameResetPgeGroupState(this)
    }

    clearStateRewind() {
        return gameClearStateRewind(this)
    }

}

export { Game, CT_UP_ROOM, CT_DOWN_ROOM, CT_RIGHT_ROOM, CT_LEFT_ROOM, kIngameSaveSlot, kAutoSaveSlot, kAutoSaveIntervalMs, kRewindSize }
export type { col_Callback1, col_Callback2 }
