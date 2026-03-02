import { UINT16_MAX } from "../game_constants"
import { _namesTableDOS, _offsetsTableDOS } from "../staticres"
import { CutsceneVideoExporter } from "./cutscene-video-exporter"

function printUsage() {
    console.error("Usage: npx ts-node --transpile-only ./src/debugger-helpers/export-all-cutscene-videos.ts <dataDir> <outputDir> [avi|mpg|mpeg]")
}

function getFileExtension(ext: string | undefined) {
    const normalized = (ext || 'mpg').toLowerCase()
    if (normalized !== 'avi' && normalized !== 'mpg' && normalized !== 'mpeg') {
        throw new Error(`Unsupported extension '${normalized}'. Use avi, mpg, or mpeg.`)
    }
    return normalized
}

function sanitizeFilePart(value: string) {
    return value.replace(/[^A-Za-z0-9_-]/g, '_')
}

function shouldSkipCutsceneName(name: string) {
    return name === 'JOURNAL' || name === 'MISSION' || name === 'MISSIONS' || name === 'SCORE'
}

async function main() {
    const path = require('path')
    const fs = require('fs')

    const args = process.argv.slice(2)
    if (args.length < 2 || args.length > 3) {
        printUsage()
        process.exit(1)
    }

    const [dataDir, outputDir, extArg] = args
    const ext = getFileExtension(extArg)
    fs.mkdirSync(outputDir, { recursive: true })

    const cutsceneCount = (_offsetsTableDOS.length / 2) >> 0
    for (let id = 0; id < cutsceneCount; ++id) {
        const cutNameIndex = _offsetsTableDOS[id * 2]
        const entryOffset = _offsetsTableDOS[id * 2 + 1]

        if (cutNameIndex === UINT16_MAX) {
            console.log(`Skipping id 0x${id.toString(16)}: no mapped cutscene`)
            continue
        }

        const resolvedName = _namesTableDOS[cutNameIndex & 0xFF]
        if (!resolvedName) {
            console.warn(`Skipping id 0x${id.toString(16)}: invalid cutName index 0x${cutNameIndex.toString(16)}`)
            continue
        }
        if (shouldSkipCutsceneName(resolvedName)) {
            console.log(`Skipping id 0x${id.toString(16)} (${resolvedName}): bypassed by name filter`)
            continue
        }

        const outputName = `${id.toString(16).padStart(2, '0')}-${sanitizeFilePart(resolvedName)}-off${entryOffset.toString(16).padStart(4, '0')}.${ext}`
        const outputPath = path.join(outputDir, outputName)

        try {
            await CutsceneVideoExporter.exportVideo({
                dataDir,
                cutName: resolvedName,
                outputPath,
                entryOffset
            })
            console.log(`Wrote ${outputPath}`)
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            console.warn(`Skipping id 0x${id.toString(16)} (${resolvedName}, off=0x${entryOffset.toString(16)}): ${message}`)
        }
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
})
