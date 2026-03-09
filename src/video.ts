import { global_game_options } from "./configs/global_game_options"
import { Color, READ_BE_UINT16, READ_BE_UINT32, READ_LE_UINT16, READ_LE_UINT32 } from "./intern"
import { WidescreenMode } from "./enums/common_enums";
import { Resource } from "./resource"
import { _conradPal1, _conradPal2, _gameLevels, _palSlot0xF, _textPal } from "./staticres"
import { SystemStub } from "./systemstub_web"
import { bytekiller_unpack } from "./unpack"
import { SCREENBLOCK_W, SCREENBLOCK_H, GAMESCREEN_W, GAMESCREEN_H, CHAR_H, CHAR_W, UINT16_MAX, UINT8_MAX } from './game_constants'
import { writeLayerImages, writeLayerPixelData } from "./debugger-helpers/front-layer-image"
import { assert } from "./assert"
import { File } from "./file"

type drawCharFunc = (p1: Uint8Array, p2: number, p3: number, p4:number, p5: Uint8Array, p6: number, p7: number) => void

class Video {
    static _conrad_palette1: Uint8Array = _conradPal1
    static _conrad_palette2: Uint8Array = _conradPal2
    static _textPal: Uint8Array = _textPal
    static _palSlot0xF: Uint8Array = _palSlot0xF
    static _tempMbkSize = 1024


    _res: Resource
    _stub: SystemStub
    _widescreenMode: WidescreenMode

    _w: number
    _h: number
    _layerSize: number
    _frontLayer: Uint8Array
    _backLayer: Uint8Array
    _tempLayer: Uint8Array
    _tempLayer2: Uint8Array

    _unkPalSlot1: number
    _unkPalSlot2: number
    _map_palette_offset_slot1: number
    _map_palette_offset_slot2: number
    _map_palette_offset_slot3: number
    _map_palette_offset_slot4: number
    _paletteHeaderOffsetsCache: Array<[number, number, number, number] | null | undefined>
    _paletteHeaderColorsCache: Array<{ slot1: Color[], slot2: Color[], slot3: Color[], slot4: Color[] } | null | undefined>

    _charFrontColor: number
    _charTransparentColor: number
    _charShadowColor: number
    _screenBlocks: Uint8Array
    _fullRefresh: boolean
    _shakeOffset: number
    _drawChar: drawCharFunc

    constructor(res: Resource, stub: SystemStub) {
      this._res = res
      this._stub = stub

      this._w = GAMESCREEN_W
      this._h = GAMESCREEN_H
      this._layerSize = this._w * this._h             // 256 * 224 =  57344
      this._frontLayer = new Uint8Array(this._layerSize)
      this._backLayer = new Uint8Array(this._layerSize)
      this._tempLayer = new Uint8Array(this._layerSize)
      this._tempLayer2 = new Uint8Array(this._layerSize)
      this._screenBlocks = new Uint8Array((this._w / SCREENBLOCK_W) * (this._h / SCREENBLOCK_H)) // (258 / 8) * (224 / 8) = 32 * 28
      this._fullRefresh = true
      this._shakeOffset = 0
      this._charFrontColor = 0
      this._charTransparentColor = 0
      this._charShadowColor = 0
      this._paletteHeaderOffsetsCache = []
      this._paletteHeaderColorsCache = []
      this._drawChar = (dst: Uint8Array, pitch: number, x: number, y: number, src: Uint8Array, color: number, chr: number) => this.PC_drawStringChar(dst, pitch, x, y, src, color, chr)

    }
    drawStringLen(str: string, len: number, x: number, y: number, color: number) {
        const fnt = this._res._fnt
        for (let i = 0; i < len; ++i) {
            this._drawChar(this._frontLayer, this._w, x + i * CHAR_W, y, fnt, color, str.charCodeAt(i))
        }
        this.markBlockAsDirty(x, y, len * CHAR_W, CHAR_H, 1)
    }

