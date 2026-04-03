require('ts-node/register/transpile-only')

const test = require('node:test')
const assert = require('node:assert/strict')

const gamePge = require('../src/game/game_pge.ts')
const gameDraw = require('../src/game/game_draw.ts')
const gameCollision = require('../src/game/game_collision.ts')
const gameInventory = require('../src/game/game_inventory.ts')
const gameWorld = require('../src/game/game_world.ts')
const {
    dfFastmode,
    dfSetlife,
    dirDown,
} = require('../src/platform/systemstub_web.ts')
const { LocaleData } = require('../src/resource/resource.ts')
const { Menu } = require('../src/game/menu.ts')
const { kAutoSaveSlot } = require('../src/game/game.ts')
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

function attachGroupedGameState(game) {
    game.services = {
        get res() { return game._res },
        set res(value) { game._res = value },
        get vid() { return game._vid },
        set vid(value) { game._vid = value },
        get mix() { return game._mix },
        set mix(value) { game._mix = value },
        get cut() { return game._cut },
        set cut(value) { game._cut = value },
        get stub() { return game._stub },
        set stub(value) { game._stub = value },
        get fs() { return game._fs },
        set fs(value) { game._fs = value },
    }
    game.world = {
        get currentLevel() { return game._currentLevel },
        set currentLevel(value) { game._currentLevel = value },
        get currentRoom() { return game._currentRoom },
        set currentRoom(value) { game._currentRoom = value },
        get currentIcon() { return game._currentIcon },
        set currentIcon(value) { game._currentIcon = value },
        get loadMap() { return game._loadMap },
        set loadMap(value) { game._loadMap = value },
        get printLevelCodeCounter() { return game._printLevelCodeCounter },
        set printLevelCodeCounter(value) { game._printLevelCodeCounter = value },
        get credits() { return game._credits },
        set credits(value) { game._credits = value },
        get blinkingConradCounter() { return game._blinkingConradCounter },
        set blinkingConradCounter(value) { game._blinkingConradCounter = value },
        get textToDisplay() { return game._textToDisplay },
        set textToDisplay(value) { game._textToDisplay = value },
        get eraseBackground() { return game._eraseBackground },
        set eraseBackground(value) { game._eraseBackground = value },
        get deathCutsceneCounter() { return game._deathCutsceneCounter },
        set deathCutsceneCounter(value) { game._deathCutsceneCounter = value },
    }
    game.ui = {
        get skillLevel() { return game._skillLevel },
        set skillLevel(value) { game._skillLevel = value },
        get score() { return game._score },
        set score(value) { game._score = value },
        get currentRoomOverlayCounter() { return game._currentRoomOverlayCounter },
        set currentRoomOverlayCounter(value) { game._currentRoomOverlayCounter = value },
        get currentInventoryIconNum() { return game._currentInventoryIconNum },
        set currentInventoryIconNum(value) { game._currentInventoryIconNum = value },
        get saveStateCompleted() { return game._saveStateCompleted },
        set saveStateCompleted(value) { game._saveStateCompleted = value },
    }
    game.session = {
        get randSeed() { return game._randSeed },
        set randSeed(value) { game._randSeed = value },
        get endLoop() { return game._endLoop },
        set endLoop(value) { game._endLoop = value },
        get skipNextLevelCutscene() { return game._skipNextLevelCutscene },
        set skipNextLevelCutscene(value) { game._skipNextLevelCutscene = value },
        get startedFromLevelSelect() { return game._startedFromLevelSelect },
        set startedFromLevelSelect(value) { game._startedFromLevelSelect = value },
        get frameTimestamp() { return game._frameTimestamp },
        set frameTimestamp(value) { game._frameTimestamp = value },
        get autoSave() { return game._autoSave },
        set autoSave(value) { game._autoSave = value },
        get saveTimestamp() { return game._saveTimestamp },
        set saveTimestamp(value) { game._saveTimestamp = value },
        get stateSlot() { return game._stateSlot },
        set stateSlot(value) { game._stateSlot = value },
        get validSaveState() { return game._validSaveState },
        set validSaveState(value) { game._validSaveState = value },
    }
    game.pge = {
        get currentPgeRoom() { return game._currentPgeRoom },
        set currentPgeRoom(value) { game._currentPgeRoom = value },
        get currentPgeFacingIsMirrored() { return game._currentPgeFacingIsMirrored },
        set currentPgeFacingIsMirrored(value) { game._currentPgeFacingIsMirrored = value },
        get shouldProcessCurrentPgeObjectNode() { return game._shouldProcessCurrentPgeObjectNode },
        set shouldProcessCurrentPgeObjectNode(value) { game._shouldProcessCurrentPgeObjectNode = value },
        get currentPgeInputMask() { return game._currentPgeInputMask },
        set currentPgeInputMask(value) { game._currentPgeInputMask = value },
        get opcodeTempVar1() { return game._opcodeTempVar1 },
        set opcodeTempVar1(value) { game._opcodeTempVar1 = value },
        get opcodeTempVar2() { return game._opcodeTempVar2 },
        set opcodeTempVar2(value) { game._opcodeTempVar2 = value },
        get opcodeComparisonResult1() { return game._opcodeComparisonResult1 },
        set opcodeComparisonResult1(value) { game._opcodeComparisonResult1 = value },
        get opcodeComparisonResult2() { return game._opcodeComparisonResult2 },
        set opcodeComparisonResult2(value) { game._opcodeComparisonResult2 = value },
    }
    game.collision = {
        get nextFreeDynamicPgeCollisionSlotPoolIndex() { return game._nextFreeDynamicPgeCollisionSlotPoolIndex },
        set nextFreeDynamicPgeCollisionSlotPoolIndex(value) { game._nextFreeDynamicPgeCollisionSlotPoolIndex = value },
        get dynamicPgeCollisionSlotsByPosition() { return game._dynamicPgeCollisionSlotsByPosition },
        set dynamicPgeCollisionSlotsByPosition(value) { game._dynamicPgeCollisionSlotsByPosition = value },
        get dynamicPgeCollisionSlotObjectPool() { return game._dynamicPgeCollisionSlotObjectPool },
        set dynamicPgeCollisionSlotObjectPool(value) { game._dynamicPgeCollisionSlotObjectPool = value },
        get roomCollisionGridPatchRestoreSlotPool() { return game._roomCollisionGridPatchRestoreSlotPool },
        set roomCollisionGridPatchRestoreSlotPool(value) { game._roomCollisionGridPatchRestoreSlotPool = value },
        get nextFreeRoomCollisionGridPatchRestoreSlot() { return game._nextFreeRoomCollisionGridPatchRestoreSlot },
        set nextFreeRoomCollisionGridPatchRestoreSlot(value) { game._nextFreeRoomCollisionGridPatchRestoreSlot = value },
        get activeRoomCollisionGridPatchRestoreSlots() { return game._activeRoomCollisionGridPatchRestoreSlots },
        set activeRoomCollisionGridPatchRestoreSlots(value) { game._activeRoomCollisionGridPatchRestoreSlots = value },
        get activeRoomCollisionSlotWindow() { return game._activeRoomCollisionSlotWindow },
        set activeRoomCollisionSlotWindow(value) { game._activeRoomCollisionSlotWindow = value },
        get activeCollisionLeftRoom() { return game._activeCollisionLeftRoom },
        set activeCollisionLeftRoom(value) { game._activeCollisionLeftRoom = value },
        get activeCollisionRightRoom() { return game._activeCollisionRightRoom },
        set activeCollisionRightRoom(value) { game._activeCollisionRightRoom = value },
        get currentPgeCollisionGridX() { return game._currentPgeCollisionGridX },
        set currentPgeCollisionGridX(value) { game._currentPgeCollisionGridX = value },
        get currentPgeCollisionGridY() { return game._currentPgeCollisionGridY },
        set currentPgeCollisionGridY(value) { game._currentPgeCollisionGridY = value },
    }
    game.runtimeData = {
        get livePgesByIndex() { return game._livePgesByIndex },
        set livePgesByIndex(value) { game._livePgesByIndex = value },
        get livePgeStore() { return game._livePgeStore },
        set livePgeStore(value) { game._livePgeStore = value },
        get pendingSignalsByTargetPgeIndex() { return game._pendingSignalsByTargetPgeIndex },
        set pendingSignalsByTargetPgeIndex(value) { game._pendingSignalsByTargetPgeIndex = value },
        get inventoryItemIndicesByOwner() { return game._inventoryItemIndicesByOwner },
        set inventoryItemIndicesByOwner(value) { game._inventoryItemIndicesByOwner = value },
    }
    game.renderData = {
        get animBuffer0State() { return game._animBuffer0State },
        set animBuffer0State(value) { game._animBuffer0State = value },
        get animBuffer1State() { return game._animBuffer1State },
        set animBuffer1State(value) { game._animBuffer1State = value },
        get animBuffer2State() { return game._animBuffer2State },
        set animBuffer2State(value) { game._animBuffer2State = value },
        get animBuffer3State() { return game._animBuffer3State },
        set animBuffer3State(value) { game._animBuffer3State = value },
        get animBuffers() { return game._animBuffers },
        set animBuffers(value) { game._animBuffers = value },
    }
    return game
}

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
        _livePgeStore: { activeFrameList: [] },
        _livePgesByIndex: [{ life: 10, roomLocation: 3, posX: 32, posY: 72 }],
        _loadMap: false,
        _menu: {
            _selectedOption: 0,
            _skill: 1,
            _level: 2,
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
        _opcodeTempVar1: 99,
        _randSeed: 0,
        _score: 0,
        _res: {
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
    return attachGroupedGameState(game)
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

    assert.equal(result, false)
    assert.equal(game._stub._pi.enter, false)
    assert.equal(game.drawCalls.some(([, , , color]) => color === 0xE5), true)
    assert.equal(game.paletteUpdates.length > 0, true)
})

