import { Color } from "../intern"
import { decodeIndexedPng, encodeIndexedPng, paletteBankToColors } from "../indexed-png"
import { GAMESCREEN_H, GAMESCREEN_W } from "../game_constants"

const LAYER_TRANSPARENT_INDEX = 0xFF

function printUsage() {
    console.error("Usage: npx ts-node --transpile-only ./src/debugger-helpers/merge-room-layer-png.ts <backlayer.png> <frontlayer.png> <output.pixeldata.png>")
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
            if (backSlot !== 0x0 && backSlot !== 0x1) {
                throw new Error(`Invalid back-layer slot ${backSlot} at pixel ${i}`)
            }
            mergedPixel = backPixel
        }

        if (frontPixel !== LAYER_TRANSPARENT_INDEX) {
            const frontSlot = frontPixel >> 4
            if (frontSlot === 0x8 || frontSlot === 0x9) {
                mergedPixel = frontPixel
            } else {
                throw new Error(`Invalid front-layer slot ${frontSlot} at pixel ${i}`)
            }
        }

        mergedPixels[i] = mergedPixel
    }

    const backSlot0 = getRequiredPaletteBank(backPng.palette, 0x0)
    const backSlot1 = getRequiredPaletteBank(backPng.palette, 0x1)
    const frontSlot8 = getRequiredPaletteBank(frontPng.palette, 0x8)
    const frontSlot9 = getRequiredPaletteBank(frontPng.palette, 0x9)
    const mergedPalette: Color[] = new Array(256).fill(null).map(() => ({ r: 0, g: 0, b: 0 }))
    const levelIndex = deriveLevelIndexFromPath(outputPath)

    setPaletteBank(mergedPalette, 0x0, backSlot0)
    setPaletteBank(mergedPalette, 0x1, backSlot1)
    setPaletteBank(mergedPalette, 0x2, frontSlot8)
    setPaletteBank(mergedPalette, 0x3, frontSlot9)
    setPaletteBank(mergedPalette, 0x8, backSlot0)
    setPaletteBank(mergedPalette, 0x9, levelIndex === 0 ? backSlot0 : backSlot1)
    setPaletteBank(mergedPalette, 0xA, frontSlot8)
    setPaletteBank(mergedPalette, 0xB, frontSlot9)

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