    PC_drawChar(c: number, y: number, x: number) {
        const fnt = this._res._fnt
        y *= CHAR_W
        x *= CHAR_H
        let src = (c - 32) * 32

        let dst = new Uint8Array(this._frontLayer.buffer, x + this._w * y)
        let index = 0

        for (let h = 0; h < CHAR_H; ++h) {
            for (let i = 0; i < 4; ++i, ++src) {
                const c1 = fnt[src] >>> 4
                if (c1 !== 0) {
                    if (c1 !== 2) {
                        dst[0 + index] = this._charFrontColor
                    } else {
                        dst[0 + index] = this._charShadowColor
                    }
                } else if (this._charTransparentColor !== UINT8_MAX) {
                    dst[0 + index] = this._charTransparentColor
                }

                index++
                const c2 = fnt[src] & 15
                if (c2 !== 0) {
                    if (c2 !== 2) {
                        dst[0 + index] = this._charFrontColor
                    } else {
                        dst[0 + index] = this._charShadowColor
                    }
                } else if (this._charTransparentColor !== UINT8_MAX) {
                    dst[0 + index] = this._charTransparentColor
                }
                index++
            }
            index += this._w - CHAR_W
        }
    }

    static AMIGA_convertColor(color: number, bgr: boolean = false) {
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

    static PC_decodeMapPlane(sz: number, src: Uint8Array, dst: Uint8Array) {
        const end = sz
        let index = 0
        while (index < end) {
            let code = src[index++] << 8 >> 8
            if (code < 0) {
                const len = 1 - code
                dst.fill(src[index++], 0, len)
                dst = dst.subarray(len)
            } else {
                ++code
                dst.set(src.subarray(0, code))
                index += code
                dst = dst.subarray(code)
            }
        }
    }

    static AMIGA_decodeRle(dst: Uint8Array, src: Uint8Array) {
        const size = READ_BE_UINT16(src) & 0x7FFF
        let dstIndex = 0
        src = src.subarray(2)
        for (let i = 0; i < size; ) {
            let code = src[i++]
            if ((code & 0x80) === 0) {
                ++code
                if (i + code > size) {
                    code = size - i
                }
                dst.set(src.subarray(i, i + code), dstIndex)
                i += code
            } else {
                code = 1 - (code << 24 >> 24)
                dst.fill(src[i], dstIndex, dstIndex + code)
                ++i
            }
            dstIndex += code
        }
    }

    static PC_drawTileMask(dst: Uint8Array, x0: number, y0: number, w: number, h: number, m: Uint8Array, p: Uint8Array, size: number) {
        assert(!(size !== (w * 2 * h)), `Assertion failed: ${size} === ${w * 2 * h}`)
        let mIndex = 0
        let pIndex = 0
        for (let y = 0; y < h; ++y) {
            for (let x = 0; x < w; ++x) {
                const bits = READ_BE_UINT16(m, mIndex)
                mIndex += 2
                for (let bit = 0; bit < 8; ++bit) {
                    const j = y0 + y
                    const i = x0 + 2 * (x * 8 + bit)
                    if (i >= 0 && i < GAMESCREEN_W && j >= 0 && j < GAMESCREEN_H) {
                        const color = p[pIndex]
                        if (bits & (1 << (15 - (bit * 2)))) {
                            dst[j * GAMESCREEN_W + i] = color >> 4
                        }
                        if (bits & (1 << (15 - (bit * 2 + 1)))) {
                            dst[j * GAMESCREEN_W + i + 1] = color & 15
                        }
                    }
                    ++pIndex
                }
            }
        }
    }

    static decodeSgd(dst: Uint8Array, src: Uint8Array, data: Uint8Array) {
        let num = -1
        let index = 0
        const buf = new Uint8Array(GAMESCREEN_W * 32)
        let count = READ_BE_UINT16(src) - 1
        index += 2
        do {
            let d2 = READ_BE_UINT16(src, index)
            index += 2
            const d0 = READ_BE_UINT16(src, index) << 16 >> 16
            index += 2
            const d1 = READ_BE_UINT16(src, index) << 16 >> 16
            index += 2

            if (d2 != UINT16_MAX) {
                d2 &= ~(1 << 15)
                const offset = READ_BE_UINT32(data, d2 * 4) << 32 >> 32
                if (offset < 0) {
                    const ptr = new Uint8Array(data.buffer, data.byteOffset - offset)
                    let ptrIndex = 0
                    const size = READ_BE_UINT16(ptr, ptrIndex) //  << 16 >> 16
                    ptrIndex += 2
                    if (num !== d2) {
                        num = d2
                        buf.set(ptr.subarray(ptrIndex, size + ptrIndex))
                    }
                } else {
                    if (num !== d2) {
                        num = d2
                        const size = READ_BE_UINT16(data,  offset) & 0x7FFF
                        Video.AMIGA_decodeRle(buf, data.subarray(offset))
                    }
                }
            }
            const w = (buf[0] + 1) >> 1
            const h = buf[1] + 1
            const planarSize = READ_BE_UINT16(buf, 2)

            Video.PC_drawTileMask(dst, d0, d1, w, h, buf.subarray(4), buf.subarray(4 + planarSize), planarSize)

        } while (--count >= 0)
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
    static PC_drawTile(dst: Uint8Array, src: Uint8Array, mask: number, xflip: boolean, yflip: boolean, colorKey: number) {
        let pitch = GAMESCREEN_W
        let dstIndex = 0
        let srcIndex = 0
        if (yflip) {
            dstIndex += 7 * pitch
            pitch = -pitch
        }
        let inc = 1
        if (xflip) {
            dstIndex += 7
            inc = -inc
        }
        for (let y = 0; y < 8; ++y) {
            for (let i = 0; i < 8; i += 2) {
                let color = src[srcIndex] >> 4
                if (color !== colorKey) {
                    dst[dstIndex + inc * i] = mask | color
                }
                color = src[srcIndex] & 15
                if (color !== colorKey) {
                    dst[dstIndex + inc * (i + 1)] = mask | color
                }
                ++srcIndex
            }
            dstIndex += pitch
        }
    }

    static decodeLevHelper(dst: Uint8Array, src: Uint8Array, sgd_offset: number, offset12: number, tile_data_buffer: Uint8Array, sgdBuf: boolean, isPC: boolean) {
        if (sgd_offset !== 0) {
            // Initialize the source offset
            let a0 = sgd_offset
            for (let y = 0; y < GAMESCREEN_H; y += 8) {
                for (let x = 0; x < GAMESCREEN_W; x += 8) {
                    const d3 = isPC ? READ_LE_UINT16(src, a0) : READ_BE_UINT16(src, a0)
                    a0 += 2
                    // Extract the tile index (lower 11 bits)
                    const d0 = d3 & 0x7FF
                    // Process non-zero tile indices
                    if (d0 !== 0) {
                        // Get the tile data from a5 buffer
                        const tiledata = tile_data_buffer.subarray(d0 * 32)
                        // Check for vertical and horizontal flipping
                        const yflip = (d3 & (1 << 12)) !== 0
                        const xflip = (d3 & (1 << 11)) !== 0

                        // Set mask if bit 15 is set
                        let mask = 0;
                        if ((d3 & 0x8000) !== 0) {
                            mask = 0x80 + ((d3 >> 6) & 0x10)
                        }
                        // y=0, x=0
                        // y=0, x=8
                        // y=0, x=16
                        // ...
                        // y=8, x=0
                        // pass the dst part where this 8*8 piece needs to go
                        Video.PC_drawTile(dst.subarray(y * GAMESCREEN_W + x), tiledata, mask, xflip, yflip, -1)
                    }
                }
            }
        }
        if (offset12 !== 0) {
            // Initialize the source offset
            let a0 = offset12
            for (let y = 0; y < GAMESCREEN_H; y += 8) {
                for (let x = 0; x < GAMESCREEN_W; x += 8) {
                    const d3 = isPC ? READ_LE_UINT16(src, a0) : READ_BE_UINT16(src, a0)
                    a0 += 2
                    // Extract the tile index (lower 11 bits)
                    let d0 = d3 & 0x7FF

                    // Adjust tile index if sgdBuf is true
                    if (d0 !== 0 && sgdBuf) {
                        d0 -= 896
                    }
                    if (d0 !== 0) {
                        // Get the tile data from a5 buffer
                        const a2 = tile_data_buffer.subarray(d0 * 32)
                        // Check for vertical and horizontal flipping
                        const yflip = (d3 & (1 << 12)) !== 0
                        const xflip = (d3 & (1 << 11)) !== 0

                        // Determine the mask for color/palette manipulation
                        let mask = 0
                        if ((d3 & 0x6000) !== 0 && sgdBuf) {
                            mask = 0x10
                        } else if ((d3 & 0x8000) !== 0) {
                            mask = 0x80 + ((d3 >> 6) & 0x10)
                        }
                        Video.PC_drawTile(dst.subarray(y * GAMESCREEN_W + x), a2, mask, xflip, yflip, 0)
                    }
                }
            }
        }
    }

    fillRect(x: number, y: number, w: number, h: number, color: number) {
        const p = this._frontLayer
        let index = y * this._w + x;
        for (let j = 0; j < h; ++j) {
            p.fill(color, index, index + w)
            index += this._w
        }
    }

    drawString(str: string, x: number, y: number, col: number): string {
        const fnt =  this._res._fnt
        let len = 0
        let index = 0

        while (1) {
            const c = str.charCodeAt(index++)
            if (c === 0 || c === 0xB || c === 0xA || isNaN(c)) {
                break
            }
            this._drawChar(this._frontLayer, this._w, x + len * CHAR_W, y, fnt, col, c)
            ++len
        }
        this.markBlockAsDirty(x, y, len * CHAR_W, CHAR_H, 1)

        return str
    }

    async PC_decodeMap(level: number, room: number) {
        await this.readRoomPaletteOffsets(level, room)

        if (!(await this.AMIGA_tryLoadFrontLayerFromFile(level, room))) {
            console.warn(`PC_decodeMap level=${level} room=${room}: missing front layer pixeldata file, filling with zeros`)
            this._frontLayer.fill(0)
        }
        this._backLayer.set(this._frontLayer.subarray(0, this._layerSize))
        this.PC_setLevelPalettes(level)
        writeLayerImages(level, room, this._frontLayer, this._w, this._h, this._stub._rgbPalette)
        writeLayerPixelData(level, room, this._frontLayer)
    }

    private async tryLoadRoomPaletteOffsetsFromJson(level: number, room: number): Promise<boolean> {
        const cached = this._paletteHeaderOffsetsCache[level]
        if (cached === null) {
            return false
        }
        if (cached) {
            this._map_palette_offset_slot1 = cached[0]
            this._map_palette_offset_slot2 = cached[1]
            this._map_palette_offset_slot3 = cached[2]
            this._map_palette_offset_slot4 = cached[3]
            console.log(`Palette offsets source: json-cache level=${level} room=${room} slots=[${cached[0]},${cached[1]},${cached[2]},${cached[3]}]`)
            return true
        }
        const levelData = _gameLevels[level]
        if (!levelData) {
            this._paletteHeaderOffsetsCache[level] = null
            return false
        }
        const candidates = [
            `levels/${levelData.name2}/${levelData.name}.paletteheader.json`,
            `levels/${levelData.name2}/${levelData.name}-room${room}.paletteheader.json`,
            `${levelData.name}.paletteheader.json`,
            `${levelData.name}-room${room}.paletteheader.json`
        ]
        for (const filename of candidates) {
            const file = new File()
            try {
                const opened = await file.open(filename, "rb", this._res._fs)
                if (!opened) {
                    continue
                }
                const size = file.size()
                if (size <= 0) {
                    file.close()
                    continue
                }
                const raw = new Uint8Array(size)
                file.read(raw.buffer, size)
                if (file.ioErr()) {
                    file.close()
                    continue
                }
                file.close()
                const text = new TextDecoder("utf-8").decode(raw)
                const parsed: unknown = JSON.parse(text)
                const slots = (parsed as {
                    slots?: {
                        slot1?: { dec?: number, colors?: unknown[] } | number
                        slot2?: { dec?: number, colors?: unknown[] } | number
                        slot3?: { dec?: number, colors?: unknown[] } | number
                        slot4?: { dec?: number, colors?: unknown[] } | number
                    }
                }).slots
                const slot1Value = (typeof slots?.slot1 === "number") ? slots.slot1 : slots?.slot1?.dec
                const slot2Value = (typeof slots?.slot2 === "number") ? slots.slot2 : slots?.slot2?.dec
                const slot3Value = (typeof slots?.slot3 === "number") ? slots.slot3 : slots?.slot3?.dec
                const slot4Value = (typeof slots?.slot4 === "number") ? slots.slot4 : slots?.slot4?.dec
                const parseSlotColors = (value: { colors?: unknown[] } | number | undefined): Color[] | null => {
                    if (typeof value === "number" || !Array.isArray(value?.colors)) {
                        return null
                    }
                    const colors = value.colors
                    const out: Color[] = []
                    for (let i = 0; i < colors.length && i < 16; ++i) {
                        const item = colors[i] as { rgb?: { r?: number, g?: number, b?: number }, r?: number, g?: number, b?: number }
                        const r = (typeof item?.rgb?.r === "number") ? item.rgb.r : item?.r
                        const g = (typeof item?.rgb?.g === "number") ? item.rgb.g : item?.g
                        const b = (typeof item?.rgb?.b === "number") ? item.rgb.b : item?.b
                        if (!Number.isInteger(r) || !Number.isInteger(g) || !Number.isInteger(b)) {
                            return null
                        }
                        out.push({ r, g, b })
                    }
                    return out.length === 16 ? out : null
                }
                const slot1Colors = parseSlotColors(slots?.slot1)
                const slot2Colors = parseSlotColors(slots?.slot2)
                const slot3Colors = parseSlotColors(slots?.slot3)
                const slot4Colors = parseSlotColors(slots?.slot4)
                if (
                    Number.isInteger(slot1Value) && slot1Value >= 0 &&
                    Number.isInteger(slot2Value) && slot2Value >= 0 &&
                    Number.isInteger(slot3Value) && slot3Value >= 0 &&
                    Number.isInteger(slot4Value) && slot4Value >= 0
                ) {
                    this._map_palette_offset_slot1 = slot1Value
                    this._map_palette_offset_slot2 = slot2Value
                    this._map_palette_offset_slot3 = slot3Value
                    this._map_palette_offset_slot4 = slot4Value
                    this._paletteHeaderOffsetsCache[level] = [slot1Value, slot2Value, slot3Value, slot4Value]
                    this._paletteHeaderColorsCache[level] = (slot1Colors && slot2Colors && slot3Colors && slot4Colors) ? {
                        slot1: slot1Colors,
                        slot2: slot2Colors,
                        slot3: slot3Colors,
                        slot4: slot4Colors
                    } : null
                    console.log(
                        `Palette offsets source: json-file '${filename}' level=${level} room=${room} slots=[${slot1Value},${slot2Value},${slot3Value},${slot4Value}] colors=${this._paletteHeaderColorsCache[level] ? "embedded" : "offsets-only"}`
                    )
                    return true
                }
            } catch (_error) {
                file.close()
            }
        }
        this._paletteHeaderOffsetsCache[level] = null
        this._paletteHeaderColorsCache[level] = null
        return false
    }

    private async readRoomPaletteOffsets(level: number, room: number) {
        if (await this.tryLoadRoomPaletteOffsetsFromJson(level, room)) {
            return
        }
        console.warn(`Palette offsets source: none level=${level} room=${room} (JSON required; _lev fallback disabled)`)
    }

    private async AMIGA_tryLoadFrontLayerFromFile(level: number, room: number): Promise<boolean> {
        const levelData = _gameLevels[level]
        const names = levelData ? [
            `levels/${levelData.name2}/${levelData.name}-room${room}.pixeldata.bin`,
            `${levelData.name}-room${room}.pixeldata.bin`
        ] : []
        names.push(`level${level + 1}-room${room}.pixeldata.bin`)
        names.push(`level${level}-room${room}.pixeldata.bin`)

        for (const filename of names) {
            const file = new File()
            try {
                const opened = await file.open(filename, "rb", this._res._fs)
                if (!opened) {
                    continue
                }
                const size = file.size()
                if (size !== this._frontLayer.length) {
                    console.warn(`Invalid front layer size for '${filename}': got ${size}, expected ${this._frontLayer.length}`)
                    file.close()
                    continue
                }
                file.read(this._frontLayer.buffer, this._frontLayer.length)
                if (file.ioErr()) {
                    file.close()
                    continue
                }
                file.close()
                return true
            } catch (error) {
                console.warn(`Could not load front layer file '${filename}'`, error)
            }
        }
        return false
    }

    private setPaletteColors(paletteSlot: number, colors: Color[]) {
        for (let i = 0; i < 16; ++i) {
            this._stub.setPaletteEntry(paletteSlot * 16 + i, colors[i])
        }
    }

    private getJsonPaletteColorsForOffset(level: number, palOffset: number): Color[] | null {
        const colors = this._paletteHeaderColorsCache[level]
        const offsets = this._paletteHeaderOffsetsCache[level]
        if (!colors || !offsets) {
            return null
        }
        if (palOffset === offsets[0]) {
            return colors.slot1
        }
        if (palOffset === offsets[1]) {
            return colors.slot2
        }
        if (palOffset === offsets[2]) {
            return colors.slot3
        }
        if (palOffset === offsets[3]) {
            return colors.slot4
        }
        return null
    }

    PC_setLevelPalettes(level: number) {
        if (this._unkPalSlot2 === 0) {
            this._unkPalSlot2 = this._map_palette_offset_slot3
        }
        if (this._unkPalSlot1 === 0) {
            this._unkPalSlot1 = this._map_palette_offset_slot3
        }
        const jsonColors = this._paletteHeaderColorsCache[level]
        if (jsonColors) {
            console.log(`Palette colors source: json-embedded level=${level}`)
            // background
            this.setPaletteColors(0x0, jsonColors.slot1)
            // objects
            this.setPaletteColors(0x1, jsonColors.slot2)
            this.setPaletteColors(0x2, jsonColors.slot3)
            this.setPaletteColors(0x3, jsonColors.slot4)
            // conrad
            if (this._unkPalSlot1 === this._map_palette_offset_slot3) {
                this.setPaletteSlotLE(4, Video._conrad_palette1)
            } else {
                this.setPaletteSlotLE(4, Video._conrad_palette2)
            }
            // slot 5 is monster palette
            // foreground
            this.setPaletteColors(0x8, jsonColors.slot1)
            this.setPaletteColors(0x9, level === 0 ? jsonColors.slot1 : jsonColors.slot2)
            // inventory
            const inventoryColors = this.getJsonPaletteColorsForOffset(level, this._unkPalSlot2) || jsonColors.slot3
            this.setPaletteColors(0xA, inventoryColors)
            this.setPaletteColors(0xB, jsonColors.slot4)
            this.setTextPalette()
            return
        }
        console.warn(`Palette colors source: none level=${level} (JSON palette colors/offsets required; _pal fallback disabled)`)
    }

    PC_drawStringChar(dst: Uint8Array, pitch: number, x: number, y: number, src: Uint8Array, color: number, chr: number) {
        let dst_offset = y * pitch + x
        if (chr < 32) {
            throw (`Assertion failed: ${chr} < 32`)
        }
        let src_offset = (chr - 32) * 8 * 4
        for (let y = 0; y < 8; ++y) {
            for (let x = 0; x < 4; ++x) {
                const c1 = src[src_offset + x] >>> 4
                if (c1 !== 0) {
                    dst[dst_offset] = (c1 === 15) ? color : (0xE0 + c1)
                }
                dst_offset++
                const c2 = src[src_offset + x] & 15
                if (c2 !== 0) {
                    dst[dst_offset] = (c2 === 15) ? color: (0xE0 + c2)
                }
                dst_offset++
            }
            src_offset += 4
            dst_offset += pitch - CHAR_W
        }
    }

    fullRefresh() {
        this._fullRefresh = true
        this._screenBlocks.fill(0, (this._w / SCREENBLOCK_W) * (this._h / SCREENBLOCK_H))
    }

    async fadeOut() {
        this._stub.fadeScreen()
    }

    setPaletteSlotLE(palSlot: number, palData: Uint8Array) {
        for (let i = 0; i < 16; ++i) {
            const color = READ_LE_UINT16(palData, i * 2)
            const c: Color = Video.AMIGA_convertColor(color)
            this._stub.setPaletteEntry(palSlot * 16 + i, c)
        }

        if (palSlot === 4 && global_game_options.use_white_tshirt) {
            const color12: Color = Video.AMIGA_convertColor(0x888)
            const color13: Color = Video.AMIGA_convertColor((palData === Video._conrad_palette2) ? 0x888 : 0xCCC)
            this._stub.setPaletteEntry(palSlot * 16 + 12, color12)
            this._stub.setPaletteEntry(palSlot * 16 + 13, color13)
        }
    }

    setPaletteSlotBE(palette_color_slot: number, pal_offset: number) {
        let p = pal_offset * 32
        const pal = this._res._pal
        for (let i = 0; i < 16; ++i) {
            const color = READ_BE_UINT16(pal, p)
            p += 2
            const c: Color = Video.AMIGA_convertColor(color, true)
            this._stub.setPaletteEntry(palette_color_slot * 16 + i, c)
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

    PC_decodeIcn(src:Uint8Array, num: number, dst: Uint8Array) {
        const offset = READ_LE_UINT16(src, num * 2)
        const p = src.subarray(offset + 2)
        let index = 0
        for (let i = 0; i < 16 * 16 / 2; ++i) {
            dst[index++] = p[i] >> 4
            dst[index++] = p[i] & 15
        }
    }
    
    PC_decodeSpc(src: Uint8Array, w: number, h: number, dst: Uint8Array) {
        const size = w * h / 2
        let index = 0
        for (let i = 0; i < size; ++i) {
            dst[index++] = src[i] >> 4
            dst[index++] = src[i] & 15
        }
    }
    
    PC_decodeSpm(dataPtr: Uint8Array, dst: Uint8Array) {
        const len = 2 * READ_BE_UINT16(dataPtr)
        dataPtr = dataPtr.subarray(2)
        let index = 0
        const dst2 = dst.subarray(1024)
        for (let i = 0; i < len; ++i) {
            dst2[index++] = dataPtr[i] >> 4
            dst2[index++] = dataPtr[i] & 15
        }
        const src = dst.subarray(1024)
        let dstIndex = 0
        let srcIndex = 0
        do {
            const code = src[srcIndex++]
            if (code === 0xF) {
                let color = src[srcIndex++]
                let count = src[srcIndex++]
                if (color === 0xF) {
                    count = (count << 4) | src[srcIndex++]
                    color = src[srcIndex++]
                }
                count += 4
                dst.fill(color, dstIndex, dstIndex + count)
                dstIndex += count
            } else {
                dst[dstIndex++] = code
            }
        } while (srcIndex < len)
    }

    drawSpriteSub1(src: Uint8Array, dst: Uint8Array, pitch: number, h: number, w: number, colMask: number) {
        let srcIndex = 0
        let dstIndex = 0
        while (h--) {
            for (let i = 0; i < w; ++i) {
                if (src[srcIndex + i] !== 0) {
                    dst[dstIndex + i] = src[srcIndex + i] | colMask
                }
            }
            srcIndex += pitch
            dstIndex += GAMESCREEN_W
        }
    }
    
    drawSpriteSub2(src: Uint8Array, dst: Uint8Array, pitch: number, h: number, w: number, colMask: number) {
        let srcIndex = src.byteOffset
        src = new Uint8Array(src.buffer)
        let dstIndex = 0
        while (h--) {
            for (let i = 0; i < w; ++i) {
                if (src[-i + srcIndex] !== 0) {
                    dst[dstIndex + i] = src[-i + srcIndex] | colMask
                }
            }
            srcIndex += pitch
            dstIndex += GAMESCREEN_W
        }
    }
    
    drawSpriteSub3(src: Uint8Array, dst: Uint8Array, pitch: number, h: number, w: number, colMask: number) {
        let srcIndex = 0
        let dstIndex = 0
        while (h--) {
            for (let i = 0; i < w; ++i) {
                if (src[srcIndex + i] != 0 && !(dst[dstIndex + i] & 0x80)) {
                    dst[dstIndex + i] = src[srcIndex + i] | colMask
                }
            }
            srcIndex += pitch
            dstIndex += GAMESCREEN_W
        }
    }
    
    drawSpriteSub4(src: Uint8Array, dst: Uint8Array, pitch: number, h: number, w: number, colMask: number) {
        let srcIndex = src.byteOffset
        let dstIndex = 0
        src = new Uint8Array(src.buffer)
        while (h--) {
            for (let i = 0; i < w; ++i) {
                if (src[-i + srcIndex] != 0 && !(dst[i + dstIndex] & 0x80)) {
                    dst[i + dstIndex] = src[-i + srcIndex] | colMask
                }
            }
            srcIndex += pitch
            dstIndex += GAMESCREEN_W
        }
    }
    
    drawSpriteSub5(src: Uint8Array, dst: Uint8Array, pitch: number, h: number, w: number, colMask: number) {
        let srcIndex = 0
        let dstIndex = 0
        while (h--) {
            for (let i = 0; i < w; ++i) {
                if (src[i * pitch + srcIndex] != 0 && !(dst[i + dstIndex] & 0x80)) {
                    dst[i + dstIndex] = src[i * pitch + srcIndex] | colMask
                }
            }
            ++srcIndex
            dstIndex += GAMESCREEN_W
        }
    }
    
    drawSpriteSub6(src: Uint8Array, dst: Uint8Array, pitch: number, h: number, w: number, colMask: number) {
        let srcIndex = src.byteOffset
        let dstIndex = 0
        src = new Uint8Array(src.buffer)
        while (h--) {
            for (let i = 0; i < w; ++i) {
                if (src[-i * pitch + srcIndex] != 0 && !(dst[i + dstIndex] & 0x80)) {
                    dst[i + dstIndex] = src[-i * pitch + srcIndex] | colMask;
                }
            }
            ++srcIndex
            dstIndex += GAMESCREEN_W
        }
    }

    markBlockAsDirty(x: number, y: number, w: number, h: number, scale: number) {
        let bx1 = (scale * x / SCREENBLOCK_W) >> 0
        let by1 = (scale * y / SCREENBLOCK_H) >> 0
        let bx2 = (scale * (x + w - 1) / SCREENBLOCK_W) >> 0
        let by2 = (scale * (y + h - 1) / SCREENBLOCK_H) >> 0
        if (bx1 < 0) {
            bx1 = 0
        }
        if (bx2 > ((this._w / SCREENBLOCK_W) >> 0) - 1) {
            bx2 = (((this._w / SCREENBLOCK_W) >> 0) - 1)
        }
        if (by1 < 0) {
            by1 = 0
        }
        if (by2 > ((this._h / SCREENBLOCK_H) >> 0) - 1) {
            by2 = (((this._h / SCREENBLOCK_H) >> 0) - 1) >> 0
        }
        for (; by1 <= by2; ++by1) {
            for (let i = bx1; i <= bx2; ++i) {
                this._screenBlocks[by1 * ((this._w / SCREENBLOCK_W) >> 0) + i] = 2
            }
        }
    }

    async updateScreen() {
        if (this._fullRefresh) {
            this._stub.copyRect(0, 0, this._w, this._h, this._frontLayer, this._w)
            await this._stub.updateScreen(this._shakeOffset)
            this._fullRefresh = false
        } else {
            let i, j: number
            let count = 0
            const p = this._screenBlocks
            let index = 0
            for (j = 0; j < this._h / SCREENBLOCK_H; ++j) {
                let nh = 0
                for (i = 0; i < this._w / SCREENBLOCK_W; ++i) {
                    if (p[i + index] !== 0) {
                        --p[i + index]
                        ++nh
                    } else if (nh !== 0) {
                        let x = (i - nh) * SCREENBLOCK_W
                        this._stub.copyRect(x, j * SCREENBLOCK_H, nh * SCREENBLOCK_W, SCREENBLOCK_H, this._frontLayer, this._w)
                        nh = 0
                        ++count
                    }
                }
                if (nh !== 0) {
                    let x = (i - nh) * SCREENBLOCK_W
                    this._stub.copyRect(x, j * SCREENBLOCK_H, nh * SCREENBLOCK_W, SCREENBLOCK_H, this._frontLayer, this._w)
                    ++count
                }
                index += this._w / SCREENBLOCK_W
            }
            if (count !== 0) {
                await this._stub.updateScreen(this._shakeOffset)
            }
        }
        if (this._shakeOffset !== 0) {
            this._shakeOffset = 0
            this._fullRefresh = true
        }
    }
}

export { Video, GAMESCREEN_W, GAMESCREEN_H }
