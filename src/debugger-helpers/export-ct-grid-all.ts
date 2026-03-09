import { CtGridTableExporter } from "./ct-grid-table-exporter"

function printUsage() {
    console.error("Usage: npx ts-node --transpile-only ./src/debugger-helpers/export-ct-grid-all.ts <dataDir> <outputDir>")
}

function main() {
    const args = process.argv.slice(2)
    if (args.length !== 2) {
        printUsage()
        process.exit(1)
    }

    const [dataDir, outputDir] = args
    CtGridTableExporter.exportAllLevelsRooms(dataDir, outputDir)
    console.log(`Wrote grid tables under ${outputDir}`)
}

main()
