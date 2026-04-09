require('ts-node/register/transpile-only')

const test = require('node:test')
const assert = require('node:assert/strict')

const gamePge = require('../src/game/game_pge.ts')
const { Mixer } = require('../src/audio/mixer.ts')
const {
    ctUpRoom,
    ctDownRoom,
    ctLeftRoom,
    ctRightRoom,
} = require('../src/game/game.ts')
const {
    ctGridStride,
    ctHeaderSize,
    gamescreenH,
    gamescreenW,
    pgeFlagFlipX,
    pgeFlagSpecialAnim,
    uint16Max,
    uint8Max,
} = require('../src/core/game_constants.ts')
const {
    gameGetRandomNumber,
    gameChangeLevel,
    gameInpUpdate,
    gameResetGameState,
    gameLoadMonsterSprites,
    gameHasLevelMap,
    gameLoadLevelMap,
    gameClearLivePGETables,
    gameCreatePgeLiveTable1,
    gameLoadLevelData,
    gameClearStateRewind,
    gameIsAboveRoomPge,
    gameIsBelowRoomPge,
    gameIsLeftRoomPge,
    gameIsRightRoomPge,
    gamePrepareAnimsHelper,
    gamePrepareCurrentRoomAnims,
    gamePrepareAdjacentRoomAnims,
    gamePrepareAnimationsInRooms,
} = require('../src/game/game_world.ts')
const { attachGroupedGameState } = require('./helpers/grouped_game_state.js')

const attachWorldGroupedGameState = (game) => attachGroupedGameState(game, {
    services: {
        res: '_res',
        vid: '_vid',
        mix: '_mix',
        cut: '_cut',
        stub: '_stub',
    },
    world: {
        currentIcon: '_currentIcon',
        currentLevel: '_currentLevel',
        currentRoom: '_currentRoom',
        loadMap: '_loadMap',
        printLevelCodeCounter: '_printLevelCodeCounter',
        credits: '_credits',
        blinkingConradCounter: '_blinkingConradCounter',
        textToDisplay: '_textToDisplay',
        deathCutsceneCounter: '_deathCutsceneCounter',
    },
    ui: {
        currentRoomOverlayCounter: '_currentRoomOverlayCounter',
        saveStateCompleted: '_saveStateCompleted',
        skillLevel: '_skillLevel',
    },
    session: {
        randSeed: '_randSeed',
        startedFromLevelSelect: '_startedFromLevelSelect',
        validSaveState: '_validSaveState',
    },
    pge: {
        shouldProcessCurrentPgeObjectNode: '_shouldProcessCurrentPgeObjectNode',
        opcodeTempVar1: '_opcodeTempVar1',
        opcodeTempVar2: '_opcodeTempVar2',
    },
    collision: {
        roomCollisionGridPatchRestoreSlotPool: '_roomCollisionGridPatchRestoreSlotPool',
        nextFreeRoomCollisionGridPatchRestoreSlot: '_nextFreeRoomCollisionGridPatchRestoreSlot',
        activeRoomCollisionGridPatchRestoreSlots: '_activeRoomCollisionGridPatchRestoreSlots',
    },
    runtimeData: {
        livePgesByIndex: '_livePgesByIndex',
        livePgeStore: '_livePgeStore',
        inventoryItemIndicesByOwner: '_inventoryItemIndicesByOwner',
    },
    renderData: {
        animBuffer0State: '_animBuffer0State',
        animBuffer1State: '_animBuffer1State',
        animBuffer2State: '_animBuffer2State',
        animBuffer3State: '_animBuffer3State',
        animBuffers: '_animBuffers',
    },
})

