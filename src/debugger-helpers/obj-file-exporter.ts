import { encodeLegacyOBJDataAsJson } from "./obj-legacy-parser"

const fs = require("fs")
const path = require("path")

class ObjFileExporter {
    private static readonly FILES_INDEX_NAME = "files.json"
    private static readonly LEGACY_OBJ_DIR = path.posix.join("levels", "legacy-level-data")
    private static readonly LEVEL_NAMES = ["level1", "level2", "level3", "level4_1", "level4_2", "level5_1", "level5_2"]

    static getLevelNames(): string[] {
        return ObjFileExporter.LEVEL_NAMES.slice()
    }

    static getOverrideBaseName(levelName: string): string {
        const suffixIndex = levelName.indexOf("_")
        return suffixIndex === -1 ? levelName : levelName.slice(0, suffixIndex)
    }

    static getOutputRelativePath(levelName: string): string {
        return path.posix.join("levels", levelName, `${ObjFileExporter.getOverrideBaseName(levelName)}.obj.json`)
    }

    static exportLevel(dataDir: string, levelName: string, outputFilePath?: string): string {
        const inputPath = path.join(dataDir, ObjFileExporter.LEGACY_OBJ_DIR, `${levelName}.obj`)
        const resolvedOutputPath = outputFilePath || path.join(dataDir, ObjFileExporter.getOutputRelativePath(levelName))
        const fileBuffer: Buffer = fs.readFileSync(inputPath)
        const parsedJson = encodeLegacyOBJDataAsJson(new Uint8Array(fileBuffer))

        fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true })
        fs.writeFileSync(resolvedOutputPath, parsedJson + "\n", "utf8")
        return resolvedOutputPath
    }

    static exportAllLevels(dataDir: string): string[] {
        const writtenFiles = ObjFileExporter.getLevelNames().map((levelName) => ObjFileExporter.exportLevel(dataDir, levelName))
        ObjFileExporter.ensureFilesIndexContainsOutputs(dataDir, writtenFiles)
        return writtenFiles
    }

    static ensureFilesIndexContainsOutputs(dataDir: string, outputPaths: string[]): void {
        const filesIndexPath = path.join(dataDir, ObjFileExporter.FILES_INDEX_NAME)
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

export { ObjFileExporter }
