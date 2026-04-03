import { Resource } from '../resource/resource'
import { SystemStub } from '../platform/systemstub_web'
import { Video } from '../video/video'
import { _cineSceneIdToCutPairsDOS, _musicTable, _namesTableDOS, _offsetsTableDOS } from '../core/staticres'
import { UINT16_MAX, UINT8_MAX, global_game_options } from '../core/game_constants'
import { Mp4CutscenePlayer } from './mp4-cutscene-player'

class Cutscene {
    static _offsetsTableDOS = _offsetsTableDOS
    static _musicTable = _musicTable

    private _res: Resource
    private _stub: SystemStub
    private _vid: Video
    private _id: number = UINT16_MAX
    private _interrupted: boolean = false
    private _deathCutsceneId: number = UINT16_MAX

    constructor(res: Resource, stub: SystemStub, vid: Video) {
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
        if (id === UINT16_MAX) {
            return
        }

        const offsets = Cutscene._offsetsTableDOS
        let cutName = offsets[id * 2 + 0]
        const cutOff = offsets[id * 2 + 1]

        if (cutName !== UINT16_MAX) {
            cutName = this.resolveCutNameOverride(id, cutName)
        }

        const mappedVideo = this.resolveMP4CutsceneFileName(id, cutName, cutOff)
        if (mappedVideo) {
            const player = new Mp4CutscenePlayer(this._stub, this._res.fileSystem)
            this._interrupted = !(await player.play(mappedVideo))
        } else if (cutName !== UINT16_MAX) {
            throw new Error(`Missing MP4 cutscene mapping for scene ${id} (cutName=${cutName}, cutOffset=${cutOff})`)
        }

        this._vid.fullRefresh()
        if (this.getId() !== 0x3D) {
            this.setId(UINT16_MAX)
        }
    }

    private resolveMP4CutsceneFileName(id: number, cutName: number, cutOff: number) {
        if (cutName === UINT16_MAX) {
            return null
        }
        const entry = _cineSceneIdToCutPairsDOS[id]
        if (entry && entry.cutName === _namesTableDOS[cutName & UINT8_MAX] && entry.cutOffset === cutOff && entry.mpegFileName) {
            return entry.mpegFileName
        }
        return null
    }

    private resolveCutNameOverride(id: number, cutName: number) {
        switch (id) {
            case 3:
                if (global_game_options.play_carte_cutscene) {
                    return 2
                }
                return cutName
            case 8:
                return cutName
            case 19:
                if (global_game_options.play_serrure_cutscene) {
                    return 31
                }
                return cutName
            case 22:
            case 23:
            case 24:
                if (global_game_options.play_asc_cutscene) {
                    return 12
                }
                return cutName
            case 30:
            case 31:
                if (global_game_options.play_metro_cutscene) {
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
