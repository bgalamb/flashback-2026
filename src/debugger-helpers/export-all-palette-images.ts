import { PaletteImageExporter } from "./palette-image-exporter"

function printUsage() {
    console.error("Usage: npx ts-node --transpile-only ./src/debugger-helpers/export-all-palette-images.ts <dataDir> <outputDir> [squareSize]")
}

function main() {
    const args = process.argv.slice(2)
    if (args.length < 2 || args.length > 3) {
        printUsage()
        process.exit(1)
    }

    const [dataDir, outputDir, squareSizeArg] = args
    const squareSize = squareSizeArg ? Number(squareSizeArg) : 16

    if (!Number.isInteger(squareSize) || squareSize <= 0) {
        printUsage()
        process.exit(1)
    }

    const fs = require("fs")
    const path = require("path")

    fs.mkdirSync(outputDir, { recursive: true })

    const fileNames = fs.readdirSync(dataDir)
    const palFiles = fileNames
        .filter((name: string) => /\.pal$/i.test(name))
        .sort()

    for (let i = 0; i < palFiles.length; ++i) {
        const palName = palFiles[i]
        const palPath = path.join(dataDir, palName)
        const baseName = palName.replace(/\.[^.]+$/, "")
        const outputPath = path.join(outputDir, `${baseName}-palette.ppm`)

        PaletteImageExporter.exportPaletteImage(palPath, outputPath, squareSize)
        console.log(`Wrote ${outputPath}`)
    }
}

main()
