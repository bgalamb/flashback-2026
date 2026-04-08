require('ts-node/register/transpile-only')

const test = require('node:test')
const assert = require('node:assert/strict')

const {
    initPgeFlagHasCollision,
    initPgeFlagInCurrentRoomList,
    objFlagDecLife,
    objFlagIncLife,
    objFlagToggleMirror,
    pgeFlagActive,
    pgeFlagFlipX,
    pgeFlagMirrored,
    pgeFlagSpecialAnim,
    uint16Max,
} = require('../src/core/game_constants.ts')
const { ctLeftRoom, ctRightRoom } = require('../src/game/game.ts')
const gameCollision = require('../src/game/game_collision.ts')
const gamePge = require('../src/game/game_pge.ts')
const { attachGroupedGameState } = require('./helpers/grouped_game_state.js')

const attachPgeGroupedGameState = (game) => attachGroupedGameState(game, {
    services: {
        res: '_res',
        stub: '_stub',
    },
    world: {
        currentRoom: '_currentRoom',
        loadMap: '_loadMap',
        blinkingConradCounter: '_blinkingConradCounter',
    },
    ui: {
        skillLevel: '_skillLevel',
        score: '_score',
    },
    session: {
        startedFromLevelSelect: '_startedFromLevelSelect',
    },
    pge: {
        currentPgeInputMask: '_currentPgeInputMask',
        currentPgeRoom: '_currentPgeRoom',
        shouldProcessCurrentPgeObjectNode: '_shouldProcessCurrentPgeObjectNode',
        currentPgeFacingIsMirrored: '_currentPgeFacingIsMirrored',
    },
    collision: {
        currentPgeCollisionGridX: '_currentPgeCollisionGridX',
        currentPgeCollisionGridY: '_currentPgeCollisionGridY',
        nextFreeDynamicPgeCollisionSlotPoolIndex: '_nextFreeDynamicPgeCollisionSlotPoolIndex',
        dynamicPgeCollisionSlotsByPosition: '_dynamicPgeCollisionSlotsByPosition',
        dynamicPgeCollisionSlotObjectPool: '_dynamicPgeCollisionSlotObjectPool',
    },
    runtimeData: {
        livePgesByIndex: '_livePgesByIndex',
        livePgeStore: '_livePgeStore',
        pendingSignalsByTargetPgeIndex: '_pendingSignalsByTargetPgeIndex',
    },
})

function createPgeGame() {
    return attachPgeGroupedGameState({
        _blinkingConradCounter: 0,
        _currentPgeCollisionGridX: 0,
        _currentPgeCollisionGridY: 0,
        _currentPgeInputMask: 0,
        _currentPgeRoom: 1,
        _currentRoom: 1,
        _dynamicPgeCollisionSlotObjectPool: [],
        _dynamicPgeCollisionSlotsByPosition: new Map(),
        _inpLastkeyshit: 0,
        _inpLastkeyshitleftright: 8,
        _livePgesByIndex: [],
        _livePgeStore: {
            activeFrameByIndex: new Array(8).fill(null),
            liveByRoom: Array.from({ length: 0x40 }, () => []),
        },
        _loadMap: false,
        _nextFreeDynamicPgeCollisionSlotPoolIndex: 0,
        _pendingSignalsByTargetPgeIndex: new Map(),
        _res: {
            level: {
                ctData: new Int8Array(0x200).fill(-1),
                numObjectNodes: 4,
                objectNodesMap: {},
            },
            readUint16(buffer, offset = 0) {
                return (buffer[offset] << 8) | buffer[offset + 1]
            },
            getAniData() {
                return Uint8Array.from([
                    0, 2,
                    0, 0,
                    0, 1,
                    0, 9, 0xFF, 0x02,
                    0, 10, 0x01, 0x03,
                ])
            },
        },
        _score: 0,
        _shouldPlayPgeAnimationSound: false,
        _shouldProcessCurrentPgeObjectNode: false,
        _startedFromLevelSelect: false,
        _stub: {
            _pi: {
                dirMask: 0,
                enter: false,
                space: false,
                shift: false,
            },
        },
        debugStartFrame: 99999,
        inpCalls: 0,
        async inpUpdate() {
            this.inpCalls += 1
        },
        renders: 0,
    })
}

