const pngSignature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])

function writeBeUint32(dst: Uint8Array, offset: number, value: number) {
    dst[offset + 0] = (value >>> 24) & 0xFF
    dst[offset + 1] = (value >>> 16) & 0xFF
    dst[offset + 2] = (value >>> 8) & 0xFF
    dst[offset + 3] = value & 0xFF
}

function buildCrc32Table() {
    const table = new Uint32Array(256)
    for (let i = 0; i < table.length; ++i) {
        let c = i
        for (let bit = 0; bit < 8; ++bit) {
            c = (c & 1) !== 0 ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
        }
        table[i] = c >>> 0
    }
    return table
}

const crc32Table = buildCrc32Table()

function crc32(buffers: Uint8Array[]) {
    let c = 0xFFFFFFFF
    for (let i = 0; i < buffers.length; ++i) {
        const buffer = buffers[i]
        for (let j = 0; j < buffer.length; ++j) {
            c = crc32Table[(c ^ buffer[j]) & 0xFF] ^ (c >>> 8)
        }
    }
    return (c ^ 0xFFFFFFFF) >>> 0
}

function concatUint8Arrays(buffers: Uint8Array[]) {
    let totalLength = 0
    for (let i = 0; i < buffers.length; ++i) {
        totalLength += buffers[i].length
    }
    const out = new Uint8Array(totalLength)
    let offset = 0
    for (let i = 0; i < buffers.length; ++i) {
        out.set(buffers[i], offset)
        offset += buffers[i].length
    }
    return out
}

function createChunk(type: string, data: Uint8Array) {
    const typeData = new TextEncoder().encode(type)
    const length = new Uint8Array(4)
    writeBeUint32(length, 0, data.length)
    const crc = new Uint8Array(4)
    writeBeUint32(crc, 0, crc32([typeData, data]))
    return concatUint8Arrays([length, typeData, data, crc])
}

function adler32(data: Uint8Array) {
    let s1 = 1
    let s2 = 0
    for (let i = 0; i < data.length; ++i) {
        s1 = (s1 + data[i]) % 65521
        s2 = (s2 + s1) % 65521
    }
    return ((s2 << 16) | s1) >>> 0
}

function deflateStored(data: Uint8Array) {
    const blocks: Uint8Array[] = []
    let offset = 0
    while (offset < data.length) {
        const remaining = data.length - offset
        const blockLength = Math.min(65535, remaining)
        const isFinal = offset + blockLength >= data.length
        const block = new Uint8Array(5 + blockLength)
        block[0] = isFinal ? 1 : 0
        block[1] = blockLength & 0xFF
        block[2] = (blockLength >>> 8) & 0xFF
        const nlen = (~blockLength) & 0xFFFF
        block[3] = nlen & 0xFF
        block[4] = (nlen >>> 8) & 0xFF
        block.set(data.subarray(offset, offset + blockLength), 5)
        blocks.push(block)
        offset += blockLength
    }
    const zlibHeader = new Uint8Array([0x78, 0x01])
    const checksum = new Uint8Array(4)
    writeBeUint32(checksum, 0, adler32(data))
    return concatUint8Arrays([zlibHeader].concat(blocks, [checksum]))
}

function encodeRgbPng(width: number, height: number, rgbPixels: Uint8Array) {
    if (width <= 0 || height <= 0) {
        throw new Error(`Invalid PNG size ${width}x${height}`)
    }
    if (rgbPixels.length !== width * height * 3) {
        throw new Error(`Invalid RGB pixel buffer length ${rgbPixels.length}, expected ${width * height * 3}`)
    }

    const ihdr = new Uint8Array(13)
    writeBeUint32(ihdr, 0, width)
    writeBeUint32(ihdr, 4, height)
    ihdr[8] = 8
    ihdr[9] = 2
    ihdr[10] = 0
    ihdr[11] = 0
    ihdr[12] = 0

    const stride = width * 3
    const scanlines = new Uint8Array(height * (stride + 1))
    let src = 0
    let dst = 0
    for (let y = 0; y < height; ++y) {
        scanlines[dst++] = 0
        scanlines.set(rgbPixels.subarray(src, src + stride), dst)
        src += stride
        dst += stride
    }

    return concatUint8Arrays([
        new Uint8Array(pngSignature),
        createChunk("IHDR", ihdr),
        createChunk("IDAT", deflateStored(scanlines)),
        createChunk("IEND", new Uint8Array(0))
    ])
}

export { encodeRgbPng }
