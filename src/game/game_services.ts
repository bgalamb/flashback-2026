import type { Cutscene } from '../cutscene-players/cutscene'
import type { Mixer } from '../audio/mixer'
import type { Resource } from '../resource/resource'
import type { Video } from '../video/video'
import type { SystemStub } from '../platform/systemstub_web'
import type { FileSystem } from '../resource/fs'
import type { Game } from './game'

type ServicesGame = Record<string, unknown>

export type GameServicesShape = {
    res: Resource
    vid: Video
    mix: Mixer
    cut: Cutscene
    stub: SystemStub
    fs: FileSystem
}

export function getGameServices(game: Game): GameServicesShape {
    const servicesGame = game as unknown as ServicesGame
    const groupedServices = servicesGame['services'] as GameServicesShape | undefined
    return groupedServices ?? {
        get res() { return servicesGame['_res'] as Resource },
        set res(value: Resource) { servicesGame['_res'] = value },
        get vid() { return servicesGame['_vid'] as Video },
        set vid(value: Video) { servicesGame['_vid'] = value },
        get mix() { return servicesGame['_mix'] as Mixer },
        set mix(value: Mixer) { servicesGame['_mix'] = value },
        get cut() { return servicesGame['_cut'] as Cutscene },
        set cut(value: Cutscene) { servicesGame['_cut'] = value },
        get stub() { return servicesGame['_stub'] as SystemStub },
        set stub(value: SystemStub) { servicesGame['_stub'] = value },
        get fs() { return servicesGame['_fs'] as FileSystem },
        set fs(value: FileSystem) { servicesGame['_fs'] = value },
    }
}
