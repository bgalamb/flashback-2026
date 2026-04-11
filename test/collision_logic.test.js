require('ts-node/register/transpile-only')

const test = require('node:test')
const assert = require('node:assert/strict')

const { ctLeftRoom, ctRightRoom, ctUpRoom, ctDownRoom } = require('../src/game/game.ts')
const {
    ctGridStride,
    ctGridWidth,
    ctGridHeight,
    ctHeaderSize,
    gamescreenW,
    initPgeFlagInCurrentRoomList,
    uint16Max,
} = require('../src/core/game_constants.ts')
const {
    gameFindFirstMatchingCollidingObject,
    gameGetCollisionLanePositionIndexByXY,
    gameGetRoomCollisionGridData,
    gameRegisterPgeCollisionSegments,
    gameRebuildActiveRoomCollisionSlotLookup,
} = require('../src/game/game-collision.ts')
const {
    colDetecthit,
    colDetecthitcallback1,
    colDetecthitcallback4,
    colDetecthitcallbackhelper,
    colDetecthitcallback6,
} = require('../src/game/collision.ts')

function createCollisionGame() {
    const ctData = new Int8Array(ctHeaderSize + ctGridStride * 0x40)
    ctData.fill(-1, 0, ctHeaderSize)
    const activeRoomCollisionSlotWindow = {
        left: new Array(0x40).fill(null),
        current: new Array(0x40).fill(null),
        right: new Array(0x40).fill(null),
    }
    const dynamicPgeCollisionSlotsByPosition = new Map()
    const dynamicPgeCollisionSlotObjectPool = Array.from({ length: 8 }, () => ({
        collisionGridPositionIndex: 0,
        pge: null,
        index: uint16Max,
    }))
    const activeFrameByIndex = new Array(8).fill(null)
    const game = {
        collision: {
            activeCollisionLeftRoom: -1,
            activeCollisionRightRoom: -1,
            activeRoomCollisionSlotWindow,
            currentPgeCollisionGridX: 0,
            currentPgeCollisionGridY: 0,
            dynamicPgeCollisionSlotsByPosition,
            dynamicPgeCollisionSlotObjectPool,
            nextFreeDynamicPgeCollisionSlotPoolIndex: 0,
        },
        pge: {
            currentPgeFacingIsMirrored: false,
        },
        _activeCollisionLeftRoom: -1,
        _activeCollisionRightRoom: -1,
        _activeRoomCollisionSlotWindow: activeRoomCollisionSlotWindow,
        _currentPgeCollisionGridX: 0,
        _currentPgeCollisionGridY: 0,
        _currentPgeFacingIsMirrored: false,
        _dynamicPgeCollisionSlotsByPosition: dynamicPgeCollisionSlotsByPosition,
        _dynamicPgeCollisionSlotObjectPool: dynamicPgeCollisionSlotObjectPool,
        _livePgeStore: {
            activeFrameByIndex,
        },
        _nextFreeDynamicPgeCollisionSlotPoolIndex: 0,
        _pendingSignalsByTargetPgeIndex: new Map(),
        _res: {
            level: {
                ctData,
                numObjectNodes: 4,
                objectNodesMap: {},
            },
        },
        queueCalls: [],
        queuePgeGroupSignal(sender, target, signal) {
            this.queueCalls.push([sender, target, signal])
        },
    }
    game.runtimeData = {
        get livePgeStore() { return game._livePgeStore },
        set livePgeStore(value) { game._livePgeStore = value },
        get pendingSignalsByTargetPgeIndex() { return game._pendingSignalsByTargetPgeIndex },
        set pendingSignalsByTargetPgeIndex(value) { game._pendingSignalsByTargetPgeIndex = value },
    }
    game.services = {
        get res() { return game._res },
        set res(value) { game._res = value },
    }
    return game
}

test('collision lane position lookup crosses into neighboring rooms and packs room-local indices', () => {
    const game = createCollisionGame()
    game._res.level.ctData[ctRightRoom + 1] = 2

    const pos = gameGetCollisionLanePositionIndexByXY(game, {
        roomLocation: 1,
        posX: gamescreenW,
        posY: 142,
    }, 0)

    assert.equal(pos, 2 * 64 + 16)
})

