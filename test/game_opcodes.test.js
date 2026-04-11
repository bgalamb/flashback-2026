require('ts-node/register/transpile-only')

const test = require('node:test')
const assert = require('node:assert/strict')

const { _pgeOpcodetable } = require('../src/game/game-opcodes.ts')
const {
    ctHeaderSize,
    ctGridStride,
    ctRoomSize,
    uint16Max,
    uint8Max,
    pgeFlagActive,
} = require('../src/core/game_constants.ts')
const { kIngameSaveSlot, globalGameOptionDefaults } = require('../src/core/game_constants.ts')
const { attachGroupedGameState } = require('./helpers/grouped_game_state.js')

function createAnimData(animNumber = 9, special = 0) {
    return Uint8Array.from([
        0, 1,
        0, 0,
        0, special,
        0, animNumber, 0, 0,
    ])
}

const attachOpcodeGroupedGameState = (game) => attachGroupedGameState(game, {
    world: {
        currentLevel: '_currentLevel',
        currentRoom: '_currentRoom',
        loadMap: '_loadMap',
        credits: '_credits',
        textToDisplay: '_textToDisplay',
        deathCutsceneCounter: '_deathCutsceneCounter',
    },
    ui: {
        saveStateCompleted: '_saveStateCompleted',
    },
    session: {
        validSaveState: '_validSaveState',
    },
    pge: {
        opcodeTempVar1: '_opcodeTempVar1',
    },
    runtimeData: {
        livePgesByIndex: '_livePgesByIndex',
        livePgeStore: '_livePgeStore',
        pendingSignalsByTargetPgeIndex: '_pendingSignalsByTargetPgeIndex',
    },
})

function createOpcodeGame(overrides = {}) {
    const calls = []
    const currentPge = {
        index: 0,
        posX: 16,
        posY: 70,
        roomLocation: 3,
        flags: pgeFlagActive,
        life: 10,
        scriptStateType: 2,
        firstScriptEntryIndex: 0,
        collisionSlot: 7,
        initPge: {
            counterValues: [0, 0, 0, 0],
            flags: 4,
            objectType: 2,
            scriptNodeIndex: 1,
        },
    }
    const game = {
        _credits: 0,
        _currentLevel: 0,
        _currentRoom: 3,
        _cut: {
            cutsceneIds: [],
            deathCutsceneIds: [],
            setId(id) {
                this.cutsceneIds.push(id)
            },
            setDeathCutSceneId(id) {
                this.deathCutsceneIds.push(id)
            },
        },
        _deathCutsceneCounter: 0,
        _loadMap: false,
        _livePgesByIndex: [currentPge],
        _livePgeStore: {
            activeFrameByIndex: new Array(8).fill(null),
            liveByRoom: Array.from({ length: ctRoomSize }, () => []),
        },
        _opcodeTempVar1: 0,
        _pendingSignalsByTargetPgeIndex: new Map(),
        _res: {
            level: {
                ctData: new Int8Array(ctHeaderSize + ctGridStride * ctRoomSize).fill(-1),
                objectNodesMap: {
                    1: { objects: [{ type: 2 }, { type: 7 }] },
                },
            },
            readUint16(buffer, offset = 0) {
                return ((buffer[offset] << 8) | buffer[offset + 1]) >>> 0
            },
            getAniData() {
                return createAnimData()
            },
        },
        _saveStateCompleted: false,
        _shouldPlayPgeAnimationSound: true,
        _textToDisplay: uint16Max,
        _validSaveState: false,
        getRandomNumber() {
            return 0
        },
        playSound(sfxId, softVol) {
            calls.push(['playSound', sfxId, softVol])
        },
        saveGameState(slot) {
            calls.push(['saveGameState', slot])
        },
        renders: 0,
        calls,
    }

    game._livePgesByIndex[0] = currentPge
    game._livePgeStore.activeFrameByIndex[0] = currentPge
    game._livePgeStore.liveByRoom[currentPge.roomLocation].push(currentPge)
    game.services = {
        get res() { return game._res },
        get cut() { return game._cut },
        get stub() { return game._stub },
        get vid() { return game._vid },
    }
    game.options = { ...globalGameOptionDefaults }

    Object.assign(game, overrides)
    return attachOpcodeGroupedGameState(game)
}

