require('ts-node/register/transpile-only')

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

const { encodeIndexedPng } = require('../src/core/indexed-png.ts')
const { encodeRgbPng } = require('../src/core/png-rgb.ts')
const { remapRoomLayerFromIndexedPng } = require('../src/level-generator/remap_room_layer_from_indexed_png.ts')

function makeTempPath(name) {
    return path.join(os.tmpdir(), `flashback-${process.pid}-${Date.now()}-${name}`)
}

test('remapRoomLayerFromIndexedPng accepts indexed PNGs with exactly 64 colors', async () => {
    const inputPath = makeTempPath('indexed-64.png')
    const outputPath = makeTempPath('indexed-64-output.png')
    const palette = Array.from({ length: 64 }, (_, index) => ({
        r: (index * 3) & 0xFF,
        g: (index * 5) & 0xFF,
        b: (index * 7) & 0xFF,
    }))
    const pixels = Uint8Array.from([
        0, 1, 2, 3,
        16, 17, 18, 19,
        32, 33, 34, 35,
        48, 49, 50, 51,
    ])

    fs.writeFileSync(inputPath, Buffer.from(encodeIndexedPng(4, 4, pixels, palette)))

    await remapRoomLayerFromIndexedPng(inputPath, 'pixeldata', outputPath, { logWrites: false })

    assert.equal(fs.existsSync(outputPath), true)
})

test('remapRoomLayerFromIndexedPng rejects indexed PNGs that do not have exactly 64 colors', async () => {
    const inputPath = makeTempPath('indexed-32.png')
    const outputPath = makeTempPath('indexed-32-output.png')
    const palette = Array.from({ length: 32 }, (_, index) => ({
        r: index,
        g: index,
        b: index,
    }))
    const pixels = Uint8Array.from([0, 1, 2, 3])

    fs.writeFileSync(inputPath, Buffer.from(encodeIndexedPng(2, 2, pixels, palette)))

    await assert.rejects(
        remapRoomLayerFromIndexedPng(inputPath, 'pixeldata', outputPath, { logWrites: false }),
        /expected exactly 64 colors/
    )
})

test('remapRoomLayerFromIndexedPng rejects non-indexed PNGs', async () => {
    const inputPath = makeTempPath('rgb.png')
    const outputPath = makeTempPath('rgb-output.png')
    const rgbPixels = Uint8Array.from([
        255, 0, 0,
        0, 255, 0,
        0, 0, 255,
        255, 255, 255,
    ])

    fs.writeFileSync(inputPath, Buffer.from(encodeRgbPng(2, 2, rgbPixels)))

    await assert.rejects(
        remapRoomLayerFromIndexedPng(inputPath, 'pixeldata', outputPath, { logWrites: false }),
        /Unsupported indexed PNG format/
    )
})
