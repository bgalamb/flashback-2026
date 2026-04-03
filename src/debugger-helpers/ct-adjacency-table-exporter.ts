import { CT_DOWN_ROOM, CT_LEFT_ROOM, CT_RIGHT_ROOM, CT_ROOM_SIZE, CT_UP_ROOM } from "../core/game_constants"
import { getLevelAssetPathCandidates } from "../core/level-asset-paths"
import { bytekiller_unpack } from "../core/unpack"
import { _gameLevels } from "../core/staticres"

type RoomAdjacency = {
    room: number
    up: number
    down: number
    left: number
    right: number
}

type Coord = {
    x: number
    y: number
}

type RoomCoords = {
    [room: number]: Coord
}

class CtAdjacencyTableExporter {
    static getLevelNames(): string[] {
        return CtAdjacencyTableExporter.getUniqueCtBaseNames()
    }

    static exportAllLevels(dataDir: string, outputPath?: string): string {
        const fs = require("fs")
        const path = require("path")

        const levelNames = CtAdjacencyTableExporter.getLevelNames()
        const blocks: string[] = []

        for (const levelName of levelNames) {
            try {
                const ctData = CtAdjacencyTableExporter.decodeCtFile(CtAdjacencyTableExporter.resolveCtPath(dataDir, levelName))
                blocks.push(CtAdjacencyTableExporter.renderLevelTable(levelName, ctData))
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error)
                blocks.push(`=== ${levelName} ===\n${message}\n`)
            }
        }