function runOpcode(index, args, game) {
    return _pgeOpcodetable[index](args, game)
}

test('displayText stores the current speech text id', () => {
    const game = createOpcodeGame()

    const result = runOpcode(0x7B, { pge: game._livePgesByIndex[0], a: 42, b: 0 }, game)

    assert.equal(result, uint16Max)
    assert.equal(game._textToDisplay, 42)
})

test('addToCredits updates credits, mirrors the inventory counter life, and hides the pickup', () => {
    const game = createOpcodeGame()
    const creditsItem = { life: 0 }
    const pickup = game._livePgesByIndex[0]
    pickup.initPge.counterValues[0] = 1
    pickup.initPge.counterValues[1] = 75
    game._livePgesByIndex[1] = creditsItem

    const result = runOpcode(0x65, { pge: pickup, a: 0, b: 0 }, game)

    assert.equal(result, uint16Max)
    assert.equal(game._credits, 75)
    assert.equal(creditsItem.life, 75)
    assert.equal(pickup.roomLocation, uint8Max)
})

test('saveState persists into the ingame slot and plays the save sound when enabled', () => {
    const game = createOpcodeGame()
    game.options.playGamesavedSound = true

    const result = runOpcode(0x69, { pge: game._livePgesByIndex[0], a: 0, b: 0 }, game)

    assert.equal(result, uint16Max)
    assert.equal(game._saveStateCompleted, true)
    assert.equal(game._validSaveState, true)
    assert.deepEqual(game.calls, [
        ['saveGameState', kIngameSaveSlot],
        ['playSound', 68, 0],
    ])
})

test('setPgeDefaultAnim moves the PGE to its scripted room and reloads the map for room 1', () => {
    const game = createOpcodeGame()
    const pge = game._livePgesByIndex[0]
    pge.initPge.counterValues[2] = 1
    pge.animSeq = 0

    const result = runOpcode(0x57, { pge, a: 2, b: 0 }, game)

    assert.equal(result, 1)
    assert.equal(pge.roomLocation, 1)
    assert.equal(game._loadMap, true)
    assert.equal(pge.animNumber, 9)
})

test('changeRoom copies source placement, updates room lists, and syncs matching script state', () => {
    const game = createOpcodeGame()
    const destination = {
        index: 1,
        posX: 10,
        posY: 20,
        roomLocation: 4,
        flags: 0,
        scriptStateType: 2,
        animSeq: 3,
        firstScriptEntryIndex: 0,
        initPge: { counterValues: [], objectType: 1, scriptNodeIndex: 5 },
    }
    const source = {
        index: 2,
        posX: 90,
        posY: 142,
        roomLocation: 6,
        flags: 1,
        scriptStateType: 7,
        animSeq: 0,
        firstScriptEntryIndex: 0,
        initPge: { counterValues: [], objectType: 3, scriptNodeIndex: 5 },
    }
    const trigger = game._livePgesByIndex[0]
    trigger.initPge.counterValues[0] = 1
    trigger.initPge.counterValues[1] = 2
    game._livePgesByIndex[1] = destination
    game._livePgesByIndex[2] = source
    game._livePgeStore.liveByRoom[4].push(destination)
    game._livePgeStore.liveByRoom[6].push(source)
    game._res.level.objectNodesMap[5] = { objects: [{ type: 2 }, { type: 7 }, { type: 9 }] }

    const result = runOpcode(0x82, { pge: trigger, a: 0, b: 0 }, game)

    assert.equal(result, uint16Max)
    assert.equal(destination.posX, 90)
    assert.equal(destination.posY, 142)
    assert.equal(destination.roomLocation, 6)
    assert.equal(destination.flags & 1, 1)
    assert.equal(destination.scriptStateType, 7)
    assert.equal(destination.firstScriptEntryIndex, 1)
    assert.equal(destination.animSeq, 0)
    assert.equal(destination.animNumber, 9)
    assert.equal(game._currentRoom, 6)
    assert.equal(game._loadMap, true)
    assert.equal(game._livePgeStore.liveByRoom[4].includes(destination), false)
    assert.equal(game._livePgeStore.liveByRoom[6].includes(destination), true)
})

