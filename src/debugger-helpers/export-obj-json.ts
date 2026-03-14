import { ObjFileExporter } from "./obj-file-exporter"

function printUsage() {
    console.error("Usage: npx ts-node --transpile-only ./src/debugger-helpers/export-obj-json.ts <dataDir>")
}

function main() {
    const args = process.argv.slice(2)
    if (args.length !== 1) {
        printUsage()
        process.exit(1)
    }

    const [dataDir] = args
    const writtenFiles = ObjFileExporter.exportAllLevels(dataDir)
    console.log(`Wrote parsed OBJ files:`)
    for (const filePath of writtenFiles) {
        console.log(filePath)
    }
}

main()
