import { CLIP, Color } from '../core/intern'
import { Scaler, ScalerType, _internalScaler } from '../core/scaler'
import { assert } from '../core/assert'

function getRootCanvasElement(): HTMLCanvasElement {
    const canvas = document.getElementById('root')
    if (!(canvas instanceof HTMLCanvasElement)) {
        throw new Error("Missing root canvas element '#root'")
    }
    return canvas
}

function applyCanvasStyles(canvas: HTMLCanvasElement, width: number, height: number) {
    if (canvas.width !== width) {
        canvas.width = width
    }
    if (canvas.height !== height) {
        canvas.height = height
    }
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    canvas.style.boxShadow = '10px 10px 68px 0px rgba(0,0,0,0.75)'
    canvas.style.borderRadius = '4px'
    canvas.style.margin = 'auto'
    canvas.style.display = 'block'
    canvas.style.imageRendering = 'pixelated'
}

function resolveScaler(name: string): { type: ScalerType, scaler: Scaler | null } | null {
    const scalers: Array<{ name: string, type: ScalerType, scaler: Scaler | null }> = [
        { name: 'point', type: ScalerType.kScalerTypePoint, scaler: null },
        { name: 'linear', type: ScalerType.kScalerTypeLinear, scaler: null },
        { name: 'scale', type: ScalerType.kScalerTypeInternal, scaler: _internalScaler },
    ]
    const normalizedName = name.toLowerCase()
    for (const scalerOption of scalers) {
        if (scalerOption.name === normalizedName) {
            return scalerOption
        }
    }
    return null
}

function getClippedScaleFactor(scaler: Scaler | null, factor: number) {
    if (scaler) {
        return CLIP(factor, scaler.factorMin, scaler.factorMax)
    }
    if (!Number.isFinite(factor)) {
        return 1
    }
    return Math.max(1, Math.floor(factor))
}

function setPaletteColor(rgbPalette: Uint8ClampedArray, darkPalette: Uint8ClampedArray, color: number, r: number, g: number, b: number) {
    const index = color * 4
    rgbPalette[index] = r
    rgbPalette[index + 1] = g
    rgbPalette[index + 2] = b
    rgbPalette[index + 3] = 255

    darkPalette[index] = Math.floor(r / 4)
    darkPalette[index + 1] = Math.floor(g / 4)
    darkPalette[index + 2] = Math.floor(b / 4)
    darkPalette[index + 3] = 255
}

function setPalette(rgbPalette: Uint8ClampedArray, darkPalette: Uint8ClampedArray, palette: Uint8Array, colorCount: number) {
    assert(!(colorCount > 256), `Assertion failed: ${colorCount} < 256`)
    let offset = 0
    for (let i = 0; i < colorCount; ++i) {
        setPaletteColor(rgbPalette, darkPalette, i, palette[offset], palette[offset + 1], palette[offset + 2])
        offset += 3
    }
}

function getPaletteEntry(rgbPalette: Uint8ClampedArray, index: number, color: Color) {
    const offset = index * 4
    color.r = rgbPalette[offset]
    color.g = rgbPalette[offset + 1]
    color.b = rgbPalette[offset + 2]
}

function copyIndexedRectToScreenBuffer(
    rgbPalette: Uint8ClampedArray,
    screenBuffer: Uint8ClampedArray,
    screenWidth: number,
    screenHeight: number,
    x: number,
    y: number,
    width: number,
    height: number,
    buf: Uint8Array,
    pitch: number
) {
    if (x < 0) {
        x = 0
    } else if (x >= screenWidth) {
        return
    }
    if (y < 0) {
        y = 0
    } else if (y >= screenHeight) {
        return
    }
    if (x + width > screenWidth) {
        width = screenWidth - x
    }
    if (y + height > screenHeight) {
        height = screenHeight - y
    }

    let screenOffset = x * 4 + y * screenWidth * 4
    let bufOffset = y * pitch + x
    for (let j = 0; j < height; ++j) {
        for (let i = 0; i < width; ++i) {
            const pixelOffset = i * 4
            const colorOffset = buf[bufOffset + i] * 4
            screenBuffer[screenOffset + pixelOffset] = rgbPalette[colorOffset]
            screenBuffer[screenOffset + pixelOffset + 1] = rgbPalette[colorOffset + 1]
            screenBuffer[screenOffset + pixelOffset + 2] = rgbPalette[colorOffset + 2]
            screenBuffer[screenOffset + pixelOffset + 3] = rgbPalette[colorOffset + 3]
        }
        screenOffset += screenWidth * 4
        bufOffset += pitch
    }
}

