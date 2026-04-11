require('ts-node/register/transpile-only')

const test = require('node:test')
const assert = require('node:assert/strict')

const gamePge = require('../src/game/game_pge.ts')
const gameDraw = require('../src/game/game_draw.ts')
const gameCollision = require('../src/game/game_collision.ts')
const gameInventory = require('../src/game/game_inventory.ts')
const gameWorld = require('../src/game/game_world.ts')
const gameRuntimeModule = require('../src/game/game_runtime.ts')
const {
    dfFastmode,
    dfSetlife,
    dirDown,
    dirLeft,
} = require('../src/platform/systemstub_web.ts')
const { LocaleData } = require('../src/resource/resource.ts')
const { Menu } = require('../src/game/menu.ts')
const { kAutoSaveSlot, kIngameSaveSlot } = require('../src/game/game.ts')
const { attachGroupedGameState } = require('./helpers/grouped_game_state.js')
const {
    gamePlayCutscene,
    gameRunLoop,
    gameRun,
    gameUpdateTiming,
    gameHandleContinueAbort,
    gameDidDie,
    gameInpHandleSpecialKeys,
    gameLoadStateRewind,
    gameProcessActivePgesForFrame,
    gameMainLoop,
} = require('../src/game/game_runtime.ts')

function createPlayerInput() {
    return {
        dirMask: 0,
        enter: false,
        space: false,
        shift: false,
        backspace: false,
        escape: false,
        lastChar: '',
        save: false,
        load: false,
        stateSlot: 0,
        rewind: false,
        dbgMask: 0,
        quit: false,
    }
}

const attachRuntimeGroupedGameState = (game) => attachGroupedGameState(game, {
    services: {
        res: '_res',
        vid: '_vid',
        mix: '_mix',
        cut: '_cut',
        stub: '_stub',
        fs: '_fs',
        menu: '_menu',
    },
    world: {
        currentLevel: '_currentLevel',
        currentRoom: '_currentRoom',
        currentIcon: '_currentIcon',
        loadMap: '_loadMap',
        printLevelCodeCounter: '_printLevelCodeCounter',
        credits: '_credits',
        blinkingConradCounter: '_blinkingConradCounter',
        textToDisplay: '_textToDisplay',
        eraseBackground: '_eraseBackground',
        deathCutsceneCounter: '_deathCutsceneCounter',
    },
    ui: {
        skillLevel: '_skillLevel',
        score: '_score',
        currentRoomOverlayCounter: '_currentRoomOverlayCounter',
        currentInventoryIconNum: '_currentInventoryIconNum',
        saveStateCompleted: '_saveStateCompleted',
    },
    session: {
        randSeed: '_randSeed',
        endLoop: '_endLoop',
        skipNextLevelCutscene: '_skipNextLevelCutscene',
        startedFromLevelSelect: '_startedFromLevelSelect',
        frameTimestamp: '_frameTimestamp',
        autoSave: '_autoSave',
        saveTimestamp: '_saveTimestamp',
        stateSlot: '_stateSlot',
        validSaveState: '_validSaveState',
    },
    pge: {
        currentPgeRoom: '_currentPgeRoom',
        currentPgeFacingIsMirrored: '_currentPgeFacingIsMirrored',
        shouldProcessCurrentPgeObjectNode: '_shouldProcessCurrentPgeObjectNode',
        currentPgeInputMask: '_currentPgeInputMask',
        gunVar: '_gunVar',
        opcodeTempVar1: '_opcodeTempVar1',
        opcodeTempVar2: '_opcodeTempVar2',
        opcodeComparisonResult1: '_opcodeComparisonResult1',
        opcodeComparisonResult2: '_opcodeComparisonResult2',
    },
    collision: {
        nextFreeDynamicPgeCollisionSlotPoolIndex: '_nextFreeDynamicPgeCollisionSlotPoolIndex',
        dynamicPgeCollisionSlotsByPosition: '_dynamicPgeCollisionSlotsByPosition',
        dynamicPgeCollisionSlotObjectPool: '_dynamicPgeCollisionSlotObjectPool',
        roomCollisionGridPatchRestoreSlotPool: '_roomCollisionGridPatchRestoreSlotPool',
        nextFreeRoomCollisionGridPatchRestoreSlot: '_nextFreeRoomCollisionGridPatchRestoreSlot',
        activeRoomCollisionGridPatchRestoreSlots: '_activeRoomCollisionGridPatchRestoreSlots',
        activeRoomCollisionSlotWindow: '_activeRoomCollisionSlotWindow',
        activeCollisionLeftRoom: '_activeCollisionLeftRoom',
        activeCollisionRightRoom: '_activeCollisionRightRoom',
        currentPgeCollisionGridX: '_currentPgeCollisionGridX',
        currentPgeCollisionGridY: '_currentPgeCollisionGridY',
    },
    runtimeData: {
        livePgesByIndex: '_livePgesByIndex',
        livePgeStore: '_livePgeStore',
        pendingSignalsByTargetPgeIndex: '_pendingSignalsByTargetPgeIndex',
        inventoryItemIndicesByOwner: '_inventoryItemIndicesByOwner',
    },
    renderData: {
        animBuffer0State: '_animBuffer0State',
        animBuffer1State: '_animBuffer1State',
        animBuffer2State: '_animBuffer2State',
        animBuffer3State: '_animBuffer3State',
        animBuffers: '_animBuffers',
    },
    rewind: {
        buffer: '_rewindBuffer',
        ptr: '_rewindPtr',
        len: '_rewindLen',
    },
})

