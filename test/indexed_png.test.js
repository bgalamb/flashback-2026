require('ts-node/register/transpile-only')

const test = require('node:test')
const assert = require('node:assert/strict')

const { encodeIndexedPng, decodeIndexedPng, paletteBankToColors } = require('../src/indexed-png.ts')

test('indexed png encode/decode round-trips pixels and palette alpha', async () => {
    const palette = Array.from({ length: 32 }, (_, index) => ({
        r: (index * 3) & 0xFF,
        g: (index * 5) & 0xFF,
        b: (index * 7) & 0xFF,
    }))
    const paletteAlpha = new Uint8Array(32)
    paletteAlpha.fill(255)
    paletteAlpha[3] = 64
    paletteAlpha[17] = 128
    const pixels = Uint8Array.from([
        0, 1, 2, 3,
        4, 5, 6, 7,
        17, 18, 19, 20,
    ])

    const encoded = encodeIndexedPng(4, 3, pixels, palette, paletteAlpha)
    const decoded = await decodeIndexedPng(encoded)

    assert.equal(decoded.width, 4)
    assert.equal(decoded.height, 3)
    assert.deepEqual(Array.from(decoded.pixels), Array.from(pixels))
    assert.deepEqual(decoded.palette[17], palette[17])
    assert.equal(decoded.paletteAlpha[3], 64)
    assert.equal(decoded.paletteAlpha[17], 128)
})

test('paletteBankToColors returns independent 16-color banks and null when unavailable', () => {
    const palette = Array.from({ length: 32 }, (_, index) => ({
        r: index,
        g: index + 1,
        b: index + 2,
    }))

    const bank = paletteBankToColors(palette, 1)

    assert.deepEqual(bank[0], palette[16])
    assert.deepEqual(bank[15], palette[31])
    bank[0].r = 255
    assert.equal(palette[16].r, 16)
    assert.equal(paletteBankToColors(palette, 2), null)
})
