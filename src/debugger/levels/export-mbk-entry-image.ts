import { assert } from "../../core/assert"
import { readBeUint16, readBeUint32 } from "../../core/intern"
import { bytekillerUnpack } from "../../core/unpack"
import { encodeRgbPng } from "../../core/png-rgb"

type RgbColor = {
    r: number
    g: number
    b: number
}

function printUsage() {
    console.error("Usage: npx ts-node --transpile-only ./src/debugger/levels/export-mbk-entry-image.ts <mbk> <entryIndex> [pal] [paletteSlot] [outputDir]")
}

function isIntegerArg(value: string) {
    return /^-?\d+$/.test(value)
}

function amigaConvertColor(color: number, bgr: boolean) {
    let r = (color & 0xF00) >> 8
    let g = (color & 0x0F0) >> 4
    let b = color & 0x00F
    if (bgr) {
        const tmp = r
        r = b
        b = tmp
    }
    return {
        r: (r << 4) | r,
        g: (g << 4) | g,
        b: (b << 4) | b
    }
}

function defaultPalette(): RgbColor[] {
    return [
        { r: 0x00, g: 0x00, b: 0x00 },
        { r: 0x22, g: 0x22, b: 0x22 },
        { r: 0x44, g: 0x44, b: 0x44 },
        { r: 0x66, g: 0x66, b: 0x66 },
        { r: 0x88, g: 0x88, b: 0x88 },
        { r: 0xAA, g: 0xAA, b: 0xAA },
        { r: 0xCC, g: 0xCC, b: 0xCC },
        { r: 0xEE, g: 0xEE, b: 0xEE },
        { r: 0xFF, g: 0x00, b: 0x00 },
        { r: 0xFF, g: 0x88, b: 0x00 },
        { r: 0xFF, g: 0xFF, b: 0x00 },
        { r: 0x00, g: 0xAA, b: 0x00 },
        { r: 0x00, g: 0x99, b: 0xFF },
        { r: 0x22, g: 0x44, b: 0xCC },
        { r: 0x88, g: 0x00, b: 0xCC },
        { r: 0xFF, g: 0x66, b: 0xAA }
    ]
}

function resolvePalettePath(mbkPath: string) {
    const fs = require("fs")
    const path = require("path")
    const ext = path.extname(mbkPath)
    const base = mbkPath.slice(0, mbkPath.length - ext.length)
    const candidates = [
        `${base}.pal`,
        `${base}.PAL`
    ]
    for (let i = 0; i < candidates.length; ++i) {
        if (fs.existsSync(candidates[i])) {
            return candidates[i]
        }
    }
    return null
}

function resolveBnqPath(mbkPath: string) {
    const fs = require("fs")
    const path = require("path")
    const ext = path.extname(mbkPath)
    const base = mbkPath.slice(0, mbkPath.length - ext.length)
    const candidates = [
        `${base}.bnq`,
        `${base}.BNQ`
    ]
    for (let i = 0; i < candidates.length; ++i) {
        if (fs.existsSync(candidates[i])) {
            return candidates[i]
        }
    }
    return null
}

function loadPalette(palPath: string, paletteSlot: number): RgbColor[] {
    const fs = require("fs")
    const pal = new Uint8Array(fs.readFileSync(palPath))
    const slotOffset = (paletteSlot | 0) * 32
    if (slotOffset + 32 > pal.length) {
        throw new Error(`Palette slot ${paletteSlot} is out of range for '${palPath}'`)
    }
    const colors: RgbColor[] = []
    for (let i = 0; i < 16; ++i) {
        colors.push(amigaConvertColor(readBeUint16(pal, slotOffset + i * 2), true))
    }
    return colors
}

function decodeMbkEntry(mbk: Uint8Array, entryIndex: number): Uint8Array {
    const entryCount = mbk.length > 0 ? mbk[0] : 0
    if (entryIndex < 0 || entryIndex >= entryCount) {
        throw new Error(`Entry ${entryIndex} is out of range (0..${Math.max(0, entryCount - 1)})`)
    }

    const ptr = mbk.subarray(entryIndex * 6)
    const dataOffset = readBeUint32(ptr) & 0xFFFF
    let len = readBeUint16(ptr, 4)
    const isDirect = (len & 0x8000) !== 0
    if (isDirect) {
        len &= 0x7FFF
    }
    const size = len * 32
    if (size <= 0) {
        return new Uint8Array(0)
    }
    const data = mbk.subarray(dataOffset)
    if (isDirect) {
        return data.slice(0, size)
    }
    assert(!(dataOffset <= 4), `Assertion failed: ${dataOffset} > 4`)
    const expectedSize = readBeUint32(data.buffer, data.byteOffset - 4) | 0
    assert(!(size !== expectedSize), `Assertion failed: ${size} === ${expectedSize}`)
    const decoded = new Uint8Array(size)
    if (!bytekillerUnpack(decoded, size, data, 0)) {
        throw new Error(`Bad CRC for MBK entry ${entryIndex}`)
    }
    return decoded
}

