import { Level, LivePGE, AnimBufferState, AnimBuffers,  Skill, PgeScriptEntry, PgeScriptNode, PendingPgeSignal, CollisionSlot, ActiveRoomCollisionSlotWindow, RoomCollisionGridPatchRestoreSlot, InitPGE, Color, READ_BE_UINT16, READ_LE_UINT32, READ_BE_UINT32, createLivePGE, createLivePgeRegistry, createActiveRoomCollisionSlotWindow, LivePgeRegistry, LoadedMonsterVisual } from './intern'
import type { PgeOpcodeHandler } from './intern'
import { Cutscene } from './cutscene-players/cutscene'
import { Mp4CutscenePlayer } from './cutscene-players/mp4-cutscene-player'
import { Mixer } from './mixer'
import { Resource, ObjectType, LocaleData } from './resource/resource'
import { Video } from './video'
import { DF_FASTMODE, DF_SETLIFE, DIR_DOWN, DIR_UP, SystemStub } from './systemstub_web'
import { FileSystem } from './resource/fs'
import { Menu } from './menu'
import { GAMESCREEN_W, GAMESCREEN_H, CHAR_W } from './game_constants'

import {
    scoreTable,
    _gameLevels,
    _pge_modKeysTable as modifierKeyMasksData,
    _protectionCodeData,
    _protectionPal,
    _protectionWordData,
} from './staticres'
import {
    monsterListsByLevel
} from './staticres-monsters'
import { File } from './resource/file'
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
} from './game_constants'
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
    gameGetRandomNumber,
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
    gameFindInventoryItemByObjectId,
    gameGetCurrentInventoryItemIndex,
    gameGetInventoryItemIndices,
    gameGetNextInventoryItemIndex
} from './game_inventory'