test('gameUpdatePgeDirectionalInputState preserves the last left/right direction when vertical input is also pressed', async () => {
    const game = createPgeGame()
    game._stub._pi.dirMask = 0x9
    game._stub._pi.enter = true
    game._stub._pi.space = true
    game._stub._pi.shift = true

    await gamePge.gameUpdatePgeDirectionalInputState(game)

    assert.equal(game.inpCalls, 1)
    assert.equal(game._currentPgeInputMask, 0x78)
    assert.equal(game._inpLastkeyshit, 0x08)
})

test('gameQueuePgeGroupSignal activates collision-capable inactive targets and records pending signals', () => {
    const game = createPgeGame()
    const sender = { roomLocation: 3 }
    const target = {
        index: 2,
        flags: 0,
        roomLocation: 3,
        initPge: { flags: initPgeFlagHasCollision },
    }
    game._livePgesByIndex[0] = sender
    game._livePgesByIndex[2] = target

    gamePge.gameQueuePgeGroupSignal(game, 0, 2, 4)

    assert.equal((target.flags & pgeFlagActive) !== 0, true)
    assert.equal(game._livePgeStore.activeFrameByIndex[2], target)
    assert.deepEqual(game._pendingSignalsByTargetPgeIndex.get(2), [{ senderPgeIndex: 0, signalId: 4 }])
})

test('gameApplyNextPgeAnimationFrameFromGroups fast-forwards to the end of the matching animation', () => {
    const game = createPgeGame()
    const pge = {
        animSeq: 0,
        firstScriptEntryIndex: 0,
        flags: 0,
        initPge: { scriptNodeIndex: 1 },
        posX: 10,
        posY: 20,
        scriptStateType: 3,
    }
    game._res.level.objectNodesMap[1] = {
        lastObjNumber: 1,
        objects: [
            { type: 3, opcode1: 0, opcodeArg1: 0, opcode2: 0x22, opcodeArg2: 5 },
            { type: 4, opcode1: 0, opcodeArg1: 0, opcode2: 0, opcodeArg2: 0 },
        ],
    }

    gamePge.gameApplyNextPgeAnimationFrameFromGroups(game, pge, [{ senderPgeIndex: 1, signalId: 5 }])

    assert.equal(pge.animSeq, 2)
    assert.equal(pge.posX, 10)
    assert.equal(pge.posY, 25)
    assert.equal(game._currentPgeCollisionGridX, 1)
    assert.equal(game._currentPgeCollisionGridY, 0)
})

test('gameLoadPgeForCurrentLevel initializes Conrad with player defaults and the default animation', () => {
    const game = createPgeGame()
    const conrad = {}
    const initialState = {
        type: 57,
        posX: 48,
        posY: 96,
        initRoom: 7,
        roomLocation: 0,
        life: 5,
        skill: 0,
        objectType: 1,
        mirrorX: 1,
        initFlags: 0,
        flags: initPgeFlagInCurrentRoomList,
        scriptNodeIndex: 1,
    }

    game._livePgesByIndex[0] = conrad
    game._res.level.pgeAllInitialStateFromFile = [initialState]
    game._res.level.objectNodesMap[1] = {
        numObjects: 2,
        objects: [
            { type: 1 },
            { type: 57 },
        ],
    }

    gamePge.gameLoadPgeForCurrentLevel(game, 0, 7)

    assert.equal(conrad.initPge, initialState)
    assert.equal(conrad.scriptStateType, 57)
    assert.equal(conrad.posX, 48)
    assert.equal(conrad.posY, 96)
    assert.equal(conrad.roomLocation, 7)
    assert.equal(conrad.life, 20)
    assert.equal(conrad.firstScriptEntryIndex, 1)
    assert.equal(conrad.animSeq, 0)
    assert.equal(conrad.animNumber, 9)
    assert.equal((conrad.flags & pgeFlagActive) !== 0, true)
    assert.equal((conrad.flags & pgeFlagMirrored) !== 0, true)
    assert.equal((conrad.flags & pgeFlagFlipX) !== 0, true)
    assert.equal((conrad.flags & pgeFlagSpecialAnim) !== 0, true)
    assert.equal(game._livePgeStore.activeFrameByIndex[0], conrad)
})

