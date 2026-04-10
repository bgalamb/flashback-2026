import { PgeFileExporter } from "./pge-file-exporter"

function printUsage() {
    console.error("Usage: npx ts-node --transpile-only ./src/tools/debugger/export-pge-json.ts <dataDir>")
}

function main() {
    const args = process.argv.slice(2)
    if (args.length !== 1) {
        printUsage()
        process.exit(1)
    }

    const [dataDir] = args
    const writtenFiles = PgeFileExporter.exportAllLevels(dataDir)
    console.log(`Wrote parsed PGE files:`)
    for (const filePath of writtenFiles) {
        console.log(filePath)
    }
}

main()