function createBaseGame(overrides = {}) {
    const playerInput = createPlayerInput()
    const frontLayer = new Uint8Array([1, 2, 3, 4])
    const backLayer = new Uint8Array([5, 6, 7, 8])
    const tempLayer = new Uint8Array(4)
    const paletteUpdates = []
    const drawCalls = []
    const mixCalls = []
    const cutsceneCalls = []

    const game = {
        _autoSave: false,
        _blinkingConradCounter: 0,
        _currentLevel: 1,
        _currentRoom: 3,
        _currentRoomOverlayCounter: 0,
        _cut: {
            _id: -1,
            interrupted: false,
            deathCutsceneId: 6,
            setId(id) {
                this._id = id
                cutsceneCalls.push(['setId', id])
            },
            getId() {
                return this._id
            },
            async play() {
                cutsceneCalls.push(['play', this._id])
            },
            isInterrupted() {
                return this.interrupted
            },
            getDeathCutSceneId() {
                return this.deathCutsceneId
            },
        },
        _deathCutsceneCounter: 0,
        _endLoop: false,
        _frameTimestamp: 0,
        _livePgeStore: {
            initByIndex: [{ skill: 0 }],
            liveByRoom: Array.from({ length: 64 }, () => []),
            activeFrameByIndex: [null],
            activeFrameList: [],
        },
        _livePgesByIndex: [{
            scriptStateType: 0,
            posX: 32,
            posY: 72,
            animSeq: 0,
            roomLocation: 3,
            life: 10,
            counterValue: 0,
            collisionSlot: 0xFFFF,
            unkF: 0,
            animNumber: 0,
            flags: 4,
            index: 0,
            firstScriptEntryIndex: 0,
            initPge: { skill: 0 },
        }],
        _loadMap: false,
        _menu: {
            _selectedOption: 0,
            _skill: 1,
            _level: 2,
            get selectedOption() {
                return this._selectedOption
            },
            get skillLevel() {
                return this._skill
            },
            get selectedLevel() {
                return this._level
            },
            async handleTitleScreen() {},
        },
        _mix: {
            init() {
                mixCalls.push(['init'])
            },
            playMusic(id) {
                mixCalls.push(['playMusic', id])
            },
            stopMusic() {
                mixCalls.push(['stopMusic'])
            },
        },
        _gunVar: 0,
        _opcodeTempVar1: 99,
        _randSeed: 0,
        _score: 0,
        _res: {
            level: {
                ctData: new Uint8Array(0x2000),
            },
            sprites: {
                spr1: {},
            },
            loadText() {},
            async load() {},
            async loadSpriteOffsets() {},
            initializeConradVisuals() {},
            async loadFib() {},
            getMenuString(id) {
                return {
                    [LocaleData.Id.li01ContinueOrAbort]: 'CONTINUE OR ABORT',
                    [LocaleData.Id.li02Time]: 'TIME',
                    [LocaleData.Id.li03Continue]: 'CONTINUE',
                    [LocaleData.Id.li04Abort]: 'ABORT',
                }[id] || `TEXT_${id}`
            },
        },
        _rewindBuffer: [],
        _rewindLen: 0,
        _rewindPtr: 0,
        _pendingSignalsByTargetPgeIndex: new Map(),
        _inventoryItemIndicesByOwner: new Map(),
        _nextFreeDynamicPgeCollisionSlotPoolIndex: 0,
        _dynamicPgeCollisionSlotsByPosition: new Map(),
        _dynamicPgeCollisionSlotObjectPool: [],
        _roomCollisionGridPatchRestoreSlotPool: [{}],
        _nextFreeRoomCollisionGridPatchRestoreSlot: null,
        _activeRoomCollisionGridPatchRestoreSlots: null,
        _activeRoomCollisionSlotWindow: {
            left: new Array(0x30).fill(null),
            current: new Array(0x30).fill(null),
            right: new Array(0x30).fill(null),
        },
        _currentPgeCollisionGridX: 0,
        _currentPgeCollisionGridY: 0,
        _animBuffer0State: [],
        _animBuffer1State: [],
        _animBuffer2State: [],
        _animBuffer3State: [],
        _animBuffers: {
            _states: [[], [], [], []],
            _curPos: [0, 0, 0, 0],
        },
        transient: {
            lastInputMask: 0,
            lastLeftRightInputMask: 0,
            shouldPlayPgeAnimationSound: false,
        },
        _saveTimestamp: 0,
        _skipNextLevelCutscene: false,
        _startedFromLevelSelect: false,
        _stateSlot: 5,
        renders: 0,
        _stub: {
            _pi: playerInput,
            copyRectCalls: [],
            sleepCalls: [],
            updateScreenCalls: [],
            timeStamps: [0, 0, 0, 0],
            get input() {
                return this._pi
            },
            setOverscanColor() {},
            getPaletteEntry(_index, color) {
                color.r = 0
                color.g = 0
                color.b = 0
            },
            setPaletteEntry(index, color) {
                paletteUpdates.push([index, { ...color }])
            },
            copyRect(...args) {
                this.copyRectCalls.push(args)
            },
            async updateScreen(value) {
                this.updateScreenCalls.push(value)
            },
            async processEvents() {},
            async sleep(ms) {
                this.sleepCalls.push(ms)
            },
            getTimeStamp() {
                return this.timeStamps.shift() ?? 0
            },
        },
        _validSaveState: false,
        _vid: {
            layers: {
                backLayer,
                frontLayer,
                layerSize: frontLayer.length,
                tempLayer,
                w: 320,
                h: 200,
            },
            palette: {
                unkPalSlot1: 0,
                unkPalSlot2: 0,
            },
            clearLevelPaletteState() {
                this.palette.unkPalSlot1 = 0
                this.palette.unkPalSlot2 = 0
            },
            presentFrontLayer() {
                game._stub.copyRect(0, 0, this.layers.w, this.layers.h, this.layers.frontLayer, this.layers.w)
            },
            copyFrontLayerToTemp() {
                this.layers.tempLayer.set(this.layers.frontLayer.subarray(0, this.layers.layerSize))
            },
            restoreFrontLayerFromTemp() {
                this.layers.frontLayer.set(this.layers.tempLayer.subarray(0, this.layers.layerSize))
            },
            restoreFrontLayerFromBack() {
                this.layers.frontLayer.set(this.layers.backLayer.subarray(0, this.layers.layerSize))
            },
            drawString(...args) {
                drawCalls.push(args)
            },
            fullRefreshCalls: 0,
            fullRefresh() {
                this.fullRefreshCalls += 1
            },
            setTextPalette() {},
            setPalette0xF() {},
            async updateScreen() {},
        },
        clearStateRewind() {},
        loadGameState() {
            return false
        },
        saveGameState() {},
        loadState() {},
        resetGameState() {},
        async loadLevelData() {},
        renderDone() {},
        drawCalls,
        mixCalls,
        cutsceneCalls,
        paletteUpdates,
    }

    Object.assign(game, overrides)
    return attachRuntimeGroupedGameState(game)
}

