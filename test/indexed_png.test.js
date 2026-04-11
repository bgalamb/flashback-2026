require('ts-node/register/transpile-only')

const test = require('node:test')
const assert = require('node:assert/strict')
const zlib = require('node:zlib')

const { encodeIndexedPng, decodeIndexedPng, paletteBankToColors } = require('../src/core/indexed-png.ts')

function readBeUint32(buffer, offset) {
    return ((buffer[offset] << 24) >>> 0) | (buffer[offset + 1] << 16) | (buffer[offset + 2] << 8) | buffer[offset + 3]
}

function writeBeUint32(buffer, offset, value) {
    buffer[offset] = (value >>> 24) & 0xFF
    buffer[offset + 1] = (value >>> 16) & 0xFF
    buffer[offset + 2] = (value >>> 8) & 0xFF
    buffer[offset + 3] = value & 0xFF
}

function crc32(buffers) {
    let c = 0xFFFFFFFF
    for (const buffer of buffers) {
        for (let i = 0; i < buffer.length; ++i) {
            c ^= buffer[i]
            for (let bit = 0; bit < 8; ++bit) {
                c = (c & 1) !== 0 ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
            }
        }
    }
    return (c ^ 0xFFFFFFFF) >>> 0
}

function replaceIdatWithDeflatedStream(encodedPng) {
    const typeIdat = Buffer.from('IDAT')
    let offset = 8
    while (offset + 12 <= encodedPng.length) {
        const chunkLength = readBeUint32(encodedPng, offset)
        const typeOffset = offset + 4
        const dataOffset = offset + 8
        const crcOffset = dataOffset + chunkLength
        const chunkType = encodedPng.subarray(typeOffset, typeOffset + 4)
        if (Buffer.compare(chunkType, typeIdat) === 0) {
            const rawScanlines = zlib.inflateSync(encodedPng.subarray(dataOffset, crcOffset))
            const compressed = zlib.deflateSync(rawScanlines)
            const nextChunkOffset = crcOffset + 4
            const nextChunks = encodedPng.subarray(nextChunkOffset)
            const newChunk = Buffer.alloc(4 + 4 + compressed.length + 4)
            writeBeUint32(newChunk, 0, compressed.length)
            chunkType.copy(newChunk, 4)
            Buffer.from(compressed).copy(newChunk, 8)
            writeBeUint32(newChunk, 8 + compressed.length, crc32([chunkType, compressed]))
            return Buffer.concat([encodedPng.subarray(0, offset), newChunk, nextChunks])
        }
        offset = crcOffset + 4
    }
    throw new Error('Missing IDAT chunk')
}

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

test('indexed png decode handles non-stored zlib IDAT streams from external editors', async () => {
    const palette = Array.from({ length: 16 }, (_, index) => ({
        r: (index * 11) & 0xFF,
        g: (index * 13) & 0xFF,
        b: (index * 17) & 0xFF,
    }))
    const pixels = Uint8Array.from([
        0, 1, 2, 3,
        4, 5, 6, 7,
        8, 9, 10, 11,
        12, 13, 14, 15,
    ])

    const encoded = Buffer.from(encodeIndexedPng(4, 4, pixels, palette))
    const recompressed = replaceIdatWithDeflatedStream(encoded)
    const decoded = await decodeIndexedPng(recompressed)

    assert.equal(decoded.width, 4)
    assert.equal(decoded.height, 4)
    assert.deepEqual(Array.from(decoded.pixels), Array.from(pixels))
    assert.deepEqual(decoded.palette[15], palette[15])
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