function createWorldGame(overrides = {}) {
    const loadCalls = []
    const roomCollisionPool = [{ id: 'slot-0' }, { id: 'slot-1' }]
    const game = {
        _animBuffer0State: [{}, {}],
        _animBuffer1State: [{}, {}],
        _animBuffer2State: [{}, {}],
        _animBuffer3State: [{}, {}],
        _animBuffers: {
            _states: [null, null, null, null],
            _curPos: [0, 0, 0, 0],
            addStateCalls: [],
            addState(...args) {
                this.addStateCalls.push(args)
            },
        },
        _blinkingConradCounter: 4,
        _credits: 5,
        _currentIcon: 0,
        _currentLevel: 1,
        _currentRoom: 0,
        _currentRoomOverlayCounter: 3,
        _cut: {
            deathCutsceneId: null,
            ids: [],
            setDeathCutSceneId(id) {
                this.deathCutsceneId = id
            },
            setId(id) {
                this.ids.push(id)
            },
        },
        _deathCutsceneCounter: 2,
        _inventoryItemIndicesByOwner: new Map([[1, [2, 3]]]),
        _livePgeStore: {
            activeFrameByIndex: ['x', 'y'],
            activeFrameList: ['a'],
            initByIndex: null,
            liveByRoom: Array.from({ length: 0x40 }, () => []),
        },
        _livePgesByIndex: [
            {
                index: 0,
                animNumber: 0,
                flags: 0,
                initPge: { initRoom: 7, objectType: 1, scriptNodeIndex: 12 },
                posX: 40,
                posY: 100,
                roomLocation: 7,
                scriptStateType: 1,
                firstScriptEntryIndex: 0,
            },
            {
                index: 1,
                animNumber: 0,
                flags: 0,
                initPge: { initRoom: 9, objectType: 1, scriptNodeIndex: 22 },
                posX: 60,
                posY: 120,
                roomLocation: 9,
                scriptStateType: 1,
                firstScriptEntryIndex: 0,
            },
        ],
        _loadMap: false,
        _loadedMonsterVisualsByScriptNodeIndex: new Map(),
        _mix: {
            calls: [],
            playMusic(track) {
                this.calls.push(track)
            },
        },
        _opcodeTempVar1: 8,
        _opcodeTempVar2: 9,
        _printLevelCodeCounter: 0,
        _randSeed: 0x1234,
        _res: {
            level: {
                ctData: new Uint8Array(ctHeaderSize + ctGridStride * 0x40),
                objectNodesMap: {
                    12: { objects: [{ type: 1 }, { type: 57 }] },
                    22: { objects: [{ type: 1 }] },
                },
                pgeAllInitialStateFromFile: [
                    { initRoom: 7, objectType: 1, scriptNodeIndex: 12, skill: 0 },
                    { initRoom: 9, objectType: 1, scriptNodeIndex: 22, skill: 2 },
                ],
                pgeTotalNumInFile: 2,
                ani: Uint8Array.from([1]),
            },
            sprites: {
                numSpc: 1,
                resolvedSpriteSet: {
                    spritesByIndex: [Uint8Array.from([1, 2, 3, 4, 9, 8, 7])],
                },
                spc: Uint8Array.from([0, 0, 5, 6, 7]),
            },
            async load(name, type) {
                loadCalls.push(['load', name, type])
            },
            async loadCollisionData(name) {
                loadCalls.push(['loadCollisionData', name])
            },
            clearLevelAllResources() {
                loadCalls.push(['clearLevelAllResources'])
            },
            clearBankData() {
                loadCalls.push(['clearBankData'])
            },
            async loadMonsterResolvedSpriteSet(name) {
                loadCalls.push(['loadMonsterResolvedSpriteSet', name])
                return { spritesByIndex: [] }
            },
        },
        _roomCollisionGridPatchRestoreSlotPool: roomCollisionPool,
        _saveStateCompleted: true,
        _shouldProcessCurrentPgeObjectNode: true,
        _skillLevel: 1,
        _startedFromLevelSelect: false,
        _textToDisplay: 3,
        _validSaveState: true,
        _vid: {
            calls: [],
            async fadeOut() {
                this.calls.push('fadeOut')
            },
            setPalette0xF() {
                this.calls.push('setPalette0xF')
            },
            setTextPalette() {
                this.calls.push('setTextPalette')
            },
            fullRefresh() {
                this.calls.push('fullRefresh')
            },
            async pcDecodemap(level, room) {
                this.calls.push(['PC_decodeMap', level, room])
            },
            setPaletteSlotLE(slot, palette) {
                this.calls.push(['setPaletteSlotLE', slot, palette.length])
            },
        },
        clearStateRewindCalls: 0,
        clearStateRewind() {
            this.clearStateRewindCalls += 1
        },
        loadLevelDataCalls: 0,
        async loadLevelData() {
            this.loadLevelDataCalls += 1
        },
        loadLevelMapCalls: [],
        async loadLevelMap(room) {
            this.loadLevelMapCalls.push(room)
        },
        processEventsCalls: 0,
        _stub: {
            async processEvents() {
                game.processEventsCalls += 1
            },
        },
        resetPgeGroupsCalls: 0,
        resetPgeGroups() {
            this.resetPgeGroupsCalls += 1
        },
        loadPgeForCurrentLevelCalls: [],
        loadPgeForCurrentLevel(index, currentRoom) {
            this.loadPgeForCurrentLevelCalls.push([index, currentRoom])
            const pge = this._livePgesByIndex[index]
            pge.roomLocation = currentRoom
            pge.initPge = this._res.level.pgeAllInitialStateFromFile[index]
        },
        async loadMonsterSprites(pge, currentRoom) {
            return gameLoadMonsterSprites(this, pge, currentRoom)
        },
        debugStartFrame: 0,
        renders: 0,
        loadCalls,
    }

    Object.assign(game, overrides)
    return attachWorldGroupedGameState(game)
}