test('gamePlayCutscene plays chained cutscenes and stops music afterwards', async () => {
    const game = createBaseGame()

    await gamePlayCutscene(game, 0x0D)

    assert.deepEqual(game.cutsceneCalls, [
        ['setId', 0x0D],
        ['play', 0x0D],
        ['setId', 0x4A],
        ['play', 0x4A],
    ])
    assert.equal(game.mixCalls[0][0], 'stopMusic')
    assert.equal(game.mixCalls.at(-1)[0], 'stopMusic')
})

test('gameRunLoop schedules another frame until the runtime ends, then resolves rendering', async () => {
    const game = createBaseGame()
    const originalRequestAnimationFrame = global.requestAnimationFrame
    const scheduled = []
    let renderDoneCalls = 0

    game._skipNextLevelCutscene = true
    game._cut._id = 0x3D
    game._stub._pi.enter = true
    global.requestAnimationFrame = (callback) => {
        scheduled.push(callback)
        return 1
    }
    game.renderDone = () => {
        renderDoneCalls += 1
    }

    try {
        await gameRunLoop(game)
    } finally {
        global.requestAnimationFrame = originalRequestAnimationFrame
    }

    assert.equal(scheduled.length, 0)
    assert.equal(renderDoneCalls, 1)
})

test('gameRun boots resources, shows the menu, and exits when quit is selected', async () => {
    const loads = []
    const game = createBaseGame({
        _menu: {
            _selectedOption: Menu.menuOptionItemQuit,
            _skill: 2,
            _level: 7,
            async handleTitleScreen() {},
        },
        _res: {
            sprites: {
                spr1: { loaded: true },
            },
            loadText() {
                loads.push(['load_TEXT'])
            },
            async load(name, type) {
                loads.push(['load', name, type])
            },
            async loadSpriteOffsets(name, spr) {
                loads.push(['load_SPRITE_OFFSETS', name, spr.loaded])
            },
            initializeConradVisuals() {
                loads.push(['initializeConradVisuals'])
            },
            async loadFib(name) {
                loads.push(['load_FIB', name])
            },
        },
    })

    await gameRun(game)

    assert.equal(game._stub._pi.quit, true)
    assert.deepEqual(loads.map(([name]) => name), [
        'load_TEXT',
        'load',
        'load',
        'load',
        'load',
        'load_SPRITE_OFFSETS',
        'initializeConradVisuals',
        'load_FIB',
    ])
    assert.equal(game.mixCalls.includes('init'), false)
    assert.deepEqual(game.mixCalls.slice(0, 2), [['init'], ['stopMusic']])
})

