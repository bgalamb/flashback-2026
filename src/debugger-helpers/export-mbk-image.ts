import { MbkImageExporter } from "./mbk-image-exporter"

function printUsage() {
    console.error("Usage: npx ts-node --transpile-only ./src/debugger-helpers/export-mbk-image.ts <mbk> <output.ppm> [pal] [paletteSlot] [tilesPerRow]")
}

function main() {
    const args = process.argv.slice(2)
    if (args.length < 2 || args.length > 5) {
        printUsage()
        process.exit(1)
    }

    const [mbkPath, outputPath] = args
    let palettePath = ""
    let paletteSlot = 0
    let tilesPerRow = 16

    const optionalArgs = args.slice(2)
    if (optionalArgs.length === 1) {
        if (isIntegerArg(optionalArgs[0])) {
            tilesPerRow = Number(optionalArgs[0])
        } else {
            palettePath = optionalArgs[0]
        }
    } else if (optionalArgs.length === 2) {
        if (isIntegerArg(optionalArgs[0]) && isIntegerArg(optionalArgs[1])) {
            paletteSlot = Number(optionalArgs[0])
            tilesPerRow = Number(optionalArgs[1])
        } else {
            palettePath = optionalArgs[0]
            paletteSlot = Number(optionalArgs[1])
        }
    } else if (optionalArgs.length >= 3) {
        palettePath = optionalArgs[0]
        paletteSlot = Number(optionalArgs[1])
        tilesPerRow = Number(optionalArgs[2])
    }

    if (!Number.isInteger(paletteSlot) || paletteSlot < 0) {
        printUsage()
        process.exit(1)
    }

    if (!Number.isInteger(tilesPerRow) || tilesPerRow <= 0) {
        printUsage()
        process.exit(1)
    }

    MbkImageExporter.exportTilesImage(mbkPath, outputPath, palettePath || undefined, paletteSlot, tilesPerRow)
    console.log(`Wrote ${outputPath}`)
}

function isIntegerArg(value: string) {
    return /^-?\d+$/.test(value)
}

main()
