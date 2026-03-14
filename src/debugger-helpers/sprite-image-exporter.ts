import * as fs from "fs"
import { READ_BE_UINT16, READ_LE_UINT16 } from "../intern"
import { GAMESCREEN_H, GAMESCREEN_W, UINT16_MAX } from "../game_constants"
import { _conradVisualVariants } from "../staticres"
import { monsterListsByLevel } from "../staticres-monsters"
import { buildResolvedSpriteViewsByIndex } from "../resource/parsers"
import { NUM_SPRITES } from "../resource/constants"
import { Video } from "../video"

type RgbImage = {
    width: number
    height: number
    pixels: Uint8Array
}

type SpritePaletteSource = {
    paletteData: Uint8Array
    isBigEndianPalFile: boolean
}

class SpriteImageExporter {
    private static readonly SPRITE_ENTRY_SIZE = 6
    private static readonly INVALID_OFFSET = 0xFFFFFFFF

    static exportSpriteImage(
        spritePath: string,
        offsetPath: string,
        spriteIndex: number,
        paletteRef: string,
        outputPath: string,
        flags: number = 0
    ) {
        const resolvedSpritesByIndex = this.loadResolvedSpritesByIndex(spritePath, offsetPath)
        const rawSpriteEntry = resolvedSpritesByIndex[spriteIndex]
        if (!rawSpriteEntry) {
            throw new Error(`Missing sprite entry for index ${spriteIndex}`)
        }
        const paletteSource = this.resolvePalette(paletteRef)
        const image = this.renderRawSpriteEntry(rawSpriteEntry, paletteSource, flags)
        fs.writeFileSync(outputPath, this.toPpm(image.width, image.height, image.pixels))
    }

    static exportAllSpriteImages(
        spritePath: string,
        offsetPath: string,
        paletteRef: string,
        outputDir: string,
        flags: number = 0
    ) {
        const path = require("path")
        const resolvedSpritesByIndex = this.loadResolvedSpritesByIndex(spritePath, offsetPath)
        const paletteSource = this.resolvePalette(paletteRef)
        fs.mkdirSync(outputDir, { recursive: true })

        for (let spriteIndex = 0; spriteIndex < resolvedSpritesByIndex.length; ++spriteIndex) {
            const rawSpriteEntry = resolvedSpritesByIndex[spriteIndex]
            if (!rawSpriteEntry) {
                continue
            }
            const image = this.renderRawSpriteEntry(rawSpriteEntry, paletteSource, flags)
            const outputPath = path.join(outputDir, `sprite-${spriteIndex.toString().padStart(4, "0")}.ppm`)
            fs.writeFileSync(outputPath, this.toPpm(image.width, image.height, image.pixels))
        }
    }

    private static loadResolvedSpritesByIndex(spritePath: string, offsetPath: string) {
        const spriteBlob = new Uint8Array(fs.readFileSync(spritePath)).subarray(12)
        const offsetData = new Uint8Array(fs.readFileSync(offsetPath))
        return buildResolvedSpriteViewsByIndex(
            offsetData,
            spriteBlob,
            NUM_SPRITES,
            UINT16_MAX,
            this.INVALID_OFFSET,
            this.SPRITE_ENTRY_SIZE
        )
    }

    private static resolvePalette(paletteRef: string): SpritePaletteSource {
        const conradMatch = /^conrad:(\d+)$/.exec(paletteRef)
        if (conradMatch) {
            const variantId = Number(conradMatch[1])
            const conradVisual = _conradVisualVariants.find((variant) => variant.id === variantId)
            if (!conradVisual) {
                throw new Error(`Unknown Conrad palette variant ${variantId}`)
            }
            return {
                paletteData: conradVisual.palette,
                isBigEndianPalFile: false
            }
        }

        const monsterMatch = /^monster:(\d+):(\d+)$/.exec(paletteRef)
        if (monsterMatch) {
            const level = Number(monsterMatch[1])
            const monsterScriptNodeIndex = Number(monsterMatch[2])
            const monster = monsterListsByLevel[level]?.find((entry) => entry.monsterScriptNodeIndex === monsterScriptNodeIndex)
            if (!monster) {
                throw new Error(`Unknown monster palette reference '${paletteRef}'`)
            }
            return {
                paletteData: monster.palette,
                isBigEndianPalFile: false
            }
        }

        return {
            paletteData: new Uint8Array(fs.readFileSync(paletteRef)),
            isBigEndianPalFile: true
        }
    }