test('playSoundGroup decodes the packed sound id and soft volume from counter values', () => {
    const game = createOpcodeGame()
    const pge = game._livePgesByIndex[0]
    pge.initPge.counterValues[3] = 0x0211

    const result = runOpcode(0x87, { pge, a: 3, b: 0 }, game)

    assert.equal(result, uint16Max)
    assert.deepEqual(game.calls, [['playSound', 0x11, 0x02]])
})

test('adjustPos snaps the position to the tile grid and floor lane', () => {
    const game = createOpcodeGame()
    const pge = game._livePgesByIndex[0]
    pge.posX = 0x3F
    pge.posY = 100

    const result = runOpcode(0x88, { pge, a: 0, b: 0 }, game)

    assert.equal(result, uint16Max)
    assert.equal(pge.posX, 0x30)
    assert.equal(pge.posY, 142)
})

test('setTempVar1 and isTempVar1Set share the same temporary opcode register', () => {
    const game = createOpcodeGame()
    const pge = game._livePgesByIndex[0]

    assert.equal(runOpcode(0x8A, { pge, a: 19, b: 0 }, game), uint16Max)
    assert.equal(game._opcodeTempVar1, 19)
    assert.equal(runOpcode(0x8B, { pge, a: 19, b: 0 }, game), uint16Max)
    assert.equal(runOpcode(0x8B, { pge, a: 20, b: 0 }, game), 0)
})

test('isInRandomRange returns true only when the random draw is divisible by the range', () => {
    const game = createOpcodeGame({
        getRandomNumber() {
            return 12
        },
    })
    const pge = game._livePgesByIndex[0]

    assert.equal(runOpcode(0x61, { pge, a: 6, b: 0 }, game), 1)
    assert.equal(runOpcode(0x61, { pge, a: 5, b: 0 }, game), 0)
    assert.equal(runOpcode(0x61, { pge, a: 0, b: 0 }, game), 0)
})

test('removePgeIfNotNear deactivates far-away PGEs and clears their collision slot', () => {
    const game = createOpcodeGame({ _currentRoom: 10 })
    const pge = game._livePgesByIndex[0]
    pge.index = 3
    pge.roomLocation = 20
    pge.collisionSlot = 12
    game._livePgeStore.activeFrameByIndex[3] = pge

    const result = runOpcode(0x43, { pge, a: 0, b: 0 }, game)

    assert.equal(result, 1)
    assert.equal((pge.flags & pgeFlagActive) === 0, true)
    assert.equal(pge.collisionSlot, uint16Max)
    assert.equal(game._livePgeStore.activeFrameByIndex[3], null)
    assert.equal(game._shouldPlayPgeAnimationSound, false)
})

test('playCutscene and playDeathCutscene only trigger when no death cutscene is active', () => {
    const game = createOpcodeGame()
    const pge = game._livePgesByIndex[0]
    pge.initPge.counterValues[3] = 4

    assert.equal(runOpcode(0x5A, { pge, a: 7, b: 0 }, game), 1)
    assert.equal(runOpcode(0x5C, { pge, a: 8, b: 0 }, game), 1)
    assert.deepEqual(game._cut.cutsceneIds, [7])
    assert.deepEqual(game._cut.deathCutsceneIds, [8])
    assert.equal(game._deathCutsceneCounter, 5)

    assert.equal(runOpcode(0x5A, { pge, a: 9, b: 0 }, game), 1)
    assert.equal(runOpcode(0x5C, { pge, a: 10, b: 0 }, game), 1)
    assert.deepEqual(game._cut.cutsceneIds, [7])
    assert.deepEqual(game._cut.deathCutsceneIds, [8])
})

test('changeLevel stores the zero-based level index', () => {
    const game = createOpcodeGame()

    const result = runOpcode(0x84, { pge: game._livePgesByIndex[0], a: 4, b: 0 }, game)

    assert.equal(result, 3)
    assert.equal(game._currentLevel, 3)
})
