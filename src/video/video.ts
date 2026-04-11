import { Color, readBeUint16, readLeUint16 } from "../core/intern"
import { Resource } from "../resource/resource"
import { _gameLevels, _palSlot0xF, _textPal } from "../core/staticres"
import type { SystemPort } from "../platform/system-port"
import { screenblockW, screenblockH, gamescreenW, gamescreenH, charH, charW, uint16Max, uint8Max, globalGameOptions } from '../core/game_constants'
import { writeLayerImages, writeLayerPixelData } from "../tools/debugger/front-layer-image"
import { assert } from "../core/assert"
import { applyLevelPalettes, readRoomPaletteOffsets, tryLoadFrontLayerFromFile } from "./video-palette"
import { createVideoLayerState, createVideoPaletteState, createVideoScreenState, createVideoTextState } from "./video-state"
import { decodeIcon, decodeSpc, decodeSpm, drawSpriteSub1, drawSpriteSub2, drawSpriteSub3, drawSpriteSub4, drawSpriteSub5, drawSpriteSub6 } from "./video-sprites"
import { markScreenBlockAsDirty, requestFullRefresh, updateVideoScreen } from "./video-screen"
import { drawStringChar, drawStringLenToFrontLayer, drawStringToFrontLayer, drawUiCharToFrontLayer } from "./video-text"
import { decodeAmigaRle, decodeLevelTiles, decodeMapPlane, decodeSgd, drawTile, drawTileMask } from "./video-tiles"

class Video {
    static _textPal: Uint8Array = _textPal
    static _palSlot0xF: Uint8Array = _palSlot0xF
    static _tempMbkSize = 1024

    _res: Resource
    _stub: SystemPort
    readonly layers = createVideoLayerState()
    readonly palette = createVideoPaletteState()
    readonly text = createVideoTextState((dst: Uint8Array, pitch: number, x: number, y: number, src: Uint8Array, color: number, chr: number) => drawStringChar(dst, pitch, x, y, src, color, chr))
    readonly screen = createVideoScreenState()

    constructor(res: Resource, stub: SystemPort) {
      this._res = res
      this._stub = stub
    }

    private hasHiResRoomLayer() {
        return !!this.layers.hiResRoomPixels
    }

    private copyHiResPresentationLayersToBack() {
        this.layers.hiResMaskedBackLayer.set(this.layers.hiResMaskedLayer)
        this.layers.hiResTopBackLayer.set(this.layers.hiResTopLayer)
    }

    private copyHiResPresentationLayersToTemp() {
        this.layers.hiResMaskedTempLayer.set(this.layers.hiResMaskedLayer)
        this.layers.hiResTopTempLayer.set(this.layers.hiResTopLayer)
    }

    private restoreHiResPresentationLayersFromTemp() {
        this.layers.hiResMaskedLayer.set(this.layers.hiResMaskedTempLayer)
        this.layers.hiResTopLayer.set(this.layers.hiResTopTempLayer)
    }

    private restoreHiResPresentationLayersFromBack() {
        this.layers.hiResMaskedLayer.set(this.layers.hiResMaskedBackLayer)
        this.layers.hiResTopLayer.set(this.layers.hiResTopBackLayer)
    }

    clearLevelPaletteState() {
        this.palette.unkPalSlot1 = 0
        this.palette.unkPalSlot2 = 0
    }

    getTextColors() {
        return {
            frontColor: this.text.charFrontColor,
            transparentColor: this.text.charTransparentColor,
            shadowColor: this.text.charShadowColor,
        }
    }

    setTextColors(frontColor: number, transparentColor: number, shadowColor: number) {
        this.text.charFrontColor = frontColor
        this.text.charTransparentColor = transparentColor
        this.text.charShadowColor = shadowColor
    }

    setTextTransparentColor(color: number) {
        this.text.charTransparentColor = color
    }