test('gameGetRandomNumber advances the seed and returns the low 16 bits', () => {
    const game = createWorldGame({ _randSeed: 1 })
    const expectedSeed = (1 * 2) ^ 0x1D872B41

    const value = gameGetRandomNumber(game)

    assert.equal(value, expectedSeed & uint16Max)
    assert.equal(game._randSeed, expectedSeed)
})

test('gameChangeLevel fades out, reloads level state, and refreshes palettes', async () => {
    const game = createWorldGame({ _currentRoom: 11 })

    await gameChangeLevel(game)

    assert.equal(game.clearStateRewindCalls, 1)
    assert.equal(game.loadLevelDataCalls, 1)
    assert.deepEqual(game.loadLevelMapCalls, [11])
    assert.deepEqual(game._vid.calls, ['fadeOut', 'setPalette0xF', 'setTextPalette', 'fullRefresh'])
    assert.equal(game._currentRoomOverlayCounter, 90)
})

test('gameInpUpdate forwards to the stub event pump', async () => {
    const game = createWorldGame()

    await gameInpUpdate(game)

    assert.equal(game.processEventsCalls, 1)
})

test('gameResetGameState restores animation buffers and runtime defaults', () => {
    const game = createWorldGame()

    gameResetGameState(game)

    assert.equal(game._animBuffers._states[0], game._animBuffer0State)
    assert.equal(game._animBuffers._states[3], game._animBuffer3State)
    assert.deepEqual(game._animBuffers._curPos, [uint8Max, uint8Max, uint8Max, uint8Max])
    assert.equal(game._currentRoom, 7)
    assert.equal(game._cut.deathCutsceneId, uint16Max)
    assert.equal(game._opcodeTempVar2, uint16Max)
    assert.equal(game._deathCutsceneCounter, 0)
    assert.equal(game._credits, 0)
    assert.equal(game._saveStateCompleted, false)
    assert.equal(game._loadMap, true)
    assert.equal(game.resetPgeGroupsCalls, 1)
    assert.equal(game._inventoryItemIndicesByOwner.size, 0)
    assert.equal(game._blinkingConradCounter, 0)
    assert.equal(game._currentRoomOverlayCounter, 0)
    assert.equal(game._shouldProcessCurrentPgeObjectNode, false)
    assert.equal(game._opcodeTempVar1, 0)
    assert.equal(game._textToDisplay, uint16Max)
})

