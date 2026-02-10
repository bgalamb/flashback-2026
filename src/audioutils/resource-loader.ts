import { File } from "./file"
import { FileSystem } from "./fs"
import {Buffer, CLIP, READ_LE_UINT16, READ_LE_UINT32, SoundFx} from "./intern";

class FIB_Loader {
    static readonly FILENAME = 'DEMO_UK.ABA'
    static readonly TAG = 0x442E4D2E
    static readonly ENTRY_SIZE = 30

    //these are function types
    _readUint16: (buf: ArrayBuffer|Buffer|Uint8Array, offset?) => number
    _readUint32: (buf: ArrayBuffer|Buffer|Uint8Array, offset?) => number


    constructor() {
        this._readUint16 =  READ_LE_UINT16
        this._readUint32 =  READ_LE_UINT32
    }

    async load_FIB(fs: FileSystem) {
        const entry_name = `global.FIB`
        const f = new File()
        let numSfx
        let sfxList

        if (await f.open(entry_name, "rb", fs)) {
            numSfx = f.readUint16LE()
            sfxList = new Array(numSfx).fill(null).map(() => ({
                offset: 0,
                freq: 0,
                len: 0,
                peak: 0,
                data: null,
            }))
            if (!sfxList) {
                console.error("Unable to allocate SoundFx table");
            }

            //load the sfx data one by one
            for (let i = 0; i < numSfx; ++i) {
                const sfx:SoundFx = sfxList[i]
                sfx.offset = f.readUint32LE()
                sfx.len = f.readUint16LE()
                sfx.freq = 6000
                sfx.data = null
            }
            for (let i = 0; i < numSfx; ++i) {
                const sfx:SoundFx = sfxList[i]
                if (sfx.len === 0) {
                    continue
                }
                f.seek(sfx.offset)
                const len = (sfx.len * 2) - 1
                const data = new Uint8Array(len)
                if (!data) {
                    console.error("Unable to allocate SoundFx data buffer")
                }
                sfx.data = data
                let index = 0
                // Fibonacci-delta decoding
                const codeToDelta:number[] = [ -34, -21, -13, -8, -5, -3, -2, -1, 0, 1, 2, 3, 5, 8, 13, 21 ]
                let c = f.readByte() << 24 >>24
                data[index++] = c
                sfx.peak = Math.abs(c)
                for (let j = 1; j < sfx.len; ++j) {
                    const d = f.readByte()

                    c += codeToDelta[d >> 4]

                    data[index++] = CLIP(c, -128, 127)
                    if (Math.abs(c) > sfx.peak) {
                        sfx.peak = Math.abs(c)
                    }

                    c += codeToDelta[d & 15]
                    data[index++] = CLIP(c, -128, 127)
                    if (Math.abs(c) > sfx.peak) {
                        sfx.peak = Math.abs(c)
                    }
                }
                sfx.len = len
            }
            if (f.ioErr()) {
                console.error(`I/O error when reading '${entry_name}'`)
            }
            return sfxList
        } else {
            console.error(`Cannot open '${entry_name}'`)
        }
    }
}

export { FIB_Loader }