test('gameLoadPgeForCurrentLevel initializes monsters with doubled expert life and their default animation', () => {
    const game = createPgeGame()
    const monster = {}
    const initialState = {
        type: 9,
        posX: 70,
        posY: 120,
        initRoom: 5,
        roomLocation: 1,
        life: 7,
        skill: 0,
        objectType: 10,
        mirrorX: 0,
        initFlags: 0,
        flags: 0,
        scriptNodeIndex: 2,
    }

    game._skillLevel = 2
    game._livePgesByIndex[1] = monster
    game._res.level.pgeAllInitialStateFromFile = [{}, initialState]
    game._res.level.objectNodesMap[2] = {
        numObjects: 2,
        objects: [
            { type: 1 },
            { type: 9 },
        ],
    }

    gamePge.gameLoadPgeForCurrentLevel(game, 1, 3)

    assert.equal(monster.initPge, initialState)
    assert.equal(monster.scriptStateType, 9)
    assert.equal(monster.posX, 70)
    assert.equal(monster.posY, 120)
    assert.equal(monster.roomLocation, 5)
    assert.equal(monster.life, 14)
    assert.equal(monster.firstScriptEntryIndex, 1)
    assert.equal(monster.animSeq, 0)
    assert.equal(monster.animNumber, 9)
    assert.equal((monster.flags & pgeFlagActive) !== 0, true)
    assert.equal((monster.flags & pgeFlagSpecialAnim) !== 0, true)
    assert.equal(game._livePgeStore.activeFrameByIndex[1], monster)
})

test('gameHandlePgeRoomTransitionAndActivation updates Conrad room changes and activates current-room entries', () => {
    const originalRebuild = gameCollision.gameRebuildActiveRoomCollisionSlotLookup
    const rebuildCalls = []
    const game = createPgeGame()
    const conrad = {
        index: 0,
        roomLocation: 1,
        posX: -10,
        posY: 80,
        initPge: { objectType: 1 },
    }
    const roomMate = {
        index: 3,
        roomLocation: 2,
        posX: 40,
        posY: 100,
        flags: 0,
        initPge: { flags: initPgeFlagInCurrentRoomList },
    }
    game._res.level.ctData[ctLeftRoom + 1] = 2
    game._livePgeStore.liveByRoom[1] = [conrad]
    game._livePgeStore.liveByRoom[2] = [roomMate]
    gameCollision.gameRebuildActiveRoomCollisionSlotLookup = (_game, room) => {
        rebuildCalls.push(room)
    }

    try {
        gamePge.gameHandlePgeRoomTransitionAndActivation(game, conrad, conrad.initPge)
    } finally {
        gameCollision.gameRebuildActiveRoomCollisionSlotLookup = originalRebuild
    }

    assert.equal(conrad.roomLocation, 2)
    assert.equal(conrad.posX, 246)
    assert.equal(game._currentRoom, 2)
    assert.equal(game._loadMap, true)
    assert.deepEqual(rebuildCalls, [2])
    assert.equal(game._livePgeStore.activeFrameByIndex[3], roomMate)
    assert.equal((roomMate.flags & pgeFlagActive) !== 0, true)
})

