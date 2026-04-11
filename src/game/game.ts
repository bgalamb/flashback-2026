import { LivePGE, AnimBufferState, Skill, InitPGE, Color, readBeUint16, readLeUint32, readBeUint32, createLivePgeRegistry, LoadedMonsterVisual } from '../core/intern'
import { Cutscene } from '../cutscene-players/cutscene'
import { Mp4CutscenePlayer } from '../cutscene-players/mp4-cutscene-player'
import { Mixer } from '../audio/mixer'
import { Resource, ObjectType, LocaleData } from '../resource/resource'
import { Video } from '../video/video'
import { dfFastmode, dfSetlife, dirDown, dirUp, SystemStub } from '../platform/systemstub-web'
import { FileSystem } from '../resource/fs'
import { Menu } from './menu'
import { gamescreenW, gamescreenH, charW, globalGameOptionDefaults } from '../core/game_constants'
import type { GameOptions } from '../core/game_constants'
import { _pgeOpcodetable as defaultOpcodeHandlers } from './game-opcodes'

import {
    monsterListsByLevel
} from '../core/staticres-monsters'
import { File } from '../resource/file'
import {
    uint8Max,
    ctRoomSize,
    ctUpRoom,
    ctDownRoom,
    ctRightRoom,
    ctLeftRoom,
} from '../core/game_constants'
import { gamePlaySound } from './game-audio'
import {
    gameDrawAnimBuffer,
    gameDrawCharacter,
    gameDrawIcon,
    gameDrawObject,
    gameDrawObjectFrame,
    gameDrawPge,
    gameDrawString
} from './game-draw'
import {
    gameLoadGameState,
    gameRun,
    gameSaveGameState,
} from './game-runtime'
import {
    gameClearStateRewind,
    gameGetRandomNumber,
    gameInpUpdate,
    gameLoadLevelData,
    gameLoadLevelMap,
    gameLoadMonsterSprites,
    gameLoadState,
    gameResetGameState
} from './game-world'
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
} from './game-pge'
import {
    gameGetCurrentInventoryItemIndex,
    gameGetInventoryItemIndices,
    gameGetNextInventoryItemIndex
} from './game-inventory'
import type { GameServicesShape } from './game-services'
import type { PgeOpcodeHandler } from './game-types'
import type { GameCollisionStateShape, GamePgeStateShape, GameSessionStateShape, GameUiStateShape, GameWorldStateShape } from './game-state'
import {
    createInitialGameCollisionState,
    createInitialGamePgeState,
    createInitialGameSessionState,
    createInitialGameUiState,
    createInitialGameWorldState,
} from './game-state'
import type { RenderDataState, RuntimeRegistryState } from './game-runtime-data'
import { createInitialRenderDataState, createInitialRuntimeRegistryState } from './game-runtime-data'

class Game {

    _opcodeHandlers: PgeOpcodeHandler[] = defaultOpcodeHandlers

    renderPromise: Promise<unknown>
    renderDone: { (): void; (value: unknown): void }

    _menu: Menu
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
    readonly world: GameWorldStateShape = createInitialGameWorldState()
    readonly ui: GameUiStateShape = createInitialGameUiState()
    readonly session: GameSessionStateShape = createInitialGameSessionState()
    readonly pge: GamePgeStateShape = createInitialGamePgeState()
    readonly collision: GameCollisionStateShape = createInitialGameCollisionState()

    // Loaded monster visuals keep sprite data and palette data together.
    // Monsters currently still render through palette slot 5, but the map keeps
    // the visual data grouped by monster script-node index.
    _loadedMonsterVisualsByScriptNodeIndex: Map<number, LoadedMonsterVisual> = new Map()
    readonly renderData: RenderDataState = createInitialRenderDataState()

    _inpLastkeyshit: number
    _inpLastkeyshitleftright: number
    _shouldPlayPgeAnimationSound: boolean

    readonly runtimeData: RuntimeRegistryState = createInitialRuntimeRegistryState()
    renders: number
    debugStartFrame: number
    options: GameOptions = { ...globalGameOptionDefaults }

    get _res() {
        return this.services.res
    }

    get _vid() {
        return this.services.vid
    }

    constructor(stub: SystemStub, fs: FileSystem, savePath: string, level: number, autoSave: boolean, options?: Partial<GameOptions>) {
        if (options) {
            Object.assign(this.options, options)
        }
        this.services.res = new Resource(fs) // there is only one resource class for the whole game
        this.services.vid = new Video(this.services.res, stub, this.options)
        this.services.cut = new Cutscene(this.services.res, stub, this.services.vid, this.options)
        this._menu = new Menu(this.services.res, stub, this.services.vid)
        this.services.mix = new Mixer(fs, stub)
        this.services.stub = stub
        this.services.fs = fs
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
            const str = this._res.getMenuString(LocaleData.Id.li05Completed)
            this._vid.drawString(str, ((176 - str.length * charW) / 2) >> 0, 34, 0xE6)
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

    async inpUpdate() {
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
    
    drawCharacter(dataPtr: Uint8Array, posX: number, posY: number, a: number, b: number, flags: number, paletteColorMaskOverride: number = -1) {
        return gameDrawCharacter(this, dataPtr, posX, posY, a, b, flags, paletteColorMaskOverride)
    }

    findInventoryItemBeforePge(pge: LivePGE, lastPge: LivePGE) {
        return gameFindInventoryItemBeforePge(this, pge, lastPge)
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

    getRandomNumber() {
        return gameGetRandomNumber(this)
    }

}

export { Game, ctUpRoom, ctDownRoom, ctRightRoom, ctLeftRoom }
