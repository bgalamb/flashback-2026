require('ts-node/register/transpile-only')

const test = require('node:test')
const assert = require('node:assert/strict')

const gameDraw = require('../src/game/game_draw.ts')
const { pgeFlagSpecialAnim, uint8Max } = require('../src/core/game_constants.ts')
const { attachGroupedGameState } = require('./helpers/grouped_game_state.js')

const attachDrawGroupedGameState = (game) => attachGroupedGameState(game, {
    services: {
        res: '_res',
        vid: '_vid',
    },
    world: {
        blinkingConradCounter: '_blinkingConradCounter',
    },
    runtimeData: {
        livePgesByIndex: '_livePgesByIndex',
    },
    renderData: {
        animBuffers: '_animBuffers',
    },
})

function createDrawGame(overrides = {}) {
    const spriteDrawCalls = []
    const dirtyCalls = []
    const decodeObjectCalls = []

    const game = {
        _animBuffers: {
            _states: [null, null, null, null],
            _curPos: [uint8Max, uint8Max, uint8Max, uint8Max],
        },
        _blinkingConradCounter: 0,
        _livePgesByIndex: [{}],
        _res: {
            ui: {
                rp: new Uint8Array(0x4A),
            },
            scratchBuffer: new Uint8Array(64),
            findBankData() {
                return null
            },
            loadBankData() {
                return new Uint8Array(64)
            },
        },
        _vid: {
            pcDecodespmcalls: [],
            pcDecodespm(dataPtr, scratchBuffer) {
                this.pcDecodespmcalls.push([dataPtr, scratchBuffer])
            },
            pcDecodespc(dataPtr, w, h, scratchBuffer) {
                decodeObjectCalls.push([dataPtr, w, h, scratchBuffer])
            },
            drawSpriteSub3ToFrontLayer(dataPtr, dstOffset, stride, clippedH, clippedW, colMask) {
                spriteDrawCalls.push([dataPtr, dstOffset, stride, clippedH, clippedW, colMask])
            },
            markBlockAsDirty(x, y, w, h, layer) {
                dirtyCalls.push([x, y, w, h, layer])
            },
        },
        spriteDrawCalls,
        dirtyCalls,
        decodeObjectCalls,
    }

    Object.assign(game, overrides)
    return attachDrawGroupedGameState(game)
}

test('gameDrawAnimBuffer renders monster sprites with their prepared palette override', async () => {
    const game = createDrawGame()
    const monster = {
        index: 4,
        flags: 0,
        initPge: { objectType: 10 },
    }
    const encodedSprite = Uint8Array.from([0x80, 0x00, 7, 8, 9]).subarray(2)
    const state = [{
        x: 36,
        y: 51,
        w: 5,
        h: 6,
        dataPtr: encodedSprite,
        pge: monster,
        paletteColorMaskOverride: 0x50,
    }]

    game._animBuffers._curPos[0] = 0

    await gameDraw.gameDrawAnimBuffer(game, 0, state)

    assert.deepEqual(Array.from(game.spriteDrawCalls[0][0].subarray(0, 3)), [7, 8, 9])
    assert.deepEqual(game.spriteDrawCalls[0].slice(1), [13092, 5, 6, 5, 0x50])
    assert.deepEqual(game.dirtyCalls, [[36, 51, 5, 6, 1]])
    assert.equal(game._vid.pcDecodespmcalls.length, 0)
    assert.equal(game._animBuffers._curPos[0], uint8Max)
})

test('gameDrawAnimBuffer renders Conrad from the player animation layer through drawCharacter', async () => {
    const game = createDrawGame()
    const conrad = {
        index: 0,
        flags: 0,
        initPge: { objectType: 1 },
    }
    const encodedSprite = Uint8Array.from([0x80, 0x00, 9, 8, 7]).subarray(2)
    const state = [{
        x: 47,
        y: 100,
        w: 3,
        h: 4,
        dataPtr: encodedSprite,
        pge: conrad,
        paletteColorMaskOverride: -1,
    }]

    game._livePgesByIndex[0] = conrad
    game._animBuffers._curPos[1] = 0

    await gameDraw.gameDrawAnimBuffer(game, 1, state)

    assert.deepEqual(Array.from(game.spriteDrawCalls[0][0].subarray(0, 3)), [9, 8, 7])
    assert.deepEqual(game.spriteDrawCalls[0].slice(1), [25647, 3, 4, 3, 0x40])
    assert.deepEqual(game.dirtyCalls, [[47, 100, 3, 4, 1]])
    assert.equal(game._vid.pcDecodespmcalls.length, 0)
    assert.equal(game._animBuffers._curPos[1], uint8Max)
})

test('gameDrawAnimBuffer skips Conrad rendering on blinking frames', async () => {
    const game = createDrawGame({ _blinkingConradCounter: 1 })
    const conrad = {
        index: 0,
        flags: 0,
        initPge: { objectType: 1 },
    }
    const encodedSprite = Uint8Array.from([0x80, 0x00, 9, 8, 7]).subarray(2)
    const state = [{
        x: 47,
        y: 100,
        w: 3,
        h: 4,
        dataPtr: encodedSprite,
        pge: conrad,
        paletteColorMaskOverride: -1,
    }]

    game._livePgesByIndex[0] = conrad
    game._animBuffers._curPos[1] = 0

    await gameDraw.gameDrawAnimBuffer(game, 1, state)

    assert.deepEqual(game.spriteDrawCalls, [])
    assert.equal(game._animBuffers._curPos[1], uint8Max)
})

test('gameDrawAnimBuffer renders special visible PGEs through drawObject with the barrier palette override', async () => {
    const game = createDrawGame()
    const visiblePge = {
        index: 6,
        flags: pgeFlagSpecialAnim,
        initPge: { objectType: 6 },
    }
    const objectData = Uint8Array.from([1, 2, 3, 4])
    const state = [{
        x: 67,
        y: 70,
        w: 0,
        h: 0,
        dataPtr: Uint8Array.from([1, 2, 3, 0, 0, 1, 0, 0, 0, 0]),
        pge: visiblePge,
        paletteColorMaskOverride: -1,
    }]

    game._animBuffers._curPos[3] = 0

    await gameDraw.gameDrawAnimBuffer(game, 3, state)

    assert.equal(game.decodeObjectCalls.length, 1)
    assert.deepEqual(game.spriteDrawCalls[0].slice(1), [17217, 8, 8, 8, 0x60])
    assert.deepEqual(game.dirtyCalls, [[65, 67, 8, 8, 1]])
    assert.equal(game._animBuffers._curPos[3], uint8Max)
})

test('gameDrawCurrentRoomOverlay reads grouped world/ui state instead of legacy flat fields', () => {
    const drawStringCalls = []
    const game = {
        services: {
            get vid() {
                return game._vid
            },
        },
        world: {
            currentLevel: 0,
            currentRoom: 12,
            currentIcon: 0,
            printLevelCodeCounter: 0,
            textToDisplay: uint8Max,
            eraseBackground: false,
            blinkingConradCounter: 0,
        },
        ui: {
            currentRoomOverlayCounter: 2,
            currentInventoryIconNum: 0,
        },
        _currentRoom: 99,
        _currentRoomOverlayCounter: 88,
        _vid: {
            drawString(...args) {
                drawStringCalls.push(args)
            },
        },
    }

    gameDraw.gameDrawCurrentRoomOverlay(game)

    assert.deepEqual(drawStringCalls, [['ROOM 12', 8, 8, 0xE6]])
    assert.equal(game.ui.currentRoomOverlayCounter, 1)
    assert.equal(game._currentRoomOverlayCounter, 88)
})
