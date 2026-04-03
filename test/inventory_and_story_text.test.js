require('ts-node/register/transpile-only')

const test = require('node:test')
const assert = require('node:assert/strict')

const { gameHandleInventory } = require('../src/game_inventory.ts')
const { gameDrawStoryTexts } = require('../src/game_draw.ts')
const { LocaleData } = require('../src/resource/resource.ts')
const { UINT16_MAX, UINT8_MAX } = require('../src/game_constants.ts')

function createPlayerInput() {
    return {
        dirMask: 0,
        enter: false,
        backspace: false,
        quit: false,
    }
}

function createInventoryGame(overrides = {}) {
    const playerInput = createPlayerInput()
    const frontLayer = new Uint8Array(32)
    const tempLayer = new Uint8Array(32)
    frontLayer.fill(7)
    const drawIconCalls = []
    const drawStringCalls = []
    const videoDrawStringCalls = []
    const playSoundCalls = []
    let selectedPge = null

    const game = {
        _currentLevel: 1,
        _score: 1234,
        _skillLevel: 1,
        _inventoryItemIndicesByOwner: new Map([[0, [1, 2]]]),
        _livePgesByIndex: [
            { index: 0, life: 10 },
            { index: 1, life: 5, init_PGE: { object_id: 11 } },
            { index: 2, life: 9, init_PGE: { object_id: 12 } },
        ],
        _res: {
            level: {
                pgeAllInitialStateFromFile: [
                    {},
                    { icon_num: 10, text_num: 101, init_flags: 4 },
                    { icon_num: 11, text_num: 102, init_flags: 0 },
                ],
            },
            getTextString(_level, textNum) {
                return `ITEM_${textNum}`
            },
            getMenuString(id) {
                return {
                    [LocaleData.Id.LI_06_LEVEL]: 'LEVEL',
                    [LocaleData.Id.LI_13_EASY + 1]: 'NORMAL',
                }[id] || `TEXT_${id}`
            },
        },
        _stub: {
            _pi: playerInput,
            async sleep() {},
        },
        _vid: {
            _frontLayer: frontLayer,
            _tempLayer: tempLayer,
            _layerSize: frontLayer.length,
            async updateScreen() {},
            fullRefreshCalls: 0,
            fullRefresh() {
                this.fullRefreshCalls += 1
            },
            drawString(...args) {
                videoDrawStringCalls.push(args)
            },
        },
        drawIcon(iconNum, x, y, pal) {
            drawIconCalls.push([iconNum, x, y, pal])
        },
        drawString(str, x, y, color, hcenter) {
            drawStringCalls.push([str, x, y, color, hcenter])
        },
        playSound(sound, channel) {
            playSoundCalls.push([sound, channel])
        },
        async inp_update() {},
        setCurrentInventoryPge(pge) {
            selectedPge = pge
        },
        drawIconCalls,
        drawStringCalls,
        videoDrawStringCalls,
        playSoundCalls,
        get selectedPge() {
            return selectedPge
        },
    }

    Object.assign(game, overrides)
    return game
}

function createStoryGame(overrides = {}) {
    const playerInput = createPlayerInput()
    const frontLayer = new Uint8Array([1, 2, 3, 4, 5, 6])
    const tempLayer = new Uint8Array(frontLayer.length)
    const drawIconCalls = []
    const videoDrawStringCalls = []
    const voiceLoads = []
    const playCalls = []
    const stopAllCalls = []

    const game = {
        _currentInventoryIconNum: 12,
        _currentRoom: 7,
        _mix: {
            play(buf, len, rate, volume) {
                playCalls.push([buf, len, rate, volume])
            },
            isPlaying() {
                return false
            },
            stopAll() {
                stopAllCalls.push('stopAll')
            },
        },
        _res: {
            getGameString() {
                return Uint8Array.from([72, 69, 76, 76, 79, 0])
            },
            async load_VCE(textId, segment) {
                voiceLoads.push([textId, segment])
                return { buf: null, bufSize: 0 }
            },
        },
        renders: 42,
        _stub: {
            _pi: playerInput,
            async sleep() {},
        },
        _textToDisplay: 33,
        _vid: {
            _frontLayer: frontLayer,
            _tempLayer: tempLayer,
            _layerSize: frontLayer.length,
            async updateScreen() {},
            drawString(...args) {
                videoDrawStringCalls.push(args)
            },
        },
        drawIcon(iconNum, x, y, pal) {
            drawIconCalls.push([iconNum, x, y, pal])
        },
        async inp_update() {},
        drawIconCalls,
        videoDrawStringCalls,
        voiceLoads,
        playCalls,
        stopAllCalls,
    }

    Object.assign(game, overrides)
    return game
}

