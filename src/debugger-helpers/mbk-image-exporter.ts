import { assert } from "../assert"
import { READ_BE_UINT16, READ_BE_UINT32 } from "../intern"
import { bytekiller_unpack } from "../unpack"

type RgbColor = {
    r: number
    g: number
    b: number
}

class MbkImageExporter {
    private static readonly TILE_SIZE = 8
    private static readonly TILE_FRAME = 1
    private static readonly TILE_STRIDE = MbkImageExporter.TILE_SIZE + MbkImageExporter.TILE_FRAME * 2

    private _mbk: Uint8Array
    private _palette: RgbColor[]
    private _bankCache: { [key: string]: Uint8Array } = {}

    constructor(mbk: Uint8Array, palette?: RgbColor[]) {
        this._mbk = mbk
        this._palette = palette && palette.length >= 16 ? palette.slice(0, 16) : MbkImageExporter.defaultPalette()
    }

    static exportTilesImage(mbkPath: string, outputPath: string, palettePath?: string, paletteSlot: number = 0, tilesPerRow: number = 16) {
        const fs = require("fs")
        const mbk = new Uint8Array(fs.readFileSync(mbkPath))
        if (MbkImageExporter.isPlaceholderMbk(mbk)) {
            throw new Error(`'${mbkPath}' is a placeholder MBK table and does not contain tile data`)
        }
        const resolvedPalettePath = palettePath || MbkImageExporter.resolvePalettePath(mbkPath)
        const palette = resolvedPalettePath ? MbkImageExporter.loadPalette(resolvedPalettePath, paletteSlot) : undefined
        const exporter = new MbkImageExporter(mbk, palette)
        exporter.writePpm(outputPath, tilesPerRow)
    }

    writePpm(outputPath: string, tilesPerRow: number = 16) {
        const fs = require("fs")
        const image = this.buildImage(Math.max(1, tilesPerRow | 0))
        fs.writeFileSync(outputPath, this.toPpm(image.width, image.height, image.pixels))
    }

    buildImage(tilesPerRow: number = 16) {
        const tileCount = this.getTotalTileCount()
        const safeTilesPerRow = Math.max(1, tilesPerRow | 0)
        const width = safeTilesPerRow * MbkImageExporter.TILE_STRIDE
        const rows = Math.max(1, Math.ceil(tileCount / safeTilesPerRow))
        const height = rows * MbkImageExporter.TILE_STRIDE
        const pixels = new Uint8Array(width * height)

        let tileIndex = 0
        const entryCount = this.getEntryCount()
        for (let entry = 0; entry < entryCount; ++entry) {
            const bankData = this.loadBankData(entry)
            for (let offset = 0; offset + 32 <= bankData.length; offset += 32) {
                const x = (tileIndex % safeTilesPerRow) * MbkImageExporter.TILE_STRIDE + MbkImageExporter.TILE_FRAME
                const y = ((tileIndex / safeTilesPerRow) >> 0) * MbkImageExporter.TILE_STRIDE + MbkImageExporter.TILE_FRAME
                this.drawTile(pixels, width, x, y, bankData.subarray(offset, offset + 32))
                ++tileIndex
            }
        }

        return { width, height, pixels }
    }

    private static isPlaceholderMbk(data: Uint8Array): boolean {
        if (data.length < 12) {
            return false
        }
        const firstOffset = READ_BE_UINT32(data) & 0xFFFF
        const firstSize = READ_BE_UINT16(data, 4)
        if (firstSize !== 0) {
            return false
        }
        for (let i = 1; i < 8; ++i) {
            const entryOffset = READ_BE_UINT32(data, i * 6) & 0xFFFF
            const entrySize = READ_BE_UINT16(data, i * 6 + 4)
            if (entryOffset !== firstOffset || entrySize !== firstSize) {
                return false
            }
        }
        return true
    }

    private static defaultPalette(): RgbColor[] {
        return [
            { r: 0x00, g: 0x00, b: 0x00 },
            { r: 0x22, g: 0x22, b: 0x22 },
            { r: 0x44, g: 0x44, b: 0x44 },
            { r: 0x66, g: 0x66, b: 0x66 },
            { r: 0x88, g: 0x88, b: 0x88 },
            { r: 0xAA, g: 0xAA, b: 0xAA },
            { r: 0xCC, g: 0xCC, b: 0xCC },
            { r: 0xEE, g: 0xEE, b: 0xEE },
            { r: 0xFF, g: 0x00, b: 0x00 },
            { r: 0xFF, g: 0x88, b: 0x00 },
            { r: 0xFF, g: 0xFF, b: 0x00 },
            { r: 0x00, g: 0xAA, b: 0x00 },
            { r: 0x00, g: 0x99, b: 0xFF },
            { r: 0x22, g: 0x44, b: 0xCC },
            { r: 0x88, g: 0x00, b: 0xCC },
            { r: 0xFF, g: 0x66, b: 0xAA }
        ]
    }

