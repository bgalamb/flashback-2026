import type { AnimBufferState, LivePGE } from '../core/intern'
import type { Game } from './game'
import { MAX_VOLUME } from '../audio/mixer'
import { CHAR_W, GAMESCREEN_H, GAMESCREEN_W } from '../core/game_constants'
import { PGE_FLAG_FLIP_X, PGE_FLAG_SPECIAL_ANIM, UINT16_MAX, UINT8_MAX } from '../core/game_constants'
import { gameFindFirstMatchingCollidingObject } from './game_collision'
import { assert } from "../core/assert"
import { gameClearSaveStateCompleted, gameTickRoomOverlay } from './game_lifecycle'
import { gameGetCurrentInventoryItemIndex } from './game_inventory'
import { getGameServices } from './game_services'
import { getGameUiState, getGameWorldState } from './game_state'
import { gameInpUpdate } from './game_world'
import { getRenderDataState, getRuntimeRegistryState } from './game_runtime_data'

const PGE_NUM = 256

function getLineLength(str: Uint8Array) {
    let len = 0
    let index = 0
    while (str[index] && str[index] !== 0xB && str[index] !== 0xA) {
        ++index
        ++len
    }
    return len
}

async function gameLoadVoiceSegment(game: Game, textId: number, segment: number) {
    const { res } = getGameServices(game)
    const resource = res as typeof res & {
        load_VCE?: (textId: number, segment: number) => Promise<{ buf: Uint8Array; bufSize: number }>
    }
    if (typeof res.loadVoiceSegment === 'function') {
        return res.loadVoiceSegment(textId, segment)
    }
    return resource.load_VCE(textId, segment)
}

export function gameDrawIcon(game: Game, iconNum: number, x: number, y: number, colMask: number) {
    const buf = new Uint8Array(16 * 16)

    game._vid.PC_decodeIcn(game._res.ui.icn, iconNum, buf)

    game._vid.drawSpriteSub1ToFrontLayer(buf, x + y * game._vid.layers.w, 16, 16, 16, colMask << 4)
    game._vid.markBlockAsDirty(x, y, 16, 16, 1)
}

export function gameDrawCurrentInventoryItem(game: Game) {
    const world = getGameWorldState(game)
    const src = gameGetCurrentInventoryItemIndex(game, getRuntimeRegistryState(game).livePgesByIndex[0])
    if (src !== UINT8_MAX) {
        world.currentIcon = game._res.level.pgeAllInitialStateFromFile[src].icon_num
        game.drawIcon(world.currentIcon, 232, 8, 0xC)
    }
}

export function gameDrawCurrentRoomOverlay(game: Game) {
    const ui = getGameUiState(game)
    const world = getGameWorldState(game)
    if (ui.currentRoomOverlayCounter <= 0 || world.currentRoom < 0 || world.currentRoom >= 0x40) {
        return
    }
    game._vid.drawString(`ROOM ${world.currentRoom}`, 8, 8, 0xE6)
    gameTickRoomOverlay(game)
}

export function gameDrawLevelTexts(game: Game) {
    const world = getGameWorldState(game)
    const ui = getGameUiState(game)
    const pge: LivePGE = getRuntimeRegistryState(game).livePgesByIndex[0]
    let { obj, pge_out } = gameFindFirstMatchingCollidingObject(game, pge, 3, UINT8_MAX, UINT8_MAX)
    if (obj === 0) {
        const res = gameFindFirstMatchingCollidingObject(game, pge_out, UINT8_MAX, 5, 9)
        obj = res.obj
        pge_out = res.pge_out
    }
    if (obj > 0) {
        world.printLevelCodeCounter = 0
        if (world.textToDisplay === UINT16_MAX) {
            const icon_num = obj - 1
            game.drawIcon(icon_num, 80, 8, 0xC)
            const txt_num = pge_out.init_PGE.text_num % PGE_NUM
            const str = game._res.getTextString(world.currentLevel, txt_num)
            game.drawString(str, 176, 26, 0xE6, true)
            if (icon_num === 2) {
                game.printSaveStateCompleted()
                return
            }
        } else {
            ui.currentInventoryIconNum = obj - 1
        }
    }
    gameClearSaveStateCompleted(game)
}