function copyRgb24RectToScreenBuffer(
    screenBuffer: Uint8ClampedArray,
    screenWidth: number,
    screenHeight: number,
    x: number,
    y: number,
    width: number,
    height: number,
    rgb: Uint8Array
) {
    assert(!(x < 0 || x + width > screenWidth || y < 0 || y + height > screenHeight), `Assertion failed: ${x} >= 0 && ${x + width} <= ${screenWidth} && ${y} >= 0 && ${y + height} <= ${screenHeight}`)
    let screenOffset = (y * screenWidth + x) * 4
    let rgbOffset = 0
    for (let j = 0; j < height; ++j) {
        for (let i = 0; i < width; ++i) {
            screenBuffer[screenOffset + i * 4] = rgb[rgbOffset]
            screenBuffer[screenOffset + i * 4 + 1] = rgb[rgbOffset + 1]
            screenBuffer[screenOffset + i * 4 + 2] = rgb[rgbOffset + 2]
            screenBuffer[screenOffset + i * 4 + 3] = 255
            rgbOffset += 3
        }
        screenOffset += screenWidth * 4
    }
}

async function presentScreen(
    context: CanvasRenderingContext2D,
    frameContext: CanvasRenderingContext2D,
    imageData: ImageData,
    screenWidth: number,
    screenHeight: number,
    outputWidth: number,
    outputHeight: number,
    imageSmoothingEnabled: boolean,
    fadeOnUpdateScreen: boolean,
    shakeOffset: number,
    rgbPalette: Uint8ClampedArray,
    hiResRoomPixels: Uint8Array | null,
    hiResRoomWidth: number,
    hiResRoomHeight: number,
    hiResRoomScale: number,
    hiResMaskedLayer: Uint8Array | null,
    hiResTopLayer: Uint8Array | null,
    sleep: (duration: number) => Promise<void>
) {
    applyCanvasStyles(context.canvas as HTMLCanvasElement, outputWidth, outputHeight)
    context.clearRect(0, 0, outputWidth, outputHeight)
    context.imageSmoothingEnabled = imageSmoothingEnabled
    frameContext.putImageData(imageData, 0, 0)
    const scaledShakeOffset = Math.round(shakeOffset * outputHeight / screenHeight)
    let hiResImageData: ImageData | null = null
    let hiResData: Uint8ClampedArray | null = null

    const composeHiResFrame = () => {
        if (!hiResRoomPixels || !hiResMaskedLayer || !hiResTopLayer || hiResRoomScale <= 0) {
            return false
        }
        if (!hiResImageData || hiResImageData.width !== hiResRoomWidth || hiResImageData.height !== hiResRoomHeight) {
            hiResImageData = context.createImageData(hiResRoomWidth, hiResRoomHeight)
            hiResData = hiResImageData.data
        }
        const dst = hiResData as Uint8ClampedArray
        for (let i = 0; i < hiResRoomPixels.length; ++i) {
            const colorOffset = hiResRoomPixels[i] * 4
            const dstOffset = i * 4
            dst[dstOffset] = rgbPalette[colorOffset]
            dst[dstOffset + 1] = rgbPalette[colorOffset + 1]
            dst[dstOffset + 2] = rgbPalette[colorOffset + 2]
            dst[dstOffset + 3] = rgbPalette[colorOffset + 3]
        }

        for (let y = 0; y < screenHeight; ++y) {
            const rowOffset = y * screenWidth
            const dstY = y * hiResRoomScale
            for (let x = 0; x < screenWidth; ++x) {
                const pixel = hiResMaskedLayer[rowOffset + x]
                if (pixel === 0) {
                    continue
                }
                const colorOffset = pixel * 4
                const dstX = x * hiResRoomScale
                for (let oy = 0; oy < hiResRoomScale; ++oy) {
                    const hiResRow = (dstY + oy) * hiResRoomWidth
                    for (let ox = 0; ox < hiResRoomScale; ++ox) {
                        const hiResIndex = hiResRow + dstX + ox
                        if (hiResRoomPixels[hiResIndex] & 0x80) {
                            continue
                        }
                        const dstOffset = hiResIndex * 4
                        dst[dstOffset] = rgbPalette[colorOffset]
                        dst[dstOffset + 1] = rgbPalette[colorOffset + 1]
                        dst[dstOffset + 2] = rgbPalette[colorOffset + 2]
                        dst[dstOffset + 3] = rgbPalette[colorOffset + 3]
                    }
                }
            }
        }

        for (let y = 0; y < screenHeight; ++y) {
            const rowOffset = y * screenWidth
            const dstY = y * hiResRoomScale
            for (let x = 0; x < screenWidth; ++x) {
                const pixel = hiResTopLayer[rowOffset + x]
                if (pixel === 0) {
                    continue
                }
                const colorOffset = pixel * 4
                const dstX = x * hiResRoomScale
                for (let oy = 0; oy < hiResRoomScale; ++oy) {
                    const hiResRow = (dstY + oy) * hiResRoomWidth
                    for (let ox = 0; ox < hiResRoomScale; ++ox) {
                        const dstOffset = (hiResRow + dstX + ox) * 4
                        dst[dstOffset] = rgbPalette[colorOffset]
                        dst[dstOffset + 1] = rgbPalette[colorOffset + 1]
                        dst[dstOffset + 2] = rgbPalette[colorOffset + 2]
                        dst[dstOffset + 3] = rgbPalette[colorOffset + 3]
                    }
                }
            }
        }

        context.putImageData(hiResImageData, 0, scaledShakeOffset)
        return true
    }

    const drawFrame = () => {
        if (composeHiResFrame()) {
            return
        }
        context.drawImage(frameContext.canvas, 0, 0, screenWidth, screenHeight, 0, scaledShakeOffset, outputWidth, outputHeight)
    }

    if (fadeOnUpdateScreen) {
        for (let i = 1; i <= 16; ++i) {
            context.fillStyle = `rgba(0,0,0, ${(256 - i * 16) / 255})`
            drawFrame()
            context.fillRect(0, 0, outputWidth, outputHeight)
            await sleep(15)
        }
        return false
    }

    drawFrame()
    return fadeOnUpdateScreen
}

