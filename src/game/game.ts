import { Level, LivePGE, Skill } from '../core/intern'
import type { PgeOpcodeHandler } from '../core/intern'
import { Mp4CutscenePlayer } from '../cutscene-players/mp4-cutscene-player'
import type { SystemPort } from '../platform/system-port'
import { FileSystem } from '../resource/fs'
import type { GameCollisionState, GamePgeExecutionState, GameRewindState, GameSessionState, GameTransientState, GameUiState, GameWorldState } from './game_state'
import type { RenderDataState, RuntimeRegistryState } from './game_runtime_data'

import {
    scoreTable,
    _gameLevels,
    _pgeModkeystable as modifierKeyMasksData,
    _protectionCodeData,
    _protectionPal,
    _protectionWordData,
} from '../core/staticres'
import { File } from '../resource/file'
import { _pgeOpcodetable as opcodeHandlers } from './game_opcodes'
import {
    uint8Max,
    kIngameSaveSlot,
    kRewindSize,
    kAutoSaveSlot,
    kAutoSaveIntervalMs,
    ctRoomSize,
    ctUpRoom,
    ctDownRoom,
    ctRightRoom,
    ctLeftRoom,
    pgeNum,
} from '../core/game_constants'
import {
    gameLoadGameState,
    gameRun,
    gameSaveGameState,
} from './game_runtime'
import {
    gameLoadState,
} from './game_world'
import {
    createGameCollisionState,
    createGamePgeExecutionState,
    createGameRewindState,
    createGameSessionState,
    createGameTransientState,
    createGameUiState,
    createGameWorldState,
    createMonsterVisualRegistry,
    createRenderDataState,
    createRuntimeRegistryState,
} from './game_factories'
import { createGameServices } from './game_services'
import type { GameServicesShape } from './game_services'

type colCallback1 = (livePGE1: LivePGE, livePGE2: LivePGE, p1: number, p2: number, game: Game) => number
type colCallback2 = (livePGE: LivePGE, p1: number, p2: number, p3: number, game: Game) => number

class Game {
    static _gameLevels: Level[] = _gameLevels
    static _scoreTable: Uint16Array = scoreTable
    static _modifierKeyMasks: Uint8Array = modifierKeyMasksData
    static _protectionCodeData: Uint8Array = _protectionCodeData
    static _protectionWordData: Uint8Array = _protectionWordData
    static _protectionPal: Uint8Array = _protectionPal
    opcodeHandlers: PgeOpcodeHandler[] = opcodeHandlers

    renderPromise: Promise<unknown>
    renderDone: { (): void; (value: unknown): void }

    readonly services: GameServicesShape = {
        res: null,
        vid: null,
        mix: null,
        cut: null,
        stub: null,
        fs: null,
        menu: null,
    }
    readonly world: GameWorldState = createGameWorldState()
    readonly ui: GameUiState = createGameUiState()
    readonly session: GameSessionState = createGameSessionState()
    readonly pge: GamePgeExecutionState = createGamePgeExecutionState()
    readonly collision: GameCollisionState = createGameCollisionState()

    // Loaded monster visuals keep sprite data and palette data together.
    // Monsters currently still render through palette slot 5, but the map keeps
    // the visual data grouped by monster script-node index.
    monsterVisualsByScriptNodeIndex = createMonsterVisualRegistry()
    readonly renderData: RenderDataState = createRenderDataState()
    readonly runtimeData: RuntimeRegistryState = createRuntimeRegistryState()
    readonly transient: GameTransientState = createGameTransientState()
    readonly rewind: GameRewindState = createGameRewindState()
    renders = 0
    debugStartFrame = 0

    constructor(stub: SystemPort, fs: FileSystem, savePath: string, level: number, autoSave: boolean) {
        const services = createGameServices(stub, fs)
        this.services.res = services.res
        this.services.vid = services.vid
        this.services.cut = services.cut
        this.services.mix = services.mix
        this.services.stub = services.stub
        this.services.fs = services.fs
        this.services.menu = services.menu
        this.session.stateSlot = 1
        this.ui.skillLevel = this.services.menu._skill = Skill.kSkillNormal
        this.world.currentLevel = this.services.menu._level = level
        this.world.credits = 0
        this.session.autoSave = autoSave
        this.ui.currentRoomOverlayCounter = 0
        this.session.skipNextLevelCutscene = false
        this.session.startedFromLevelSelect = false
    }

    async playMpegCutscene(path: string) {
        const player = new Mp4CutscenePlayer(this.services.stub, this.services.fs)
        return player.play(path)
    }

    // run -> gameRunLoop -> gameMainLoop
    async run() {
        return gameRun(this)
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

}

export { Game, ctUpRoom, ctDownRoom, ctRightRoom, ctLeftRoom, kIngameSaveSlot, kAutoSaveSlot, kAutoSaveIntervalMs, kRewindSize }
export type { colCallback1, colCallback2 }
