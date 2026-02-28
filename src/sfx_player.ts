import { Mixer } from "./mixer"
import { _module68, _module70, _module72, _module73, _module74, _module75, _musicData68, _musicData70, _musicData72, _musicData73, _musicData74, _musicData75, _musicDataSample1, _musicDataSample2, _musicDataSample3, _musicDataSample4, _musicDataSample5, _musicDataSample6, _musicDataSample7, _musicDataSample8, _sfxPeriodTable } from "./staticres"
import { assert } from "./assert"

interface Module {
    sampleData: Uint8Array[]
    moduleData: Uint8Array
}

class SfxPlayer {
    static _musicData68: Uint8Array = _musicData68
    static _musicData70: Uint8Array = _musicData70
    static _musicData72: Uint8Array = _musicData72
    static _musicData73: Uint8Array = _musicData73
    static _musicData74: Uint8Array = _musicData74
    static _musicData75: Uint8Array = _musicData75
    static _musicDataSample1: Uint8Array = _musicDataSample1
    static _musicDataSample2: Uint8Array = _musicDataSample2
    static _musicDataSample3: Uint8Array = _musicDataSample3
    static _musicDataSample4: Uint8Array = _musicDataSample4
    static _musicDataSample5: Uint8Array = _musicDataSample5
    static _musicDataSample6: Uint8Array = _musicDataSample6
    static _musicDataSample7: Uint8Array = _musicDataSample7
    static _musicDataSample8: Uint8Array = _musicDataSample8
    static _module68: Module = _module68
    static _module70: Module = _module70
    static _module72: Module = _module72
    static _module73: Module = _module73
    static _module74: Module = _module74
    static _module75: Module = _module75
    static _periodTable: Uint16Array = _sfxPeriodTable

    _mod: Module
    _playing: boolean
    _mix: Mixer

    constructor(mixer: Mixer) {
        this._mod = null
        this._playing = false
        this._mix = mixer
    }

    play(num: number) {
        console.log(`SfxPlayer::play(${num})`)
        if (!this._playing) {
            assert(!(num < 68 || num > 75), `Assertion failed: ${num} >= 68 && ${num} <= 75`)
            // assert(num >= 68 && num <= 75);
            const modTable:Module[] = [
                SfxPlayer._module68, SfxPlayer._module68, SfxPlayer._module70, SfxPlayer._module70,
                SfxPlayer._module72, SfxPlayer._module73, SfxPlayer._module74, SfxPlayer._module75
            ];
            const module = modTable[num - 68]
            this._mix._stub.postMessageToSFXProcessor({
                message: 'play',
                module
            })
        }        
    }

    stop() {
        throw('SfxPlayer::stop() not implemented!')
    }
}

export { SfxPlayer }
