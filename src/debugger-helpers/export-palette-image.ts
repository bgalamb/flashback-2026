import { PaletteImageExporter } from "./palette-image-exporter"

function printUsage() {
    console.error("Usage: npx ts-node --transpile-only ./src/debugger-helpers/export-palette-image.ts <pal> <output.ppm> [squareSize]")
}

function main() {
    const args = process.argv.slice(2)
    if (args.length < 2 || args.length > 3) {
        printUsage()
        process.exit(1)
    }

    const [palPath, outputPath, squareSizeArg] = args
    const squareSize = squareSizeArg ? Number(squareSizeArg) : 16
    if (!Number.isInteger(squareSize) || squareSize <= 0) {
        printUsage()
        process.exit(1)
    }

    PaletteImageExporter.exportPaletteImage(palPath, outputPath, squareSize)
    console.log(`Wrote ${outputPath}`)
}

main()
