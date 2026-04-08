import { CtAdjacencyTableExporter } from "./ct-adjacency-table-exporter"

function printUsage() {
    console.error("Usage: npx ts-node --transpile-only ./src/tools/debugger/export-ct-adjacency-table.ts <dataDir> [outputBaseDir|legacyOutputFilePath]")
}

function main() {
    const args = process.argv.slice(2)
    if (args.length < 1 || args.length > 2) {
        printUsage()
        process.exit(1)
    }

    const [dataDir, outputPath] = args

    if (outputPath) {
        const fs = require("fs")
        const path = require("path")

        // Preferred mode: second argument is the output base directory.
        // Backward compatibility: if a file-like path is passed (e.g. *.txt),
        // derive directory from file stem (previous behavior).
        let rootDir = outputPath
        const parsed = path.parse(outputPath)
        if (parsed.ext) {
            const baseName = parsed.name || parsed.base
            rootDir = path.join(parsed.dir || ".", baseName)
        }
        fs.mkdirSync(rootDir, { recursive: true })

        const written: string[] = []
        for (const levelName of CtAdjacencyTableExporter.getLevelNames()) {
            const levelDir = path.join(rootDir, levelName)
            const levelOutput = path.join(levelDir, `${levelName}-ct-adjacency.txt`)
            fs.mkdirSync(levelDir, { recursive: true })
            CtAdjacencyTableExporter.exportLevel(dataDir, levelName, levelOutput)
            written.push(levelOutput)
        }

        console.log(`Wrote ${written.length} files under ${rootDir}`)
    } else {
        const rendered = CtAdjacencyTableExporter.exportAllLevels(dataDir)
        console.log(rendered)
    }
}

main()
