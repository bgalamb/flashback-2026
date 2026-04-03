import * as fs from "fs"
import { decodeIndexedPng, encodeIndexedPng } from "../core/indexed-png"
import { Color } from "../core/intern"

const LAYER_TRANSPARENT_INDEX = 0xFF
const SOURCE_BANK_COUNT = 4
const COLORS_PER_BANK = 16
const MAX_SOURCE_COLORS = SOURCE_BANK_COUNT * COLORS_PER_BANK

function printUsage() {
    console.error(
        "Usage: npx ts-node --transpile-only ./src/level-generator/remap_room_layer_from_indexed_png.ts <input.png> <back|front|pixeldata> <output.png>"
    )
}

function getBankOffset(layer: string) {
    if (layer === "back") {
        return 0x0
    }
    if (layer === "front") {
        return 0x8
    }
    throw new Error(`Invalid layer '${layer}', expected 'back', 'front', or 'pixeldata'`)
}

function buildOutputPalette() {
    const palette: Color[] = new Array(256).fill(null).map(() => ({ r: 0, g: 0, b: 0 }))
    const alpha = new Uint8Array(256)
    alpha.fill(255)
    alpha[LAYER_TRANSPARENT_INDEX] = 0
    return { palette, alpha }
}

function setPaletteBank(dst: Color[], alpha: Uint8Array, dstBank: number, sourcePalette: Color[], sourceAlpha: Uint8Array, srcBank: number) {
    const dstOffset = dstBank * COLORS_PER_BANK
    const srcOffset = srcBank * COLORS_PER_BANK
    for (let i = 0; i < COLORS_PER_BANK; ++i) {
        const sourceColor = sourcePalette[srcOffset + i]
        if (sourceColor) {
            dst[dstOffset + i] = { r: sourceColor.r, g: sourceColor.g, b: sourceColor.b }
            alpha[dstOffset + i] = sourceAlpha[srcOffset + i]
        }
    }
}

function compactSourcePalette(sourcePalette: Color[], sourceAlpha: Uint8Array, sourcePixels: Uint8Array) {
    const usedSourceIndices = new Set<number>()
    for (let i = 0; i < sourcePixels.length; ++i) {
        usedSourceIndices.add(sourcePixels[i])
    }

    if (usedSourceIndices.size > MAX_SOURCE_COLORS) {
        throw new Error(`Source image uses ${usedSourceIndices.size} colors, expected at most ${MAX_SOURCE_COLORS}`)
    }

    const palette: Color[] = []
    const alpha = new Uint8Array(MAX_SOURCE_COLORS)
    const indexMap = new Map<number, number>()
    let nextIndex = 0

    for (let sourceIndex = 0; sourceIndex < sourcePalette.length; ++sourceIndex) {
        if (!usedSourceIndices.has(sourceIndex)) {
            continue
        }
        const color = sourcePalette[sourceIndex]
        if (!color) {
            throw new Error(`Missing source palette entry ${sourceIndex}`)
        }
        indexMap.set(sourceIndex, nextIndex)
        palette.push({ r: color.r, g: color.g, b: color.b })
        alpha[nextIndex] = sourceAlpha[sourceIndex]
        ++nextIndex
    }

    const pixels = new Uint8Array(sourcePixels.length)
    for (let i = 0; i < sourcePixels.length; ++i) {
        const mappedIndex = indexMap.get(sourcePixels[i])
        if (mappedIndex === undefined) {
            throw new Error(`Missing remap for source palette index ${sourcePixels[i]} at pixel ${i}`)
        }
        pixels[i] = mappedIndex
    }

    return {
        palette,
        alpha: alpha.subarray(0, palette.length),
        pixels
    }
}

function remapPalette(
    sourcePalette: Color[],
    sourceAlpha: Uint8Array,
    bankOffset: number,
    palette: Color[],
    alpha: Uint8Array
) {
    for (let index = 0; index < sourcePalette.length; ++index) {
        const bank = index >> 4
        if (bank >= SOURCE_BANK_COUNT) {
            throw new Error(`Source palette index ${index} exceeds the supported 64-color range`)
        }
        const destinationIndex = ((bankOffset + bank) << 4) | (index & 0x0F)
        const color = sourcePalette[index]
        palette[destinationIndex] = { r: color.r, g: color.g, b: color.b }
        alpha[destinationIndex] = sourceAlpha[index]
    }
}

function remapPixels(sourcePixels: Uint8Array, sourceAlpha: Uint8Array, bankOffset: number) {
    const pixels = new Uint8Array(sourcePixels.length)
    for (let i = 0; i < sourcePixels.length; ++i) {
        const sourceIndex = sourcePixels[i]
        if (sourceIndex >= MAX_SOURCE_COLORS) {
            throw new Error(`Pixel ${i} uses palette index ${sourceIndex}, expected a 64-color indexed PNG`)
        }
        if (sourceAlpha[sourceIndex] === 0) {
            pixels[i] = LAYER_TRANSPARENT_INDEX
            continue
        }
        const bank = sourceIndex >> 4
        pixels[i] = ((bankOffset + bank) << 4) | (sourceIndex & 0x0F)
    }
    return pixels
}

function writePixeldataPalette(sourcePalette: Color[], sourceAlpha: Uint8Array, palette: Color[], alpha: Uint8Array) {
    for (let bank = 0; bank < SOURCE_BANK_COUNT; ++bank) {
        setPaletteBank(palette, alpha, bank, sourcePalette, sourceAlpha, bank)
    }
    setPaletteBank(palette, alpha, 0x8, sourcePalette, sourceAlpha, 0x0)
    setPaletteBank(palette, alpha, 0x9, sourcePalette, sourceAlpha, 0x1)
    setPaletteBank(palette, alpha, 0xA, sourcePalette, sourceAlpha, 0x0)
    setPaletteBank(palette, alpha, 0xB, sourcePalette, sourceAlpha, 0x1)
    setPaletteBank(palette, alpha, 0xC, sourcePalette, sourceAlpha, 0x2)
    setPaletteBank(palette, alpha, 0xD, sourcePalette, sourceAlpha, 0x3)
}

async function main() {
    const args = process.argv.slice(2)
    if (args.length !== 3) {
        printUsage()
        process.exit(1)
    }

    const [inputPath, layer, outputPath] = args
    const input = await decodeIndexedPng(new Uint8Array(fs.readFileSync(inputPath)))
    const compacted = compactSourcePalette(input.palette, input.paletteAlpha, input.pixels)

    const { palette, alpha } = buildOutputPalette()
    let pixels: Uint8Array

    if (layer === "pixeldata") {
        if (compacted.palette.length > MAX_SOURCE_COLORS) {
            throw new Error(`Compacted palette has ${compacted.palette.length} colors, expected at most ${MAX_SOURCE_COLORS}`)
        }
        writePixeldataPalette(compacted.palette, compacted.alpha, palette, alpha)
        pixels = new Uint8Array(compacted.pixels)
    } else {
        const bankOffset = getBankOffset(layer)
        remapPalette(compacted.palette, compacted.alpha, bankOffset, palette, alpha)
        pixels = remapPixels(compacted.pixels, compacted.alpha, bankOffset)
    }

    fs.writeFileSync(
        outputPath,
        Buffer.from(encodeIndexedPng(input.width, input.height, pixels, palette, alpha))
    )

    console.log(`Wrote ${outputPath}`)
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
