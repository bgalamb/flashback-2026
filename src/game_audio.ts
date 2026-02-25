import type { SoundFx, LivePGE } from './intern'
import type { Game } from './game'
import { MAX_VOLUME } from './mixer'
import { CT_DOWN_ROOM, CT_LEFT_ROOM, CT_RIGHT_ROOM, CT_UP_ROOM } from './game'
import { PGE_FLAG_ACTIVE } from './game_constants'

export function gamePlaySound(game: Game, num: number, softVol: number) {
    if (num < game._res._numSfx) {
        const sfx: SoundFx = game._res._sfxList[num]
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

export function gamePgePlayAnimSound(game: Game, pge: LivePGE, arg2: number) {
    if ((pge.flags & PGE_FLAG_ACTIVE) && game._pge_playAnimSound) {
        const sfxId = (arg2 & 0xFF) - 1
        if (game._currentRoom === pge.room_location) {
            game.playSound(sfxId, 0)
        } else {
            if (game._res._ctData[CT_DOWN_ROOM + game._currentRoom] === pge.room_location ||
                game._res._ctData[CT_UP_ROOM + game._currentRoom] === pge.room_location ||
                game._res._ctData[CT_RIGHT_ROOM + game._currentRoom] === pge.room_location ||
                game._res._ctData[CT_LEFT_ROOM + game._currentRoom] === pge.room_location) {
                game.playSound(sfxId, 1)
            }
        }
    }
}
