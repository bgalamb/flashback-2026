import { ctDataSize, ctDownRoom, ctGridHeight, ctGridStride, ctGridWidth, ctLeftRoom, ctRightRoom, ctRoomSize, ctUpRoom } from "../core/game_constants"
import { getLevelAssetPathCandidates } from "../core/level-asset-paths"
import { _gameLevels } from "../core/staticres"
import { bytekillerUnpack } from "../core/unpack"

class CtGridTableExporter {
    private static readonly gridOffset = 0x100
    private static readonly gridStride = ctGridStride
    private static readonly gridWidth = ctGridWidth
    private static readonly gridHeight = ctGridHeight

    static getLevelNames(): string[] {
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

    static exportLevelRooms(dataDir: string, levelName: string, outputDir: string) {
        const fs = require("fs")
        const path = require("path")

        const ctPath = CtGridTableExporter.resolveCtPath(dataDir, levelName)

        const ctData = CtGridTableExporter.decodeCtFile(ctPath)
        fs.mkdirSync(outputDir, { recursive: true })

        const existingRooms = CtGridTableExporter.getExistingRooms(ctData)
        for (const room of existingRooms) {
            const outPath = path.join(outputDir, `room-${room.toString().padStart(2, "0")}-grid.txt`)
            fs.writeFileSync(outPath, CtGridTableExporter.renderRoomGrid(levelName, room, ctData), "utf8")
        }
    }

    static exportLevelRoom(dataDir: string, levelName: string, room: number, outputPath: string) {
        const fs = require("fs")
        const path = require("path")

        const ctPath = CtGridTableExporter.resolveCtPath(dataDir, levelName)
        const ctData = CtGridTableExporter.decodeCtFile(ctPath)
        const existingRooms = CtGridTableExporter.getExistingRooms(ctData)
        if (!existingRooms.includes(room)) {
            throw new Error(`Room ${room} does not appear to exist in level '${levelName}' (based on non-zero adjacency links)`)
        }
        fs.mkdirSync(path.dirname(outputPath), { recursive: true })
        fs.writeFileSync(outputPath, CtGridTableExporter.renderRoomGrid(levelName, room, ctData), "utf8")
    }

    static exportAllLevelsRooms(dataDir: string, outputDir: string) {
        const path = require("path")

        for (const levelName of CtGridTableExporter.getLevelNames()) {
            CtGridTableExporter.exportLevelRooms(dataDir, levelName, path.join(outputDir, levelName))
        }
    }

    static renderRoomGrid(levelName: string, room: number, ctData: Int8Array): string {
        if (room < 0 || room >= ctRoomSize) {
            throw new Error(`Invalid room index ${room}. Expected 0..${ctRoomSize - 1}`)
        }

        const cellW = 4
        const yLabelW = 1
        const horizontal = "+" + "-".repeat(yLabelW + 2) + "+" + "-".repeat((cellW + 1) * CtGridTableExporter.gridWidth + 1) + "+"
        const lines: string[] = []

        lines.push(`=== ${levelName} room ${room} ===`)
        lines.push(horizontal)
        lines.push(`| y |${CtGridTableExporter.renderHeaderCells(cellW)} |`)
        lines.push(horizontal)

        const roomBase = CtGridTableExporter.gridOffset + room * CtGridTableExporter.gridStride
        for (let y = 0; y < CtGridTableExporter.gridHeight; ++y) {
            const rowValues: string[] = []
            for (let x = 0; x < CtGridTableExporter.gridWidth; ++x) {
                const value = ctData[roomBase + y * CtGridTableExporter.gridWidth + x]
                rowValues.push(value.toString().padStart(cellW, " "))
            }
            const blankCells = new Array(CtGridTableExporter.gridWidth).fill(" ".repeat(cellW)).join(" ")
            lines.push(`| ${y.toString().padStart(yLabelW, " ")} | ${rowValues.join(" ")} |`)
            lines.push(`| ${" ".repeat(yLabelW)} | ${blankCells} |`)
        }
        lines.push(horizontal)
        return lines.join("\n")
    }

    private static renderHeaderCells(cellW: number): string {
        const cells: string[] = []
        for (let x = 0; x < CtGridTableExporter.gridWidth; ++x) {
            cells.push(x.toString().padStart(cellW, " "))
        }
        return " " + cells.join(" ")
    }

    private static getExistingRooms(ctData: Int8Array): number[] {
        const active: { [room: number]: true } = {}
        for (let room = 0; room < ctRoomSize; ++room) {
            const refs = [
                ctData[ctUpRoom + room],
                ctData[ctDownRoom + room],
                ctData[ctLeftRoom + room],
                ctData[ctRightRoom + room]
            ]
            for (const ref of refs) {
                if (CtGridTableExporter.isValidRoomRef(ref)) {
                    active[room] = true
                    active[ref] = true
                }
            }
        }
        return Object.keys(active).map(Number).sort((a, b) => a - b)
    }

    private static isValidRoomRef(room: number): boolean {
        return room > 0 && room < ctRoomSize
    }

    private static decodeCtFile(ctPath: string): Int8Array {
        const fs = require("fs")

        const src = new Uint8Array(fs.readFileSync(ctPath))
        const dst = new Uint8Array(ctDataSize)
        if (!bytekillerUnpack(dst, dst.length, src, src.length)) {
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
}

export { CtGridTableExporter }
