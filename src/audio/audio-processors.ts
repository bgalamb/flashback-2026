// @ts-nocheck
class MixerChunk {
    data/*: Uint8Array*/
    len/*: number*/

    contructor() {
        this.data = null
        this.len = 0
    }

    getPCM(offset/*: number*/) {
        if (offset < 0) {
            offset = 0
        } else if (offset >= this.len) {
            offset = this.len - 1
        }
        return this.data[offset] << 24 >> 24
    }
}

class SampleInfo {
    len = 0
    vol = 0
    loopPos = 0
    loopLen = 0
    freq = 0
    pos = 0
    data = null

    getPCM(offset) {
        if (offset < 0) {
            offset = 0
        } else if (offset >= this.len) {
            offset = this.len - 1
        }
        return this.data[offset] << 24 >> 24
    }
}

const numChannels = 4
const fracBits = 12
const paulaFreq = 3546897
const maxVolume = 64
const kLowPassFilter = false
const kMasterVolume = 64 * 3

const readBeUint16 = (ptr, offset = 0) => {
    return (ptr[offset] << 8) | ptr[1 + offset]
}

const addcF32 = (a, b) => {
	a += b
	if (a < -1.0) {
		a = -1.0
	} else if (a > 1.0) {
		a = 1.0
	}
	return a
}

const s8ToF32 = (a) => {
	if (a < -128) {
		return -1.0
	} else if (a > 127) {
		return 1.0
	} else {
        return a / 128.0
		// const u8 = (a ^ 0x80)
		// return ((u8 << 8) | u8) - 32768
	}
}

const addcS16 = (a, b) => {
	a += b;
	if (a < -32768) {
		a = -32768
	} else if (a > 32767) {
		a = 32767
	}
	return a
}

const s8ToS16 = (a) => {
	if (a < -128) {
		return -32768
	} else if (a > 127) {
		return 32767
	} else {
		const u8 = (a ^ 0x80)
		return ((u8 << 8) | u8) - 32768
	}
}

class SoundProcessor extends AudioWorkletProcessor {
    _channels = null
    _premixHook = null
    _mixingRate = 0
    _ready = false

    static kUseNr = false
    static nr = (buf/*: Int16Array*/, len/*: number*/) => {
        let prev = 0
        for (let i = 0; i < len; ++i) {
            const vnr = buf[i] >> 1
            buf[i] = vnr + prev
            prev = vnr
        }
    }

    constructor() {
        super()
        this._channels = new Array(numChannels).fill(null).map(() => ({
            active: false,
            volume: 0,
            chunk: new MixerChunk(),
            chunkPos: 0,
            chunkInc: 0
        }))        
        this.port.onmessage = this. handleMessage.bind(this)
    }

    play(data /*: UInt8Array */, len /*: number */, freq /*: number */, volume /*: number */) {
        let ch/*:MixerChannel*/ = null
        for (let i = 0; i < numChannels; ++i) {
            let cur/*:MixerChannel*/ = this._channels[i]
            if (cur.active) {
                if (cur.chunk.data === data) {
                    cur.chunkPos = 0
                    return
                }
            } else {
                ch = cur
                break
            }
        }
        if (ch) {
            ch.active = true
            ch.volume = volume
            ch.chunk.data = data
            ch.chunk.len = len
            ch.chunkPos = 0
            ch.chunkInc = ((freq << fracBits) / this._mixingRate) >> 0
        }        
    }
    
    mix(input, out/*: Int16Array*/, len/*: number*/) {

        //the lenght is provided by the system, and it fact it looks 32bit and not 16 bit Int

        //copy the input to the output
        for (let pos = 0; pos < len; ++pos) {
            out[pos] = input[pos]
        }

        //loop through the channels
        for (let i = 0; i < numChannels; ++i) {
            const ch/*:MixerChannel*/ = this._channels[i]
            // if the channel is active
            if (ch.active) {
                //output array has a length of 128 so this loops 0-127
                for (let pos = 0; pos < len; ++pos) {
                    if ((ch.chunkPos >> fracBits) >= (ch.chunk.len - 1)) {
                        ch.active = false
                        break
                    }
                    const chunkdata = ch.chunk.getPCM(ch.chunkPos >> fracBits)
                    const sample = Math.floor(chunkdata * (ch.volume / maxVolume))
                    out[pos] = addcF32(out[pos], s8ToF32(sample))

                    ch.chunkPos += ch.chunkInc
                }
            }
        }
        //noise reduction, not important
        if (SoundProcessor.kUseNr) {
            SoundProcessor.nr(out, len)
        }
    }

