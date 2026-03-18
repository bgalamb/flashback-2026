import * as fs from "fs"
import * as path from "path"

type FloorName = "top" | "middle" | "bottom"

type FloorRule = {
    name: FloorName
    standingPosY: number
    lane: number
    clearanceRow: number
    supportRow: number
}

type FloorSpan = {
    startX: number
    endX: number
}

type FloorAnalysis = {
    rule: FloorRule
    stableColumns: number[]
    spans: FloorSpan[]
}

type MisalignedTopFloorAnalysis = {
    columns: number[]
    spans: FloorSpan[]
}

type GridAnalysis = {
    filePath: string
    title: string
    roomNumber: number | null
    width: number
    height: number
    uniqueValues: number[]
    hasExpectedShape: boolean
    hasOnlyBinaryValues: boolean
    floorAnalyses: FloorAnalysis[]
    oddSolidRunsByRow: FloorSpan[][]
    fakeShelfRunsByRow: FloorSpan[][]
    nonWalkableTopSurfaceRunsByRow: FloorSpan[][]
    somersaultTunnelSpans: Array<{ row: number, floor: FloorName | null, startX: number, endX: number }>
    somersaultTunnelIssues: Array<{ row: number, floor: FloorName | null, startX: number, endX: number, note: string }>
    oneStepObstaclePairs: Array<{ leftX: number, rightX: number, leftTopY: number, rightTopY: number }>
    enclosedVoidRegions: Array<{ minX: number, maxX: number, minY: number, maxY: number, cells: Array<{ x: number, y: number }> }>
    misalignedTopFloor: MisalignedTopFloorAnalysis
}

type LoadedRoomGrid = {
    filePath: string
    title: string
    roomNumber: number | null
    grid: number[][]
}

type LoadedLevelGridModel = {
    levelName: string
    traversalStartRoom: number | null
    adjacencyRooms: RoomAdjacency[]
    roomsByNumber: Map<number, LoadedRoomGrid>
    analysesByRoom: Map<number, GridAnalysis>
}

type RoomAdjacency = {
    room: number
    up: number
    down: number
    left: number
    right: number
}

type EdgeConsistencyIssue = {
    direction: "left" | "right" | "up" | "down"
    fromRoom: number
    toRoom: number
    floor?: FloorName
    columns?: number[]
    note: string
}

type AdjacencyCheckResult = {
    levelName: string
    traversalStartRoom: number | null
    horizontalMismatches: EdgeConsistencyIssue[]
    horizontalTraversalMismatches: EdgeConsistencyIssue[]
    unsafeHorizontalTransitionMismatches: EdgeConsistencyIssue[]
    somersaultTunnelMismatches: EdgeConsistencyIssue[]
    lethalSideExitMismatches: EdgeConsistencyIssue[]
    verticalEdgeMismatches: EdgeConsistencyIssue[]
    blockedTopClimbMismatches: EdgeConsistencyIssue[]
    unsafeVerticalDrops: EdgeConsistencyIssue[]
    verticalFallLandingMismatches: EdgeConsistencyIssue[]
    lethalBottomPitMismatches: EdgeConsistencyIssue[]
    disconnectedVerticalPassages: EdgeConsistencyIssue[]
    verticalWarnings: EdgeConsistencyIssue[]
    globallyUnreachableRooms: Array<{
        room: number
        note: string
    }>
    sparseRoomContentRooms: Array<{
        room: number
        note: string
    }>
    unreachablePlatforms: Array<{
        room: number
        floor: FloorName
        span: FloorSpan
        note: string
    }>
}

type ClusterRepairChange = {
    room: number
    note: string
}

type ClusterRepairResult = {
    changed: boolean
    repaired: boolean
    targetRooms: number[]
    passes: number
    changes: ClusterRepairChange[]
    remainingScore: number
}

type ClusterRepairOptions = {
    maxDepth?: number
    maxNodes?: number
}

type ClusterRepairOperation = {
    key: string
    note: string
    apply: (level: LoadedLevelGridModel) => boolean
}

const FLOOR_RULES: FloorRule[] = [
    { name: "top", standingPosY: 70, lane: 0, clearanceRow: 1, supportRow: 2 },
    { name: "middle", standingPosY: 142, lane: 1, clearanceRow: 3, supportRow: 4 },
    { name: "bottom", standingPosY: 214, lane: 2, clearanceRow: 5, supportRow: 6 },
]

function isStableStandingCell(grid: number[][], x: number, y: number): boolean {
    return FLOOR_RULES.some((rule) => rule.clearanceRow === y && grid[y][x] === 0 && grid[rule.supportRow][x] === 1)
}

function getFloorRuleByClearanceRow(row: number): FloorRule | undefined {
    return FLOOR_RULES.find((rule) => rule.clearanceRow === row)
}

function isOneHighSomersaultCell(grid: number[][], x: number, y: number): boolean {
    if (y <= 0 || y >= grid.length - 1 || x < 0 || x >= grid[0].length) {
        return false
    }
    return grid[y][x] === 0 && grid[y - 1][x] === 1 && grid[y + 1][x] === 1
}

function isTwoHighOpeningCell(grid: number[][], rule: FloorRule, x: number): boolean {
    if (x < 0 || x >= grid[0].length || rule.clearanceRow <= 0) {
        return false
    }
    return grid[rule.clearanceRow][x] === 0 && grid[rule.clearanceRow - 1][x] === 0
}

function isInvalidEnclosedVoidRegion(
    grid: number[][],
    region: { minY: number, maxY: number, cells: Array<{ x: number, y: number }> }
): boolean {
    return region.cells.length > 0 && region.maxY > 1
}

function parseGrid(filePath: string): number[][] {
    const rows: number[][] = []
    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/)
    for (const line of lines) {
        const match = /^\|\s+\d+\s+\|\s+(.+?)\s+\|$/.exec(line)
        if (!match) {
            continue
        }
        rows.push(match[1].trim().split(/\s+/).map(Number))
    }
    return rows
}

function loadRoomGrid(filePath: string): LoadedRoomGrid {
    return {
        filePath,
        title: readTitle(filePath),
        roomNumber: parseRoomNumber(filePath),
        grid: parseGrid(filePath),
    }
}

function readTitle(filePath: string): string {
    const firstLine = fs.readFileSync(filePath, "utf8").split(/\r?\n/).find((line) => line.trim().length > 0)
    if (firstLine && /^=== .* ===$/.test(firstLine)) {
        return firstLine
    }
    return `=== ${filePath} ===`
}

function parseRoomNumber(filePath: string): number | null {
    const match = /room-(\d{2})-grid\.txt$/.exec(path.basename(filePath))
    return match ? Number(match[1]) : null
}

function toSpans(columns: number[]): FloorSpan[] {
    if (columns.length === 0) {
        return []
    }
    const spans: FloorSpan[] = []
    let start = columns[0]
    let end = columns[0]
    for (let i = 1; i < columns.length; ++i) {
        const x = columns[i]
        if (x === end + 1) {
            end = x
            continue
        }
        spans.push({ startX: start, endX: end })
        start = x
        end = x
    }
    spans.push({ startX: start, endX: end })
    return spans
}

