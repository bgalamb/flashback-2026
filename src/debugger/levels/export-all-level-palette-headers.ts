import { ctRoomSize } from "../../core/game_constants"
import { readBeUint16, readBeUint32 } from "../../core/intern"
import { _gameLevels } from "../../core/staticres"
import { bytekillerUnpack } from "../../core/unpack"

function printUsage() {
    console.error("Usage: node -r ts-node/register/transpile-only ./src/debugger/levels/export-all-level-palette-headers.ts <dataDir> [outputDir]")
}

function resolveDataFile(dataDir: string, baseName: string, ext: string): string | null {
    const fs = require("fs")
    const path = require("path")
    const candidates = [
        path.join(dataDir, `${baseName}.${ext.toLowerCase()}`),
        path.join(dataDir, `${baseName}.${ext.toUpperCase()}`)
    ]
    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return candidate
        }
    }
    return null
}

function roomExists(lev: Uint8Array, room: number): boolean {
    if (room < 0 || room >= ctRoomSize) {
        return false
    }
    const offset = room * 4
    if ((offset + 4) > lev.length) {
        return false
    }
    const roomOffset = readBeUint32(lev, offset)
    return roomOffset >= 4 && roomOffset < lev.length
}

function toHex16(value: number): string {
    return `0x${value.toString(16).toUpperCase().padStart(4, "0")}`
}

function amigaConvertColorBgr(color: number) {
    const g = (color & 0xF0) >> 4
    let r = (color & 0xF00) >> 8
    let b = color & 0xF
    const tmp = r
    r = b
    b = tmp
    return {
        r: (r << 4) | r,
        g: (g << 4) | g,
        b: (b << 4) | b
    }
}

function readPalSlotColors(pal: Uint8Array, palOffset: number) {
    const colors = []
    let p = palOffset * 32
    for (let i = 0; i < 16; ++i) {
        if ((p + 1) >= pal.length) {
            break
        }
        const raw = readBeUint16(pal, p)
        colors.push({
            index: i,
            raw: {
                dec: raw,
                hex: toHex16(raw)
            },
            rgb: amigaConvertColorBgr(raw)
        })
        p += 2
    }
    return colors
}

function writePaletteHeaderJson(
    outputPath: string,
    sourceRoom: number,
    pal: Uint8Array,
    slot1: number,
    slot2: number,
    slot3: number,
    slot4: number
) {
    const fs = require("fs")
    const data = {
        sourceRoom,
        slots: {
            slot1: { dec: slot1, hex: toHex16(slot1), palByteOffset: slot1 * 32, colors: readPalSlotColors(pal, slot1) },
            slot2: { dec: slot2, hex: toHex16(slot2), palByteOffset: slot2 * 32, colors: readPalSlotColors(pal, slot2) },
            slot3: { dec: slot3, hex: toHex16(slot3), palByteOffset: slot3 * 32, colors: readPalSlotColors(pal, slot3) },
            slot4: { dec: slot4, hex: toHex16(slot4), palByteOffset: slot4 * 32, colors: readPalSlotColors(pal, slot4) }
        }
    }
    fs.writeFileSync(outputPath, `${JSON.stringify(data, null, 2)}\n`)
}

function main() {
    const args = process.argv.slice(2)
    if (args.length < 1 || args.length > 2) {
        printUsage()
        process.exit(1)
    }

    const fs = require("fs")
    const path = require("path")

    const dataDir = args[0]
    const outputRoot = args[1] || path.join(dataDir, "levels")
    const leveldataScratch = new Uint8Array(320 * 224 + 1024)

    fs.mkdirSync(outputRoot, { recursive: true })

    for (const level of _gameLevels) {
        const levPath = resolveDataFile(dataDir, level.name, "lev")
        const palPath = resolveDataFile(dataDir, level.name, "pal")
        if (!levPath || !palPath) {
            continue
        }

        const lev = new Uint8Array(fs.readFileSync(levPath))
        const pal = new Uint8Array(fs.readFileSync(palPath))
        const levelOutputDir = path.join(outputRoot, level.name2)
        fs.mkdirSync(levelOutputDir, { recursive: true })

        let wroteLevelHeader = false
        for (let room = 1; room <= 100; ++room) {
            if (!roomExists(lev, room)) {
                continue
            }
            const offset = readBeUint32(lev, room * 4)
            let unpackOk = false
            try {
                unpackOk = bytekillerUnpack(leveldataScratch, leveldataScratch.length, lev, offset)
            } catch (_error) {
                continue
            }
            if (!unpackOk) {
                continue
            }

            const mapPaletteOffsetSlot1 = readBeUint16(leveldataScratch, 2)
            const mapPaletteOffsetSlot2 = readBeUint16(leveldataScratch, 4)
            const mapPaletteOffsetSlot3 = readBeUint16(leveldataScratch, 6)
            const mapPaletteOffsetSlot4 = readBeUint16(leveldataScratch, 8)

            const outputPath = path.join(levelOutputDir, `${level.name}.paletteheader.json`)
            writePaletteHeaderJson(
                outputPath,
                room,
                pal,
                mapPaletteOffsetSlot1,
                mapPaletteOffsetSlot2,
                mapPaletteOffsetSlot3,
                mapPaletteOffsetSlot4
            )
            console.log(`Wrote ${outputPath}`)
            wroteLevelHeader = true
            break
        }

        if (!wroteLevelHeader) {
            console.warn(`No valid palette header found for ${level.name2}`)
        }
    }
}

main()
