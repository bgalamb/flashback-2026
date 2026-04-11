import { Resource } from '../resource/resource'
import type { SystemPort } from '../platform/system-port'
import { Video } from '../video/video'
import { _cineSceneIdToCutPairsDOS, _musicTable, _namesTableDOS, _offsetsTableDOS } from '../core/staticres'
import { uint16Max, uint8Max, globalGameOptions } from '../core/game_constants'
import { Mp4CutscenePlayer } from './mp4-cutscene-player'

class Cutscene {
    static _offsetsTableDOS = _offsetsTableDOS
    static _musicTable = _musicTable

    private _res: Resource
    private _stub: SystemPort
    private _vid: Video
    private _id: number = uint16Max
    private _interrupted: boolean = false
    private _deathCutsceneId: number = uint16Max

    constructor(res: Resource, stub: SystemPort, vid: Video) {
        this._res = res
        this._stub = stub
        this._vid = vid
    }

    setId(cutId: number) {
        this._id = cutId
    }

    getId() {
        return this._id
    }

    isInterrupted() {
        return this._interrupted
    }

    getDeathCutSceneId() {
        return this._deathCutsceneId
    }

    setDeathCutSceneId(cutSceneId: number) {
        this._deathCutsceneId = cutSceneId
    }

    async play(id = this.getId()) {
        this.setId(id)
        if (id === uint16Max) {
            return
        }

        const offsets = Cutscene._offsetsTableDOS
        let cutName = offsets[id * 2 + 0]
        const cutOff = offsets[id * 2 + 1]

        if (cutName !== uint16Max) {
            cutName = this.resolveCutNameOverride(id, cutName)
        }

        const mappedVideo = this.resolveMP4CutsceneFileName(id, cutName, cutOff)
        if (mappedVideo) {
            const player = new Mp4CutscenePlayer(this._stub, this._res.fileSystem)
            this._interrupted = !(await player.play(mappedVideo))
        } else if (cutName !== uint16Max) {
            throw new Error(`Missing MP4 cutscene mapping for scene ${id} (cutName=${cutName}, cutOffset=${cutOff})`)
        }

        this._vid.fullRefresh()
        if (this.getId() !== 0x3D) {
            this.setId(uint16Max)
        }
    }

    private resolveMP4CutsceneFileName(id: number, cutName: number, cutOff: number) {
        if (cutName === uint16Max) {
            return null
        }
        const entry = _cineSceneIdToCutPairsDOS[id]
        if (entry && entry.cutName === _namesTableDOS[cutName & uint8Max] && entry.cutOffset === cutOff && entry.mpegFileName) {
            return entry.mpegFileName
        }
        return null
    }

    private resolveCutNameOverride(id: number, cutName: number) {
        switch (id) {
            case 3:
                if (globalGameOptions.playCarteCutscene) {
                    return 2
                }
                return cutName
            case 8:
                return cutName
            case 19:
                if (globalGameOptions.playSerrureCutscene) {
                    return 31
                }
                return cutName
            case 22:
            case 23:
            case 24:
                if (globalGameOptions.playAscCutscene) {
                    return 12
                }
                return cutName
            case 30:
            case 31:
                if (globalGameOptions.playMetroCutscene) {
                    return 14
                }
                return cutName
            case 46:
                return cutName
            default:
                console.warn(`No override needed for Cutscene ${id}`)
                return cutName
        }
    }
}

export { Cutscene }