test('gameHandlePgeRoomTransitionAndActivation tolerates missing destination room buckets', () => {
    const originalRebuild = gameCollision.gameRebuildActiveRoomCollisionSlotLookup
    const game = createPgeGame()
    const conrad = {
        index: 0,
        roomLocation: 1,
        posX: -10,
        posY: 80,
        flags: 0,
        initPge: { objectType: 1 },
    }

    game._res.level.ctData[ctLeftRoom + 1] = 2
    game._livePgeStore.liveByRoom[1] = [conrad]
    game._livePgeStore.liveByRoom[2] = undefined
    gameCollision.gameRebuildActiveRoomCollisionSlotLookup = () => {}

    try {
        assert.doesNotThrow(() => {
            gamePge.gameHandlePgeRoomTransitionAndActivation(game, conrad, conrad.initPge)
        })
    } finally {
        gameCollision.gameRebuildActiveRoomCollisionSlotLookup = originalRebuild
    }

    assert.equal(conrad.roomLocation, 2)
    assert.equal(game._currentRoom, 2)
})

test('gameRunPgeFrameLogic moves Conrad into the next room and advances his next animation frame', () => {
    const originalRebuild = gameCollision.gameRebuildActiveRoomCollisionSlotLookup
    const rebuildCalls = []
    const game = createPgeGame()
    const conrad = {
        index: 0,
        animNumber: 0,
        animSeq: 0,
        firstScriptEntryIndex: 0,
        flags: 0,
        initPge: { objectType: 1, scriptNodeIndex: 1 },
        life: 20,
        posX: 255,
        posY: 80,
        roomLocation: 1,
        scriptStateType: 1,
    }
    const roomMate = {
        index: 2,
        roomLocation: 2,
        posX: 40,
        posY: 100,
        flags: 0,
        initPge: { flags: initPgeFlagInCurrentRoomList },
    }

    game._livePgesByIndex[0] = conrad
    game._livePgeStore.liveByRoom[1] = [conrad]
    game._livePgeStore.liveByRoom[2] = [roomMate]
    game._res.level.ctData[ctRightRoom + 1] = 2
    game._res.level.objectNodesMap[1] = {
        lastObjNumber: 1,
        objects: [
            {
                type: 1,
                dx: 4,
                dy: 0,
                flags: 0,
                nextScriptEntryIndex: 1,
                nextScriptStateType: 9,
                opcode1: 0,
                opcode2: 0,
                opcode3: 0,
                opcodeArg1: 0,
                opcodeArg2: 0,
                opcodeArg3: 0,
            },
            {
                type: 9,
                dx: 0,
                dy: 0,
                flags: 0,
                nextScriptEntryIndex: 1,
                nextScriptStateType: 9,
                opcode1: 0,
                opcode2: 0,
                opcode3: 0,
                opcodeArg1: 0,
                opcodeArg2: 0,
                opcodeArg3: 0,
            },
        ],
    }
    game._res.getAniData = (stateType) => Uint8Array.from(
        stateType === 1
            ? [0, 0, 0, 0, 0, 0, 0, 12, 0, 0]
            : [0, 0, 0, 0, 0, 0, 0, 33, 1, 2]
    )
    gameCollision.gameRebuildActiveRoomCollisionSlotLookup = (_game, room) => {
        rebuildCalls.push(room)
    }

    try {
        gamePge.gameRunPgeFrameLogic(game, conrad, 1)
    } finally {
        gameCollision.gameRebuildActiveRoomCollisionSlotLookup = originalRebuild
    }

    assert.equal(conrad.roomLocation, 2)
    assert.equal(conrad.posX, 4)
    assert.equal(conrad.posY, 82)
    assert.equal(conrad.animNumber, 33)
    assert.equal(conrad.animSeq, 1)
    assert.equal(game._currentRoom, 2)
    assert.equal(game._loadMap, true)
    assert.deepEqual(rebuildCalls, [2])
    assert.deepEqual(game._livePgeStore.liveByRoom[1], [])
    assert.deepEqual(game._livePgeStore.liveByRoom[2], [roomMate, conrad])
    assert.equal(game._livePgeStore.activeFrameByIndex[2], roomMate)
    assert.equal((roomMate.flags & pgeFlagActive) !== 0, true)
})

