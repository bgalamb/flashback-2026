import * as fs from "fs"
import * as path from "path"
import { DEFAULT_LEVEL_GENERATOR_OUTPUT_ROOT, resolveDefaultValidatedCollisionDir } from "./generation-config"
import { analyzeAdjacencyConsistency, analyzeGrid, repairCluster, renderGrid } from "./room-grid-validity-checker"

type FloorRule = {
    name: "top" | "middle" | "bottom"
    clearanceRow: number
    supportRow: number
}

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

type GeneratedAdjacencyFile = {
    level: string
    rooms: RoomAdjacency[]
}

type VerticalTransitionPlan = Map<number, number[]>

type GenerationOptions = {
    preferOpenAreas: boolean
    generationAttempts: number
    repairMaxDepth?: number
    repairMaxNodes?: number
}

const TOP_FLOOR: FloorRule = { name: "top", clearanceRow: 1, supportRow: 2 }
const MIDDLE_FLOOR: FloorRule = { name: "middle", clearanceRow: 3, supportRow: 4 }
const BOTTOM_FLOOR: FloorRule = { name: "bottom", clearanceRow: 5, supportRow: 6 }
const FLOOR_RULES: FloorRule[] = [TOP_FLOOR, MIDDLE_FLOOR, BOTTOM_FLOOR]

function isStableStandingCell(grid: number[][], x: number, y: number): boolean {
    return FLOOR_RULES.some((rule) => rule.clearanceRow === y && grid[y][x] === 0 && grid[rule.supportRow][x] === 1)
}

function printUsage() {
    console.error("Usage: npx ts-node --transpile-only ./src/level-generator/generate-validated-room-collisions.ts [--prefer-open-areas] [--generation-attempts=1200] [--repair-max-depth=6] [--repair-max-nodes=40000] <inputDir> [outputDir] [seed]")
    console.error(`Default output root: ${DEFAULT_LEVEL_GENERATOR_OUTPUT_ROOT}`)
}

function getRoomNumbers(inputDir: string): number[] {
    return fs.readdirSync(inputDir)
        .filter((name) => /^room-\d{2}-grid\.txt$/.test(name))
        .map((name) => Number(/room-(\d{2})-grid\.txt$/.exec(name)![1]))
        .sort((a, b) => a - b)
}

function loadExistingAdjacency(inputDir: string, inputLevelName: string, roomNumbers: number[]): RoomAdjacency[] | null {
    const parentLevelName = path.basename(path.dirname(inputDir))
    const candidateLevelNames = Array.from(new Set([inputLevelName, parentLevelName]))
    const candidatePaths = [
        ...candidateLevelNames.map((levelName) => path.join(inputDir, `${levelName}-ct-adjacency.json`)),
        ...candidateLevelNames.map((levelName) => path.join(path.dirname(inputDir), `${levelName}-ct-adjacency.json`)),
    ]

    for (const filePath of candidatePaths) {
        if (!fs.existsSync(filePath)) {
            continue
        }
        const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as GeneratedAdjacencyFile
        if (!parsed || !Array.isArray(parsed.rooms)) {
            continue
        }
        const byRoom = new Map<number, RoomAdjacency>()
        for (const row of parsed.rooms) {
            if (typeof row.room !== "number") {
                continue
            }
            byRoom.set(row.room, {
                room: row.room,
                up: Number(row.up) || 0,
                down: Number(row.down) || 0,
                left: Number(row.left) || 0,
                right: Number(row.right) || 0,
            })
        }
        const rows = roomNumbers.map((room) => byRoom.get(room)).filter((row): row is RoomAdjacency => Boolean(row))
        if (rows.length === roomNumbers.length) {
            return rows
        }
    }

    return null
}

function hashString(text: string): number {
    let hash = 2166136261
    for (let i = 0; i < text.length; ++i) {
        hash ^= text.charCodeAt(i)
        hash = Math.imul(hash, 16777619)
    }
    return hash >>> 0
}

