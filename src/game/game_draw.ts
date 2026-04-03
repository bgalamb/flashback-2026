import type { AnimBufferState, LivePGE } from '../core/intern'
import type { Game } from './game'
import { maxVolume } from '../audio/mixer'
import { charW, gamescreenH, gamescreenW } from '../core/game_constants'
import { pgeFlagFlipX, pgeFlagSpecialAnim, uint16Max, uint8Max } from '../core/game_constants'
import { gameFindFirstMatchingCollidingObject } from './game_collision'
import { assert } from "../core/assert"
import { gameClearSaveStateCompleted, gameTickRoomOverlay } from './game_lifecycle'
import { gameGetCurrentInventoryItemIndex } from './game_inventory'
import { getGameServices } from './game_services'
import { getGameUiState, getGameWorldState } from './game_state'
import { gameInpUpdate } from './game_world'
import { getRenderDataState, getRuntimeRegistryState } from './game_runtime_data'

const pgeNum = 256

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
        loadVce?: (textId: number, segment: number) => Promise<{ buf: Uint8Array; bufSize: number }>
    }
    if (typeof res.loadVoiceSegment === 'function') {
        return res.loadVoiceSegment(textId, segment)
    }
    return resource.loadVce(textId, segment)
}

export function gameDrawIcon(game: Game, iconNum: number, x: number, y: number, colMask: number) {
    const buf = new Uint8Array(16 * 16)

    game._vid.pcDecodeicn(game._res.ui.icn, iconNum, buf)

    game._vid.drawSpriteSub1ToFrontLayer(buf, x + y * game._vid.layers.w, 16, 16, 16, colMask << 4)
    game._vid.markBlockAsDirty(x, y, 16, 16, 1)
}

