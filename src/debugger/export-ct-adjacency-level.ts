import { CtAdjacencyTableExporter } from "./ct-adjacency-table-exporter"

function printUsage() {
    console.error("Usage: npx ts-node --transpile-only ./src/tools/debugger/export-ct-adjacency-level.ts <dataDir> <levelName> [output.txt]")
    console.error("Example levelName values: level1, level2, level3, level4, level5")
}

function main() {
    const args = process.argv.slice(2)
    if (args.length < 2 || args.length > 3) {
        printUsage()
        process.exit(1)
    }

    const [dataDir, levelName, outputPath] = args
    const rendered = CtAdjacencyTableExporter.exportLevel(dataDir, levelName, outputPath)

    if (outputPath) {
        console.log(`Wrote ${outputPath}`)
    } else {
        console.log(rendered)
    }
}

main()
