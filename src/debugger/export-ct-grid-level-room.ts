import { CtGridTableExporter } from "./ct-grid-table-exporter"

function printUsage() {
    console.error("Usage: npx ts-node --transpile-only ./src/tools/debugger/export-ct-grid-level-room.ts <dataDir> <levelName> <room> <output.txt>")
}

function main() {
    const args = process.argv.slice(2)
    if (args.length !== 4) {
        printUsage()
        process.exit(1)
    }

    const [dataDir, levelName, roomArg, outputPath] = args
    const room = Number(roomArg)
    if (!Number.isInteger(room)) {
        printUsage()
        process.exit(1)
    }

    CtGridTableExporter.exportLevelRoom(dataDir, levelName, room, outputPath)
    console.log(`Wrote ${outputPath}`)
}

main()