    copyFrontLayerToBack() {
        this.layers.backLayer.set(this.layers.frontLayer.subarray(0, this.layers.layerSize))
        if (this.hasHiResRoomLayer()) {
            this.copyHiResPresentationLayersToBack()
        }
    }

    copyFrontLayerToTemp() {
        this.layers.tempLayer.set(this.layers.frontLayer.subarray(0, this.layers.layerSize))
        if (this.hasHiResRoomLayer()) {
            this.copyHiResPresentationLayersToTemp()
        }
    }

    restoreFrontLayerFromTemp() {
        this.layers.frontLayer.set(this.layers.tempLayer.subarray(0, this.layers.layerSize))
        if (this.hasHiResRoomLayer()) {
            this.restoreHiResPresentationLayersFromTemp()
        }
    }

    restoreFrontLayerFromBack() {
        this.layers.frontLayer.set(this.layers.backLayer.subarray(0, this.layers.layerSize))
        if (this.hasHiResRoomLayer()) {
            this.restoreHiResPresentationLayersFromBack()
        }
    }

    presentFrontLayer() {
        this._stub.copyRect(0, 0, this.layers.w, this.layers.h, this.layers.frontLayer, this.layers.w)
    }

    setShakeOffset(offset: number) {
        this.screen.shakeOffset = offset
    }

    withFrontLayer<T>(frontLayer: Uint8Array, draw: () => T) {
        const previousFrontLayer = this.layers.frontLayer
        this.layers.frontLayer = frontLayer
        try {
            return draw()
        } finally {
            this.layers.frontLayer = previousFrontLayer
        }
    }

    drawStringLen(str: string, len: number, x: number, y: number, color: number) {
        const fnt = this._res.ui.fnt
        drawStringLenToFrontLayer(this.layers, this.text, fnt, str, len, x, y, color)
        if (this.hasHiResRoomLayer()) {
            this.withFrontLayer(this.layers.hiResTopLayer, () => drawStringLenToFrontLayer(this.layers, this.text, fnt, str, len, x, y, color))
        }
        this.markBlockAsDirty(x, y, len * charW, charH, 1)
    }

    pcDrawchar(c: number, y: number, x: number) {
        const fnt = this._res.ui.fnt
        drawUiCharToFrontLayer(this.layers, this.text, fnt, c, y, x)
        if (this.hasHiResRoomLayer()) {
            this.withFrontLayer(this.layers.hiResTopLayer, () => drawUiCharToFrontLayer(this.layers, this.text, fnt, c, y, x))
        }
    }

    static amigaConvertcolor(color: number, bgr: boolean = false) {
        let r = (color & 0xF00) >> 8
        const g = (color & 0xF0)  >> 4
        let b =  color & 0xF
        if (bgr) {
            const tmp = r
            r = b
            b = tmp
        }
        return {
            r: (r << 4) | r,
            g: (g << 4) | g,
            b: (b << 4) | b,
        }
    }

    static pcDecodemapplane(sz: number, src: Uint8Array, dst: Uint8Array) {
        decodeMapPlane(sz, src, dst)
    }

    static amigaDecoderle(dst: Uint8Array, src: Uint8Array) {
        decodeAmigaRle(dst, src)
    }

    static pcDrawtilemask(dst: Uint8Array, x0: number, y0: number, w: number, h: number, m: Uint8Array, p: Uint8Array, size: number) {
        drawTileMask(dst, x0, y0, w, h, m, p, size)
    }

