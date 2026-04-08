import type { SoundFx, LivePGE } from '../core/intern'
import type { Game } from './game'
import { maxVolume } from '../audio/mixer'
import { ctDownRoom, ctLeftRoom, ctRightRoom, ctUpRoom } from '../core/game_constants'
import { pgeFlagActive, uint8Max } from '../core/game_constants'

export function gamePlaySound(game: Game, num: number, softVol: number) {
    if (num < game._res.audio.numSfx) {
        const sfx: SoundFx = game._res.audio.sfxList[num]
        if (sfx.data) {
            const volume = maxVolume >> (2 * softVol)
            game._mix.play(sfx.data, sfx.len, sfx.freq, volume)
        }
    } else if (num === 66) {
        // open/close inventory (DOS)
    } else if (num >= 68 && num <= 75) {
        // in-game music
        game._mix.playMusic(num)
    } else if (num === 77) {
        // triggered when Conrad reaches a platform
    } else {
        // console.warn(`Unknown sound num ${num}`)
    }
}

export function gamePlayPgeAnimationSoundEffect(game: Game, pge: LivePGE, arg2: number) {
    if ((pge.flags & pgeFlagActive) && game._shouldPlayPgeAnimationSound) {
        const sfxId = (arg2 & uint8Max) - 1
        if (game.world.currentRoom === pge.roomLocation) {
            game.playSound(sfxId, 0)
        } else {
            if (game._res.level.ctData[ctDownRoom + game.world.currentRoom] === pge.roomLocation ||
                game._res.level.ctData[ctUpRoom + game.world.currentRoom] === pge.roomLocation ||
                game._res.level.ctData[ctRightRoom + game.world.currentRoom] === pge.roomLocation ||
                game._res.level.ctData[ctLeftRoom + game.world.currentRoom] === pge.roomLocation) {
                game.playSound(sfxId, 1)
            }
        }
    }
}