test('gameLoadMonsterSprites loads and caches visuals for monsters in the current room', async () => {
    const game = createWorldGame()
    const monster = {
        initPge: { scriptNodeIndex: 34, objectType: 10 },
        roomLocation: 4,
    }

    const first = await gameLoadMonsterSprites(game, monster, 4)
    const second = await gameLoadMonsterSprites(game, monster, 4)

    assert.equal(first, uint16Max)
    assert.equal(second, uint16Max)
    assert.equal(game.loadCalls.filter(([name]) => name === 'loadMonsterResolvedSpriteSet').length, 1)
    assert.equal(game._loadedMonsterVisualsByScriptNodeIndex.has(34), true)
    assert.equal(game._vid.calls.some((call) => Array.isArray(call) && call[0] === 'setPaletteSlotLE'), true)
})

test('gamePrepareAnimsHelper loads monster visuals and queues monster sprites with the monster palette slot', async () => {
    const game = createWorldGame({
        _currentLevel: 1,
        _res: {
            level: {
                ctData: new Uint8Array(ctHeaderSize + ctGridStride * 0x40),
                objectNodesMap: {
                    12: { objects: [{ type: 1 }, { type: 57 }] },
                    22: { objects: [{ type: 1 }] },
                },
                pgeAllInitialStateFromFile: [
                    { initRoom: 7, objectType: 1, scriptNodeIndex: 12, skill: 0 },
                    { initRoom: 9, objectType: 1, scriptNodeIndex: 22, skill: 2 },
                ],
                pgeTotalNumInFile: 2,
                ani: Uint8Array.from([1]),
            },
            sprites: {
                numSpc: 1,
                resolvedSpriteSet: {
                    spritesByIndex: [Uint8Array.from([1, 2, 3, 4, 9, 8, 7])],
                },
                spc: Uint8Array.from([0, 0, 5, 6, 7]),
            },
            async loadMonsterResolvedSpriteSet(name) {
                game.loadCalls.push(['loadMonsterResolvedSpriteSet', name])
                return {
                    spritesByIndex: [Uint8Array.from([2, 1, 5, 6, 7, 8, 9])],
                }
            },
        },
    })
    const monster = {
        index: 4,
        animNumber: 0,
        flags: 0,
        initPge: { objectType: 10, scriptNodeIndex: 34 },
        posX: 30,
        posY: 50,
        roomLocation: 4,
    }

    await gamePrepareAnimsHelper(game, monster, 0, 0, 4)

    assert.deepEqual(game._animBuffers.addStateCalls, [[
        0,
        36,
        51,
        Uint8Array.from([7, 8, 9]),
        monster,
        5,
        6,
        80,
    ]])
    assert.equal(game._loadedMonsterVisualsByScriptNodeIndex.has(34), true)
})

test('gameHasLevelMap detects room exits and collision-grid data', () => {
    const game = createWorldGame()
    const room = 5

    assert.equal(gameHasLevelMap(game, room), false)

    game._res.level.ctData[ctUpRoom + room] = 1
    assert.equal(gameHasLevelMap(game, room), true)

    game._res.level.ctData[ctUpRoom + room] = 0
    game._res.level.ctData[ctHeaderSize + room * ctGridStride + 3] = 9
    assert.equal(gameHasLevelMap(game, room), true)
    assert.equal(gameHasLevelMap(game, -1), false)
    assert.equal(gameHasLevelMap(game, 0x40), false)
})

test('gameLoadLevelMap resets the current icon and decodes the room map', async () => {
    const game = createWorldGame({ _currentLevel: 3, _currentIcon: 4 })

    await gameLoadLevelMap(game, 12)

    assert.equal(game._currentIcon, uint8Max)
    assert.deepEqual(game._vid.calls, [['PC_decodeMap', 3, 12]])
})

test('gameClearLivePGETables empties per-room and per-frame registries', () => {
    const game = createWorldGame()
    game._livePgeStore.liveByRoom[3].push('pge')

    gameClearLivePGETables(game)

    assert.equal(game._livePgeStore.liveByRoom[3].length, 0)
    assert.deepEqual(game._livePgeStore.activeFrameByIndex, [null, null])
    assert.equal(game._livePgeStore.activeFrameList.length, 0)
    assert.equal(game._inventoryItemIndicesByOwner.size, 0)
})

