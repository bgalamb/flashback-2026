import { FileSystem } from "../resource/fs"
import { addcS16, s8ToS16 } from "../core/intern"
import { SfxPlayer } from "./sfx_player"
import type { SystemPort } from "../platform/system-port"

class MixerChunk {
    data: Uint8Array
    len: number

    contructor() {
        this.data = null
        this.len = 0
    }

    getPCM(offset: number) {
        if (offset < 0) {
            offset = 0
        } else if (offset >= this.len) {
            offset = this.len - 1
        }
        return this.data[offset]
    }
}

type PremixHook = (userData: ArrayBuffer, buf: Int16Array, len: number) => boolean

enum MusicType {
    mtNone,
    mtMod,
    mtOgg,
    mtSfx,
    mtCpc,
}

const musicTrack = 1000
const numChannels = 4
const fracBits = 12
const maxVolume = 64

interface MixerChannel {
    active: boolean
    volume: number
    chunk: MixerChunk
    chunkPos: number
    chunkInc: number
}

class Mixer {
    _fs: FileSystem
    _stub: SystemPort
    _channels: MixerChannel[] = new Array(numChannels).fill(null).map(() => ({
        active: false,
        volume: 0,
        chunk: new MixerChunk(),
        chunkPos: 0,
        chunkInc: 0
    }))
    _premixHook: PremixHook
    _premixHookData: ArrayBuffer
    _backgroundMusicType: MusicType
    _musicType: MusicType
    _sfx: SfxPlayer
    _musicTrack: number
    static musicTrack = 1000
    static kUseNr = false
    static isMusicSfx = (num: number) => (num >= 68 && num <= 75)
    static nr = (buf: Int16Array, len: number) => {
        let prev = 0
        for (let i = 0; i < len; ++i) {
            const vnr = buf[i] >> 1
            buf[i] = vnr + prev
            prev = vnr
        }
    }

    constructor(fs: FileSystem, stub: SystemPort) {
        this._stub = stub
        this._musicType = MusicType.mtNone
        this._sfx = new SfxPlayer(this)
        this._musicTrack = -1
        this._backgroundMusicType = MusicType.mtNone
    }

    init() {
        for (let i = 0; i < numChannels; ++i) {
            this._channels[i] = {
                active: false,
                volume: 0,
                chunk: new MixerChunk(),
                chunkPos: 0,
                chunkInc: 0,
            }
        }
        this._premixHook = null
    }

    playMusic(num: number) {

        if ((this._musicType == MusicType.mtOgg || this._musicType == MusicType.mtCpc) && Mixer.isMusicSfx(num)) { // do not play level action music with background music
            return;
        }
        if (Mixer.isMusicSfx(num)) { // level action sequence
            this._sfx.play(num)
            if (this._sfx._playing) {
                this._musicType = MusicType.mtSfx
            }
        }
    }

    stopMusic() {

    }

    mix(out: Int16Array, len: number) {
        if (this._premixHook) {
            if (!this._premixHook(this._premixHookData, out, len)) {
                this._premixHook = null
                this._premixHookData = null
            }
        }
        for (let i = 0; i < numChannels; ++i) {
            const ch:MixerChannel = this._channels[i]
            if (ch.active) {
                for (let pos = 0; pos < len; ++pos) {
                    if ((ch.chunkPos >> fracBits) >= (ch.chunk.len - 1)) {
                        ch.active = false
                        break
                    }
                    const sample = ch.chunk.getPCM(ch.chunkPos >> fracBits) * Math.floor(ch.volume / maxVolume)
                    out[pos] = addcS16(out[pos], s8ToS16(sample))
                    ch.chunkPos += ch.chunkInc
                }
            }
        }
        if (Mixer.kUseNr) {
            Mixer.nr(out, len);
        }
    }

    play(data: Uint8Array, len: number, freq: number, volume: number) {
        this._stub.postMessageToSoundProcessor({
            message: 'play',
            buffer: data,
            len,
            freq,
            volume,
        })
        return
    }

    stopAll() {
        for (let i = 0; i < numChannels; ++i) {
            this._channels[i].active = false
        }
    }

    isPlaying(data: Uint8Array) {
        for (let i = 0; i < numChannels; ++i) {
            const ch:MixerChannel = this._channels[i]
            if (ch.active && ch.chunk.data === data) {
                return true
            }
        }
        return false
    }
}

export { Mixer, maxVolume }