test('registering pge collision segments chains packed positions and activates hidden overlaps', () => {
    const game = createCollisionGame()
    const pge1 = {
        index: 1,
        flags: 0,
        roomLocation: 1,
        posX: 0,
        posY: 142,
        initPge: { numberOfCollisionSegments: 2 },
    }
    const pge2 = {
        index: 2,
        flags: 0x80,
        roomLocation: 1,
        posX: 0,
        posY: 142,
        initPge: { numberOfCollisionSegments: 1 },
    }

    gameRegisterPgeCollisionSegments(game, pge1)
    gameRegisterPgeCollisionSegments(game, pge2)

    assert.equal(pge1.collisionSlot, 80)
    assert.equal(game._dynamicPgeCollisionSlotsByPosition.get(80).length, 2)
    assert.equal(game._dynamicPgeCollisionSlotsByPosition.get(81).length, 1)
    assert.equal(game._livePgeStore.activeFrameByIndex[2], pge2)
    assert.equal((pge2.flags & 4) !== 0, true)
})

test('collision lookup window maps dynamic buckets into left/current/right room views', () => {
    const game = createCollisionGame()
    const currentBucket = [{ id: 'current' }]
    const leftBucket = [{ id: 'left' }]
    const rightBucket = [{ id: 'right' }]

    game._res.level.ctData[ctLeftRoom + 5] = 4
    game._res.level.ctData[ctRightRoom + 5] = 6
    game._dynamicPgeCollisionSlotsByPosition.set(5 * 64 + 3, currentBucket)
    game._dynamicPgeCollisionSlotsByPosition.set(4 * 64 + 7, leftBucket)
    game._dynamicPgeCollisionSlotsByPosition.set(6 * 64 + 9, rightBucket)

    gameRebuildActiveRoomCollisionSlotLookup(game, 5)

    assert.equal(game._activeRoomCollisionSlotWindow.current[3], currentBucket)
    assert.equal(game._activeRoomCollisionSlotWindow.left[7], leftBucket)
    assert.equal(game._activeRoomCollisionSlotWindow.right[9], rightBucket)
})

test('room collision grid data reads from current room and neighboring room edges', () => {
    const game = createCollisionGame()
    const pge = { roomLocation: 2 }
    game.collision.currentPgeCollisionGridX = 0
    game.collision.currentPgeCollisionGridY = 2
    game._res.level.ctData[ctLeftRoom + 2] = 1
    game._res.level.ctData[ctHeaderSize + 2 * ctGridStride + 2 * ctGridWidth + 0] = 9
    game._res.level.ctData[ctHeaderSize + 1 * ctGridStride + 2 * ctGridWidth + (ctGridWidth - 1)] = 7

    assert.equal(gameGetRoomCollisionGridData(game, pge, 0, 0), 9)
    assert.equal(gameGetRoomCollisionGridData(game, pge, 0, -1), 7)
})

test('first matching colliding object returns the icon id and matching pge', () => {
    const game = createCollisionGame()
    const pge = { collisionSlot: 80, initPge: { objectType: 1 } }
    const collider = { initPge: { objectType: 5, collidingIconNum: 3 } }
    game._dynamicPgeCollisionSlotsByPosition.set(80, [
        { pge, index: 81 },
    ])
    game._dynamicPgeCollisionSlotsByPosition.set(81, [
        { pge: collider, index: uint16Max },
    ])

    const result = gameFindFirstMatchingCollidingObject(game, pge, 3, 5, 9)

    assert.equal(result.obj, 3)
    assert.equal(result.pgeOut, collider)
})