    handleMessage(event) {
        switch(event.data.message) {
            case 'init':
                console.log('[soundProcessor] setting mixingRate to', event.data.mixingRate)
                this._mixingRate = event.data.mixingRate
                this.ready = true
                break

            case 'play':
                const { buffer, len, freq, volume } = event.data
                this.play(buffer, len, freq, volume)
                break
        }
    }

    postMessage(message) {
        this.port.postMessage(message)
    }

    process(inputs, outputs, params) {
        if (this.ready) {
            this.mix(inputs[0][0], outputs[0][0], outputs[0][0].length)
        }

        return true
    }
}

class SoundFxProcessor extends AudioWorkletProcessor {
    _mod = null
    _playing = false
    _ready = false
    _samplesLeft = 0
    _curOrder = 0
    _numOrders = 0
    _orderDelay = 0
    _modData = null
    _samples = new Array(numChannels)

    static _periodTable = [
        0x434, 0x3F8, 0x3C0, 0x38A, 0x358, 0x328, 0x2FA, 0x2D0, 0x2A6, 0x280,
        0x25C, 0x23A, 0x21A, 0x1FC, 0x1E0, 0x1C5, 0x1AC, 0x194, 0x17D, 0x168,
        0x153, 0x140, 0x12E, 0x11D, 0x10D, 0x0FE, 0x0F0, 0x0E2, 0x0D6, 0x0CA,
        0x0BE, 0x0B4, 0x0AA, 0x0A0, 0x097, 0x08F, 0x087, 0x07F, 0x078, 0x071
    ]
    static kUseNr = false
    static nr = (buf/*: Int16Array*/, len/*: number*/) => {
        let prev = 0
        for (let i = 0; i < len; ++i) {
            const vnr = buf[i] >> 1
            buf[i] = vnr + prev
            prev = vnr
        }
    }

    constructor() {
        super()
        this.port.onmessage = this.handleMessage.bind(this)
    }

    play(module) {
        this._mod = module
        this._curOrder = 0
        this._numOrders = readBeUint16(this._mod.moduleData)
        this._orderDelay = 0
        this._modData = this._mod.moduleData.subarray(0x22)
        this._modDataIndex = 0
        this._samples = this._samples.fill(null).map(() => new SampleInfo())
        this._samplesLeft = 0

        this._playing = true
        if (kLowPassFilter) {
            // TODO
            // memset(bw_xf, 0, sizeof(bw_xf));
            // memset(bw_yf, 0, sizeof(bw_yf));
        }
    }

    mixSamples(/*int16_t **/buf, /*int */samplesLen) {
        for (let i = 0; i < numChannels; ++i) {
            const si = this._samples[i]
            if (si.data) {
                let mixbuf = 0
                let len = si.len << fracBits
                let loopLen = si.loopLen << fracBits
                let loopPos = si.loopPos << fracBits
                let deltaPos = ((si.freq << fracBits) / this._mixingRate) >> 0
                let curLen = samplesLen
                let pos = si.pos

                while (curLen !== 0) {
                    let count
                    if (loopLen > (2 << fracBits)) {
                        if (si.loopPos + si.loopLen > si.len) {
                            throw(`Assertion Failed: ${si.loopPos} + ${si.loopLen} <= ${si.len}`)
                        }
                        if (pos >= loopPos + loopLen) {
                            pos -= loopLen
                        }
                        count = Math.min(curLen, ((loopPos + loopLen - pos - 1) / deltaPos + 1) >> 0)
                        curLen -= count
                    } else {
                        if (pos >= len) {
                            count = 0
                        } else {
                            count = Math.min(curLen, ((len - pos - 1) / deltaPos + 1) >> 0)
                        }
                        curLen = 0
                    }
                    while (count--) {
                        const out = Math.floor(si.getPCM(pos >> fracBits) * (si.vol / kMasterVolume))
                        buf[mixbuf] = addcF32(buf[mixbuf], s8ToF32(out));
                        ++mixbuf
                        pos += deltaPos
                    }
                }
                si.pos = pos
            }
        }
    }

