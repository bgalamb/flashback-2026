import type { SoundFx, LivePGE } from '../core/intern'
import type { Game } from './game'
import { MAX_VOLUME } from '../audio/mixer'
import { CT_DOWN_ROOM, CT_LEFT_ROOM, CT_RIGHT_ROOM, CT_UP_ROOM } from '../core/game_constants'
import { PGE_FLAG_ACTIVE, UINT8_MAX } from '../core/game_constants'

export function gamePlaySound(game: Game, num: number, softVol: number) {
    if (num < game._res.audio.numSfx) {
        const sfx: SoundFx = game._res.audio.sfxList[num]
        if (sfx.data) {
            const volume = MAX_VOLUME >> (2 * softVol)
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
    if ((pge.flags & PGE_FLAG_ACTIVE) && game._shouldPlayPgeAnimationSound) {
        const sfxId = (arg2 & UINT8_MAX) - 1
        if (game.world.currentRoom === pge.room_location) {
            game.playSound(sfxId, 0)
        } else {
            if (game._res.level.ctData[CT_DOWN_ROOM + game.world.currentRoom] === pge.room_location ||
                game._res.level.ctData[CT_UP_ROOM + game.world.currentRoom] === pge.room_location ||
                game._res.level.ctData[CT_RIGHT_ROOM + game.world.currentRoom] === pge.room_location ||
                game._res.level.ctData[CT_LEFT_ROOM + game.world.currentRoom] === pge.room_location) {
                game.playSound(sfxId, 1)
            }
        }
    }
}
