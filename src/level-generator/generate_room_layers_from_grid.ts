import * as fs from "fs"
import * as path from "path"
import { encodeIndexedPng } from "../indexed-png"
import { resolveDefaultCollisionDir, resolveDefaultGeneratedLevelDir } from "./generation-config"

const WIDTH = 256
const HEIGHT = 224
const CELL_W = 16
const CELL_H = 36
const TRANSPARENT = 0xFF
const EXPOSED_EDGE_SHADE_PX = 10
const TOP_EDGE_OVERHANG_PX = 4
const BACK_FILL = 1
const BACK_SHADE = 2
const FRONT_SHADE = 129

type Color = { r: number, g: number, b: number }

function parseGrid(filePath: string) {
    const rows: number[][] = []
    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/)
    for (const line of lines) {
        const match = line.match(/^\|\s+\d+\s+\|\s+(.+?)\s+\|$/)
        if (!match) {
            continue
        }
        rows.push(match[1].trim().split(/\s+/).map(Number))
    }
    return rows
}

function isSolid(grid: number[][], cx: number, cy: number) {
    if (cy < 0 || cy >= grid.length || cx < 0 || cx >= grid[0].length) {
        return false
    }
    return grid[cy][cx] === 1
}

function isWhiteNeighbor(grid: number[][], cx: number, cy: number, dx: number, dy: number) {
    const nx = cx + dx
    const ny = cy + dy
    if (ny < 0 || ny >= grid.length || nx < 0 || nx >= grid[ny].length) {
        return false
    }
    return !isSolid(grid, nx, ny)
}

function getVisibleCellRect(grid: number[][], cx: number, cy: number) {
    const cols = grid[cy].length
    const rows = grid.length
    if (cols !== 16) {
        throw new Error(`Expected a 16-column collision grid, got ${cols}`)
    }
    if (rows !== 7) {
        throw new Error(`Expected a 7-row collision grid, got ${rows}`)
    }

    const x = cx * CELL_W
    const y = cy * CELL_H
    const nextX = x + CELL_W
    const nextY = Math.min(HEIGHT, y + CELL_H)

    return {
        x,
        y,
        w: nextX - x,
        h: nextY - y,
    }
}

function rect(buffer: Uint8Array, x: number, y: number, w: number, h: number, value: number) {
    const x0 = Math.max(0, x)
    const y0 = Math.max(0, y)
    const x1 = Math.min(WIDTH, x + w)
    const y1 = Math.min(HEIGHT, y + h)
    for (let yy = y0; yy < y1; ++yy) {
        for (let xx = x0; xx < x1; ++xx) {
            buffer[yy * WIDTH + xx] = value
        }
    }
}

function line(buffer: Uint8Array, x0: number, y0: number, x1: number, y1: number, value: number) {
    let dx = Math.abs(x1 - x0)
    let sx = x0 < x1 ? 1 : -1
    let dy = -Math.abs(y1 - y0)
    let sy = y0 < y1 ? 1 : -1
    let err = dx + dy
    while (true) {
        if (x0 >= 0 && x0 < WIDTH && y0 >= 0 && y0 < HEIGHT) {
            buffer[y0 * WIDTH + x0] = value
        }
        if (x0 === x1 && y0 === y1) {
            break
        }
        const e2 = err * 2
        if (e2 >= dy) {
            err += dy
            x0 += sx
        }
        if (e2 <= dx) {
            err += dx
            y0 += sy
        }
    }
}

function createPalette() {
    const palette = new Array<Color>(256).fill(null).map(() => ({ r: 0, g: 0, b: 0 }))
    const alpha = new Uint8Array(256)
    alpha.fill(255)
    alpha[TRANSPARENT] = 0

    palette[0] = { r: 255, g: 255, b: 255 }
    palette[1] = { r: 0, g: 0, b: 0 }
    palette[2] = { r: 128, g: 128, b: 128 }
    palette[128] = { r: 255, g: 255, b: 255 }
    palette[129] = { r: 128, g: 128, b: 128 }

    return { palette, alpha }
}

