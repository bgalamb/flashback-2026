import { READ_BE_UINT16 } from "../intern"

type RgbColor = {
    r: number
    g: number
    b: number
}

class PaletteImageExporter {
    private static readonly COLORS_PER_SLOT = 16
    private static readonly BYTES_PER_COLOR = 2
    private static readonly SLOT_SIZE = PaletteImageExporter.COLORS_PER_SLOT * PaletteImageExporter.BYTES_PER_COLOR
    private static readonly GRID_SIZE = 1

    private _paletteData: Uint8Array

    constructor(paletteData: Uint8Array) {
        this._paletteData = paletteData
    }

    static exportPaletteImage(palPath: string, outputPath: string, squareSize: number = 16) {
        const fs = require("fs")
        const paletteData = new Uint8Array(fs.readFileSync(palPath))
        const exporter = new PaletteImageExporter(paletteData)
        exporter.writePpm(outputPath, squareSize)
    }

    writePpm(outputPath: string, squareSize: number = 16) {
        const fs = require("fs")
        const image = this.buildImage(squareSize)
        fs.writeFileSync(outputPath, this.toPpm(image.width, image.height, image.pixels))
    }

    buildImage(squareSize: number = 16) {
        const swatchSize = Math.max(1, squareSize | 0)
        const paletteCount = this.getPaletteCount()
        const cellSize = swatchSize + PaletteImageExporter.GRID_SIZE
        const width = PaletteImageExporter.GRID_SIZE + PaletteImageExporter.COLORS_PER_SLOT * cellSize
        const height = PaletteImageExporter.GRID_SIZE + Math.max(1, paletteCount) * cellSize
        const pixels = new Uint8Array(width * height * 3)

        for (let slot = 0; slot < paletteCount; ++slot) {
            for (let colorIndex = 0; colorIndex < PaletteImageExporter.COLORS_PER_SLOT; ++colorIndex) {
                const color = this.getPaletteColor(slot, colorIndex)
                this.fillRect(
                    pixels,
                    width,
                    PaletteImageExporter.GRID_SIZE + colorIndex * cellSize,
                    PaletteImageExporter.GRID_SIZE + slot * cellSize,
                    swatchSize,
                    swatchSize,
                    color
                )
            }
        }

        return { width, height, pixels }
    }

    private getPaletteCount() {
        return (this._paletteData.length / PaletteImageExporter.SLOT_SIZE) >> 0
    }

    private getPaletteColor(slot: number, colorIndex: number) {
        const offset = slot * PaletteImageExporter.SLOT_SIZE + colorIndex * PaletteImageExporter.BYTES_PER_COLOR
        return PaletteImageExporter.amigaConvertColor(READ_BE_UINT16(this._paletteData, offset), true)
    }

    private fillRect(
        pixels: Uint8Array,
        width: number,
        x: number,
        y: number,
        rectWidth: number,
        rectHeight: number,
        color: RgbColor
    ) {
        for (let row = 0; row < rectHeight; ++row) {
            let dst = ((y + row) * width + x) * 3
            for (let col = 0; col < rectWidth; ++col) {
                pixels[dst + 0] = color.r
                pixels[dst + 1] = color.g
                pixels[dst + 2] = color.b
                dst += 3
            }
        }
    }

    private toPpm(width: number, height: number, rgbPixels: Uint8Array) {
        const header = new TextEncoder().encode(`P6\n${width} ${height}\n255\n`)
        const output = new Uint8Array(header.length + rgbPixels.length)
        output.set(header, 0)
        output.set(rgbPixels, header.length)
        return output
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
}

export { PaletteImageExporter }
