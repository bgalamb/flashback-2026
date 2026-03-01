import { AmigaLevelImageExporter } from "./amiga-level-image-exporter"

function printUsage() {
    console.error("Usage: npx ts-node --transpile-only ./src/debugger-helpers/export-amiga-level-image.ts <lev> <mbk> <pal> <sgd> <levelIndex> <room> <output.ppm>")
}

function main() {
    const args = process.argv.slice(2)
    if (args.length !== 7) {
        printUsage()
        process.exit(1)
    }

    const [levPath, mbkPath, palPath, sgdPath, levelIndexArg, roomArg, outputPath] = args
    const levelIndex = Number(levelIndexArg)
    const room = Number(roomArg)

    if (!Number.isInteger(levelIndex) || !Number.isInteger(room)) {
        printUsage()
        process.exit(1)
    }

    AmigaLevelImageExporter.exportRoomImage(
        levPath,
        mbkPath,
        palPath,
        sgdPath,
        levelIndex,
        room,
        outputPath
    )

    console.log(`Wrote ${outputPath}`)
}

main()
