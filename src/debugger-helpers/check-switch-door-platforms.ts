export {}

const DATA_DIR = "DATA"
const LEVELS_DIR = `${DATA_DIR}/levels`
const GENERATED_COLLISION_DIR = `${LEVELS_DIR}/tmp_generated`
const LEVEL_DIR_PATTERN = /^level\d+(?:_\d+)?$/i
const PGE_JSON_PATTERN = /\.pge\.json$/i
const SWITCH_OBJECT_TYPE = 7
const DOOR_OBJECT_TYPES = new Set([6])
const SWITCH_TARGET_DOOR_OBJECT_TYPES = new Set([0, 6])
const GRID_COLUMNS = 16

interface ParsedPgeEntryData {
    pos_x: number
    pos_y: number
    object_type: number
    init_room: number
    counter_values: number[]
}

interface ParsedPgeFileData {
    pgeInit: ParsedPgeEntryData[]
}

interface ValidationWarning {
    levelName: string
    pgeIndex: number
    room: number
    objectType: number
    posX: number
    posY: number
    supportRow: number
    supportColumns: number[]
}

function parseGridFile(gridPath: string) {
    const fs = require("fs")
    const lines = fs.readFileSync(gridPath, "utf8").split(/\r?\n/)
    const rows: number[][] = []

    for (const line of lines) {
        const match = line.match(/^\|\s*(\d+)\s*\|(.*)\|$/)
        if (!match) {
            continue
        }
        const rowIndex = Number(match[1])
        if (!Number.isInteger(rowIndex)) {
            continue
        }
        const values = (match[2].match(/\d+/g) || []).map(Number)
        if (values.length === GRID_COLUMNS) {
            rows[rowIndex] = values
        }
    }

    return rows
}

function getRuntimeLevelDirs() {
    const fs = require("fs")
    const path = require("path")
    return fs.readdirSync(LEVELS_DIR, { withFileTypes: true })
        .filter((entry: { isDirectory(): boolean, name: string }) => {
            if (!entry.isDirectory() || !LEVEL_DIR_PATTERN.test(entry.name)) {
                return false
            }
            const levelDir = path.join(LEVELS_DIR, entry.name)
            return fs.readdirSync(levelDir).some((fileName: string) => PGE_JSON_PATTERN.test(fileName))
        })
        .map((entry: { name: string }) => entry.name)
        .sort()
}

function getPgeFilePath(levelName: string) {
    const fs = require("fs")
    const path = require("path")
    const levelDir = path.join(LEVELS_DIR, levelName)
    const pgeFileName = fs.readdirSync(levelDir).find((entry: string) => PGE_JSON_PATTERN.test(entry))
    if (!pgeFileName) {
        throw new Error(`Could not find a .pge.json file in '${levelDir}'`)
    }
    return path.join(levelDir, pgeFileName)
}

function getGridFilePath(levelName: string, room: number) {
    const path = require("path")
    return path.join(GENERATED_COLLISION_DIR, `${levelName}-collisions`, `room-${room.toString().padStart(2, "0")}-grid.txt`)
}

function getSupportColumns(posX: number) {
    const baseColumn = Math.floor(posX / 16)
    return [baseColumn - 1, baseColumn, baseColumn + 1].filter((column, index, columns) => {
        return column >= 0 && column < GRID_COLUMNS && columns.indexOf(column) === index
    })
}

function getSupportRow(posY: number) {
    return Math.floor(posY / 32)
}

function isSwitch(pge: ParsedPgeEntryData) {
    return pge.object_type === SWITCH_OBJECT_TYPE
}

function getSwitchTargetIndices(pges: ParsedPgeEntryData[]) {
    const out = new Set<number>()
    for (const pge of pges) {
        if (!isSwitch(pge) || !Array.isArray(pge.counter_values)) {
            continue
        }
        for (const counterValue of pge.counter_values) {
            if (Number.isInteger(counterValue) && counterValue >= 0 && counterValue < pges.length) {
                out.add(counterValue)
            }
        }
    }
    return out
}

function isDoorLikePge(pge: ParsedPgeEntryData, pgeIndex: number, switchTargetIndices: Set<number>) {
    if (DOOR_OBJECT_TYPES.has(pge.object_type)) {
        return true
    }
    return switchTargetIndices.has(pgeIndex) && SWITCH_TARGET_DOOR_OBJECT_TYPES.has(pge.object_type)
}

function hasPlatformSupport(grid: number[][], supportRow: number, supportColumns: number[]) {
    return supportColumns.some((column) => grid[supportRow] && grid[supportRow][column] === 1)
}

function loadParsedPgeFile(filePath: string) {
    const fs = require("fs")
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as ParsedPgeFileData
}

function validateLevel(levelName: string) {
    const fs = require("fs")
    const pgeFile = loadParsedPgeFile(getPgeFilePath(levelName))
    const pges = Array.isArray(pgeFile.pgeInit) ? pgeFile.pgeInit : []
    const switchTargetIndices = getSwitchTargetIndices(pges)
    const cachedGrids = new Map<number, number[][]>()
    const warnings: ValidationWarning[] = []

    for (let pgeIndex = 0; pgeIndex < pges.length; ++pgeIndex) {
        const pge = pges[pgeIndex]
        if (!pge || (!isSwitch(pge) && !isDoorLikePge(pge, pgeIndex, switchTargetIndices))) {
            continue
        }

        const gridPath = getGridFilePath(levelName, pge.init_room)
        if (!fs.existsSync(gridPath)) {
            continue
        }

        if (!cachedGrids.has(pge.init_room)) {
            cachedGrids.set(pge.init_room, parseGridFile(gridPath))
        }

        const supportRow = getSupportRow(pge.pos_y)
        const supportColumns = getSupportColumns(pge.pos_x)
        const grid = cachedGrids.get(pge.init_room) || []

        if (!hasPlatformSupport(grid, supportRow, supportColumns)) {
            warnings.push({
                levelName,
                pgeIndex,
                room: pge.init_room,
                objectType: pge.object_type,
                posX: pge.pos_x,
                posY: pge.pos_y,
                supportRow,
                supportColumns,
            })
        }
    }

    return warnings
}

function formatWarning(warning: ValidationWarning) {
    return [
        `level=${warning.levelName}`,
        `room=${warning.room}`,
        `pge=${warning.pgeIndex}`,
        `object_type=${warning.objectType}`,
        `pos=(${warning.posX}, ${warning.posY})`,
        `supportRow=${warning.supportRow}`,
        `supportColumns=[${warning.supportColumns.join(", ")}]`,
    ].join(" ")
}

function main() {
    const warnings = getRuntimeLevelDirs().flatMap((levelName) => validateLevel(levelName))

    if (warnings.length > 0) {
        console.warn("WARNING: Found switch/door PGEs without platform support in the authored room grids:")
        for (const warning of warnings) {
            console.warn(`  - ${formatWarning(warning)}`)
        }
        throw new Error(`Switch/door platform validation failed with ${warnings.length} warning(s)`)
    }

    console.log("Verified switch and door PGEs are placed on supported platform cells when a room grid exists")
}

try {
    main()
} catch (error) {
    console.error(error)
    process.exit(1)
}
