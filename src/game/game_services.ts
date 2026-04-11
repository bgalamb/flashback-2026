import type { Cutscene } from '../cutscene-players/cutscene'
import { Cutscene as CutsceneImpl } from '../cutscene-players/cutscene'
import type { Mixer } from '../audio/mixer'
import { Mixer as MixerImpl } from '../audio/mixer'
import type { Resource } from '../resource/resource'
import { Resource as ResourceImpl } from '../resource/resource'
import type { Video } from '../video/video'
import { Video as VideoImpl } from '../video/video'
import type { SystemPort } from '../platform/system-port'
import type { FileSystem } from '../resource/fs'
import type { Menu } from './menu'
import { Menu as MenuImpl } from './menu'
import type { Game } from './game'

export type GameServicesShape = {
    res: Resource
    vid: Video
    mix: Mixer
    cut: Cutscene
    stub: SystemPort
    fs: FileSystem
    menu: Menu
}

export function createGameServices(stub: SystemPort, fs: FileSystem): GameServicesShape {
    const res = new ResourceImpl(fs)
    const vid = new VideoImpl(res, stub)
    return {
        res,
        vid,
        mix: new MixerImpl(fs, stub),
        cut: new CutsceneImpl(res, stub, vid),
        stub,
        fs,
        menu: new MenuImpl(res, stub, vid),
    }
}

export function getGameServices(game: Game): GameServicesShape {
    return (game as Game & { services: GameServicesShape }).services
}
