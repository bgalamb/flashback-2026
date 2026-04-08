import { readBeUint32 } from "./intern"
import { assert } from "./assert"

interface UnpackCtx {
    size: number
    crc: number
    bits: number
    dst: Uint8Array,
    src: Uint8Array
    srcOffset: number
    dstOffset: number
}

const nextBit = (uc: UnpackCtx): boolean => {
    let bit = (uc.bits & 1) !== 0
    uc.bits = (uc.bits >>> 1)
    if (uc.bits === 0) {
        const bits = readBeUint32(uc.src.buffer, uc.srcOffset)
        uc.srcOffset -= 4
        uc.crc = (uc.crc^bits) >>> 0
        bit = (bits & 1) !== 0
        uc.bits = ((1 << 31) | (bits >>> 1)) >>> 0
    }
    return bit
}

const getBits = (uc: UnpackCtx, count: number) => {
    let bits = 0
    for (let i = 0; i < count; ++i) {
        bits = (bits | (nextBit(uc) ? 1 : 0) << (count - 1 - i)) >>> 0
    }
    return bits
}

const copyLiteral = (uc: UnpackCtx, len: number) => {
    uc.size -= len
    if (uc.size < 0) {
        len += uc.size
        uc.size = 0
    }
    for (let i = 0; i < len; ++i) {
        const data = getBits(uc, 8)
        uc.dst[uc.dstOffset - i] = data
    }
    uc.dstOffset -= len
}

const copyReference = (uc: UnpackCtx, len: number, offset: number) => {
    uc.size -= len
    if (uc.size < 0) {
        len += uc.size
        uc.size = 0
    }
    for (let i = 0; i < len; ++i) {
        uc.dst[uc.dstOffset -i] = uc.dst[uc.dstOffset - i + offset]
    }
    uc.dstOffset -= len
}

const bytekillerUnpack = (dst: Uint8Array, dstSize: number, src: Uint8Array, srcSize: number): boolean => {
    const uc: UnpackCtx = {
        src,
        srcOffset: src.byteOffset + srcSize - 4,
        size: 0,
        dst: null,
        dstOffset: 0,
        bits: 0,
        crc: 0
    }

    uc.size = readBeUint32(uc.src.buffer, uc.srcOffset)
    uc.srcOffset -= 4
    if (uc.size > dstSize) {
        console.warn(`Unexpected unpack size ${uc.size} buffer size ${dstSize}`)
        return false
    }
    uc.dst = dst,
    uc.dstOffset = uc.size - 1
    uc.crc = readBeUint32(uc.src.buffer, uc.srcOffset)
    uc.srcOffset -= 4
    uc.bits = readBeUint32(uc.src.buffer, uc.srcOffset)
    uc.srcOffset -= 4

	uc.crc = (uc.crc^uc.bits) >>> 0
    let loop = -1
    let maxLoop = 1
    do {
        loop++
        if (!nextBit(uc)) {
            if (!nextBit(uc)) {
                copyLiteral(uc, getBits(uc, 3) + 1)
            } else {        
                copyReference(uc, 2, getBits(uc, 8))
            }
        } else {    
            const code = getBits(uc, 2)
            switch(code) {
                case 3:
                    copyLiteral(uc, getBits(uc, 8) + 9)
                    break
                case 2:
                    const len = getBits(uc, 8) + 1
                    copyReference(uc, len, getBits(uc, 12))
                    break
                case 1:
                    copyReference(uc, 4, getBits(uc, 10))
                    break
                case 0:
                    copyReference(uc, 3, getBits(uc, 9))
            }
        }
    } while(uc.size > 0)
    assert(!(uc.size !== 0), `Assertion failed: ${uc.size} === 0`)
    return uc.crc === 0
}

export { bytekillerUnpack }