test('gameRun prefers the manifest-based sound loader when loadSoundEffects is available', async () => {
    const loads = []
    const game = createBaseGame({
        _menu: {
            _selectedOption: Menu.menuOptionItemQuit,
            _skill: 2,
            _level: 7,
            async handleTitleScreen() {},
        },
        _res: {
            sprites: {
                spr1: { loaded: true },
            },
            loadText() {
                loads.push(['load_TEXT'])
            },
            async load(name, type) {
                loads.push(['load', name, type])
            },
            async loadSpriteOffsets(name, spr) {
                loads.push(['load_SPRITE_OFFSETS', name, spr.loaded])
            },
            initializeConradVisuals() {
                loads.push(['initializeConradVisuals'])
            },
            async loadSoundEffects(name) {
                loads.push(['load_SOUND_EFFECTS', name])
            },
            async loadFib(name) {
                loads.push(['load_FIB', name])
            },
        },
    })

    await gameRun(game)

    assert.equal(loads.some(([name]) => name === 'load_FIB'), false)
    assert.deepEqual(loads.map(([name]) => name), [
        'load_TEXT',
        'load',
        'load',
        'load',
        'load',
        'load_SPRITE_OFFSETS',
        'initializeConradVisuals',
        'load_SOUND_EFFECTS',
    ])
})

test('gameUpdateTiming sleeps the remaining frame budget unless fast mode is enabled', async () => {
    const game = createBaseGame()
    game._frameTimestamp = 10
    game._stub.timeStamps = [25, 40]

    await gameUpdateTiming(game)

    assert.deepEqual(game._stub.sleepCalls, [1000 / 30 - 15])
    assert.equal(game._frameTimestamp, 40)

    game._stub._pi.dbgMask = dfFastmode
    game._stub.sleepCalls = []
    game._frameTimestamp = 40
    game._stub.timeStamps = [45, 50]

    await gameUpdateTiming(game)

    assert.deepEqual(game._stub.sleepCalls, [15])
    assert.equal(game._frameTimestamp, 50)
})

test('gameHandleContinueAbort swaps the highlighted option and aborts on enter', async () => {
    const game = createBaseGame()
    let iteration = 0

    game._stub.processEvents = async () => {
        if (iteration === 0) {
            game._stub._pi.dirMask = dirDown
        } else if (iteration === 1) {
            game._stub._pi.enter = true
        }
        iteration += 1
    }

    const result = await gameHandleContinueAbort(game)

    assert.equal(result, 'abort')
    assert.equal(game._stub._pi.enter, false)
    assert.equal(game.drawCalls.some(([, , , color]) => color === 0xE5), true)
    assert.equal(game.paletteUpdates.length > 0, true)
})

test('gameHandleContinueAbort allows rewind to exit the death menu when a rewind snapshot exists', async () => {
    const game = createBaseGame({
        _rewindLen: 1,
    })
    let iteration = 0

    game._stub.processEvents = async () => {
        if (iteration === 0) {
            game._stub._pi.rewind = true
        }
        iteration += 1
    }

    const result = await gameHandleContinueAbort(game)

    assert.equal(result, 'rewind')
    assert.equal(game._stub._pi.rewind, false)
})

test('gameHandleContinueAbort also allows left arrow to exit the death menu into rewind', async () => {
    const game = createBaseGame({
        _rewindLen: 1,
    })
    let iteration = 0

    game._stub.processEvents = async () => {
        if (iteration === 0) {
            game._stub._pi.dirMask = dirLeft
        }
        iteration += 1
    }

    const result = await gameHandleContinueAbort(game)

    assert.equal(result, 'rewind')
    assert.equal(game._stub._pi.dirMask & dirLeft, 0)
})

test('gameDidDie does not rewind when continue is chosen', async () => {
    const game = createBaseGame({
        _autoSave: true,
        _validSaveState: true,
        _deathCutsceneCounter: 1,
        _rewindLen: 1,
    })
    const loadedSlots = []
    let iteration = 0

    game.loadGameState = (slot) => {
        loadedSlots.push(slot)
        return true
    }
    game._stub.processEvents = async () => {
        if (iteration === 0) {
            game._stub._pi.enter = true
        }
        iteration += 1
    }

    const handled = await gameDidDie(game)

    assert.equal(handled, true)
    assert.deepEqual(loadedSlots, [kIngameSaveSlot])
    assert.equal(game._endLoop, false)
})

