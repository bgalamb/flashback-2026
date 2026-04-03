require('ts-node/register/transpile-only')

const test = require('node:test')
const assert = require('node:assert/strict')

const { _pge_opcodeTable } = require('../src/game_opcodes.ts')
const {
    CT_HEADER_SIZE,
    CT_GRID_STRIDE,
    CT_ROOM_SIZE,
    UINT16_MAX,
    UINT8_MAX,
    PGE_FLAG_ACTIVE,
} = require('../src/game_constants.ts')
const { global_game_options, kIngameSaveSlot } = require('../src/game_constants.ts')

function createAnimData(animNumber = 9, special = 0) {
    return Uint8Array.from([
        0, 1,
        0, 0,
        0, special,
        0, animNumber, 0, 0,
    ])
}

function createOpcodeGame(overrides = {}) {
    const calls = []
    const currentPge = {
        index: 0,
        pos_x: 16,
        pos_y: 70,
        room_location: 3,
        flags: PGE_FLAG_ACTIVE,
        life: 10,
        script_state_type: 2,
        first_script_entry_index: 0,
        collision_slot: 7,
        init_PGE: {
            counter_values: [0, 0, 0, 0],
            flags: 4,
            object_type: 2,
            script_node_index: 1,
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
            liveByRoom: Array.from({ length: CT_ROOM_SIZE }, () => []),
        },
        _opcodeTempVar1: 0,
        _pendingSignalsByTargetPgeIndex: new Map(),
        _res: {
            level: {
                ctData: new Int8Array(CT_HEADER_SIZE + CT_GRID_STRIDE * CT_ROOM_SIZE).fill(-1),
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
        _textToDisplay: UINT16_MAX,
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
    game._livePgeStore.liveByRoom[currentPge.room_location].push(currentPge)

    Object.assign(game, overrides)
    return game
}

function runOpcode(index, args, game) {
    return _pge_opcodeTable[index](args, game)
}

test('displayText stores the current speech text id', () => {
    const game = createOpcodeGame()

    const result = runOpcode(0x7B, { pge: game._livePgesByIndex[0], a: 42, b: 0 }, game)

    assert.equal(result, UINT16_MAX)
    assert.equal(game._textToDisplay, 42)
})

test('addToCredits updates credits, mirrors the inventory counter life, and hides the pickup', () => {
    const game = createOpcodeGame()
    const creditsItem = { life: 0 }
    const pickup = game._livePgesByIndex[0]
    pickup.init_PGE.counter_values[0] = 1
    pickup.init_PGE.counter_values[1] = 75
    game._livePgesByIndex[1] = creditsItem

    const result = runOpcode(0x65, { pge: pickup, a: 0, b: 0 }, game)

    assert.equal(result, UINT16_MAX)
    assert.equal(game._credits, 75)
    assert.equal(creditsItem.life, 75)
    assert.equal(pickup.room_location, UINT8_MAX)
})

test('saveState persists into the ingame slot and plays the save sound when enabled', () => {
    const previous = global_game_options.play_gamesaved_sound
    global_game_options.play_gamesaved_sound = true
    const game = createOpcodeGame()

    try {
        const result = runOpcode(0x69, { pge: game._livePgesByIndex[0], a: 0, b: 0 }, game)

        assert.equal(result, UINT16_MAX)
        assert.equal(game._saveStateCompleted, true)
        assert.equal(game._validSaveState, true)
        assert.deepEqual(game.calls, [
            ['saveGameState', kIngameSaveSlot],
            ['playSound', 68, 0],
        ])
    } finally {
        global_game_options.play_gamesaved_sound = previous
    }
})

test('setPgeDefaultAnim moves the PGE to its scripted room and reloads the map for room 1', () => {
    const game = createOpcodeGame()
    const pge = game._livePgesByIndex[0]
    pge.init_PGE.counter_values[2] = 1
    pge.anim_seq = 0

    const result = runOpcode(0x57, { pge, a: 2, b: 0 }, game)

    assert.equal(result, 1)
    assert.equal(pge.room_location, 1)
    assert.equal(game._loadMap, true)
    assert.equal(pge.anim_number, 9)
})

test('changeRoom copies source placement, updates room lists, and syncs matching script state', () => {
    const game = createOpcodeGame()
    const destination = {
        index: 1,
        pos_x: 10,
        pos_y: 20,
        room_location: 4,
        flags: 0,
        script_state_type: 2,
        anim_seq: 3,
        first_script_entry_index: 0,
        init_PGE: { counter_values: [], object_type: 1, script_node_index: 5 },
    }
    const source = {
        index: 2,
        pos_x: 90,
        pos_y: 142,
        room_location: 6,
        flags: 1,
        script_state_type: 7,
        anim_seq: 0,
        first_script_entry_index: 0,
        init_PGE: { counter_values: [], object_type: 3, script_node_index: 5 },
    }
    const trigger = game._livePgesByIndex[0]
    trigger.init_PGE.counter_values[0] = 1
    trigger.init_PGE.counter_values[1] = 2
    game._livePgesByIndex[1] = destination
    game._livePgesByIndex[2] = source
    game._livePgeStore.liveByRoom[4].push(destination)
    game._livePgeStore.liveByRoom[6].push(source)
    game._res.level.objectNodesMap[5] = { objects: [{ type: 2 }, { type: 7 }, { type: 9 }] }

    const result = runOpcode(0x82, { pge: trigger, a: 0, b: 0 }, game)

    assert.equal(result, UINT16_MAX)
    assert.equal(destination.pos_x, 90)
    assert.equal(destination.pos_y, 142)
    assert.equal(destination.room_location, 6)
    assert.equal(destination.flags & 1, 1)
    assert.equal(destination.script_state_type, 7)
    assert.equal(destination.first_script_entry_index, 1)
    assert.equal(destination.anim_seq, 0)
    assert.equal(destination.anim_number, 9)
    assert.equal(game._currentRoom, 6)
    assert.equal(game._loadMap, true)
    assert.equal(game._livePgeStore.liveByRoom[4].includes(destination), false)
    assert.equal(game._livePgeStore.liveByRoom[6].includes(destination), true)
})

test('playSoundGroup decodes the packed sound id and soft volume from counter values', () => {
    const game = createOpcodeGame()
    const pge = game._livePgesByIndex[0]
    pge.init_PGE.counter_values[3] = 0x0211

    const result = runOpcode(0x87, { pge, a: 3, b: 0 }, game)

    assert.equal(result, UINT16_MAX)
    assert.deepEqual(game.calls, [['playSound', 0x11, 0x02]])
})

test('adjustPos snaps the position to the tile grid and floor lane', () => {
    const game = createOpcodeGame()
    const pge = game._livePgesByIndex[0]
    pge.pos_x = 0x3F
    pge.pos_y = 100

    const result = runOpcode(0x88, { pge, a: 0, b: 0 }, game)

    assert.equal(result, UINT16_MAX)
    assert.equal(pge.pos_x, 0x30)
    assert.equal(pge.pos_y, 142)
})

test('setTempVar1 and isTempVar1Set share the same temporary opcode register', () => {
    const game = createOpcodeGame()
    const pge = game._livePgesByIndex[0]

    assert.equal(runOpcode(0x8A, { pge, a: 19, b: 0 }, game), UINT16_MAX)
    assert.equal(game._opcodeTempVar1, 19)
    assert.equal(runOpcode(0x8B, { pge, a: 19, b: 0 }, game), UINT16_MAX)
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
    pge.room_location = 20
    pge.collision_slot = 12
    game._livePgeStore.activeFrameByIndex[3] = pge

    const result = runOpcode(0x43, { pge, a: 0, b: 0 }, game)

    assert.equal(result, 1)
    assert.equal((pge.flags & PGE_FLAG_ACTIVE) === 0, true)
    assert.equal(pge.collision_slot, UINT16_MAX)
    assert.equal(game._livePgeStore.activeFrameByIndex[3], null)
    assert.equal(game._shouldPlayPgeAnimationSound, false)
})

test('playCutscene and playDeathCutscene only trigger when no death cutscene is active', () => {
    const game = createOpcodeGame()
    const pge = game._livePgesByIndex[0]
    pge.init_PGE.counter_values[3] = 4

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
