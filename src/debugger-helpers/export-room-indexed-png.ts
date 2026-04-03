import { readBeUint16 } from "../core/intern"
import { encodeIndexedPng, decodeIndexedPng } from "../core/indexed-png"
import { gamescreenH, gamescreenW } from "../core/game_constants"

type PaletteHeaderSlots = {
    slot1?: { dec?: number } | number
    slot2?: { dec?: number } | number
    slot3?: { dec?: number } | number
    slot4?: { dec?: number } | number
}

function printUsage() {
    console.error("Usage: npx ts-node --transpile-only ./src/debugger-helpers/export-room-indexed-png.ts <room-bytes.bin> <level.pal> <paletteheader.json> <output.png>")
}

function getSlotValue(slots: PaletteHeaderSlots, key: "slot1" | "slot2" | "slot3" | "slot4") {
    const value = slots[key]
    return (typeof value === "number") ? value : value?.dec
}

function parsePalettes(palData: Uint8Array) {
    const paletteCount = (palData.length / 32) >> 0
    const palette = new Array(256).fill(0).map(() => ({ r: 0, g: 0, b: 0 }))
    for (let slot = 0; slot < paletteCount && slot < 16; ++slot) {
        for (let colorIndex = 0; colorIndex < 16; ++colorIndex) {
            const color = readBeUint16(palData, slot * 32 + colorIndex * 2)
            palette[slot * 16 + colorIndex] = amigaConvertColor(color, true)
        }
    }
    return palette
}

function amigaConvertColor(color: number, bgr: boolean = false) {
    let r = (color & 0xF00) >> 8
    const g = (color & 0xF0) >> 4
    let b = color & 0xF
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

function copyPaletteBank(dst: Array<{ r: number, g: number, b: number }>, dstSlot: number, src: Array<{ r: number, g: number, b: number }>, srcSlot: number) {
    const dstOffset = dstSlot * 16
    const srcOffset = srcSlot * 16
    for (let i = 0; i < 16; ++i) {
        dst[dstOffset + i] = src[srcOffset + i]
    }
}

function deriveLevelIndexFromPath(pixelPath: string) {
    const match = pixelPath.match(/level(\d+)/i)
    if (!match) {
        throw new Error(`Could not derive level index from path '${pixelPath}'`)
    }
    return Number(match[1]) - 1
}

async function main() {
    const args = process.argv.slice(2)
    if (args.length !== 4) {
        printUsage()
        process.exit(1)
    }

    const [pixelPath, palPath, paletteHeaderPath, outputPath] = args
    const fs = require("fs")

    const sourcePixels = new Uint8Array(fs.readFileSync(pixelPath))
    if (sourcePixels.length !== gamescreenW * gamescreenH) {
        throw new Error(`Invalid room pixeldata size ${sourcePixels.length}, expected ${gamescreenW * gamescreenH}`)
    }
    const pixels = new Uint8Array(sourcePixels)
    for (let i = 0; i < pixels.length; ++i) {
        if ((pixels[i] >> 4) === 0x8) {
            pixels[i] = (0xA << 4) | (pixels[i] & 0x0F)
        } else if ((pixels[i] >> 4) === 0x9) {
            pixels[i] = (0xB << 4) | (pixels[i] & 0x0F)
        }
    }

    const palData = new Uint8Array(fs.readFileSync(palPath))
    const legacyPaletteBanks = parsePalettes(palData)
    const paletteHeader = JSON.parse(fs.readFileSync(paletteHeaderPath, "utf8")) as { slots?: PaletteHeaderSlots }
    const slots = paletteHeader.slots || {}
    const slotValues = [
        getSlotValue(slots, "slot1"),
        getSlotValue(slots, "slot2"),
        getSlotValue(slots, "slot3"),
        getSlotValue(slots, "slot4")
    ]

    for (let i = 0; i < slotValues.length; ++i) {
        const slotValue = slotValues[i]
        if (!Number.isInteger(slotValue) || slotValue! < 0 || slotValue! >= 16) {
            throw new Error(`Invalid palette slot mapping at slot${i + 1}: ${slotValue}`)
        }
    }

    const levelIndex = deriveLevelIndexFromPath(pixelPath)
    const flattenedPalette = new Array(256).fill(0).map(() => ({ r: 0, g: 0, b: 0 }))
    copyPaletteBank(flattenedPalette, 0x0, legacyPaletteBanks, slotValues[0] as number)
    copyPaletteBank(flattenedPalette, 0x1, legacyPaletteBanks, slotValues[1] as number)
    copyPaletteBank(flattenedPalette, 0x2, legacyPaletteBanks, slotValues[2] as number)
    copyPaletteBank(flattenedPalette, 0x3, legacyPaletteBanks, slotValues[3] as number)
    copyPaletteBank(flattenedPalette, 0x8, legacyPaletteBanks, slotValues[0] as number)
    copyPaletteBank(flattenedPalette, 0x9, legacyPaletteBanks, (levelIndex === 0 ? slotValues[0] : slotValues[1]) as number)
    copyPaletteBank(flattenedPalette, 0xA, legacyPaletteBanks, slotValues[0] as number)
    copyPaletteBank(flattenedPalette, 0xB, legacyPaletteBanks, (levelIndex === 0 ? slotValues[0] : slotValues[1]) as number)
    copyPaletteBank(flattenedPalette, 0xC, legacyPaletteBanks, slotValues[2] as number)
    copyPaletteBank(flattenedPalette, 0xD, legacyPaletteBanks, slotValues[3] as number)

    const encoded = encodeIndexedPng(gamescreenW, gamescreenH, pixels, flattenedPalette)
    fs.writeFileSync(outputPath, Buffer.from(encoded))

    const decoded = await decodeIndexedPng(encoded)
    if (decoded.width !== gamescreenW || decoded.height !== gamescreenH) {
        throw new Error(`Indexed PNG size mismatch after decode ${decoded.width}x${decoded.height}`)
    }
    if (decoded.pixels.length !== pixels.length) {
        throw new Error(`Decoded pixel buffer length mismatch ${decoded.pixels.length} !== ${pixels.length}`)
    }
    for (let i = 0; i < pixels.length; ++i) {
        if (decoded.pixels[i] !== pixels[i]) {
            throw new Error(`Pixel mismatch at offset ${i}: ${decoded.pixels[i]} !== ${pixels[i]}`)
        }
    }

    const expectedDisplaySlots = [0x0, 0x1, 0x2, 0x3, 0x8, 0x9, 0xA, 0xB, 0xC, 0xD]
    for (let i = 0; i < expectedDisplaySlots.length; ++i) {
        const displaySlot = expectedDisplaySlots[i]
        for (let colorIndex = 0; colorIndex < 16; ++colorIndex) {
            const paletteIndex = displaySlot * 16 + colorIndex
            const expected = flattenedPalette[paletteIndex]
            const actual = decoded.palette[paletteIndex]
            if (!actual || actual.r !== expected.r || actual.g !== expected.g || actual.b !== expected.b) {
                throw new Error(`Palette mismatch at display slot ${displaySlot}, color ${colorIndex}`)
            }
        }
    }

    console.log(`Wrote ${outputPath}`)
    console.log(`Verified pixeldata round-trip for ${pixelPath}`)
    console.log(`Verified display palette slots: ${expectedDisplaySlots.join(", ")}`)
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
