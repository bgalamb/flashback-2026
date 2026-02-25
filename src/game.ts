import { Level, LivePGE, AnimBufferState, AnimBuffers,  Skill, Obj, ObjectNode, GroupPGE, CollisionSlot, CollisionSlot2, InitPGE, Color, READ_BE_UINT16, READ_LE_UINT32, READ_BE_UINT32, CreatePGE, createLivePGE } from './intern'
import type { pge_OpcodeProc } from './intern'
import { Cutscene } from './cutscene'
import { Mixer } from './mixer'
import { Resource, ObjectType, LocaleData } from './resource'
import { Video } from './video'
import { DF_FASTMODE, DF_SETLIFE, DIR_DOWN, DIR_UP, SystemStub } from './systemstub_web'
import { FileSystem } from './fs'
import { Menu } from './menu'
import { GAMESCREEN_W, GAMESCREEN_H, CHAR_W } from './game_constants'

import {
    scoreTable,
    _gameLevels,
    _pge_modKeysTable,
    _protectionCodeData,
    _protectionPal,
    _protectionWordData,
} from './staticres'
import {
    monsterListsByLevel
} from './staticres-monsters'
import { File } from './file'
import { _pge_opcodeTable } from './game_opcodes'
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
    gameColClearState,
    gameColFindCurrentCollidingObject,
    gameColFindPiege,
    gameColFindSlot,
    gameColGetGridData,
    gameColGetGridPos,
    gameColPreparePiegeState,
    gameColPrepareRoomState
} from './game_collision'
import {
    gameDrawAnimBuffer,
    gameDrawAnims,
    gameDrawCharacter,
    gameDrawCurrentInventoryItem,
    gameDrawIcon,
    gameDrawLevelTexts,
    gameDrawObject,
    gameDrawObjectFrame,
    gameDrawPiege,
    gameDrawStoryTexts,
    gameDrawString
} from './game_draw'
import {
    gameHandleConfigPanel,
    gameHandleInventory,
} from './game_inventory'
import {
    gameHandleContinueAbort,
    gameInpHandleSpecialKeys,
    gameLoadGameState,
    gameLoadStateRewind,
    gameMainLoop,
    gamePlayCutscene,
    gameRun,
    gameRunLoop,
    gameSaveGameState,
    gameShowFinalScore,
    gameUpdateTiming
} from './game_runtime'
import {
    gameChangeLevel,
    gameClearStateRewind,
    gameGetRandomNumber,
    gameHasLevelMap,
    gameInpUpdate,
    gameLoadLevelData,
    gameLoadLevelMap,
    gameLoadMonsterSprites,
    gameLoadState,
    gamePrepareAnimationsInRooms,
    gameResetGameState
} from './game_world'
import {
    gamePgeAddToCurrentRoomList,
    gamePgeExecute,
    gamePgeGetInventoryItemBefore,
    gamePgeGetUserLeftRightUpDownKeyInput,
    gamePgeInnerProcess,
    gamePgeLoadForCurrentLevel,
    gamePgePlayAnimSound,
    gamePgePrepare,
    gamePgeProcessOBJ,
    gamePgeRemoveFromGroup,
    gamePgeRemoveFromInventory,
    gamePgeReorderInventory,
    gamePgeResetGroups,
    gamePgeSetCurrentInventoryObject,
    gamePgeSetupAnim,
    gamePgeSetupDefaultAnim,
    gamePgeSetupNextAnimFrame,
    gamePgeSetupOtherPieges,
    gamePgeUpdateGroup,
    gamePgeUpdateInventory,
    gamePgeAddToInventory
} from './game_pge'

type col_Callback1 = (livePGE1: LivePGE, livePGE2: LivePGE, p1: number, p2: number, game: Game) => number
type col_Callback2 = (livePGE: LivePGE, p1: number, p2: number, p3: number, game: Game) => number

class Game {
    static _gameLevels: Level[] = _gameLevels
    static _scoreTable: Uint16Array = scoreTable
    _pge_opcodeTable: pge_OpcodeProc[] = _pge_opcodeTable
    static _pge_modKeysTable: Uint8Array = _pge_modKeysTable
    static _protectionCodeData: Uint8Array = _protectionCodeData
    static _protectionWordData: Uint8Array = _protectionWordData
    static _protectionPal: Uint8Array = _protectionPal

