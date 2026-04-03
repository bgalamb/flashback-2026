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
const { CT_LEFT_ROOM, CT_RIGHT_ROOM } = require('../src/game.ts')
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
    game._res.level.objectNodesMap[1] = {
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

test('gameLoadPgeForCurrentLevel initializes Conrad with player defaults and the default animation', () => {
    const game = createPgeGame()
    const conrad = {}
    const initialState = {
        type: 57,
        pos_x: 48,
        pos_y: 96,
        init_room: 7,
        room_location: 0,
        life: 5,
        skill: 0,
        object_type: 1,
        mirror_x: 1,
        init_flags: 0,
        flags: INIT_PGE_FLAG_IN_CURRENT_ROOM_LIST,
        script_node_index: 1,
    }

    game._livePgesByIndex[0] = conrad
    game._res.level.pgeAllInitialStateFromFile = [initialState]
    game._res.level.objectNodesMap[1] = {
        num_objects: 2,
        objects: [
            { type: 1 },
            { type: 57 },
        ],
    }

    gamePge.gameLoadPgeForCurrentLevel(game, 0, 7)

    assert.equal(conrad.init_PGE, initialState)
    assert.equal(conrad.script_state_type, 57)
    assert.equal(conrad.pos_x, 48)
    assert.equal(conrad.pos_y, 96)
    assert.equal(conrad.room_location, 7)
    assert.equal(conrad.life, 20)
    assert.equal(conrad.first_script_entry_index, 1)
    assert.equal(conrad.anim_seq, 0)
    assert.equal(conrad.anim_number, 9)
    assert.equal((conrad.flags & PGE_FLAG_ACTIVE) !== 0, true)
    assert.equal((conrad.flags & PGE_FLAG_MIRRORED) !== 0, true)
    assert.equal((conrad.flags & PGE_FLAG_FLIP_X) !== 0, true)
    assert.equal((conrad.flags & PGE_FLAG_SPECIAL_ANIM) !== 0, true)
    assert.equal(game._livePgeStore.activeFrameByIndex[0], conrad)
})

test('gameLoadPgeForCurrentLevel initializes monsters with doubled expert life and their default animation', () => {
    const game = createPgeGame()
    const monster = {}
    const initialState = {
        type: 9,
        pos_x: 70,
        pos_y: 120,
        init_room: 5,
        room_location: 1,
        life: 7,
        skill: 0,
        object_type: 10,
        mirror_x: 0,
        init_flags: 0,
        flags: 0,
        script_node_index: 2,
    }

    game._skillLevel = 2
    game._livePgesByIndex[1] = monster
    game._res.level.pgeAllInitialStateFromFile = [{}, initialState]
    game._res.level.objectNodesMap[2] = {
        num_objects: 2,
        objects: [
            { type: 1 },
            { type: 9 },
        ],
    }

    gamePge.gameLoadPgeForCurrentLevel(game, 1, 3)

    assert.equal(monster.init_PGE, initialState)
    assert.equal(monster.script_state_type, 9)
    assert.equal(monster.pos_x, 70)
    assert.equal(monster.pos_y, 120)
    assert.equal(monster.room_location, 5)
    assert.equal(monster.life, 14)
    assert.equal(monster.first_script_entry_index, 1)
    assert.equal(monster.anim_seq, 0)
    assert.equal(monster.anim_number, 9)
    assert.equal((monster.flags & PGE_FLAG_ACTIVE) !== 0, true)
    assert.equal((monster.flags & PGE_FLAG_SPECIAL_ANIM) !== 0, true)
    assert.equal(game._livePgeStore.activeFrameByIndex[1], monster)
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
    game._res.level.ctData[CT_LEFT_ROOM + 1] = 2
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

test('gameRunPgeFrameLogic moves Conrad into the next room and advances his next animation frame', () => {
    const originalRebuild = gameCollision.gameRebuildActiveRoomCollisionSlotLookup
    const rebuildCalls = []
    const game = createPgeGame()
    const conrad = {
        index: 0,
        anim_number: 0,
        anim_seq: 0,
        first_script_entry_index: 0,
        flags: 0,
        init_PGE: { object_type: 1, script_node_index: 1 },
        life: 20,
        pos_x: 255,
        pos_y: 80,
        room_location: 1,
        script_state_type: 1,
    }
    const roomMate = {
        index: 2,
        room_location: 2,
        pos_x: 40,
        pos_y: 100,
        flags: 0,
        init_PGE: { flags: INIT_PGE_FLAG_IN_CURRENT_ROOM_LIST },
    }

    game._livePgesByIndex[0] = conrad
    game._livePgeStore.liveByRoom[1] = [conrad]
    game._livePgeStore.liveByRoom[2] = [roomMate]
    game._res.level.ctData[CT_RIGHT_ROOM + 1] = 2
    game._res.level.objectNodesMap[1] = {
        last_obj_number: 1,
        objects: [
            {
                type: 1,
                dx: 4,
                dy: 0,
                flags: 0,
                next_script_entry_index: 1,
                next_script_state_type: 9,
                opcode1: 0,
                opcode2: 0,
                opcode3: 0,
                opcode_arg1: 0,
                opcode_arg2: 0,
                opcode_arg3: 0,
            },
            {
                type: 9,
                dx: 0,
                dy: 0,
                flags: 0,
                next_script_entry_index: 1,
                next_script_state_type: 9,
                opcode1: 0,
                opcode2: 0,
                opcode3: 0,
                opcode_arg1: 0,
                opcode_arg2: 0,
                opcode_arg3: 0,
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

    assert.equal(conrad.room_location, 2)
    assert.equal(conrad.pos_x, 4)
    assert.equal(conrad.pos_y, 82)
    assert.equal(conrad.anim_number, 33)
    assert.equal(conrad.anim_seq, 1)
    assert.equal(game._currentRoom, 2)
    assert.equal(game._loadMap, true)
    assert.deepEqual(rebuildCalls, [2])
    assert.deepEqual(game._livePgeStore.liveByRoom[1], [])
    assert.deepEqual(game._livePgeStore.liveByRoom[2], [roomMate, conrad])
    assert.equal(game._livePgeStore.activeFrameByIndex[2], roomMate)
    assert.equal((roomMate.flags & PGE_FLAG_ACTIVE) !== 0, true)
})

test('gameRunPgeFrameLogic moves monsters between room lists without changing the current room', () => {
    const game = createPgeGame()
    const monster = {
        index: 4,
        anim_number: 0,
        anim_seq: 0,
        first_script_entry_index: 0,
        flags: 0,
        init_PGE: { object_type: 10, script_node_index: 2 },
        life: 6,
        pos_x: 255,
        pos_y: 90,
        room_location: 1,
        script_state_type: 1,
    }

    game._currentRoom = 1
    game._livePgesByIndex[4] = monster
    game._livePgeStore.liveByRoom[1] = [monster]
    game._livePgeStore.liveByRoom[2] = []
    game._res.level.ctData[CT_RIGHT_ROOM + 1] = 2
    game._res.level.objectNodesMap[2] = {
        last_obj_number: 1,
        objects: [
            {
                type: 1,
                dx: 2,
                dy: 1,
                flags: 0,
                next_script_entry_index: 1,
                next_script_state_type: 9,
                opcode1: 0,
                opcode2: 0,
                opcode3: 0,
                opcode_arg1: 0,
                opcode_arg2: 0,
                opcode_arg3: 0,
            },
            {
                type: 9,
                dx: 0,
                dy: 0,
                flags: 0,
                next_script_entry_index: 1,
                next_script_state_type: 9,
                opcode1: 0,
                opcode2: 0,
                opcode3: 0,
                opcode_arg1: 0,
                opcode_arg2: 0,
                opcode_arg3: 0,
            },
        ],
    }
    game._res.getAniData = (stateType) => Uint8Array.from(
        stateType === 1
            ? [0, 0, 0, 0, 0, 0, 0, 12, 0, 0]
            : [0, 0, 0, 0, 0, 0, 0, 44, 3, 4]
    )

    gamePge.gameRunPgeFrameLogic(game, monster, 1)

    assert.equal(monster.room_location, 2)
    assert.equal(monster.pos_x, 4)
    assert.equal(monster.pos_y, 95)
    assert.equal(monster.anim_number, 44)
    assert.equal(monster.anim_seq, 1)
    assert.equal(game._currentRoom, 1)
    assert.equal(game._loadMap, false)
    assert.deepEqual(game._livePgeStore.liveByRoom[1], [])
    assert.deepEqual(game._livePgeStore.liveByRoom[2], [monster])
})

test('gameRunPgeFrameLogic moves visible non-player PGEs between room lists and advances animation', () => {
    const game = createPgeGame()
    const visiblePge = {
        index: 5,
        anim_number: 0,
        anim_seq: 0,
        first_script_entry_index: 0,
        flags: 0,
        init_PGE: { object_type: 6, script_node_index: 3 },
        life: 1,
        pos_x: 255,
        pos_y: 70,
        room_location: 1,
        script_state_type: 1,
    }

    game._currentRoom = 7
    game._livePgesByIndex[5] = visiblePge
    game._livePgeStore.liveByRoom[1] = [visiblePge]
    game._livePgeStore.liveByRoom[2] = []
    game._res.level.ctData[CT_RIGHT_ROOM + 1] = 2
    game._res.level.objectNodesMap[3] = {
        last_obj_number: 1,
        objects: [
            {
                type: 1,
                dx: 3,
                dy: -2,
                flags: 0,
                next_script_entry_index: 1,
                next_script_state_type: 9,
                opcode1: 0,
                opcode2: 0,
                opcode3: 0,
                opcode_arg1: 0,
                opcode_arg2: 0,
                opcode_arg3: 0,
            },
            {
                type: 9,
                dx: 0,
                dy: 0,
                flags: 0,
                next_script_entry_index: 1,
                next_script_state_type: 9,
                opcode1: 0,
                opcode2: 0,
                opcode3: 0,
                opcode_arg1: 0,
                opcode_arg2: 0,
                opcode_arg3: 0,
            },
        ],
    }
    game._res.getAniData = (stateType) => Uint8Array.from(
        stateType === 1
            ? [0, 0, 0, 0, 0, 0, 0, 12, 0, 0]
            : [0, 0, 0, 0, 0, 0, 0, 55, 5, 6]
    )

    gamePge.gameRunPgeFrameLogic(game, visiblePge, 1)

    assert.equal(visiblePge.room_location, 2)
    assert.equal(visiblePge.pos_x, 7)
    assert.equal(visiblePge.pos_y, 74)
    assert.equal(visiblePge.anim_number, 55)
    assert.equal(visiblePge.anim_seq, 1)
    assert.equal(game._currentRoom, 7)
    assert.equal(game._loadMap, false)
    assert.deepEqual(game._livePgeStore.liveByRoom[1], [])
    assert.deepEqual(game._livePgeStore.liveByRoom[2], [visiblePge])
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
