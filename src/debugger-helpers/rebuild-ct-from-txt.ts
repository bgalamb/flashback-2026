import { CtArrayRebuilder } from "./ct-array-rebuilder"

function printUsage() {
    console.error("Usage: npx ts-node --transpile-only ./src/debugger-helpers/rebuild-ct-from-txt.ts <txtExportRootDir> <outputDir>")
}

function main() {
    const args = process.argv.slice(2)
    if (args.length !== 2) {
        printUsage()
        process.exit(1)
    }

    const [txtRootDir, outputDir] = args
    CtArrayRebuilder.rebuildAllLevelsFromExport(txtRootDir, outputDir)
    console.log(`Wrote rebuilt CT arrays to ${outputDir}`)
    console.log("Adjacency was rebuilt from each level's -ct-adjacency.json; grid bytes were rebuilt from room-XX-grid.txt files.")
}

main()
