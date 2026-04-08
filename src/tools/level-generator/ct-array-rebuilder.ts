import { ctDataSize, ctDownRoom, ctGridHeight, ctGridStride, ctGridWidth, ctHeaderSize, ctLeftRoom, ctRightRoom, ctRoomSize, ctUpRoom } from "../../core/game_constants"

type RoomAdjacency = {
    room: number
    up: number
    down: number
    left: number
    right: number
}

class CtArrayRebuilder {
    private static readonly ctSize = ctDataSize
    private static readonly gridOffset = ctHeaderSize
    private static readonly gridStride = ctGridStride
    private static readonly gridW = ctGridWidth
    private static readonly gridH = ctGridHeight

    private static tryGetLevelExportDir(rootDir: string, levelName: string, exportDirName?: string): string | null {
        const fs = require("fs")
        const path = require("path")

        if (exportDirName) {
            const explicitDir = path.join(rootDir, exportDirName)
            const explicitAdjacency = path.join(explicitDir, `${levelName}-ct-adjacency.json`)
            if (fs.existsSync(explicitAdjacency)) {
                return explicitDir
            }
        }

        const directDir = path.join(rootDir, levelName)
        const directAdjacency = path.join(directDir, `${levelName}-ct-adjacency.json`)
        if (fs.existsSync(directAdjacency)) {
            return directDir
        }

        const nestedDir = path.join(rootDir, levelName, "collisions")
        const nestedAdjacency = path.join(nestedDir, `${levelName}-ct-adjacency.json`)
        if (fs.existsSync(nestedAdjacency)) {
            return nestedDir
        }

        return null
    }

    private static getRebuildTargets(txtRootDir: string, outDir: string): Array<{ levelName: string, levelDir: string }> {
        const fs = require("fs")
        const path = require("path")

        const entries = fs.readdirSync(txtRootDir, { withFileTypes: true }).filter((d: any) => d.isDirectory())
        const requestedLevelName = path.basename(path.resolve(outDir))
        const availableLevelNames = new Set(entries.map((entry: any) => entry.name))
        const hasDirectRequestedLevel = availableLevelNames.has(requestedLevelName)
        const hasCollisionRequestedLevel = availableLevelNames.has(`${requestedLevelName}-collisions`)
        const requestedExportDirs = new Set<string>()
        if (hasDirectRequestedLevel) {
            requestedExportDirs.add(requestedLevelName)
        }
        if (hasCollisionRequestedLevel) {
            requestedExportDirs.add(`${requestedLevelName}-collisions`)
        }
        const restrictToRequestedLevel = requestedExportDirs.size > 0
        const targets: Array<{ levelName: string, levelDir: string }> = []

        for (const entry of entries) {
            const exportDirName = entry.name
            if (restrictToRequestedLevel && !requestedExportDirs.has(exportDirName)) {
                continue
            }
            const levelName = exportDirName.endsWith("-collisions")
                ? exportDirName.slice(0, -"-collisions".length)
                : exportDirName
            const levelDir = CtArrayRebuilder.tryGetLevelExportDir(txtRootDir, levelName, exportDirName)
            if (!levelDir) {
                continue
            }
            targets.push({ levelName, levelDir })
        }

        return targets
    }

    static rebuildAllLevelsFromExport(txtRootDir: string, outDir: string | string[]) {
        const fs = require("fs")
        const path = require("path")

        const outDirs = Array.from(new Set((Array.isArray(outDir) ? outDir : [outDir]).map((dir) => path.resolve(dir))))
        if (outDirs.length === 0) {
            return
        }

        const targets = CtArrayRebuilder.getRebuildTargets(txtRootDir, outDirs[0])
        for (const dir of outDirs) {
            fs.mkdirSync(dir, { recursive: true })
        }

        for (const target of targets) {
            const adjacencyJsonPath = path.join(target.levelDir, `${target.levelName}-ct-adjacency.json`)
            const ct = CtArrayRebuilder.rebuildLevel(target.levelDir, target.levelName, adjacencyJsonPath)
            for (const dir of outDirs) {
                const outPath = path.join(dir, `${target.levelName}.ct.bin`)
                fs.writeFileSync(outPath, new Uint8Array(ct.buffer))
            }
        }
    }