test('collision helper recognizes group membership from script opcodes', () => {
    const game = createCollisionGame()
    const pge = {
        index: 1,
        roomLocation: 3,
        scriptStateType: 7,
        firstScriptEntryIndex: 0,
        initPge: { objectType: 10, scriptNodeIndex: 1 },
    }
    game._res.level.objectNodesMap[1] = {
        lastObjNumber: 1,
        objects: [
            { type: 7, opcode1: 0x22, opcodeArg1: 4, opcode2: 0, opcodeArg2: 0 },
            { type: 8, opcode1: 0, opcodeArg1: 0, opcode2: 0, opcodeArg2: 0 },
        ],
    }

    assert.equal(colDetecthitcallbackhelper(pge, 4, game), uint16Max)
    assert.equal(colDetecthitcallbackhelper(pge, 2, game), 0)
})

test('collision helper honors an explicit open collision state in the active door state', () => {
    const game = createCollisionGame()
    const pge = {
        index: 1,
        roomLocation: 3,
        scriptStateType: 290,
        firstScriptEntryIndex: 0,
        initPge: { objectType: 6, scriptNodeIndex: 1 },
    }
    game._res.level.objectNodesMap[1] = {
        lastObjNumber: 1,
        objects: [
            { type: 290, opcode1: 0, opcodeArg1: 0, opcode2: 0x43, opcodeArg2: 0, opcode3: 0x37, opcodeArg3: 1 },
            { type: 291, opcode1: 0, opcodeArg1: 0, opcode2: 0, opcodeArg2: 0, opcode3: 0, opcodeArg3: 0 },
        ],
    }

    assert.equal(colDetecthitcallbackhelper(pge, 1, game), uint16Max)
})

test('collision helper honors an explicit closed collision state in the active door state', () => {
    const game = createCollisionGame()
    const pge = {
        index: 1,
        roomLocation: 3,
        scriptStateType: 289,
        firstScriptEntryIndex: 0,
        initPge: { objectType: 6, scriptNodeIndex: 1 },
    }
    game._res.level.objectNodesMap[1] = {
        lastObjNumber: 1,
        objects: [
            { type: 289, opcode1: 0x43, opcodeArg1: 0, opcode2: 0, opcodeArg2: 0, opcode3: 0x36, opcodeArg3: 1 },
            { type: 290, opcode1: 0, opcodeArg1: 0, opcode2: 0, opcodeArg2: 0, opcode3: 0, opcodeArg3: 0 },
        ],
    }

    assert.equal(colDetecthitcallbackhelper(pge, 1, game), 0)
})

test('col_detectHit walks collision buckets and queues signals on eligible targets', () => {
    const game = createCollisionGame()
    const source = {
        index: 0,
        flags: 0,
        roomLocation: 1,
        posX: 0,
        posY: 142,
        initPge: { counterValues: [-1], objectType: 1, scriptNodeIndex: 1 },
    }
    const target = {
        index: 2,
        flags: 5,
        roomLocation: 1,
        firstScriptEntryIndex: 0,
        scriptStateType: 9,
        initPge: { objectType: 10, scriptNodeIndex: 2 },
    }
    game._res.level.objectNodesMap[2] = {
        lastObjNumber: 1,
        objects: [
            { type: 9, opcode1: 0, opcodeArg1: 0, opcode2: 0, opcodeArg2: 0 },
            { type: 10, opcode1: 0, opcodeArg1: 0, opcode2: 0, opcodeArg2: 0 },
        ],
    }
    game._dynamicPgeCollisionSlotsByPosition.set(1 * 64 + 16, [{ pge: target }])

    const result = colDetecthit(source, 3, 10, colDetecthitcallback4, colDetecthitcallback6, 0, -1, game)

    assert.equal(result, 1)
    assert.deepEqual(game.queueCalls, [[0, 2, 3]])
})

test('col_detectHitCallback1 stops movement when room collision data is solid', () => {
    const game = createCollisionGame()
    game.collision.currentPgeCollisionGridX = 0
    game.collision.currentPgeCollisionGridY = 2
    game._res.level.ctData[ctHeaderSize + 1 * ctGridStride + 3 * ctGridWidth] = 1

    const blocked = colDetecthitcallback1({ roomLocation: 1 }, 0, 0, 0, game)

    assert.equal(blocked, 1)
})