test('gameDidDie clears death-screen input when rewinding from autosave', async () => {
    const game = createBaseGame({
        _autoSave: true,
        _deathCutsceneCounter: 1,
    })
    gameRuntimeModule.gameSaveGameState(game, kAutoSaveSlot)
    game._stub._pi.enter = false
    game._stub._pi.space = true
    game._stub._pi.shift = true
    game._stub._pi.backspace = true
    game._stub._pi.rewind = true
    game.transient.lastInputMask = 4
    game.transient.lastLeftRightInputMask = 4

    game._stub.processEvents = async () => {
        game._stub._pi.rewind = true
    }

    const handled = await gameDidDie(game)

    assert.equal(handled, true)
    assert.equal(game._stub._pi.enter, false)
})

test('space input is sampled normally after rewinding from the death screen', async () => {
    const game = createBaseGame({
        _autoSave: true,
        _deathCutsceneCounter: 1,
        _rewindLen: 1,
    })
    game.loadGameState = (slot) => slot === kAutoSaveSlot

    await gameDidDie(game)

    game._stub._pi.space = true
    await gamePge.gameUpdatePgeDirectionalInputState(game)

    assert.equal(game._currentPgeInputMask, 0x20)
})

test('gameInpHandleSpecialKeys updates life, saves, loads, advances slots, and rewinds state', () => {
    const originalSaveGameState = gameRuntimeModule.gameSaveGameState
    const game = createBaseGame({
        _score: 7,
    })
    const loadedSlots = []
    const savedSlots = []

    gameRuntimeModule.gameSaveGameState(game, kAutoSaveSlot)
    game._score = 99
    game._livePgesByIndex[0].life = 3

    game._stub._pi.dbgMask = dfSetlife
    game._stub._pi.load = true
    game._stub._pi.save = true
    game._stub._pi.stateSlot = 2
    game._stub._pi.rewind = true
    game.loadGameState = (slot) => {
        loadedSlots.push(slot)
        return true
    }
    gameRuntimeModule.gameSaveGameState = (_game, slot) => {
        savedSlots.push(slot)
    }
    try {
        gameInpHandleSpecialKeys(game)

        assert.equal(game._livePgesByIndex[0].life, 10)
        assert.equal(game._score, 7)
        assert.deepEqual(loadedSlots, [5])
        assert.deepEqual(savedSlots, [5])
        assert.equal(game._stateSlot, 7)
        assert.equal(game._rewindLen, 0)
        assert.equal(game._stub._pi.load, false)
        assert.equal(game._stub._pi.save, false)
        assert.equal(game._stub._pi.rewind, false)
        assert.equal(game._stub._pi.stateSlot, 0)
    } finally {
        gameRuntimeModule.gameSaveGameState = originalSaveGameState
    }
})

test('gameLoadGameState restores an in-memory save slot snapshot', () => {
    const game = createBaseGame({
        _score: 12,
    })

    const slot = 3
    gameRuntimeModule.gameSaveGameState(game, slot)
    game._score = 99
    game._livePgesByIndex[0].life = 1

    const ok = gameRuntimeModule.gameLoadGameState(game, slot)

    assert.equal(ok, true)
    assert.equal(game._score, 12)
    assert.equal(game._livePgesByIndex[0].life, 10)
})

test('autosave slot uses the rewind ring instead of the regular save-slot map', () => {
    const game = createBaseGame({
        _score: 12,
    })

    const okSave = gameRuntimeModule.gameSaveGameState(game, kAutoSaveSlot)
    game._score = 99
    game._livePgesByIndex[0].life = 1

    const okLoad = gameRuntimeModule.gameLoadGameState(game, kAutoSaveSlot)

    assert.equal(okSave, true)
    assert.equal(okLoad, true)
    assert.equal(game._rewindLen, 0)
    assert.equal(game._score, 12)
    assert.equal(game._livePgesByIndex[0].life, 10)
})

test('autosave rewind restores extra live PGE runtime fields used by gameplay scripts', () => {
    const game = createBaseGame()
    game._livePgesByIndex[0].gunMode = 3

    gameRuntimeModule.gameSaveGameState(game, kAutoSaveSlot)
    game._livePgesByIndex[0].gunMode = 0

    const ok = gameRuntimeModule.gameLoadGameState(game, kAutoSaveSlot)

    assert.equal(ok, true)
    assert.equal(game._livePgesByIndex[0].gunMode, 3)
})

test('autosave rewind clears pending signals instead of restoring stale message queues', () => {
    const game = createBaseGame()
    game._pendingSignalsByTargetPgeIndex.set(0, [{ senderPgeIndex: 48, signalId: 28 }])

    gameRuntimeModule.gameSaveGameState(game, kAutoSaveSlot)
    game._pendingSignalsByTargetPgeIndex.set(0, [{ senderPgeIndex: 99, signalId: 5 }])

    const ok = gameRuntimeModule.gameLoadGameState(game, kAutoSaveSlot)

    assert.equal(ok, true)
    assert.equal(game._pendingSignalsByTargetPgeIndex.size, 0)
})

