export {}

const dataDir = "DATA"
const levelsDir = `${dataDir}/levels`
const generatedCollisionDir = `${levelsDir}/tmpGenerated`
const levelDirPattern = /^level\d+(?:_\d+)?$/i
const pgeJsonPattern = /\.pge\.json$/i
const switchObjectType = 7
const doorObjectTypes = new Set([6])
const switchTargetDoorObjectTypes = new Set([0, 6])
const gridColumns = 16

interface ParsedPgeEntryData {
    posX: number
    posY: number
    objectType: number
    initRoom: number
    counterValues: number[]
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
        if (values.length === gridColumns) {
            rows[rowIndex] = values
        }
    }

    return rows
}

function getRuntimeLevelDirs() {
    const fs = require("fs")
    const path = require("path")
    return fs.readdirSync(levelsDir, { withFileTypes: true })
        .filter((entry: { isDirectory(): boolean, name: string }) => {
            if (!entry.isDirectory() || !levelDirPattern.test(entry.name)) {
                return false
            }
            const levelDir = path.join(levelsDir, entry.name)
            return fs.readdirSync(levelDir).some((fileName: string) => pgeJsonPattern.test(fileName))
        })
        .map((entry: { name: string }) => entry.name)
        .sort()
}

function getPgeFilePath(levelName: string) {
    const fs = require("fs")
    const path = require("path")
    const levelDir = path.join(levelsDir, levelName)
    const pgeFileName = fs.readdirSync(levelDir).find((entry: string) => pgeJsonPattern.test(entry))
    if (!pgeFileName) {
        throw new Error(`Could not find a .pge.json file in '${levelDir}'`)
    }
    return path.join(levelDir, pgeFileName)
}

function getGridFilePath(levelName: string, room: number) {
    const path = require("path")
    return path.join(generatedCollisionDir, `${levelName}-collisions`, `room-${room.toString().padStart(2, "0")}-grid.txt`)
}

function getSupportColumns(posX: number) {
    const baseColumn = Math.floor(posX / 16)
    return [baseColumn - 1, baseColumn, baseColumn + 1].filter((column, index, columns) => {
        return column >= 0 && column < gridColumns && columns.indexOf(column) === index
    })
}

function getSupportRow(posY: number) {
    return Math.floor(posY / 32)
}

function isSwitch(pge: ParsedPgeEntryData) {
    return pge.objectType === switchObjectType
}

function getSwitchTargetIndices(pges: ParsedPgeEntryData[]) {
    const out = new Set<number>()
    for (const pge of pges) {
        if (!isSwitch(pge) || !Array.isArray(pge.counterValues)) {
            continue
        }
        for (const counterValue of pge.counterValues) {
            if (Number.isInteger(counterValue) && counterValue >= 0 && counterValue < pges.length) {
                out.add(counterValue)
            }
        }
    }
    return out
}

function isDoorLikePge(pge: ParsedPgeEntryData, pgeIndex: number, switchTargetIndices: Set<number>) {
    if (doorObjectTypes.has(pge.objectType)) {
        return true
    }
    return switchTargetIndices.has(pgeIndex) && switchTargetDoorObjectTypes.has(pge.objectType)
}

function hasPlatformSupport(grid: number[][], supportRow: number, supportColumns: number[]) {
    return supportColumns.some((column) => grid[supportRow] && grid[supportRow][column] === 1)
}

function loadParsedPgeFile(filePath: string) {
    const fs = require("fs")
    const camelize = (value: unknown): unknown => {
        if (Array.isArray(value)) {
            return value.map((entry) => camelize(entry))
        }
        if (!value || typeof value !== "object") {
            return value
        }
        const normalized: Record<string, unknown> = {}
        for (const [key, entry] of Object.entries(value)) {
            normalized[key.replace(/_([a-zA-Z0-9])/g, (_match, char: string) => char.toUpperCase())] = camelize(entry)
        }
        return normalized
    }
    return camelize(JSON.parse(fs.readFileSync(filePath, "utf8"))) as ParsedPgeFileData
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

        const gridPath = getGridFilePath(levelName, pge.initRoom)
        if (!fs.existsSync(gridPath)) {
            continue
        }

        if (!cachedGrids.has(pge.initRoom)) {
            cachedGrids.set(pge.initRoom, parseGridFile(gridPath))
        }

        const supportRow = getSupportRow(pge.posY)
        const supportColumns = getSupportColumns(pge.posX)
        const grid = cachedGrids.get(pge.initRoom) || []

        if (!hasPlatformSupport(grid, supportRow, supportColumns)) {
            warnings.push({
                levelName,
                pgeIndex,
                room: pge.initRoom,
                objectType: pge.objectType,
                posX: pge.posX,
                posY: pge.posY,
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
        `objectType=${warning.objectType}`,
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