export function gameDrawCurrentInventoryItem(game: Game) {
    const world = getGameWorldState(game)
    const src = gameGetCurrentInventoryItemIndex(game, getRuntimeRegistryState(game).livePgesByIndex[0])
    if (src !== uint8Max) {
        world.currentIcon = game._res.level.pgeAllInitialStateFromFile[src].iconNum
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
    let { obj, pgeOut } = gameFindFirstMatchingCollidingObject(game, pge, 3, uint8Max, uint8Max)
    if (obj === 0) {
        const res = gameFindFirstMatchingCollidingObject(game, pgeOut, uint8Max, 5, 9)
        obj = res.obj
        pgeOut = res.pgeOut
    }
    if (obj > 0) {
        world.printLevelCodeCounter = 0
        if (world.textToDisplay === uint16Max) {
            const iconNum = obj - 1
            game.drawIcon(iconNum, 80, 8, 0xC)
            const txtNum = pgeOut.initPge.textNum % pgeNum
            const str = game._res.getTextString(world.currentLevel, txtNum)
            game.drawString(str, 176, 26, 0xE6, true)
            if (iconNum === 2) {
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
    if (world.textToDisplay !== uint16Max) {
        console.log(`[story-text] start frame=${game.renders} currentRoom=${world.currentRoom} text=${world.textToDisplay} inventoryIcon=${ui.currentInventoryIconNum}`)
        let textColor = 0xE8
        let str = game._res.getGameString(world.textToDisplay)
        let index = 0
        game._vid.copyFrontLayerToTemp()
        let textSpeechSegment = 0
        while (!game._stub._pi.quit) {
            console.log(`[story-text] segment frame=${game.renders} currentRoom=${world.currentRoom} text=${world.textToDisplay} segment=${textSpeechSegment} charIndex=${index}`)
            const storyIconNum = Number.isInteger(ui.currentInventoryIconNum) ? ui.currentInventoryIconNum : uint8Max
            if (storyIconNum === uint8Max) {
                console.warn(`[story-text] missing inventory icon frame=${game.renders} currentRoom=${world.currentRoom} text=${world.textToDisplay}; skipping story icon draw`)
            } else {
                console.log(`[story-text] draw icon frame=${game.renders} icon=${storyIconNum}`)
                game.drawIcon(storyIconNum, 80, 8, 0xC)
            }
            let yPos = 26

            if (str[index] === uint8Max) {
                textColor = str[index + 1]
                index += 3
                console.log(`[story-text] control-prefix textColor=${textColor} nextIndex=${index}`)
            }

            while (1) {
                const remaining = str.subarray(index)
                const len = getLineLength(remaining)
                const line = remaining.subarray(0, len)
                console.log(`[story-text] draw line len=${len} y=${yPos} firstByte=${str[index]} index=${index}`)
                game._vid.drawString(new TextDecoder().decode(line), ((176 - len * charW) / 2) >> 0, yPos, textColor)

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
                game._mix.play(voiceSegmentData, voiceSegmentLen, 32000, maxVolume)
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
                await game.inpUpdate()
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
        world.textToDisplay = uint16Max
    }
}

export function gameDrawString(game: Game, p: Uint8Array, x: number, y: number, color: number, hcenter: boolean) {
    const str = new TextDecoder().decode(p).split('\u0000')[0]
    let len = 0

    len = str.length
    if (hcenter) {
        x = ((x - len * charW) / 2) >> 0
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

    if (lastPos !== uint8Max) {
        let index = lastPos
        let numAnims = lastPos + 1
        render.animBuffers._curPos[stateNum] = uint8Max
        do {
            const pge: LivePGE = state[index].pge
            if (!(pge.flags & pgeFlagSpecialAnim)) {
                if (stateNum === 1 && (getGameWorldState(game).blinkingConradCounter & 1)) {
                    break
                }

                const ptr = state[index].dataPtr
                const val = new DataView(ptr.buffer, ptr.byteOffset - 2).getUint8(0)
                if (!(val & 0x80)) {
                    game._vid.pcDecodespm(state[index].dataPtr, game._res.scratchBuffer)
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
    const paletteColorMaskOverride = (pge.initPge.objectType === 6 || pge.initPge.objectType === 7 || pge.initPge.objectType === 8) ? 0x60 : -1
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
    if (flags & pgeFlagFlipX) {
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

    let spriteY = y + dataPtr[2]
    let spriteX: number
    if (flags & pgeFlagFlipX) {
        spriteX = x - dataPtr[1] - (((dataPtr[3] & 0xC) + 4) * 2)
    } else {
        spriteX = x + dataPtr[1]
    }

    let spriteFlags = dataPtr[3]
    if (flags & pgeFlagFlipX) {
        spriteFlags ^= 0x10
    }

    const spriteH = (((spriteFlags >> 0) & 3) + 1) * 8
    const spriteW = (((spriteFlags >> 2) & 3) + 1) * 8

    game._vid.pcDecodespc(new Uint8Array(bankDataPtr.buffer, src), spriteW, spriteH, game._res.scratchBuffer)

    src = game._res.scratchBuffer.byteOffset
    let spriteMirrorX = false
    let spriteClippedW: number
    if (spriteX >= 0) {
        spriteClippedW = spriteX + spriteW
        if (spriteClippedW < gamescreenW) {
            spriteClippedW = spriteW
        } else {
            spriteClippedW = gamescreenW - spriteX
            if (spriteFlags & 0x10) {
                spriteMirrorX = true
                src += spriteW - 1
            }
        }
    } else {
        spriteClippedW = spriteX + spriteW
        if (!(spriteFlags & 0x10)) {
            src -= spriteX
            spriteX = 0
        } else {
            spriteMirrorX = true
            src += spriteX + spriteW - 1
            spriteX = 0
        }
    }
    if (spriteClippedW <= 0) {
        return
    }

    let spriteClippedH : number
    if (spriteY >= 0) {
        spriteClippedH = gamescreenH - spriteH
        if (spriteY < spriteClippedH) {
            spriteClippedH = spriteH
        } else {
            spriteClippedH = gamescreenH - spriteY
        }
    } else {
        spriteClippedH = spriteH + spriteY
        src -= spriteW * spriteY
        spriteY = 0
    }
    if (spriteClippedH <= 0) {
        return
    }

    if (!spriteMirrorX && (spriteFlags & 0x10)) {
        src += spriteW - 1
    }

    const dstOffset = gamescreenW * spriteY + spriteX
    const spriteColMask = paletteColorMaskOverride >= 0 ? paletteColorMaskOverride : ((flags & 0x60) >> 1)

    if (getGameWorldState(game).eraseBackground) {
        if (!(spriteFlags & 0x10)) {
            game._vid.drawSpriteSub1ToFrontLayer(new Uint8Array(game._res.scratchBuffer.buffer, src), dstOffset, spriteW, spriteClippedH, spriteClippedW, spriteColMask)
        } else {
            game._vid.drawSpriteSub2ToFrontLayer(new Uint8Array(game._res.scratchBuffer.buffer, src), dstOffset, spriteW, spriteClippedH, spriteClippedW, spriteColMask)
        }
    } else {
        if (!(spriteFlags & 0x10)) {
            game._vid.drawSpriteSub3ToFrontLayer(new Uint8Array(game._res.scratchBuffer.buffer, src), dstOffset, spriteW, spriteClippedH, spriteClippedW, spriteColMask)
        } else {
            game._vid.drawSpriteSub4ToFrontLayer(new Uint8Array(game._res.scratchBuffer.buffer, src), dstOffset, spriteW, spriteClippedH, spriteClippedW, spriteColMask)
        }
    }
    game._vid.markBlockAsDirty(spriteX, spriteY, spriteClippedW, spriteClippedH, 1)
}

export function gameDrawCharacter(game: Game, dataPtr: Uint8Array, posX: number, posY: number, a: number, b: number, flags: number, paletteColorMaskOverride: number = -1) {
    let var16 = false
    if (b & 0x40) {
        b &= 0xBF
        const temp = a
        a = b
        b = temp
        var16 = true
    }
    const spriteH = a
    const spriteW = b

    let src = dataPtr.byteOffset
    let var14 = false

    let spriteClippedW : number
    if (posX >= 0) {
        if (posX + spriteW < gamescreenW) {
            spriteClippedW = spriteW
        } else {
            spriteClippedW = gamescreenW - posX
            if (flags & pgeFlagFlipX) {
                var14 = true
                if (var16) {
                    src += (spriteW - 1) * spriteH
                } else {
                    src += spriteW - 1
                }
            }
        }
    } else {
        spriteClippedW = posX + spriteW
        if (!(flags & pgeFlagFlipX)) {
            if (var16) {
                src -= spriteH * posX
                posX = 0
            } else {
                src -= posX
                posX = 0
            }
        } else {
            var14 = true
            if (var16) {
                src += spriteH * (posX + spriteW - 1)
                posX = 0
            } else {
                src += posX + spriteW - 1
                var14 = true
                posX = 0
            }
        }
    }
    if (spriteClippedW <= 0) {
        return
    }

    let spriteClippedH : number
    if (posY >= 0) {
        if (posY < gamescreenH - spriteH) {
            spriteClippedH = spriteH
        } else {
            spriteClippedH = gamescreenH - posY
        }
    } else {
        spriteClippedH = spriteH + posY
        if (var16) {
            src -= posY
        } else {
            src -= spriteW * posY
        }
        posY = 0
    }
    if (spriteClippedH <= 0) {
        return
    }

    if (!var14 && (flags & pgeFlagFlipX)) {
        if (var16) {
            src += spriteH * (spriteW - 1)
        } else {
            src += spriteW - 1
        }
    }

    const dstOffset = gamescreenW * posY + posX
    const spriteColMask = paletteColorMaskOverride >= 0 ? paletteColorMaskOverride : (((flags & 0x60) === 0x60) ? 0x50 : 0x40)

    if (!(flags & pgeFlagFlipX)) {
        if (var16) {
            game._vid.drawSpriteSub5ToFrontLayer(new Uint8Array(dataPtr.buffer, src), dstOffset, spriteH, spriteClippedH, spriteClippedW, spriteColMask)
        } else {
            game._vid.drawSpriteSub3ToFrontLayer(new Uint8Array(dataPtr.buffer, src), dstOffset, spriteW, spriteClippedH, spriteClippedW, spriteColMask)
        }
    } else {
        if (var16) {
            game._vid.drawSpriteSub6ToFrontLayer(new Uint8Array(dataPtr.buffer, src), dstOffset, spriteH, spriteClippedH, spriteClippedW, spriteColMask)
        } else {
            game._vid.drawSpriteSub4ToFrontLayer(new Uint8Array(dataPtr.buffer, src), dstOffset, spriteW, spriteClippedH, spriteClippedW, spriteColMask)
        }
    }
    game._vid.markBlockAsDirty(posX, posY, spriteClippedW, spriteClippedH, 1)
}
