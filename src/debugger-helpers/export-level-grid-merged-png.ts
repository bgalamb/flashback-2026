import { ctGridHeight, ctGridWidth } from "../core/game_constants"
import { encodeRgbPng } from "../core/png-rgb"

type RoomCoord = {
    room: number
    x: number
    y: number
}

type RoomGrid = number[][]

function printUsage() {
    console.error("Usage: npx ts-node --transpile-only ./src/debugger-helpers/export-level-grid-merged-png.ts <adjacency.txt> <gridDir> <output.png> [cellSize]")
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

    for (let y = 0; y < logicalHeight; ++y) {
        for (let x = 0; x < logicalWidth; ++x) {
            if (logicalGrid[y * logicalWidth + x] === 0) {
                continue
            }
            const startX = x * cellSize
            const startY = y * cellSize
            for (let py = 0; py < cellSize; ++py) {
                for (let px = 0; px < cellSize; ++px) {
                    const pixelIndex = ((startY + py) * width + (startX + px)) * 3
                    rgbPixels[pixelIndex + 0] = 0x00
                    rgbPixels[pixelIndex + 1] = 0x00
                    rgbPixels[pixelIndex + 2] = 0x00
                }
            }
        }
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
