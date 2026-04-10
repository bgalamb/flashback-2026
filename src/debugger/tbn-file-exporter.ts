const fs = require("fs")
const path = require("path")
import { getLevelAssetPathCandidates } from "../../core/level-asset-paths"

interface ParsedTbnFileData {
    texts: string[]
}

class TbnFileExporter {
    private static readonly filesIndexName = "files.json"
    private static readonly levelNames = ["level1", "level2", "level3", "level4_1", "level4_2", "level5_1", "level5_2"]

    static getLevelNames(): string[] {
        return TbnFileExporter.levelNames.slice()
    }

    static getOverrideBaseName(levelName: string): string {
        const suffixIndex = levelName.indexOf("_")
        return suffixIndex === -1 ? levelName : levelName.slice(0, suffixIndex)
    }

    static getOutputRelativePath(levelName: string): string {
        return path.posix.join("levels", levelName, `${TbnFileExporter.getOverrideBaseName(levelName)}.tbn.json`)
    }

    static exportLevel(dataDir: string, levelName: string, outputFilePath?: string): string {
        const inputPath = TbnFileExporter.resolveInputPath(dataDir, levelName)
        const resolvedOutputPath = outputFilePath || path.join(dataDir, TbnFileExporter.getOutputRelativePath(levelName))
        const source = fs.readFileSync(inputPath)
        const parsed = TbnFileExporter.decodeLegacyTbnData(source)

        fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true })
        fs.writeFileSync(resolvedOutputPath, JSON.stringify(parsed, null, 2) + "\n", "utf8")
        return resolvedOutputPath
    }

    static exportAllLevels(dataDir: string): string[] {
        const writtenFiles = TbnFileExporter.getLevelNames().map((levelName) => TbnFileExporter.exportLevel(dataDir, levelName))
        TbnFileExporter.ensureFilesIndexContainsOutputs(dataDir, writtenFiles)
        return writtenFiles
    }

    static ensureFilesIndexContainsOutputs(dataDir: string, outputPaths: string[]): void {
        const filesIndexPath = path.join(dataDir, TbnFileExporter.filesIndexName)
        const filesIndex = JSON.parse(fs.readFileSync(filesIndexPath, "utf8"))
        if (!Array.isArray(filesIndex)) {
            throw new Error(`Expected ${filesIndexPath} to contain a JSON array`)
        }

        let changed = false
        for (const outputPath of outputPaths) {
            const relativePath = path.relative(dataDir, outputPath).split(path.sep).join(path.posix.sep)
            if (!filesIndex.includes(relativePath)) {
                filesIndex.push(relativePath)
                changed = true
            }
        }

        if (changed) {
            fs.writeFileSync(filesIndexPath, JSON.stringify(filesIndex, null, 2) + "\n", "utf8")
        }
    }

    static resolveInputPath(dataDir: string, levelName: string): string {
        for (const relativePath of getLevelAssetPathCandidates(levelName, "tbn")) {
            const candidatePath = path.join(dataDir, relativePath)
            if (fs.existsSync(candidatePath)) {
                return candidatePath
            }
        }
        throw new Error(`Missing TBN source for '${levelName}' in '${dataDir}'`)
    }

    static decodeLegacyTbnData(source: Buffer): ParsedTbnFileData {
        if (source.length < 2) {
            throw new Error("TBN file is too small")
        }
        const tableSize = source.readUInt16LE(0)
        if (tableSize <= 0 || tableSize > source.length || (tableSize % 2) !== 0) {
            throw new Error(`Invalid TBN table size: ${tableSize}`)
        }
        const entryCount = tableSize / 2
        const texts: string[] = new Array(entryCount)
        for (let i = 0; i < entryCount; ++i) {
            const offset = source.readUInt16LE(i * 2)
            if (offset < tableSize || offset > source.length) {
                texts[i] = ""
                continue
            }
            let end = offset
            while (end < source.length && source[end] !== 0) {
                ++end
            }
            texts[i] = source.toString("latin1", offset, end)
        }
        return { texts }
    }
}

export { ParsedTbnFileData, TbnFileExporter }