export async function gameDrawStoryTexts(game: Game) {
    const world = getGameWorldState(game)
    const ui = getGameUiState(game)
    if (world.textToDisplay !== UINT16_MAX) {
        console.log(`[story-text] start frame=${game.renders} currentRoom=${world.currentRoom} text=${world.textToDisplay} inventoryIcon=${ui.currentInventoryIconNum}`)
        let textColor = 0xE8
        let str = game._res.getGameString(world.textToDisplay)
        let index = 0
        game._vid.copyFrontLayerToTemp()
        let textSpeechSegment = 0
        while (!game._stub._pi.quit) {
            console.log(`[story-text] segment frame=${game.renders} currentRoom=${world.currentRoom} text=${world.textToDisplay} segment=${textSpeechSegment} charIndex=${index}`)
            const storyIconNum = Number.isInteger(ui.currentInventoryIconNum) ? ui.currentInventoryIconNum : UINT8_MAX
            if (storyIconNum === UINT8_MAX) {
                console.warn(`[story-text] missing inventory icon frame=${game.renders} currentRoom=${world.currentRoom} text=${world.textToDisplay}; skipping story icon draw`)
            } else {
                console.log(`[story-text] draw icon frame=${game.renders} icon=${storyIconNum}`)
                game.drawIcon(storyIconNum, 80, 8, 0xC)
            }
            let yPos = 26

            if (str[index] === UINT8_MAX) {
                textColor = str[index + 1]
                index += 3
                console.log(`[story-text] control-prefix textColor=${textColor} nextIndex=${index}`)
            }

            while (1) {
                const remaining = str.subarray(index)
                const len = getLineLength(remaining)
                const line = remaining.subarray(0, len)
                console.log(`[story-text] draw line len=${len} y=${yPos} firstByte=${str[index]} index=${index}`)
                game._vid.drawString(new TextDecoder().decode(line), ((176 - len * CHAR_W) / 2) >> 0, yPos, textColor)

                index += len
                const terminator = str[index]
                console.log(`[story-text] line terminator=${terminator} nextIndex=${index}`)
                if (terminator === 0 || terminator === 0xB) {
                    break
                }
                if (terminator !== 0xA) {
                    console.warn(`[story-text] unexpected line terminator=${terminator} at index=${index} for text=${world.textToDisplay}`)
                    break
                }
                index++
                yPos += 8
            }
            let voiceSegmentData: Uint8Array = null
            let voiceSegmentLen = 0
            const res = await gameLoadVoiceSegment(game, world.textToDisplay, textSpeechSegment++)
            voiceSegmentData = res.buf
            voiceSegmentLen = res.bufSize
            console.log(`[story-text] voice frame=${game.renders} text=${world.textToDisplay} hasVoice=${!!voiceSegmentData} voiceLen=${voiceSegmentLen}`)
            if (voiceSegmentData) {
                game._mix.play(voiceSegmentData, voiceSegmentLen, 32000, MAX_VOLUME)
            }
            await game._vid.updateScreen()
            if (!voiceSegmentData) {
                console.log(`[story-text] waiting for input without voice frame=${game.renders} text=${world.textToDisplay}`)
            }
            while (!game._stub._pi.backspace && !game._stub._pi.quit) {
                if (voiceSegmentData && !game._mix.isPlaying(voiceSegmentData)) {
                    console.log(`[story-text] voice finished frame=${game.renders} text=${world.textToDisplay}`)
                    break
                }
                await game.inp_update()
                await game._stub.sleep(80)
            }
            if (voiceSegmentData) {
                game._mix.stopAll()
            }
            game._stub._pi.backspace = false

            if (str[index] === 0) {
                break
            }
            index++

            game._vid.restoreFrontLayerFromTemp()
        }
        console.log(`[story-text] end frame=${game.renders} currentRoom=${world.currentRoom} text=${world.textToDisplay}`)
        world.textToDisplay = UINT16_MAX
    }
}