    playSample(/*int */channel, /*const uint8_t **/sampleData, /*uint16_t */period) {
        if (channel >= numChannels) {
            throw(`Assertion Failed: ${channel} < ${numChannels}`)
        }
        let offset = 0
        const si = this._samples[channel]
        si.len = readBeUint16(sampleData)
        offset += 2
        si.vol = readBeUint16(sampleData, offset)
        offset += 2
        si.loopPos = readBeUint16(sampleData, offset)
        offset += 2
        si.loopLen = readBeUint16(sampleData, offset)
        offset += 2
        si.freq = (paulaFreq / period) >> 0
        si.pos = 0
        si.data = sampleData.subarray(offset)
    }

    handleTick() {
        if (!this._playing) {
            return
        }
        if (this._orderDelay !== 0) {
            --this._orderDelay
            // check for end of song
            if (this._orderDelay === 0 && this._modData === null) {
                this._playing = false
            }
        } else {
            this._orderDelay = readBeUint16(this._mod.moduleData, 2)
            let period = 0
            for (let ch = 0; ch < 3; ++ch) {
                let sampleData = null
                let b = this._modData[this._modDataIndex++]
                if (b !== 0) {
                    --b
                    // assert(b < 5);
                    if (b >= 5) {
                        throw(`Assertion failed: ${b} >= 5`)
                    }
                    period = readBeUint16(this._mod.moduleData, 4 + b * 2) << 16 >> 16
                    sampleData = this._mod.sampleData[b]
                }
                b = this._modData[this._modDataIndex++]
                if (b !== 0) {
                    let per = period + (b - 1)
                    if (per >= 0 && per < 40) {
                        per = SoundFxProcessor._periodTable[per]
                    } else if (per === -3) {
                        per = 0xA0
                    } else {
                        per = 0x71
                    }
                    this.playSample(ch, sampleData, per)
                }
            }
            ++this._curOrder
            if (this._curOrder >= this._numOrders) {
                console.log("[SoundFxProcessor] End of song")
                this._orderDelay += 20
                this._modData = null
                this._modDataIndex = 0
            }
        }
    }

    mix(out/*: Int16Array*/, len/*: number*/) {
        out.fill(0)
        if (this._playing) {
            // Let me search for the specific information about AudioContext's default sample rate:According to the MDN documentation
            // [[1]](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/AudioContext),
            // the default sample rate for AudioContext typically varies between 8,000 Hz and 96,000 Hz, with 44,100 Hz being the most common default value.
            // The exact value depends on the output device being used.
            // You can check the actual sample rate for your AudioContext instance by accessing the property `sampleRate`
            // this._audioContext = new window.AudioContext()
            // console.log(this._audioContext.sampleRate);
            // this._kAudioHz = this._audioContext.sampleRate
            // this.postMessageToSoundProcessor({
            // 				message: 'init',
            // 				mixingRate: this._kAudioHz,
            // 			})
            const samplesPerTick = (this._mixingRate / 50) >> 0

            while (len !== 0) {
                if (this._samplesLeft === 0) {
                    this.handleTick()
                    this._samplesLeft = samplesPerTick
                }
                let count = this._samplesLeft
                if (count > len) {
                    count = len
                }
                this._samplesLeft -= count
                len -= count
                this.mixSamples(out, count)
                if (kLowPassFilter) {
                    // TODO
                }
                out = out.subarray(count)
            }
        }
    }

    handleMessage(event) {
        switch(event.data.message) {
            case 'init':
                console.log('[sfxProcessor] setting mixingRate to', event.data.mixingRate)
                // this._kAudioHz = this._audioContext.sampleRate
                // this.postMessageToSoundProcessor({
                // 				message: 'init',
                // 				mixingRate: this._kAudioHz,
                // 			})
                this._mixingRate = event.data.mixingRate
                this._ready = true
                break

            case 'play':
                console.log('[sfxProcessor] playing sound')
                const { module } = event.data

                //interface Module {
                //     sampleData: Uint8Array[]
                //     moduleData: Uint8Array
                // }
                this.play(module)
                break
        }
    }

    postMessage(message) {
        this.port.postMessage(message)
    }

    // Based on the code shown, the method is called by the Web Audio API's AudioWorklet system.
    // This is part of the standard Web Audio API processing lifecycle. `process`
    // The method belongs to both and classes which extend .
    // These are custom audio processors registered with: `SoundProcessor``SoundFxProcessor``AudioWorkletProcessor`
    process(inputs, outputs, params) {
        if (this._playing) {
            this.mix(outputs[0][0], outputs[0][0].length)
        }

        return true
    }
}

registerProcessor('sound-processor', SoundProcessor)
registerProcessor('sfx-processor', SoundFxProcessor)
