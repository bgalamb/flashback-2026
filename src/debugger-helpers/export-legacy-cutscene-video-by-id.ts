import { UINT16_MAX } from "../game_constants"
import { _namesTableDOS, _offsetsTableDOS } from "../staticres"
import { CutsceneVideoExporter } from "./legacy-cutscene-video-exporter"

function printUsage() {
    console.error("Usage: npx ts-node --transpile-only ./src/debugger-helpers/export-legacy-cutscene-video-by-id.ts <dataDir> <cutsceneId> <output.(avi|mpg|mpeg)>")
}

async function main() {
    const args = process.argv.slice(2)
    if (args.length !== 3) {
        printUsage()
        process.exit(1)
    }

    const [dataDir, cutsceneIdArg, outputPath] = args
    const cutsceneId = Number(cutsceneIdArg)
    const cutsceneCount = (_offsetsTableDOS.length / 2) >> 0

    if (!Number.isInteger(cutsceneId) || cutsceneId < 0 || cutsceneId >= cutsceneCount) {
        printUsage()
        process.exit(1)
    }

    const cutNameIndex = _offsetsTableDOS[cutsceneId * 2]
    const entryOffset = _offsetsTableDOS[cutsceneId * 2 + 1]

    if (cutNameIndex === UINT16_MAX) {
        throw new Error(`Cutscene id 0x${cutsceneId.toString(16)} is not mapped to a DOS cutscene`)
    }

    const cutName = _namesTableDOS[cutNameIndex & 0xFF]
    if (!cutName) {
        throw new Error(`Invalid cutName index 0x${cutNameIndex.toString(16)} for cutscene id 0x${cutsceneId.toString(16)}`)
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