function analyzeLoadedGrid(room: LoadedRoomGrid): GridAnalysis {
    const grid = room.grid
    const height = grid.length
    const width = height > 0 ? grid[0].length : 0
    const flatValues: number[] = []
    for (let y = 0; y < grid.length; ++y) {
        for (let x = 0; x < grid[y].length; ++x) {
            flatValues.push(grid[y][x])
        }
    }
    const uniqueValues: number[] = Array.from(new Set(flatValues)).sort((a, b) => a - b)
    const hasExpectedShape = width === 16 && height === 7 && grid.every((row) => row.length === width)
    const hasOnlyBinaryValues = uniqueValues.every((value) => value === 0 || value === 1)

    const floorAnalyses: FloorAnalysis[] = FLOOR_RULES.map((rule) => {
        const stableColumns: number[] = []
        if (hasExpectedShape) {
            for (let x = 0; x < width; ++x) {
                const canStandHere =
                    grid[rule.clearanceRow][x] === 0 &&
                    grid[rule.supportRow][x] === 1
                if (canStandHere) {
                    stableColumns.push(x)
                }
            }
        }
        return {
            rule,
            stableColumns,
            spans: toSpans(stableColumns)
        }
    })

    const oddSolidRunsByRow: FloorSpan[][] = []
    const fakeShelfRunsByRow: FloorSpan[][] = []
    const nonWalkableTopSurfaceRunsByRow: FloorSpan[][] = []
    const somersaultTunnelSpans: Array<{ row: number, floor: FloorName | null, startX: number, endX: number }> = []
    const somersaultTunnelIssues: Array<{ row: number, floor: FloorName | null, startX: number, endX: number, note: string }> = []
    const oneStepObstaclePairs: Array<{ leftX: number, rightX: number, leftTopY: number, rightTopY: number }> = []
    const enclosedVoidRegions: Array<{ minX: number, maxX: number, minY: number, maxY: number, cells: Array<{ x: number, y: number }> }> = []
    if (hasExpectedShape) {
        const visited = new Set<string>()
        const walkableSupportRows = new Set<number>(FLOOR_RULES.map((rule) => rule.supportRow))
        for (let y = 0; y < height; ++y) {
            const solidColumns: number[] = []
            const fakeShelfColumns: number[] = []
            const nonWalkableTopSurfaceColumns: number[] = []
            for (let x = 0; x < width; ++x) {
                if (grid[y][x] === 1) {
                    solidColumns.push(x)
                }
                if (y > 0 && grid[y][x] === 1 && grid[y - 1][x] === 0 && !walkableSupportRows.has(y)) {
                    nonWalkableTopSurfaceColumns.push(x)
                }
                if (y > 0 && y < height - 1 && grid[y][x] === 1 && grid[y - 1][x] === 0 && grid[y + 1][x] === 0) {
                    const isValidSupport = FLOOR_RULES.some((rule) => rule.supportRow === y && grid[rule.clearanceRow][x] === 0)
                    if (!isValidSupport) {
                        fakeShelfColumns.push(x)
                    }
                }
            }
            oddSolidRunsByRow.push(toSpans(solidColumns).filter((span) => ((span.endX - span.startX + 1) % 2) === 1))
            fakeShelfRunsByRow.push(toSpans(fakeShelfColumns).filter((span) => (span.endX - span.startX + 1) >= 2))
            nonWalkableTopSurfaceRunsByRow.push(toSpans(nonWalkableTopSurfaceColumns))

            if (y > 0 && y < height - 1) {
                const tunnelColumns: number[] = []
                for (let x = 0; x < width; ++x) {
                    if (isOneHighSomersaultCell(grid, x, y)) {
                        tunnelColumns.push(x)
                    }
                }
                const tunnelSpans = toSpans(tunnelColumns)
                const floorRule = getFloorRuleByClearanceRow(y)
                for (const span of tunnelSpans) {
                    const floor = floorRule?.name ?? null
                    somersaultTunnelSpans.push({ row: y, floor, startX: span.startX, endX: span.endX })
                    if (!floorRule) {
                        somersaultTunnelIssues.push({
                            row: y,
                            floor,
                            startX: span.startX,
                            endX: span.endX,
                            note: `1-high tunnel at row ${y} is off Conrad's walkable lanes`
                        })
                        continue
                    }
                    if ((span.endX - span.startX + 1) > 4) {
                        somersaultTunnelIssues.push({
                            row: y,
                            floor,
                            startX: span.startX,
                            endX: span.endX,
                            note: `1-high ${floor} somersault tunnel ${span.startX}-${span.endX} is longer than 4 cells`
                        })
                    }
                    if (span.startX > 0 && !isTwoHighOpeningCell(grid, floorRule, span.startX - 1)) {
                        somersaultTunnelIssues.push({
                            row: y,
                            floor,
                            startX: span.startX,
                            endX: span.endX,
                            note: `1-high ${floor} somersault tunnel ${span.startX}-${span.endX} does not begin at a 2-high opening`
                        })
                    }
                    if (span.endX < width - 1 && !isTwoHighOpeningCell(grid, floorRule, span.endX + 1)) {
                        somersaultTunnelIssues.push({
                            row: y,
                            floor,
                            startX: span.startX,
                            endX: span.endX,
                            note: `1-high ${floor} somersault tunnel ${span.startX}-${span.endX} does not end at a 2-high opening`
                        })
                    }
                }
            }
        }

        const topSurfaceRowsByColumn: number[][] = []
        for (let x = 0; x < width; ++x) {
            const rows: number[] = []
            for (let y = 0; y < height; ++y) {
                if (grid[y][x] === 1 && (y === 0 || grid[y - 1][x] === 0)) {
                    rows.push(y)
                }
            }
            topSurfaceRowsByColumn.push(rows)
        }

        for (let x = 0; x < width - 1; ++x) {
            for (const leftTopY of topSurfaceRowsByColumn[x]) {
                for (const rightTopY of topSurfaceRowsByColumn[x + 1]) {
                    if (Math.abs(leftTopY - rightTopY) === 1) {
                        oneStepObstaclePairs.push({ leftX: x, rightX: x + 1, leftTopY, rightTopY })
                    }
                }
            }
        }

        for (let startY = 0; startY < height; ++startY) {
            for (let startX = 0; startX < width; ++startX) {
                const key = `${startX},${startY}`
                if (grid[startY][startX] !== 0 || visited.has(key)) {
                    continue
                }

                const queue: Array<{ x: number, y: number }> = [{ x: startX, y: startY }]
                const cells: Array<{ x: number, y: number }> = []
                let touchesBoundary = false
                let minX = startX
                let maxX = startX
                let minY = startY
                let maxY = startY
                visited.add(key)

                while (queue.length > 0) {
                    const cell = queue.shift()!
                    cells.push(cell)
                    minX = Math.min(minX, cell.x)
                    maxX = Math.max(maxX, cell.x)
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

                if (!touchesBoundary && isInvalidEnclosedVoidRegion(grid, { minY, maxY, cells })) {
                    enclosedVoidRegions.push({ minX, maxX, minY, maxY, cells })
                }
            }
        }
    }

    const misalignedTopFloorColumns: number[] = []
    if (hasExpectedShape) {
        for (let x = 0; x < width; ++x) {
            if (grid[1][x] === 0 && grid[2][x] === 0 && grid[3][x] === 1) {
                misalignedTopFloorColumns.push(x)
            }
        }
    }

    return {
        filePath: room.filePath,
        title: room.title,
        roomNumber: room.roomNumber,
        width,
        height,
        uniqueValues,
        hasExpectedShape,
        hasOnlyBinaryValues,
        floorAnalyses,
        oddSolidRunsByRow,
        fakeShelfRunsByRow,
        nonWalkableTopSurfaceRunsByRow,
        somersaultTunnelSpans,
        somersaultTunnelIssues,
        oneStepObstaclePairs,
        enclosedVoidRegions,
        misalignedTopFloor: {
            columns: misalignedTopFloorColumns,
            spans: toSpans(misalignedTopFloorColumns)
        }
    }
}

function analyzeGrid(filePath: string): GridAnalysis {
    return analyzeLoadedGrid(loadRoomGrid(filePath))
}

function formatVoidRegions(regions: Array<{ minX: number, maxX: number, minY: number, maxY: number }>): string {
    if (regions.length === 0) {
        return "none"
    }
    return regions.map((region) => {
        const xPart = region.minX === region.maxX ? `${region.minX}` : `${region.minX}-${region.maxX}`
        const yPart = region.minY === region.maxY ? `${region.minY}` : `${region.minY}-${region.maxY}`
        return `x${xPart}@y${yPart}`
    }).join(", ")
}

function formatSpans(spans: FloorSpan[]): string {
    if (spans.length === 0) {
        return "none"
    }
    return spans.map((span) => span.startX === span.endX ? `${span.startX}` : `${span.startX}-${span.endX}`).join(", ")
}

function getFloorAnalysis(analysis: GridAnalysis, floorName: FloorName): FloorAnalysis | undefined {
    return analysis.floorAnalyses.find((floor) => floor.rule.name === floorName)
}

function countInteriorSolidCells(grid: number[][]): number {
    let count = 0
    for (let y = 2; y <= 5 && y < grid.length; ++y) {
        for (let x = 0; x < grid[y].length; ++x) {
            if (grid[y][x] === 1) {
                count += 1
            }
        }
    }
    return count
}

function getSomersaultTunnelSpansForFloor(analysis: GridAnalysis, floorName: FloorName): Array<{ row: number, floor: FloorName | null, startX: number, endX: number }> {
    return analysis.somersaultTunnelSpans.filter((span) => span.floor === floorName)
}

function getEdgeSomersaultTunnelSpan(analysis: GridAnalysis, floorName: FloorName, side: "left" | "right"): { row: number, floor: FloorName | null, startX: number, endX: number } | undefined {
    return getSomersaultTunnelSpansForFloor(analysis, floorName).find((span) => side === "left" ? span.startX === 0 : span.endX === 15)
}

function canSomersaultPassAtEdge(room: LoadedRoomGrid | undefined, floorName: FloorName, side: "left" | "right"): boolean {
    if (!room) {
        return false
    }
    const rule = getFloorRule(floorName)
    const x = side === "left" ? 0 : 15
    return isTwoHighOpeningCell(room.grid, rule, x) || isOneHighSomersaultCell(room.grid, x, rule.clearanceRow)
}

function overlapWidth(a: FloorSpan, b: FloorSpan): number {
    return Math.max(0, Math.min(a.endX, b.endX) - Math.max(a.startX, b.startX) + 1)
}

function horizontalGap(a: FloorSpan, b: FloorSpan): number {
    if (overlapWidth(a, b) > 0) {
        return 0
    }
    if (a.endX < b.startX) {
        return b.startX - a.endX - 1
    }
    return a.startX - b.endX - 1
}

function hasLowerFloorConnection(analysis: GridAnalysis, floorName: FloorName, span: FloorSpan): boolean {
    if (floorName === "bottom") {
        return true
    }
    const lowerFloorName: FloorName = floorName === "top" ? "middle" : "bottom"
    const lowerFloor = getFloorAnalysis(analysis, lowerFloorName)
    if (!lowerFloor) {
        return false
    }
    return lowerFloor.spans.some((lowerSpan) => overlapWidth(span, lowerSpan) >= 2)
}

function hasHigherFloorDropConnection(analysis: GridAnalysis, floorName: FloorName, span: FloorSpan): boolean {
    if (floorName === "top") {
        return false
    }
    const higherFloorName: FloorName = floorName === "middle" ? "top" : "middle"
    const higherFloor = getFloorAnalysis(analysis, higherFloorName)
    if (!higherFloor) {
        return false
    }
    return higherFloor.spans.some((higherSpan) => horizontalGap(span, higherSpan) === 0)
}

function hasHorizontalNeighborConnection(
    roomData: RoomAdjacency,
    analysesByRoom: Map<number, GridAnalysis>,
    floorName: FloorName,
    span: FloorSpan
): boolean {
    if (span.startX === 0 && roomData.left > 0) {
        const leftRoom = analysesByRoom.get(roomData.left)
        const leftFloor = leftRoom ? getFloorAnalysis(leftRoom, floorName) : undefined
        if (leftFloor && leftFloor.spans.some((leftSpan) => leftSpan.endX === 15)) {
            return true
        }
    }
    if (span.endX === 15 && roomData.right > 0) {
        const rightRoom = analysesByRoom.get(roomData.right)
        const rightFloor = rightRoom ? getFloorAnalysis(rightRoom, floorName) : undefined
        if (rightFloor && rightFloor.spans.some((rightSpan) => rightSpan.startX === 0)) {
            return true
        }
    }
    return false
}

function hasVerticalFallConnectionFromAbove(
    roomData: RoomAdjacency,
    analysesByRoom: Map<number, GridAnalysis>,
    roomsByNumber: Map<number, LoadedRoomGrid>,
    span: FloorSpan
): boolean {
    if (roomData.up <= 0) {
        return false
    }
    const aboveRoom = analysesByRoom.get(roomData.up)
    if (!aboveRoom || !aboveRoom.hasExpectedShape) {
        return false
    }
    const grid = roomsByNumber.get(roomData.up)?.grid
    if (!grid) {
        return false
    }
    for (let x = span.startX; x <= span.endX; ++x) {
        if (grid[6][x] === 0) {
            return true
        }
    }
    return false
}

type SpanNode = {
    floor: FloorName
    span: FloorSpan
}

function buildSpanTraversalGraph(analysis: GridAnalysis): Map<string, Set<string>> {
    const nodes: SpanNode[] = []
    for (const floor of analysis.floorAnalyses) {
        for (const span of floor.spans) {
            nodes.push({ floor: floor.rule.name, span })
        }
    }

    const keyFor = (node: SpanNode): string => `${node.floor}:${node.span.startX}-${node.span.endX}`
    const graph = new Map<string, Set<string>>()

    for (const node of nodes) {
        graph.set(keyFor(node), new Set<string>())
    }

    for (const from of nodes) {
        for (const to of nodes) {
            if (from === to) {
                continue
            }
            const fromFloorIndex = FLOOR_RULES.findIndex((rule) => rule.name === from.floor)
            const toFloorIndex = FLOOR_RULES.findIndex((rule) => rule.name === to.floor)
            if (fromFloorIndex < 0 || toFloorIndex < 0) {
                continue
            }
            if (fromFloorIndex === toFloorIndex + 1 && overlapWidth(from.span, to.span) >= 2) {
                graph.get(keyFor(from))?.add(keyFor(to))
            }
            if (fromFloorIndex + 1 === toFloorIndex && horizontalGap(from.span, to.span) === 0) {
                graph.get(keyFor(from))?.add(keyFor(to))
            }
        }
    }

    return graph
}

function hasSpanPath(graph: Map<string, Set<string>>, fromKey: string, targetKeys: Set<string>): boolean {
    if (targetKeys.has(fromKey)) {
        return true
    }
    const queue: string[] = [fromKey]
    const visited = new Set<string>([fromKey])

    while (queue.length > 0) {
        const current = queue.shift()!
        for (const next of Array.from(graph.get(current) || [])) {
            if (targetKeys.has(next)) {
                return true
            }
            if (visited.has(next)) {
                continue
            }
            visited.add(next)
            queue.push(next)
        }
    }

    return false
}

function getOpenBottomSpans(grid: number[][]): FloorSpan[] {
    const openBottomColumns: number[] = []
    for (let x = 0; x < grid[0].length; ++x) {
        if (grid[6][x] === 0) {
            openBottomColumns.push(x)
        }
    }
    return toSpans(openBottomColumns)
}

function getReachableOpenBottomSpans(analysis: GridAnalysis, grid: number[][]): FloorSpan[] {
    const openBottomSpans = getOpenBottomSpans(grid)
    const bottomSpans = getFloorAnalysis(analysis, "bottom")?.spans || []
    return openBottomSpans.filter((openSpan) => bottomSpans.some((bottomSpan) => horizontalGap(openSpan, bottomSpan) === 0))
}

function getOpenTopColumns(grid: number[][]): number[] {
    const openTopColumns: number[] = []
    for (let x = 0; x < grid[0].length; ++x) {
        if (grid[0][x] === 0) {
            openTopColumns.push(x)
        }
    }
    return openTopColumns
}

function getOpenBottomColumns(grid: number[][]): number[] {
    const openBottomColumns: number[] = []
    for (let x = 0; x < grid[0].length; ++x) {
        if (grid[grid.length - 1][x] === 0) {
            openBottomColumns.push(x)
        }
    }
    return openBottomColumns
}

function hasConnectedVerticalPassage(grid: number[][], topColumns: number[], bottomColumns: number[]): boolean {
    if (topColumns.length === 0 || bottomColumns.length === 0) {
        return true
    }
    const width = grid[0].length
    const height = grid.length
    const bottomSet = new Set(bottomColumns)
    const queue: Array<{ x: number, y: number }> = []
    const visited = new Set<string>()

    for (const x of topColumns) {
        if (grid[0][x] !== 0) {
            continue
        }
        const key = `${x},0`
        visited.add(key)
        queue.push({ x, y: 0 })
    }

    while (queue.length > 0) {
        const cell = queue.shift()!
        if (cell.y === height - 1 && bottomSet.has(cell.x)) {
            return true
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
            if (grid[neighbor.y][neighbor.x] !== 0) {
                continue
            }
            const key = `${neighbor.x},${neighbor.y}`
            if (visited.has(key)) {
                continue
            }
            visited.add(key)
            queue.push(neighbor)
        }
    }

    return false
}

function hasDirectVerticalFallColumn(grid: number[][], topColumns: number[], bottomColumns: number[]): boolean {
    if (topColumns.length === 0 || bottomColumns.length === 0) {
        return true
    }
    const bottomSet = new Set(bottomColumns)
    for (const x of topColumns) {
        if (!bottomSet.has(x)) {
            continue
        }
        let isOpen = true
        for (let y = 0; y < grid.length; ++y) {
            if (grid[y][x] !== 0) {
                isOpen = false
                break
            }
        }
        if (isOpen) {
            return true
        }
    }
    return false
}

function hasUnsafeDirectDropFromTopToBottom(grid: number[][], topStableColumns: number[]): boolean {
    if (topStableColumns.length === 0) {
        return false
    }
    const width = grid[0].length
    const height = grid.length
    const queue: Array<{ x: number, y: number }> = []
    const visited = new Set<string>()

    for (const x of topStableColumns) {
        if (grid[1][x] !== 0 || grid[2][x] !== 1) {
            continue
        }
        const key = `${x},1`
        visited.add(key)
        queue.push({ x, y: 1 })
    }

    while (queue.length > 0) {
        const cell = queue.shift()!
        if (cell.y === height - 1) {
            return true
        }
        const neighbors = [
            { x: cell.x - 1, y: cell.y },
            { x: cell.x + 1, y: cell.y },
            { x: cell.x, y: cell.y + 1 },
        ]
        for (const neighbor of neighbors) {
            if (neighbor.x < 0 || neighbor.x >= width || neighbor.y < 0 || neighbor.y >= height) {
                continue
            }
            if (grid[neighbor.y][neighbor.x] !== 0) {
                continue
            }
            if (neighbor.y > 1 && isStableStandingCell(grid, neighbor.x, neighbor.y)) {
                continue
            }
            const key = `${neighbor.x},${neighbor.y}`
            if (visited.has(key)) {
                continue
            }
            visited.add(key)
            queue.push(neighbor)
        }
    }

    return false
}

function renderGrid(title: string, grid: number[][]): string {
    const cellW = 4
    const yLabelW = 1
    const width = grid[0].length
    const horizontal = "+" + "-".repeat(yLabelW + 2) + "+" + "-".repeat((cellW + 1) * width + 1) + "+"
    const lines: string[] = []

    lines.push(title)
    lines.push(horizontal)
    const headerCells = new Array(width).fill(0).map((_, x) => x.toString().padStart(cellW, " ")).join(" ")
    lines.push(`| y | ${headerCells} |`)
    lines.push(horizontal)

    for (let y = 0; y < grid.length; ++y) {
        const rowValues = grid[y].map((value) => value.toString().padStart(cellW, " ")).join(" ")
        const blankCells = new Array(width).fill(" ".repeat(cellW)).join(" ")
        lines.push(`| ${y.toString().padStart(yLabelW, " ")} | ${rowValues} |`)
        lines.push(`| ${" ".repeat(yLabelW)} | ${blankCells} |`)
    }
    lines.push(horizontal)
    return lines.join("\n") + "\n"
}

function fixMisalignedTopFloorSupport(filePath: string): { changed: boolean, changedColumns: number[] } {
    const analysis = analyzeGrid(filePath)
    if (!analysis.hasExpectedShape) {
        return { changed: false, changedColumns: [] }
    }
    if (analysis.misalignedTopFloor.columns.length === 0) {
        return { changed: false, changedColumns: [] }
    }

    const grid = parseGrid(filePath)
    for (const x of analysis.misalignedTopFloor.columns) {
        grid[2][x] = 1
    }
    fs.writeFileSync(filePath, renderGrid(analysis.title, grid), "utf8")
    return {
        changed: true,
        changedColumns: analysis.misalignedTopFloor.columns.slice()
    }
}

function fixOddSolidRunParity(filePath: string): { changed: boolean, changes: Array<{ row: number, x: number, action: "extend_left" | "extend_right" | "shrink_right" }> } {
    const analysis = analyzeGrid(filePath)
    if (!analysis.hasExpectedShape) {
        return { changed: false, changes: [] }
    }

    const grid = parseGrid(filePath)
    const changes: Array<{ row: number, x: number, action: "extend_left" | "extend_right" | "shrink_right" }> = []

    for (let y = 0; y < analysis.oddSolidRunsByRow.length; ++y) {
        for (const span of analysis.oddSolidRunsByRow[y]) {
            const tryRight = span.endX + 1
            const tryLeft = span.startX - 1

            if (tryRight < analysis.width) {
                grid[y][tryRight] = 1
                changes.push({ row: y, x: tryRight, action: "extend_right" })
                continue
            }
            if (tryLeft >= 0) {
                grid[y][tryLeft] = 1
                changes.push({ row: y, x: tryLeft, action: "extend_left" })
                continue
            }

            grid[y][span.endX] = 0
            changes.push({ row: y, x: span.endX, action: "shrink_right" })
        }
    }

    if (changes.length === 0) {
        return { changed: false, changes: [] }
    }

    fs.writeFileSync(filePath, renderGrid(analysis.title, grid), "utf8")
    return { changed: true, changes }
}

function fixOneStepObstacles(filePath: string): { changed: boolean, changes: Array<{ x: number, raisedToY: number }> } {
    const changes: Array<{ x: number, raisedToY: number }> = []
    let title = readTitle(filePath)

    for (let pass = 0; pass < 8; ++pass) {
        const analysis = analyzeGrid(filePath)
        if (!analysis.hasExpectedShape || analysis.oneStepObstaclePairs.length === 0) {
            break
        }

        const grid = parseGrid(filePath)
        const seen = new Set<string>()
        let changedThisPass = false

        for (const pair of analysis.oneStepObstaclePairs) {
            const raisedToY = Math.min(pair.leftTopY, pair.rightTopY)
            const targetX = pair.leftTopY > pair.rightTopY ? pair.leftX : pair.rightX
            const key = `${targetX},${raisedToY}`
            if (seen.has(key)) {
                continue
            }
            if (grid[raisedToY][targetX] !== 1) {
                grid[raisedToY][targetX] = 1
                changes.push({ x: targetX, raisedToY })
                changedThisPass = true
            }
            seen.add(key)
        }

        if (!changedThisPass) {
            break
        }

        title = analysis.title
        fs.writeFileSync(filePath, renderGrid(title, grid), "utf8")
    }

    return { changed: changes.length > 0, changes }
}

function fillEnclosedVoidRegions(filePath: string): { changed: boolean, regions: Array<{ minX: number, maxX: number, minY: number, maxY: number }> } {
    const analysis = analyzeGrid(filePath)
    if (!analysis.hasExpectedShape || analysis.enclosedVoidRegions.length === 0) {
        return { changed: false, regions: [] }
    }

    const grid = parseGrid(filePath)
    for (const region of analysis.enclosedVoidRegions) {
        for (const cell of region.cells) {
            grid[cell.y][cell.x] = 1
        }
    }
    fs.writeFileSync(filePath, renderGrid(analysis.title, grid), "utf8")
    return {
        changed: true,
        regions: analysis.enclosedVoidRegions.map((region) => ({
            minX: region.minX,
            maxX: region.maxX,
            minY: region.minY,
            maxY: region.maxY,
        }))
    }
}

function loadAdjacencyForGridFiles(filePaths: string[]): { levelName: string, rooms: RoomAdjacency[] } | null {
    if (filePaths.length === 0) {
        return null
    }
    const firstDir = path.dirname(path.resolve(filePaths[0]))
    const firstTitle = readTitle(filePaths[0])
    const titleLevelMatch = /^===\s+([^\s]+)\s+room\s+\d+\s+===/.exec(firstTitle)
    const expectedLevelName = titleLevelMatch ? titleLevelMatch[1] : null
    const candidates = fs.readdirSync(firstDir)
        .filter((name) => /-ct-adjacency\.json$/.test(name))
        .map((name) => path.join(firstDir, name))

    if (candidates.length === 0) {
        return null
    }

    let adjacencyPath: string | null = null
    if (expectedLevelName) {
        const preferredPath = path.join(firstDir, `${expectedLevelName}-ct-adjacency.json`)
        if (fs.existsSync(preferredPath)) {
            adjacencyPath = preferredPath
        }
    }

    if (!adjacencyPath) {
        for (const candidate of candidates) {
            try {
                const parsed = JSON.parse(fs.readFileSync(candidate, "utf8"))
                if (expectedLevelName && parsed?.level === expectedLevelName) {
                    adjacencyPath = candidate
                    break
                }
            } catch {
                continue
            }
        }
    }

    if (!adjacencyPath) {
        if (candidates.length !== 1) {
            return null
        }
        adjacencyPath = candidates[0]
    }
    const parsed = JSON.parse(fs.readFileSync(adjacencyPath, "utf8"))
    if (!parsed || typeof parsed.level !== "string" || !Array.isArray(parsed.rooms)) {
        return null
    }
    return {
        levelName: parsed.level,
        rooms: parsed.rooms
    }
}

function loadTraversalStartRoom(filePaths: string[], levelName: string): number | null {
    if (filePaths.length === 0) {
        return null
    }
    const collisionDir = path.dirname(path.resolve(filePaths[0]))
    const levelDir = path.dirname(collisionDir)
    const pgePath = path.join(levelDir, `${levelName}.pge.json`)
    if (!fs.existsSync(pgePath)) {
        return null
    }
    const parsed = JSON.parse(fs.readFileSync(pgePath, "utf8"))
    const first = parsed?.pgeInit?.[0]
    return typeof first?.init_room === "number" ? first.init_room : null
}

function loadLevelGridModel(filePaths: string[]): LoadedLevelGridModel | null {
    const adjacency = loadAdjacencyForGridFiles(filePaths)
    if (!adjacency) {
        return null
    }

    const roomsByNumber = new Map<number, LoadedRoomGrid>()
    const analysesByRoom = new Map<number, GridAnalysis>()
    for (const filePath of filePaths) {
        const room = loadRoomGrid(filePath)
        if (room.roomNumber === null) {
            continue
        }
        roomsByNumber.set(room.roomNumber, room)
        analysesByRoom.set(room.roomNumber, analyzeLoadedGrid(room))
    }

    return {
        levelName: adjacency.levelName,
        traversalStartRoom: loadTraversalStartRoom(filePaths, adjacency.levelName),
        adjacencyRooms: adjacency.rooms,
        roomsByNumber,
        analysesByRoom,
    }
}

function cloneLoadedLevelGridModel(level: LoadedLevelGridModel): LoadedLevelGridModel {
    const roomsByNumber = new Map<number, LoadedRoomGrid>()
    for (const [roomNumber, room] of Array.from(level.roomsByNumber.entries())) {
        roomsByNumber.set(roomNumber, {
            filePath: room.filePath,
            title: room.title,
            roomNumber: room.roomNumber,
            grid: room.grid.map((row) => row.slice())
        })
    }

    const analysesByRoom = new Map<number, GridAnalysis>()
    for (const [roomNumber, room] of Array.from(roomsByNumber.entries())) {
        analysesByRoom.set(roomNumber, analyzeLoadedGrid(room))
    }

    return {
        levelName: level.levelName,
        traversalStartRoom: level.traversalStartRoom,
        adjacencyRooms: level.adjacencyRooms.map((roomData) => ({ ...roomData })),
        roomsByNumber,
        analysesByRoom,
    }
}

function refreshLevelAnalyses(level: LoadedLevelGridModel) {
    level.analysesByRoom = new Map<number, GridAnalysis>()
    for (const [roomNumber, room] of Array.from(level.roomsByNumber.entries())) {
        level.analysesByRoom.set(roomNumber, analyzeLoadedGrid(room))
    }
}

function getTraversableNeighborRooms(
    roomData: RoomAdjacency,
    current: GridAnalysis,
    analysesByRoom: Map<number, GridAnalysis>,
    roomsByNumber: Map<number, LoadedRoomGrid>
): number[] {
    const out: number[] = []
    const stableByFloor = new Map<FloorName, Set<number>>()
    for (const floor of current.floorAnalyses) {
        stableByFloor.set(floor.rule.name, new Set(floor.stableColumns))
    }

    if (roomData.right > 0) {
        const neighbor = analysesByRoom.get(roomData.right)
        if (neighbor) {
            for (const floor of neighbor.floorAnalyses) {
                const currentStable = stableByFloor.get(floor.rule.name) || new Set<number>()
                const neighborStable = new Set(floor.stableColumns)
                if (currentStable.has(15) && neighborStable.has(0)) {
                    out.push(roomData.right)
                    break
                }
            }
        }
    }

    if (roomData.left > 0) {
        const neighbor = analysesByRoom.get(roomData.left)
        if (neighbor) {
            for (const floor of neighbor.floorAnalyses) {
                const currentStable = stableByFloor.get(floor.rule.name) || new Set<number>()
                const neighborStable = new Set(floor.stableColumns)
                if (currentStable.has(0) && neighborStable.has(15)) {
                    out.push(roomData.left)
                    break
                }
            }
        }
    }

    if (roomData.down > 0 && current.hasExpectedShape) {
        const neighbor = analysesByRoom.get(roomData.down)
        const currentRoom = roomsByNumber.get(roomData.room)
        if (neighbor) {
            const neighborTopStable = new Set((neighbor.floorAnalyses.find((floor) => floor.rule.name === "top")?.stableColumns) || [])
            const grid = currentRoom?.grid
            if (!grid) {
                return out
            }
            for (let x = 0; x < 16; ++x) {
                if (grid[6][x] === 0 && neighborTopStable.has(x)) {
                    out.push(roomData.down)
                    break
                }
            }
        }
    }

    if (roomData.up > 0 && current.hasExpectedShape) {
        const neighbor = analysesByRoom.get(roomData.up)
        const currentRoom = roomsByNumber.get(roomData.room)
        if (neighbor) {
            const neighborBottomStable = new Set((neighbor.floorAnalyses.find((floor) => floor.rule.name === "bottom")?.stableColumns) || [])
            const grid = currentRoom?.grid
            if (!grid) {
                return out
            }
            for (let x = 0; x < 16; ++x) {
                if (grid[0][x] === 0 && neighborBottomStable.has(x)) {
                    out.push(roomData.up)
                    break
                }
            }
        }
    }

    return out
}

function analyzeAdjacencyConsistencyForModel(level: LoadedLevelGridModel): AdjacencyCheckResult {
    const analysesByRoom = level.analysesByRoom
    const roomsByNumber = level.roomsByNumber

    const horizontalMismatches: EdgeConsistencyIssue[] = []
    const horizontalTraversalMismatches: EdgeConsistencyIssue[] = []
    const unsafeHorizontalTransitionMismatches: EdgeConsistencyIssue[] = []
    const somersaultTunnelMismatches: EdgeConsistencyIssue[] = []
    const lethalSideExitMismatches: EdgeConsistencyIssue[] = []
    const verticalEdgeMismatches: EdgeConsistencyIssue[] = []
    const blockedTopClimbMismatches: EdgeConsistencyIssue[] = []
    const unsafeVerticalDrops: EdgeConsistencyIssue[] = []
    const verticalFallLandingMismatches: EdgeConsistencyIssue[] = []
    const lethalBottomPitMismatches: EdgeConsistencyIssue[] = []
    const disconnectedVerticalPassages: EdgeConsistencyIssue[] = []
    const verticalWarnings: EdgeConsistencyIssue[] = []
    const globallyUnreachableRooms: Array<{ room: number, note: string }> = []
    const sparseRoomContentRooms: Array<{ room: number, note: string }> = []
    const unreachablePlatforms: Array<{ room: number, floor: FloorName, span: FloorSpan, note: string }> = []

    for (const roomData of level.adjacencyRooms) {
        const current = analysesByRoom.get(roomData.room)
        const currentRoom = roomsByNumber.get(roomData.room)
        if (!current) {
            continue
        }

        const stableByFloor = new Map<FloorName, Set<number>>()
        for (const floor of current.floorAnalyses) {
            stableByFloor.set(floor.rule.name, new Set(floor.stableColumns))
        }

        if (roomData.left > 0 && roomData.right > 0) {
            const leftTop = getFloorAnalysis(current, "top")?.spans.filter((span) => span.startX === 0) || []
            const leftMiddle = getFloorAnalysis(current, "middle")?.spans.filter((span) => span.startX === 0) || []
            const leftBottom = getFloorAnalysis(current, "bottom")?.spans.filter((span) => span.startX === 0) || []
            const rightTop = getFloorAnalysis(current, "top")?.spans.filter((span) => span.endX === 15) || []
            const rightMiddle = getFloorAnalysis(current, "middle")?.spans.filter((span) => span.endX === 15) || []
            const rightBottom = getFloorAnalysis(current, "bottom")?.spans.filter((span) => span.endX === 15) || []
            const middleSpans = getFloorAnalysis(current, "middle")?.spans || []

            for (const entry of rightBottom) {
                if (leftTop.length > 0 && leftMiddle.length === 0 && leftBottom.length === 0) {
                    const hasBridge = middleSpans.some((middleSpan) =>
                        overlapWidth(entry, middleSpan) >= 2 && leftTop.some((exit) => overlapWidth(middleSpan, exit) >= 2)
                    )
                    if (!hasBridge) {
                        horizontalTraversalMismatches.push({
                            direction: "right",
                            fromRoom: roomData.room,
                            toRoom: roomData.left,
                            floor: "bottom",
                            columns: Array.from({ length: entry.endX - entry.startX + 1 }, (_, index) => entry.startX + index),
                            note: `room ${roomData.room} has a bottom right-side entry span ${entry.startX}-${entry.endX}, but the opposite left-side exit is top-only and lacks an intermediate climbable landing`
                        })
                    }
                }
            }

            for (const entry of leftBottom) {
                if (rightTop.length > 0 && rightMiddle.length === 0 && rightBottom.length === 0) {
                    const hasBridge = middleSpans.some((middleSpan) =>
                        overlapWidth(entry, middleSpan) >= 2 && rightTop.some((exit) => overlapWidth(middleSpan, exit) >= 2)
                    )
                    if (!hasBridge) {
                        horizontalTraversalMismatches.push({
                            direction: "left",
                            fromRoom: roomData.room,
                            toRoom: roomData.right,
                            floor: "bottom",
                            columns: Array.from({ length: entry.endX - entry.startX + 1 }, (_, index) => entry.startX + index),
                            note: `room ${roomData.room} has a bottom left-side entry span ${entry.startX}-${entry.endX}, but the opposite right-side exit is top-only and lacks an intermediate climbable landing`
                        })
                    }
                }
            }
        }

        if (roomData.right > 0) {
            const neighbor = analysesByRoom.get(roomData.right)
            const neighborRoom = roomsByNumber.get(roomData.right)
            if (neighbor) {
                for (const floorRule of FLOOR_RULES) {
                    const currentFloor = getFloorAnalysis(current, floorRule.name)
                    const neighborFloor = getFloorAnalysis(neighbor, floorRule.name)
                    const hasCurrentEdgeLanding = currentFloor?.stableColumns.includes(15) || false
                    const hasNeighborEdgeLanding = neighborFloor?.stableColumns.includes(0) || false
                    if (hasCurrentEdgeLanding && !hasNeighborEdgeLanding) {
                        unsafeHorizontalTransitionMismatches.push({
                            direction: "right",
                            fromRoom: roomData.room,
                            toRoom: roomData.right,
                            floor: floorRule.name,
                            columns: [15],
                            note: `room ${roomData.room} can transition right from ${floorRule.name} support at x=15, but room ${roomData.right} has no same-floor landing at x=0 so Conrad will immediately fall after crossing`
                        })
                    }
                }
                for (const floor of neighbor.floorAnalyses) {
                    const currentStable = stableByFloor.get(floor.rule.name) || new Set<number>()
                    const neighborStable = new Set(floor.stableColumns)
                    if (currentStable.has(15) && !neighborStable.has(0)) {
                        horizontalMismatches.push({
                            direction: "right",
                            fromRoom: roomData.room,
                            toRoom: roomData.right,
                            floor: floor.rule.name,
                            note: `room ${roomData.room} has stable ${floor.rule.name} support at x=15 but room ${roomData.right} lacks matching support at x=0`
                        })
                    }
                }
                for (const floorRule of FLOOR_RULES) {
                    const tunnelSpan = getEdgeSomersaultTunnelSpan(current, floorRule.name, "right")
                    if (!tunnelSpan) {
                        continue
                    }
                    if (!canSomersaultPassAtEdge(neighborRoom, floorRule.name, "left")) {
                        somersaultTunnelMismatches.push({
                            direction: "right",
                            fromRoom: roomData.room,
                            toRoom: roomData.right,
                            floor: floorRule.name,
                            columns: [15],
                            note: `1-high ${floorRule.name} somersault tunnel at room ${roomData.room} x=15 does not match a valid left-edge opening/tunnel in room ${roomData.right}`
                        })
                    }
                }
            }
        }
        if (roomData.right <= 0) {
            for (const floor of current.floorAnalyses) {
                if (floor.stableColumns.includes(15)) {
                    lethalSideExitMismatches.push({
                        direction: "right",
                        fromRoom: roomData.room,
                        toRoom: 0,
                        floor: floor.rule.name,
                        columns: [15],
                        note: `room ${roomData.room} has reachable ${floor.rule.name} support at x=15 but no right adjacency`
                    })
                }
            }
        }

        if (roomData.left > 0) {
            const neighbor = analysesByRoom.get(roomData.left)
            const neighborRoom = roomsByNumber.get(roomData.left)
            if (neighbor) {
                for (const floorRule of FLOOR_RULES) {
                    const currentFloor = getFloorAnalysis(current, floorRule.name)
                    const neighborFloor = getFloorAnalysis(neighbor, floorRule.name)
                    const hasCurrentEdgeLanding = currentFloor?.stableColumns.includes(0) || false
                    const hasNeighborEdgeLanding = neighborFloor?.stableColumns.includes(15) || false
                    if (hasCurrentEdgeLanding && !hasNeighborEdgeLanding) {
                        unsafeHorizontalTransitionMismatches.push({
                            direction: "left",
                            fromRoom: roomData.room,
                            toRoom: roomData.left,
                            floor: floorRule.name,
                            columns: [0],
                            note: `room ${roomData.room} can transition left from ${floorRule.name} support at x=0, but room ${roomData.left} has no same-floor landing at x=15 so Conrad will immediately fall after crossing`
                        })
                    }
                }
                for (const floor of neighbor.floorAnalyses) {
                    const currentStable = stableByFloor.get(floor.rule.name) || new Set<number>()
                    const neighborStable = new Set(floor.stableColumns)
                    if (currentStable.has(0) && !neighborStable.has(15)) {
                        horizontalMismatches.push({
                            direction: "left",
                            fromRoom: roomData.room,
                            toRoom: roomData.left,
                            floor: floor.rule.name,
                            note: `room ${roomData.room} has stable ${floor.rule.name} support at x=0 but room ${roomData.left} lacks matching support at x=15`
                        })
                    }
                }
                for (const floorRule of FLOOR_RULES) {
                    const tunnelSpan = getEdgeSomersaultTunnelSpan(current, floorRule.name, "left")
                    if (!tunnelSpan) {
                        continue
                    }
                    if (!canSomersaultPassAtEdge(neighborRoom, floorRule.name, "right")) {
                        somersaultTunnelMismatches.push({
                            direction: "left",
                            fromRoom: roomData.room,
                            toRoom: roomData.left,
                            floor: floorRule.name,
                            columns: [0],
                            note: `1-high ${floorRule.name} somersault tunnel at room ${roomData.room} x=0 does not match a valid right-edge opening/tunnel in room ${roomData.left}`
                        })
                    }
                }
            }
        }
        if (roomData.left <= 0) {
            for (const floor of current.floorAnalyses) {
                if (floor.stableColumns.includes(0)) {
                    lethalSideExitMismatches.push({
                        direction: "left",
                        fromRoom: roomData.room,
                        toRoom: 0,
                        floor: floor.rule.name,
                        columns: [0],
                        note: `room ${roomData.room} has reachable ${floor.rule.name} support at x=0 but no left adjacency`
                    })
                }
            }
        }

        if (roomData.down > 0 && current.hasExpectedShape) {
            const neighbor = analysesByRoom.get(roomData.down)
            if (neighbor) {
                const neighborTopStable = new Set((neighbor.floorAnalyses.find((floor) => floor.rule.name === "top")?.stableColumns) || [])
                const grid = currentRoom?.grid
                if (!grid) {
                    continue
                }
                const openBottomColumns: number[] = []
                for (let x = 0; x < 16; ++x) {
                    if (grid[6][x] === 0) {
                        openBottomColumns.push(x)
                    }
                }
                const mismatchedColumns = openBottomColumns.filter((x) => !neighborTopStable.has(x))
                if (mismatchedColumns.length) {
                    verticalFallLandingMismatches.push({
                        direction: "down",
                        fromRoom: roomData.room,
                        toRoom: roomData.down,
                        columns: mismatchedColumns,
                        note: `falling from room ${roomData.room} into room ${roomData.down} will not land on top-floor support at these columns`
                    })
                    verticalWarnings.push({
                        direction: "down",
                        fromRoom: roomData.room,
                        toRoom: roomData.down,
                        columns: mismatchedColumns,
                        note: `open bottom edge in room ${roomData.room} does not line up with top-floor stable support in room ${roomData.down}`
                    })
                }
            }
        }

        if (roomData.up > 0 && roomData.down > 0 && current.hasExpectedShape) {
            const grid = currentRoom?.grid
            if (!grid) {
                continue
            }
            const openTopColumns = getOpenTopColumns(grid)
            const openBottomColumns = getOpenBottomColumns(grid)
            if (!hasConnectedVerticalPassage(grid, openTopColumns, openBottomColumns)) {
                disconnectedVerticalPassages.push({
                    direction: "down",
                    fromRoom: roomData.room,
                    toRoom: roomData.down,
                    columns: openBottomColumns.slice(),
                    note: `room ${roomData.room} has top and bottom exits, but its open space does not connect them`
                })
            } else {
                const middleStableColumns = current.floorAnalyses.find((floor) => floor.rule.name === "middle")?.stableColumns || []
                const bottomStableColumns = current.floorAnalyses.find((floor) => floor.rule.name === "bottom")?.stableColumns || []
                if (middleStableColumns.length === 0 && bottomStableColumns.length === 0 && !hasDirectVerticalFallColumn(grid, openTopColumns, openBottomColumns)) {
                    disconnectedVerticalPassages.push({
                        direction: "down",
                        fromRoom: roomData.room,
                        toRoom: roomData.down,
                        columns: openBottomColumns.slice(),
                        note: `room ${roomData.room} is a shaft-only vertical room, but it has no uninterrupted open fall column from top to bottom`
                    })
                }
            }
        }

        if (roomData.down > 0 && roomData.up > 0 && current.hasExpectedShape) {
            const grid = currentRoom?.grid
            const neighborRoom = roomsByNumber.get(roomData.up)
            if (!grid || !neighborRoom) {
                continue
            }
            const topStableColumns = current.floorAnalyses.find((floor) => floor.rule.name === "top")?.stableColumns || []
            const openTopColumns = getOpenTopColumns(grid)
            const candidateUpTransitionColumns = new Set(getOpenBottomColumns(neighborRoom.grid))
            const exposedTopLandingColumns = topStableColumns.filter((x) => openTopColumns.includes(x) && candidateUpTransitionColumns.has(x))
            if (hasUnsafeDirectDropFromTopToBottom(grid, exposedTopLandingColumns)) {
                unsafeVerticalDrops.push({
                    direction: "down",
                    fromRoom: roomData.room,
                    toRoom: roomData.down,
                    columns: exposedTopLandingColumns.slice(),
                    note: `room ${roomData.room} allows a direct fall from its top landing to the room below without an intermediate survivable landing`
                })
            }
        }

        if (roomData.down <= 0 && current.hasExpectedShape) {
            const grid = currentRoom?.grid
            if (!grid) {
                continue
            }
            const lethalSpans = getReachableOpenBottomSpans(current, grid)
            if (lethalSpans.length > 0) {
                const lethalColumns: number[] = []
                for (const span of lethalSpans) {
                    for (let x = span.startX; x <= span.endX; ++x) {
                        lethalColumns.push(x)
                    }
                }
                lethalBottomPitMismatches.push({
                    direction: "down",
                    fromRoom: roomData.room,
                    toRoom: 0,
                    columns: lethalColumns,
                    note: `room ${roomData.room} has a reachable open bottom span without a down exit`
                })
            }
        }

        if (roomData.up > 0 && current.hasExpectedShape) {
            const neighbor = analysesByRoom.get(roomData.up)
            const neighborRoom = roomsByNumber.get(roomData.up)
            if (neighbor) {
                const grid = currentRoom?.grid
                if (!grid || !neighborRoom) {
                    continue
                }
                const openTopColumns = getOpenTopColumns(grid)
                const neighborOpenBottomColumns: number[] = []
                for (const span of getOpenBottomSpans(neighborRoom.grid)) {
                    for (let x = span.startX; x <= span.endX; ++x) {
                        neighborOpenBottomColumns.push(x)
                    }
                }
                const candidateUpTransitionColumns = new Set(neighborOpenBottomColumns)
                const topStableColumns = new Set((current.floorAnalyses.find((floor) => floor.rule.name === "top")?.stableColumns) || [])
                const topStableWithoutEntrance = Array.from(topStableColumns).filter((x) => candidateUpTransitionColumns.has(x) && !openTopColumns.includes(x))
                if (topStableWithoutEntrance.length) {
                    verticalWarnings.push({
                        direction: "up",
                        fromRoom: roomData.room,
                        toRoom: roomData.up,
                        columns: topStableWithoutEntrance,
                        note: `room ${roomData.room} has top-floor landing support without a matching open top edge for its up exit`
                    })
                }
                const exposedTopLandingColumns = openTopColumns.filter((x) => topStableColumns.has(x))
                const mismatchedEdgeColumns = exposedTopLandingColumns.filter((x) => !candidateUpTransitionColumns.has(x))
                if (mismatchedEdgeColumns.length) {
                    verticalEdgeMismatches.push({
                        direction: "up",
                        fromRoom: roomData.room,
                        toRoom: roomData.up,
                        columns: mismatchedEdgeColumns,
                        note: `open top-edge landing columns in room ${roomData.room} do not match the open bottom edge in room ${roomData.up}`
                    })
                }
                const blockedTopClimbColumns = Array.from(topStableColumns).filter((x) => grid[0][x] === 0 && !candidateUpTransitionColumns.has(x))
                if (blockedTopClimbColumns.length) {
                    blockedTopClimbMismatches.push({
                        direction: "up",
                        fromRoom: roomData.room,
                        toRoom: roomData.up,
                        columns: blockedTopClimbColumns,
                        note: `room ${roomData.room} has open top-row climb columns that do not connect to an open bottom edge in room ${roomData.up}`
                    })
                }
            }
        }

        for (const floor of current.floorAnalyses) {
            if (floor.rule.name === "bottom") {
                continue
            }
            for (const span of floor.spans) {
                const reachableFromBelow = hasLowerFloorConnection(current, floor.rule.name, span)
                const reachableFromSide = hasHorizontalNeighborConnection(roomData, analysesByRoom, floor.rule.name, span)
                const reachableFromAbove = floor.rule.name === "top" && hasVerticalFallConnectionFromAbove(roomData, analysesByRoom, roomsByNumber, span)
                const reachableByDroppingFromHigherFloor = hasHigherFloorDropConnection(current, floor.rule.name, span)
                if (!reachableFromBelow && !reachableFromSide && !reachableFromAbove && !reachableByDroppingFromHigherFloor) {
                    unreachablePlatforms.push({
                        room: roomData.room,
                        floor: floor.rule.name,
                        span,
                        note: `room ${roomData.room} ${floor.rule.name} span ${span.startX}-${span.endX} has no lower-floor overlap, no matching same-floor adjacent-room edge, no same-room drop path from the floor above, and no aligned fall path from the room above`
                    })
                }
            }
        }

    }

    const traversalStartRoom = level.traversalStartRoom
    const activeRooms = level.adjacencyRooms
        .filter((roomData) => [roomData.up, roomData.down, roomData.left, roomData.right].some((room) => room > 0))
        .map((roomData) => roomData.room)
        .filter((room, index, rooms) => rooms.indexOf(room) === index)
        .filter((room) => analysesByRoom.has(room))
        .sort((a, b) => a - b)

    const startRoom = traversalStartRoom !== null && analysesByRoom.has(traversalStartRoom)
        ? traversalStartRoom
        : (activeRooms[0] ?? null)
    if (startRoom !== null) {
        const reachable = new Set<number>([startRoom])
        const queue: number[] = [startRoom]
        const roomDataByRoom = new Map<number, RoomAdjacency>(level.adjacencyRooms.map((roomData) => [roomData.room, roomData]))

        while (queue.length > 0) {
            const room = queue.shift()!
            const roomData = roomDataByRoom.get(room)
            const analysis = analysesByRoom.get(room)
            if (!roomData || !analysis) {
                continue
            }
            for (const nextRoom of getTraversableNeighborRooms(roomData, analysis, analysesByRoom, roomsByNumber)) {
                if (!reachable.has(nextRoom)) {
                    reachable.add(nextRoom)
                    queue.push(nextRoom)
                }
            }
        }

        for (const room of activeRooms) {
            if (!reachable.has(room)) {
                globallyUnreachableRooms.push({
                    room,
                    note: `room ${room} is not reachable from start room ${startRoom} through the current traversable room graph`
                })
            }
        }
    }

    for (const roomData of level.adjacencyRooms) {
        const current = analysesByRoom.get(roomData.room)
        if (!current || !current.hasExpectedShape) {
            continue
        }
        const adjacencyCount = [roomData.up, roomData.down, roomData.left, roomData.right].filter((value) => value > 0).length
        const topStableCount = getFloorAnalysis(current, "top")?.stableColumns.length || 0
        const middleStableCount = getFloorAnalysis(current, "middle")?.stableColumns.length || 0
        const interiorSolidCount = countInteriorSolidCells(roomsByNumber.get(roomData.room)?.grid || [])
        if (adjacencyCount >= 2 && topStableCount === 0 && middleStableCount === 0 && interiorSolidCount <= 4) {
            sparseRoomContentRooms.push({
                room: roomData.room,
                note: `room ${roomData.room} has ${adjacencyCount} adjacencies but almost no internal top/middle content`
            })
        }
    }

    return {
        levelName: level.levelName,
        traversalStartRoom,
        horizontalMismatches,
        horizontalTraversalMismatches,
        unsafeHorizontalTransitionMismatches,
        somersaultTunnelMismatches,
        lethalSideExitMismatches,
        verticalEdgeMismatches,
        blockedTopClimbMismatches,
        unsafeVerticalDrops,
        verticalFallLandingMismatches,
        lethalBottomPitMismatches,
        disconnectedVerticalPassages,
        verticalWarnings,
        globallyUnreachableRooms,
        sparseRoomContentRooms,
        unreachablePlatforms
    }
}

function analyzeAdjacencyConsistency(filePaths: string[]): AdjacencyCheckResult | null {
    const level = loadLevelGridModel(filePaths)
    if (!level) {
        return null
    }
    return analyzeAdjacencyConsistencyForModel(level)
}

function getClusterLocalIssueCount(level: LoadedLevelGridModel, rooms: Set<number>): number {
    let count = 0
    for (const roomNumber of Array.from(rooms)) {
        const analysis = level.analysesByRoom.get(roomNumber)
        if (!analysis) {
            continue
        }
        const hasAnyStandingSpace = analysis.floorAnalyses.some((floor) => floor.stableColumns.length > 0)
        if (!analysis.hasExpectedShape) {
            count += 1
        }
        if (!analysis.hasOnlyBinaryValues) {
            count += 1
        }
        if (!hasAnyStandingSpace) {
            count += 1
        }
        if (analysis.misalignedTopFloor.columns.length > 0) {
            count += 1
        }
        if (analysis.oddSolidRunsByRow.some((spans) => spans.length > 0)) {
            count += 1
        }
        if (analysis.fakeShelfRunsByRow.some((spans) => spans.length > 0)) {
            count += 1
        }
        if (analysis.nonWalkableTopSurfaceRunsByRow.some((spans) => spans.length > 0)) {
            count += 1
        }
        if (analysis.somersaultTunnelIssues.length > 0) {
            count += 1
        }
        if (analysis.oneStepObstaclePairs.length > 0) {
            count += 1
        }
        if (analysis.enclosedVoidRegions.length > 0) {
            count += 1
        }
    }
    return count
}

function getClusterAdjacencyIssueCount(adjacency: AdjacencyCheckResult, rooms: Set<number>): number {
    let count = 0
    const touchesRoom = (issue: { fromRoom: number, toRoom?: number, room?: number }) => rooms.has(issue.fromRoom) || (typeof issue.toRoom === "number" && rooms.has(issue.toRoom)) || (typeof issue.room === "number" && rooms.has(issue.room))
    count += adjacency.horizontalMismatches.filter(touchesRoom).length
    count += adjacency.horizontalTraversalMismatches.filter(touchesRoom).length
    count += adjacency.unsafeHorizontalTransitionMismatches.filter(touchesRoom).length
    count += adjacency.somersaultTunnelMismatches.filter(touchesRoom).length
    count += adjacency.lethalSideExitMismatches.filter(touchesRoom).length
    count += adjacency.verticalEdgeMismatches.filter(touchesRoom).length
    count += adjacency.blockedTopClimbMismatches.filter(touchesRoom).length
    count += adjacency.unsafeVerticalDrops.filter(touchesRoom).length
    count += adjacency.verticalFallLandingMismatches.filter(touchesRoom).length
    count += adjacency.lethalBottomPitMismatches.filter(touchesRoom).length
    count += adjacency.disconnectedVerticalPassages.filter(touchesRoom).length
    count += adjacency.verticalWarnings.filter(touchesRoom).length
    count += adjacency.unreachablePlatforms.filter((issue) => rooms.has(issue.room)).length
    count += adjacency.globallyUnreachableRooms.filter((issue) => rooms.has(issue.room)).length
    count += adjacency.sparseRoomContentRooms.filter((issue) => rooms.has(issue.room)).length
    return count
}

function getClusterScore(level: LoadedLevelGridModel, rooms: Set<number>): number {
    const adjacency = analyzeAdjacencyConsistencyForModel(level)
    return getClusterAdjacencyIssueCount(adjacency, rooms) * 100 + getClusterLocalIssueCount(level, rooms)
}

function getRoomAdjacency(level: LoadedLevelGridModel, room: number): RoomAdjacency | undefined {
    return level.adjacencyRooms.find((row) => row.room === room)
}

function getFloorRule(floor: FloorName): FloorRule {
    return FLOOR_RULES.find((rule) => rule.name === floor)!
}

function setStableSupportOnEdge(grid: number[][], floor: FloorName, side: "left" | "right", enabled: boolean) {
    const rule = getFloorRule(floor)
    const columns = side === "left" ? [0, 1] : [14, 15]
    for (const x of columns) {
        grid[rule.clearanceRow][x] = 0
        grid[rule.supportRow][x] = enabled ? 1 : 0
    }
}

function addMiddleBridgeToOppositeExit(level: LoadedLevelGridModel, room: number, entrySide: "left" | "right"): boolean {
    const loaded = level.roomsByNumber.get(room)
    const analysis = level.analysesByRoom.get(room)
    if (!loaded || !analysis) {
        return false
    }
    const grid = loaded.grid
    const topSpans = getFloorAnalysis(analysis, "top")?.spans || []
    const edgeSpans = topSpans.filter((span) => entrySide === "left" ? span.endX === 15 : span.startX === 0)
    if (edgeSpans.length === 0) {
        return false
    }
    setStableSupportOnEdge(grid, "middle", entrySide === "left" ? "right" : "left", true)
    return true
}

function openVerticalPassageColumns(level: LoadedLevelGridModel, room: number, columns: number[]): boolean {
    const loaded = level.roomsByNumber.get(room)
    if (!loaded) {
        return false
    }
    for (const x of columns) {
        for (let y = 0; y < loaded.grid.length; ++y) {
            loaded.grid[y][x] = 0
        }
    }
    return true
}

function lowerUnreachableSpan(level: LoadedLevelGridModel, room: number, floor: FloorName, span: FloorSpan): boolean {
    const loaded = level.roomsByNumber.get(room)
    if (!loaded) {
        return false
    }
    const loweredTo: FloorName = floor === "top" ? "middle" : "bottom"
    const rule = getFloorRule(loweredTo)
    for (let x = span.startX; x <= span.endX; ++x) {
        loaded.grid[rule.clearanceRow][x] = 0
        loaded.grid[rule.supportRow][x] = 1
    }
    return true
}

function fillEnclosedVoidRegionsInMemory(level: LoadedLevelGridModel, room: number): boolean {
    const loaded = level.roomsByNumber.get(room)
    const analysis = level.analysesByRoom.get(room)
    if (!loaded || !analysis || !analysis.hasExpectedShape || analysis.enclosedVoidRegions.length === 0) {
        return false
    }
    let changed = false
    for (const region of analysis.enclosedVoidRegions) {
        for (const cell of region.cells) {
            if (loaded.grid[cell.y][cell.x] !== 1) {
                loaded.grid[cell.y][cell.x] = 1
                changed = true
            }
        }
    }
    return changed
}

function fixOneStepObstaclesInMemory(level: LoadedLevelGridModel, room: number): boolean {
    const loaded = level.roomsByNumber.get(room)
    const analysis = level.analysesByRoom.get(room)
    if (!loaded || !analysis || !analysis.hasExpectedShape || analysis.oneStepObstaclePairs.length === 0) {
        return false
    }
    let changed = false
    const seen = new Set<string>()
    for (const pair of analysis.oneStepObstaclePairs) {
        const raisedToY = Math.min(pair.leftTopY, pair.rightTopY)
        const targetX = pair.leftTopY > pair.rightTopY ? pair.leftX : pair.rightX
        const key = `${targetX},${raisedToY}`
        if (seen.has(key)) {
            continue
        }
        if (loaded.grid[raisedToY][targetX] !== 1) {
            loaded.grid[raisedToY][targetX] = 1
            changed = true
        }
        seen.add(key)
    }
    return changed
}

function fixOddSolidRunParityInMemory(level: LoadedLevelGridModel, room: number): boolean {
    const loaded = level.roomsByNumber.get(room)
    const analysis = level.analysesByRoom.get(room)
    if (!loaded || !analysis || !analysis.hasExpectedShape) {
        return false
    }
    let changed = false
    for (let y = 0; y < analysis.oddSolidRunsByRow.length; ++y) {
        for (const span of analysis.oddSolidRunsByRow[y]) {
            const tryRight = span.endX + 1
            const tryLeft = span.startX - 1
            if (tryRight < analysis.width) {
                if (loaded.grid[y][tryRight] !== 1) {
                    loaded.grid[y][tryRight] = 1
                    changed = true
                }
                continue
            }
            if (tryLeft >= 0) {
                if (loaded.grid[y][tryLeft] !== 1) {
                    loaded.grid[y][tryLeft] = 1
                    changed = true
                }
                continue
            }
            if (loaded.grid[y][span.endX] !== 0) {
                loaded.grid[y][span.endX] = 0
                changed = true
            }
        }
    }
    return changed
}

function fixMisalignedTopFloorSupportInMemory(level: LoadedLevelGridModel, room: number): boolean {
    const loaded = level.roomsByNumber.get(room)
    const analysis = level.analysesByRoom.get(room)
    if (!loaded || !analysis || !analysis.hasExpectedShape || analysis.misalignedTopFloor.columns.length === 0) {
        return false
    }
    let changed = false
    for (const x of analysis.misalignedTopFloor.columns) {
        if (loaded.grid[2][x] !== 1) {
            loaded.grid[2][x] = 1
            changed = true
        }
    }
    return changed
}

function sealReachableSideExit(level: LoadedLevelGridModel, room: number, side: "left" | "right", floor?: FloorName): boolean {
    const loaded = level.roomsByNumber.get(room)
    if (!loaded) {
        return false
    }
    const columns = side === "left" ? [0, 1] : [14, 15]
    let rows: number[] = []
    if (floor) {
        const rule = getFloorRule(floor)
        rows = [rule.clearanceRow, rule.supportRow]
    } else {
        rows = [0, 1, 2, 3, 4, 5, 6]
    }
    let changed = false
    for (const y of rows) {
        for (const x of columns) {
            if (loaded.grid[y][x] !== 1) {
                loaded.grid[y][x] = 1
                changed = true
            }
        }
    }
    return changed
}

function openVerticalEdgeColumns(level: LoadedLevelGridModel, room: number, edge: "top" | "bottom", columns: number[]): boolean {
    const loaded = level.roomsByNumber.get(room)
    if (!loaded) {
        return false
    }
    const y = edge === "top" ? 0 : (loaded.grid.length - 1)
    let changed = false
    for (const x of columns) {
        if (loaded.grid[y][x] !== 0) {
            loaded.grid[y][x] = 0
            changed = true
        }
    }
    return changed
}

function sealVerticalEdgeColumns(level: LoadedLevelGridModel, room: number, edge: "top" | "bottom", columns: number[]): boolean {
    const loaded = level.roomsByNumber.get(room)
    if (!loaded) {
        return false
    }
    const y = edge === "top" ? 0 : (loaded.grid.length - 1)
    let changed = false
    for (const x of columns) {
        if (loaded.grid[y][x] !== 1) {
            loaded.grid[y][x] = 1
            changed = true
        }
    }
    return changed
}

function addTopLandingSupport(level: LoadedLevelGridModel, room: number, columns: number[]): boolean {
    const loaded = level.roomsByNumber.get(room)
    if (!loaded) {
        return false
    }
    let changed = false
    for (const x of columns) {
        if (loaded.grid[1][x] !== 0) {
            loaded.grid[1][x] = 0
            changed = true
        }
        if (loaded.grid[2][x] !== 1) {
            loaded.grid[2][x] = 1
            changed = true
        }
    }
    return changed
}

function sealReachableBottomColumns(level: LoadedLevelGridModel, room: number, columns: number[]): boolean {
    const loaded = level.roomsByNumber.get(room)
    if (!loaded) {
        return false
    }
    let changed = false
    for (const x of columns) {
        if (loaded.grid[6][x] !== 1) {
            loaded.grid[6][x] = 1
            changed = true
        }
    }
    return changed
}

function addIntermediateLandingForDrop(level: LoadedLevelGridModel, room: number, columns: number[]): boolean {
    const loaded = level.roomsByNumber.get(room)
    if (!loaded) {
        return false
    }
    let changed = false
    for (const x of columns) {
        if (loaded.grid[3][x] !== 0) {
            loaded.grid[3][x] = 0
            changed = true
        }
        if (loaded.grid[4][x] !== 1) {
            loaded.grid[4][x] = 1
            changed = true
        }
    }
    return changed
}

function addSparseRoomContent(level: LoadedLevelGridModel, room: number): boolean {
    const loaded = level.roomsByNumber.get(room)
    if (!loaded) {
        return false
    }
    const topReserved = new Set<number>()
    const bottomReserved = new Set<number>()
    for (let x = 0; x < loaded.grid[0].length; ++x) {
        if (loaded.grid[0][x] === 0) {
            topReserved.add(x)
        }
        if (loaded.grid[6][x] === 0) {
            bottomReserved.add(x)
        }
    }

    const addSupportSegment = (clearanceRow: number, supportRow: number, startX: number, endX: number, reserved: Set<number>) => {
        let blocked = false
        for (let x = startX; x <= endX; ++x) {
            if (reserved.has(x)) {
                blocked = true
                break
            }
        }
        if (blocked) {
            return false
        }
        let changed = false
        for (let x = startX; x <= endX; ++x) {
            if (loaded.grid[clearanceRow][x] !== 0) {
                loaded.grid[clearanceRow][x] = 0
                changed = true
            }
            if (loaded.grid[supportRow][x] !== 1) {
                loaded.grid[supportRow][x] = 1
                changed = true
            }
        }
        return changed
    }

    let changed = false
    const middleCandidates: Array<[number, number]> = [[4, 7], [8, 11], [2, 5], [10, 13]]
    let addedMiddle = 0
    for (const [startX, endX] of middleCandidates) {
        if (addSupportSegment(3, 4, startX, endX, bottomReserved)) {
            changed = true
            addedMiddle += 1
        }
        if (addedMiddle >= 2) {
            break
        }
    }

    const topCandidates: Array<[number, number]> = [[4, 7], [8, 11], [10, 13]]
    let addedTop = 0
    for (const [startX, endX] of topCandidates) {
        if (addSupportSegment(1, 2, startX, endX, topReserved)) {
            changed = true
            addedTop += 1
        }
        if (addedTop >= 2) {
            break
        }
    }

    return changed
}

function clearSpanCells(level: LoadedLevelGridModel, room: number, y: number, span: FloorSpan): boolean {
    const loaded = level.roomsByNumber.get(room)
    if (!loaded || y < 0 || y >= loaded.grid.length) {
        return false
    }
    let changed = false
    for (let x = span.startX; x <= span.endX; ++x) {
        if (loaded.grid[y][x] !== 0) {
            loaded.grid[y][x] = 0
            changed = true
        }
    }
    return changed
}

function clearNonWalkableTopSurfaces(level: LoadedLevelGridModel, room: number): boolean {
    const analysis = level.analysesByRoom.get(room)
    if (!analysis || !analysis.hasExpectedShape) {
        return false
    }
    let changed = false
    for (let y = 0; y < analysis.nonWalkableTopSurfaceRunsByRow.length; ++y) {
        for (const span of analysis.nonWalkableTopSurfaceRunsByRow[y]) {
            changed = clearSpanCells(level, room, y, span) || changed
        }
    }
    return changed
}

function clearFakeShelves(level: LoadedLevelGridModel, room: number): boolean {
    const analysis = level.analysesByRoom.get(room)
    if (!analysis || !analysis.hasExpectedShape) {
        return false
    }
    let changed = false
    for (let y = 0; y < analysis.fakeShelfRunsByRow.length; ++y) {
        for (const span of analysis.fakeShelfRunsByRow[y]) {
            changed = clearSpanCells(level, room, y, span) || changed
        }
    }
    return changed
}

function removeStableSpan(level: LoadedLevelGridModel, room: number, floor: FloorName, span: FloorSpan): boolean {
    const loaded = level.roomsByNumber.get(room)
    if (!loaded) {
        return false
    }
    const rule = getFloorRule(floor)
    let changed = false
    for (let x = span.startX; x <= span.endX; ++x) {
        if (loaded.grid[rule.supportRow][x] !== 0) {
            loaded.grid[rule.supportRow][x] = 0
            changed = true
        }
    }
    return changed
}

function addHorizontalEntryLanding(level: LoadedLevelGridModel, room: number, direction: "left" | "right", floor?: FloorName, columns?: number[]): boolean {
    const loaded = level.roomsByNumber.get(room)
    if (!loaded || !floor) {
        return false
    }
    const rule = getFloorRule(floor)
    const targetColumns = columns && columns.length > 0
        ? columns
        : (direction === "left" ? [0, 1] : [14, 15])
    let changed = false
    for (const x of targetColumns) {
        if (loaded.grid[rule.clearanceRow][x] !== 0) {
            loaded.grid[rule.clearanceRow][x] = 0
            changed = true
        }
        if (loaded.grid[rule.supportRow][x] !== 1) {
            loaded.grid[rule.supportRow][x] = 1
            changed = true
        }
    }
    return changed
}

function sealBlockedTopClimbColumns(level: LoadedLevelGridModel, room: number, columns: number[]): boolean {
    const loaded = level.roomsByNumber.get(room)
    if (!loaded) {
        return false
    }
    let changed = false
    for (const x of columns) {
        if (loaded.grid[0][x] !== 1) {
            loaded.grid[0][x] = 1
            changed = true
        }
    }
    return changed
}

function widenSomersaultTunnelEndpoint(level: LoadedLevelGridModel, room: number, issue: { floor: FloorName | null, startX: number, endX: number, note: string }): boolean {
    const loaded = level.roomsByNumber.get(room)
    if (!loaded || !issue.floor) {
        return false
    }
    const rule = getFloorRule(issue.floor)
    const isBeginIssue = issue.note.includes("does not begin")
    const isEndIssue = issue.note.includes("does not end")
    const targetX = isBeginIssue ? issue.startX - 1 : (isEndIssue ? issue.endX + 1 : -1)
    if (targetX < 0 || targetX >= loaded.grid[0].length) {
        return false
    }
    let changed = false
    if (loaded.grid[rule.clearanceRow][targetX] !== 0) {
        loaded.grid[rule.clearanceRow][targetX] = 0
        changed = true
    }
    if (loaded.grid[rule.clearanceRow - 1][targetX] !== 0) {
        loaded.grid[rule.clearanceRow - 1][targetX] = 0
        changed = true
    }
    return changed
}

function splitSomersaultTunnel(level: LoadedLevelGridModel, room: number, issue: { row: number, startX: number, endX: number }): boolean {
    const loaded = level.roomsByNumber.get(room)
    if (!loaded || issue.endX - issue.startX + 1 <= 4) {
        return false
    }
    const x = Math.floor((issue.startX + issue.endX) / 2)
    if (x < 0 || x >= loaded.grid[0].length) {
        return false
    }
    if (loaded.grid[issue.row][x] === 1) {
        return false
    }
    loaded.grid[issue.row][x] = 1
    return true
}

function toggleHorizontalMismatch(level: LoadedLevelGridModel, issue: EdgeConsistencyIssue, mode: "add_neighbor" | "remove_source"): boolean {
    const sourceRoom = level.roomsByNumber.get(issue.fromRoom)
    const targetRoom = issue.toRoom > 0 ? level.roomsByNumber.get(issue.toRoom) : undefined
    if (!issue.floor) {
        return false
    }

    if (mode === "add_neighbor" && targetRoom) {
        setStableSupportOnEdge(targetRoom.grid, issue.floor, issue.direction === "right" ? "left" : "right", true)
        return true
    }
    if (mode === "remove_source" && sourceRoom) {
        setStableSupportOnEdge(sourceRoom.grid, issue.floor, issue.direction === "right" ? "right" : "left", false)
        return true
    }
    return false
}

function collectClusterRepairOperations(level: LoadedLevelGridModel, rooms: Set<number>): ClusterRepairOperation[] {
    const adjacency = analyzeAdjacencyConsistencyForModel(level)
    const operations: ClusterRepairOperation[] = []
    const seen = new Set<string>()

    const pushOperation = (key: string, note: string, apply: (next: LoadedLevelGridModel) => boolean) => {
        if (seen.has(key)) {
            return
        }
        seen.add(key)
        operations.push({ key, note, apply })
    }

    const pushCellOperation = (room: number, x: number, y: number, value: 0 | 1, note: string) => {
        const loaded = level.roomsByNumber.get(room)
        if (!loaded || y < 0 || y >= loaded.grid.length || x < 0 || x >= loaded.grid[0].length) {
            return
        }
        if (loaded.grid[y][x] === value) {
            return
        }
        pushOperation(
            `cell:${room}:${x}:${y}:${value}`,
            note,
            (next) => {
                const target = next.roomsByNumber.get(room)
                if (!target || target.grid[y][x] === value) {
                    return false
                }
                target.grid[y][x] = value
                return true
            }
        )
    }

    for (const issue of adjacency.horizontalMismatches) {
        if (!rooms.has(issue.fromRoom) && !rooms.has(issue.toRoom)) {
            continue
        }
        pushOperation(
            `horizontal:add:${issue.fromRoom}:${issue.toRoom}:${issue.floor}:${issue.direction}`,
            `add matching ${issue.floor} seam for room ${issue.fromRoom} -> ${issue.toRoom}`,
            (next) => toggleHorizontalMismatch(next, issue, "add_neighbor")
        )
        pushOperation(
            `horizontal:remove:${issue.fromRoom}:${issue.toRoom}:${issue.floor}:${issue.direction}`,
            `remove mismatched ${issue.floor} seam from room ${issue.fromRoom}`,
            (next) => toggleHorizontalMismatch(next, issue, "remove_source")
        )
    }

    for (const issue of adjacency.horizontalTraversalMismatches) {
        if (!rooms.has(issue.fromRoom)) {
            continue
        }
        if (issue.direction !== "left" && issue.direction !== "right") {
            continue
        }
        const entrySide: "left" | "right" = issue.direction
        pushOperation(
            `traversal:bridge:${issue.fromRoom}:${entrySide}`,
            `add middle bridge in room ${issue.fromRoom} for ${entrySide} entry traversal`,
            (next) => addMiddleBridgeToOppositeExit(next, issue.fromRoom, entrySide)
        )
    }

    for (const issue of adjacency.unsafeHorizontalTransitionMismatches) {
        if (!rooms.has(issue.toRoom)) {
            continue
        }
        pushOperation(
            `horizontal-landing:${issue.toRoom}:${issue.direction}:${issue.floor || "unknown"}:${(issue.columns || []).join(",")}`,
            `add immediate ${issue.floor || "same-floor"} landing in room ${issue.toRoom} for ${issue.direction} entry`,
            (next) => addHorizontalEntryLanding(next, issue.toRoom, issue.direction === "left" ? "left" : "right", issue.floor, issue.columns)
        )
    }

    for (const issue of adjacency.disconnectedVerticalPassages) {
        if (!rooms.has(issue.fromRoom) || !issue.columns || issue.columns.length === 0) {
            continue
        }
        pushOperation(
            `vertical:open:${issue.fromRoom}:${issue.columns.join(",")}`,
            `open connected vertical passage in room ${issue.fromRoom} at columns [${issue.columns.join(",")}]`,
            (next) => openVerticalPassageColumns(next, issue.fromRoom, issue.columns || [])
        )
    }

    for (const issue of adjacency.unreachablePlatforms) {
        if (!rooms.has(issue.room)) {
            continue
        }
        pushOperation(
            `platform:lower:${issue.room}:${issue.floor}:${issue.span.startX}-${issue.span.endX}`,
            `lower unreachable ${issue.floor} span ${issue.span.startX}-${issue.span.endX} in room ${issue.room}`,
            (next) => lowerUnreachableSpan(next, issue.room, issue.floor, issue.span)
        )
        pushOperation(
            `platform:remove:${issue.room}:${issue.floor}:${issue.span.startX}-${issue.span.endX}`,
            `remove unreachable ${issue.floor} span ${issue.span.startX}-${issue.span.endX} in room ${issue.room}`,
            (next) => removeStableSpan(next, issue.room, issue.floor, issue.span)
        )
    }

    for (const issue of adjacency.sparseRoomContentRooms) {
        if (!rooms.has(issue.room)) {
            continue
        }
        pushOperation(
            `sparse-content:${issue.room}`,
            `add internal content to sparse room ${issue.room}`,
            (next) => addSparseRoomContent(next, issue.room)
        )
    }

    for (const issue of adjacency.lethalSideExitMismatches) {
        if (!rooms.has(issue.fromRoom)) {
            continue
        }
        const side = issue.direction === "left" ? "left" : "right"
        pushOperation(
            `side:seal:${issue.fromRoom}:${side}:${issue.floor || "all"}`,
            `seal ${side} side exit in room ${issue.fromRoom}${issue.floor ? ` at ${issue.floor}` : ""}`,
            (next) => sealReachableSideExit(next, issue.fromRoom, side, issue.floor)
        )
    }

    for (const issue of adjacency.verticalEdgeMismatches) {
        if (!rooms.has(issue.fromRoom) || !issue.columns || issue.columns.length === 0) {
            continue
        }
        pushOperation(
            `vertical-edge:open:${issue.fromRoom}:${issue.columns.join(",")}`,
            `open top edge in room ${issue.fromRoom} at columns [${issue.columns.join(",")}]`,
            (next) => openVerticalEdgeColumns(next, issue.fromRoom, "top", issue.columns || [])
        )
        pushOperation(
            `vertical-edge:seal-bottom:${issue.toRoom}:${issue.columns.join(",")}`,
            `seal unmatched bottom edge in room ${issue.toRoom} at columns [${issue.columns.join(",")}]`,
            (next) => issue.toRoom > 0 ? sealVerticalEdgeColumns(next, issue.toRoom, "bottom", issue.columns || []) : false
        )
    }

    for (const issue of adjacency.verticalFallLandingMismatches) {
        if (!rooms.has(issue.toRoom) || !issue.columns || issue.columns.length === 0) {
            continue
        }
        pushOperation(
            `landing:add-top:${issue.toRoom}:${issue.columns.join(",")}`,
            `add top landing support in room ${issue.toRoom} at columns [${issue.columns.join(",")}]`,
            (next) => addTopLandingSupport(next, issue.toRoom, issue.columns || [])
        )
        if (rooms.has(issue.fromRoom)) {
            pushOperation(
                `landing:seal-source:${issue.fromRoom}:${issue.columns.join(",")}`,
                `seal unsafe bottom fall columns in room ${issue.fromRoom} at [${issue.columns.join(",")}]`,
                (next) => sealReachableBottomColumns(next, issue.fromRoom, issue.columns || [])
            )
        }
    }

    for (const issue of adjacency.verticalWarnings) {
        if (!issue.columns || issue.columns.length === 0) {
            continue
        }
        if (issue.direction === "down" && rooms.has(issue.toRoom)) {
            pushOperation(
                `vertical-warning:landing:${issue.toRoom}:${issue.columns.join(",")}`,
                `add heuristic landing support in room ${issue.toRoom} at [${issue.columns.join(",")}]`,
                (next) => addTopLandingSupport(next, issue.toRoom, issue.columns || [])
            )
        }
        if (issue.direction === "up" && rooms.has(issue.fromRoom)) {
            pushOperation(
                `vertical-warning:seal-top:${issue.fromRoom}:${issue.columns.join(",")}`,
                `seal unmatched top opening in room ${issue.fromRoom} at [${issue.columns.join(",")}]`,
                (next) => sealVerticalEdgeColumns(next, issue.fromRoom, "top", issue.columns || [])
            )
        }
    }

    for (const issue of adjacency.lethalBottomPitMismatches) {
        if (!rooms.has(issue.fromRoom) || !issue.columns || issue.columns.length === 0) {
            continue
        }
        pushOperation(
            `bottom:seal:${issue.fromRoom}:${issue.columns.join(",")}`,
            `seal reachable bottom opening in room ${issue.fromRoom} at columns [${issue.columns.join(",")}]`,
            (next) => sealReachableBottomColumns(next, issue.fromRoom, issue.columns || [])
        )
    }

    for (const issue of adjacency.unsafeVerticalDrops) {
        if (!rooms.has(issue.fromRoom) || !issue.columns || issue.columns.length === 0) {
            continue
        }
        pushOperation(
            `drop:landing:${issue.fromRoom}:${issue.columns.join(",")}`,
            `add intermediate landing in room ${issue.fromRoom} at columns [${issue.columns.join(",")}]`,
            (next) => addIntermediateLandingForDrop(next, issue.fromRoom, issue.columns || [])
        )
    }

    for (const room of Array.from(rooms)) {
        const analysis = level.analysesByRoom.get(room)
        if (!analysis) {
            continue
        }
        if (analysis.enclosedVoidRegions.length > 0) {
            pushOperation(
                `voids:fill:${room}`,
                `fill enclosed voids in room ${room}`,
                (next) => fillEnclosedVoidRegionsInMemory(next, room)
            )
        }
        if (analysis.oneStepObstaclePairs.length > 0) {
            pushOperation(
                `steps:fix:${room}`,
                `fill one-step obstacles in room ${room}`,
                (next) => fixOneStepObstaclesInMemory(next, room)
            )
        }
        if (analysis.fakeShelfRunsByRow.some((spans) => spans.length > 0)) {
            pushOperation(
                `fake-shelves:clear:${room}`,
                `clear fake unsupported shelves in room ${room}`,
                (next) => clearFakeShelves(next, room)
            )
        }
        if (analysis.nonWalkableTopSurfaceRunsByRow.some((spans) => spans.length > 0)) {
            pushOperation(
                `non-walkable:clear:${room}`,
                `clear non-walkable top surfaces in room ${room}`,
                (next) => clearNonWalkableTopSurfaces(next, room)
            )
        }
        if (analysis.oddSolidRunsByRow.some((spans) => spans.length > 0)) {
            pushOperation(
                `parity:fix:${room}`,
                `normalize odd solid runs in room ${room}`,
                (next) => fixOddSolidRunParityInMemory(next, room)
            )
        }
        if (analysis.misalignedTopFloor.columns.length > 0) {
            pushOperation(
                `top-support:fix:${room}`,
                `raise misaligned top-floor support in room ${room}`,
                (next) => fixMisalignedTopFloorSupportInMemory(next, room)
            )
        }
        for (const issue of analysis.somersaultTunnelIssues) {
            if (issue.note.includes("does not begin") || issue.note.includes("does not end")) {
                pushOperation(
                    `somersault:endpoint:${room}:${issue.row}:${issue.startX}-${issue.endX}:${issue.note}`,
                    `widen somersault endpoint in room ${room} for ${issue.floor || `row ${issue.row}`} tunnel ${issue.startX}-${issue.endX}`,
                    (next) => widenSomersaultTunnelEndpoint(next, room, issue)
                )
            }
            if (issue.note.includes("longer than 4 cells")) {
                pushOperation(
                    `somersault:split:${room}:${issue.row}:${issue.startX}-${issue.endX}`,
                    `split long somersault tunnel in room ${room} at ${issue.startX}-${issue.endX}`,
                    (next) => splitSomersaultTunnel(next, room, issue)
                )
            }
        }

        for (let y = 0; y < analysis.oddSolidRunsByRow.length; ++y) {
            for (const span of analysis.oddSolidRunsByRow[y]) {
                pushCellOperation(room, span.endX + 1, y, 1, `set room ${room} cell (${span.endX + 1},${y}) to 1 for parity`)
                pushCellOperation(room, span.startX - 1, y, 1, `set room ${room} cell (${span.startX - 1},${y}) to 1 for parity`)
                pushCellOperation(room, span.endX, y, 0, `set room ${room} cell (${span.endX},${y}) to 0 for parity`)
            }
        }
        for (const pair of analysis.oneStepObstaclePairs) {
            const raisedToY = Math.min(pair.leftTopY, pair.rightTopY)
            const targetX = pair.leftTopY > pair.rightTopY ? pair.leftX : pair.rightX
            pushCellOperation(room, targetX, raisedToY, 1, `set room ${room} cell (${targetX},${raisedToY}) to 1 for stair-step fix`)
        }
        for (const x of analysis.misalignedTopFloor.columns) {
            pushCellOperation(room, x, 2, 1, `set room ${room} cell (${x},2) to 1 for top support`)
        }
        for (let y = 0; y < analysis.fakeShelfRunsByRow.length; ++y) {
            for (const span of analysis.fakeShelfRunsByRow[y]) {
                for (let x = span.startX; x <= span.endX; ++x) {
                    pushCellOperation(room, x, y, 0, `clear fake shelf cell in room ${room} at (${x},${y})`)
                }
            }
        }
        for (let y = 0; y < analysis.nonWalkableTopSurfaceRunsByRow.length; ++y) {
            for (const span of analysis.nonWalkableTopSurfaceRunsByRow[y]) {
                for (let x = span.startX; x <= span.endX; ++x) {
                    pushCellOperation(room, x, y, 0, `clear non-walkable top surface in room ${room} at (${x},${y})`)
                }
            }
        }
        for (const issue of analysis.somersaultTunnelIssues) {
            if (!issue.floor) {
                continue
            }
            const rule = getFloorRule(issue.floor)
            if (issue.note.includes("does not begin") && issue.startX > 0) {
                pushCellOperation(room, issue.startX - 1, rule.clearanceRow, 0, `open somersault start clearance in room ${room} at (${issue.startX - 1},${rule.clearanceRow})`)
                pushCellOperation(room, issue.startX - 1, rule.clearanceRow - 1, 0, `open somersault start headroom in room ${room} at (${issue.startX - 1},${rule.clearanceRow - 1})`)
            }
            if (issue.note.includes("does not end") && issue.endX < 15) {
                pushCellOperation(room, issue.endX + 1, rule.clearanceRow, 0, `open somersault end clearance in room ${room} at (${issue.endX + 1},${rule.clearanceRow})`)
                pushCellOperation(room, issue.endX + 1, rule.clearanceRow - 1, 0, `open somersault end headroom in room ${room} at (${issue.endX + 1},${rule.clearanceRow - 1})`)
            }
            if (issue.note.includes("longer than 4 cells")) {
                const splitX = Math.floor((issue.startX + issue.endX) / 2)
                pushCellOperation(room, splitX, issue.row, 1, `split somersault tunnel in room ${room} at (${splitX},${issue.row})`)
            }
        }
    }

    for (const issue of adjacency.horizontalMismatches) {
        if (!rooms.has(issue.fromRoom) && !rooms.has(issue.toRoom)) {
            continue
        }
        if (!issue.floor) {
            continue
        }
        const rule = getFloorRule(issue.floor)
        if (rooms.has(issue.fromRoom)) {
            const x = issue.direction === "right" ? 14 : 1
            pushCellOperation(issue.fromRoom, x, rule.supportRow, 0, `clear seam support in room ${issue.fromRoom} at (${x},${rule.supportRow})`)
        }
        if (rooms.has(issue.toRoom)) {
            const x = issue.direction === "right" ? 0 : 15
            pushCellOperation(issue.toRoom, x, rule.supportRow, 1, `add seam support in room ${issue.toRoom} at (${x},${rule.supportRow})`)
            pushCellOperation(issue.toRoom, x, rule.clearanceRow, 0, `open seam clearance in room ${issue.toRoom} at (${x},${rule.clearanceRow})`)
        }
    }

    for (const issue of adjacency.horizontalTraversalMismatches) {
        if (!rooms.has(issue.fromRoom) || issue.direction === "up" || issue.direction === "down") {
            continue
        }
        const sideColumns = issue.direction === "left" ? [14, 15] : [0, 1]
        for (const x of sideColumns) {
            pushCellOperation(issue.fromRoom, x, 3, 0, `open middle traversal clearance in room ${issue.fromRoom} at (${x},3)`)
            pushCellOperation(issue.fromRoom, x, 4, 1, `add middle traversal support in room ${issue.fromRoom} at (${x},4)`)
        }
    }

    for (const issue of adjacency.lethalSideExitMismatches) {
        if (!rooms.has(issue.fromRoom)) {
            continue
        }
        const columns = issue.direction === "left" ? [0, 1] : [14, 15]
        const rows = issue.floor ? [getFloorRule(issue.floor).clearanceRow, getFloorRule(issue.floor).supportRow] : [0, 1, 2, 3, 4, 5, 6]
        for (const y of rows) {
            for (const x of columns) {
                pushCellOperation(issue.fromRoom, x, y, 1, `seal no-adjacency side exit in room ${issue.fromRoom} at (${x},${y})`)
            }
        }
    }

    for (const issue of adjacency.verticalEdgeMismatches) {
        if (!rooms.has(issue.fromRoom) || !issue.columns) {
            continue
        }
        for (const x of issue.columns) {
            pushCellOperation(issue.fromRoom, x, 0, 0, `open top edge in room ${issue.fromRoom} at (${x},0)`)
        }
    }

    for (const issue of adjacency.verticalFallLandingMismatches) {
        if (!rooms.has(issue.toRoom) || !issue.columns) {
            continue
        }
        for (const x of issue.columns) {
            pushCellOperation(issue.toRoom, x, 1, 0, `open top landing clearance in room ${issue.toRoom} at (${x},1)`)
            pushCellOperation(issue.toRoom, x, 2, 1, `add top landing support in room ${issue.toRoom} at (${x},2)`)
        }
    }

    for (const issue of adjacency.blockedTopClimbMismatches) {
        if (!rooms.has(issue.fromRoom) || !issue.columns) {
            continue
        }
        pushOperation(
            `blocked-top:seal:${issue.fromRoom}:${issue.columns.join(",")}`,
            `seal blocked top climb columns in room ${issue.fromRoom} at [${issue.columns.join(",")}]`,
            (next) => sealBlockedTopClimbColumns(next, issue.fromRoom, issue.columns || [])
        )
        for (const x of issue.columns) {
            pushCellOperation(issue.fromRoom, x, 0, 1, `seal blocked top climb in room ${issue.fromRoom} at (${x},0)`)
        }
    }

    for (const issue of adjacency.lethalBottomPitMismatches) {
        if (!rooms.has(issue.fromRoom) || !issue.columns) {
            continue
        }
        for (const x of issue.columns) {
            pushCellOperation(issue.fromRoom, x, 6, 1, `seal bottom pit in room ${issue.fromRoom} at (${x},6)`)
        }
    }

    for (const issue of adjacency.unsafeVerticalDrops) {
        if (!rooms.has(issue.fromRoom) || !issue.columns) {
            continue
        }
        for (const x of issue.columns) {
            pushCellOperation(issue.fromRoom, x, 3, 0, `open intermediate landing clearance in room ${issue.fromRoom} at (${x},3)`)
            pushCellOperation(issue.fromRoom, x, 4, 1, `add intermediate landing support in room ${issue.fromRoom} at (${x},4)`)
        }
    }

    for (const issue of adjacency.disconnectedVerticalPassages) {
        if (!rooms.has(issue.fromRoom) || !issue.columns) {
            continue
        }
        for (const x of issue.columns) {
            for (const y of [0, 1, 2, 3, 4, 5, 6]) {
                pushCellOperation(issue.fromRoom, x, y, 0, `open shaft cell in room ${issue.fromRoom} at (${x},${y})`)
            }
        }
    }

    return operations.slice(0, 96)
}

function serializeClusterState(level: LoadedLevelGridModel, roomNumbers: number[]): string {
    return roomNumbers.map((roomNumber) => {
        const room = level.roomsByNumber.get(roomNumber)
        if (!room) {
            return `${roomNumber}:missing`
        }
        return `${roomNumber}:${room.grid.map((row) => row.join("")).join("/")}`
    }).join("|")
}

function searchClusterRepair(
    level: LoadedLevelGridModel,
    targetRooms: number[],
    targetSet: Set<number>,
    remainingDepth: number,
    usedOperationKeys: Set<string>,
    stateScoreMemo: Map<string, number>,
    currentPath: ClusterRepairChange[],
    best: { score: number, path: ClusterRepairChange[], level: LoadedLevelGridModel | null },
    budget: { remainingNodes: number }
) {
    if (budget.remainingNodes <= 0) {
        return
    }
    budget.remainingNodes -= 1

    const stateKey = serializeClusterState(level, targetRooms)
    const currentScore = getClusterScore(level, targetSet)
    const memoScore = stateScoreMemo.get(stateKey)
    if (memoScore !== undefined && memoScore <= currentScore) {
        return
    }
    stateScoreMemo.set(stateKey, currentScore)

    if (currentScore < best.score) {
        best.score = currentScore
        best.path = currentPath.slice()
        best.level = cloneLoadedLevelGridModel(level)
    }
    if (currentScore === 0 || remainingDepth === 0) {
        return
    }

    const operations = collectClusterRepairOperations(level, targetSet)
        .filter((operation) => !usedOperationKeys.has(operation.key))
        .map((operation) => {
            const next = cloneLoadedLevelGridModel(level)
            if (!operation.apply(next)) {
                return null
            }
            refreshLevelAnalyses(next)
            return {
                operation,
                level: next,
                score: getClusterScore(next, targetSet)
            }
        })
        .filter((candidate): candidate is { operation: ClusterRepairOperation, level: LoadedLevelGridModel, score: number } => Boolean(candidate))
        .sort((a, b) => a.score - b.score)

    for (const candidate of operations) {
        const nextUsed = new Set(usedOperationKeys)
        nextUsed.add(candidate.operation.key)
        currentPath.push({
            room: targetRooms[0] ?? 0,
            note: candidate.operation.note
        })
        searchClusterRepair(candidate.level, targetRooms, targetSet, remainingDepth - 1, nextUsed, stateScoreMemo, currentPath, best, budget)
        currentPath.pop()
        if (best.score === 0 || budget.remainingNodes <= 0) {
            return
        }
    }
}

function writeRoomsFromLevelModel(level: LoadedLevelGridModel, roomNumbers: number[]) {
    for (const roomNumber of roomNumbers) {
        const room = level.roomsByNumber.get(roomNumber)
        if (!room) {
            continue
        }
        fs.writeFileSync(room.filePath, renderGrid(room.title, room.grid), "utf8")
    }
}

function repairCluster(filePaths: string[], roomNumbers: number[], options: ClusterRepairOptions = {}): ClusterRepairResult | null {
    const baseLevel = loadLevelGridModel(filePaths)
    if (!baseLevel) {
        return null
    }

    const targetRooms = Array.from(new Set(roomNumbers)).sort((a, b) => a - b)
    const targetSet = new Set(targetRooms)
    const missingRoom = targetRooms.find((room) => !baseLevel.roomsByNumber.has(room))
    if (missingRoom !== undefined) {
        return {
            changed: false,
            repaired: false,
            targetRooms,
            passes: 0,
            changes: [{ room: missingRoom, note: "room not found in loaded level model" }],
            remainingScore: Number.POSITIVE_INFINITY
        }
    }

    const startScore = getClusterScore(baseLevel, targetSet)
    const best = {
        score: startScore,
        path: [] as ClusterRepairChange[],
        level: cloneLoadedLevelGridModel(baseLevel) as LoadedLevelGridModel | null
    }
    const derivedMaxDepth = Math.min(6, Math.max(2, targetRooms.length * 2))
    const maxDepth = Math.max(1, Math.floor(options.maxDepth ?? derivedMaxDepth))
    const searchBudget = { remainingNodes: Math.max(1, Math.floor(options.maxNodes ?? 40000)) }

    searchClusterRepair(
        cloneLoadedLevelGridModel(baseLevel),
        targetRooms,
        targetSet,
        maxDepth,
        new Set<string>(),
        new Map<string, number>(),
        [],
        best,
        searchBudget
    )

    const changed = best.score < startScore
    const repaired = best.score === 0
    const passes = best.path.length
    const changes = best.path.slice()

    if (changed && repaired && best.level) {
        writeRoomsFromLevelModel(best.level, targetRooms)
    }

    return {
        changed,
        repaired,
        targetRooms,
        passes,
        changes,
        remainingScore: best.score,
    }
}

function fixUnreachableStablePlatforms(filePaths: string[]): Array<{ filePath: string, changes: Array<{ floor: FloorName, startX: number, endX: number, loweredTo: FloorName }> }> {
    const summaries: Array<{ filePath: string, changes: Array<{ floor: FloorName, startX: number, endX: number, loweredTo: FloorName }> }> = []

    for (let pass = 0; pass < 4; ++pass) {
        const adjacency = analyzeAdjacencyConsistency(filePaths)
        if (!adjacency || adjacency.unreachablePlatforms.length === 0) {
            break
        }

        const issuesByRoom = new Map<number, Array<{ floor: FloorName, span: FloorSpan }>>()
        for (const issue of adjacency.unreachablePlatforms) {
            const roomIssues = issuesByRoom.get(issue.room) || []
            roomIssues.push({ floor: issue.floor, span: issue.span })
            issuesByRoom.set(issue.room, roomIssues)
        }

        let changedThisPass = false
        for (const filePath of filePaths) {
            const analysis = analyzeGrid(filePath)
            if (!analysis.hasExpectedShape || analysis.roomNumber === null) {
                continue
            }
            const issues = issuesByRoom.get(analysis.roomNumber)
            if (!issues || issues.length === 0) {
                continue
            }

            const grid = parseGrid(filePath)
            const changes: Array<{ floor: FloorName, startX: number, endX: number, loweredTo: FloorName }> = []
            for (const issue of issues) {
                const loweredTo: FloorName = issue.floor === "top" ? "middle" : "bottom"
                const lowerRule = FLOOR_RULES.find((rule) => rule.name === loweredTo)!
                for (let x = issue.span.startX; x <= issue.span.endX; ++x) {
                    grid[lowerRule.clearanceRow][x] = 0
                    grid[lowerRule.supportRow][x] = 1
                }
                changes.push({
                    floor: issue.floor,
                    startX: issue.span.startX,
                    endX: issue.span.endX,
                    loweredTo
                })
            }

            fs.writeFileSync(filePath, renderGrid(analysis.title, grid), "utf8")
            summaries.push({ filePath, changes })
            changedThisPass = true
        }

        if (!changedThisPass) {
            break
        }
    }

    return summaries
}

export { analyzeGrid, parseGrid, formatSpans, formatVoidRegions, fixMisalignedTopFloorSupport, fixOddSolidRunParity, fixOneStepObstacles, fillEnclosedVoidRegions, fixUnreachableStablePlatforms, analyzeAdjacencyConsistency, analyzeAdjacencyConsistencyForModel, renderGrid, loadLevelGridModel, repairCluster }