function renderRoom(grid: number[][]) {
    const backPixels = new Uint8Array(WIDTH * HEIGHT)
    const frontPixels = new Uint8Array(WIDTH * HEIGHT)
    backPixels.fill(0)
    frontPixels.fill(TRANSPARENT)

    for (let cy = 0; cy < grid.length; ++cy) {
        for (let cx = 0; cx < grid[cy].length; ++cx) {
            if (!isSolid(grid, cx, cy)) {
                continue
            }
            const cell = getVisibleCellRect(grid, cx, cy)
            const topOpen = isWhiteNeighbor(grid, cx, cy, 0, -1)
            const leftOpen = isWhiteNeighbor(grid, cx, cy, -1, 0)

            rect(backPixels, cell.x, cell.y, cell.w, cell.h, BACK_FILL)

            if (topOpen && cell.y > 0) {
                const topEdgeHeight = Math.min(TOP_EDGE_OVERHANG_PX, cell.y)
                rect(backPixels, cell.x, cell.y - topEdgeHeight, cell.w, topEdgeHeight, BACK_SHADE)
                rect(frontPixels, cell.x, cell.y - topEdgeHeight, cell.w, topEdgeHeight, FRONT_SHADE)
            }
            if (leftOpen) {
                rect(backPixels, cell.x, cell.y, Math.min(EXPOSED_EDGE_SHADE_PX, cell.w), cell.h, BACK_SHADE)
            }
        }
    }

    return { backPixels, frontPixels }
}

function getRoomNumbers(collisionDir: string): number[] {
    return fs.readdirSync(collisionDir)
        .filter((name) => /^room-\d{2}-grid\.txt$/.test(name))
        .map((name) => Number(/room-(\d{2})-grid\.txt$/.exec(name)![1]))
        .sort((a, b) => a - b)
}

function printUsage() {
    console.error("Usage: npx ts-node --transpile-only ./src/level-generator/generate_room_layers_from_grid.ts <collisionDir> [outputDir] [room|all]")
}

function main() {
    const args = process.argv.slice(2)
    if (args.length < 1 || args.length > 3) {
        printUsage()
        process.exit(1)
    }

    const collisionDir = path.resolve(args[0] || resolveDefaultCollisionDir("level10"))
    let outputDirArg = ""
    let roomArg = "all"

    if (args.length === 2) {
        if (args[1] === "all" || /^\d+$/.test(args[1])) {
            roomArg = args[1]
        } else {
            outputDirArg = args[1]
        }
    } else if (args.length === 3) {
        outputDirArg = args[1]
        roomArg = args[2]
    }

    const collisionLevelName = path.basename(collisionDir)
    const outputDir = path.resolve(outputDirArg || resolveDefaultGeneratedLevelDir(collisionLevelName))
    const levelName = path.basename(outputDir)

    const rooms = roomArg === "all"
        ? getRoomNumbers(collisionDir)
        : [Number(roomArg)]

    if (rooms.length === 0) {
        throw new Error(`No room grids found in '${collisionDir}'`)
    }

    const { palette, alpha } = createPalette()
    fs.mkdirSync(outputDir, { recursive: true })

    for (let i = 0; i < rooms.length; ++i) {
        const room = rooms[i]
        if (!Number.isInteger(room)) {
            throw new Error(`Invalid room number '${roomArg}'`)
        }
        const gridPath = path.join(collisionDir, `room-${room.toString().padStart(2, "0")}-grid.txt`)
        if (!fs.existsSync(gridPath)) {
            throw new Error(`Missing room grid '${gridPath}'`)
        }
        const grid = parseGrid(gridPath)
        const { backPixels, frontPixels } = renderRoom(grid)
        const roomBaseName = `${levelName}-room${room}`

        fs.writeFileSync(
            path.join(outputDir, `${roomBaseName}-backlayer.png`),
            Buffer.from(encodeIndexedPng(WIDTH, HEIGHT, backPixels, palette, alpha))
        )
        fs.writeFileSync(
            path.join(outputDir, `${roomBaseName}-frontlayer.png`),
            Buffer.from(encodeIndexedPng(WIDTH, HEIGHT, frontPixels, palette, alpha))
        )
    }
}

main()