export function gameDrawString(game: Game, p: Uint8Array, x: number, y: number, color: number, hcenter: boolean) {
    const str = new TextDecoder().decode(p).split('\u0000')[0]
    let len = 0

    len = str.length
    if (hcenter) {
        x = ((x - len * CHAR_W) / 2) >> 0
    }

    game._vid.drawStringLen(str, len, x, y, color)
}

export async function gameDrawAnims(game: Game) {
    const world = getGameWorldState(game)
    const render = getRenderDataState(game)
    world.eraseBackground = false
    await game.drawAnimBuffer(2, render.animBuffer2State)
    await game.drawAnimBuffer(1, render.animBuffer1State)
    await game.drawAnimBuffer(0, render.animBuffer0State)
    world.eraseBackground = true
    await game.drawAnimBuffer(3, render.animBuffer3State)
}

export async function gameDrawAnimBuffer(game: Game, stateNum: number, state: AnimBufferState[]) {
    assert(!(stateNum >= 4), `Assertion failed: ${stateNum} < 4`)
    const render = getRenderDataState(game)
    render.animBuffers._states[stateNum] = state
    const lastPos = render.animBuffers._curPos[stateNum]

    if (lastPos !== UINT8_MAX) {
        let index = lastPos
        let numAnims = lastPos + 1
        render.animBuffers._curPos[stateNum] = UINT8_MAX
        do {
            const pge: LivePGE = state[index].pge
            if (!(pge.flags & PGE_FLAG_SPECIAL_ANIM)) {
                if (stateNum === 1 && (getGameWorldState(game).blinkingConradCounter & 1)) {
                    break
                }

                const ptr = state[index].dataPtr
                const val = new DataView(ptr.buffer, ptr.byteOffset - 2).getUint8(0)
                if (!(val & 0x80)) {
                    game._vid.PC_decodeSpm(state[index].dataPtr, game._res.scratchBuffer)
                    game.drawCharacter(game._res.scratchBuffer, state[index].x, state[index].y, state[index].h, state[index].w, pge.flags, state[index].paletteColorMaskOverride)
                } else {
                    game.drawCharacter(state[index].dataPtr, state[index].x, state[index].y, state[index].h, state[index].w, pge.flags, state[index].paletteColorMaskOverride)
                }
            } else {
                game.drawPge(state[index])
            }
            index--
        } while (--numAnims !== 0)
    }
}

export function gameDrawPge(game: Game, state: AnimBufferState) {
    const pge: LivePGE = state.pge
    const paletteColorMaskOverride = (pge.init_PGE.object_type === 6 || pge.init_PGE.object_type === 7 || pge.init_PGE.object_type === 8) ? 0x60 : -1
    game.drawObject(state.dataPtr, state.x, state.y, pge.flags, paletteColorMaskOverride)
}

export function gameDrawObject(game: Game, dataPtr: Uint8Array, x: number, y: number, flags: number, paletteColorMaskOverride: number = -1) {
    assert(!(dataPtr[0] >= 0x4A), `Assertion failed: ${dataPtr[0]} < 0x4A`)
    const slot = game._res.ui.rp[dataPtr[0]]
    let data = game._res.findBankData(slot)
    if (data === null) {
        data = game._res.loadBankData(slot)
    }
    const posy = y - (dataPtr[2] << 24 >> 24)
    let posx = x
    if (flags & PGE_FLAG_FLIP_X) {
        posx = posx + (dataPtr[1] << 24 >> 24)
    } else {
        posx = posx - (dataPtr[1] << 24 >> 24)
    }
    const count = dataPtr[5]
    dataPtr = dataPtr.subarray(6)

    for (let i = 0; i < count; ++i) {
        game.drawObjectFrame(data, dataPtr, posx, posy, flags, paletteColorMaskOverride)
        dataPtr = dataPtr.subarray(4)
    }
}