    private static renderRawSpriteEntry(rawSpriteEntry: Uint8Array, paletteSource: SpritePaletteSource, flags: number): RgbImage {
        if (rawSpriteEntry.length < 4) {
            throw new Error("Sprite entry is missing its header")
        }
        const encodedWidth = rawSpriteEntry[2]
        const encodedHeight = rawSpriteEntry[3]
        const spritePayload = rawSpriteEntry.subarray(4)
        const renderData = (encodedWidth & 0x80) !== 0 ? spritePayload : this.decodeSpmPayload(spritePayload)

        const indexedLayer = new Uint8Array(GAMESCREEN_W * GAMESCREEN_H)
        this.drawCharacterToIndexedLayer(indexedLayer, renderData, 0, 0, encodedHeight, encodedWidth, flags)
        return this.buildRgbImageFromIndexedLayer(indexedLayer, paletteSource)
    }

    private static decodeSpmPayload(dataPtr: Uint8Array) {
        const len = 2 * READ_BE_UINT16(dataPtr)
        dataPtr = dataPtr.subarray(2)
        const intermediate = new Uint8Array(len)
        let index = 0
        for (let i = 0; i < len; ++i) {
            intermediate[index++] = dataPtr[i] >> 4
            intermediate[index++] = dataPtr[i] & 15
        }

        const decoded = new Uint8Array(1024)
        let dstIndex = 0
        let srcIndex = 0
        do {
            const code = intermediate[srcIndex++]
            if (code === 0xF) {
                let color = intermediate[srcIndex++]
                let count = intermediate[srcIndex++]
                if (color === 0xF) {
                    count = (count << 4) | intermediate[srcIndex++]
                    color = intermediate[srcIndex++]
                }
                count += 4
                decoded.fill(color, dstIndex, dstIndex + count)
                dstIndex += count
            } else {
                decoded[dstIndex++] = code
            }
        } while (srcIndex < len)
        return decoded
    }

    private static drawCharacterToIndexedLayer(dstLayer: Uint8Array, dataPtr: Uint8Array, posX: number, posY: number, a: number, b: number, flags: number) {
        let isColumnMajor = false
        if (b & 0x40) {
            b &= 0xBF
            const tmp = a
            a = b
            b = tmp
            isColumnMajor = true
        }

        const spriteHeight = a
        const spriteWidth = b
        let src = 0
        let clipFromRight = false

        let clippedWidth: number
        if (posX >= 0) {
            if (posX + spriteWidth < GAMESCREEN_W) {
                clippedWidth = spriteWidth
            } else {
                clippedWidth = GAMESCREEN_W - posX
                if (flags & 0x02) {
                    clipFromRight = true
                    if (isColumnMajor) {
                        src += (spriteWidth - 1) * spriteHeight
                    } else {
                        src += spriteWidth - 1
                    }
                }
            }
        } else {
            clippedWidth = posX + spriteWidth
            if (!(flags & 0x02)) {
                if (isColumnMajor) {
                    src -= spriteHeight * posX
                } else {
                    src -= posX
                }
                posX = 0
            } else {
                clipFromRight = true
                if (isColumnMajor) {
                    src += (posX + spriteWidth - 1) * spriteHeight
                } else {
                    src += posX + spriteWidth - 1
                }
                posX = 0
            }
        }
        if (clippedWidth <= 0) {
            return
        }

        let clippedHeight: number
        if (posY >= 0) {
            clippedHeight = posY + spriteHeight < GAMESCREEN_H ? spriteHeight : GAMESCREEN_H - posY
        } else {
            clippedHeight = spriteHeight + posY
            if (clipFromRight) {
                src -= posY
            } else {
                src -= spriteWidth * posY
            }
            posY = 0
        }
        if (clippedHeight <= 0) {
            return
        }

        if (!clipFromRight && (flags & 0x02)) {
            if (isColumnMajor) {
                src += spriteHeight * (spriteWidth - 1)
            } else {
                src += spriteWidth - 1
            }
        }

        if (!(flags & 0x02)) {
            if (isColumnMajor) {
                this.drawSpriteSub5(dataPtr, src, dstLayer, posX, posY, spriteHeight, clippedHeight, clippedWidth)
            } else {
                this.drawSpriteSub3(dataPtr, src, dstLayer, posX, posY, spriteWidth, clippedHeight, clippedWidth)
            }
        } else {
            if (isColumnMajor) {
                this.drawSpriteSub6(dataPtr, src, dstLayer, posX, posY, spriteHeight, clippedHeight, clippedWidth)
            } else {
                this.drawSpriteSub4(dataPtr, src, dstLayer, posX, posY, spriteWidth, clippedHeight, clippedWidth)
            }
        }
    }

