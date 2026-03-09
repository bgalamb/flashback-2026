import { CT_DATA_SIZE, CT_DOWN_ROOM, CT_GRID_HEIGHT, CT_GRID_STRIDE, CT_GRID_WIDTH, CT_HEADER_SIZE, CT_LEFT_ROOM, CT_RIGHT_ROOM, CT_ROOM_SIZE, CT_UP_ROOM } from "../game_constants"

type RoomAdjacency = {
    room: number
    up: number
    down: number
    left: number
    right: number
}

class CtArrayRebuilder {
    private static readonly CT_SIZE = CT_DATA_SIZE
    private static readonly GRID_OFFSET = CT_HEADER_SIZE
    private static readonly GRID_STRIDE = CT_GRID_STRIDE
    private static readonly GRID_W = CT_GRID_WIDTH
    private static readonly GRID_H = CT_GRID_HEIGHT

    static rebuildAllLevelsFromExport(txtRootDir: string, outDir: string) {
        const fs = require("fs")
        const path = require("path")

        fs.mkdirSync(outDir, { recursive: true })
        const entries = fs.readdirSync(txtRootDir, { withFileTypes: true }).filter((d: any) => d.isDirectory())

        for (const entry of entries) {
            const levelName = entry.name
            const levelDir = path.join(txtRootDir, levelName)
            const adjacencyJsonPath = path.join(levelDir, `${levelName}-ct-adjacency.json`)
            if (!fs.existsSync(adjacencyJsonPath)) {
                continue
            }
            const ct = CtArrayRebuilder.rebuildLevel(levelDir, levelName, adjacencyJsonPath)
            const outPath = path.join(outDir, `${levelName}.ct.bin`)
            fs.writeFileSync(outPath, new Uint8Array(ct.buffer))
        }
    }

    static rebuildLevel(levelDir: string, levelName: string, adjacencyJsonPath: string): Int8Array {
        const fs = require("fs")
        const path = require("path")

        const ct = new Int8Array(CtArrayRebuilder.CT_SIZE)
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
            if (room < 0 || room >= CT_ROOM_SIZE) {
                continue
            }
            const up = Number.isInteger(roomData.up) ? roomData.up : 0
            const down = Number.isInteger(roomData.down) ? roomData.down : 0
            const left = Number.isInteger(roomData.left) ? roomData.left : 0
            const right = Number.isInteger(roomData.right) ? roomData.right : 0
            ct[CT_UP_ROOM + room] = up
            ct[CT_DOWN_ROOM + room] = down
            ct[CT_LEFT_ROOM + room] = left
            ct[CT_RIGHT_ROOM + room] = right
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
            if (y < 0 || y >= CtArrayRebuilder.GRID_H) {
                continue
            }
            const row = CtArrayRebuilder.extractFixedCells(m[2], CtArrayRebuilder.GRID_W)
            for (let x = 0; x < CtArrayRebuilder.GRID_W; ++x) {
                const token = (row[x] || "").trim()
                if (/^-?\d+$/.test(token)) {
                    const value = Number(token)
                    ct[CtArrayRebuilder.GRID_OFFSET + room * CtArrayRebuilder.GRID_STRIDE + y * CtArrayRebuilder.GRID_W + x] = value
                }
            }
        }
    }
}

export { CtArrayRebuilder }