test('autosave rewind migrates legacy gun state from opcodeTempVar1 when gunVar is missing', () => {
    const game = createBaseGame()
    game._gunVar = 0
    game._opcodeTempVar1 = 2

    gameRuntimeModule.gameSaveGameState(game, kAutoSaveSlot)
    const snapshot = game._rewindBuffer[game._rewindPtr]
    delete snapshot.pge.gunVar

    game._gunVar = 0
    game._opcodeTempVar1 = 0

    const ok = gameRuntimeModule.gameLoadGameState(game, kAutoSaveSlot)

    assert.equal(ok, true)
    assert.equal(game._gunVar, 2)
})

test('gameProcessActivePgesForFrame refreshes collision-grid coordinates before running entity logic', () => {
    const originalRunPgeFrameLogic = gamePge.gameRunPgeFrameLogic
    const calls = []
    const game = createBaseGame()
    const activePges = [
        { posX: 10, posY: 72 },
        { posX: 47, posY: 143 },
    ]

    gamePge.gameRunPgeFrameLogic = (currentGame, pge, room) => {
        calls.push({
            currentGame,
            pge,
            room,
            gridX: currentGame._currentPgeCollisionGridX,
            gridY: currentGame._currentPgeCollisionGridY,
        })
    }

    try {
        gameProcessActivePgesForFrame(game, activePges, 9)
    } finally {
        gamePge.gameRunPgeFrameLogic = originalRunPgeFrameLogic
    }

    assert.deepEqual(calls.map(({ pge, room, gridX, gridY }) => ({ pge, room, gridX, gridY })), [
        { pge: activePges[0], room: 9, gridX: 1, gridY: 2 },
        { pge: activePges[1], room: 9, gridX: 3, gridY: 2 },
    ])
})

