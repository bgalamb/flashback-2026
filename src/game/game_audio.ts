import type { SoundFx, LivePGE } from '../core/intern'
import type { Game } from './game'
import { maxVolume } from '../audio/mixer'
import { ctDownRoom, ctLeftRoom, ctRightRoom, ctUpRoom } from '../core/game_constants'
import { pgeFlagActive, uint8Max } from '../core/game_constants'
import { getGameServices } from './game_services'
import { getGameTransientState, getGameWorldState } from './game_state'

export function gamePlaySound(game: Game, num: number, softVol: number) {
    const { mix, res } = getGameServices(game)
    if (num < res.audio.numSfx) {
        const sfx: SoundFx = res.audio.sfxList[num]
        if (sfx.data) {
            const volume = maxVolume >> (2 * softVol)
            mix.play(sfx.data, sfx.len, sfx.freq, volume)
        }
    } else if (num === 66) {
        // open/close inventory (DOS)
    } else if (num >= 68 && num <= 75) {
        // in-game music
        mix.playMusic(num)
    } else if (num === 77) {
        // triggered when Conrad reaches a platform
    } else {
        // console.warn(`Unknown sound num ${num}`)
    }
}

export function gamePlayPgeAnimationSoundEffect(game: Game, pge: LivePGE, arg2: number) {
    const { res } = getGameServices(game)
    const transient = getGameTransientState(game)
    const world = getGameWorldState(game)
    if ((pge.flags & pgeFlagActive) && transient.shouldPlayPgeAnimationSound) {
        const sfxId = (arg2 & uint8Max) - 1
        if (world.currentRoom === pge.roomLocation) {
            gamePlaySound(game, sfxId, 0)
        } else {
            if (res.level.ctData[ctDownRoom + world.currentRoom] === pge.roomLocation ||
                res.level.ctData[ctUpRoom + world.currentRoom] === pge.roomLocation ||
                res.level.ctData[ctRightRoom + world.currentRoom] === pge.roomLocation ||
                res.level.ctData[ctLeftRoom + world.currentRoom] === pge.roomLocation) {
                gamePlaySound(game, sfxId, 1)
            }
        }
    }
}