    static decodeSgd(dst: Uint8Array, src: Uint8Array, data: Uint8Array) {
        decodeSgd(dst, src, data)
    }

// this is drawing a 8*8 tile with 2 colors, the first color is used for the background, the second for the foreground
/*
yflip = false
xflip = false
pitch = 16
     +--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
     |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
     +--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
     |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
     +--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
     |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
     +--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
64   |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
     +--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
48   |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
     +--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
32   |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
     +--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
16   |4>|4>|5>|5>|6>|6>|7>|7>|  |  |  |  |  |  |  |  |
     +--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
0    |0>|0>|1>|1>|2>|2>|3>|3>|  |  |  |  |  |  |  |  |
     +--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
==============================================================
yflip = false
xflip = true
pitch = 16
     +--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
     |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
     +--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
     |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
     +--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
     |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
     +--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
64   |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
     +--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
48   |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
     +--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
32   |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
     +--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
16   |<7|<7|<6|<6|<5|<5|<4|<4|  |  |  |  |  |  |  |  |
     +--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
0    |<3|<3|<2|<2|<1|<1|<0|<0|  |  |  |  |  |  |  |  |
     +--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
==============================================================
yflip = false
xflip = true
pitch = 16
     +--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
112  |0>|0>|1>|1>|2>|2>|3>|3>|  |  |  |  |  |  |  |  |
     +--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
96   |4>|4>|5>|5>|6>|6>|7>|7>|  |  |  |  |  |  |  |  |
     +--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
80   |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
     +--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
64   |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
     +--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
48   |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
     +--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
32   |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
     +--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
16   |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
     +--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
0    |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
     +--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
==============================================================

==============================================================
yflip = false
xflip = true
pitch = 16
     +--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
112  |<3|<3|<2|<2|<1|<1|<0|<0|  |  |  |  |  |  |  |  |
     +--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
96   |<7|<7|<6|<6|<5|<5|<4|<4|  |  |  |  |  |  |  |  |
     +--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
80   |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
     +--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
64   |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
     +--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
48   |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
     +--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
32   |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
     +--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
16   |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
     +--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
0    |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
     +--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
==============================================================


*/
    static pcDrawtile(dst: Uint8Array, src: Uint8Array, mask: number, xflip: boolean, yflip: boolean, colorKey: number) {
        drawTile(dst, src, mask, xflip, yflip, colorKey)
    }

    static decodeLevHelper(dst: Uint8Array, src: Uint8Array, sgdOffset: number, offset12: number, tileDataBuffer: Uint8Array, sgdBuf: boolean, isPC: boolean) {
        decodeLevelTiles(dst, src, sgdOffset, offset12, tileDataBuffer, sgdBuf, isPC)
    }

    fillRect(x: number, y: number, w: number, h: number, color: number) {
        const p = this.layers.frontLayer
        let index = y * this.layers.w + x
        for (let j = 0; j < h; ++j) {
            p.fill(color, index, index + w)
            index += this.layers.w
        }
        if (this.hasHiResRoomLayer()) {
            const top = this.layers.hiResTopLayer
            index = y * this.layers.w + x
            for (let j = 0; j < h; ++j) {
                top.fill(color, index, index + w)
                index += this.layers.w
            }
        }
    }

    drawString(str: string, x: number, y: number, col: number): string {
        const fnt =  this._res.ui.fnt
        const len = drawStringToFrontLayer(this.layers, this.text, fnt, str, x, y, col)
        if (this.hasHiResRoomLayer()) {
            this.withFrontLayer(this.layers.hiResTopLayer, () => drawStringToFrontLayer(this.layers, this.text, fnt, str, x, y, col))
        }
        this.markBlockAsDirty(x, y, len * charW, charH, 1)

        return str
    }

    async pcDecodemap(level: number, room: number) {
        await readRoomPaletteOffsets(this._res, this.palette, level, room)

        if (!(await tryLoadFrontLayerFromFile(this._res, this.layers, this.palette, level, room))) {
            console.warn(`PC_decodeMap level=${level} room=${room}: missing front layer pixeldata file, filling with zeros`)
            this.layers.frontLayer.fill(0)
            this.layers.backLayer.fill(0)
            this.layers.hiResRoomPixels = null
            this.layers.hiResRoomSource = null
            this.layers.hiResRoomWidth = 0
            this.layers.hiResRoomHeight = 0
            this.layers.hiResRoomScale = 1
            this.layers.hiResMaskedLayer.fill(0)
            this.layers.hiResMaskedBackLayer.fill(0)
            this.layers.hiResMaskedTempLayer.fill(0)
            this.layers.hiResTopLayer.fill(0)
            this.layers.hiResTopBackLayer.fill(0)
            this.layers.hiResTopTempLayer.fill(0)
        }
        this._stub.setHiResRoomLayer(
            this.layers.hiResRoomPixels,
            this.layers.hiResRoomWidth,
            this.layers.hiResRoomHeight,
            this.layers.hiResRoomScale,
            this.layers.hiResMaskedLayer,
            this.layers.hiResTopLayer
        )
        this.copyFrontLayerToBack()
        this.pcSetlevelpalettes(level)
        writeLayerImages(level, room, this.layers.frontLayer, this.layers.w, this.layers.h, this._stub.rgbPalette)
        writeLayerPixelData(level, room, this.layers.frontLayer)
    }

