import * as fs from "fs"
import * as path from "path"
import { decodeIndexedPng } from "../core/indexed-png"
import { gamescreenH, gamescreenW } from "../core/game_constants"
import { CtArrayRebuilder } from "./ct-array-rebuilder"
import { renderRoomLayersFromGrid } from "./render_room_layers_from_grid"
import { mergeRoomLayerPng } from "./merge-room-layer-png"
import { remapRoomLayerFromIndexedPng } from "./remap_room_layer_from_indexed_png"

const authoredCollisionRoot = path.join("src", "collisions")
const runtimeLevelsRoot = path.join("DATA", "levels")

function isSupportedGeneratedRoomPngSize(width: number, height: number) {
    if (width === gamescreenW && height === gamescreenH) {
        return true
    }
    if (width <= gamescreenW || height <= gamescreenH) {
        return false
    }
    if (width % gamescreenW !== 0 || height % gamescreenH !== 0) {
        return false
    }
    return width / gamescreenW === height / gamescreenH
}

function getAuthoredLevelDirs(rootDir: string) {
    if (!fs.existsSync(rootDir)) {
        return []
    }
    return fs.readdirSync(rootDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(rootDir, entry.name))
        .filter((levelDir) => {
            const levelName = path.basename(levelDir)
            return fs.existsSync(path.join(levelDir, `${levelName}-ct-adjacency.json`))
        })
        .sort()
}

async function mergeAllRuntimeRoomPngs(outputDir: string, levelName: string) {
    const roomNumbers = fs.readdirSync(outputDir)
        .map((name) => /^.+-room(\d+)-backlayer\.png$/i.exec(name))
        .filter((match): match is RegExpExecArray => Boolean(match))
        .map((match) => Number(match[1]))
        .sort((a, b) => a - b)

    for (const room of roomNumbers) {
        const roomBase = `${levelName}-room${room}`
        const backPath = path.join(outputDir, `${roomBase}-backlayer.png`)
        const frontPath = path.join(outputDir, `${roomBase}-frontlayer.png`)
        const pixeldataPath = path.join(outputDir, `${roomBase}.pixeldata.png`)
        if (!fs.existsSync(frontPath)) {
            throw new Error(`Missing front-layer PNG '${frontPath}'`)
        }
        await mergeRoomLayerPng(backPath, frontPath, pixeldataPath, { logWrites: false })
    }

    return roomNumbers
}

function getRoomPngOverrideDir(levelName: string) {
    return path.join(authoredCollisionRoot, `${levelName}-room-png-overrides`)
}

function getOverrideRoomNumbers(levelName: string): number[] {
    const overrideDir = getRoomPngOverrideDir(levelName)
    if (!fs.existsSync(overrideDir)) {
        return []
    }
    return fs.readdirSync(overrideDir)
        .map((name) => new RegExp(`^${levelName}-room(\\d+)\\.png$`, "i").exec(name))
        .filter((match): match is RegExpExecArray => Boolean(match))
        .map((match) => Number(match[1]))
        .sort((a, b) => a - b)
}

async function applyRoomPngOverrides(levelName: string, outputDir: string) {
    const overrideDir = getRoomPngOverrideDir(levelName)
    const rooms = getOverrideRoomNumbers(levelName)
    for (const room of rooms) {
        const roomBase = `${levelName}-room${room}`
        const overridePath = path.join(overrideDir, `${roomBase}.png`)
        const pixeldataPath = path.join(outputDir, `${roomBase}.pixeldata.png`)
        await remapRoomLayerFromIndexedPng(overridePath, "pixeldata", pixeldataPath, { logWrites: false })
        console.log(`[authored-assets][override] ${levelName} room=${room} source=${path.relative(".", overridePath)} target=${path.relative(".", pixeldataPath)}`)
    }
    return rooms
}

async function validateGeneratedRoomPngSizes(outputDir: string, levelName: string) {
    const roomPngFiles = fs.readdirSync(outputDir)
        .filter((name) => new RegExp(`^${levelName}-room\\d+\\.pixeldata\\.png$`, "i").test(name))
        .sort()

    for (const fileName of roomPngFiles) {
        const filePath = path.join(outputDir, fileName)
        const png = await decodeIndexedPng(new Uint8Array(fs.readFileSync(filePath)))
        if (!isSupportedGeneratedRoomPngSize(png.width, png.height)) {
            throw new Error(`Invalid generated room PNG size for '${filePath}': got ${png.width}x${png.height}, expected ${gamescreenW}x${gamescreenH} or a matching integer hi-res upscale`)
        }
    }

    return roomPngFiles.length
}

async function regenerateLevelAssets(levelName: string, collisionDir: string, outputDir: string) {
    fs.mkdirSync(outputDir, { recursive: true })
    CtArrayRebuilder.rebuildAllLevelsFromExport(path.dirname(collisionDir), outputDir)
    const rendered = renderRoomLayersFromGrid(collisionDir, outputDir, "all")
    const mergedRooms = await mergeAllRuntimeRoomPngs(outputDir, levelName)
    const overrideRooms = await applyRoomPngOverrides(levelName, outputDir)
    const validatedRoomCount = await validateGeneratedRoomPngSizes(outputDir, levelName)
    return {
        ctPath: path.join(outputDir, `${levelName}.ct.bin`),
        renderedRoomCount: rendered.rooms.length,
        mergedRoomCount: mergedRooms.length,
        overrideRoomCount: overrideRooms.length,
        validatedRoomCount,
        outputDir,
    }
}

async function main() {
    const authoredLevelDirs = getAuthoredLevelDirs(authoredCollisionRoot)
    if (authoredLevelDirs.length === 0) {
        console.log(`No authored collision datasets found under ${authoredCollisionRoot}`)
        return
    }

    for (const collisionDir of authoredLevelDirs) {
        const levelName = path.basename(collisionDir)
        const outputDir = path.join(runtimeLevelsRoot, levelName)
        const result = await regenerateLevelAssets(levelName, collisionDir, outputDir)
        console.log(
            `[authored-assets] ${levelName}: ct=${path.relative(".", result.ctPath)} rooms=${result.renderedRoomCount} merged=${result.mergedRoomCount} overrides=${result.overrideRoomCount} validated=${result.validatedRoomCount} out=${path.relative(".", result.outputDir)}`
        )
    }
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
