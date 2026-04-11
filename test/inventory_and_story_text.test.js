require('ts-node/register/transpile-only')

const test = require('node:test')
const assert = require('node:assert/strict')

const { gameHandleInventory } = require('../src/game/game_inventory.ts')
const { gameDrawStoryTexts } = require('../src/game/game_draw.ts')
const { LocaleData } = require('../src/resource/resource.ts')
const { uint16Max, uint8Max } = require('../src/core/game_constants.ts')

function createPlayerInput() {
    return {
        dirMask: 0,
        enter: false,
        backspace: false,
        quit: false,
    }
}

function attachInventoryGroupedGameState(game) {
    game.world = {
        get currentLevel() { return game._currentLevel },
        set currentLevel(value) { game._currentLevel = value },
        get currentRoom() { return game._currentRoom },
        set currentRoom(value) { game._currentRoom = value },
        get textToDisplay() { return game._textToDisplay },
        set textToDisplay(value) { game._textToDisplay = value },
    }
    game.ui = {
        get score() { return game._score },
        set score(value) { game._score = value },
        get skillLevel() { return game._skillLevel },
        set skillLevel(value) { game._skillLevel = value },
        get currentInventoryIconNum() { return game._currentInventoryIconNum },
        set currentInventoryIconNum(value) { game._currentInventoryIconNum = value },
    }
    game.services = {
        get res() { return game._res },
        set res(value) { game._res = value },
        get vid() { return game._vid },
        set vid(value) { game._vid = value },
        get mix() { return game._mix },
        set mix(value) { game._mix = value },
        get stub() { return game._stub },
        set stub(value) { game._stub = value },
        get menu() { return game._menu },
        set menu(value) { game._menu = value },
    }
    game.runtimeData = {
        get livePgesByIndex() { return game._livePgesByIndex },
        set livePgesByIndex(value) { game._livePgesByIndex = value },
        get inventoryItemIndicesByOwner() { return game._inventoryItemIndicesByOwner },
        set inventoryItemIndicesByOwner(value) { game._inventoryItemIndicesByOwner = value },
    }
    return game
}

function attachStoryGroupedGameState(game) {
    game.world = {
        get currentRoom() { return game._currentRoom },
        set currentRoom(value) { game._currentRoom = value },
        get textToDisplay() { return game._textToDisplay },
        set textToDisplay(value) { game._textToDisplay = value },
    }
    game.ui = {
        get currentInventoryIconNum() { return game._currentInventoryIconNum },
        set currentInventoryIconNum(value) { game._currentInventoryIconNum = value },
    }
    game.services = {
        get res() { return game._res },
        set res(value) { game._res = value },
        get vid() { return game._vid },
        set vid(value) { game._vid = value },
        get mix() { return game._mix },
        set mix(value) { game._mix = value },
        get stub() { return game._stub },
        set stub(value) { game._stub = value },
        get menu() { return game._menu },
        set menu(value) { game._menu = value },
    }
    return game
}

function createInventoryGame(overrides = {}) {
    const textEncoder = new TextEncoder()
    const playerInput = createPlayerInput()
    const frontLayer = new Uint8Array(32)
    const tempLayer = new Uint8Array(32)
    frontLayer.fill(7)
    const drawIconCalls = []
    const drawStringLenCalls = []
    const videoDrawStringCalls = []

    const game = {
        _currentLevel: 1,
        _score: 1234,
        _skillLevel: 1,
        _inventoryItemIndicesByOwner: new Map([[0, [1, 2]]]),
        _livePgesByIndex: [
            { index: 0, life: 10 },
            { index: 1, life: 5, initPge: { objectId: 11 } },
            { index: 2, life: 9, initPge: { objectId: 12 } },
        ],
        _res: {
            level: {
                pgeAllInitialStateFromFile: [
                    {},
                    { iconNum: 10, textNum: 101, initFlags: 4 },
                    { iconNum: 11, textNum: 102, initFlags: 0 },
                ],
            },
            getTextString(_level, textNum) {
                return textEncoder.encode(`ITEM_${textNum}\0`)
            },
            getMenuString(id) {
                return {
                    [LocaleData.Id.li06Level]: 'LEVEL',
                    [LocaleData.Id.li13Easy + 1]: 'NORMAL',
                }[id] || `text${id}`
            },
            ui: {
                icn: new Uint8Array(16),
            },
            audio: {
                numSfx: 0,
                sfxList: [],
            },
        },
        _stub: {
            _pi: playerInput,
            get input() {
                return this._pi
            },
            async sleep() {},
            async processEvents() {},
        },
        _vid: {
            layers: {
                w: 256,
                frontLayer,
                tempLayer,
                layerSize: frontLayer.length,
            },
            text: {
                charFrontColor: 0,
                charTransparentColor: 0,
                charShadowColor: 0,
            },
            setTextColors(frontColor, transparentColor, shadowColor) {
                this.text.charFrontColor = frontColor
                this.text.charTransparentColor = transparentColor
                this.text.charShadowColor = shadowColor
            },
            setTextTransparentColor(color) {
                this.text.charTransparentColor = color
            },
            async updateScreen() {},
            fullRefreshCalls: 0,
            fullRefresh() {
                this.fullRefreshCalls += 1
            },
            pcDecodeicn(_icn, iconNum, buf) {
                drawIconCalls.push(iconNum)
                buf.fill(iconNum)
            },
            drawSpriteSub1ToFrontLayer() {},
            markBlockAsDirty() {},
            drawStringLen(...args) {
                drawStringLenCalls.push(args)
            },
            drawString(...args) {
                videoDrawStringCalls.push(args)
            },
        },
        drawIconCalls,
        drawStringLenCalls,
        videoDrawStringCalls,
    }

    Object.assign(game, overrides)
    return attachInventoryGroupedGameState(game)
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
            ui: {
                icn: new Uint8Array(16),
            },
            getGameString() {
                return Uint8Array.from([72, 69, 76, 76, 79, 0])
            },
            async loadVce(textId, segment) {
                voiceLoads.push([textId, segment])
                return { buf: null, bufSize: 0 }
            },
        },
        renders: 42,
        _stub: {
            _pi: playerInput,
            get input() {
                return this._pi
            },
            async sleep() {},
            async processEvents() {},
        },
        _textToDisplay: 33,
        _vid: {
            layers: {
                w: 256,
                frontLayer,
                tempLayer,
                layerSize: frontLayer.length,
            },
            copyFrontLayerToTemp() {
                this.layers.tempLayer.set(this.layers.frontLayer.subarray(0, this.layers.layerSize))
            },
            restoreFrontLayerFromTemp() {
                this.layers.frontLayer.set(this.layers.tempLayer.subarray(0, this.layers.layerSize))
            },
            async updateScreen() {},
            pcDecodeicn(_icn, iconNum, buf) {
                drawIconCalls.push(iconNum)
                buf.fill(iconNum)
            },
            drawSpriteSub1ToFrontLayer() {},
            markBlockAsDirty() {},
            drawString(...args) {
                videoDrawStringCalls.push(args)
            },
        },
        drawIconCalls,
        videoDrawStringCalls,
        voiceLoads,
        playCalls,
        stopAllCalls,
    }

    Object.assign(game, overrides)
    return attachStoryGroupedGameState(game)
}

