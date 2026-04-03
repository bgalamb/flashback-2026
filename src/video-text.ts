import { CHAR_H, CHAR_W, UINT8_MAX } from './game_constants'
import type { VideoLayerState, VideoTextState } from './video-state'

function drawStringChar(dst: Uint8Array, pitch: number, x: number, y: number, src: Uint8Array, color: number, chr: number) {
    let dstOffset = y * pitch + x
    if (chr < 32) {
        throw (`Assertion failed: ${chr} < 32`)
    }
    let srcOffset = (chr - 32) * 8 * 4
    for (let y = 0; y < 8; ++y) {
        for (let x = 0; x < 4; ++x) {
            const c1 = src[srcOffset + x] >>> 4
            if (c1 !== 0) {
                dst[dstOffset] = (c1 === 15) ? color : (0xE0 + c1)
            }
            dstOffset++
            const c2 = src[srcOffset + x] & 15
            if (c2 !== 0) {
                dst[dstOffset] = (c2 === 15) ? color : (0xE0 + c2)
            }
            dstOffset++
        }
        srcOffset += 4
        dstOffset += pitch - CHAR_W
    }
}

function drawStringLenToFrontLayer(layers: VideoLayerState, text: VideoTextState, font: Uint8Array, str: string, len: number, x: number, y: number, color: number) {
    for (let i = 0; i < len; ++i) {
        text.drawChar(layers.frontLayer, layers.w, x + i * CHAR_W, y, font, color, str.charCodeAt(i))
    }
}

function drawStringToFrontLayer(layers: VideoLayerState, text: VideoTextState, font: Uint8Array, str: string, x: number, y: number, color: number): number {
    let len = 0
    let index = 0

    while (1) {
        const c = str.charCodeAt(index++)
        if (c === 0 || c === 0xB || c === 0xA || isNaN(c)) {
            break
        }
        text.drawChar(layers.frontLayer, layers.w, x + len * CHAR_W, y, font, color, c)
        ++len
    }

    return len
}

function drawUiCharToFrontLayer(layers: VideoLayerState, text: VideoTextState, font: Uint8Array, c: number, y: number, x: number) {
    y *= CHAR_W
    x *= CHAR_H
    let src = (c - 32) * 32

    const dst = new Uint8Array(layers.frontLayer.buffer, x + layers.w * y)
    let index = 0

    for (let h = 0; h < CHAR_H; ++h) {
        for (let i = 0; i < 4; ++i, ++src) {
            const c1 = font[src] >>> 4
            if (c1 !== 0) {
                if (c1 !== 2) {
                    dst[0 + index] = text.charFrontColor
                } else {
                    dst[0 + index] = text.charShadowColor
                }
            } else if (text.charTransparentColor !== UINT8_MAX) {
                dst[0 + index] = text.charTransparentColor
            }

            index++
            const c2 = font[src] & 15
            if (c2 !== 0) {
                if (c2 !== 2) {
                    dst[0 + index] = text.charFrontColor
                } else {
                    dst[0 + index] = text.charShadowColor
                }
            } else if (text.charTransparentColor !== UINT8_MAX) {
                dst[0 + index] = text.charTransparentColor
            }
            index++
        }
        index += layers.w - CHAR_W
    }
}

export {
    drawStringChar,
    drawStringLenToFrontLayer,
    drawStringToFrontLayer,
    drawUiCharToFrontLayer,
}
