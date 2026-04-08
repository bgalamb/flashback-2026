import { readBeUint16, readLeUint16 } from '../core/intern'
import { gamescreenW } from '../core/game_constants'

function decodeIcon(src: Uint8Array, num: number, dst: Uint8Array) {
    const offset = readLeUint16(src, num * 2)
    const p = src.subarray(offset + 2)
    let index = 0
    for (let i = 0; i < 16 * 16 / 2; ++i) {
        dst[index++] = p[i] >> 4
        dst[index++] = p[i] & 15
    }
}

function decodeSpc(src: Uint8Array, w: number, h: number, dst: Uint8Array) {
    const size = w * h / 2
    let index = 0
    for (let i = 0; i < size; ++i) {
        dst[index++] = src[i] >> 4
        dst[index++] = src[i] & 15
    }
}

function decodeSpm(dataPtr: Uint8Array, dst: Uint8Array) {
    const len = 2 * readBeUint16(dataPtr)
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

function drawSpriteSub1(src: Uint8Array, dst: Uint8Array, pitch: number, h: number, w: number, colMask: number) {
    let srcIndex = 0
    let dstIndex = 0
    while (h--) {
        for (let i = 0; i < w; ++i) {
            if (src[srcIndex + i] !== 0) {
                dst[dstIndex + i] = src[srcIndex + i] | colMask
            }
        }
        srcIndex += pitch
        dstIndex += gamescreenW
    }
}

function drawSpriteSub2(src: Uint8Array, dst: Uint8Array, pitch: number, h: number, w: number, colMask: number) {
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
        dstIndex += gamescreenW
    }
}

function drawSpriteSub3(src: Uint8Array, dst: Uint8Array, pitch: number, h: number, w: number, colMask: number) {
    let srcIndex = 0
    let dstIndex = 0
    while (h--) {
        for (let i = 0; i < w; ++i) {
            if (src[srcIndex + i] !== 0 && !(dst[dstIndex + i] & 0x80)) {
                dst[dstIndex + i] = src[srcIndex + i] | colMask
            }
        }
        srcIndex += pitch
        dstIndex += gamescreenW
    }
}

function drawSpriteSub4(src: Uint8Array, dst: Uint8Array, pitch: number, h: number, w: number, colMask: number) {
    let srcIndex = src.byteOffset
    let dstIndex = 0
    src = new Uint8Array(src.buffer)
    while (h--) {
        for (let i = 0; i < w; ++i) {
            if (src[-i + srcIndex] !== 0 && !(dst[i + dstIndex] & 0x80)) {
                dst[i + dstIndex] = src[-i + srcIndex] | colMask
            }
        }
        srcIndex += pitch
        dstIndex += gamescreenW
    }
}

function drawSpriteSub5(src: Uint8Array, dst: Uint8Array, pitch: number, h: number, w: number, colMask: number) {
    let srcIndex = 0
    let dstIndex = 0
    while (h--) {
        for (let i = 0; i < w; ++i) {
            if (src[i * pitch + srcIndex] !== 0 && !(dst[i + dstIndex] & 0x80)) {
                dst[i + dstIndex] = src[i * pitch + srcIndex] | colMask
            }
        }
        ++srcIndex
        dstIndex += gamescreenW
    }
}

function drawSpriteSub6(src: Uint8Array, dst: Uint8Array, pitch: number, h: number, w: number, colMask: number) {
    let srcIndex = src.byteOffset
    let dstIndex = 0
    src = new Uint8Array(src.buffer)
    while (h--) {
        for (let i = 0; i < w; ++i) {
            if (src[-i * pitch + srcIndex] !== 0 && !(dst[i + dstIndex] & 0x80)) {
                dst[i + dstIndex] = src[-i * pitch + srcIndex] | colMask
            }
        }
        ++srcIndex
        dstIndex += gamescreenW
    }
}

export {
    decodeIcon,
    decodeSpc,
    decodeSpm,
    drawSpriteSub1,
    drawSpriteSub2,
    drawSpriteSub3,
    drawSpriteSub4,
    drawSpriteSub5,
    drawSpriteSub6,
}
