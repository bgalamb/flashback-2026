import { _namesTableDOS } from "../staticres"
import { CutsceneVideoExporter } from "./legacy-cutscene-video-exporter"

function printUsage() {
    console.error("Usage: npx ts-node --transpile-only ./src/debugger-helpers/export-legacy-cutscene-video.ts <dataDir> <cutNameIndex> <cutOffset> <output.(avi|mpg|mpeg)>")
}

async function main() {
    const args = process.argv.slice(2)
    if (args.length !== 4) {
        printUsage()
        process.exit(1)
    }

    const [dataDir, cutNameIndexArg, cutOffsetArg, outputPath] = args
    const cutNameIndex = Number(cutNameIndexArg)
    const entryOffset = Number(cutOffsetArg)
    if (!Number.isInteger(cutNameIndex) || cutNameIndex < 0 || cutNameIndex >= _namesTableDOS.length) {
        printUsage()
        process.exit(1)
    }
    if (!Number.isInteger(entryOffset) || entryOffset < 0) {
        printUsage()
        process.exit(1)
    }

    const cutName = _namesTableDOS[cutNameIndex]

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