    renderPromise
    renderDone


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
    _currentRoom: number
    _currentIcon: number
    _loadMap: boolean
    _printLevelCodeCounter: number
    _randSeed: number
    _currentInventoryIconNum: number
    _curMonsterFrame: number
    _curMonsterNum: number
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
    }))
    _animBuffer1State: AnimBufferState[]  = new Array(6).fill(null).map(() => ({
        x: 0,
        y: 0,
        w: 0,
        h: 0,
        dataPtr: null,
        pge: null,
    }))
    _animBuffer2State: AnimBufferState[]  = new Array(42).fill(null).map(() => ({
        x: 0,
        y: 0,
        w: 0,
        h: 0,
        dataPtr: null,
        pge: null,
    }))
    _animBuffer3State: AnimBufferState[] = new Array(12).fill(null).map(() => ({
        x: 0,
        y: 0,
        w: 0,
        h: 0,
        dataPtr: null,
        pge: null,
    }))
    _animBuffers: AnimBuffers = new AnimBuffers()
    _deathCutsceneCounter: number
    _saveStateCompleted: boolean
    _endLoop: boolean
    _frameTimestamp: number
    _autoSave: boolean
    _saveTimestamp: number

    _stateSlot: number
    _validSaveState: boolean

    _inp_lastKeysHit: number
    _inp_lastKeysHitLeftRight: number
    _pge_playAnimSound: boolean

    // This is the table where the PGEs are loaded from the PGE file
    _pgeLiveAll = new Array<LivePGE>(PGE_NUM).fill(null).map(() => createLivePGE())
    // This is a filtered table where PGEs are (re)arranged by roomLocation
    // the PGE that is found in the array will have a link to the next PGE in the room, and that PGe to the next
    // it's a linked list
    _pge_liveLinkedListTableByRoomAllRooms = new Array<LivePGE>(PGE_NUM)


    // This is a filtered table that contains PGEs at their original indexes only when they are in current room.
    _pge_liveFlatTableFilteredByRoomCurrentRoomOnly = new Array<LivePGE>(PGE_NUM)
    _pge_groups = new Array<GroupPGE>(PGE_NUM).fill(null).map(() => ({
        next_entry: null,
        index: 0,
        group_id: 0,
    }))
    _pge_groupsTable = new Array<GroupPGE>(PGE_NUM)
    _pge_nextFreeGroup: GroupPGE

	_pge_currentPiegeRoom: number
	_pge_currentPiegeFacingDir: boolean // (false == left)
	_pge_processOBJ: boolean
	_pge_inpKeysMask: number
	_pge_opTempVar1: number
	_pge_opTempVar2: number
	_pge_compareVar1: number
	_pge_compareVar2: number

    _col_collisions_slots_counter: number
    _col_curSlot: CollisionSlot
    _col_slotsTable: CollisionSlot[] = new Array(PGE_NUM)
    _col_slots: CollisionSlot[] = new Array(PGE_NUM).fill(null).map(() => ({
        ct_pos: 0,
        prev_slot: null,
        pge: null,
        index: 0      
    }))
	_col_slots2: CollisionSlot2[] = new Array(PGE_NUM).fill(null).map(() => ({
        next_slot: null,
        unk2: null,
        data_size: 0,
        data_buf: new Uint8Array(0x10)
    }))
	_col_slots2Cur: CollisionSlot2
	_col_slots2Next: CollisionSlot2
    _col_activeCollisionSlots: Uint8Array = new Uint8Array(0x30 * 3)



    _col_currentLeftRoom: number
	_col_currentRightRoom: number
	_col_currentPiegeGridPosX: number
	_col_currentPiegeGridPosY: number
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
        this._autoSave = autoSave
        this._rewindPtr = -1
        this._rewindLen = 0
    }

    private setCurrentRoom(room: number) {
        this._currentRoom = room
    }

    pge_loadForCurrentLevel(idx: number, currentRoom: number) {
        return gamePgeLoadForCurrentLevel(this, idx, currentRoom)
    }

    pge_setupDefaultAnim(pge: LivePGE) {
        return gamePgeSetupDefaultAnim(this, pge)
    }

    async playCutscene(id: number = -1) {
        return gamePlayCutscene(this, id)
    }

    async runLoop() {
        return gameRunLoop(this)
    }

    // run -> runLoop -> mainloop
    async run() {
        return gameRun(this)
    }

    async showFinalScore() {
        return gameShowFinalScore(this)
    }

    pge_removeFromGroup(idx: number) {
        return gamePgeRemoveFromGroup(this, idx)
    }

    pge_execute(live_pge: LivePGE, init_pge: InitPGE, obj: Obj) {
        return gamePgeExecute(this, live_pge, init_pge, obj)
    }

    pge_processOBJ(pge: LivePGE) {
        return gamePgeProcessOBJ(this, pge)
    }

    pge_reorderInventory(pge: LivePGE) {
        return gamePgeReorderInventory(this, pge)
    }

    pge_updateInventory(pge1: LivePGE, pge2: LivePGE) {
        return gamePgeUpdateInventory(this, pge1, pge2)
    }

    pge_updateGroup(idx: number, unk1: number, unk2: number) {
        return gamePgeUpdateGroup(this, idx, unk1, unk2)
    }

    pge_inner_process(pge: LivePGE, currentRoom:number) {
        return gamePgeInnerProcess(this, pge, currentRoom)
    }

    pge_setupAnim(pge: LivePGE) {
        return gamePgeSetupAnim(this, pge)
    }

    // TODO I can't change this._currentRoom here because it's set here
    pge_setupOtherPieges(pge: LivePGE, init_pge: InitPGE) {
        return gamePgeSetupOtherPieges(this, pge, init_pge)
    }

    pge_addToCurrentRoomList(pge: LivePGE, room: number) {
        return gamePgeAddToCurrentRoomList(this, pge, room)
    }

    playSound(num: number, softVol: number) {
        return gamePlaySound(this, num, softVol)
    }

    pge_playAnimSound(pge: LivePGE, arg2: number) {
        return gamePgePlayAnimSound(this, pge, arg2)
    }

    pge_setupNextAnimFrame(pge: LivePGE, le: GroupPGE) {
        return gamePgeSetupNextAnimFrame(this, pge, le)
    }

    drawIcon(iconNum: number, x: number, y: number, colMask: number) {
        return gameDrawIcon(this, iconNum, x, y, colMask)
    }

    drawCurrentInventoryItem() {
        return gameDrawCurrentInventoryItem(this)
    }

    col_findPiege(pge: LivePGE, arg2: number) {
        return gameColFindPiege(this, pge, arg2)
    }

    col_findCurrentCollidingObject(pge: LivePGE, n1: number, n2: number, n3: number) {
        return gameColFindCurrentCollidingObject(this, pge, n1, n2, n3)
    }

    printSaveStateCompleted() {
        if (this._saveStateCompleted) {
            const str = this._res.getMenuString(LocaleData.Id.LI_05_COMPLETED)
            this._vid.drawString(str, ((176 - str.length * CHAR_W) / 2) >> 0, 34, 0xE6)
        }
    }

    drawLevelTexts() {
        return gameDrawLevelTexts(this)
    }

    async updateTiming() {
        return gameUpdateTiming(this)
    }

    saveGameState(slot: number) {
        return gameSaveGameState(this, slot)
    }

    loadGameState(slot: number) {
        return gameLoadGameState(this, slot)
    }

    async handleContinueAbort() {
        return gameHandleContinueAbort(this)
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

    async drawStoryTexts() {
        return gameDrawStoryTexts(this)
    }

    async mainLoop() {
        return gameMainLoop(this)
    }

    inp_handleSpecialKeys() {
        return gameInpHandleSpecialKeys(this)
    }

    loadStateRewind() {
        return gameLoadStateRewind(this)
    }

    loadState(f: File) {
        return gameLoadState(this, f)
    }

    drawString(p: Uint8Array, x: number, y: number, color: number, hcenter: boolean) {
        return gameDrawString(this, p, x, y, color, hcenter)
    }

    async prepareAnimationsInRooms(currentRoom:number) {
        return gamePrepareAnimationsInRooms(this, currentRoom)
    }

    async drawAnims() {
        return gameDrawAnims(this)
    }
    
    async drawAnimBuffer(stateNum: number, state: AnimBufferState[]) {
        return gameDrawAnimBuffer(this, stateNum, state)
    }


    drawPiege(state: AnimBufferState) {
        return gameDrawPiege(this, state)
    }
    
    drawObject(dataPtr: Uint8Array, x: number, y: number, flags: number) {
        return gameDrawObject(this, dataPtr, x, y, flags)
    }
    
    drawObjectFrame(bankDataPtr: Uint8Array, dataPtr: Uint8Array, x: number, y: number, flags: number) {
        return gameDrawObjectFrame(this, bankDataPtr, dataPtr, x, y, flags)
    }
    
    drawCharacter(dataPtr: Uint8Array, pos_x: number, pos_y: number, a: number, b: number, flags: number) {
        return gameDrawCharacter(this, dataPtr, pos_x, pos_y, a, b, flags)
    }

    async handleInventory() {
        return gameHandleInventory(this)
    }

    async handleConfigPanel() {
        return gameHandleConfigPanel(this)
    }

    pge_getInventoryItemBefore(pge: LivePGE, last_pge: LivePGE) {
        return gamePgeGetInventoryItemBefore(this, pge, last_pge)
    }
    
    pge_removeFromInventory(pge1: LivePGE, pge2: LivePGE, pge3: LivePGE) {
        return gamePgeRemoveFromInventory(this, pge1, pge2, pge3)
    }

    pge_addToInventory(pge1: LivePGE, pge2: LivePGE, pge3: LivePGE) {
        return gamePgeAddToInventory(this, pge1, pge2, pge3)
    }

    pge_setCurrentInventoryObject(pge: LivePGE) {
        return gamePgeSetCurrentInventoryObject(this, pge)
    }

    getRandomNumber() {
        return gameGetRandomNumber(this)
    }

    async changeLevel() {
        return gameChangeLevel(this)
    }

    async inp_update() {
        return gameInpUpdate(this)
    }

    col_prepareRoomState(currentRoom: number) {
        return gameColPrepareRoomState(this, currentRoom)
    }

    col_clearState() {
        return gameColClearState(this)
    }

    col_findSlot(pos: number) {
        return gameColFindSlot(this, pos)
    }

    col_getGridData(pge: LivePGE, dy: number, dx: number) {
        return gameColGetGridData(this, pge, dy, dx)
    }

    col_getGridPos(pge: LivePGE, dx: number) {
        return gameColGetGridPos(this, pge, dx)
    }

    col_preparePiegeState(pge: LivePGE) {
        return gameColPreparePiegeState(this, pge)
    }


    pge_prepare(currentRoom:number) {
        return gamePgePrepare(this, currentRoom)
    }


    async pge_getUserLeftRightUpDownKeyInput() {
        return gamePgeGetUserLeftRightUpDownKeyInput(this)
    }

    resetGameState() {
        return gameResetGameState(this)
    }

    async loadMonsterSprites(pge: LivePGE, currentRoom:number) {
        return gameLoadMonsterSprites(this, pge, currentRoom)
    }


    hasLevelMap( room: number) {
        return gameHasLevelMap(this, room)
    }

    async loadLevelMap(currentRoom:number) {
        return gameLoadLevelMap(this, currentRoom)
    }

    async loadLevelData(): Promise<number> {
        return gameLoadLevelData(this)
    }

    pge_resetGroups() {
        return gamePgeResetGroups(this)
    }

    clearStateRewind() {
        return gameClearStateRewind(this)
    }
}

export { Game, CT_UP_ROOM, CT_DOWN_ROOM, CT_RIGHT_ROOM, CT_LEFT_ROOM, kIngameSaveSlot, kAutoSaveSlot, kAutoSaveIntervalMs, kRewindSize }
export type { col_Callback1, col_Callback2 }