type col_Callback1 = (livePGE1: LivePGE, livePGE2: LivePGE, p1: number, p2: number, game: Game) => number
type col_Callback2 = (livePGE: LivePGE, p1: number, p2: number, p3: number, game: Game) => number

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

    _currentLevel: number
    _skillLevel: number
    _score: number
    _credits: number
    _currentRoom: number
    _currentIcon: number
    _loadMap: boolean
    _printLevelCodeCounter: number
    _randSeed: number
    _currentInventoryIconNum: number
    // Loaded monster visuals keep sprite data and palette data together.
    // Monsters currently still render through palette slot 5, but the map keeps
    // the visual data grouped by monster script-node index.
    _loadedMonsterVisualsByScriptNodeIndex: Map<number, LoadedMonsterVisual> = new Map()
    _blinkingConradCounter: number
    _textToDisplay: number
    _eraseBackground: boolean
    _animBuffer0State: AnimBufferState[] = new Array(41).fill(null).map(() => ({
        x: 0,
        y: 0,
        w: 0,
        h: 0,
        dataPtr: null,
        pge: null,
        paletteColorMaskOverride: -1,
    }))
    _animBuffer1State: AnimBufferState[]  = new Array(6).fill(null).map(() => ({
        x: 0,
        y: 0,
        w: 0,
        h: 0,
        dataPtr: null,
        pge: null,
        paletteColorMaskOverride: -1,
    }))
    _animBuffer2State: AnimBufferState[]  = new Array(42).fill(null).map(() => ({
        x: 0,
        y: 0,
        w: 0,
        h: 0,
        dataPtr: null,
        pge: null,
        paletteColorMaskOverride: -1,
    }))
    _animBuffer3State: AnimBufferState[] = new Array(12).fill(null).map(() => ({
        x: 0,
        y: 0,
        w: 0,
        h: 0,
        dataPtr: null,
        pge: null,
        paletteColorMaskOverride: -1,
    }))
    _animBuffers: AnimBuffers = new AnimBuffers()
    _deathCutsceneCounter: number
    _saveStateCompleted: boolean
    _endLoop: boolean
    _skipNextLevelCutscene: boolean
    _startedFromLevelSelect: boolean
    _frameTimestamp: number
    _autoSave: boolean
    _saveTimestamp: number

    _stateSlot: number
    _validSaveState: boolean

    _inp_lastKeysHit: number
    _inp_lastKeysHitLeftRight: number
    _shouldPlayPgeAnimationSound: boolean

    _livePgesByIndex = new Array<LivePGE>(PGE_NUM).fill(null).map(() => createLivePGE())
    _livePgeStore: LivePgeRegistry = createLivePgeRegistry(this._livePgesByIndex)
    _pendingSignalsByTargetPgeIndex: Map<number, PendingPgeSignal[]> = new Map()
    _inventoryItemIndicesByOwner: Map<number, number[]> = new Map()

	_currentPgeRoom: number
	_currentPgeFacingIsMirrored: boolean
	_shouldProcessCurrentPgeObjectNode: boolean
	_currentPgeInputMask: number
	_opcodeTempVar1: number
	_opcodeTempVar2: number
	_opcodeComparisonResult1: number
	_opcodeComparisonResult2: number

    _nextFreeDynamicPgeCollisionSlotPoolIndex = 0
    _dynamicPgeCollisionSlotsByPosition: Map<number, CollisionSlot[]> = new Map()
    _dynamicPgeCollisionSlotObjectPool: CollisionSlot[] = new Array(PGE_NUM).fill(null).map(() => ({
        collision_grid_position_index: 0,
        pge: null,
        index: 0      
    }))
	_roomCollisionGridPatchRestoreSlotPool: RoomCollisionGridPatchRestoreSlot[] = new Array(PGE_NUM).fill(null).map(() => ({
        nextPatchedRegionRestoreSlot: null,
        patchedGridDataView: null,
        patchedCellCount: 0,
        originalGridCellValues: new Uint8Array(0x10)
    }))
	_nextFreeRoomCollisionGridPatchRestoreSlot: RoomCollisionGridPatchRestoreSlot
	_activeRoomCollisionGridPatchRestoreSlots: RoomCollisionGridPatchRestoreSlot
    _activeRoomCollisionSlotWindow: ActiveRoomCollisionSlotWindow = createActiveRoomCollisionSlotWindow()

    _activeCollisionLeftRoom: number
	_activeCollisionRightRoom: number
	_currentPgeCollisionGridX: number
	_currentPgeCollisionGridY: number
    renders: number
    debugStartFrame: number

    constructor(stub: SystemStub, fs: FileSystem, savePath: string, level: number, autoSave: boolean) {
        this._res = new Resource(fs) // there is only one resource class for the whole game
        this._vid = new Video(this._res, stub)
        this._cut = new Cutscene(this._res, stub, this._vid)
        this._menu = new Menu(this._res, stub, this._vid)
        this._mix = new Mixer(fs, stub)
        this._stub = stub
        this._fs = fs
        this._stateSlot = 1
        this._skillLevel = this._menu._skill = Skill.kSkillNormal
        this._currentLevel = this._menu._level = level
        this._credits = 0
        this._autoSave = autoSave
        this._rewindPtr = -1
        this._rewindLen = 0
        this._skipNextLevelCutscene = false
        this._startedFromLevelSelect = false
    }

    private setCurrentRoom(room: number) {
        this._currentRoom = room
    }

    loadPgeForCurrentLevel(idx: number, currentRoom: number) {
        return gameLoadPgeForCurrentLevel(this, idx, currentRoom)
    }

    async playMpegCutscene(path: string) {
        const player = new Mp4CutscenePlayer(this._stub, this._fs)
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
        if (this._saveStateCompleted) {
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

    drawString(p: Uint8Array, x: number, y: number, color: number, hcenter: boolean) {
        return gameDrawString(this, p, x, y, color, hcenter)
    }

    async drawAnimBuffer(stateNum: number, state: AnimBufferState[]) {
        return gameDrawAnimBuffer(this, stateNum, state)
    }


    drawPge(state: AnimBufferState) {
        return gameDrawPge(this, state)
    }
    
    drawObject(dataPtr: Uint8Array, x: number, y: number, flags: number) {
        return gameDrawObject(this, dataPtr, x, y, flags)
    }
    
    drawObjectFrame(bankDataPtr: Uint8Array, dataPtr: Uint8Array, x: number, y: number, flags: number) {
        return gameDrawObjectFrame(this, bankDataPtr, dataPtr, x, y, flags)
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

    findInventoryItemByObjectId(ownerPge: LivePGE, objectId: number) {
        return gameFindInventoryItemByObjectId(this, ownerPge, objectId)
    }

    
    removePgeFromInventory(pge1: LivePGE, pge2: LivePGE, pge3: LivePGE) {
        return gameRemovePgeFromInventory(this, pge1, pge2, pge3)
    }

    addPgeToInventory(pge1: LivePGE, pge2: LivePGE, pge3: LivePGE) {
        return gameAddPgeToInventory(this, pge1, pge2, pge3)
    }

    setCurrentInventoryPge(pge: LivePGE) {
        return gameSetCurrentInventoryPge(this, pge)
    }

    getRandomNumber() {
        return gameGetRandomNumber(this)
    }

    async inp_update() {
        return gameInpUpdate(this)
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