test('gameMainLoop rebuilds frame state, loads the map, draws the frame, and handles inventory/back actions', async () => {
    const originals = {
        gameSaveGameState: gameRuntimeModule.gameSaveGameState,
        gameUpdatePgeDirectionalInputState: gamePge.gameUpdatePgeDirectionalInputState,
        gameRebuildPgeCollisionStateForCurrentRoom: gamePge.gameRebuildPgeCollisionStateForCurrentRoom,
        gameRebuildActiveFramePgeList: gamePge.gameRebuildActiveFramePgeList,
        gameRunPgeFrameLogic: gamePge.gameRunPgeFrameLogic,
        gameRebuildActiveRoomCollisionSlotLookup: gameCollision.gameRebuildActiveRoomCollisionSlotLookup,
        gameDrawAnims: gameDraw.gameDrawAnims,
        gameDrawCurrentInventoryItem: gameDraw.gameDrawCurrentInventoryItem,
        gameDrawCurrentRoomOverlay: gameDraw.gameDrawCurrentRoomOverlay,
        gameDrawLevelTexts: gameDraw.gameDrawLevelTexts,
        gameDrawStoryTexts: gameDraw.gameDrawStoryTexts,
        gameHandleConfigPanel: gameInventory.gameHandleConfigPanel,
        gameHandleInventory: gameInventory.gameHandleInventory,
        gameChangeLevel: gameWorld.gameChangeLevel,
        gameHasLevelMap: gameWorld.gameHasLevelMap,
        gameLoadLevelMap: gameWorld.gameLoadLevelMap,
        gamePrepareAnimationsInRooms: gameWorld.gamePrepareAnimationsInRooms,
    }
    const calls = []
    const game = createBaseGame({
        _autoSave: true,
        _blinkingConradCounter: 2,
        _loadMap: true,
        _saveTimestamp: 0,
        _skipNextLevelCutscene: true,
    })

    game._livePgesByIndex[0] = { life: 5, roomLocation: 8, posX: 40, posY: 72 }
    game._livePgeStore.activeFrameList = [game._livePgesByIndex[0]]
    game._stub._pi.backspace = true
    game._stub.timeStamps = [60000, 60000, 60000]
    game._vid.updateScreen = async () => {
        calls.push('updateScreen')
    }
    gameRuntimeModule.gameSaveGameState = (_game, slot) => {
        calls.push(['saveGameState', slot])
    }

    gamePge.gameUpdatePgeDirectionalInputState = async () => calls.push('updatePgeDirectionalInputState')
    gamePge.gameRebuildPgeCollisionStateForCurrentRoom = () => calls.push('rebuildPgeCollisionState')
    gamePge.gameRebuildActiveFramePgeList = () => calls.push('rebuildActiveFramePgeList')
    gamePge.gameRunPgeFrameLogic = () => calls.push('runPgeFrameLogic')
    gameCollision.gameRebuildActiveRoomCollisionSlotLookup = () => calls.push('rebuildActiveRoomCollisionSlotLookup')
    gameDraw.gameDrawAnims = async () => calls.push('drawAnims')
    gameDraw.gameDrawCurrentInventoryItem = () => calls.push('drawCurrentInventoryItem')
    gameDraw.gameDrawCurrentRoomOverlay = () => calls.push('drawCurrentRoomOverlay')
    gameDraw.gameDrawLevelTexts = () => calls.push('drawLevelTexts')
    gameDraw.gameDrawStoryTexts = async () => calls.push('drawStoryTexts')
    gameInventory.gameHandleConfigPanel = async () => false
    gameInventory.gameHandleInventory = async () => calls.push('handleInventory')
    gameWorld.gameChangeLevel = async () => calls.push('changeLevel')
    gameWorld.gameHasLevelMap = () => true
    gameWorld.gameLoadLevelMap = async (_game, room) => calls.push(['loadLevelMap', room])
    gameWorld.gamePrepareAnimationsInRooms = async (_game, room) => calls.push(['prepareAnimationsInRooms', room])

    try {
        await gameMainLoop(game)
    } finally {
        Object.assign(gameRuntimeModule, {
            gameSaveGameState: originals.gameSaveGameState,
        })
        Object.assign(gamePge, {
            gameUpdatePgeDirectionalInputState: originals.gameUpdatePgeDirectionalInputState,
            gameRebuildPgeCollisionStateForCurrentRoom: originals.gameRebuildPgeCollisionStateForCurrentRoom,
            gameRebuildActiveFramePgeList: originals.gameRebuildActiveFramePgeList,
            gameRunPgeFrameLogic: originals.gameRunPgeFrameLogic,
        })
        Object.assign(gameCollision, {
            gameRebuildActiveRoomCollisionSlotLookup: originals.gameRebuildActiveRoomCollisionSlotLookup,
        })
        Object.assign(gameDraw, {
            gameDrawAnims: originals.gameDrawAnims,
            gameDrawCurrentInventoryItem: originals.gameDrawCurrentInventoryItem,
            gameDrawCurrentRoomOverlay: originals.gameDrawCurrentRoomOverlay,
            gameDrawLevelTexts: originals.gameDrawLevelTexts,
            gameDrawStoryTexts: originals.gameDrawStoryTexts,
        })
        Object.assign(gameInventory, {
            gameHandleConfigPanel: originals.gameHandleConfigPanel,
            gameHandleInventory: originals.gameHandleInventory,
        })
        Object.assign(gameWorld, {
            gameChangeLevel: originals.gameChangeLevel,
            gameHasLevelMap: originals.gameHasLevelMap,
            gameLoadLevelMap: originals.gameLoadLevelMap,
            gamePrepareAnimationsInRooms: originals.gamePrepareAnimationsInRooms,
        })
    }

    assert.equal(game._skipNextLevelCutscene, false)
    assert.equal(game._currentRoom, 8)
    assert.equal(game._loadMap, false)
    assert.equal(game._currentRoomOverlayCounter, 90)
    assert.equal(game._vid.fullRefreshCalls, 1)
    assert.equal(game.renders, 1)
    assert.equal(game._blinkingConradCounter, 1)
    assert.equal(game._stub._pi.backspace, false)
    assert.equal(calls.includes('handleInventory'), true)
    assert.equal(calls.some((entry) => Array.isArray(entry) && entry[0] === 'saveGameState'), true)
})