    private static resolvePalettePath(mbkPath: string) {
        const fs = require("fs")
        const path = require("path")
        const ext = path.extname(mbkPath)
        const base = mbkPath.slice(0, mbkPath.length - ext.length)
        const candidates = [
            `${base}.pal`,
            `${base}.PAL`
        ]
        for (let i = 0; i < candidates.length; ++i) {
            if (fs.existsSync(candidates[i])) {
                return candidates[i]
            }
        }
        return null
    }

    private static loadPalette(palPath: string, paletteSlot: number) {
        const fs = require("fs")
        const pal = new Uint8Array(fs.readFileSync(palPath))
        const slot = Math.max(0, paletteSlot | 0)
        const slotOffset = slot * 32
        if (slotOffset + 32 > pal.length) {
            throw new Error(`Palette slot ${slot} is out of range for '${palPath}'`)
        }

        const colors: RgbColor[] = []
        for (let i = 0; i < 16; ++i) {
            colors.push(MbkImageExporter.amigaConvertColor(READ_BE_UINT16(pal, slotOffset + i * 2), true))
        }
        return colors
    }

    private static amigaConvertColor(color: number, bgr: boolean) {
        let r = (color & 0xF00) >> 8
        let g = (color & 0x0F0) >> 4
        let b = color & 0x00F
        if (bgr) {
            const tmp = r
            r = b
            b = tmp
        }
        return {
            r: (r << 4) | r,
            g: (g << 4) | g,
            b: (b << 4) | b
        }
    }

    private getEntryCount() {
        if (this._mbk.length < 1) {
            return 0
        }
        return this._mbk[0]
    }

    private getTotalTileCount() {
        let count = 0
        const entryCount = this.getEntryCount()
        for (let entry = 0; entry < entryCount; ++entry) {
            count += this.loadBankData(entry).length >> 5
        }
        return Math.max(1, count)
    }

    private getBankDataSize(num: number) {
        let len = READ_BE_UINT16(this._mbk, num * 6 + 4)
        if (len & 0x8000) {
            len &= 0x7FFF
        }
        return len * 32
    }

    private loadBankData(num: number) {
        const key = String(num)
        if (this._bankCache[key]) {
            return this._bankCache[key]
        }

        const ptr = this._mbk.subarray(num * 6)
        const dataOffset = READ_BE_UINT32(ptr) & 0xFFFF
        const size = this.getBankDataSize(num)
        if (size <= 0) {
            const empty = new Uint8Array(0)
            this._bankCache[key] = empty
            return empty
        }
        const data = this._mbk.subarray(dataOffset)

        let decoded: Uint8Array
        if (READ_BE_UINT16(ptr, 4) & 0x8000) {
            decoded = data.slice(0, size)
        } else {
            assert(!(dataOffset <= 4), `Assertion failed: ${dataOffset} > 4`)
            const expectedSize = READ_BE_UINT32(data.buffer, data.byteOffset - 4) | 0
            assert(!(size !== expectedSize), `Assertion failed: ${size} === ${expectedSize}`)
            decoded = new Uint8Array(size)
            if (!bytekiller_unpack(decoded, size, data, 0)) {
                throw new Error(`Bad CRC for bank data ${num}`)
            }
        }

        this._bankCache[key] = decoded
        return decoded
    }

    private drawTile(dst: Uint8Array, dstWidth: number, x: number, y: number, src: Uint8Array) {
        let srcIndex = 0
        for (let row = 0; row < MbkImageExporter.TILE_SIZE; ++row) {
            let dstIndex = (y + row) * dstWidth + x
            for (let col = 0; col < MbkImageExporter.TILE_SIZE; col += 2) {
                const value = src[srcIndex++]
                dst[dstIndex++] = value >> 4
                dst[dstIndex++] = value & 0x0F
            }
        }
    }

    private toPpm(width: number, height: number, indexedPixels: Uint8Array) {
        const header = new TextEncoder().encode(`P6\n${width} ${height}\n255\n`)
        const body = new Uint8Array(indexedPixels.length * 3)
        for (let i = 0; i < indexedPixels.length; ++i) {
            const color = this._palette[indexedPixels[i] & 0x0F]
            const dst = i * 3
            body[dst + 0] = color.r
            body[dst + 1] = color.g
            body[dst + 2] = color.b
        }
        const output = new Uint8Array(header.length + body.length)
        output.set(header, 0)
        output.set(body, header.length)
        return output
    }
}

export { MbkImageExporter }
