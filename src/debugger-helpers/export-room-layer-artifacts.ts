import { AmigaLevelImageExporter } from "./legacy-room-png-exporter"

function printUsage() {
    console.error("Usage: npx ts-node --transpile-only ./src/debugger-helpers/export-room-layer-artifacts.ts <lev> <mbk> <pal> <sgd> <levelIndex> <room> <outputPrefix>")
}

function main() {
    const args = process.argv.slice(2)
    if (args.length !== 7) {
        printUsage()
        process.exit(1)
    }

    const [levPath, mbkPath, palPath, sgdPath, levelIndexArg, roomArg, outputPrefix] = args
    const levelIndex = Number(levelIndexArg)
    const room = Number(roomArg)

    if (!Number.isInteger(levelIndex) || !Number.isInteger(room)) {
        printUsage()
        process.exit(1)
    }

    AmigaLevelImageExporter.exportRoomLayerArtifacts(
        levPath,
        mbkPath,
        palPath,
        sgdPath,
        levelIndex,
        room,
        outputPrefix
    )

    console.log(`Wrote ${outputPrefix}.pixeldata.png`)
    console.log(`Wrote ${outputPrefix}-backlayer.png`)
    console.log(`Wrote ${outputPrefix}-frontlayer.png`)
}

main()
