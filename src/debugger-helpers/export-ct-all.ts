import { CtAdjacencyTableExporter } from "./ct-adjacency-table-exporter"
import { CtGridTableExporter } from "./ct-grid-table-exporter"

function printUsage() {
    console.error("Usage: npx ts-node --transpile-only ./src/debugger-helpers/export-ct-all.ts <dataDir> <outputBaseDir>")
}

function main() {
    const args = process.argv.slice(2)
    if (args.length !== 2) {
        printUsage()
        process.exit(1)
    }

    const fs = require("fs")
    const path = require("path")
    const [dataDir, outputBaseDir] = args
    fs.mkdirSync(outputBaseDir, { recursive: true })
    for (const levelName of CtAdjacencyTableExporter.getLevelNames()) {
        const levelDir = path.join(outputBaseDir, levelName)
        const levelOutput = path.join(levelDir, `${levelName}-ct-adjacency.txt`)
        fs.mkdirSync(levelDir, { recursive: true })
        CtAdjacencyTableExporter.exportLevel(dataDir, levelName, levelOutput)
    }

    CtGridTableExporter.exportAllLevelsRooms(dataDir, outputBaseDir)
    console.log(`Wrote adjacency and grids under ${outputBaseDir}`)
}

main()
