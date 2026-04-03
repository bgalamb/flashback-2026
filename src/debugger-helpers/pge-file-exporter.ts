import { encodeLegacyPGEDataAsJson } from "./pge-legacy-parser"

const fs = require("fs")
const path = require("path")

class PgeFileExporter {
    private static readonly filesIndexName = "files.json"
    private static readonly legacyPgeDir = path.posix.join("levels", "legacy-level-data")
    private static readonly levelNames = ["level1", "level2", "level3", "level4_1", "level4_2", "level5_1", "level5_2"]

    static getLevelNames(): string[] {
        return PgeFileExporter.levelNames.slice()
    }

    static getOverrideBaseName(levelName: string): string {
        const suffixIndex = levelName.indexOf("_")
        return suffixIndex === -1 ? levelName : levelName.slice(0, suffixIndex)
    }

    static getOutputRelativePath(levelName: string): string {
        return path.posix.join("levels", levelName, `${PgeFileExporter.getOverrideBaseName(levelName)}.pge.json`)
    }

    static exportLevel(dataDir: string, levelName: string, outputFilePath?: string): string {
        const inputPath = path.join(dataDir, PgeFileExporter.legacyPgeDir, `${levelName}.pge`)
        const resolvedOutputPath = outputFilePath || path.join(dataDir, PgeFileExporter.getOutputRelativePath(levelName))
        const fileBuffer: Buffer = fs.readFileSync(inputPath)
        const parsedJson = encodeLegacyPGEDataAsJson(new Uint8Array(fileBuffer.subarray(0, fileBuffer.length - 12)), 256)

        fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true })
        fs.writeFileSync(resolvedOutputPath, parsedJson + "\n", "utf8")
        return resolvedOutputPath
    }

    static exportAllLevels(dataDir: string): string[] {
        const writtenFiles = PgeFileExporter.getLevelNames().map((levelName) => PgeFileExporter.exportLevel(dataDir, levelName))
        PgeFileExporter.ensureFilesIndexContainsOutputs(dataDir, writtenFiles)
        return writtenFiles
    }

    static ensureFilesIndexContainsOutputs(dataDir: string, outputPaths: string[]): void {
        const filesIndexPath = path.join(dataDir, PgeFileExporter.filesIndexName)
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
}

export { PgeFileExporter }