function decodeBnqEntry(bnq: Uint8Array, entryIndex: number): Uint8Array {
    const entryCount = bnq.length > 0 ? bnq[0] : 0
    if (entryIndex < 0 || entryIndex >= entryCount) {
        throw new Error(`Entry ${entryIndex} is out of range for BNQ (0..${Math.max(0, entryCount - 1)})`)
    }

    const ptr = bnq.subarray(entryIndex * 6)
    const dataOffset = readBeUint32(ptr) & 0xFFFF
    let len = readBeUint16(ptr, 4)
    const isDirect = (len & 0x8000) !== 0
    if (isDirect) {
        len = -((len << 16) >> 16)
    }
    const size = len * 32
    if (size <= 0) {
        return new Uint8Array(0)
    }
    const data = bnq.subarray(dataOffset)
    if (isDirect) {
        return data.slice(0, size)
    }
    assert(!(dataOffset <= 4), `Assertion failed: ${dataOffset} > 4`)
    const expectedSize = readBeUint32(data.buffer, data.byteOffset - 4) | 0
    assert(!(size !== expectedSize), `Assertion failed: ${size} === ${expectedSize}`)
    const decoded = new Uint8Array(size)
    if (!bytekillerUnpack(decoded, size, data, 0)) {
        throw new Error(`Bad CRC for BNQ entry ${entryIndex}`)
    }
    return decoded
}

function writePngForEntry(outputPath: string, bankData: Uint8Array, palette: RgbColor[], tilesPerRow: number = 16) {
    const fs = require("fs")
    const tileSize = 8
    const tileFrame = 1
    const tileStride = tileSize + tileFrame * 2
    const tileCount = Math.max(1, bankData.length >> 5)
    const width = tilesPerRow * tileStride
    const rows = Math.max(1, Math.ceil(tileCount / tilesPerRow))
    const height = rows * tileStride
    const indexed = new Uint8Array(width * height)

    let tileIndex = 0
    for (let offset = 0; offset + 32 <= bankData.length; offset += 32) {
        const x = (tileIndex % tilesPerRow) * tileStride + tileFrame
        const y = ((tileIndex / tilesPerRow) >> 0) * tileStride + tileFrame
        let srcIndex = offset
        for (let row = 0; row < tileSize; ++row) {
            let dstIndex = (y + row) * width + x
            for (let col = 0; col < tileSize; col += 2) {
                const value = bankData[srcIndex++]
                indexed[dstIndex++] = value >> 4
                indexed[dstIndex++] = value & 0x0F
            }
        }
        ++tileIndex
    }

    const body = new Uint8Array(indexed.length * 3)
    for (let i = 0; i < indexed.length; ++i) {
        const color = palette[indexed[i] & 0x0F]
        const dst = i * 3
        body[dst + 0] = color.r
        body[dst + 1] = color.g
        body[dst + 2] = color.b
    }
    fs.writeFileSync(outputPath, Buffer.from(encodeRgbPng(width, height, body)))
}

function main() {
    const args = process.argv.slice(2)
    if (args.length < 2 || args.length > 5) {
        printUsage()
        process.exit(1)
    }

    const [mbkPath, entryIndexArg] = args
    if (!isIntegerArg(entryIndexArg)) {
        printUsage()
        process.exit(1)
    }
    const entryIndex = Number(entryIndexArg)

    let palettePath = ""
    let paletteSlot = 1
    let outputDir = "out/mbk-entry-images"

    const optionalArgs = args.slice(2)
    if (optionalArgs.length >= 1) {
        palettePath = optionalArgs[0]
    }
    if (optionalArgs.length >= 2) {
        if (!isIntegerArg(optionalArgs[1])) {
            printUsage()
            process.exit(1)
        }
        paletteSlot = Number(optionalArgs[1])
    }
    if (optionalArgs.length >= 3) {
        outputDir = optionalArgs[2]
    }

    if (!Number.isInteger(paletteSlot) || paletteSlot < 0) {
        printUsage()
        process.exit(1)
    }

    const fs = require("fs")
    const path = require("path")
    const mbk = new Uint8Array(fs.readFileSync(mbkPath))
    let bankData = decodeMbkEntry(mbk, entryIndex)
    let source = "MBK"
    if (bankData.length === 0) {
        const bnqPath = resolveBnqPath(mbkPath)
        if (bnqPath) {
            const bnq = new Uint8Array(fs.readFileSync(bnqPath))
            const bnqData = decodeBnqEntry(bnq, entryIndex)
            if (bnqData.length > 0) {
                bankData = bnqData
                source = "BNQ"
            }
        }
    }
    const resolvedPalettePath = palettePath || resolvePalettePath(mbkPath)
    const palette = resolvedPalettePath ? loadPalette(resolvedPalettePath, paletteSlot) : defaultPalette()

    fs.mkdirSync(outputDir, { recursive: true })
    const mbkBaseName = path.basename(mbkPath).replace(/\.[^.]+$/, "")
    const sourceTag = source.toLowerCase()
    const outputPath = path.join(outputDir, `${mbkBaseName}-entry${entryIndex}-slot${paletteSlot}-src-${sourceTag}.png`)
    writePngForEntry(outputPath, bankData, palette, 16)

    console.log(`Wrote ${outputPath}`)
    console.log(`Source: ${source}`)
}

main()
