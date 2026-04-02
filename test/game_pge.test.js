require('ts-node/register/transpile-only')

const test = require('node:test')
const assert = require('node:assert/strict')

const {
    INIT_PGE_FLAG_HAS_COLLISION,
    INIT_PGE_FLAG_IN_CURRENT_ROOM_LIST,
    OBJ_FLAG_DEC_LIFE,
    OBJ_FLAG_INC_LIFE,
    OBJ_FLAG_TOGGLE_MIRROR,
    PGE_FLAG_ACTIVE,
    PGE_FLAG_FLIP_X,
    PGE_FLAG_MIRRORED,
    PGE_FLAG_SPECIAL_ANIM,
    UINT16_MAX,
} = require('../src/game_constants.ts')
const { CT_LEFT_ROOM } = require('../src/game.ts')
const gameCollision = require('../src/game_collision.ts')
const gamePge = require('../src/game_pge.ts')

function createPgeGame() {
    return {
        _blinkingConradCounter: 0,
        _currentPgeCollisionGridX: 0,
        _currentPgeCollisionGridY: 0,
        _currentPgeInputMask: 0,
        _currentPgeRoom: 1,
        _currentRoom: 1,
        _inp_lastKeysHit: 0,
        _inp_lastKeysHitLeftRight: 8,
        _livePgesByIndex: [],
        _livePgeStore: {
            activeFrameByIndex: new Array(8).fill(null),
            liveByRoom: Array.from({ length: 0x40 }, () => []),
        },
        _loadMap: false,
        _pendingSignalsByTargetPgeIndex: new Map(),
        _res: {
            _ctData: new Int8Array(0x200).fill(-1),
            _numObjectNodes: 4,
            _objectNodesMap: {},
            _readUint16(buffer, offset = 0) {
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
        async inp_update() {
            this.inpCalls += 1
        },
        renders: 0,
    }
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
    assert.equal(game._inp_lastKeysHit, 0x08)
})

test('gameQueuePgeGroupSignal activates collision-capable inactive targets and records pending signals', () => {
    const game = createPgeGame()
    const sender = { room_location: 3 }
    const target = {
        index: 2,
        flags: 0,
        room_location: 3,
        init_PGE: { flags: INIT_PGE_FLAG_HAS_COLLISION },
    }
    game._livePgesByIndex[0] = sender
    game._livePgesByIndex[2] = target

    gamePge.gameQueuePgeGroupSignal(game, 0, 2, 4)

    assert.equal((target.flags & PGE_FLAG_ACTIVE) !== 0, true)
    assert.equal(game._livePgeStore.activeFrameByIndex[2], target)
    assert.deepEqual(game._pendingSignalsByTargetPgeIndex.get(2), [{ senderPgeIndex: 0, signalId: 4 }])
})

test('gameApplyNextPgeAnimationFrameFromGroups fast-forwards to the end of the matching animation', () => {
    const game = createPgeGame()
    const pge = {
        anim_seq: 0,
        first_script_entry_index: 0,
        flags: 0,
        init_PGE: { script_node_index: 1 },
        pos_x: 10,
        pos_y: 20,
        script_state_type: 3,
    }
    game._res._objectNodesMap[1] = {
        last_obj_number: 1,
        objects: [
            { type: 3, opcode1: 0, opcode_arg1: 0, opcode2: 0x22, opcode_arg2: 5 },
            { type: 4, opcode1: 0, opcode_arg1: 0, opcode2: 0, opcode_arg2: 0 },
        ],
    }

    gamePge.gameApplyNextPgeAnimationFrameFromGroups(game, pge, [{ senderPgeIndex: 1, signalId: 5 }])

    assert.equal(pge.anim_seq, 2)
    assert.equal(pge.pos_x, 10)
    assert.equal(pge.pos_y, 25)
    assert.equal(game._currentPgeCollisionGridX, 1)
    assert.equal(game._currentPgeCollisionGridY, 0)
})

test('gameHandlePgeRoomTransitionAndActivation updates Conrad room changes and activates current-room entries', () => {
    const originalRebuild = gameCollision.gameRebuildActiveRoomCollisionSlotLookup
    const rebuildCalls = []
    const game = createPgeGame()
    const conrad = {
        index: 0,
        room_location: 1,
        pos_x: -10,
        pos_y: 80,
        init_PGE: { object_type: 1 },
    }
    const roomMate = {
        index: 3,
        room_location: 2,
        pos_x: 40,
        pos_y: 100,
        flags: 0,
        init_PGE: { flags: INIT_PGE_FLAG_IN_CURRENT_ROOM_LIST },
    }
    game._res._ctData[CT_LEFT_ROOM + 1] = 2
    game._livePgeStore.liveByRoom[1] = [conrad]
    game._livePgeStore.liveByRoom[2] = [roomMate]
    gameCollision.gameRebuildActiveRoomCollisionSlotLookup = (_game, room) => {
        rebuildCalls.push(room)
    }

    try {
        gamePge.gameHandlePgeRoomTransitionAndActivation(game, conrad, conrad.init_PGE)
    } finally {
        gameCollision.gameRebuildActiveRoomCollisionSlotLookup = originalRebuild
    }

    assert.equal(conrad.room_location, 2)
    assert.equal(conrad.pos_x, 246)
    assert.equal(game._currentRoom, 2)
    assert.equal(game._loadMap, true)
    assert.deepEqual(rebuildCalls, [2])
    assert.equal(game._livePgeStore.activeFrameByIndex[3], roomMate)
    assert.equal((roomMate.flags & PGE_FLAG_ACTIVE) !== 0, true)
})

test('gameExecutePgeObjectStep updates score, life, mirrored movement, and state transitions', () => {
    const game = createPgeGame()
    const pge = {
        anim_seq: 5,
        first_script_entry_index: 0,
        flags: PGE_FLAG_MIRRORED,
        init_PGE: { object_type: 10, script_node_index: 1 },
        life: 3,
        pos_x: 30,
        pos_y: 40,
        script_state_type: 2,
    }
    game._res._objectNodesMap[1] = {
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
        flags: OBJ_FLAG_DEC_LIFE | OBJ_FLAG_INC_LIFE | OBJ_FLAG_TOGGLE_MIRROR | (1 << 4),
        next_script_entry_index: 1,
        next_script_state_type: 9,
        opcode1: 1,
        opcode2: 0,
        opcode3: 0,
        opcode_arg1: 7,
        opcode_arg2: 0,
        opcode_arg3: 0,
    }

    const result = gamePge.gameExecutePgeObjectStep(game, pge, pge.init_PGE, scriptEntry)

    assert.equal(result, UINT16_MAX)
    assert.deepEqual(game.lastOpcodeArgs, { pge, a: 7, b: 0 })
    assert.equal(pge.script_state_type, 9)
    assert.equal(pge.first_script_entry_index, 1)
    assert.equal(pge.anim_seq, 0)
    assert.equal(pge.life, 3)
    assert.equal(game._score, 300)
    assert.equal((pge.flags & PGE_FLAG_MIRRORED) === 0, true)
    assert.equal(pge.pos_x, 34)
    assert.equal(pge.pos_y, 46)
})

test('gameAdvancePgeAnimationState applies frame deltas and special-animation flags', () => {
    const game = createPgeGame()
    const pge = {
        anim_number: 0,
        anim_seq: 1,
        flags: PGE_FLAG_MIRRORED,
        pos_x: 20,
        pos_y: 50,
        script_state_type: 3,
    }

    gamePge.gameAdvancePgeAnimationState(game, pge)

    assert.equal(pge.pos_x, 19)
    assert.equal(pge.pos_y, 53)
    assert.equal((pge.flags & PGE_FLAG_FLIP_X) !== 0, true)
    assert.equal((pge.flags & PGE_FLAG_SPECIAL_ANIM) !== 0, true)
    assert.equal(pge.anim_number, 10)
})