test('gameHandleInventory draws the selected item overlay and picks the highlighted inventory item on exit', async () => {
    const game = createInventoryGame()
    let iteration = 0

    game.inp_update = async () => {
        if (iteration === 0) {
            game._stub._pi.backspace = true
        }
        iteration += 1
    }

    await gameHandleInventory(game)

    assert.deepEqual(game.playSoundCalls, [[66, 0], [66, 0]])
    assert.equal(game.drawIconCalls.some(([icon]) => icon === 10), true)
    assert.deepEqual(game.drawStringCalls, [['ITEM_101', 256, 189, 237, true]])
    assert.deepEqual(game.videoDrawStringCalls, [['5', 124, 197, 237]])
    assert.equal(game._vid.fullRefreshCalls, 1)
    assert.equal(game._stub._pi.backspace, false)
    assert.equal(game.selectedPge, game._livePgesByIndex[1])
})

test('gameHandleInventory toggles to the score view and draws score and level strings', async () => {
    const game = createInventoryGame()
    let iteration = 0

    game.inp_update = async () => {
        if (iteration === 0) {
            game._stub._pi.enter = true
        } else if (iteration === 1) {
            game._stub._pi.backspace = true
        }
        iteration += 1
    }

    await gameHandleInventory(game)

    assert.equal(game.videoDrawStringCalls.some(([str]) => str === 'SCORE 00001234'), true)
    assert.equal(game.videoDrawStringCalls.some(([str]) => str === 'LEVEL:NORMAL'), true)
})

test('gameDrawStoryTexts draws the speech icon and centered lines, then clears the active story text', async () => {
    const game = createStoryGame({
        _res: {
            getGameString() {
                return Uint8Array.from([72, 69, 76, 76, 79, 0x0A, 87, 79, 82, 76, 68, 0])
            },
            async load_VCE(textId, segment) {
                game.voiceLoads.push([textId, segment])
                return { buf: null, bufSize: 0 }
            },
        },
    })
    let iteration = 0

    game.inp_update = async () => {
        if (iteration === 0) {
            game._stub._pi.backspace = true
        }
        iteration += 1
    }

    await gameDrawStoryTexts(game)

    assert.deepEqual(game.drawIconCalls, [[12, 80, 8, 12]])
    assert.deepEqual(game.videoDrawStringCalls, [
        ['HELLO', 68, 26, 232],
        ['WORLD', 68, 34, 232],
    ])
    assert.deepEqual(game.voiceLoads, [[33, 0]])
    assert.equal(game._stub._pi.backspace, false)
    assert.equal(game._textToDisplay, UINT16_MAX)
})

test('gameDrawStoryTexts applies color control codes, plays voice, and restores the UI layer between segments', async () => {
    const voiceBuffer = Uint8Array.from([1, 2, 3])
    const game = createStoryGame({
        _res: {
            getGameString() {
                return Uint8Array.from([
                    UINT8_MAX, 0xED, 0,
                    72, 73, 0x0B,
                    66, 89, 69, 0,
                ])
            },
            async load_VCE(textId, segment) {
                game.voiceLoads.push([textId, segment])
                return segment === 0 ? { buf: voiceBuffer, bufSize: voiceBuffer.length } : { buf: null, bufSize: 0 }
            },
        },
    })
    let iteration = 0

    game.inp_update = async () => {
        if (iteration === 0) {
            game._stub._pi.backspace = true
        } else if (iteration === 1) {
            game._stub._pi.backspace = true
        }
        iteration += 1
    }
    game._vid._frontLayer.fill(9)

    await gameDrawStoryTexts(game)

    assert.deepEqual(game.videoDrawStringCalls, [
        ['HI', 80, 26, 237],
        ['BYE', 76, 26, 237],
    ])
    assert.deepEqual(game.voiceLoads, [[33, 0], [33, 1]])
    assert.deepEqual(game.playCalls, [[voiceBuffer, 3, 32000, 64]])
    assert.deepEqual(game.stopAllCalls, ['stopAll'])
    assert.deepEqual(Array.from(game._vid._frontLayer), Array.from(game._vid._tempLayer))
})