export function gameDrawObjectFrame(game: Game, bankDataPtr: Uint8Array, dataPtr: Uint8Array, x: number, y: number, flags: number, paletteColorMaskOverride: number = -1) {
    let src = bankDataPtr.byteOffset + dataPtr[0] * 32

    let sprite_y = y + dataPtr[2]
    let sprite_x: number
    if (flags & PGE_FLAG_FLIP_X) {
        sprite_x = x - dataPtr[1] - (((dataPtr[3] & 0xC) + 4) * 2)
    } else {
        sprite_x = x + dataPtr[1]
    }

    let sprite_flags = dataPtr[3]
    if (flags & PGE_FLAG_FLIP_X) {
        sprite_flags ^= 0x10
    }

    const sprite_h = (((sprite_flags >> 0) & 3) + 1) * 8
    const sprite_w = (((sprite_flags >> 2) & 3) + 1) * 8

    game._vid.PC_decodeSpc(new Uint8Array(bankDataPtr.buffer, src), sprite_w, sprite_h, game._res.scratchBuffer)

    src = game._res.scratchBuffer.byteOffset
    let sprite_mirror_x = false
    let sprite_clipped_w: number
    if (sprite_x >= 0) {
        sprite_clipped_w = sprite_x + sprite_w
        if (sprite_clipped_w < GAMESCREEN_W) {
            sprite_clipped_w = sprite_w
        } else {
            sprite_clipped_w = GAMESCREEN_W - sprite_x
            if (sprite_flags & 0x10) {
                sprite_mirror_x = true
                src += sprite_w - 1
            }
        }
    } else {
        sprite_clipped_w = sprite_x + sprite_w
        if (!(sprite_flags & 0x10)) {
            src -= sprite_x
            sprite_x = 0
        } else {
            sprite_mirror_x = true
            src += sprite_x + sprite_w - 1
            sprite_x = 0
        }
    }
    if (sprite_clipped_w <= 0) {
        return
    }

    let sprite_clipped_h : number
    if (sprite_y >= 0) {
        sprite_clipped_h = GAMESCREEN_H - sprite_h
        if (sprite_y < sprite_clipped_h) {
            sprite_clipped_h = sprite_h
        } else {
            sprite_clipped_h = GAMESCREEN_H - sprite_y
        }
    } else {
        sprite_clipped_h = sprite_h + sprite_y
        src -= sprite_w * sprite_y
        sprite_y = 0
    }
    if (sprite_clipped_h <= 0) {
        return
    }

    if (!sprite_mirror_x && (sprite_flags & 0x10)) {
        src += sprite_w - 1
    }

    const dst_offset = GAMESCREEN_W * sprite_y + sprite_x
    const sprite_col_mask = paletteColorMaskOverride >= 0 ? paletteColorMaskOverride : ((flags & 0x60) >> 1)

    if (getGameWorldState(game).eraseBackground) {
        if (!(sprite_flags & 0x10)) {
            game._vid.drawSpriteSub1ToFrontLayer(new Uint8Array(game._res.scratchBuffer.buffer, src), dst_offset, sprite_w, sprite_clipped_h, sprite_clipped_w, sprite_col_mask)
        } else {
            game._vid.drawSpriteSub2ToFrontLayer(new Uint8Array(game._res.scratchBuffer.buffer, src), dst_offset, sprite_w, sprite_clipped_h, sprite_clipped_w, sprite_col_mask)
        }
    } else {
        if (!(sprite_flags & 0x10)) {
            game._vid.drawSpriteSub3ToFrontLayer(new Uint8Array(game._res.scratchBuffer.buffer, src), dst_offset, sprite_w, sprite_clipped_h, sprite_clipped_w, sprite_col_mask)
        } else {
            game._vid.drawSpriteSub4ToFrontLayer(new Uint8Array(game._res.scratchBuffer.buffer, src), dst_offset, sprite_w, sprite_clipped_h, sprite_clipped_w, sprite_col_mask)
        }
    }
    game._vid.markBlockAsDirty(sprite_x, sprite_y, sprite_clipped_w, sprite_clipped_h, 1)
}