function drawRectOutline(
    screenBuffer: Uint8ClampedArray,
    rgbPalette: Uint8ClampedArray,
    screenWidth: number,
    screenHeight: number,
    x: number,
    y: number,
    width: number,
    height: number,
    color: number
) {
    const x1 = x
    const y1 = y
    const x2 = x + width - 1
    const y2 = y + height - 1
    assert(!(x1 < 0 && x2 >= screenWidth && y1 < 0 && y2 >= screenHeight), `Assertion failed: ${x1} < 0 && ${x2} >= ${screenWidth} && ${y1} < 0 && ${y2} >= ${screenHeight}`)
    for (let i = x1; i <= x2; ++i) {
        const topOffset = (y1 * screenWidth + i) * 4
        const bottomOffset = (y2 * screenWidth + i) * 4
        screenBuffer[topOffset] = screenBuffer[bottomOffset] = rgbPalette[color * 4]
        screenBuffer[topOffset + 1] = screenBuffer[bottomOffset + 1] = rgbPalette[color * 4 + 1]
        screenBuffer[topOffset + 2] = screenBuffer[bottomOffset + 2] = rgbPalette[color * 4 + 2]
        screenBuffer[topOffset + 3] = screenBuffer[bottomOffset + 3] = rgbPalette[color * 4 + 3]
    }
    for (let j = y1; j <= y2; ++j) {
        const leftOffset = (j * screenWidth + x1) * 4
        const rightOffset = (j * screenWidth + x2) * 4
        screenBuffer[leftOffset] = screenBuffer[rightOffset] = rgbPalette[color * 4]
        screenBuffer[leftOffset + 1] = screenBuffer[rightOffset + 1] = rgbPalette[color * 4 + 1]
        screenBuffer[leftOffset + 2] = screenBuffer[rightOffset + 2] = rgbPalette[color * 4 + 2]
        screenBuffer[leftOffset + 3] = screenBuffer[rightOffset + 3] = rgbPalette[color * 4 + 3]
    }
}

export {
    applyCanvasStyles,
    copyIndexedRectToScreenBuffer,
    copyRgb24RectToScreenBuffer,
    drawRectOutline,
    getClippedScaleFactor,
    getPaletteEntry,
    getRootCanvasElement,
    presentScreen,
    resolveScaler,
    setPalette,
    setPaletteColor,
}