    private static drawSpriteSub3(src: Uint8Array, srcOffset: number, dst: Uint8Array, x: number, y: number, pitch: number, h: number, w: number) {
        let dstIndex = y * GAMESCREEN_W + x
        while (h--) {
            for (let i = 0; i < w; ++i) {
                const color = src[srcOffset + i]
                if (color !== 0) {
                    dst[dstIndex + i] = color
                }
            }
            srcOffset += pitch
            dstIndex += GAMESCREEN_W
        }
    }

    private static drawSpriteSub4(src: Uint8Array, srcOffset: number, dst: Uint8Array, x: number, y: number, pitch: number, h: number, w: number) {
        let dstIndex = y * GAMESCREEN_W + x
        while (h--) {
            for (let i = 0; i < w; ++i) {
                const color = src[srcOffset - i]
                if (color !== 0) {
                    dst[dstIndex + i] = color
                }
            }
            srcOffset += pitch
            dstIndex += GAMESCREEN_W
        }
    }

    private static drawSpriteSub5(src: Uint8Array, srcOffset: number, dst: Uint8Array, x: number, y: number, pitch: number, h: number, w: number) {
        let dstIndex = y * GAMESCREEN_W + x
        while (h--) {
            for (let i = 0; i < w; ++i) {
                const color = src[i * pitch + srcOffset]
                if (color !== 0) {
                    dst[dstIndex + i] = color
                }
            }
            ++srcOffset
            dstIndex += GAMESCREEN_W
        }
    }

    private static drawSpriteSub6(src: Uint8Array, srcOffset: number, dst: Uint8Array, x: number, y: number, pitch: number, h: number, w: number) {
        let dstIndex = y * GAMESCREEN_W + x
        while (h--) {
            for (let i = 0; i < w; ++i) {
                const color = src[srcOffset - i * pitch]
                if (color !== 0) {
                    dst[dstIndex + i] = color
                }
            }
            ++srcOffset
            dstIndex += GAMESCREEN_W
        }
    }

    private static buildRgbImageFromIndexedLayer(indexedLayer: Uint8Array, paletteSource: SpritePaletteSource): RgbImage {
        let minX = GAMESCREEN_W
        let minY = GAMESCREEN_H
        let maxX = -1
        let maxY = -1

        for (let y = 0; y < GAMESCREEN_H; ++y) {
            for (let x = 0; x < GAMESCREEN_W; ++x) {
                if (indexedLayer[y * GAMESCREEN_W + x] !== 0) {
                    if (x < minX) minX = x
                    if (x > maxX) maxX = x
                    if (y < minY) minY = y
                    if (y > maxY) maxY = y
                }
            }
        }

        if (maxX < minX || maxY < minY) {
            return {
                width: 1,
                height: 1,
                pixels: new Uint8Array([0, 0, 0])
            }
        }

        const width = maxX - minX + 1
        const height = maxY - minY + 1
        const pixels = new Uint8Array(width * height * 3)

        for (let y = 0; y < height; ++y) {
            for (let x = 0; x < width; ++x) {
                const indexedPixel = indexedLayer[(minY + y) * GAMESCREEN_W + minX + x]
                const dstOffset = (y * width + x) * 3
                if (indexedPixel === 0) {
                    continue
                }
                const color = paletteSource.isBigEndianPalFile
                    ? Video.AMIGA_convertColor(READ_BE_UINT16(paletteSource.paletteData, indexedPixel * 2), true)
                    : Video.AMIGA_convertColor(READ_LE_UINT16(paletteSource.paletteData, indexedPixel * 2))
                pixels[dstOffset + 0] = color.r
                pixels[dstOffset + 1] = color.g
                pixels[dstOffset + 2] = color.b
            }
        }

        return { width, height, pixels }
    }

    private static toPpm(width: number, height: number, rgbPixels: Uint8Array) {
        const header = new TextEncoder().encode(`P6\n${width} ${height}\n255\n`)
        const output = new Uint8Array(header.length + rgbPixels.length)
        output.set(header, 0)
        output.set(rgbPixels, header.length)
        return output
    }
}

export { SpriteImageExporter }