test('gameRebuildPgeCollisionStateForCurrentRoom tolerates missing room buckets', () => {
    const game = createPgeGame()
    game._livePgeStore.liveByRoom[1] = undefined

    assert.doesNotThrow(() => {
        gamePge.gameRebuildPgeCollisionStateForCurrentRoom(game, 1)
    })

    assert.equal(game._nextFreeDynamicPgeCollisionSlotPoolIndex, 0)
})

test('gameRunPgeFrameLogic moves monsters between room lists without changing the current room', () => {
    const game = createPgeGame()
    const monster = {
        index: 4,
        animNumber: 0,
        animSeq: 0,
        firstScriptEntryIndex: 0,
        flags: 0,
        initPge: { objectType: 10, scriptNodeIndex: 2 },
        life: 6,
        posX: 255,
        posY: 90,
        roomLocation: 1,
        scriptStateType: 1,
    }

    game._currentRoom = 1
    game._livePgesByIndex[4] = monster
    game._livePgeStore.liveByRoom[1] = [monster]
    game._livePgeStore.liveByRoom[2] = []
    game._res.level.ctData[ctRightRoom + 1] = 2
    game._res.level.objectNodesMap[2] = {
        lastObjNumber: 1,
        objects: [
            {
                type: 1,
                dx: 2,
                dy: 1,
                flags: 0,
                nextScriptEntryIndex: 1,
                nextScriptStateType: 9,
                opcode1: 0,
                opcode2: 0,
                opcode3: 0,
                opcodeArg1: 0,
                opcodeArg2: 0,
                opcodeArg3: 0,
            },
            {
                type: 9,
                dx: 0,
                dy: 0,
                flags: 0,
                nextScriptEntryIndex: 1,
                nextScriptStateType: 9,
                opcode1: 0,
                opcode2: 0,
                opcode3: 0,
                opcodeArg1: 0,
                opcodeArg2: 0,
                opcodeArg3: 0,
            },
        ],
    }
    game._res.getAniData = (stateType) => Uint8Array.from(
        stateType === 1
            ? [0, 0, 0, 0, 0, 0, 0, 12, 0, 0]
            : [0, 0, 0, 0, 0, 0, 0, 44, 3, 4]
    )

    gamePge.gameRunPgeFrameLogic(game, monster, 1)

    assert.equal(monster.roomLocation, 2)
    assert.equal(monster.posX, 4)
    assert.equal(monster.posY, 95)
    assert.equal(monster.animNumber, 44)
    assert.equal(monster.animSeq, 1)
    assert.equal(game._currentRoom, 1)
    assert.equal(game._loadMap, false)
    assert.deepEqual(game._livePgeStore.liveByRoom[1], [])
    assert.deepEqual(game._livePgeStore.liveByRoom[2], [monster])
})