test('gameCreatePgeLiveTable1 keeps only PGEs allowed by the current skill level', () => {
    const game = createWorldGame()

    gameCreatePgeLiveTable1(game)

    assert.deepEqual(game._livePgeStore.liveByRoom[7], [game._livePgesByIndex[0]])
    assert.deepEqual(game._livePgeStore.liveByRoom[9], [])
})

test('gameLoadLevelData loads level assets, recreates live tables, and applies direct-start overrides', async () => {
    const originalInitializePgeDefaultAnimation = gamePge.gameInitializePgeDefaultAnimation
    const initCalls = []
    const game = createWorldGame({
        _currentLevel: 3,
        _startedFromLevelSelect: true,
        _res: {
            level: {
                ani: Uint8Array.from([1]),
                ctData: new Uint8Array(ctHeaderSize + ctGridStride * 0x40),
                objectNodesMap: {
                    12: { objects: [{ type: 1 }, { type: 57 }] },
                    22: { objects: [{ type: 1 }] },
                },
                pgeAllInitialStateFromFile: [
                    { initRoom: 7, objectType: 1, scriptNodeIndex: 12, skill: 0 },
                    { initRoom: 9, objectType: 1, scriptNodeIndex: 22, skill: 0 },
                ],
                pgeTotalNumInFile: 2,
            },
            sprites: {
                numSpc: 1,
                resolvedSpriteSet: { spritesByIndex: [Uint8Array.from([1, 2, 3, 4, 9])] },
                spc: Uint8Array.from([0, 0, 5]),
            },
            async load(name, type) {
                game.loadCalls.push(['load', name, type])
            },
            async loadCollisionData(name) {
                game.loadCalls.push(['loadCollisionData', name])
            },
            clearLevelAllResources() {
                game.loadCalls.push(['clearLevelAllResources'])
            },
            clearBankData() {
                game.loadCalls.push(['clearBankData'])
            },
        },
    })

    gamePge.gameInitializePgeDefaultAnimation = (_game, pge) => {
        initCalls.push(pge.index)
    }

    try {
        const currentRoom = await gameLoadLevelData(game)

        assert.equal(currentRoom, 39)
        assert.equal(game._currentRoom, 39)
        assert.deepEqual(game.loadPgeForCurrentLevelCalls, [[1, 39], [0, 39]])
        assert.equal(game._cut.ids.length, 1)
        assert.equal(game._loadedMonsterVisualsByScriptNodeIndex.size, 0)
        assert.equal(game._printLevelCodeCounter, 150)
        assert.equal(game._nextFreeRoomCollisionGridPatchRestoreSlot, game._roomCollisionGridPatchRestoreSlotPool[0])
        assert.equal(game._activeRoomCollisionGridPatchRestoreSlots, null)
        assert.equal(game._livePgeStore.initByIndex, game._res.level.pgeAllInitialStateFromFile)
        assert.equal(game._validSaveState, false)
        assert.equal(game.resetPgeGroupsCalls, 1)
        assert.deepEqual(game._mix.calls, [Mixer.musicTrack + 6])
        assert.equal(game._livePgesByIndex[0].roomLocation, 39)
        assert.equal(game._livePgesByIndex[0].posX, 64)
        assert.equal(game._livePgesByIndex[0].posY, 142)
        assert.equal(game._livePgesByIndex[0].scriptStateType, 57)
        assert.equal(game._livePgesByIndex[0].firstScriptEntryIndex, 1)
        assert.equal(game._livePgesByIndex[0].animSeq, 0)
        assert.deepEqual(initCalls, [0])
    } finally {
        gamePge.gameInitializePgeDefaultAnimation = originalInitializePgeDefaultAnimation
    }
})

test('gameClearStateRewind closes buffered states and resets the rewind cursor', () => {
    const closed = []
    const game = createWorldGame({
        _rewindBuffer: Array.from({ length: 120 }, (_, index) => ({
            close() {
                closed.push(index)
            },
        })),
        _rewindLen: 2,
        _rewindPtr: 0,
    })

    gameClearStateRewind(game)

    assert.deepEqual(closed, [0, 119])
    assert.equal(game._rewindPtr, -1)
    assert.equal(game._rewindLen, 0)
})