    static rebuildLevel(levelDir: string, levelName: string, adjacencyJsonPath: string): Int8Array {
        const fs = require("fs")
        const path = require("path")

        const ct = new Int8Array(CtArrayRebuilder.ctSize)
        CtArrayRebuilder.applyAdjacencyFromJson(ct, fs.readFileSync(adjacencyJsonPath, "utf8"), levelName)

        const files = fs.readdirSync(levelDir).filter((name: string) => /^room-\d{2}-grid\.txt$/.test(name))
        for (const file of files) {
            const m = /^room-(\d{2})-grid\.txt$/.exec(file)
            if (!m) {
                continue
            }
            const room = Number(m[1])
            const text = fs.readFileSync(path.join(levelDir, file), "utf8")
            CtArrayRebuilder.applyGridFromText(ct, room, text)
        }
        return ct
    }

    private static extractFixedCells(row: string, forceWidth?: number): string[] {
        const step = 5
        const normalized = row.startsWith(" ") ? row : ` ${row}`
        const cells: string[] = []
        const width = forceWidth || Math.max(0, Math.floor((normalized.length + 1) / step))
        for (let i = 0; i < width; ++i) {
            const start = 1 + i * step
            const chunk = normalized.slice(start, start + 4)
            if (chunk.length === 0) {
                break
            }
            cells.push(chunk)
        }
        return cells
    }

    private static applyAdjacencyFromJson(ct: Int8Array, jsonText: string, expectedLevelName: string) {
        const parsed = JSON.parse(jsonText)
        if (!parsed || !Array.isArray(parsed.rooms)) {
            throw new Error("Invalid adjacency JSON format: expected object with 'rooms' array")
        }
        if (parsed.level && parsed.level !== expectedLevelName) {
            throw new Error(`Adjacency JSON level mismatch: expected '${expectedLevelName}', got '${parsed.level}'`)
        }
        for (const roomData of parsed.rooms as RoomAdjacency[]) {
            if (!roomData || typeof roomData.room !== "number") {
                continue
            }
            const room = roomData.room
            if (room < 0 || room >= ctRoomSize) {
                continue
            }
            const up = Number.isInteger(roomData.up) ? roomData.up : 0
            const down = Number.isInteger(roomData.down) ? roomData.down : 0
            const left = Number.isInteger(roomData.left) ? roomData.left : 0
            const right = Number.isInteger(roomData.right) ? roomData.right : 0
            ct[ctUpRoom + room] = up
            ct[ctDownRoom + room] = down
            ct[ctLeftRoom + room] = left
            ct[ctRightRoom + room] = right
        }
    }

    private static applyGridFromText(ct: Int8Array, room: number, text: string) {
        const lines = text.split(/\r?\n/)
        for (const line of lines) {
            const m = /^\|\s*(\d+)\s*\|(.*)\|$/.exec(line)
            if (!m) {
                continue
            }
            const y = Number(m[1])
            if (y < 0 || y >= CtArrayRebuilder.gridH) {
                continue
            }
            const row = CtArrayRebuilder.extractFixedCells(m[2], CtArrayRebuilder.gridW)
            for (let x = 0; x < CtArrayRebuilder.gridW; ++x) {
                const token = (row[x] || "").trim()
                if (/^-?\d+$/.test(token)) {
                    const value = Number(token)
                    ct[CtArrayRebuilder.gridOffset + room * CtArrayRebuilder.gridStride + y * CtArrayRebuilder.gridW + x] = value
                }
            }
        }
    }
}

export { CtArrayRebuilder }
