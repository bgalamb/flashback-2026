import { CLIP, SoundFx } from '../core/intern'
import { uint8Max, uint16Max } from '../core/game_constants'
import { File } from './file'
import { FileSystem } from './fs'

interface VoiceSegmentResult {
    buf: Uint8Array
    bufSize: number
}

const kMenuMapSize = 0x3800 * 4
const kMenuPalSize = 768
const kCodeToDelta: number[] = [ -34, -21, -13, -8, -5, -3, -2, -1, 0, 1, 2, 3, 5, 8, 13, 21 ]

async function loadVoiceSegment(fs: FileSystem, voicesOffsetsTable: Uint16Array, num: number, segment: number): Promise<VoiceSegmentResult> {
    const res: VoiceSegmentResult = {
        buf: null,
        bufSize: 0
    }
    let offset = voicesOffsetsTable[num]
    if (offset === uint16Max) {
        return res
    }

    const p = voicesOffsetsTable.subarray(offset / 2)
    let pIndex = 0
    offset = p[pIndex++] * 2048
    const count = p[pIndex++]
    if (segment >= count) {
        return res
    }

    const f = new File()
    if (!await f.open('VOICE.VCE', 'rb', fs)) {
        return res
    }

    const voiceSize = p[pIndex + segment] * 2048 / 5
    const voiceBuf = new Uint8Array(voiceSize)
    let dst = 0
    offset += 0x2000
    for (let s = 0; s < count; ++s) {
        const len = p[pIndex + s] * 2048
        for (let i = 0; i < (len / (0x2000 + 2048)) >> 0; ++i) {
            if (s === segment) {
                f.seek(offset)
                let n = 2048
                while (n--) {
                    let v = f.readByte()
                    if (v & 0x80) {
                        v = -(v & 0x7F)
                    }
                    voiceBuf[dst++] = (v & uint8Max) >>> 0
                }
            }
            offset += 0x2000 + 2048
        }
        if (s === segment) {
            break
        }
    }

    res.buf = voiceBuf
    res.bufSize = voiceSize
    return res
}

async function loadSoundEffects(fs: FileSystem, entryName: string): Promise<{ numSfx: number, sfxList: SoundFx[] } | null> {
    const f = new File()
    if (!await f.open(entryName, 'rb', fs)) {
        console.error(`Cannot open '${entryName}'`)
        return null
    }

    const numSfx = f.readUint16LE()
    const sfxList: SoundFx[] = new Array(numSfx).fill(null).map(() => ({
        offset: 0,
        freq: 0,
        len: 0,
        peak: 0,
        data: null,
    }))

    for (let i = 0; i < numSfx; ++i) {
        const sfx = sfxList[i]
        sfx.offset = f.readUint32LE()
        sfx.len = f.readUint16LE()
        sfx.freq = 6000
        sfx.data = null
    }

    for (let i = 0; i < numSfx; ++i) {
        const sfx = sfxList[i]
        if (sfx.len === 0) {
            continue
        }
        f.seek(sfx.offset)
        const len = (sfx.len * 2) - 1
        const data = new Uint8Array(len)

        sfx.data = data
        let index = 0
        let c = f.readByte() << 24 >> 24
        data[index++] = c
        sfx.peak = Math.abs(c)
        for (let j = 1; j < sfx.len; ++j) {
            const d = f.readByte()

            c += kCodeToDelta[d >> 4]
            data[index++] = CLIP(c, -128, 127)
            if (Math.abs(c) > sfx.peak) {
                sfx.peak = Math.abs(c)
            }

            c += kCodeToDelta[d & 15]
            data[index++] = CLIP(c, -128, 127)
            if (Math.abs(c) > sfx.peak) {
                sfx.peak = Math.abs(c)
            }
        }
        sfx.len = len
    }

    if (f.ioErr()) {
        console.error(`I/O error when reading '${entryName}'`)
    }

    return {
        numSfx,
        sfxList,
    }
}

async function loadMenuAsset(fs: FileSystem, entryName: string, dstPtr: Uint8Array, size: number) {
    const f = new File()
    if (!await f.open(entryName, 'rb', fs)) {
        console.error(`Cannot load '${entryName}'`)
        return
    }
    if (f.read(dstPtr.buffer, size) !== size) {
        console.error(`Failed to read '${entryName}'`)
    }
    if (f.ioErr()) {
        console.error(`I/O error when reading '${entryName}'`)
    }
}

async function loadMenuMap(fs: FileSystem, entryName: string, dstPtr: Uint8Array) {
    return loadMenuAsset(fs, entryName, dstPtr, kMenuMapSize)
}

async function loadMenuPalette(fs: FileSystem, entryName: string, dstPtr: Uint8Array) {
    return loadMenuAsset(fs, entryName, dstPtr, kMenuPalSize)
}

export {
    loadMenuMap,
    loadMenuPalette,
    loadSoundEffects,
    loadVoiceSegment,
}
