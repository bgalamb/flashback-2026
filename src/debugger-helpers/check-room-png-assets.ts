import { decodeIndexedPng, paletteBankToColors } from "../core/indexed-png"
import { GAMESCREEN_H, GAMESCREEN_W } from "../core/game_constants"

const DATA_DIR = "DATA"
const FILES_JSON_PATH = `${DATA_DIR}/files.json`
const LEVELS_DIR = `${DATA_DIR}/levels`
const ROOM_PNG_PATTERN = /^(level\d+)-room\d+\.pixeldata\.png$/i
const RUNTIME_LEVEL_DIR_PATTERN = /^level\d+(?:_\d+)?$/i
const ALLOWED_PIXEL_SLOTS = new Set([0x0, 0x1, 0x2, 0x3, 0x8, 0x9, 0xA, 0xB])
const ALLOWED_NON_EMPTY_PALETTE_BANKS = new Set([0x0, 0x1, 0x2, 0x3, 0x8, 0x9, 0xA, 0xB, 0xC, 0xD])

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
    return path.relative(DATA_DIR, filePath).replace(/\\/g, "/")
}

function getRuntimeRoomPngFiles() {
    const fs = require("fs")
    const path = require("path")
    const levelDirs = fs.readdirSync(LEVELS_DIR, { withFileTypes: true })
        .filter((entry: { isDirectory(): boolean, name: string }) => entry.isDirectory() && RUNTIME_LEVEL_DIR_PATTERN.test(entry.name))
        .map((entry: { name: string }) => path.join(LEVELS_DIR, entry.name))
        .sort()

    const roomPngFiles: string[] = []
    for (const levelDir of levelDirs) {
        roomPngFiles.push(...walkFiles(levelDir, (filePath: string) => ROOM_PNG_PATTERN.test(path.basename(filePath))))
    }
    return roomPngFiles
}

function getFilesManifestEntries() {
    const fs = require("fs")
    return JSON.parse(fs.readFileSync(FILES_JSON_PATH, "utf8")) as string[]
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

    if (png.width !== GAMESCREEN_W || png.height !== GAMESCREEN_H) {
        throw new Error(`Invalid room PNG size for '${filePath}': got ${png.width}x${png.height}, expected ${GAMESCREEN_W}x${GAMESCREEN_H}`)
    }

    for (let i = 0; i < png.pixels.length; ++i) {
        const pixel = png.pixels[i]
        const slot = pixel >> 4
        if (!ALLOWED_PIXEL_SLOTS.has(slot)) {
            throw new Error(`Invalid room PNG slot 0x${slot.toString(16).toUpperCase()} at pixel ${i} in '${filePath}'`)
        }
    }

    const nonEmptyBanks = getNonEmptyPaletteBanks(png.palette)
    for (const bankIndex of nonEmptyBanks) {
        if (!ALLOWED_NON_EMPTY_PALETTE_BANKS.has(bankIndex)) {
            throw new Error(`Unexpected non-empty palette bank 0x${bankIndex.toString(16).toUpperCase()} in '${filePath}'`)
        }
    }
}

async function main() {
    const fs = require("fs")
    const path = require("path")
    const manifestEntries = getFilesManifestEntries()
    const manifestSet = new Set(manifestEntries)
    const runtimeRoomPngFiles = getRuntimeRoomPngFiles()
    const missingManifestEntries: string[] = []

    for (const filePath of runtimeRoomPngFiles) {
        const relativePath = toRelativeDataPath(filePath)
        if (!manifestSet.has(relativePath)) {
            missingManifestEntries.push(relativePath)
        }
    }

    const missingFilesFromManifest = manifestEntries
        .filter((entry) => ROOM_PNG_PATTERN.test(path.basename(entry)))
        .filter((entry) => !fs.existsSync(path.join(DATA_DIR, entry)))

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

    console.log(`Verified ${runtimeRoomPngFiles.length} merged room PNG assets`)
    console.log("Verified DATA/files.json contains all runtime room PNGs")
    console.log("Verified merged room PNG pixel slots are limited to 0x0-0x3 and 0x8-0xB")
    console.log("Verified merged room PNG palettes only populate banks 0x0-0x3 and 0x8-0xD")
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