test('gameHandleInventory draws the selected item overlay and picks the highlighted inventory item on exit', async () => {
    const game = createInventoryGame()
    let iteration = 0

    game._stub.processEvents = async () => {
        if (iteration === 0) {
            game._stub._pi.backspace = true
        }
        iteration += 1
    }

    await gameHandleInventory(game)

    assert.equal(game.drawIconCalls.includes(10), true)
    assert.equal(game.drawIconCalls.includes(76), true)
    assert.deepEqual(game.drawStringLenCalls, [['ITEM_101', 8, 96, 189, 237]])
    assert.deepEqual(game.videoDrawStringCalls, [['5', 124, 197, 237]])
    assert.equal(game._vid.fullRefreshCalls, 1)
    assert.equal(game._stub._pi.backspace, false)
    assert.deepEqual(game._inventoryItemIndicesByOwner.get(0), [1, 2])
})

test('gameHandleInventory toggles to the score view and draws score and level strings', async () => {
    const game = createInventoryGame()
    let iteration = 0

    game._stub.processEvents = async () => {
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
            ui: {
                icn: new Uint8Array(16),
            },
            getGameString() {
                return Uint8Array.from([72, 69, 76, 76, 79, 0x0A, 87, 79, 82, 76, 68, 0])
            },
            async loadVce(textId, segment) {
                game.voiceLoads.push([textId, segment])
                return { buf: null, bufSize: 0 }
            },
        },
    })
    let iteration = 0

    game._stub.processEvents = async () => {
        if (iteration === 0) {
            game._stub._pi.backspace = true
        }
        iteration += 1
    }

    await gameDrawStoryTexts(game)

    assert.deepEqual(game.drawIconCalls, [12])
    assert.deepEqual(game.videoDrawStringCalls, [
        ['HELLO', 68, 26, 232],
        ['WORLD', 68, 34, 232],
    ])
    assert.deepEqual(game.voiceLoads, [[33, 0]])
    assert.equal(game._stub._pi.backspace, false)
    assert.equal(game._textToDisplay, uint16Max)
})

test('gameDrawStoryTexts applies color control codes, plays voice, and restores the UI layer between segments', async () => {
    const voiceBuffer = Uint8Array.from([1, 2, 3])
    const game = createStoryGame({
        _res: {
            ui: {
                icn: new Uint8Array(16),
            },
            getGameString() {
                return Uint8Array.from([
                    uint8Max, 0xED, 0,
                    72, 73, 0x0B,
                    66, 89, 69, 0,
                ])
            },
            async loadVce(textId, segment) {
                game.voiceLoads.push([textId, segment])
                return segment === 0 ? { buf: voiceBuffer, bufSize: voiceBuffer.length } : { buf: null, bufSize: 0 }
            },
        },
    })
    let iteration = 0

    game._stub.processEvents = async () => {
        if (iteration === 0) {
            game._stub._pi.backspace = true
        } else if (iteration === 1) {
            game._stub._pi.backspace = true
        }
        iteration += 1
    }
    game._vid.layers.frontLayer.fill(9)

    await gameDrawStoryTexts(game)

    assert.deepEqual(game.videoDrawStringCalls, [
        ['HI', 80, 26, 237],
        ['BYE', 76, 26, 237],
    ])
    assert.deepEqual(game.voiceLoads, [[33, 0], [33, 1]])
    assert.deepEqual(game.playCalls, [[voiceBuffer, 3, 32000, 64]])
    assert.deepEqual(game.stopAllCalls, ['stopAll'])
    assert.deepEqual(Array.from(game._vid.layers.frontLayer), Array.from(game._vid.layers.tempLayer))
})
