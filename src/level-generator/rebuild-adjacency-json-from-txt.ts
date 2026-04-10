import * as fs from "fs"
import * as path from "path"

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

type CoordByRoom = {
    [room: number]: Coord
}

function printUsage() {
    console.error("Usage: npx ts-node --transpile-only ./src/tools/level-generator/rebuild-adjacency-json-from-txt.ts <input-adjacency.txt> <output-adjacency.json>")
}

function parseLevelName(text: string, fallbackPath: string): string {
    const match = text.match(/^===\s+(.+?)\s+===/m)
    if (match) {
        return match[1]
    }
    return path.basename(fallbackPath).replace(/-ct-adjacency\.txt$/i, "")
}

function extractFixedCells(row: string, width: number): string[] {
    const step = 5
    const normalized = row.startsWith(" ") ? row : ` ${row}`
    const cells: string[] = []
    for (let i = 0; i < width; ++i) {
        const start = 1 + i * step
        cells.push(normalized.slice(start, start + 4))
    }
    return cells
}

function parseComponentRows(lines: string[], startIndex: number): { nextIndex: number, coordsByRoom: CoordByRoom } {
    const coordsByRoom: CoordByRoom = {}
    let index = startIndex

    while (index < lines.length && !/^\+[-+]+$/.test(lines[index])) {
        index += 1
    }
    if (index >= lines.length) {
        return { nextIndex: index, coordsByRoom }
    }

    const headerLine = lines[index + 1] || ""
    const headerMatch = /^\|\s*y\s*\|\s*(.*?)\s*\|$/.exec(headerLine)
    const width = headerMatch ? headerMatch[1].trim().split(/\s+/).length : 0

    index += 3

    for (; index < lines.length; ++index) {
        const line = lines[index]
        if (/^\+[-+]+$/.test(line)) {
            return { nextIndex: index + 1, coordsByRoom }
        }
        const match = /^\|\s*(\d+)\s*\|\s*(.*?)\s*\|$/.exec(line)
        if (!match) {
            continue
        }
        const y = Number(match[1])
        const cells = extractFixedCells(match[2], width)
        for (let x = 0; x < cells.length; ++x) {
            const token = cells[x].trim()
            if (!/^\d+$/.test(token)) {
                continue
            }
            coordsByRoom[Number(token)] = { x, y }
        }
    }

    return { nextIndex: index, coordsByRoom }
}

function parseAdjacencyTxt(text: string, filePath: string): { level: string, rooms: RoomAdjacency[] } {
    const level = parseLevelName(text, filePath)
    const lines = text.split(/\r?\n/)
    const globalCoords: CoordByRoom = {}

    for (let i = 0; i < lines.length; ++i) {
        if (!/^Component\s+\d+/.test(lines[i])) {
            continue
        }
        const parsed = parseComponentRows(lines, i + 1)
        const componentRooms = Object.keys(parsed.coordsByRoom).map(Number)
        for (let j = 0; j < componentRooms.length; ++j) {
            const room = componentRooms[j]
            globalCoords[room] = parsed.coordsByRoom[room]
        }
        i = parsed.nextIndex - 1
    }

    const roomNumbers = Object.keys(globalCoords).map(Number).sort((a, b) => a - b)
    const byCoord: { [coord: string]: number } = {}
    for (let i = 0; i < roomNumbers.length; ++i) {
        const room = roomNumbers[i]
        const coord = globalCoords[room]
        byCoord[`${coord.x},${coord.y}`] = room
    }

    const rooms: RoomAdjacency[] = roomNumbers.map((room) => {
        const coord = globalCoords[room]
        return {
            room,
            up: byCoord[`${coord.x},${coord.y - 1}`] || 0,
            down: byCoord[`${coord.x},${coord.y + 1}`] || 0,
            left: byCoord[`${coord.x - 1},${coord.y}`] || 0,
            right: byCoord[`${coord.x + 1},${coord.y}`] || 0,
        }
    })

    return { level, rooms }
}

function main() {
    const args = process.argv.slice(2)
    if (args.length !== 2) {
        printUsage()
        process.exit(1)
    }

    const inputPath = path.resolve(args[0])
    const outputPath = path.resolve(args[1])
    const text = fs.readFileSync(inputPath, "utf8")
    const parsed = parseAdjacencyTxt(text, inputPath)
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, JSON.stringify(parsed, null, 2) + "\n", "utf8")

    console.log(`Wrote ${outputPath}`)
    console.log("Rebuilt adjacency JSON from rendered TXT map.")
    console.log("This reconstruction is lossy: it only infers direct cardinal neighbors from the visible room layout.")
}

main()

export { parseAdjacencyTxt }
