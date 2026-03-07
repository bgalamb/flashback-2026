import { global_game_options } from "./configs/global_game_options"
import { Color, READ_BE_UINT16, READ_BE_UINT32, READ_LE_UINT16, READ_LE_UINT32 } from "./intern"
import { WidescreenMode } from "./enums/common_enums";
import { Resource } from "./resource"
import { _conradPal1, _conradPal2, _palSlot0xF, _textPal } from "./staticres"
import { SystemStub } from "./systemstub_web"
import { bytekiller_unpack } from "./unpack"
import { SCREENBLOCK_W, SCREENBLOCK_H, GAMESCREEN_W, GAMESCREEN_H, CHAR_H, CHAR_W, UINT16_MAX, UINT8_MAX } from './game_constants'
import { writeUnpackedLevelData } from "./debugger-helpers/level-data-dump"
import { writeFrontLayerImage } from "./debugger-helpers/front-layer-image"
import { assert } from "./assert"

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

    static buildTileDataBuffer(leveldata_scratch: Uint8Array, getBankData: (bankDataId: number) => Uint8Array): Uint8Array {
        const tiledata_buffer = new Uint8Array(Video._tempMbkSize * 32)
        tiledata_buffer.fill(0, 0, 32)

        let offset_sz = 32
        let bank_datachunk_offset = READ_BE_UINT16(leveldata_scratch, 14)
        for (let loop = true; loop;) {
            let bank_data_id = READ_BE_UINT16(leveldata_scratch, bank_datachunk_offset)
            bank_datachunk_offset += 2
            if (bank_data_id & 0x8000) {
                bank_data_id &= ~0x8000
                loop = false
            }

            const current_bank_data = getBankData(bank_data_id)
            const chunk_number = leveldata_scratch[bank_datachunk_offset++]
            if (chunk_number === UINT8_MAX) {
                assert(!(offset_sz + current_bank_data.length > Video._tempMbkSize * 32), `Assertion failed: ${offset_sz + current_bank_data.length} <= ${Video._tempMbkSize * 32}`)
                tiledata_buffer.set(current_bank_data, offset_sz)
                offset_sz += current_bank_data.length
            } else {
                for (let i = 0; i < chunk_number + 1; ++i) {
                    const chunk_size = leveldata_scratch[bank_datachunk_offset++]
                    assert(!(offset_sz + 32 > Video._tempMbkSize * 32), `Assertion failed: ${offset_sz + 32} <= ${Video._tempMbkSize * 32}`)
                    tiledata_buffer.set(current_bank_data.subarray(chunk_size * 32, chunk_size * 32 + 32), offset_sz)
                    offset_sz += 32
                }
            }
        }
        return tiledata_buffer
    }

    static decodeRoomGraphics(dst: Uint8Array, leveldata_scratch: Uint8Array, sgdData: Uint8Array, getBankData: (bankDataId: number) => Uint8Array) {
        let sgd_offset = READ_BE_UINT16(leveldata_scratch, 10)
        const offset12 = READ_BE_UINT16(leveldata_scratch, 12)
        const tiledata_buffer = Video.buildTileDataBuffer(leveldata_scratch, getBankData)

        dst.fill(0)
        if (leveldata_scratch[1] !== 0) {
            assert(!!sgdData, `Assertion failed: ${sgdData}`)
            Video.decodeSgd(dst, new Uint8Array(leveldata_scratch.buffer, leveldata_scratch.byteOffset + sgd_offset), sgdData)
            sgd_offset = 0
        }

        Video.decodeLevHelper(dst, leveldata_scratch, sgd_offset, offset12, tiledata_buffer, leveldata_scratch[1] !== 0, true)

        return {
            mapPaletteOffsetSlot1: READ_BE_UINT16(leveldata_scratch, 2),
            mapPaletteOffsetSlot2: READ_BE_UINT16(leveldata_scratch, 4),
            mapPaletteOffsetSlot3: READ_BE_UINT16(leveldata_scratch, 6),
            mapPaletteOffsetSlot4: READ_BE_UINT16(leveldata_scratch, 8)
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

    PC_decodeLev(level: number, room: number) {
        const tmp = this._res._mbk
        // TODO why do we heed this?
        this._res._mbk = this._res._bnq
        this._res.clearBankData()

        this.AMIGA_decodeLev(level, room)

        this._res._mbk = tmp
        this._res.clearBankData()
    }

    PC_decodeMap(level: number, room: number) {
        assert(this._res._lev, `Assertion failed: ${this._res._lev}`)
            this.PC_decodeLev(level, room)
            return

    }

    PC_setLevelPalettes() {
        if (this._unkPalSlot2 === 0) {
            this._unkPalSlot2 = this._map_palette_offset_slot3
        }
        if (this._unkPalSlot1 === 0) {
            this._unkPalSlot1 = this._map_palette_offset_slot3
        }
        // background
        this.setPaletteSlotBE(0x0, this._map_palette_offset_slot1)
        // objects
        this.setPaletteSlotBE(0x1, this._map_palette_offset_slot2)
        this.setPaletteSlotBE(0x2, this._map_palette_offset_slot3)
        this.setPaletteSlotBE(0x3, this._map_palette_offset_slot4)
        // conrad
        if (this._unkPalSlot1 === this._map_palette_offset_slot3) {
            this.setPaletteSlotLE(4, Video._conrad_palette1)
        } else {
            this.setPaletteSlotLE(4, Video._conrad_palette2)
        }
        // slot 5 is monster palette
        // foreground
        this.setPaletteSlotBE(0x8, this._map_palette_offset_slot1)
        this.setPaletteSlotBE(0x9, this._map_palette_offset_slot2)
        // inventory
        this.setPaletteSlotBE(0xA, this._unkPalSlot2)
        this.setPaletteSlotBE(0xB, this._map_palette_offset_slot4)
        // slots 0xC and 0xD are cutscene palettes
        this.setTextPalette()
    }

    // _lev is a packed file. The first byte indicate where the compressed data starts.
    // Address     Size                                Name/Purpose
    // +---------+----------------------------------+-----------------------------------------------------------+
    // | 0x00    | 4bytes (16-bit BE value)         | offset to start reading room 0 data from unpacked buffer  |
    // +---------+----------------------------------+-----------------------------------------------------------+
    // | 0x04    | 4bytes (16-bit BE value)         | offset to start reading room 1 data from unpacked buffer  |
    // +---------+----------------------------------+-----------------------------------------------------------+
    // | 0x08    | 4bytes (16-bit BE value)         | offset to start reading room 2 data from unpacked buffer  |
    // +---------+----------------------------------+-----------------------------------------------------------+
    // | 0x0B    | 4bytes (16-bit BE value)         | offset to start reading room 3 data from unpacked buffer  |
    // +---------+----------------------------------+-----------------------------------------------------------+
    // | 0x10    | 4bytes (16-bit BE value)         | offset to start reading room 4 data from unpacked buffer  |
    // +---------+----------------------------------+-----------------------------------------------------------+

    // The unzipped data is a sequence of blocks. Each block has the following format:
    // Address    Size    Name/Purpose
    // +---------+-------+------------------------------------------+
    // | 0x00    | 10    | unknown data                             |
    // +---------+-------+------------------------------------------+
    // | 0x0A    | 2     | offset10 (16-bit BE value)              |
    // +---------+-------+------------------------------------------+
    // | 0x0C    | 2     | offset12 (16-bit BE value)              |
    // +---------+-------+------------------------------------------+
    // | 0x0E    | 2     | read_start_offset (16-bit BE value), where the real data starts within this file   |
    // +---------+-------+------------------------------------------+

    // Repeat: VAR=read_start_offset. Note this is reading from bank and not from this file.
    // +---------+-------+------------------------------------------+
    // | VAR     | 2     | d0_data (16-bit BE value)               |
    // |         |       | - Bit 15 (0x8000): End marker if set    |
    // |         |       | - Other bits: Bank data index           |
    // +---------+-------+------------------------------------------+
    // bank_data_size and bank_data are retrieved from a bank data buffer(other than this)
    // +---------+-------+------------------------------------------+
    // | VAR+2   | 1     | d3 (control byte)                       |
    // |         |       | - If 255: Read entire bank              |
    // |         |       | - If not 255: save d3 and Read next byte |
    // +---------+-------+------------------------------------------+
    // | VAR+2+1 | 1     | d4 multiplier for the read               |
    // |         |       |  - d4 * 32bytes * (d3 + 1)               |
    // +---------+-------+------------------------------------------+

    // Buf structure, where the above data gets read looks like this:
    // Address    Size    Name/Purpose
    // +---------+-------+------------------------------------------+
    // | 0x00    | 32    | empty bits                               |
    // +---------+-------+------------------------------------------+
    // | 0x20    | bank_data_size | all bank_data content           |
    // +---------+-------+------------------------------------------+
    // OR
    // +---------+-------+------------------------------------------+
    // | 0x20    | d4 * d3 * 32 | some bank_data content            |
    // +---------+-------+------------------------------------------+
    // REPEAT THE ABOVE BLOCKS UNTIL END OF FILE
    AMIGA_decodeLev(level: number, room: number) {
        const leveldata_scratch = this._res._scratchBuffer
        //the first bytes represent the offsets in _lev file offset by room number
        const offset = READ_BE_UINT32(this._res._lev, room * 4)
        if (!bytekiller_unpack(leveldata_scratch, leveldata_scratch.length, this._res._lev, offset)) {
            console.warn(`Bad CRC for level ${level} room ${room}`)
            return
        }
        writeUnpackedLevelData(level, room, leveldata_scratch)

        // set palette slots
        this._map_palette_offset_slot1 = READ_BE_UINT16(leveldata_scratch, 2)
        this._map_palette_offset_slot2 = READ_BE_UINT16(leveldata_scratch, 4)
        this._map_palette_offset_slot3 = READ_BE_UINT16(leveldata_scratch, 6)
        this._map_palette_offset_slot4 = READ_BE_UINT16(leveldata_scratch, 8)

        // data pointers
        let sgd_offset = READ_BE_UINT16(leveldata_scratch, 10)
        const offset12 = READ_BE_UINT16(leveldata_scratch, 12)
        let bank_datachunk_offset = READ_BE_UINT16(leveldata_scratch, 14)

        //create a new buffer
        const kTempMbkSize = 1024
        const tiledata_buffer = new Uint8Array(kTempMbkSize * 32)

        //empty the firs 32 bytes
        let offset_sz = 0
        for (let i = 0; i < 32; ++i) {
            tiledata_buffer[i] = 0
        }

        //this is a counter, which sums how much we read from bank data to tiledata_buffer altogether
        offset_sz += 32

        // endless loop ends only when the end criteria is found
        for (let loop = true; loop;) {

            //this reads from scratchbuffer
            let bank_data_id = READ_BE_UINT16(leveldata_scratch, bank_datachunk_offset)
            bank_datachunk_offset += 2
            if (bank_data_id & 0x8000) {
                bank_data_id &= ~0x8000
                loop = false
            }

            //these read from bank data
            const d1 = this._res.getBankDataSize(bank_data_id)
            let current_bank_data = this._res.findBankData(bank_data_id)
            if (!current_bank_data) {
                current_bank_data = this._res.loadBankData(bank_data_id)
            }
            const chunk_number = leveldata_scratch[bank_datachunk_offset++]
            //read a next value that would indicate how much data to load
            // 255 means all, other number means N * (a newly read size) * 32 bytes

            if (chunk_number === UINT8_MAX) {
                assert(!(offset_sz + d1 > kTempMbkSize * 32), `Assertion failed: ${offset_sz + d1} <= ${kTempMbkSize * 32}`)
                tiledata_buffer.set(current_bank_data.subarray(0, d1), offset_sz)
                offset_sz += d1
            } else {
                for (let i = 0; i < chunk_number + 1; ++i) {
                    const chunk_size = leveldata_scratch[bank_datachunk_offset++]
                    assert(!(offset_sz + 32 > kTempMbkSize * 32), `Assertion failed: ${offset_sz + 32} <= ${kTempMbkSize * 32}`)
                    tiledata_buffer.set(current_bank_data.subarray(chunk_size * 32, (chunk_size * 32) + 32), offset_sz)
                    offset_sz += 32
                }
            }
        }

        this._frontLayer.fill(0)
        if (leveldata_scratch[1] !== 0) {
            assert(!(!this._res._sgd), `Assertion failed: ${this._res._sgd}`)
            Video.decodeSgd(this._frontLayer, new Uint8Array(leveldata_scratch.buffer, leveldata_scratch.byteOffset + sgd_offset), this._res._sgd)
            sgd_offset = 0
        }

        Video.decodeLevHelper(
            this._frontLayer, //dst
            leveldata_scratch, //src
            sgd_offset,
            offset12,
            tiledata_buffer, //buffer with tile data
            leveldata_scratch[1] !== 0, //sgd buffer
            true) //always true

        //move front to back layer
        this._backLayer.set(this._frontLayer.subarray(0, this._layerSize))

        //set palettes for the drawing
        this.PC_setLevelPalettes()


        if (level === 0) { // tiles with color slot 0x9
            this.setPaletteSlotBE(0x9, this._map_palette_offset_slot1)
        }
        writeFrontLayerImage(level, room, this._frontLayer, this._w, this._h, this._stub._rgbPalette)
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
        if (global_game_options.fade_out_palette) {
            await this.fadeOutPalette()
        } else {
            this._stub.fadeScreen()
        }
    }

    async fadeOutPalette() {
        for (let step = 16; step >= 0; --step) {
            for (let c = 0; c < GAMESCREEN_W; ++c) {
                const col:Color = {
                    r: 0,
                    g: 0,
                    b: 0,
                }
                this._stub.getPaletteEntry(c, col)
                col.r = col.r * step >> 4
                col.g = col.g * step >> 4
                col.b = col.b * step >> 4
                this._stub.setPaletteEntry(c, col)
            }
            this.fullRefresh()
            await this.updateScreen()
            await this._stub.sleep(50)
        }

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
            const c: Color = this.AMIGA_convertColor(color, true)
            this._stub.setPaletteEntry(palette_color_slot * 16 + i, c)
        }
    }

    AMIGA_convertColor(color: number, bgr: boolean) { // 4 bits to 8 bits
        let r = (color & 0xF00) >> 8;
        let g = (color & 0xF0)  >> 4
        let b =  color & 0xF
        if (bgr) {
            const tmp = r
            r = b
            b = tmp
        }
        const c: Color = {
            r: (r << 4) | r,
            g: (g << 4) | g,
            b: (b << 4) | b,
        }

        return c
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