    pcSetlevelpalettes(level: number) {
        applyLevelPalettes(
            this._res,
            this._stub,
            this.palette,
            level,
            (palSlot: number, palData: Uint8Array) => this.setPaletteSlotLE(palSlot, palData),
            () => this.setTextPalette()
        )
    }

    pcDrawstringchar(dst: Uint8Array, pitch: number, x: number, y: number, src: Uint8Array, color: number, chr: number) {
        drawStringChar(dst, pitch, x, y, src, color, chr)
    }

    fullRefresh() {
        requestFullRefresh(this.screen, this.layers)
    }

    async fadeOut() {
        this._stub.fadeScreen()
    }

    setPaletteSlotLE(palSlot: number, palData: Uint8Array) {
        for (let i = 0; i < 16; ++i) {
            const color = readLeUint16(palData, i * 2)
            const c: Color = Video.amigaConvertcolor(color)
            this._stub.setPaletteEntry(palSlot * 16 + i, c)
        }

        if (palSlot === 4 && globalGameOptions.useWhiteTshirt) {
            const color12: Color = Video.amigaConvertcolor(0x888)
            const conradDarkShirtVisual = this._res.sprites.loadedConradVisualsByVariantId.get(2)
            const color13: Color = Video.amigaConvertcolor((palData === conradDarkShirtVisual.palette) ? 0x888 : 0xCCC)
            this._stub.setPaletteEntry(palSlot * 16 + 12, color12)
            this._stub.setPaletteEntry(palSlot * 16 + 13, color13)
        }
    }

    setPaletteSlotBE(paletteColorSlot: number, palOffset: number) {
        let p = palOffset * 32
        const pal = this._res.level.pal
        for (let i = 0; i < 16; ++i) {
            const color = readBeUint16(pal, p)
            p += 2
            const c: Color = Video.amigaConvertcolor(color, true)
            this._stub.setPaletteEntry(paletteColorSlot * 16 + i, c)
        }
    }

    setTextPalette() {
        this.setPaletteSlotLE(0xE, Video._textPal)
    }
    
    setPalette0xF() {
        const p = Video._palSlot0xF
        let index = 0
        for (let i = 0; i < 16; ++i) {
            const c = {
                r: p[index++],
                g: p[index++],
                b: p[index++]
            }
            this._stub.setPaletteEntry(0xF0 + i, c)
        }
    }

    pcDecodeicn(src:Uint8Array, num: number, dst: Uint8Array) {
        decodeIcon(src, num, dst)
    }
    
    pcDecodespc(src: Uint8Array, w: number, h: number, dst: Uint8Array) {
        decodeSpc(src, w, h, dst)
    }
    
    pcDecodespm(dataPtr: Uint8Array, dst: Uint8Array) {
        decodeSpm(dataPtr, dst)
    }

    drawSpriteSub1(src: Uint8Array, dst: Uint8Array, pitch: number, h: number, w: number, colMask: number) {
        drawSpriteSub1(src, dst, pitch, h, w, colMask)
    }

