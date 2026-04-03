import { READ_BE_UINT16, READ_BE_UINT32, READ_LE_UINT16 } from './intern'
import { GAMESCREEN_H, GAMESCREEN_W, UINT16_MAX } from './game_constants'
import { assert } from './assert'

function decodeMapPlane(sz: number, src: Uint8Array, dst: Uint8Array) {
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

function decodeAmigaRle(dst: Uint8Array, src: Uint8Array) {
    const size = READ_BE_UINT16(src) & 0x7FFF
    let dstIndex = 0
    src = src.subarray(2)
    for (let i = 0; i < size;) {
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

function drawTileMask(dst: Uint8Array, x0: number, y0: number, w: number, h: number, m: Uint8Array, p: Uint8Array, size: number) {
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

function decodeSgd(dst: Uint8Array, src: Uint8Array, data: Uint8Array) {
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

        if (d2 !== UINT16_MAX) {
            d2 &= ~(1 << 15)
            const offset = READ_BE_UINT32(data, d2 * 4) << 32 >> 32
            if (offset < 0) {
                const ptr = new Uint8Array(data.buffer, data.byteOffset - offset)
                let ptrIndex = 0
                const size = READ_BE_UINT16(ptr, ptrIndex)
                ptrIndex += 2
                if (num !== d2) {
                    num = d2
                    buf.set(ptr.subarray(ptrIndex, size + ptrIndex))
                }
            } else {
                if (num !== d2) {
                    num = d2
                    READ_BE_UINT16(data, offset) & 0x7FFF
                    decodeAmigaRle(buf, data.subarray(offset))
                }
            }
        }
        const w = (buf[0] + 1) >> 1
        const h = buf[1] + 1
        const planarSize = READ_BE_UINT16(buf, 2)

        drawTileMask(dst, d0, d1, w, h, buf.subarray(4), buf.subarray(4 + planarSize), planarSize)
    } while (--count >= 0)
}

function drawTile(dst: Uint8Array, src: Uint8Array, mask: number, xflip: boolean, yflip: boolean, colorKey: number) {
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
        inc = -1
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

function decodeLevelTiles(dst: Uint8Array, src: Uint8Array, sgdOffset: number, offset12: number, tileDataBuffer: Uint8Array, sgdBuf: boolean, isPC: boolean) {
    if (sgdOffset !== 0) {
        let a0 = sgdOffset
        for (let y = 0; y < GAMESCREEN_H; y += 8) {
            for (let x = 0; x < GAMESCREEN_W; x += 8) {
                const d3 = isPC ? READ_LE_UINT16(src, a0) : READ_BE_UINT16(src, a0)
                a0 += 2
                const d0 = d3 & 0x7FF
                if (d0 !== 0) {
                    const tiledata = tileDataBuffer.subarray(d0 * 32)
                    const yflip = (d3 & (1 << 12)) !== 0
                    const xflip = (d3 & (1 << 11)) !== 0

                    let mask = 0
                    if ((d3 & 0x8000) !== 0) {
                        mask = 0x80 + ((d3 >> 6) & 0x10)
                    }
                    drawTile(dst.subarray(y * GAMESCREEN_W + x), tiledata, mask, xflip, yflip, -1)
                }
            }
        }
    }
    if (offset12 !== 0) {
        let a0 = offset12
        for (let y = 0; y < GAMESCREEN_H; y += 8) {
            for (let x = 0; x < GAMESCREEN_W; x += 8) {
                const d3 = isPC ? READ_LE_UINT16(src, a0) : READ_BE_UINT16(src, a0)
                a0 += 2
                let d0 = d3 & 0x7FF

                if (d0 !== 0 && sgdBuf) {
                    d0 -= 896
                }
                if (d0 !== 0) {
                    const tiledata = tileDataBuffer.subarray(d0 * 32)
                    const yflip = (d3 & (1 << 12)) !== 0
                    const xflip = (d3 & (1 << 11)) !== 0

                    let mask = 0
                    if ((d3 & 0x6000) !== 0 && sgdBuf) {
                        mask = 0x10
                    } else if ((d3 & 0x8000) !== 0) {
                        mask = 0x80 + ((d3 >> 6) & 0x10)
                    }
                    drawTile(dst.subarray(y * GAMESCREEN_W + x), tiledata, mask, xflip, yflip, 0)
                }
            }
        }
    }
}

export {
    decodeAmigaRle,
    decodeLevelTiles,
    decodeMapPlane,
    decodeSgd,
    drawTile,
    drawTileMask,
}
