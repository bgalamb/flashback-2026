import { ctGridHeight, ctGridWidth } from "../../core/game_constants"
import { encodeRgbPng } from "../../core/png-rgb"

type RoomCoord = {
    room: number
    x: number
    y: number
}

type RoomGrid = number[][]

type Rgb = {
    r: number
    g: number
    b: number
}

const digitGlyphs: Record<string, string[]> = {
    "0": [
        "111",
        "101",
        "101",
        "101",
        "111",
    ],
    "1": [
        "010",
        "110",
        "010",
        "010",
        "111",
    ],
    "2": [
        "111",
        "001",
        "111",
        "100",
        "111",
    ],
    "3": [
        "111",
        "001",
        "111",
        "001",
        "111",
    ],
    "4": [
        "101",
        "101",
        "111",
        "001",
        "001",
    ],
    "5": [
        "111",
        "100",
        "111",
        "001",
        "111",
    ],
    "6": [
        "111",
        "100",
        "111",
        "101",
        "111",
    ],
    "7": [
        "111",
        "001",
        "001",
        "001",
        "001",
    ],
    "8": [
        "111",
        "101",
        "111",
        "101",
        "111",
    ],
    "9": [
        "111",
        "101",
        "111",
        "001",
        "111",
    ],
}

function printUsage() {
    console.error("Usage: npx ts-node --transpile-only ./src/debugger/ct/export-level-grid-merged-png.ts <adjacency.txt> <gridDir> <output.png> [cellSize]")
}

function parseAdjacencyTxt(adjacencyPath: string): RoomCoord[] {
    const fs = require("fs")

    const lines = fs.readFileSync(adjacencyPath, "utf8").split(/\r?\n/)
    const roomCoords: RoomCoord[] = []
    let parsedRowCount = 0

    for (const line of lines) {
        const match = /^\|\s*\d+\s*\|(.*)\|$/.exec(line)
        if (!match) {
            continue
        }
        const rowBody = match[1]
        const cells = rowBody.match(/.{1,5}/g) || []
        let hasRowRooms = false
        for (let x = 0; x < cells.length; ++x) {
            const trimmed = cells[x].trim()
            if (!trimmed) {
                continue
            }
            if (!/^\d+$/.test(trimmed)) {
                continue
            }
            if (!hasRowRooms) {
                hasRowRooms = true
            }
            roomCoords.push({
                room: Number(trimmed),
                x,
                y: parsedRowCount
            })
        }
        if (hasRowRooms) {
            ++parsedRowCount
        }
    }

    if (roomCoords.length === 0) {
        throw new Error(`Could not parse any room coordinates from '${adjacencyPath}'`)
    }

    return roomCoords
}

function parseRoomGrid(gridPath: string): RoomGrid {
    const fs = require("fs")

    const lines = fs.readFileSync(gridPath, "utf8").split(/\r?\n/)
    const rows: number[][] = []

    for (const line of lines) {
        const match = /^\|\s*(\d+)\s*\|(.*)\|$/.exec(line)
        if (!match) {
            continue
        }
        const y = Number(match[1])
        if (y < 0 || y >= ctGridHeight) {
            continue
        }
        const values = (match[2].match(/-?\d+/g) || []).map(Number)
        if (values.length !== ctGridWidth) {
            throw new Error(`Expected ${ctGridWidth} grid values in '${gridPath}' row ${y}, got ${values.length}`)
        }
        rows[y] = values
    }

    if (rows.length !== ctGridHeight || rows.some((row) => !row)) {
        throw new Error(`Incomplete grid rows in '${gridPath}'`)
    }

    return rows
}

