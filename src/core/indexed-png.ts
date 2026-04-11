import { Color, readBeUint32 } from "./intern"

const pngSignature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
const pngChunkIhdr = 0x49484452
const pngChunkPlte = 0x504C5445
const pngChunkIdat = 0x49444154
const pngChunkIend = 0x49454E44

type IndexedPngImage = {
    width: number
    height: number
    palette: Color[]
    paletteAlpha: Uint8Array
    pixels: Uint8Array
}

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

function readPaethPredictor(a: number, b: number, c: number) {
    const p = a + b - c
    const pa = Math.abs(p - a)
    const pb = Math.abs(p - b)
    const pc = Math.abs(p - c)
    if (pa <= pb && pa <= pc) {
        return a
    }
    if (pb <= pc) {
        return b
    }
    return c
}

function unfilterScanlines(raw: Uint8Array, width: number, height: number) {
    const stride = width
    const expected = height * (stride + 1)
    if (raw.length !== expected) {
        throw new Error(`Indexed PNG scanline size mismatch: got ${raw.length}, expected ${expected}`)
    }
    const pixels = new Uint8Array(width * height)
    let src = 0
    let dst = 0
    for (let y = 0; y < height; ++y) {
        const filter = raw[src++]
        for (let x = 0; x < stride; ++x, ++src, ++dst) {
            const left = x > 0 ? pixels[dst - 1] : 0
            const up = y > 0 ? pixels[dst - stride] : 0
            const upLeft = (x > 0 && y > 0) ? pixels[dst - stride - 1] : 0
            switch (filter) {
                case 0:
                    pixels[dst] = raw[src]
                    break
                case 1:
                    pixels[dst] = (raw[src] + left) & 0xFF
                    break
                case 2:
                    pixels[dst] = (raw[src] + up) & 0xFF
                    break
                case 3:
                    pixels[dst] = (raw[src] + ((left + up) >> 1)) & 0xFF
                    break
                case 4:
                    pixels[dst] = (raw[src] + readPaethPredictor(left, up, upLeft)) & 0xFF
                    break
                default:
                    throw new Error(`Unsupported PNG filter type ${filter}`)
            }
        }
    }
    return pixels
}

async function inflateZlib(data: Uint8Array) {
    try {
        return inflateStoredZlib(data)
    } catch (_error) {
        // Fall through to generic inflate for non-stored streams.
    }
    try {
        const zlib = require("zlib")
        return new Uint8Array(zlib.inflateSync(Buffer.from(data)))
    } catch (_error) {
        // Browser builds won't have Node's zlib module.
    }
    const globalWithStreams = globalThis as typeof globalThis & {
        DecompressionStream?: new(format: string) => {
            readable: ReadableStream<Uint8Array>
            writable: WritableStream<Uint8Array>
        }
    }
    async function inflateWithDecompressionStream(format: string, sourceData: Uint8Array) {
        const stream = new Blob([sourceData]).stream().pipeThrough(new globalWithStreams.DecompressionStream(format))
        const buffer = await new Response(stream).arrayBuffer()
        return new Uint8Array(buffer)
    }
    if (typeof globalWithStreams.DecompressionStream === "function") {
        try {
            return await inflateWithDecompressionStream("deflate", data)
        } catch (_error) {
            // Some browsers expect the raw deflate payload without the zlib wrapper.
        }
        const rawDeflate = data.subarray(2, data.length - 4)
        return await inflateWithDecompressionStream("deflate-raw", rawDeflate)
    }
    throw new Error("No available zlib inflater for indexed PNG decode")
}

function inflateStoredZlib(data: Uint8Array) {
    if (data.length < 6) {
        throw new Error("Zlib stream too short")
    }
    const cmf = data[0]
    const flg = data[1]
    if ((cmf & 0x0F) !== 8) {
        throw new Error("Unsupported zlib compression method")
    }
    if ((((cmf << 8) | flg) % 31) !== 0) {
        throw new Error("Invalid zlib header checksum")
    }
    if ((flg & 0x20) !== 0) {
        throw new Error("Preset dictionaries are not supported")
    }

    const output: number[] = []
    let offset = 2
    let bitBuffer = 0
    let bitCount = 0

    const readBits = (count: number) => {
        while (bitCount < count) {
            if (offset >= data.length - 4) {
                throw new Error("Unexpected end of stored zlib stream")
            }
            bitBuffer |= data[offset++] << bitCount
            bitCount += 8
        }
        const value = bitBuffer & ((1 << count) - 1)
        bitBuffer >>>= count
        bitCount -= count
        return value
    }

    while (true) {
        const isFinal = readBits(1)
        const blockType = readBits(2)
        if (blockType !== 0) {
            throw new Error("Only stored zlib blocks are supported by the lightweight PNG decoder")
        }

        bitBuffer = 0
        bitCount = 0

        if (offset + 4 > data.length - 4) {
            throw new Error("Unexpected end of stored zlib block")
        }
        const len = data[offset] | (data[offset + 1] << 8)
        const nlen = data[offset + 2] | (data[offset + 3] << 8)
        offset += 4
        if (((len ^ 0xFFFF) & 0xFFFF) !== nlen) {
            throw new Error("Invalid stored zlib block length")
        }
        if (offset + len > data.length - 4) {
            throw new Error("Stored zlib block overruns input")
        }
        for (let i = 0; i < len; ++i) {
            output.push(data[offset++])
        }
        if (isFinal) {
            break
        }
    }

    return new Uint8Array(output)
}