test('room-boundary helpers classify PGEs crossing neighboring rooms', () => {
    assert.equal(gameIsAboveRoomPge(null, { initPge: { objectType: 1 }, posY: 177 }), true)
    assert.equal(gameIsAboveRoomPge(null, { initPge: { objectType: 10 }, posY: 217 }), true)
    assert.equal(gameIsBelowRoomPge(null, { posY: 47 }), true)
    assert.equal(gameIsLeftRoomPge(null, { posX: gamescreenH + 1 }), true)
    assert.equal(gameIsRightRoomPge(null, { posX: 32 }), true)
})

test('room-boundary helpers ignore malformed PGEs instead of throwing', () => {
    assert.equal(gameIsAboveRoomPge(null, null), false)
    assert.equal(gameIsAboveRoomPge(null, { posY: 300 }), false)
    assert.equal(gameIsBelowRoomPge(null, {}), false)
    assert.equal(gameIsLeftRoomPge(null, { posX: 'oops' }), false)
    assert.equal(gameIsRightRoomPge(null, { initPge: { objectType: 1 } }), false)
})

test('gamePrepareAnimsHelper adds visible sprites to the appropriate animation buffer', async () => {
    const game = createWorldGame()
    const conrad = game._livePgesByIndex[0]

    await gamePrepareAnimsHelper(game, conrad, 0, 0, conrad.roomLocation)

    assert.deepEqual(game._animBuffers.addStateCalls[0], [
        1,
        47,
        100,
        Uint8Array.from([9, 8, 7]),
        conrad,
        3,
        4,
        -1,
    ])
})

test('gamePrepareAnimationsInRooms keeps Conrad on the dedicated player animation layer in the current room', async () => {
    const game = createWorldGame()
    const conrad = game._livePgesByIndex[0]

    game._livePgeStore.liveByRoom[conrad.roomLocation] = [conrad]

    await gamePrepareAnimationsInRooms(game, conrad.roomLocation)

    assert.deepEqual(game._animBuffers.addStateCalls, [[
        1,
        47,
        100,
        Uint8Array.from([9, 8, 7]),
        conrad,
        3,
        4,
        -1,
    ]])
})

test('gamePrepareAnimsHelper queues visible non-player PGEs on their object layer with the barrier palette override', async () => {
    const game = createWorldGame()
    const visiblePge = {
        index: 6,
        animNumber: 0,
        flags: 0x10,
        initPge: { objectType: 6, scriptNodeIndex: 55 },
        posX: 60,
        posY: 70,
        roomLocation: 0,
    }

    await gamePrepareAnimsHelper(game, visiblePge, 0, 0, 0)

    assert.deepEqual(game._animBuffers.addStateCalls, [[
        2,
        67,
        70,
        Uint8Array.from([9, 8, 7]),
        visiblePge,
        3,
        4,
        96,
    ]])
})

test('gamePrepareAnimsHelper handles special animations and flip-x sprites', async () => {
    const game = createWorldGame()
    const special = {
        index: 2,
        animNumber: 0,
        flags: pgeFlagSpecialAnim,
        initPge: { objectType: 11, scriptNodeIndex: 99 },
        posX: 20,
        posY: 30,
    }
    const flipped = {
        index: 3,
        animNumber: 0,
        flags: pgeFlagFlipX,
        initPge: { objectType: 6, scriptNodeIndex: 77 },
        posX: 50,
        posY: 60,
        roomLocation: 0,
    }

    await gamePrepareAnimsHelper(game, special, 0, 0, 0)
    await gamePrepareAnimsHelper(game, flipped, 0, 0, 0)

    assert.deepEqual(game._animBuffers.addStateCalls[0], [
        3,
        28,
        32,
        Uint8Array.from([0, 0, 5, 6, 7]),
        special,
    ])
    assert.deepEqual(game._animBuffers.addStateCalls[1], [
        0,
        56,
        60,
        Uint8Array.from([9, 8, 7]),
        flipped,
        3,
        4,
        96,
    ])
})

