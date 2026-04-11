require('ts-node/register/transpile-only')

const test = require('node:test')
const assert = require('node:assert/strict')

const { Menu } = require('../src/game/menu.ts')
const { LocaleData } = require('../src/resource/resource.ts')
const { dirDown } = require('../src/platform/systemstub-web.ts')
const { gamescreenW, gamescreenH } = require('../src/video/video.ts')

function createMenuFixture(overrides = {}) {
    const scratchSize = 0x3800 * 4
    const scratchBuffer = new Uint8Array(scratchSize)
    const res = {
        scratchBuffer,
        async loadMenuMap() {},
        async loadMenuPalette() {},
        getMenuString(id) {
            return {
                [LocaleData.Id.li07Start]: 'START',
                [LocaleData.Id.li10Info]: 'INFO',
                [LocaleData.Id.li11Quit]: 'QUIT',
            }[id] || `TEXT_${id}`
        },
    }
    const stub = {
        _pi: {
            dirMask: 0,
            enter: false,
            escape: false,
            quit: false,
        },
        sleepCalls: [],
        paletteCalls: [],
        async sleep(ms) {
            this.sleepCalls.push(ms)
        },
        async processEvents() {},
        setPalette(buffer, size) {
            this.paletteCalls.push([buffer, size])
        },
    }
    const vid = {
        text: {
            charFrontColor: 10,
            charTransparentColor: 11,
            charShadowColor: 12,
        },
        layers: {
            frontLayer: new Uint8Array(gamescreenW * gamescreenH),
            backLayer: new Uint8Array(gamescreenW * gamescreenH),
            layerSize: gamescreenW * gamescreenH,
        },
        drawCalls: [],
        dirtyCalls: [],
        fullRefreshCalls: 0,
        fadeOutCalls: 0,
        updateScreenCalls: 0,
        clearHiResRoomLayerCalls: 0,
        pcDrawchar(...args) {
            this.drawCalls.push(args)
        },
        getTextColors() {
            return {
                frontColor: this.text.charFrontColor,
                transparentColor: this.text.charTransparentColor,
                shadowColor: this.text.charShadowColor,
            }
        },
        setTextColors(frontColor, transparentColor, shadowColor) {
            this.text.charFrontColor = frontColor
            this.text.charTransparentColor = transparentColor
            this.text.charShadowColor = shadowColor
        },
        setTextTransparentColor(color) {
            this.text.charTransparentColor = color
        },
        copyFrontLayerToBack() {
            this.layers.backLayer.set(this.layers.frontLayer.subarray(0, this.layers.layerSize))
        },
        markBlockAsDirty(...args) {
            this.dirtyCalls.push(args)
        },
        fullRefresh() {
            this.fullRefreshCalls += 1
        },
        async fadeOut() {
            this.fadeOutCalls += 1
        },
        async updateScreen() {
            this.updateScreenCalls += 1
        },
        clearHiResRoomLayer() {
            this.clearHiResRoomLayerCalls += 1
        },
    }

    Object.assign(res, overrides.res)
    Object.assign(stub, overrides.stub)
    Object.assign(vid, overrides.vid)

    const menu = new Menu(res, stub, vid)
    Object.assign(menu, overrides.menu)

    return { menu, res, stub, vid }
}

test('loadPicture copies the packed menu image into the front and back layers and applies the palette', async () => {
    const { menu, res, stub, vid } = createMenuFixture()

    res.loadMenuMap = async (_prefix, buffer) => {
        for (let plane = 0; plane < 4; ++plane) {
            const base = 0x3800 * plane
            buffer[base + 0] = plane + 1
            buffer[base + 1] = plane + 11
            buffer[base + 64] = plane + 21
        }
    }
    res.loadMenuPalette = async (_prefix, buffer) => {
        buffer[0] = 0xAA
        buffer[1] = 0xBB
    }

    await menu.loadPicture('menu1')

    assert.equal(vid.clearHiResRoomLayerCalls, 1)
    assert.deepEqual(Array.from(vid.layers.frontLayer.slice(0, 8)), [1, 2, 3, 4, 11, 12, 13, 14])
    assert.deepEqual(Array.from(vid.layers.frontLayer.slice(gamescreenW, gamescreenW + 4)), [21, 22, 23, 24])
    assert.deepEqual(Array.from(vid.layers.backLayer.slice(0, 8)), [1, 2, 3, 4, 11, 12, 13, 14])
    assert.deepEqual(stub.paletteCalls, [[res.scratchBuffer, 256]])
})

test('drawString switches menu colors for the requested style and restores previous video colors', () => {
    const { menu, vid } = createMenuFixture()
    menu._charVar1 = 1
    menu._charVar2 = 2
    menu._charVar3 = 3
    menu._charVar4 = 4
    menu._charVar5 = 5

    menu.drawString('AB', 6, 7, 2)

    assert.deepEqual(vid.drawCalls, [
        [65, 6, 7],
        [66, 6, 8],
    ])
    assert.deepEqual(vid.dirtyCalls, [[56, 48, 16, 8, 1]])
    assert.equal(vid.text.charFrontColor, 10)
    assert.equal(vid.text.charTransparentColor, 11)
    assert.equal(vid.text.charShadowColor, 12)
})

test('handleLevelScreen cycles entries, updates the selected level, and exits on enter', async () => {
    const { menu, stub, vid } = createMenuFixture()
    let iteration = 0

    menu._level = 0
    stub.processEvents = async () => {
        if (iteration === 0) {
            stub._pi.dirMask = dirDown
        } else if (iteration === 1) {
            stub._pi.enter = true
        }
        iteration += 1
    }

    const selected = await menu.handleLevelScreen()

    assert.equal(selected, true)
    assert.equal(menu._level, 1)
    assert.equal(stub._pi.enter, false)
    assert.equal(vid.updateScreenCalls >= 1, true)
    assert.equal(vid.dirtyCalls.length > 0, true)
})

test('handleInfoScreen loads the info picture and returns when escape is pressed', async () => {
    const { menu, stub, vid } = createMenuFixture()
    const pictures = []
    let iteration = 0

    menu.loadPicture = async (prefix) => {
        pictures.push(prefix)
    }
    stub.processEvents = async () => {
        if (iteration === 0) {
            stub._pi.escape = true
        }
        iteration += 1
    }

    await menu.handleInfoScreen()

    assert.deepEqual(pictures, ['instru_e'])
    assert.equal(vid.fadeOutCalls, 1)
    assert.equal(vid.fullRefreshCalls, 1)
    assert.equal(vid.updateScreenCalls, 1)
    assert.equal(stub._pi.escape, false)
})

test('handleTitleScreen dispatches the START option through the level screen flow', async () => {
    const { menu, stub, vid } = createMenuFixture()
    const pictures = []
    let levelScreenCalls = 0
    let iteration = 0

    menu.loadPicture = async (prefix) => {
        pictures.push(prefix)
    }
    menu.handleLevelScreen = async () => {
        levelScreenCalls += 1
        menu._level = 2
        return true
    }
    stub.processEvents = async () => {
        if (iteration === 0) {
            stub._pi.enter = true
        }
        iteration += 1
    }

    await menu.handleTitleScreen()

    assert.deepEqual(pictures, ['menu1'])
    assert.equal(vid.fadeOutCalls, 1)
    assert.equal(vid.fullRefreshCalls, 1)
    assert.equal(levelScreenCalls, 1)
    assert.equal(menu._selectedOption, Menu.menuOptionItemStart)
    assert.equal(menu._nextScreen, 0)
})
