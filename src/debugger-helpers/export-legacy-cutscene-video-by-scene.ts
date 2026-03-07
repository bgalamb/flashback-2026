import { UINT16_MAX, UINT8_MAX } from "../game_constants"
import { _namesTable, _namesTableDOS, _offsetsTableDOS } from "../staticres"
import { CutsceneVideoExporter } from "./legacy-cutscene-video-exporter"

function printUsage() {
    console.error("Usage: npx ts-node --transpile-only ./src/debugger-helpers/export-legacy-cutscene-video-by-scene.ts <dataDir> <sceneName> <output.(avi|mpg|mpeg)>")
    console.error("Example sceneName values: JOURNAL, HOLOMAP, MAP1, MISSION1, GVCREDS1")
}

function normalizeSceneName(sceneName: string) {
    return sceneName.trim().toUpperCase()
}

function resolveSceneIdByName(sceneName: string) {
    const normalized = normalizeSceneName(sceneName)
    for (let i = 0; i < _namesTable.length; ++i) {
        const name = _namesTable[i]
        if (name && name.toUpperCase() === normalized) {
            return i
        }
    }
    return -1
}

async function main() {
    const args = process.argv.slice(2)
    if (args.length !== 3) {
        printUsage()
        process.exit(1)
    }

    const [dataDir, sceneNameArg, outputPath] = args
    const sceneId = resolveSceneIdByName(sceneNameArg)
    if (sceneId < 0) {
        throw new Error(`Unknown scene name '${sceneNameArg}'. It must match one of the names in staticres _namesTable.`)
    }

    const cutsceneCount = (_offsetsTableDOS.length / 2) >> 0
    if (sceneId >= cutsceneCount) {
        throw new Error(`Scene '${sceneNameArg}' resolved to id 0x${sceneId.toString(16)} which is outside offsets table range`)
    }

    const cutNameIndex = _offsetsTableDOS[sceneId * 2]
    const entryOffset = _offsetsTableDOS[sceneId * 2 + 1]

    if (cutNameIndex === UINT16_MAX) {
        throw new Error(`Scene '${sceneNameArg}' (id 0x${sceneId.toString(16)}) does not map to a DOS legacy CMD/POL cutscene`)
    }

    const cutName = _namesTableDOS[cutNameIndex & UINT8_MAX]
    if (!cutName) {
        throw new Error(`Invalid DOS cutName index 0x${cutNameIndex.toString(16)} for scene '${sceneNameArg}' (id 0x${sceneId.toString(16)})`)
    }

    const result = await CutsceneVideoExporter.exportVideo({
        dataDir,
        cutName,
        outputPath,
        entryOffset,
        requireCineText: true,
        maxDurationMs: 20000
    })

    console.log(`Wrote ${outputPath}`)
    console.log(`Scene '${sceneNameArg}' (id 0x${sceneId.toString(16)}) -> '${cutName}.CMD/.POL' offset ${entryOffset}`)
    console.log(`Caption opcode calls: ${result.captionOps}`)
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
})