test('animation preparation walks current and adjacent rooms with the correct filters', async () => {
    const game = createWorldGame()
    const currentPge = { index: 10, animNumber: 0, flags: 0, roomLocation: 4, posX: 50, posY: 90, initPge: { objectType: 1, scriptNodeIndex: 1 } }
    const leftPge = { index: 11, animNumber: 0, flags: 0, roomLocation: 5, posX: gamescreenW + 24, posY: 100, initPge: { objectType: 1, scriptNodeIndex: 1 } }
    const rightPge = { index: 12, animNumber: 0, flags: 0, roomLocation: 6, posX: 16, posY: 100, initPge: { objectType: 1, scriptNodeIndex: 1 } }
    const skippedRightPge = { index: 13, animNumber: 0, flags: 0, roomLocation: 6, posX: 50, posY: 100, initPge: { objectType: 1, scriptNodeIndex: 1 } }

    game._livePgeStore.liveByRoom[4] = [currentPge]
    game._livePgeStore.liveByRoom[5] = [leftPge]
    game._livePgeStore.liveByRoom[6] = [rightPge, skippedRightPge]
    game._res.level.ctData[ctLeftRoom + 4] = 5
    game._res.level.ctData[ctRightRoom + 4] = 6
    game._res.level.ctData[ctUpRoom + 4] = uint8Max
    game._res.level.ctData[ctDownRoom + 4] = uint8Max

    await gamePrepareCurrentRoomAnims(game, 4)
    await gamePrepareAdjacentRoomAnims(game, ctLeftRoom, -gamescreenW, 0, gameIsLeftRoomPge, 4)
    await gamePrepareAnimationsInRooms(game, 4)

    assert.deepEqual(game._animBuffers.addStateCalls.map(([state, x, y, _data, pge]) => [state, x, y, pge.index]), [
        [0, 57, 90, 10],
        [0, 31, 100, 11],
        [0, 57, 90, 10],
        [0, 31, 100, 11],
    ])
})

test('animation preparation tolerates missing room buckets', async () => {
    const game = createWorldGame()
    game._res.level.ctData[ctLeftRoom + 4] = 5
    game._res.level.ctData[ctRightRoom + 4] = 6
    game._res.level.ctData[ctUpRoom + 4] = uint8Max
    game._res.level.ctData[ctDownRoom + 4] = uint8Max
    game._livePgeStore.liveByRoom[4] = undefined
    game._livePgeStore.liveByRoom[5] = undefined
    game._livePgeStore.liveByRoom[6] = undefined

    await gamePrepareCurrentRoomAnims(game, 4)
    await gamePrepareAdjacentRoomAnims(game, ctLeftRoom, -gamescreenW, 0, gameIsLeftRoomPge, 4)
    await gamePrepareAnimationsInRooms(game, 4)

    assert.deepEqual(game._animBuffers.addStateCalls, [])
})

test('animation preparation skips malformed adjacent PGEs without throwing', async () => {
    const game = createWorldGame()
    const currentPge = { index: 10, animNumber: 0, flags: 0, roomLocation: 4, posX: 50, posY: 90, initPge: { objectType: 1, scriptNodeIndex: 1 } }
    const validAbovePge = { index: 11, animNumber: 0, flags: 0, roomLocation: 7, posX: 50, posY: 177, initPge: { objectType: 1, scriptNodeIndex: 1 } }

    game._livePgeStore.liveByRoom[4] = [currentPge]
    game._livePgeStore.liveByRoom[7] = [null, undefined, { posY: 220 }, validAbovePge]
    game._res.level.ctData[ctUpRoom + 4] = 7
    game._res.level.ctData[ctDownRoom + 4] = uint8Max
    game._res.level.ctData[ctLeftRoom + 4] = uint8Max
    game._res.level.ctData[ctRightRoom + 4] = uint8Max

    await gamePrepareAnimationsInRooms(game, 4)

    assert.deepEqual(game._animBuffers.addStateCalls.map(([state, x, y, _data, pge]) => [state, x, y, pge.index]), [
        [0, 57, 90, 10],
        [0, 57, -39, 11],
    ])
})
