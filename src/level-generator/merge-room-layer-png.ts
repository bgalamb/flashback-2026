import { Color } from "../intern"
import { decodeIndexedPng, encodeIndexedPng, paletteBankToColors } from "../indexed-png"
import { GAMESCREEN_H, GAMESCREEN_W } from "../game_constants"

const LAYER_TRANSPARENT_INDEX = 0xFF

function printUsage() {
    console.error("Usage: npx ts-node --transpile-only ./src/level-generator/merge-room-layer-png.ts <backlayer.png> <frontlayer.png> <output.pixeldata.png>")
}

function getRequiredPaletteBank(palette: Color[], bankIndex: number) {
    const colors = paletteBankToColors(palette, bankIndex)
    if (!colors) {
        throw new Error(`Missing palette bank ${bankIndex}`)
    }
    return colors
}

function setPaletteBank(dst: Color[], bankIndex: number, colors: Color[]) {
    const offset = bankIndex * 16
    for (let i = 0; i < 16; ++i) {
        dst[offset + i] = colors[i]
    }
}

function deriveLevelIndexFromPath(filePath: string) {
    const match = filePath.match(/level(\d+)/i)
    if (!match) {
        throw new Error(`Could not derive level index from path '${filePath}'`)
    }
    return Number(match[1]) - 1
}

async function main() {
    const args = process.argv.slice(2)
    if (args.length !== 3) {
        printUsage()
        process.exit(1)
    }

    const [backPath, frontPath, outputPath] = args
    const fs = require("fs")

    const backPng = await decodeIndexedPng(new Uint8Array(fs.readFileSync(backPath)))
    const frontPng = await decodeIndexedPng(new Uint8Array(fs.readFileSync(frontPath)))

    if (
        backPng.width !== GAMESCREEN_W || backPng.height !== GAMESCREEN_H ||
        frontPng.width !== GAMESCREEN_W || frontPng.height !== GAMESCREEN_H
    ) {
        throw new Error("Layer PNG size mismatch")
    }

    const mergedPixels = new Uint8Array(GAMESCREEN_W * GAMESCREEN_H)
    for (let i = 0; i < mergedPixels.length; ++i) {
        const backPixel = backPng.pixels[i]
        const frontPixel = frontPng.pixels[i]
        let mergedPixel = 0

        if (backPixel !== LAYER_TRANSPARENT_INDEX) {
            const backSlot = backPixel >> 4
            if (backSlot !== 0x0 && backSlot !== 0x1 && backSlot !== 0x2 && backSlot !== 0x3) {
                throw new Error(`Invalid back-layer slot ${backSlot} at pixel ${i}`)
            }
            mergedPixel = backPixel
        }

        if (frontPixel !== LAYER_TRANSPARENT_INDEX) {
            const frontSlot = frontPixel >> 4
            if (frontSlot === 0x8 || frontSlot === 0x9 || frontSlot === 0xA || frontSlot === 0xB) {
                mergedPixel = frontPixel
            } else {
                throw new Error(`Invalid front-layer slot ${frontSlot} at pixel ${i}`)
            }
        }

        mergedPixels[i] = mergedPixel
    }

    const backSlot0 = getRequiredPaletteBank(backPng.palette, 0x0)
    const backSlot1 = getRequiredPaletteBank(backPng.palette, 0x1)
    const backSlot2 = getRequiredPaletteBank(backPng.palette, 0x2)
    const backSlot3 = getRequiredPaletteBank(backPng.palette, 0x3)
    const mergedPalette: Color[] = new Array(256).fill(null).map(() => ({ r: 0, g: 0, b: 0 }))
    const levelIndex = deriveLevelIndexFromPath(outputPath)
    const usedFrontSlots = new Set<number>()

    for (let i = 0; i < frontPng.pixels.length; ++i) {
        const pixel = frontPng.pixels[i]
        if (pixel !== LAYER_TRANSPARENT_INDEX) {
            usedFrontSlots.add(pixel >> 4)
        }
    }

    setPaletteBank(mergedPalette, 0x0, backSlot0)
    setPaletteBank(mergedPalette, 0x1, backSlot1)
    setPaletteBank(mergedPalette, 0x2, backSlot2)
    setPaletteBank(mergedPalette, 0x3, backSlot3)
    setPaletteBank(mergedPalette, 0x8, backSlot0)
    setPaletteBank(mergedPalette, 0x9, levelIndex === 0 ? backSlot0 : backSlot1)
    for (const frontSlot of [0x8, 0x9, 0xA, 0xB]) {
        const colors = paletteBankToColors(frontPng.palette, frontSlot)
        if (usedFrontSlots.has(frontSlot)) {
            if (!colors) {
                throw new Error(`Missing palette bank ${frontSlot} for used front-layer slot`)
            }
            setPaletteBank(mergedPalette, frontSlot, colors)
        } else if (colors) {
            setPaletteBank(mergedPalette, frontSlot, colors)
        }
    }
    const frontSlotC = paletteBankToColors(frontPng.palette, 0xC) || paletteBankToColors(frontPng.palette, 0xA) || paletteBankToColors(frontPng.palette, 0x8)
    const frontSlotD = paletteBankToColors(frontPng.palette, 0xD) || paletteBankToColors(frontPng.palette, 0xB) || paletteBankToColors(frontPng.palette, 0x9)
    if (frontSlotC) {
        setPaletteBank(mergedPalette, 0xC, frontSlotC)
    }
    if (frontSlotD) {
        setPaletteBank(mergedPalette, 0xD, frontSlotD)
    }

    fs.writeFileSync(outputPath, Buffer.from(encodeIndexedPng(
        GAMESCREEN_W,
        GAMESCREEN_H,
        mergedPixels,
        mergedPalette
    )))

    console.log(`Wrote ${outputPath}`)
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