    drawSpriteSub1ToFrontLayer(src: Uint8Array, dstOffset: number, pitch: number, h: number, w: number, colMask: number) {
        drawSpriteSub1(src, this.layers.frontLayer.subarray(dstOffset), pitch, h, w, colMask)
        if (this.hasHiResRoomLayer()) {
            drawSpriteSub1(src, this.layers.hiResTopLayer.subarray(dstOffset), pitch, h, w, colMask)
        }
    }
    
    drawSpriteSub2(src: Uint8Array, dst: Uint8Array, pitch: number, h: number, w: number, colMask: number) {
        drawSpriteSub2(src, dst, pitch, h, w, colMask)
    }

    drawSpriteSub2ToFrontLayer(src: Uint8Array, dstOffset: number, pitch: number, h: number, w: number, colMask: number) {
        drawSpriteSub2(src, this.layers.frontLayer.subarray(dstOffset), pitch, h, w, colMask)
        if (this.hasHiResRoomLayer()) {
            drawSpriteSub2(src, this.layers.hiResTopLayer.subarray(dstOffset), pitch, h, w, colMask)
        }
    }
    
    drawSpriteSub3(src: Uint8Array, dst: Uint8Array, pitch: number, h: number, w: number, colMask: number) {
        drawSpriteSub3(src, dst, pitch, h, w, colMask)
    }

    drawSpriteSub3ToFrontLayer(src: Uint8Array, dstOffset: number, pitch: number, h: number, w: number, colMask: number) {
        drawSpriteSub3(src, this.layers.frontLayer.subarray(dstOffset), pitch, h, w, colMask)
        if (this.hasHiResRoomLayer()) {
            drawSpriteSub3(src, this.layers.hiResMaskedLayer.subarray(dstOffset), pitch, h, w, colMask)
        }
    }
    
    drawSpriteSub4(src: Uint8Array, dst: Uint8Array, pitch: number, h: number, w: number, colMask: number) {
        drawSpriteSub4(src, dst, pitch, h, w, colMask)
    }

    drawSpriteSub4ToFrontLayer(src: Uint8Array, dstOffset: number, pitch: number, h: number, w: number, colMask: number) {
        drawSpriteSub4(src, this.layers.frontLayer.subarray(dstOffset), pitch, h, w, colMask)
        if (this.hasHiResRoomLayer()) {
            drawSpriteSub4(src, this.layers.hiResMaskedLayer.subarray(dstOffset), pitch, h, w, colMask)
        }
    }
    
    drawSpriteSub5(src: Uint8Array, dst: Uint8Array, pitch: number, h: number, w: number, colMask: number) {
        drawSpriteSub5(src, dst, pitch, h, w, colMask)
    }

    drawSpriteSub5ToFrontLayer(src: Uint8Array, dstOffset: number, pitch: number, h: number, w: number, colMask: number) {
        drawSpriteSub5(src, this.layers.frontLayer.subarray(dstOffset), pitch, h, w, colMask)
        if (this.hasHiResRoomLayer()) {
            drawSpriteSub5(src, this.layers.hiResMaskedLayer.subarray(dstOffset), pitch, h, w, colMask)
        }
    }
    
    drawSpriteSub6(src: Uint8Array, dst: Uint8Array, pitch: number, h: number, w: number, colMask: number) {
        drawSpriteSub6(src, dst, pitch, h, w, colMask)
    }

    drawSpriteSub6ToFrontLayer(src: Uint8Array, dstOffset: number, pitch: number, h: number, w: number, colMask: number) {
        drawSpriteSub6(src, this.layers.frontLayer.subarray(dstOffset), pitch, h, w, colMask)
        if (this.hasHiResRoomLayer()) {
            drawSpriteSub6(src, this.layers.hiResMaskedLayer.subarray(dstOffset), pitch, h, w, colMask)
        }
    }

    markBlockAsDirty(x: number, y: number, w: number, h: number, scale: number) {
        markScreenBlockAsDirty(this.layers, this.screen, x, y, w, h, scale)
    }

    async updateScreen() {
        await updateVideoScreen(this._stub, this.layers, this.screen)
    }
}

export { Video, gamescreenW, gamescreenH }
