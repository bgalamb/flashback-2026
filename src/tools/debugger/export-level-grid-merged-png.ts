import { ctGridHeight, ctGridWidth } from "../../core/game_constants"
import { encodeRgbPng } from "../../core/png-rgb"

type RoomCoord = {
    room: number
    x: number
    y: number
}

type RoomGrid = number[][]

const digitGlyphs: Record<string, string[]> = {
    "0": [
        "111",
        "101",
        "101",
        "101",
        "111"
    ],
    "1": [
        "010",
        "110",
        "010",
        "010",
        "111"
    ],
    "2": [
        "111",
        "001",
        "111",
        "100",
        "111"
    ],
    "3": [
        "111",
        "001",
        "111",
        "001",
        "111"
    ],
    "4": [
        "101",
        "101",
        "111",
        "001",
        "001"
    ],
    "5": [
        "111",
        "100",
        "111",
        "001",
        "111"
    ],
    "6": [
        "111",
        "100",
        "111",
        "101",
        "111"
    ],
    "7": [
        "111",
        "001",
        "001",
        "001",
        "001"
    ],
    "8": [
        "111",
        "101",
        "111",
        "101",
        "111"
    ],
    "9": [
        "111",
        "101",
        "111",
        "001",
        "111"
    ]
}

function printUsage() {
    console.error("Usage: npx ts-node --transpile-only ./src/tools/debugger/export-level-grid-merged-png.ts <adjacency.txt> <gridDir> <output.png> [cellSize] [--highlight-connections] [--draw-room-numbers]")
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

function drawVerticalLine(rgbPixels: Uint8Array, imageWidth: number, imageHeight: number, x: number, startY: number, endY: number) {
    if (x < 0 || x >= imageWidth) {
        return
    }
    const clampedStartY = Math.max(0, startY)
    const clampedEndY = Math.min(imageHeight - 1, endY)
    for (let y = clampedStartY; y <= clampedEndY; ++y) {
        const pixelIndex = (y * imageWidth + x) * 3
        rgbPixels[pixelIndex + 0] = 0xFF
        rgbPixels[pixelIndex + 1] = 0x00
        rgbPixels[pixelIndex + 2] = 0x00
    }
}

function drawHorizontalLine(rgbPixels: Uint8Array, imageWidth: number, imageHeight: number, y: number, startX: number, endX: number) {
    if (y < 0 || y >= imageHeight) {
        return
    }
    const clampedStartX = Math.max(0, startX)
    const clampedEndX = Math.min(imageWidth - 1, endX)
    for (let x = clampedStartX; x <= clampedEndX; ++x) {
        const pixelIndex = (y * imageWidth + x) * 3
        rgbPixels[pixelIndex + 0] = 0xFF
        rgbPixels[pixelIndex + 1] = 0x00
        rgbPixels[pixelIndex + 2] = 0x00
    }
}

function setPixelRgb(rgbPixels: Uint8Array, imageWidth: number, imageHeight: number, x: number, y: number, r: number, g: number, b: number) {
    if (x < 0 || x >= imageWidth || y < 0 || y >= imageHeight) {
        return
    }
    const pixelIndex = (y * imageWidth + x) * 3
    rgbPixels[pixelIndex + 0] = r
    rgbPixels[pixelIndex + 1] = g
    rgbPixels[pixelIndex + 2] = b
}

function fillRect(rgbPixels: Uint8Array, imageWidth: number, imageHeight: number, x: number, y: number, width: number, height: number, r: number, g: number, b: number) {
    for (let py = 0; py < height; ++py) {
        for (let px = 0; px < width; ++px) {
            setPixelRgb(rgbPixels, imageWidth, imageHeight, x + px, y + py, r, g, b)
        }
    }
}

function strokeRect(rgbPixels: Uint8Array, imageWidth: number, imageHeight: number, x: number, y: number, width: number, height: number, thickness: number, r: number, g: number, b: number) {
    for (let i = 0; i < thickness; ++i) {
        drawHorizontalLine(rgbPixels, imageWidth, imageHeight, y + i, x, x + width - 1)
        drawHorizontalLine(rgbPixels, imageWidth, imageHeight, y + height - 1 - i, x, x + width - 1)
        drawVerticalLine(rgbPixels, imageWidth, imageHeight, x + i, y, y + height - 1)
        drawVerticalLine(rgbPixels, imageWidth, imageHeight, x + width - 1 - i, y, y + height - 1)
    }
    for (let py = y; py < y + height; ++py) {
        for (let px = x; px < x + width; ++px) {
            if (px < x + thickness || px >= x + width - thickness || py < y + thickness || py >= y + height - thickness) {
                setPixelRgb(rgbPixels, imageWidth, imageHeight, px, py, r, g, b)
            }
        }
    }
}

function drawDigit(rgbPixels: Uint8Array, imageWidth: number, imageHeight: number, digit: string, x: number, y: number, scale: number, r: number, g: number, b: number) {
    const glyph = digitGlyphs[digit]
    if (!glyph) {
        return
    }
    for (let gy = 0; gy < glyph.length; ++gy) {
        for (let gx = 0; gx < glyph[gy].length; ++gx) {
            if (glyph[gy][gx] !== "1") {
                continue
            }
            fillRect(rgbPixels, imageWidth, imageHeight, x + gx * scale, y + gy * scale, scale, scale, r, g, b)
        }
    }
}

function drawRoomLabel(rgbPixels: Uint8Array, imageWidth: number, imageHeight: number, label: string, x: number, y: number) {
    const scale = 3
    const digitWidth = 3 * scale
    const digitHeight = 5 * scale
    const digitGap = scale
    const padding = scale
    const labelWidth = label.length * digitWidth + (label.length - 1) * digitGap
    const badgeWidth = labelWidth + padding * 2
    const badgeHeight = digitHeight + padding * 2

    fillRect(rgbPixels, imageWidth, imageHeight, x, y, badgeWidth, badgeHeight, 0xFF, 0xFF, 0xFF)
    strokeRect(rgbPixels, imageWidth, imageHeight, x, y, badgeWidth, badgeHeight, 2, 0xFF, 0x00, 0x00)

    for (let i = 0; i < label.length; ++i) {
        const digitX = x + padding + i * (digitWidth + digitGap)
        drawDigit(rgbPixels, imageWidth, imageHeight, label[i], digitX, y + padding, scale, 0x00, 0x00, 0x00)
    }
}

function renderMergedGrid(roomCoords: RoomCoord[], roomGridsByRoom: Map<number, RoomGrid>, cellSize: number, highlightConnections: boolean, drawRoomNumbers: boolean) {
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
    const roomCoordByPosition = new Map<string, RoomCoord>()

    for (const roomCoord of roomCoords) {
        roomCoordByPosition.set(`${roomCoord.x},${roomCoord.y}`, roomCoord)
    }

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

    if (highlightConnections) {
        const lineThickness = Math.max(3, Math.floor(cellSize / 3))
        for (const { x, y } of roomCoords) {
            const baseX = (x - minX) * overlapX
            const baseY = (y - minY) * overlapY
            const rightNeighbor = roomCoordByPosition.get(`${x + 1},${y}`)
            const bottomNeighbor = roomCoordByPosition.get(`${x},${y + 1}`)

            if (rightNeighbor) {
                const lineX = baseX * cellSize + overlapX * cellSize + Math.floor(cellSize / 2)
                const startY = baseY * cellSize
                const endY = startY + ctGridHeight * cellSize - 1
                for (let offset = 0; offset < lineThickness; ++offset) {
                    drawVerticalLine(rgbPixels, width, height, lineX + offset, startY, endY)
                }
            }

            if (bottomNeighbor) {
                const lineY = baseY * cellSize + overlapY * cellSize + Math.floor(cellSize / 2)
                const startX = baseX * cellSize
                const endX = startX + ctGridWidth * cellSize - 1
                for (let offset = 0; offset < lineThickness; ++offset) {
                    drawHorizontalLine(rgbPixels, width, height, lineY + offset, startX, endX)
                }
            }
        }
    }

    if (drawRoomNumbers) {
        for (const { room, x, y } of roomCoords) {
            const baseX = (x - minX) * overlapX * cellSize
            const baseY = (y - minY) * overlapY * cellSize
            drawRoomLabel(rgbPixels, width, height, room.toString(), baseX + 8, baseY + 8)
        }
    }

    return {
        width,
        height,
        png: encodeRgbPng(width, height, rgbPixels)
    }
}

function main() {
    const rawArgs = process.argv.slice(2)
    const highlightConnections = rawArgs.includes("--highlight-connections")
    const drawRoomNumbers = rawArgs.includes("--draw-room-numbers")
    const args = rawArgs.filter((arg) => arg !== "--highlight-connections" && arg !== "--draw-room-numbers")
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

    const rendered = renderMergedGrid(roomCoords, roomGridsByRoom, cellSize, highlightConnections, drawRoomNumbers)
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, Buffer.from(rendered.png))
    console.log(`Wrote ${outputPath} (${rendered.width}x${rendered.height})`)
}

main()
