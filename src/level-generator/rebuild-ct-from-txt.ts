import { CtArrayRebuilder } from "./ct-array-rebuilder"
import { DEFAULT_LEVEL_GENERATOR_OUTPUT_ROOT } from "./generation-config"

function printUsage() {
    console.error("Usage: npx ts-node --transpile-only ./src/level-generator/rebuild-ct-from-txt.ts <txtExportRootDir> [outputDir]")
    console.error(`Default output root: ${DEFAULT_LEVEL_GENERATOR_OUTPUT_ROOT}`)
}

function main() {
    const args = process.argv.slice(2)
    if (args.length < 1 || args.length > 2) {
        printUsage()
        process.exit(1)
    }

    const txtRootDir = args[0]
    const outputDir = args[1] || DEFAULT_LEVEL_GENERATOR_OUTPUT_ROOT
    CtArrayRebuilder.rebuildAllLevelsFromExport(txtRootDir, outputDir)
    console.log(`Wrote rebuilt CT arrays to ${outputDir}`)
    console.log("Adjacency was rebuilt from each level's -ct-adjacency.json; grid bytes were rebuilt from room-XX-grid.txt files.")
}

main()