function parsePalette(plte: Uint8Array, trns?: Uint8Array) {
    if (plte.length === 0 || (plte.length % 3) !== 0) {
        throw new Error(`Invalid indexed PNG palette length ${plte.length}`)
    }
    const palette: Color[] = []
    const paletteAlpha = new Uint8Array(plte.length / 3)
    paletteAlpha.fill(255)
    if (trns) {
        paletteAlpha.set(trns.subarray(0, paletteAlpha.length))
    }
    for (let i = 0; i < plte.length; i += 3) {
        palette.push({
            r: plte[i + 0],
            g: plte[i + 1],
            b: plte[i + 2]
        })
    }
    return { palette, paletteAlpha }
}

async function decodeIndexedPng(data: Uint8Array): Promise<IndexedPngImage> {
    if (data.length < pngSignature.length || !data.subarray(0, pngSignature.length).every((value, index) => value === pngSignature[index])) {
        throw new Error("Invalid PNG signature")
    }
    let offset = pngSignature.length
    let width = 0
    let height = 0
    let bitDepth = 0
    let colorType = -1
    let interlace = 0
    let plte: Uint8Array = null
    let trns: Uint8Array = null
    const idatChunks: Uint8Array[] = []

    while (offset + 12 <= data.length) {
        const chunkLength = readBeUint32(data, offset)
        offset += 4
        const chunkType = readBeUint32(data, offset)
        offset += 4
        const chunkData = data.subarray(offset, offset + chunkLength)
        offset += chunkLength + 4
        switch (chunkType) {
            case pngChunkIhdr:
                width = readBeUint32(chunkData, 0)
                height = readBeUint32(chunkData, 4)
                bitDepth = chunkData[8]
                colorType = chunkData[9]
                interlace = chunkData[12]
                break
            case pngChunkPlte:
                plte = new Uint8Array(chunkData)
                break
            case 0x74524E53: // tRNS
                trns = new Uint8Array(chunkData)
                break
            case pngChunkIdat:
                idatChunks.push(new Uint8Array(chunkData))
                break
            case pngChunkIend:
                offset = data.length
                break
        }
    }
    if (bitDepth !== 8 || colorType !== 3) {
        throw new Error(`Unsupported indexed PNG format bitDepth=${bitDepth} colorType=${colorType}`)
    }
    if (interlace !== 0) {
        throw new Error("Interlaced indexed PNG is not supported")
    }
    if (!plte || idatChunks.length === 0) {
        throw new Error("Indexed PNG missing PLTE or IDAT chunk")
    }
    const inflated = await inflateZlib(concatUint8Arrays(idatChunks))
    const pixels = unfilterScanlines(inflated, width, height)
    const paletteData = parsePalette(plte, trns)
    return {
        width,
        height,
        palette: paletteData.palette,
        paletteAlpha: paletteData.paletteAlpha,
        pixels
    }
}

function encodeIndexedPng(width: number, height: number, pixels: Uint8Array, palette: Color[], paletteAlpha?: Uint8Array) {
    if (width <= 0 || height <= 0) {
        throw new Error(`Invalid indexed PNG size ${width}x${height}`)
    }
    if (pixels.length !== width * height) {
        throw new Error(`Invalid indexed PNG pixel buffer length ${pixels.length}, expected ${width * height}`)
    }
    if (palette.length === 0 || palette.length > 256) {
        throw new Error(`Invalid indexed PNG palette size ${palette.length}`)
    }
    const ihdr = new Uint8Array(13)
    writeBeUint32(ihdr, 0, width)
    writeBeUint32(ihdr, 4, height)
    ihdr[8] = 8
    ihdr[9] = 3
    ihdr[10] = 0
    ihdr[11] = 0
    ihdr[12] = 0

    const plte = new Uint8Array(palette.length * 3)
    for (let i = 0; i < palette.length; ++i) {
        const color = palette[i]
        plte[i * 3 + 0] = color.r & 0xFF
        plte[i * 3 + 1] = color.g & 0xFF
        plte[i * 3 + 2] = color.b & 0xFF
    }

    const scanlines = new Uint8Array(height * (width + 1))
    let src = 0
    let dst = 0
    for (let y = 0; y < height; ++y) {
        scanlines[dst++] = 0
        scanlines.set(pixels.subarray(src, src + width), dst)
        src += width
        dst += width
    }

    const chunks = [
        new Uint8Array(pngSignature),
        createChunk("IHDR", ihdr),
        createChunk("PLTE", plte)
    ]
    if (paletteAlpha) {
        let alphaLength = paletteAlpha.length
        while (alphaLength > 0 && paletteAlpha[alphaLength - 1] === 255) {
            --alphaLength
        }
        if (alphaLength > 0) {
            chunks.push(createChunk("tRNS", paletteAlpha.subarray(0, alphaLength)))
        }
    }
    chunks.push(createChunk("IDAT", deflateStored(scanlines)))
    chunks.push(createChunk("IEND", new Uint8Array(0)))
    return concatUint8Arrays(chunks)
}

function paletteBankToColors(palette: Color[], bankIndex: number) {
    const baseIndex = bankIndex * 16
    if (palette.length < baseIndex + 16) {
        return null
    }
    const colors: Color[] = []
    for (let i = 0; i < 16; ++i) {
        const color = palette[baseIndex + i]
        colors.push({
            r: color.r,
            g: color.g,
            b: color.b
        })
    }
    return colors
}

export { IndexedPngImage, decodeIndexedPng, encodeIndexedPng, paletteBankToColors }
