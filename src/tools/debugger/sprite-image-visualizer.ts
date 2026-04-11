import { readLeUint16 } from "../../core/intern"
import type { Game } from "../../game/game"
import { gamescreenH, gamescreenW } from "../../core/game_constants"
import { gameDrawCharacter } from "../../game/game_draw"
import { getGameServices } from "../../game/game_services"
import { getGameMonsterVisualRegistry } from "../../game/game_state"
import { Video } from "../../video/video"

type RenderedSpriteImage = {
    width: number
    height: number
    pixels: Uint8ClampedArray
}

class SpriteImageVisualizer {
    private readonly _game: Game

    constructor(game: Game) {
        this._game = game
    }

    renderRawSpriteEntry(rawSpriteEntry: Uint8Array, palette: Uint8Array, flags: number = 0, paletteSlot: number = 0): RenderedSpriteImage {
        const { res, vid } = getGameServices(this._game)
        if (!rawSpriteEntry || rawSpriteEntry.length < 4) {
            throw new Error("Sprite entry is missing its 4-byte header")
        }

        const encodedWidth = rawSpriteEntry[2]
        const encodedHeight = rawSpriteEntry[3]
        const spritePayload = rawSpriteEntry.subarray(4)
        const paletteColorMaskOverride = paletteSlot << 4

        const offscreenLayer = new Uint8Array(gamescreenW * gamescreenH)
        vid.withFrontLayer(offscreenLayer, () => {
            let renderData = spritePayload
            if (!(encodedWidth & 0x80)) {
                vid.pcDecodespm(spritePayload, res.scratchBuffer)
                renderData = res.scratchBuffer
            }
            gameDrawCharacter(this._game, renderData, 0, 0, encodedHeight, encodedWidth, flags, paletteColorMaskOverride)
        })

        return this.buildImageFromIndexedLayer(offscreenLayer, palette)
    }

    downloadConradSprite(animNumber: number, conradVariantId: number = 1, flags: number = 0): void {
        const conradVisual = getGameServices(this._game).res.sprites.loadedConradVisualsByVariantId.get(conradVariantId)
        if (!conradVisual) {
            throw new Error(`Conrad visual ${conradVariantId} has not been initialized`)
        }
        const rawSpriteEntry = conradVisual.resolvedSpriteSet.spritesByIndex[animNumber]
        if (!rawSpriteEntry) {
            throw new Error(`Missing Conrad sprite for anim number ${animNumber}`)
        }
        const image = this.renderRawSpriteEntry(rawSpriteEntry, conradVisual.palette, flags, conradVisual.paletteSlot)
        this.downloadImage(image, `conrad-variant-${conradVariantId}-anim-${animNumber}.png`)
    }

    downloadMonsterSprite(monsterScriptNodeIndex: number, animNumber: number, flags: number = 0): void {
        const monsterVisual = getGameMonsterVisualRegistry(this._game).get(monsterScriptNodeIndex)
        if (!monsterVisual) {
            throw new Error(`Monster visual ${monsterScriptNodeIndex} has not been loaded`)
        }
        const rawSpriteEntry = monsterVisual.resolvedSpriteSet.spritesByIndex[animNumber]
        if (!rawSpriteEntry) {
            throw new Error(`Missing monster sprite for script node ${monsterScriptNodeIndex} anim ${animNumber}`)
        }
        const image = this.renderRawSpriteEntry(rawSpriteEntry, monsterVisual.palette, flags, monsterVisual.paletteSlot)
        this.downloadImage(image, `monster-${monsterScriptNodeIndex}-anim-${animNumber}.png`)
    }

    downloadImage(image: RenderedSpriteImage, filename: string): void {
        const canvas = document.createElement("canvas")
        canvas.width = image.width
        canvas.height = image.height
        const context = canvas.getContext("2d")
        if (!context) {
            throw new Error("Cannot create 2D canvas context for sprite export")
        }
        const imageData = context.createImageData(image.width, image.height)
        imageData.data.set(image.pixels)
        context.putImageData(imageData, 0, 0)

        const link = document.createElement("a")
        link.download = filename
        document.body.appendChild(link)
        if (canvas.toBlob) {
            canvas.toBlob((blob) => {
                if (!blob) {
                    document.body.removeChild(link)
                    return
                }
                const url = URL.createObjectURL(blob)
                link.href = url
                link.click()
                URL.revokeObjectURL(url)
                document.body.removeChild(link)
            }, "image/png")
            return
        }

        link.href = canvas.toDataURL("image/png")
        link.click()
        document.body.removeChild(link)
    }

    private buildImageFromIndexedLayer(indexedLayer: Uint8Array, palette: Uint8Array): RenderedSpriteImage {
        let minX = gamescreenW
        let minY = gamescreenH
        let maxX = -1
        let maxY = -1

        for (let y = 0; y < gamescreenH; ++y) {
            for (let x = 0; x < gamescreenW; ++x) {
                if (indexedLayer[y * gamescreenW + x] !== 0) {
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
                pixels: new Uint8ClampedArray([0, 0, 0, 0])
            }
        }

        const width = maxX - minX + 1
        const height = maxY - minY + 1
        const pixels = new Uint8ClampedArray(width * height * 4)

        for (let y = 0; y < height; ++y) {
            for (let x = 0; x < width; ++x) {
                const indexedPixel = indexedLayer[(minY + y) * gamescreenW + minX + x]
                const dstOffset = (y * width + x) * 4
                if (indexedPixel === 0) {
                    pixels[dstOffset + 3] = 0
                    continue
                }
                const color = Video.amigaConvertcolor(readLeUint16(palette, (indexedPixel & 0x0F) * 2))
                pixels[dstOffset + 0] = color.r
                pixels[dstOffset + 1] = color.g
                pixels[dstOffset + 2] = color.b
                pixels[dstOffset + 3] = 255
            }
        }

        return { width, height, pixels }
    }
}

export { SpriteImageVisualizer }
