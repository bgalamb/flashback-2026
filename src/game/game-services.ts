import type { Cutscene } from '../cutscene-players/cutscene'
import type { Mixer } from '../audio/mixer'
import type { Resource } from '../resource/resource'
import type { Video } from '../video/video'
import type { SystemStub } from '../platform/systemstub-web'
import type { FileSystem } from '../resource/fs'
import type { Game } from './game'

export type GameServicesShape = {
    res: Resource
    vid: Video
    mix: Mixer
    cut: Cutscene
    stub: SystemStub
    fs: FileSystem
}

export function getGameServices(game: Game): GameServicesShape {
    return game.services
}