function renderMergedGrid(roomCoords: RoomCoord[], roomGridsByRoom: Map<number, RoomGrid>, cellSize: number) {
    const overlapX = ctGridWidth - 1
    const overlapY = ctGridHeight - 1

    const minX = Math.min(...roomCoords.map((entry) => entry.x))
    const maxX = Math.max(...roomCoords.map((entry) => entry.x))
    const minY = Math.min(...roomCoords.map((entry) => entry.y))
    const maxY = Math.max(...roomCoords.map((entry) => entry.y))

    const logicalWidth = (maxX - minX) * overlapX + ctGridWidth
    const logicalHeight = (maxY - minY) * overlapY + ctGridHeight
    const logicalGrid = new Uint8Array(logicalWidth * logicalHeight)

    for (const { room, x, y } of roomCoords) {
        const roomGrid = roomGridsByRoom.get(room)
        if (!roomGrid) {
            throw new Error(`Missing parsed grid for room ${room}`)
        }
        const baseX = (x - minX) * overlapX
        const baseY = (y - minY) * overlapY
        for (let gy = 0; gy < ctGridHeight; ++gy) {
            for (let gx = 0; gx < ctGridWidth; ++gx) {
                const value = roomGrid[gy][gx]
                if (value === 0) {
                    continue
                }
                const mergedIndex = (baseY + gy) * logicalWidth + (baseX + gx)
                logicalGrid[mergedIndex] = 1
            }
        }
    }

    const width = logicalWidth * cellSize
    const height = logicalHeight * cellSize
    const rgbPixels = new Uint8Array(width * height * 3)
    rgbPixels.fill(0xFF)
    const black: Rgb = { r: 0x00, g: 0x00, b: 0x00 }
    const red: Rgb = { r: 0xFF, g: 0x00, b: 0x00 }
    const white: Rgb = { r: 0xFF, g: 0xFF, b: 0xFF }

    const fillRect = (startX: number, startY: number, rectWidth: number, rectHeight: number, color: Rgb) => {
        const x0 = Math.max(0, startX)
        const y0 = Math.max(0, startY)
        const x1 = Math.min(width, startX + rectWidth)
        const y1 = Math.min(height, startY + rectHeight)
        for (let py = y0; py < y1; ++py) {
            for (let px = x0; px < x1; ++px) {
                const pixelIndex = (py * width + px) * 3
                rgbPixels[pixelIndex + 0] = color.r
                rgbPixels[pixelIndex + 1] = color.g
                rgbPixels[pixelIndex + 2] = color.b
            }
        }
    }

    const drawText = (text: string, startX: number, startY: number, scale: number, color: Rgb) => {
        let cursorX = startX
        for (const char of text) {
            const glyph = digitGlyphs[char]
            if (!glyph) {
                cursorX += 4 * scale
                continue
            }
            for (let gy = 0; gy < glyph.length; ++gy) {
                for (let gx = 0; gx < glyph[gy].length; ++gx) {
                    if (glyph[gy][gx] !== "1") {
                        continue
                    }
                    fillRect(cursorX + gx * scale, startY + gy * scale, scale, scale, color)
                }
            }
            cursorX += 4 * scale
        }
    }

    for (let y = 0; y < logicalHeight; ++y) {
        for (let x = 0; x < logicalWidth; ++x) {
            if (logicalGrid[y * logicalWidth + x] === 0) {
                continue
            }
            const startX = x * cellSize
            const startY = y * cellSize
            fillRect(startX, startY, cellSize, cellSize, black)
        }
    }

    for (const { room, x, y } of roomCoords) {
        const startX = (x - minX) * overlapX * cellSize
        const startY = (y - minY) * overlapY * cellSize
        const roomWidth = ctGridWidth * cellSize
        const roomHeight = ctGridHeight * cellSize

        fillRect(startX, startY, roomWidth, 1, red)
        fillRect(startX, startY, 1, roomHeight, red)
        fillRect(startX, startY + roomHeight - 1, roomWidth, 1, red)
        fillRect(startX + roomWidth - 1, startY, 1, roomHeight, red)

        const labelScale = Math.max(1, Math.floor(cellSize / 4))
        const labelText = room.toString()
        const labelWidth = (labelText.length * 4 - 1) * labelScale
        const labelHeight = 5 * labelScale
        const labelPadding = Math.max(2, Math.floor(labelScale / 2))
        const labelX = startX + 3
        const labelY = startY + 3
        fillRect(
            labelX - labelPadding,
            labelY - labelPadding,
            labelWidth + labelPadding * 2,
            labelHeight + labelPadding * 2,
            white
        )
        fillRect(
            labelX - labelPadding,
            labelY - labelPadding,
            labelWidth + labelPadding * 2,
            1,
            red
        )
        fillRect(
            labelX - labelPadding,
            labelY - labelPadding,
            1,
            labelHeight + labelPadding * 2,
            red
        )
        fillRect(
            labelX - labelPadding,
            labelY + labelHeight + labelPadding - 1,
            labelWidth + labelPadding * 2,
            1,
            red
        )
        fillRect(
            labelX + labelWidth + labelPadding - 1,
            labelY - labelPadding,
            1,
            labelHeight + labelPadding * 2,
            red
        )
        drawText(labelText, labelX, labelY, labelScale, red)
    }

    const maxRoomX = Math.max(...roomCoords.map((entry) => (entry.x - minX) * overlapX * cellSize + ctGridWidth * cellSize))
    const maxRoomY = Math.max(...roomCoords.map((entry) => (entry.y - minY) * overlapY * cellSize + ctGridHeight * cellSize))
    if (maxRoomX < width) {
        fillRect(maxRoomX, 0, 1, height, red)
    }
    if (maxRoomY < height) {
        fillRect(0, maxRoomY, width, 1, red)
    }

    return {
        width,
        height,
        png: encodeRgbPng(width, height, rgbPixels)
    }
}

function main() {
    const args = process.argv.slice(2)
    if (args.length < 3 || args.length > 4) {
        printUsage()
        process.exit(1)
    }

    const [adjacencyPath, gridDir, outputPath, cellSizeArg] = args
    const cellSize = cellSizeArg ? Number(cellSizeArg) : 16
    if (!Number.isInteger(cellSize) || cellSize <= 0) {
        throw new Error(`Invalid cellSize '${cellSizeArg}'. Expected a positive integer.`)
    }

    const fs = require("fs")
    const path = require("path")

    const roomCoords = parseAdjacencyTxt(adjacencyPath)
    const roomGridsByRoom = new Map<number, RoomGrid>()
    for (const { room } of roomCoords) {
        const gridPath = path.join(gridDir, `room-${room.toString().padStart(2, "0")}-grid.txt`)
        roomGridsByRoom.set(room, parseRoomGrid(gridPath))
    }

    const rendered = renderMergedGrid(roomCoords, roomGridsByRoom, cellSize)
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, Buffer.from(rendered.png))
    console.log(`Wrote ${outputPath} (${rendered.width}x${rendered.height})`)
}

main()
