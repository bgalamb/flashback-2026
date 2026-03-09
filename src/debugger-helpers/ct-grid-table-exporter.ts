import { CT_DOWN_ROOM, CT_LEFT_ROOM, CT_RIGHT_ROOM, CT_ROOM_SIZE, CT_UP_ROOM } from "../game_constants"
import { _gameLevels } from "../staticres"
import { bytekiller_unpack } from "../unpack"

class CtGridTableExporter {
    private static readonly GRID_OFFSET = 0x100
    private static readonly GRID_STRIDE = 0x70
    private static readonly GRID_WIDTH = 16
    private static readonly GRID_HEIGHT = 7

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

        const ctPath = path.join(dataDir, `${levelName}.ct`)
        if (!fs.existsSync(ctPath)) {
            throw new Error(`Missing file: ${ctPath}`)
        }

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

        const ctPath = path.join(dataDir, `${levelName}.ct`)
        if (!fs.existsSync(ctPath)) {
            throw new Error(`Missing file: ${ctPath}`)
        }
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
        if (room < 0 || room >= CT_ROOM_SIZE) {
            throw new Error(`Invalid room index ${room}. Expected 0..${CT_ROOM_SIZE - 1}`)
        }

        const cellW = 4
        const yLabelW = 1
        const horizontal = "+" + "-".repeat(yLabelW + 2) + "+" + "-".repeat((cellW + 1) * CtGridTableExporter.GRID_WIDTH + 1) + "+"
        const lines: string[] = []

        lines.push(`=== ${levelName} room ${room} ===`)
        lines.push(horizontal)
        lines.push(`| y |${CtGridTableExporter.renderHeaderCells(cellW)} |`)
        lines.push(horizontal)

        const roomBase = CtGridTableExporter.GRID_OFFSET + room * CtGridTableExporter.GRID_STRIDE
        for (let y = 0; y < CtGridTableExporter.GRID_HEIGHT; ++y) {
            const rowValues: string[] = []
            for (let x = 0; x < CtGridTableExporter.GRID_WIDTH; ++x) {
                const value = ctData[roomBase + y * CtGridTableExporter.GRID_WIDTH + x]
                rowValues.push(value.toString().padStart(cellW, " "))
            }
            const blankCells = new Array(CtGridTableExporter.GRID_WIDTH).fill(" ".repeat(cellW)).join(" ")
            lines.push(`| ${y.toString().padStart(yLabelW, " ")} | ${rowValues.join(" ")} |`)
            lines.push(`| ${" ".repeat(yLabelW)} | ${blankCells} |`)
        }
        lines.push(horizontal)
        return lines.join("\n")
    }

    private static renderHeaderCells(cellW: number): string {
        const cells: string[] = []
        for (let x = 0; x < CtGridTableExporter.GRID_WIDTH; ++x) {
            cells.push(x.toString().padStart(cellW, " "))
        }
        return " " + cells.join(" ")
    }

    private static getExistingRooms(ctData: Int8Array): number[] {
        const active: { [room: number]: true } = {}
        for (let room = 0; room < CT_ROOM_SIZE; ++room) {
            const refs = [
                ctData[CT_UP_ROOM + room],
                ctData[CT_DOWN_ROOM + room],
                ctData[CT_LEFT_ROOM + room],
                ctData[CT_RIGHT_ROOM + room]
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
        return room > 0 && room < CT_ROOM_SIZE
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
}

export { CtGridTableExporter }
