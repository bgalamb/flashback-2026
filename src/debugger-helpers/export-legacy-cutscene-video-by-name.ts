import { CutsceneVideoExporter } from "./legacy-cutscene-video-exporter"

function printUsage() {
    console.error("Usage: npx ts-node --transpile-only ./src/debugger-helpers/export-legacy-cutscene-video-by-name.ts <dataDir> <cutName> <output.(avi|mpg|mpeg)> [cutOffset]")
}

async function main() {
    const args = process.argv.slice(2)
    if (args.length < 3 || args.length > 4) {
        printUsage()
        process.exit(1)
    }

    const [dataDir, cutName, outputPath, cutOffsetArg] = args
    const entryOffset = cutOffsetArg ? Number(cutOffsetArg) : 0
    if (!Number.isInteger(entryOffset) || entryOffset < 0) {
        printUsage()
        process.exit(1)
    }

    await CutsceneVideoExporter.exportVideo({
        dataDir,
        cutName,
        outputPath,
        entryOffset
    })

    console.log(`Wrote ${outputPath}`)
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
})
