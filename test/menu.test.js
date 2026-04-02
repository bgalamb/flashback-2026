require('ts-node/register/transpile-only')

const test = require('node:test')
const assert = require('node:assert/strict')

const { Menu } = require('../src/menu.ts')
const { LocaleData } = require('../src/resource/resource.ts')
const { DIR_DOWN } = require('../src/systemstub_web.ts')
const { GAMESCREEN_W, GAMESCREEN_H } = require('../src/video.ts')

function createMenuFixture(overrides = {}) {
    const scratchSize = 0x3800 * 4
    const scratchBuffer = new Uint8Array(scratchSize)
    const res = {
        _scratchBuffer: scratchBuffer,
        async load_MAP_menu() {},
        async load_PAL_menu() {},
        getMenuString(id) {
            return {
                [LocaleData.Id.LI_07_START]: 'START',
                [LocaleData.Id.LI_10_INFO]: 'INFO',
                [LocaleData.Id.LI_11_QUIT]: 'QUIT',
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
        _charFrontColor: 10,
        _charTransparentColor: 11,
        _charShadowColor: 12,
        _frontLayer: new Uint8Array(GAMESCREEN_W * GAMESCREEN_H),
        _backLayer: new Uint8Array(GAMESCREEN_W * GAMESCREEN_H),
        _layerSize: GAMESCREEN_W * GAMESCREEN_H,
        drawCalls: [],
        dirtyCalls: [],
        fullRefreshCalls: 0,
        fadeOutCalls: 0,
        updateScreenCalls: 0,
        PC_drawChar(...args) {
            this.drawCalls.push(args)
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

    res.load_MAP_menu = async (_prefix, buffer) => {
        for (let plane = 0; plane < 4; ++plane) {
            const base = 0x3800 * plane
            buffer[base + 0] = plane + 1
            buffer[base + 1] = plane + 11
            buffer[base + 64] = plane + 21
        }
    }
    res.load_PAL_menu = async (_prefix, buffer) => {
        buffer[0] = 0xAA
        buffer[1] = 0xBB
    }

    await menu.loadPicture('menu1')

    assert.deepEqual(Array.from(vid._frontLayer.slice(0, 8)), [1, 2, 3, 4, 11, 12, 13, 14])
    assert.deepEqual(Array.from(vid._frontLayer.slice(GAMESCREEN_W, GAMESCREEN_W + 4)), [21, 22, 23, 24])
    assert.deepEqual(Array.from(vid._backLayer.slice(0, 8)), [1, 2, 3, 4, 11, 12, 13, 14])
    assert.deepEqual(stub.paletteCalls, [[res._scratchBuffer, 256]])
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
    assert.equal(vid._charFrontColor, 10)
    assert.equal(vid._charTransparentColor, 11)
    assert.equal(vid._charShadowColor, 12)
})

test('handleLevelScreen cycles entries, updates the selected level, and exits on enter', async () => {
    const { menu, stub, vid } = createMenuFixture()
    let iteration = 0

    menu._level = 0
    stub.processEvents = async () => {
        if (iteration === 0) {
            stub._pi.dirMask = DIR_DOWN
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
    assert.equal(menu._selectedOption, Menu.MENU_OPTION_ITEM_START)
    assert.equal(menu._nextScreen, 0)
})
