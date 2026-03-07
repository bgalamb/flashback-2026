import { MbkImageExporter } from "./mbk-image-exporter"

function printUsage() {
    console.error("Usage: npx ts-node --transpile-only ./src/debugger-helpers/export-all-mbk-images.ts <dataDir> <outputDir> [paletteSlot] [tilesPerRow]")
}

function main() {
    const args = process.argv.slice(2)
    if (args.length < 2 || args.length > 4) {
        printUsage()
        process.exit(1)
    }

    const [dataDir, outputDir, paletteSlotArg, tilesPerRowArg] = args
    const paletteSlot = paletteSlotArg ? Number(paletteSlotArg) : 0
    const tilesPerRow = tilesPerRowArg ? Number(tilesPerRowArg) : 16

    if (!Number.isInteger(paletteSlot) || paletteSlot < 0 || !Number.isInteger(tilesPerRow) || tilesPerRow <= 0) {
        printUsage()
        process.exit(1)
    }

    const fs = require("fs")
    const path = require("path")

    fs.mkdirSync(outputDir, { recursive: true })

    const fileNames = fs.readdirSync(dataDir)
    const mbkFiles = fileNames
        .filter((name: string) => /\.mbk$/i.test(name))
        .sort()

    for (let i = 0; i < mbkFiles.length; ++i) {
        const mbkName = mbkFiles[i]
        const mbkPath = path.join(dataDir, mbkName)
        const baseName = mbkName.replace(/\.[^.]+$/, "")
        const outputPath = path.join(outputDir, `${baseName}-tiles.ppm`)

        try {
            MbkImageExporter.exportTilesImage(mbkPath, outputPath, undefined, paletteSlot, tilesPerRow)
            console.log(`Wrote ${outputPath}`)
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            console.warn(`Skipping ${mbkName}: ${message}`)
        }
    }
}

main()
