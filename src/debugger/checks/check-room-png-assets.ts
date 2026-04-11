import { decodeIndexedPng, paletteBankToColors } from "../../core/indexed-png"
import { gamescreenH, gamescreenW } from "../../core/game_constants"

const dataDir = "DATA"
const filesJsonPath = `${dataDir}/files.json`
const levelsDir = `${dataDir}/levels`
const roomPngPattern = /^(level\d+)-room\d+\.pixeldata\.png$/i
const backLayerPngPattern = /^(level\d+)-room\d+-backlayer\.png$/i
const frontLayerPngPattern = /^(level\d+)-room\d+-frontlayer\.png$/i
const runtimeLevelDirPattern = /^level\d+(?:_\d+)?$/i
const allowedPixelSlots = new Set([0x0, 0x1, 0x2, 0x3, 0x8, 0x9, 0xA, 0xB])
const allowedNonEmptyPaletteBanks = new Set([0x0, 0x1, 0x2, 0x3, 0x8, 0x9, 0xA, 0xB, 0xC, 0xD])

function isSupportedRoomPngSize(width: number, height: number) {
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

function walkFiles(rootDir: string, predicate: (filePath: string) => boolean) {
    const fs = require("fs")
    const path = require("path")
    const out: string[] = []

    function visit(dirPath: string) {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true })
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name)
            if (entry.isDirectory()) {
                visit(fullPath)
                continue
            }
            if (predicate(fullPath)) {
                out.push(fullPath)
            }
        }
    }

    visit(rootDir)
    out.sort()
    return out
}

function toRelativeDataPath(filePath: string) {
    const path = require("path")
    return path.relative(dataDir, filePath).replace(/\\/g, "/")
}

function getRuntimeRoomPngFiles() {
    return getLevelPngFiles(roomPngPattern)
}

function getBackLayerPngFiles() {
    return getLevelPngFiles(backLayerPngPattern)
}

function getFrontLayerPngFiles() {
    return getLevelPngFiles(frontLayerPngPattern)
}

function getLevelPngFiles(pattern: RegExp) {
    const fs = require("fs")
    const path = require("path")
    const levelDirs = fs.readdirSync(levelsDir, { withFileTypes: true })
        .filter((entry: { isDirectory(): boolean, name: string }) => entry.isDirectory() && runtimeLevelDirPattern.test(entry.name))
        .map((entry: { name: string }) => path.join(levelsDir, entry.name))
        .sort()

    const roomPngFiles: string[] = []
    for (const levelDir of levelDirs) {
        roomPngFiles.push(...walkFiles(levelDir, (filePath: string) => pattern.test(path.basename(filePath))))
    }
    return roomPngFiles
}

function getFilesManifestEntries() {
    const fs = require("fs")
    return JSON.parse(fs.readFileSync(filesJsonPath, "utf8")) as string[]
}

function getNonEmptyPaletteBanks(palette: Array<{ r: number, g: number, b: number }>) {
    const nonEmptyBanks: number[] = []
    for (let bankIndex = 0; bankIndex < 16; ++bankIndex) {
        const colors = paletteBankToColors(palette, bankIndex)
        if (!colors) {
            continue
        }
        const hasAnyNonBlackColor = colors.some((color) => color.r !== 0 || color.g !== 0 || color.b !== 0)
        if (hasAnyNonBlackColor) {
            nonEmptyBanks.push(bankIndex)
        }
    }
    return nonEmptyBanks
}

async function validateMergedRoomPng(filePath: string) {
    const fs = require("fs")
    const png = await decodeIndexedPng(new Uint8Array(fs.readFileSync(filePath)))

    if (!isSupportedRoomPngSize(png.width, png.height)) {
        throw new Error(`Invalid room PNG size for '${filePath}': got ${png.width}x${png.height}, expected ${gamescreenW}x${gamescreenH} or a matching integer hi-res upscale`)
    }

    for (let i = 0; i < png.pixels.length; ++i) {
        const pixel = png.pixels[i]
        const slot = pixel >> 4
        if (!allowedPixelSlots.has(slot)) {
            throw new Error(`Invalid room PNG slot 0x${slot.toString(16).toUpperCase()} at pixel ${i} in '${filePath}'`)
        }
    }

    const nonEmptyBanks = getNonEmptyPaletteBanks(png.palette)
    for (const bankIndex of nonEmptyBanks) {
        if (!allowedNonEmptyPaletteBanks.has(bankIndex)) {
            throw new Error(`Unexpected non-empty palette bank 0x${bankIndex.toString(16).toUpperCase()} in '${filePath}'`)
        }
    }
}

async function validateLayerPngSize(filePath: string) {
    const fs = require("fs")
    const png = await decodeIndexedPng(new Uint8Array(fs.readFileSync(filePath)))

    if (png.width !== gamescreenW || png.height !== gamescreenH) {
        throw new Error(`Invalid layer PNG size for '${filePath}': got ${png.width}x${png.height}, expected ${gamescreenW}x${gamescreenH}`)
    }
}

async function main() {
    const fs = require("fs")
    const path = require("path")
    const manifestEntries = getFilesManifestEntries()
    const manifestSet = new Set(manifestEntries)
    const runtimeRoomPngFiles = getRuntimeRoomPngFiles()
    const backLayerPngFiles = getBackLayerPngFiles()
    const frontLayerPngFiles = getFrontLayerPngFiles()
    const missingManifestEntries: string[] = []

    for (const filePath of runtimeRoomPngFiles) {
        const relativePath = toRelativeDataPath(filePath)
        if (!manifestSet.has(relativePath)) {
            missingManifestEntries.push(relativePath)
        }
    }

    const missingFilesFromManifest = manifestEntries
        .filter((entry) => roomPngPattern.test(path.basename(entry)))
        .filter((entry) => !fs.existsSync(path.join(dataDir, entry)))

    if (missingManifestEntries.length > 0 || missingFilesFromManifest.length > 0) {
        const errors: string[] = []
        if (missingManifestEntries.length > 0) {
            errors.push(
                "Room PNGs missing from DATA/files.json:\n" +
                missingManifestEntries.map((entry) => `  - ${entry}`).join("\n")
            )
        }
        if (missingFilesFromManifest.length > 0) {
            errors.push(
                "DATA/files.json references missing room PNGs:\n" +
                missingFilesFromManifest.map((entry) => `  - ${entry}`).join("\n")
            )
        }
        throw new Error(errors.join("\n\n"))
    }

    for (const filePath of runtimeRoomPngFiles) {
        await validateMergedRoomPng(filePath)
    }
    for (const filePath of backLayerPngFiles) {
        await validateLayerPngSize(filePath)
    }
    for (const filePath of frontLayerPngFiles) {
        await validateLayerPngSize(filePath)
    }

    console.log(`Verified ${runtimeRoomPngFiles.length} merged room PNG assets`)
    console.log(`Verified ${backLayerPngFiles.length} back-layer PNG assets`)
    console.log(`Verified ${frontLayerPngFiles.length} front-layer PNG assets`)
    console.log("Verified DATA/files.json contains all runtime room PNGs")
    console.log(`Verified all room PNG assets use ${gamescreenW}x${gamescreenH} or a matching integer hi-res upscale`)
    console.log("Verified merged room PNG pixel slots are limited to 0x0-0x3 and 0x8-0xB")
    console.log("Verified merged room PNG palettes only populate banks 0x0-0x3 and 0x8-0xD")
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