function createRng(seed: number) {
    let state = seed >>> 0
    return function next() {
        state = (state + 0x6D2B79F5) >>> 0
        let t = Math.imul(state ^ (state >>> 15), 1 | state)
        t ^= t + Math.imul(t ^ (t >>> 7), 61 | t)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

function shuffle<T>(items: T[], rnd: () => number): T[] {
    const out = items.slice()
    for (let i = out.length - 1; i > 0; --i) {
        const j = Math.floor(rnd() * (i + 1))
        const tmp = out[i]
        out[i] = out[j]
        out[j] = tmp
    }
    return out
}

function createEmptyAdjacency(roomNumbers: number[]): RoomAdjacency[] {
    return roomNumbers.map((room) => ({ room, up: 0, down: 0, left: 0, right: 0 }))
}

function generateRandomAdjacency(roomNumbers: number[], rnd: () => number): { rows: RoomAdjacency[], coords: CoordByRoom } {
    const rows = createEmptyAdjacency(roomNumbers)
    const byRoom: { [room: number]: RoomAdjacency } = {}
    for (let i = 0; i < rows.length; ++i) {
        byRoom[rows[i].room] = rows[i]
    }

    const shuffled = shuffle(roomNumbers, rnd)
    const coords: CoordByRoom = {}
    const occupied: { [key: string]: number } = {}
    coords[shuffled[0]] = { x: 0, y: 0 }
    occupied["0,0"] = shuffled[0]

    const deltas: Array<{ dir: "up" | "down" | "left" | "right", dx: number, dy: number, opposite: "up" | "down" | "left" | "right" }> = [
        { dir: "up", dx: 0, dy: -1, opposite: "down" },
        { dir: "down", dx: 0, dy: 1, opposite: "up" },
        { dir: "left", dx: -1, dy: 0, opposite: "right" },
        { dir: "right", dx: 1, dy: 0, opposite: "left" },
    ]

    for (let i = 1; i < shuffled.length; ++i) {
        const room = shuffled[i]
        const placedRooms = Object.keys(coords).map(Number)
        const candidates: Array<{ anchor: number, dir: "up" | "down" | "left" | "right", opposite: "up" | "down" | "left" | "right", x: number, y: number }> = []

        for (let j = 0; j < placedRooms.length; ++j) {
            const anchor = placedRooms[j]
            const coord = coords[anchor]
            for (let k = 0; k < deltas.length; ++k) {
                const delta = deltas[k]
                const x = coord.x + delta.dx
                const y = coord.y + delta.dy
                const key = `${x},${y}`
                if (occupied[key]) {
                    continue
                }
                if (byRoom[anchor][delta.dir] !== 0) {
                    continue
                }
                candidates.push({ anchor, dir: delta.dir, opposite: delta.opposite, x, y })
            }
        }

        if (candidates.length === 0) {
            throw new Error("Failed to generate random adjacency placement")
        }

        const chosen = candidates[Math.floor(rnd() * candidates.length)]
        coords[room] = { x: chosen.x, y: chosen.y }
        occupied[`${chosen.x},${chosen.y}`] = room
        byRoom[chosen.anchor][chosen.dir] = room
        byRoom[room][chosen.opposite] = chosen.anchor
    }

    const coordinateKeys = Object.keys(occupied)
    for (let i = 0; i < coordinateKeys.length; ++i) {
        const key = coordinateKeys[i]
        const room = occupied[key]
        const coord = coords[room]
        const rightNeighbor = occupied[`${coord.x + 1},${coord.y}`]
        const downNeighbor = occupied[`${coord.x},${coord.y + 1}`]

        if (rightNeighbor && byRoom[room].right === 0 && byRoom[rightNeighbor].left === 0 && rnd() < 0.3) {
            byRoom[room].right = rightNeighbor
            byRoom[rightNeighbor].left = room
        }
        if (downNeighbor && byRoom[room].down === 0 && byRoom[downNeighbor].up === 0 && rnd() < 0.2) {
            byRoom[room].down = downNeighbor
            byRoom[downNeighbor].up = room
        }
    }

    return { rows, coords }
}

function createSolidRow(width: number): number[] {
    return new Array(width).fill(1)
}

function createOpenRow(width: number): number[] {
    return new Array(width).fill(0)
}

function getVerticalTransitionComponents(rows: RoomAdjacency[]): number[][] {
    const byRoom = new Map<number, RoomAdjacency>()
    for (const row of rows) {
        byRoom.set(row.room, row)
    }

    const verticalRooms = rows
        .filter((row) => row.up > 0 || row.down > 0)
        .map((row) => row.room)

    const visited = new Set<number>()
    const components: number[][] = []
    for (const room of verticalRooms) {
        if (visited.has(room)) {
            continue
        }
        const queue = [room]
        const component: number[] = []
        visited.add(room)
        while (queue.length > 0) {
            const current = queue.shift()!
            component.push(current)
            const row = byRoom.get(current)
            if (!row) {
                continue
            }
            for (const nextRoom of [row.up, row.down]) {
                if (nextRoom > 0 && !visited.has(nextRoom)) {
                    visited.add(nextRoom)
                    queue.push(nextRoom)
                }
            }
        }
        component.sort((a, b) => a - b)
        components.push(component)
    }
    return components
}

function createVerticalTransitionPlan(rows: RoomAdjacency[], seed: number): VerticalTransitionPlan {
    const plan: VerticalTransitionPlan = new Map()
    const candidateStarts = [4, 6, 8, 10]
    for (const component of getVerticalTransitionComponents(rows)) {
        const componentSeed = hashString(`${seed}:${component.join(",")}`)
        const startX = candidateStarts[componentSeed % candidateStarts.length]
        const columns = [startX, startX + 1]
        for (const room of component) {
            plan.set(room, columns.slice())
        }
    }
    return plan
}

function carveFloor(grid: number[][], rule: FloorRule, startX: number, endX: number) {
    for (let x = startX; x <= endX; ++x) {
        grid[rule.clearanceRow][x] = 0
        grid[rule.supportRow][x] = 1
    }
}

function getStableColumns(grid: number[][], rule: FloorRule): number[] {
    const columns: number[] = []
    for (let x = 0; x < grid[0].length; ++x) {
        if (grid[rule.clearanceRow][x] === 0 && grid[rule.supportRow][x] === 1) {
            columns.push(x)
        }
    }
    return columns
}

function toSpans(columns: number[]): Array<{ startX: number, endX: number }> {
    if (columns.length === 0) {
        return []
    }
    const spans: Array<{ startX: number, endX: number }> = []
    let startX = columns[0]
    let endX = columns[0]
    for (let i = 1; i < columns.length; ++i) {
        const x = columns[i]
        if (x === endX + 1) {
            endX = x
            continue
        }
        spans.push({ startX, endX })
        startX = x
        endX = x
    }
    spans.push({ startX, endX })
    return spans
}

function normalizeSolidRunParity(grid: number[][]) {
    for (let y = 0; y < grid.length; ++y) {
        for (;;) {
            const solidColumns: number[] = []
            for (let x = 0; x < grid[y].length; ++x) {
                if (grid[y][x] === 1) {
                    solidColumns.push(x)
                }
            }
            const oddSpan = toSpans(solidColumns).find((span) => ((span.endX - span.startX + 1) % 2) === 1)
            if (!oddSpan) {
                break
            }

            const tryRight = oddSpan.endX + 1
            const tryLeft = oddSpan.startX - 1

            if (tryRight < grid[y].length) {
                grid[y][tryRight] = 1
                continue
            }
            if (tryLeft >= 0) {
                grid[y][tryLeft] = 1
                continue
            }

            grid[y][oddSpan.endX] = 0
        }
    }
}

function normalizeOneStepObstacles(grid: number[][]) {
    for (;;) {
        let changed = false
        for (let x = 0; x < grid[0].length - 1; ++x) {
            const leftTopRows: number[] = []
            const rightTopRows: number[] = []
            for (let y = 0; y < grid.length; ++y) {
                if (grid[y][x] === 1 && (y === 0 || grid[y - 1][x] === 0)) {
                    leftTopRows.push(y)
                }
                if (grid[y][x + 1] === 1 && (y === 0 || grid[y - 1][x + 1] === 0)) {
                    rightTopRows.push(y)
                }
            }
            for (const leftTopY of leftTopRows) {
                for (const rightTopY of rightTopRows) {
                    if (Math.abs(leftTopY - rightTopY) !== 1) {
                        continue
                    }
                    const raisedToY = Math.min(leftTopY, rightTopY)
                    const targetX = leftTopY > rightTopY ? x : (x + 1)
                    if (grid[raisedToY][targetX] !== 1) {
                        grid[raisedToY][targetX] = 1
                        changed = true
                    }
                }
            }
        }
        if (!changed) {
            break
        }
    }
}

function normalizeFakeShelves(grid: number[][]) {
    for (let y = 1; y < grid.length - 1; ++y) {
        for (let x = 0; x < grid[y].length; ++x) {
            if (grid[y][x] !== 1 || grid[y - 1][x] !== 0 || grid[y + 1][x] !== 0) {
                continue
            }
            const isValidSupport = FLOOR_RULES.some((rule) => rule.supportRow === y && grid[rule.clearanceRow][x] === 0)
            if (!isValidSupport) {
                grid[y][x] = 0
            }
        }
    }
}

function fillEnclosedVoidRegionsInGrid(grid: number[][]) {
    const height = grid.length
    const width = grid[0].length
    const visited = new Set<string>()

    for (let startY = 0; startY < height; ++startY) {
        for (let startX = 0; startX < width; ++startX) {
            const key = `${startX},${startY}`
            if (grid[startY][startX] !== 0 || visited.has(key)) {
                continue
            }

            const queue: Array<{ x: number, y: number }> = [{ x: startX, y: startY }]
            const cells: Array<{ x: number, y: number }> = []
            let touchesBoundary = false
            let minY = startY
            let maxY = startY
            visited.add(key)

            while (queue.length > 0) {
                const cell = queue.shift()!
                cells.push(cell)
                minY = Math.min(minY, cell.y)
                maxY = Math.max(maxY, cell.y)
                if (cell.x === 0 || cell.x === width - 1 || cell.y === 0 || cell.y === height - 1) {
                    touchesBoundary = true
                }

                const neighbors = [
                    { x: cell.x - 1, y: cell.y },
                    { x: cell.x + 1, y: cell.y },
                    { x: cell.x, y: cell.y - 1 },
                    { x: cell.x, y: cell.y + 1 },
                ]
                for (const neighbor of neighbors) {
                    if (neighbor.x < 0 || neighbor.x >= width || neighbor.y < 0 || neighbor.y >= height) {
                        continue
                    }
                    const neighborKey = `${neighbor.x},${neighbor.y}`
                    if (grid[neighbor.y][neighbor.x] !== 0 || visited.has(neighborKey)) {
                        continue
                    }
                    visited.add(neighborKey)
                    queue.push(neighbor)
                }
            }

            if (!touchesBoundary && maxY > 1) {
                for (const cell of cells) {
                    grid[cell.y][cell.x] = 1
                }
            }
        }
    }
}

function spansOverlapEnough(a: { startX: number, endX: number }, b: { startX: number, endX: number }): boolean {
    return Math.max(0, Math.min(a.endX, b.endX) - Math.max(a.startX, b.startX) + 1) >= 2
}

function horizontalGap(a: { startX: number, endX: number }, b: { startX: number, endX: number }): number {
    const overlapWidth = Math.max(0, Math.min(a.endX, b.endX) - Math.max(a.startX, b.startX) + 1)
    if (overlapWidth > 0) {
        return 0
    }
    if (a.endX < b.startX) {
        return b.startX - a.endX - 1
    }
    return a.startX - b.endX - 1
}

function ensureUpperFloorReachability(grid: number[][], upperRule: FloorRule, lowerRule: FloorRule) {
    const upperSpans = toSpans(getStableColumns(grid, upperRule))
    const lowerSpans = toSpans(getStableColumns(grid, lowerRule))
    for (const upperSpan of upperSpans) {
        if (lowerSpans.some((lowerSpan) => spansOverlapEnough(upperSpan, lowerSpan))) {
            continue
        }
        carveFloor(grid, lowerRule, upperSpan.startX, upperSpan.endX)
    }
}

function normalizeUpperFloorReachability(grid: number[][]) {
    ensureUpperFloorReachability(grid, MIDDLE_FLOOR, BOTTOM_FLOOR)
    ensureUpperFloorReachability(grid, TOP_FLOOR, MIDDLE_FLOOR)
}

function sealReachableOpenBottomSpansWithoutDownExit(grid: number[][]) {
    const openBottomColumns: number[] = []
    for (let x = 0; x < grid[0].length; ++x) {
        if (grid[BOTTOM_FLOOR.supportRow][x] === 0) {
            openBottomColumns.push(x)
        }
    }

    const openBottomSpans = toSpans(openBottomColumns)
    const bottomSpans = toSpans(getStableColumns(grid, BOTTOM_FLOOR))
    for (const openSpan of openBottomSpans) {
        if (!bottomSpans.some((bottomSpan) => horizontalGap(openSpan, bottomSpan) === 0)) {
            continue
        }
        for (let x = openSpan.startX; x <= openSpan.endX; ++x) {
            grid[BOTTOM_FLOOR.supportRow][x] = 1
        }
    }
}

function normalizeReachabilityAndParity(grid: number[][]) {
    for (let i = 0; i < 4; ++i) {
        normalizeUpperFloorReachability(grid)
        normalizeFakeShelves(grid)
        normalizeOneStepObstacles(grid)
        fillEnclosedVoidRegionsInGrid(grid)
        normalizeSolidRunParity(grid)
    }
}

function addRandomSpan(grid: number[][], rule: FloorRule, rnd: () => number, minWidth: number, maxWidth: number) {
    const candidateWidths: number[] = []
    for (let width = minWidth; width <= maxWidth; ++width) {
        if ((width % 2) === 0) {
            candidateWidths.push(width)
        }
    }
    const width = candidateWidths[Math.floor(rnd() * candidateWidths.length)]
    const minStartX = 1
    const maxStartX = Math.max(minStartX, 14 - width)
    const startX = minStartX + Math.floor(rnd() * (maxStartX - minStartX + 1))
    carveFloor(grid, rule, startX, startX + width - 1)
}

function clearUpperFloorEdges(grid: number[][]) {
    grid[TOP_FLOOR.supportRow][0] = 0
    grid[TOP_FLOOR.supportRow][15] = 0
    grid[MIDDLE_FLOOR.supportRow][0] = 0
    grid[MIDDLE_FLOOR.supportRow][15] = 0
}

function closeBottomSideWithoutAdjacency(grid: number[][], side: "left" | "right") {
    const columns = side === "left" ? [0, 1] : [14, 15]
    for (const x of columns) {
        grid[BOTTOM_FLOOR.clearanceRow][x] = 1
        grid[BOTTOM_FLOOR.supportRow][x] = 1
    }
}

function carveExactSpan(grid: number[][], rule: FloorRule, columns: number[]) {
    if (columns.length === 0) {
        return
    }
    const startX = Math.min(...columns)
    const endX = Math.max(...columns)
    carveFloor(grid, rule, startX, endX)
}

function carveOpenBiasedBottomFloor(grid: number[][], adjacency: RoomAdjacency, verticalColumns: number[], rnd: () => number) {
    const leftWidth = adjacency.left > 0 ? 4 : 0
    const rightWidth = adjacency.right > 0 ? 4 : 0
    const hasVertical = verticalColumns.length > 0

    if (leftWidth > 0) {
        carveFloor(grid, BOTTOM_FLOOR, 0, leftWidth - 1)
    }
    if (rightWidth > 0) {
        carveFloor(grid, BOTTOM_FLOOR, 16 - rightWidth, 15)
    }
    if (hasVertical) {
        const startX = Math.max(2, verticalColumns[0] - 1)
        const endX = Math.min(13, verticalColumns[verticalColumns.length - 1] + 1)
        carveFloor(grid, BOTTOM_FLOOR, startX, endX)
    }
    if (leftWidth === 0 && rightWidth === 0 && !hasVertical) {
        const width = rnd() < 0.5 ? 4 : 6
        const startX = width === 4 ? 6 : 5
        carveFloor(grid, BOTTOM_FLOOR, startX, startX + width - 1)
    }
}

function createRandomGrid(room: number, adjacency: RoomAdjacency, verticalPlan: VerticalTransitionPlan, rnd: () => number, options: GenerationOptions): number[][] {
    const grid: number[][] = [
        createSolidRow(16),
        createOpenRow(16),
        createOpenRow(16),
        createOpenRow(16),
        createOpenRow(16),
        createOpenRow(16),
        createOpenRow(16),
    ]

    const verticalColumns = verticalPlan.get(room) || []
    const hasVertical = adjacency.up > 0 || adjacency.down > 0
    const hasThroughShaft = adjacency.up > 0 && adjacency.down > 0

    if (options.preferOpenAreas) {
        carveOpenBiasedBottomFloor(grid, adjacency, verticalColumns, rnd)
    } else {
        const bottomStartX = adjacency.left > 0 ? 0 : 2
        const bottomEndX = adjacency.right > 0 ? 15 : 13
        carveFloor(grid, BOTTOM_FLOOR, bottomStartX, bottomEndX)
    }
    if (adjacency.left <= 0) {
        closeBottomSideWithoutAdjacency(grid, "left")
    }
    if (adjacency.right <= 0) {
        closeBottomSideWithoutAdjacency(grid, "right")
    }

    if (adjacency.up > 0 && verticalColumns.length > 0) {
        for (const x of verticalColumns) {
            grid[0][x] = 0
        }
        carveExactSpan(grid, TOP_FLOOR, verticalColumns)
    }

    if (adjacency.down > 0 && verticalColumns.length > 0) {
        for (const x of verticalColumns) {
            grid[6][x] = 0
        }
    }

    if (hasThroughShaft && verticalColumns.length > 0) {
        const middleStartX = options.preferOpenAreas
            ? Math.max(2, verticalColumns[0] - 1)
            : (adjacency.left > 0 ? 0 : 2)
        const middleEndX = options.preferOpenAreas
            ? Math.min(13, verticalColumns[verticalColumns.length - 1] + 1)
            : (adjacency.right > 0 ? 15 : 13)
        carveFloor(grid, MIDDLE_FLOOR, middleStartX, middleEndX)
    } else if (adjacency.up > 0 && verticalColumns.length > 0) {
        const middleStartX = Math.max(2, verticalColumns[0] - 1)
        const middleEndX = Math.min(13, verticalColumns[verticalColumns.length - 1] + 1)
        carveFloor(grid, MIDDLE_FLOOR, middleStartX, middleEndX)
    } else if (!hasVertical && rnd() < (options.preferOpenAreas ? 0.2 : 0.35)) {
        addRandomSpan(grid, MIDDLE_FLOOR, rnd, 4, options.preferOpenAreas ? 6 : 8)
    }

    if (!hasVertical && rnd() < (options.preferOpenAreas ? 0.1 : 0.2)) {
        const topStartX = options.preferOpenAreas
            ? (4 + Math.floor(rnd() * 3) * 2)
            : (4 + Math.floor(rnd() * 4) * 2)
        carveFloor(grid, TOP_FLOOR, topStartX, topStartX + 1)
        for (let x = topStartX; x <= topStartX + 1; ++x) {
            grid[0][x] = 0
        }
    }

    clearUpperFloorEdges(grid)
    normalizeReachabilityAndParity(grid)
    if (adjacency.left <= 0) {
        closeBottomSideWithoutAdjacency(grid, "left")
    }
    if (adjacency.right <= 0) {
        closeBottomSideWithoutAdjacency(grid, "right")
    }
    if (adjacency.down <= 0) {
        sealReachableOpenBottomSpansWithoutDownExit(grid)
    }

    return grid
}

function renderAdjacencyTable(levelName: string, rows: RoomAdjacency[]): string {
    const activeSet: { [room: number]: true } = {}
    const adjacencyByRoom: { [room: number]: RoomAdjacency } = {}
    for (let i = 0; i < rows.length; ++i) {
        const row = rows[i]
        adjacencyByRoom[row.room] = row
        const neighbors = [row.up, row.down, row.left, row.right]
        for (let j = 0; j < neighbors.length; ++j) {
            if (neighbors[j] > 0) {
                activeSet[row.room] = true
                activeSet[neighbors[j]] = true
            }
        }
    }

    const activeRooms = Object.keys(activeSet).map(Number).sort((a, b) => a - b)
    const lines: string[] = []
    lines.push(`=== ${levelName} ===`)
    lines.push("Spatial adjacency map (0-links ignored)")
    if (activeRooms.length === 0) {
        lines.push("No non-zero adjacency links found.")
        return lines.join("\n") + "\n"
    }

    const visited: { [room: number]: true } = {}
    const components: CoordByRoom[] = []
    for (let i = 0; i < activeRooms.length; ++i) {
        const start = activeRooms[i]
        if (visited[start]) {
            continue
        }
        const component: CoordByRoom = {}
        const queue: number[] = [start]
        visited[start] = true
        component[start] = { x: 0, y: 0 }

        for (let qi = 0; qi < queue.length; ++qi) {
            const room = queue[qi]
            const coord = component[room]
            const row = adjacencyByRoom[room]
            if (!row) {
                continue
            }
            const edges: Array<[number, number, number]> = [
                [row.up, 0, -1],
                [row.down, 0, 1],
                [row.left, -1, 0],
                [row.right, 1, 0],
            ]
            for (let j = 0; j < edges.length; ++j) {
                const edge = edges[j]
                const next = edge[0]
                if (!(next > 0) || !activeSet[next]) {
                    continue
                }
                if (!visited[next]) {
                    visited[next] = true
                    queue.push(next)
                }
                if (!component[next]) {
                    component[next] = { x: coord.x + edge[1], y: coord.y + edge[2] }
                }
            }
        }

        let minX = 0
        let minY = 0
        const componentRooms = Object.keys(component).map(Number)
        for (let j = 0; j < componentRooms.length; ++j) {
            const coord = component[componentRooms[j]]
            if (coord.x < minX) minX = coord.x
            if (coord.y < minY) minY = coord.y
        }
        if (minX !== 0 || minY !== 0) {
            for (let j = 0; j < componentRooms.length; ++j) {
                const room = componentRooms[j]
                const coord = component[room]
                component[room] = { x: coord.x - minX, y: coord.y - minY }
            }
        }
        components.push(component)
    }

    for (let i = 0; i < components.length; ++i) {
        const component = components[i]
        const componentRooms = Object.keys(component).map(Number)
        let maxX = 0
        let maxY = 0
        for (let j = 0; j < componentRooms.length; ++j) {
            const coord = component[componentRooms[j]]
            if (coord.x > maxX) maxX = coord.x
            if (coord.y > maxY) maxY = coord.y
        }
        const width = maxX + 1
        const height = maxY + 1
        const roomGrid: number[][] = new Array(height).fill(null).map(() => new Array(width).fill(-1))
        for (let j = 0; j < componentRooms.length; ++j) {
            const room = componentRooms[j]
            const coord = component[room]
            if (roomGrid[coord.y][coord.x] === -1) {
                roomGrid[coord.y][coord.x] = room
            }
        }

        const cellW = 4
        const yLabelW = Math.max(1, (height - 1).toString().length)
        const horizontal = "+" + "-".repeat(yLabelW + 2) + "+" + "-".repeat((cellW + 1) * width + 1) + "+"
        lines.push("")
        lines.push(`Component ${i + 1}`)
        lines.push(horizontal)
        const header = new Array(width).fill(0).map((_, x) => x.toString().padStart(cellW, " ")).join(" ")
        lines.push(`| ${"y".padStart(yLabelW, " ")} | ${header} |`)
        lines.push(horizontal)
        for (let y = 0; y < height; ++y) {
            const cells = roomGrid[y].map((room) => room < 0 ? " ".repeat(cellW) : room.toString().padStart(cellW, " ")).join(" ")
            lines.push(`| ${y.toString().padStart(yLabelW, " ")} | ${cells} |`)
        }
        lines.push(horizontal)
    }

    return lines.join("\n") + "\n"
}

function writeGeneratedDataset(outputDir: string, outputLevelName: string, roomNumbers: number[], adjacencyRows: RoomAdjacency[], rnd: () => number, verticalPlan: VerticalTransitionPlan, options: GenerationOptions) {
    fs.mkdirSync(outputDir, { recursive: true })
    for (let i = 0; i < roomNumbers.length; ++i) {
        const room = roomNumbers[i]
        const row = adjacencyRows.filter((entry) => entry.room === room)[0]
        const grid = createRandomGrid(room, row, verticalPlan, rnd, options)
        const outPath = path.join(outputDir, `room-${room.toString().padStart(2, "0")}-grid.txt`)
        fs.writeFileSync(outPath, renderGrid(`=== ${outputLevelName} room ${room} ===`, grid), "utf8")
    }

    const adjacencyFile: GeneratedAdjacencyFile = {
        level: outputLevelName,
        rooms: adjacencyRows
    }
    fs.writeFileSync(path.join(outputDir, `${outputLevelName}-ct-adjacency.json`), JSON.stringify(adjacencyFile, null, 2) + "\n", "utf8")
    fs.writeFileSync(path.join(outputDir, `${outputLevelName}-ct-adjacency.txt`), renderAdjacencyTable(outputLevelName, adjacencyRows), "utf8")
}

function getRoomGridPaths(outputDir: string, roomNumbers: number[]): string[] {
    return roomNumbers.map((room) => path.join(outputDir, `room-${room.toString().padStart(2, "0")}-grid.txt`))
}

function copyValidatedSourceDataset(inputDir: string, outputDir: string, outputLevelName: string, roomNumbers: number[], adjacencyRows: RoomAdjacency[]) {
    fs.mkdirSync(outputDir, { recursive: true })
    for (const room of roomNumbers) {
        const sourcePath = path.join(inputDir, `room-${room.toString().padStart(2, "0")}-grid.txt`)
        const outputPath = path.join(outputDir, `room-${room.toString().padStart(2, "0")}-grid.txt`)
        fs.copyFileSync(sourcePath, outputPath)
    }
    const adjacencyFile: GeneratedAdjacencyFile = {
        level: outputLevelName,
        rooms: adjacencyRows
    }
    fs.writeFileSync(path.join(outputDir, `${outputLevelName}-ct-adjacency.json`), JSON.stringify(adjacencyFile, null, 2) + "\n", "utf8")
    fs.writeFileSync(path.join(outputDir, `${outputLevelName}-ct-adjacency.txt`), renderAdjacencyTable(outputLevelName, adjacencyRows), "utf8")
}

function roomHasHeuristicFailure(filePath: string): boolean {
    const analysis = analyzeGrid(filePath)
    const hasAnyStandingSpace = analysis.floorAnalyses.some((floor) => floor.stableColumns.length > 0)
    const hasOddSolidRuns = analysis.oddSolidRunsByRow.some((spans) => spans.length > 0)
    const hasFakeShelves = analysis.fakeShelfRunsByRow.some((spans) => spans.length > 0)
    const hasOneStepObstacles = analysis.oneStepObstaclePairs.length > 0
    const hasEnclosedVoids = analysis.enclosedVoidRegions.length > 0
    return !analysis.hasExpectedShape ||
        !analysis.hasOnlyBinaryValues ||
        !hasAnyStandingSpace ||
        analysis.misalignedTopFloor.columns.length > 0 ||
        hasOddSolidRuns ||
        hasFakeShelves ||
        hasOneStepObstacles ||
        hasEnclosedVoids
}

function datasetPassesAllRules(roomPaths: string[]): boolean {
    const adjacency = analyzeAdjacencyConsistency(roomPaths)
    if (!adjacency) {
        return false
    }
    if (
        adjacency.horizontalMismatches.length > 0 ||
        adjacency.horizontalTraversalMismatches.length > 0 ||
        adjacency.lethalSideExitMismatches.length > 0 ||
        adjacency.verticalEdgeMismatches.length > 0 ||
        adjacency.blockedTopClimbMismatches.length > 0 ||
        adjacency.unsafeVerticalDrops.length > 0 ||
        adjacency.verticalFallLandingMismatches.length > 0 ||
        adjacency.lethalBottomPitMismatches.length > 0 ||
        adjacency.disconnectedVerticalPassages.length > 0 ||
        adjacency.verticalWarnings.length > 0 ||
        adjacency.unreachablePlatforms.length > 0 ||
        adjacency.globallyUnreachableRooms.length > 0
    ) {
        return false
    }

    for (const filePath of roomPaths) {
        if (roomHasHeuristicFailure(filePath)) {
            return false
        }
    }
    return true
}

function validateAndRepairGeneratedDataset(outputDir: string, roomNumbers: number[], adjacencyRows: RoomAdjacency[], options: GenerationOptions): boolean {
    const roomPaths = getRoomGridPaths(outputDir, roomNumbers)
    const adjacency = analyzeAdjacencyConsistency(roomPaths)
    if (!adjacency) {
        return false
    }

    const targetKeys = new Set<string>()
    const repairTargets: number[][] = []
    const pushTarget = (rooms: number[]) => {
        const target = Array.from(new Set(rooms.filter((room) => room > 0))).sort((a, b) => a - b)
        if (target.length === 0) {
            return
        }
        const key = target.join(",")
        if (targetKeys.has(key)) {
            return
        }
        targetKeys.add(key)
        repairTargets.push(target)
    }

    for (const issue of adjacency.horizontalMismatches) pushTarget([issue.fromRoom, issue.toRoom])
    for (const issue of adjacency.horizontalTraversalMismatches) pushTarget([issue.fromRoom, issue.toRoom])
    for (const issue of adjacency.lethalSideExitMismatches) pushTarget([issue.fromRoom])
    for (const issue of adjacency.verticalEdgeMismatches) pushTarget([issue.fromRoom, issue.toRoom])
    for (const issue of adjacency.blockedTopClimbMismatches) pushTarget([issue.fromRoom, issue.toRoom])
    for (const issue of adjacency.unsafeVerticalDrops) pushTarget([issue.fromRoom, issue.toRoom])
    for (const issue of adjacency.verticalFallLandingMismatches) pushTarget([issue.fromRoom, issue.toRoom])
    for (const issue of adjacency.lethalBottomPitMismatches) pushTarget([issue.fromRoom])
    for (const issue of adjacency.disconnectedVerticalPassages) pushTarget([issue.fromRoom])
    for (const issue of adjacency.unreachablePlatforms) pushTarget([issue.room])
    for (const issue of adjacency.globallyUnreachableRooms) pushTarget([issue.room])

    for (const filePath of roomPaths) {
        const analysis = analyzeGrid(filePath)
        if (analysis.roomNumber !== null && roomHasHeuristicFailure(filePath)) {
            pushTarget([analysis.roomNumber])
        }
    }

    for (const target of repairTargets) {
        repairCluster(roomPaths, target, {
            maxDepth: options.repairMaxDepth,
            maxNodes: options.repairMaxNodes,
        })
    }

    return datasetPassesAllRules(roomPaths)
}

function main() {
    const rawArgs = process.argv.slice(2)
    const generationAttemptsArg = rawArgs.find((arg) => arg.startsWith("--generation-attempts="))
    const repairMaxDepthArg = rawArgs.find((arg) => arg.startsWith("--repair-max-depth="))
    const repairMaxNodesArg = rawArgs.find((arg) => arg.startsWith("--repair-max-nodes="))
    const options: GenerationOptions = {
        preferOpenAreas: rawArgs.includes("--prefer-open-areas"),
        generationAttempts: Number.isFinite(Number(generationAttemptsArg?.replace("--generation-attempts=", "")))
            ? Math.max(1, Math.floor(Number(generationAttemptsArg!.replace("--generation-attempts=", ""))))
            : 1200,
        repairMaxDepth: Number.isFinite(Number(repairMaxDepthArg?.replace("--repair-max-depth=", "")))
            ? Math.max(1, Math.floor(Number(repairMaxDepthArg!.replace("--repair-max-depth=", ""))))
            : undefined,
        repairMaxNodes: Number.isFinite(Number(repairMaxNodesArg?.replace("--repair-max-nodes=", "")))
            ? Math.max(1, Math.floor(Number(repairMaxNodesArg!.replace("--repair-max-nodes=", ""))))
            : undefined,
    }
    const args = rawArgs.filter((arg) => arg !== "--prefer-open-areas" && arg !== generationAttemptsArg && arg !== repairMaxDepthArg && arg !== repairMaxNodesArg)
    if (args.length < 1 || args.length > 3) {
        printUsage()
        process.exit(1)
    }

    const inputDir = path.resolve(args[0])
    const inputLevelName = path.basename(inputDir)
    let outputDirArg = ""
    let seedArg = ""
    if (args.length === 2) {
        if (/^\d+$/.test(args[1])) {
            seedArg = args[1]
        } else {
            outputDirArg = args[1]
        }
    } else if (args.length === 3) {
        outputDirArg = args[1]
        seedArg = args[2]
    }

    const outputDir = path.resolve(outputDirArg || resolveDefaultValidatedCollisionDir(inputLevelName))
    const outputLevelName = path.basename(outputDir)
    const roomNumbers = getRoomNumbers(inputDir)
    const sourceAdjacency = loadExistingAdjacency(inputDir, inputLevelName, roomNumbers)
    if (roomNumbers.length === 0) {
        throw new Error(`No room grid txt files found in '${inputDir}'`)
    }

    const baseSeed = seedArg ? Number(seedArg) >>> 0 : hashString(`${outputLevelName}:${roomNumbers.join(",")}`)
    let finalSeed = baseSeed
    let generated = false
    for (let attempt = 0; attempt < options.generationAttempts; ++attempt) {
        const attemptSeed = (baseSeed + attempt) >>> 0
        const rnd = createRng(attemptSeed)
        const adjacencyRows = sourceAdjacency ? sourceAdjacency.map((row) => ({ ...row })) : generateRandomAdjacency(roomNumbers, rnd).rows
        const verticalPlan = createVerticalTransitionPlan(adjacencyRows, attemptSeed)
        writeGeneratedDataset(outputDir, outputLevelName, roomNumbers, adjacencyRows, rnd, verticalPlan, options)
        if (validateAndRepairGeneratedDataset(outputDir, roomNumbers, adjacencyRows, options)) {
            finalSeed = attemptSeed
            generated = true
            break
        }
    }

    if (!generated) {
        if (sourceAdjacency) {
            const sourceRoomPaths = getRoomGridPaths(inputDir, roomNumbers)
            if (datasetPassesAllRules(sourceRoomPaths)) {
                copyValidatedSourceDataset(inputDir, outputDir, outputLevelName, roomNumbers, sourceAdjacency)
                finalSeed = baseSeed
                generated = true
                console.log(`Generated validated collision dataset for ${outputLevelName} (fallback: copied validator-clean source dataset)`)
                console.log(`Seed:   ${finalSeed}`)
                console.log(`Input:  ${inputDir}`)
                console.log(`Output: ${outputDir}`)
                return
            }
        }
        throw new Error(`Failed to generate a fully validated collision dataset for ${outputLevelName} after ${options.generationAttempts} attempts`)
    }

    console.log(`Generated validated collision dataset for ${outputLevelName}`)
    console.log(`Seed:   ${finalSeed}`)
    console.log(`Input:  ${inputDir}`)
    console.log(`Output: ${outputDir}`)
}

main()
