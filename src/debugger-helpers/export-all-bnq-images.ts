import { BnqImageExporter } from "./bnq-image-exporter"

function printUsage() {
    console.error("Usage: npx ts-node --transpile-only ./src/debugger-helpers/export-all-bnq-images.ts <dataDir> <outputDir> [paletteSlot] [tilesPerRow]")
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
    const bnqFiles = fileNames
        .filter((name: string) => /\.bnq$/i.test(name))
        .sort()

    for (let i = 0; i < bnqFiles.length; ++i) {
        const bnqName = bnqFiles[i]
        const bnqPath = path.join(dataDir, bnqName)
        const baseName = bnqName.replace(/\.[^.]+$/, "")
        const outputPath = path.join(outputDir, `${baseName}-tiles.ppm`)

        BnqImageExporter.exportTilesImage(bnqPath, outputPath, undefined, paletteSlot, tilesPerRow)
        console.log(`Wrote ${outputPath}`)
    }
}

main()