test('gameRunPgeFrameLogic moves visible non-player PGEs between room lists and advances animation', () => {
    const game = createPgeGame()
    const visiblePge = {
        index: 5,
        animNumber: 0,
        animSeq: 0,
        firstScriptEntryIndex: 0,
        flags: 0,
        initPge: { objectType: 6, scriptNodeIndex: 3 },
        life: 1,
        posX: 255,
        posY: 70,
        roomLocation: 1,
        scriptStateType: 1,
    }

    game._currentRoom = 7
    game._livePgesByIndex[5] = visiblePge
    game._livePgeStore.liveByRoom[1] = [visiblePge]
    game._livePgeStore.liveByRoom[2] = []
    game._res.level.ctData[ctRightRoom + 1] = 2
    game._res.level.objectNodesMap[3] = {
        lastObjNumber: 1,
        objects: [
            {
                type: 1,
                dx: 3,
                dy: -2,
                flags: 0,
                nextScriptEntryIndex: 1,
                nextScriptStateType: 9,
                opcode1: 0,
                opcode2: 0,
                opcode3: 0,
                opcodeArg1: 0,
                opcodeArg2: 0,
                opcodeArg3: 0,
            },
            {
                type: 9,
                dx: 0,
                dy: 0,
                flags: 0,
                nextScriptEntryIndex: 1,
                nextScriptStateType: 9,
                opcode1: 0,
                opcode2: 0,
                opcode3: 0,
                opcodeArg1: 0,
                opcodeArg2: 0,
                opcodeArg3: 0,
            },
        ],
    }
    game._res.getAniData = (stateType) => Uint8Array.from(
        stateType === 1
            ? [0, 0, 0, 0, 0, 0, 0, 12, 0, 0]
            : [0, 0, 0, 0, 0, 0, 0, 55, 5, 6]
    )

    gamePge.gameRunPgeFrameLogic(game, visiblePge, 1)

    assert.equal(visiblePge.roomLocation, 2)
    assert.equal(visiblePge.posX, 7)
    assert.equal(visiblePge.posY, 74)
    assert.equal(visiblePge.animNumber, 55)
    assert.equal(visiblePge.animSeq, 1)
    assert.equal(game._currentRoom, 7)
    assert.equal(game._loadMap, false)
    assert.deepEqual(game._livePgeStore.liveByRoom[1], [])
    assert.deepEqual(game._livePgeStore.liveByRoom[2], [visiblePge])
})

test('gameExecutePgeObjectStep updates score, life, mirrored movement, and state transitions', () => {
    const game = createPgeGame()
    const pge = {
        animSeq: 5,
        firstScriptEntryIndex: 0,
        flags: pgeFlagMirrored,
        initPge: { objectType: 10, scriptNodeIndex: 1 },
        life: 3,
        posX: 30,
        posY: 40,
        scriptStateType: 2,
    }
    game._res.level.objectNodesMap[1] = {
        objects: [{}, {}],
    }
    game._opcodeHandlers = [
        null,
        (args, currentGame) => {
            currentGame.lastOpcodeArgs = args
            return 1
        },
    ]
    const scriptEntry = {
        dx: 4,
        dy: 6,
        flags: objFlagDecLife | objFlagIncLife | objFlagToggleMirror | (1 << 4),
        nextScriptEntryIndex: 1,
        nextScriptStateType: 9,
        opcode1: 1,
        opcode2: 0,
        opcode3: 0,
        opcodeArg1: 7,
        opcodeArg2: 0,
        opcodeArg3: 0,
    }

    const result = gamePge.gameExecutePgeObjectStep(game, pge, pge.initPge, scriptEntry)

    assert.equal(result, uint16Max)
    assert.deepEqual(game.lastOpcodeArgs, { pge, a: 7, b: 0 })
    assert.equal(pge.scriptStateType, 9)
    assert.equal(pge.firstScriptEntryIndex, 1)
    assert.equal(pge.animSeq, 0)
    assert.equal(pge.life, 3)
    assert.equal(game._score, 300)
    assert.equal((pge.flags & pgeFlagMirrored) === 0, true)
    assert.equal(pge.posX, 34)
    assert.equal(pge.posY, 46)
})

test('gameAdvancePgeAnimationState applies frame deltas and special-animation flags', () => {
    const game = createPgeGame()
    const pge = {
        animNumber: 0,
        animSeq: 1,
        flags: pgeFlagMirrored,
        posX: 20,
        posY: 50,
        scriptStateType: 3,
    }

    gamePge.gameAdvancePgeAnimationState(game, pge)

    assert.equal(pge.posX, 19)
    assert.equal(pge.posY, 53)
    assert.equal((pge.flags & pgeFlagFlipX) !== 0, true)
    assert.equal((pge.flags & pgeFlagSpecialAnim) !== 0, true)
    assert.equal(pge.animNumber, 10)
})