test('gameMainLoop commits pending map loads through grouped runtime state instead of stale legacy fields', async () => {
    const originals = {
        gameUpdatePgeDirectionalInputState: gamePge.gameUpdatePgeDirectionalInputState,
        gameRebuildPgeCollisionStateForCurrentRoom: gamePge.gameRebuildPgeCollisionStateForCurrentRoom,
        gameRebuildActiveFramePgeList: gamePge.gameRebuildActiveFramePgeList,
        gameRunPgeFrameLogic: gamePge.gameRunPgeFrameLogic,
        gameRebuildActiveRoomCollisionSlotLookup: gameCollision.gameRebuildActiveRoomCollisionSlotLookup,
        gameDrawAnims: gameDraw.gameDrawAnims,
        gameDrawCurrentInventoryItem: gameDraw.gameDrawCurrentInventoryItem,
        gameDrawCurrentRoomOverlay: gameDraw.gameDrawCurrentRoomOverlay,
        gameDrawLevelTexts: gameDraw.gameDrawLevelTexts,
        gameDrawStoryTexts: gameDraw.gameDrawStoryTexts,
        gameHandleConfigPanel: gameInventory.gameHandleConfigPanel,
        gameHandleInventory: gameInventory.gameHandleInventory,
        gameChangeLevel: gameWorld.gameChangeLevel,
        gameHasLevelMap: gameWorld.gameHasLevelMap,
        gameLoadLevelMap: gameWorld.gameLoadLevelMap,
        gamePrepareAnimationsInRooms: gameWorld.gamePrepareAnimationsInRooms,
    }
    const calls = []
    const game = createBaseGame({
        _currentLevel: 1,
        _currentRoom: 99,
        _loadMap: false,
        _blinkingConradCounter: 0,
        _deathCutsceneCounter: 0,
        _score: 0,
        _randSeed: 0,
        _startedFromLevelSelect: false,
        _autoSave: false,
        _saveTimestamp: 0,
        _endLoop: false,
        _frameTimestamp: 0,
        _validSaveState: false,
        _stateSlot: 5,
        _skipNextLevelCutscene: true,
        _livePgesByIndex: [{ life: 5, roomLocation: 8, posX: 40, posY: 72 }],
        _livePgeStore: { activeFrameList: [], activeFrameByIndex: [], liveByRoom: [] },
        _pendingSignalsByTargetPgeIndex: new Map(),
        _inventoryItemIndicesByOwner: new Map(),
        _currentRoomOverlayCounter: 77,
        _skipNextLevelCutscene: false,
    })
    game.world.currentRoom = 3
    game.world.loadMap = true

    game.runtimeData.livePgeStore.activeFrameList = [game.runtimeData.livePgesByIndex[0]]
    game._vid.updateScreen = async () => {
        calls.push('updateScreen')
    }

    gamePge.gameUpdatePgeDirectionalInputState = async () => calls.push('updatePgeDirectionalInputState')
    gamePge.gameRebuildPgeCollisionStateForCurrentRoom = () => calls.push('rebuildPgeCollisionState')
    gamePge.gameRebuildActiveFramePgeList = () => calls.push('rebuildActiveFramePgeList')
    gamePge.gameRunPgeFrameLogic = () => calls.push('runPgeFrameLogic')
    gameCollision.gameRebuildActiveRoomCollisionSlotLookup = () => calls.push('rebuildActiveRoomCollisionSlotLookup')
    gameDraw.gameDrawAnims = async () => calls.push('drawAnims')
    gameDraw.gameDrawCurrentInventoryItem = () => calls.push('drawCurrentInventoryItem')
    gameDraw.gameDrawCurrentRoomOverlay = () => calls.push('drawCurrentRoomOverlay')
    gameDraw.gameDrawLevelTexts = () => calls.push('drawLevelTexts')
    gameDraw.gameDrawStoryTexts = async () => calls.push('drawStoryTexts')
    gameInventory.gameHandleConfigPanel = async () => false
    gameInventory.gameHandleInventory = async () => calls.push('handleInventory')
    gameWorld.gameChangeLevel = async () => calls.push('changeLevel')
    gameWorld.gameHasLevelMap = () => true
    gameWorld.gameLoadLevelMap = async (_game, room) => calls.push(['loadLevelMap', room])
    gameWorld.gamePrepareAnimationsInRooms = async (_game, room) => calls.push(['prepareAnimationsInRooms', room])

    try {
        await gameMainLoop(game)
    } finally {
        Object.assign(gamePge, {
            gameUpdatePgeDirectionalInputState: originals.gameUpdatePgeDirectionalInputState,
            gameRebuildPgeCollisionStateForCurrentRoom: originals.gameRebuildPgeCollisionStateForCurrentRoom,
            gameRebuildActiveFramePgeList: originals.gameRebuildActiveFramePgeList,
            gameRunPgeFrameLogic: originals.gameRunPgeFrameLogic,
        })
        Object.assign(gameCollision, {
            gameRebuildActiveRoomCollisionSlotLookup: originals.gameRebuildActiveRoomCollisionSlotLookup,
        })
        Object.assign(gameDraw, {
            gameDrawAnims: originals.gameDrawAnims,
            gameDrawCurrentInventoryItem: originals.gameDrawCurrentInventoryItem,
            gameDrawCurrentRoomOverlay: originals.gameDrawCurrentRoomOverlay,
            gameDrawLevelTexts: originals.gameDrawLevelTexts,
            gameDrawStoryTexts: originals.gameDrawStoryTexts,
        })
        Object.assign(gameInventory, {
            gameHandleConfigPanel: originals.gameHandleConfigPanel,
            gameHandleInventory: originals.gameHandleInventory,
        })
        Object.assign(gameWorld, {
            gameChangeLevel: originals.gameChangeLevel,
            gameHasLevelMap: originals.gameHasLevelMap,
            gameLoadLevelMap: originals.gameLoadLevelMap,
            gamePrepareAnimationsInRooms: originals.gamePrepareAnimationsInRooms,
        })
    }

    assert.equal(game.world.currentRoom, 8)
    assert.equal(game.world.loadMap, false)
    assert.equal(game._currentRoom, 8)
    assert.equal(game._loadMap, false)
    assert.equal(game._currentRoomOverlayCounter, 90)
    assert.equal(game._vid.fullRefreshCalls, 1)
    assert.equal(calls.some((entry) => Array.isArray(entry) && entry[0] === 'loadLevelMap' && entry[1] === 8), true)
    assert.equal(calls.some((entry) => Array.isArray(entry) && entry[0] === 'prepareAnimationsInRooms' && entry[1] === 8), true)
})
