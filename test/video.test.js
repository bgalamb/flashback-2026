require('ts-node/register/transpile-only')

const test = require('node:test')
const assert = require('node:assert/strict')

const { Video, GAMESCREEN_W, GAMESCREEN_H } = require('../src/video.ts')
const { encodeIndexedPng } = require('../src/indexed-png.ts')
const { SCREENBLOCK_W, SCREENBLOCK_H } = require('../src/game_constants.ts')

function createPaletteBank(bankIndex) {
    return Array.from({ length: 16 }, (_, colorIndex) => ({
        r: (bankIndex * 16 + colorIndex) & 0xFF,
        g: (bankIndex * 16 + colorIndex + 1) & 0xFF,
        b: (bankIndex * 16 + colorIndex + 2) & 0xFF,
    }))
}

function createPalette256() {
    return Array.from({ length: 16 }, (_, bankIndex) => createPaletteBank(bankIndex)).flat()
}

function createPaletteHeaderJson(slotOffsets, slotColors) {
    return JSON.stringify({
        slots: {
            slot1: { dec: slotOffsets[0], colors: slotColors[0] },
            slot2: { dec: slotOffsets[1], colors: slotColors[1] },
            slot3: { dec: slotOffsets[2], colors: slotColors[2] },
            slot4: { dec: slotOffsets[3], colors: slotColors[3] },
        },
    })
}

function createLePalette(words) {
    const out = new Uint8Array(words.length * 2)
    for (let i = 0; i < words.length; ++i) {
        out[i * 2 + 0] = words[i] & 0xFF
        out[i * 2 + 1] = (words[i] >> 8) & 0xFF
    }
    return out
}

function installFetch(fixtures) {
    const originalFetch = global.fetch
    const calls = []

    global.fetch = async (path) => {
        calls.push(path)
        const data = fixtures[path]
        if (!data) {
            throw new Error(`missing fixture: ${path}`)
        }
        return {
            async arrayBuffer() {
                return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
            },
        }
    }

    return {
        calls,
        restore() {
            global.fetch = originalFetch
        },
    }
}

function createVideoFixture(overrides = {}) {
    const paletteEntries = new Map()
    const stub = {
        _rgbPalette: new Uint8ClampedArray(256 * 4),
        copyRectCalls: [],
        updateScreenCalls: [],
        setPaletteEntry(index, color) {
            paletteEntries.set(index, { ...color })
        },
        copyRect(...args) {
            this.copyRectCalls.push(args)
        },
        async updateScreen(offset) {
            this.updateScreenCalls.push(offset)
        },
        fadeScreen() {},
    }

    const conradPaletteWords = Array.from({ length: 16 }, (_, i) => 0x111 + i)
    const res = {
        ui: {
            fnt: new Uint8Array(0),
        },
        fileSystem: {
            findPath(filename) {
                return filename
            },
        },
        sprites: {
            loadedConradVisualsByVariantId: new Map([
                [1, { paletteSlot: 4, palette: createLePalette(conradPaletteWords) }],
                [2, { paletteSlot: 4, palette: createLePalette(conradPaletteWords.map((word) => word + 0x111)) }],
            ]),
        },
    }

    Object.assign(res, overrides.res)
    const video = new Video(res, stub)
    video._unkPalSlot1 = 0
    video._unkPalSlot2 = 0
    Object.assign(video, overrides.video)
    return { video, stub, res, paletteEntries, conradPaletteWords }
}

test('PC_decodeMap loads indexed room pixels, copies the back layer, and applies palette sources', async () => {
    const room = 3
    const level = 1
    const roomPalette = createPalette256()
    const headerSlotColors = [createPaletteBank(1), createPaletteBank(2), createPaletteBank(3), createPaletteBank(4)]
    const headerOffsets = [10, 20, 30, 40]
    const pixels = new Uint8Array(GAMESCREEN_W * GAMESCREEN_H)
    pixels.fill(0x8F)
    pixels[1] = 0x21
    const png = encodeIndexedPng(GAMESCREEN_W, GAMESCREEN_H, pixels, roomPalette)
    const headerJson = new TextEncoder().encode(createPaletteHeaderJson(headerOffsets, headerSlotColors))
    const { video, paletteEntries } = createVideoFixture()
    const fetch = installFetch({
        [`levels/level2/level2.paletteheader.json`]: headerJson,
        [`levels/level2/level2-room${room}.pixeldata.png`]: png,
    })

    try {
        await video.PC_decodeMap(level, room)
    } finally {
        fetch.restore()
    }

    assert.deepEqual(Array.from(video._frontLayer.slice(0, 4)), [0x8F, 0x21, 0x8F, 0x8F])
    assert.deepEqual(Array.from(video._backLayer.slice(0, 4)), [0x8F, 0x21, 0x8F, 0x8F])
    assert.deepEqual(video._paletteHeaderOffsetsCache[level], headerOffsets)
    assert.equal(video._unkPalSlot1, 30)
    assert.equal(video._unkPalSlot2, 30)
    assert.deepEqual(video._currentRoomPngPaletteColors[8][15], roomPalette[8 * 16 + 15])
    assert.deepEqual(paletteEntries.get(0x00), roomPalette[0])
    assert.deepEqual(paletteEntries.get(0x60), headerSlotColors[0][0])
    assert.deepEqual(paletteEntries.get(0x80), roomPalette[8 * 16 + 0])
    assert.deepEqual(paletteEntries.get(0x90), roomPalette[9 * 16 + 0])
    assert.deepEqual(paletteEntries.get(0xC0), headerSlotColors[2][0])
    assert.deepEqual(paletteEntries.get(0xD0), headerSlotColors[3][0])
    assert.deepEqual(paletteEntries.get(0x40), Video.AMIGA_convertColor(0x111))
})