export function gameDrawCharacter(game: Game, dataPtr: Uint8Array, pos_x: number, pos_y: number, a: number, b: number, flags: number, paletteColorMaskOverride: number = -1) {
    let var16 = false
    if (b & 0x40) {
        b &= 0xBF
        const temp = a
        a = b
        b = temp
        var16 = true
    }
    const sprite_h = a
    const sprite_w = b

    let src = dataPtr.byteOffset
    let var14 = false

    let sprite_clipped_w : number
    if (pos_x >= 0) {
        if (pos_x + sprite_w < GAMESCREEN_W) {
            sprite_clipped_w = sprite_w
        } else {
            sprite_clipped_w = GAMESCREEN_W - pos_x
            if (flags & PGE_FLAG_FLIP_X) {
                var14 = true
                if (var16) {
                    src += (sprite_w - 1) * sprite_h
                } else {
                    src += sprite_w - 1
                }
            }
        }
    } else {
        sprite_clipped_w = pos_x + sprite_w
        if (!(flags & PGE_FLAG_FLIP_X)) {
            if (var16) {
                src -= sprite_h * pos_x
                pos_x = 0
            } else {
                src -= pos_x
                pos_x = 0
            }
        } else {
            var14 = true
            if (var16) {
                src += sprite_h * (pos_x + sprite_w - 1)
                pos_x = 0
            } else {
                src += pos_x + sprite_w - 1
                var14 = true
                pos_x = 0
            }
        }
    }
    if (sprite_clipped_w <= 0) {
        return
    }

    let sprite_clipped_h : number
    if (pos_y >= 0) {
        if (pos_y < GAMESCREEN_H - sprite_h) {
            sprite_clipped_h = sprite_h
        } else {
            sprite_clipped_h = GAMESCREEN_H - pos_y
        }
    } else {
        sprite_clipped_h = sprite_h + pos_y
        if (var16) {
            src -= pos_y
        } else {
            src -= sprite_w * pos_y
        }
        pos_y = 0
    }
    if (sprite_clipped_h <= 0) {
        return
    }

    if (!var14 && (flags & PGE_FLAG_FLIP_X)) {
        if (var16) {
            src += sprite_h * (sprite_w - 1)
        } else {
            src += sprite_w - 1
        }
    }

    const dst_offset = GAMESCREEN_W * pos_y + pos_x
    const sprite_col_mask = paletteColorMaskOverride >= 0 ? paletteColorMaskOverride : (((flags & 0x60) === 0x60) ? 0x50 : 0x40)

    if (!(flags & PGE_FLAG_FLIP_X)) {
        if (var16) {
            game._vid.drawSpriteSub5ToFrontLayer(new Uint8Array(dataPtr.buffer, src), dst_offset, sprite_h, sprite_clipped_h, sprite_clipped_w, sprite_col_mask)
        } else {
            game._vid.drawSpriteSub3ToFrontLayer(new Uint8Array(dataPtr.buffer, src), dst_offset, sprite_w, sprite_clipped_h, sprite_clipped_w, sprite_col_mask)
        }
    } else {
        if (var16) {
            game._vid.drawSpriteSub6ToFrontLayer(new Uint8Array(dataPtr.buffer, src), dst_offset, sprite_h, sprite_clipped_h, sprite_clipped_w, sprite_col_mask)
        } else {
            game._vid.drawSpriteSub4ToFrontLayer(new Uint8Array(dataPtr.buffer, src), dst_offset, sprite_w, sprite_clipped_h, sprite_clipped_w, sprite_col_mask)
        }
    }
    game._vid.markBlockAsDirty(pos_x, pos_y, sprite_clipped_w, sprite_clipped_h, 1)
}
