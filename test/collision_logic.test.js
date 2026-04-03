require('ts-node/register/transpile-only')

const test = require('node:test')
const assert = require('node:assert/strict')

const { CT_LEFT_ROOM, CT_RIGHT_ROOM, CT_UP_ROOM, CT_DOWN_ROOM } = require('../src/game.ts')
const {
    CT_GRID_STRIDE,
    CT_GRID_WIDTH,
    CT_GRID_HEIGHT,
    CT_HEADER_SIZE,
    GAMESCREEN_W,
    INIT_PGE_FLAG_IN_CURRENT_ROOM_LIST,
    UINT16_MAX,
} = require('../src/game_constants.ts')
const {
    gameFindFirstMatchingCollidingObject,
    gameGetCollisionLanePositionIndexByXY,
    gameGetRoomCollisionGridData,
    gameRegisterPgeCollisionSegments,
    gameRebuildActiveRoomCollisionSlotLookup,
} = require('../src/game_collision.ts')
const {
    col_detectHit,
    col_detectHitCallback1,
    col_detectHitCallback4,
    col_detectHitCallbackHelper,
    col_detectHitCallback6,
} = require('../src/collision.ts')

function createCollisionGame() {
    const ctData = new Int8Array(CT_HEADER_SIZE + CT_GRID_STRIDE * 0x40)
    ctData.fill(-1, 0, CT_HEADER_SIZE)
    const game = {
        _activeCollisionLeftRoom: -1,
        _activeCollisionRightRoom: -1,
        _activeRoomCollisionSlotWindow: {
            left: new Array(0x40).fill(null),
            current: new Array(0x40).fill(null),
            right: new Array(0x40).fill(null),
        },
        _currentPgeCollisionGridX: 0,
        _currentPgeCollisionGridY: 0,
        _currentPgeFacingIsMirrored: false,
        _dynamicPgeCollisionSlotsByPosition: new Map(),
        _dynamicPgeCollisionSlotObjectPool: Array.from({ length: 8 }, () => ({
            collision_grid_position_index: 0,
            pge: null,
            index: UINT16_MAX,
        })),
        _livePgeStore: {
            activeFrameByIndex: new Array(8).fill(null),
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
    return game
}

test('collision lane position lookup crosses into neighboring rooms and packs room-local indices', () => {
    const game = createCollisionGame()
    game._res.level.ctData[CT_RIGHT_ROOM + 1] = 2

    const pos = gameGetCollisionLanePositionIndexByXY(game, {
        room_location: 1,
        pos_x: GAMESCREEN_W,
        pos_y: 142,
    }, 0)

    assert.equal(pos, 2 * 64 + 16)
})

test('registering pge collision segments chains packed positions and activates hidden overlaps', () => {
    const game = createCollisionGame()
    const pge1 = {
        index: 1,
        flags: 0,
        room_location: 1,
        pos_x: 0,
        pos_y: 142,
        init_PGE: { number_of_collision_segments: 2 },
    }
    const pge2 = {
        index: 2,
        flags: 0x80,
        room_location: 1,
        pos_x: 0,
        pos_y: 142,
        init_PGE: { number_of_collision_segments: 1 },
    }

    gameRegisterPgeCollisionSegments(game, pge1)
    gameRegisterPgeCollisionSegments(game, pge2)

    assert.equal(pge1.collision_slot, 80)
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

    game._res.level.ctData[CT_LEFT_ROOM + 5] = 4
    game._res.level.ctData[CT_RIGHT_ROOM + 5] = 6
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
    const pge = { room_location: 2 }
    game._currentPgeCollisionGridX = 0
    game._currentPgeCollisionGridY = 2
    game._res.level.ctData[CT_LEFT_ROOM + 2] = 1
    game._res.level.ctData[CT_HEADER_SIZE + 2 * CT_GRID_STRIDE + 2 * CT_GRID_WIDTH + 0] = 9
    game._res.level.ctData[CT_HEADER_SIZE + 1 * CT_GRID_STRIDE + 2 * CT_GRID_WIDTH + (CT_GRID_WIDTH - 1)] = 7

    assert.equal(gameGetRoomCollisionGridData(game, pge, 0, 0), 9)
    assert.equal(gameGetRoomCollisionGridData(game, pge, 0, -1), 7)
})

test('first matching colliding object returns the icon id and matching pge', () => {
    const game = createCollisionGame()
    const pge = { collision_slot: 80, init_PGE: { object_type: 1 } }
    const collider = { init_PGE: { object_type: 5, colliding_icon_num: 3 } }
    game._dynamicPgeCollisionSlotsByPosition.set(80, [
        { pge, index: 81 },
    ])
    game._dynamicPgeCollisionSlotsByPosition.set(81, [
        { pge: collider, index: UINT16_MAX },
    ])

    const result = gameFindFirstMatchingCollidingObject(game, pge, 3, 5, 9)

    assert.equal(result.obj, 3)
    assert.equal(result.pge_out, collider)
})

test('collision helper recognizes group membership from script opcodes', () => {
    const game = createCollisionGame()
    const pge = {
        index: 1,
        room_location: 3,
        script_state_type: 7,
        first_script_entry_index: 0,
        init_PGE: { object_type: 10, script_node_index: 1 },
    }
    game._res.level.objectNodesMap[1] = {
        last_obj_number: 1,
        objects: [
            { type: 7, opcode1: 0x22, opcode_arg1: 4, opcode2: 0, opcode_arg2: 0 },
            { type: 8, opcode1: 0, opcode_arg1: 0, opcode2: 0, opcode_arg2: 0 },
        ],
    }

    assert.equal(col_detectHitCallbackHelper(pge, 4, game), UINT16_MAX)
    assert.equal(col_detectHitCallbackHelper(pge, 2, game), 0)
})

test('col_detectHit walks collision buckets and queues signals on eligible targets', () => {
    const game = createCollisionGame()
    const source = {
        index: 0,
        flags: 0,
        room_location: 1,
        pos_x: 0,
        pos_y: 142,
        init_PGE: { counter_values: [-1], object_type: 1, script_node_index: 1 },
    }
    const target = {
        index: 2,
        flags: 5,
        room_location: 1,
        first_script_entry_index: 0,
        script_state_type: 9,
        init_PGE: { object_type: 10, script_node_index: 2 },
    }
    game._res.level.objectNodesMap[2] = {
        last_obj_number: 1,
        objects: [
            { type: 9, opcode1: 0, opcode_arg1: 0, opcode2: 0, opcode_arg2: 0 },
            { type: 10, opcode1: 0, opcode_arg1: 0, opcode2: 0, opcode_arg2: 0 },
        ],
    }
    game._dynamicPgeCollisionSlotsByPosition.set(1 * 64 + 16, [{ pge: target }])

    const result = col_detectHit(source, 3, 10, col_detectHitCallback4, col_detectHitCallback6, 0, -1, game)

    assert.equal(result, 1)
    assert.deepEqual(game.queueCalls, [[0, 2, 3]])
})

test('col_detectHitCallback1 stops movement when room collision data is solid', () => {
    const game = createCollisionGame()
    game._currentPgeCollisionGridX = 0
    game._currentPgeCollisionGridY = 2
    game._res.level.ctData[CT_HEADER_SIZE + 1 * CT_GRID_STRIDE + 3 * CT_GRID_WIDTH] = 1

    const blocked = col_detectHitCallback1({ room_location: 1 }, 0, 0, 0, game)

    assert.equal(blocked, 1)
})