test('PC_decodeMap falls back to a blank front layer when the room png is missing', async () => {
    const room = 5
    const level = 1
    const headerJson = new TextEncoder().encode(createPaletteHeaderJson(
        [10, 20, 30, 40],
        [createPaletteBank(1), createPaletteBank(2), createPaletteBank(3), createPaletteBank(4)]
    ))
    const { video } = createVideoFixture()
    const fetch = installFetch({
        [`levels/level2/level2.paletteheader.json`]: headerJson,
    })

    try {
        await video.PC_decodeMap(level, room)
    } finally {
        fetch.restore()
    }

    assert.equal(video._frontLayer.every((value) => value === 0), true)
    assert.equal(video._backLayer.every((value) => value === 0), true)
})

test('palette-header JSON is cached across room decodes for the same level', async () => {
    const roomPalette = createPalette256()
    const pixels = new Uint8Array(GAMESCREEN_W * GAMESCREEN_H)
    const png = encodeIndexedPng(GAMESCREEN_W, GAMESCREEN_H, pixels, roomPalette)
    const headerJson = new TextEncoder().encode(createPaletteHeaderJson(
        [10, 20, 30, 40],
        [createPaletteBank(1), createPaletteBank(2), createPaletteBank(3), createPaletteBank(4)]
    ))
    const { video } = createVideoFixture()
    const fetch = installFetch({
        'levels/level2/level2.paletteheader.json': headerJson,
        'levels/level2/level2-room3.pixeldata.png': png,
        'levels/level2/level2-room4.pixeldata.png': png,
    })

    try {
        await video.PC_decodeMap(1, 3)
        await video.PC_decodeMap(1, 4)
    } finally {
        fetch.restore()
    }

    assert.equal(fetch.calls.filter((path) => path === 'levels/level2/level2.paletteheader.json').length, 1)
    assert.equal(fetch.calls.filter((path) => path.includes('.pixeldata.png')).length, 2)
})

test('markBlockAsDirty and updateScreen refresh only the touched screen blocks', async () => {
    const { video, stub } = createVideoFixture()

    video._fullRefresh = false
    video.markBlockAsDirty(0, 0, SCREENBLOCK_W * 2, SCREENBLOCK_H, 1)

    await video.updateScreen()

    assert.deepEqual(stub.copyRectCalls, [
        [0, 0, SCREENBLOCK_W * 2, SCREENBLOCK_H, video._frontLayer, video._w],
    ])
    assert.deepEqual(stub.updateScreenCalls, [0])
    assert.equal(video._screenBlocks[0], 1)
    assert.equal(video._screenBlocks[1], 1)
})

test('PC_drawTile respects x/y flips and color-key transparency', () => {
    const dst = new Uint8Array(GAMESCREEN_W * 8)
    const src = Uint8Array.from([
        0x12, 0x34, 0x50, 0x67,
        0x89, 0xAB, 0xCD, 0xEF,
        0x12, 0x34, 0x50, 0x67,
        0x89, 0xAB, 0xCD, 0xEF,
        0x12, 0x34, 0x50, 0x67,
        0x89, 0xAB, 0xCD, 0xEF,
        0x12, 0x34, 0x50, 0x67,
        0x89, 0xAB, 0xCD, 0xEF,
    ])

    Video.PC_drawTile(dst, src, 0x80, true, true, 0)

    assert.deepEqual(Array.from(dst.slice(GAMESCREEN_W * 7, GAMESCREEN_W * 7 + 8)), [0x87, 0x86, 0x00, 0x85, 0x84, 0x83, 0x82, 0x81])
    assert.deepEqual(Array.from(dst.slice(0, 8)), [0x8F, 0x8E, 0x8D, 0x8C, 0x8B, 0x8A, 0x89, 0x88])
})