        const out = blocks.join("\n")
        if (outputPath) {
            fs.writeFileSync(outputPath, out, "utf8")
        }
        return out
    }

    static exportLevel(dataDir: string, levelName: string, outputPath?: string): string {
        const fs = require("fs")
        const path = require("path")

        let out: string
        try {
            const ctPath = CtAdjacencyTableExporter.resolveCtPath(dataDir, levelName)
            const ctData = CtAdjacencyTableExporter.decodeCtFile(ctPath)
            out = CtAdjacencyTableExporter.renderLevelTable(levelName, ctData)
            if (outputPath) {
                const rows = CtAdjacencyTableExporter.getAdjacencyRows(ctData)
                const parsed = path.parse(outputPath)
                const jsonPath = path.join(parsed.dir, `${parsed.name}.json`)
                fs.writeFileSync(jsonPath, JSON.stringify({
                    level: levelName,
                    rooms: rows
                }, null, 2), "utf8")
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            out = `=== ${levelName} ===\n${message}\n`
        }
        if (outputPath) {
            fs.writeFileSync(outputPath, out, "utf8")
        }
        return out
    }

    private static getUniqueCtBaseNames(): string[] {
        const unique: { [name: string]: true } = {}
        const names: string[] = []
        for (const level of _gameLevels) {
            if (!unique[level.name]) {
                unique[level.name] = true
                names.push(level.name)
            }
        }
        return names
    }

    private static decodeCtFile(ctPath: string): Int8Array {
        const fs = require("fs")

        const src = new Uint8Array(fs.readFileSync(ctPath))
        const dst = new Uint8Array(0x1D00)
        if (!bytekiller_unpack(dst, dst.length, src, src.length)) {
            throw new Error(`Failed to decode CT data from '${ctPath}'`)
        }
        return new Int8Array(dst.buffer)
    }

    private static resolveCtPath(dataDir: string, levelName: string): string {
        const fs = require("fs")
        const path = require("path")

        for (const relativePath of getLevelAssetPathCandidates(levelName, "ct")) {
            const candidatePath = path.join(dataDir, relativePath)
            if (fs.existsSync(candidatePath)) {
                return candidatePath
            }
        }
        throw new Error(`Missing CT file for '${levelName}' under '${dataDir}'`)
    }

    private static renderLevelTable(levelName: string, ctData: Int8Array): string {
        const rows = CtAdjacencyTableExporter.getAdjacencyRows(ctData)

        const lines: string[] = []
        lines.push(`=== ${levelName} ===`)
        lines.push("Spatial adjacency map (0-links ignored)")

        const active = CtAdjacencyTableExporter.getActiveRooms(rows)
        if (active.length === 0) {
            lines.push("No non-zero adjacency links found.")
            return lines.join("\n")
        }

        const components = CtAdjacencyTableExporter.buildComponents(rows, active)
        for (let i = 0; i < components.length; ++i) {
            lines.push("")
            lines.push(`Component ${i + 1}`)
            lines.push(CtAdjacencyTableExporter.renderComponent(components[i]))
        }

        return lines.join("\n")
    }

    private static getAdjacencyRows(ctData: Int8Array): RoomAdjacency[] {
        const rows: RoomAdjacency[] = []
        for (let room = 0; room < CT_ROOM_SIZE; ++room) {
            rows.push({
                room,
                up: ctData[CT_UP_ROOM + room],
                down: ctData[CT_DOWN_ROOM + room],
                left: ctData[CT_LEFT_ROOM + room],
                right: ctData[CT_RIGHT_ROOM + room]
            })
        }
        return rows
    }

    private static isValidRoomRef(value: number): boolean {
        return value > 0 && value < CT_ROOM_SIZE
    }

    private static getActiveRooms(rows: RoomAdjacency[]): number[] {
        const active: { [room: number]: true } = {}
        for (const row of rows) {
            const neighbors = [row.up, row.down, row.left, row.right]
            for (const n of neighbors) {
                if (CtAdjacencyTableExporter.isValidRoomRef(n)) {
                    active[row.room] = true
                    active[n] = true
                }
            }
        }
        return Object.keys(active).map(Number).sort((a, b) => a - b)
    }

    private static buildComponents(rows: RoomAdjacency[], activeRooms: number[]): RoomCoords[] {
        const byRoom: { [room: number]: RoomAdjacency } = {}
        for (const row of rows) {
            byRoom[row.room] = row
        }
        const activeSet: { [room: number]: true } = {}
        for (const room of activeRooms) {
            activeSet[room] = true
        }

        const deltas: { [k: string]: Coord } = {
            up: { x: 0, y: -1 },
            down: { x: 0, y: 1 },
            left: { x: -1, y: 0 },
            right: { x: 1, y: 0 }
        }
        const reverseDeltas: { [k: string]: Coord } = {
            up: { x: 0, y: 1 },
            down: { x: 0, y: -1 },
            left: { x: 1, y: 0 },
            right: { x: -1, y: 0 }
        }

        const constraints: { [room: number]: Array<{ next: number, dx: number, dy: number }> } = {}
        for (const room of activeRooms) {
            constraints[room] = []
        }
        for (const row of rows) {
            const pairs: Array<["up" | "down" | "left" | "right", number]> = [
                ["up", row.up],
                ["down", row.down],
                ["left", row.left],
                ["right", row.right]
            ]
            for (const [dir, next] of pairs) {
                if (!CtAdjacencyTableExporter.isValidRoomRef(next) || !activeSet[row.room] || !activeSet[next]) {
                    continue
                }
                const d = deltas[dir]
                constraints[row.room].push({ next, dx: d.x, dy: d.y })
                const rd = reverseDeltas[dir]
                constraints[next].push({ next: row.room, dx: rd.x, dy: rd.y })
            }
        }

        const visited: { [room: number]: true } = {}
        const components: RoomCoords[] = []

        for (const start of activeRooms) {
            if (visited[start]) {
                continue
            }
            const roomToCoord: RoomCoords = {}
            const queue: number[] = [start]
            visited[start] = true
            roomToCoord[start] = { x: 0, y: 0 }

            for (let qi = 0; qi < queue.length; ++qi) {
                const room = queue[qi]
                const base = roomToCoord[room]
                const edges = constraints[room]
                for (const edge of edges) {
                    const next = edge.next
                    if (!visited[next]) {
                        visited[next] = true
                        queue.push(next)
                    }
                    if (!roomToCoord[next]) {
                        roomToCoord[next] = { x: base.x + edge.dx, y: base.y + edge.dy }
                    }
                }
            }

            components.push(CtAdjacencyTableExporter.normalizeComponent(roomToCoord))
        }

        return components
    }

    private static normalizeComponent(component: RoomCoords): RoomCoords {
        let minX = 0
        let minY = 0
        for (const room of Object.keys(component)) {
            const coord = component[Number(room)]
            if (coord.x < minX) minX = coord.x
            if (coord.y < minY) minY = coord.y
        }
        if (minX === 0 && minY === 0) {
            return component
        }
        const normalized: RoomCoords = {}
        for (const room of Object.keys(component)) {
            const roomId = Number(room)
            const coord = component[roomId]
            normalized[roomId] = { x: coord.x - minX, y: coord.y - minY }
        }
        return normalized
    }

    private static renderComponent(component: RoomCoords): string {
        let maxX = 0
        let maxY = 0
        for (const room of Object.keys(component)) {
            const coord = component[Number(room)]
            if (coord.x > maxX) maxX = coord.x
            if (coord.y > maxY) maxY = coord.y
        }
        const width = maxX + 1
        const height = maxY + 1
        const roomGrid: number[][] = new Array(height).fill(null).map(() => new Array(width).fill(-1))
        for (const room of Object.keys(component)) {
            const roomId = Number(room)
            const coord = component[roomId]
            if (roomGrid[coord.y][coord.x] === -1) {
                roomGrid[coord.y][coord.x] = roomId
            } else {
                // Keep first in case of inconsistent directional links.
            }
        }

        const cellW = 4
        const yLabelW = Math.max(1, (height - 1).toString().length)
        const horizontal = "+" + "-".repeat(yLabelW + 2) + "+" + "-".repeat((cellW + 1) * width + 1) + "+"
        const lines: string[] = []
        lines.push(horizontal)

        const header: string[] = []
        for (let x = 0; x < width; ++x) {
            header.push(x.toString().padStart(cellW, " "))
        }
        lines.push(`| ${"y".padStart(yLabelW, " ")} | ${header.join(" ")} |`)
        lines.push(horizontal)

        for (let y = 0; y < height; ++y) {
            const cells: string[] = []
            for (let x = 0; x < width; ++x) {
                const room = roomGrid[y][x]
                cells.push(room < 0 ? " ".repeat(cellW) : room.toString().padStart(cellW, " "))
            }
            lines.push(`| ${y.toString().padStart(yLabelW, " ")} | ${cells.join(" ")} |`)
        }
        lines.push(horizontal)
        return lines.join("\n")
    }
}

export { CtAdjacencyTableExporter }