test('gameDidDie restores from autosave when continue is chosen', async () => {
    const game = createBaseGame({
        _autoSave: true,
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
    assert.deepEqual(loadedSlots, [kAutoSaveSlot])
    assert.equal(game._endLoop, false)
})

test('gameInpHandleSpecialKeys updates life, saves, loads, advances slots, and rewinds state', () => {
    const rewindFile = {
        offset: -1,
        seek(value) {
            this.offset = value
        },
        ioErr() {
            return false
        },
    }
    const game = createBaseGame({
        _rewindBuffer: [rewindFile],
        _rewindLen: 1,
    })
    const loadedSlots = []
    const savedSlots = []

    game._stub._pi.dbgMask = dfSetlife
    game._stub._pi.load = true
    game._stub._pi.save = true
    game._stub._pi.stateSlot = 2
    game._stub._pi.rewind = true
    game.loadGameState = (slot) => {
        loadedSlots.push(slot)
        return true
    }
    game.saveGameState = (slot) => {
        savedSlots.push(slot)
    }
    game.loadState = (file) => {
        assert.equal(file, rewindFile)
    }

    gameInpHandleSpecialKeys(game)

    assert.equal(game._livePgesByIndex[0].life, 0x7FFF)
    assert.deepEqual(loadedSlots, [5])
    assert.deepEqual(savedSlots, [5])
    assert.equal(game._stateSlot, 7)
    assert.equal(rewindFile.offset, 0)
    assert.equal(game._rewindLen, 0)
    assert.equal(game._stub._pi.load, false)
    assert.equal(game._stub._pi.save, false)
    assert.equal(game._stub._pi.rewind, false)
    assert.equal(game._stub._pi.stateSlot, 0)
})

test('gameLoadStateRewind wraps the circular buffer pointer and reports load success', () => {
    const rewindFile = {
        offset: -1,
        seek(value) {
            this.offset = value
        },
        ioErr() {
            return false
        },
    }
    const game = createBaseGame({
        _rewindBuffer: [rewindFile],
        _rewindLen: 1,
        _rewindPtr: 0,
    })
    let loadedFile = null

    game.loadState = (file) => {
        loadedFile = file
    }

    const ok = gameLoadStateRewind(game)

    assert.equal(ok, true)
    assert.equal(game._rewindPtr > 0, true)
    assert.equal(game._rewindLen, 0)
    assert.equal(loadedFile, rewindFile)
    assert.equal(rewindFile.offset, 0)
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
    game.saveGameState = (slot) => {
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
