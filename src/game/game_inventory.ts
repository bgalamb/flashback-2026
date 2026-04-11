import type { InventoryItem, LivePGE } from '../core/intern'
import type { Game } from './game'
import { LocaleData } from '../resource/resource'
import { dirDown, dirLeft, dirRight, dirUp } from '../platform/system-port'
import { charW, gamescreenW } from '../core/game_constants'
import { uint16Max, uint8Max } from '../core/game_constants'
import { gamePlaySound } from './game_audio'
import { gameDrawIcon, gameDrawString } from './game_draw'
import { gameDebugLog } from './game_debug'
import { gameChangeStateSlot } from './game_lifecycle'
import { getGameServices } from './game_services'
import { getRuntimeRegistryState } from './game_runtime_data'
import { getGameSessionState, getGameUiState, getGameWorldState } from './game_state'
import { gameInpUpdate } from './game_world'

function getOrCreateInventoryItemsForOwner(game: Game, ownerPge: LivePGE) {
    const runtime = getRuntimeRegistryState(game)
    let inventoryItemIndices = runtime.inventoryItemIndicesByOwner.get(ownerPge.index)
    if (!inventoryItemIndices) {
        inventoryItemIndices = []
        runtime.inventoryItemIndicesByOwner.set(ownerPge.index, inventoryItemIndices)
    }
    return inventoryItemIndices
}

export function gameGetInventoryItemIndices(game: Game, ownerPge: LivePGE) {
    return getOrCreateInventoryItemsForOwner(game, ownerPge)
}

export function gameGetCurrentInventoryItemIndex(game: Game, ownerPge: LivePGE) {
    const inventoryItemIndices = getOrCreateInventoryItemsForOwner(game, ownerPge)
    return inventoryItemIndices.length !== 0 ? inventoryItemIndices[0] : uint8Max
}

export function gameGetNextInventoryItemIndex(game: Game, ownerPge: LivePGE, inventoryItemIndex: number) {
    const inventoryItemIndices = getOrCreateInventoryItemsForOwner(game, ownerPge)
    const currentItemPosition = inventoryItemIndices.indexOf(inventoryItemIndex)
    if (currentItemPosition >= 0 && currentItemPosition + 1 < inventoryItemIndices.length) {
        return inventoryItemIndices[currentItemPosition + 1]
    }
    return uint8Max
}

export function gameFindInventoryItemByObjectId(game: Game, ownerPge: LivePGE, objectId: number) {
    const runtime = getRuntimeRegistryState(game)
    for (const inventoryItemIndex of getOrCreateInventoryItemsForOwner(game, ownerPge)) {
        const inventoryItem = runtime.livePgesByIndex[inventoryItemIndex]
        if (inventoryItem.initPge.objectId === objectId) {
            return inventoryItem
        }
    }
    return null
}


export function gameReorderPgeInventoryLinks(game: Game, pge: LivePGE) {
    const runtime = getRuntimeRegistryState(game)
    if (pge.unkF !== uint8Max) {
        const _bx: LivePGE = runtime.livePgesByIndex[pge.unkF]
        const _di: LivePGE = gameFindInventoryItemBeforePge(game, _bx, pge)
        if (_di === _bx) {
            if (gameGetCurrentInventoryItemIndex(game, _di) === pge.index) {
                gameRemovePgeFromInventoryChain(game, _di, pge, _bx)
            }
        } else {
            if (gameGetNextInventoryItemIndex(game, _bx, _di.index) === pge.index) {
                gameRemovePgeFromInventoryChain(game, _di, pge, _bx)
            }
        }
    }
}

export function gameUpdatePgeInventoryLinks(game: Game, pge1: LivePGE, pge2: LivePGE) {
    if (pge2.unkF !== uint8Max) {
        gameReorderPgeInventoryLinks(game, pge2)
    }

    const _ax: LivePGE = gameFindInventoryItemBeforePge(game, pge1, null)
    gameAddPgeToInventoryChain(game, _ax, pge2, pge1)
}

export async function gameHandleConfigPanel(game: Game) {
    const { menu, res, stub, vid } = getGameServices(game)
    const session = getGameSessionState(game)
    const x = 7
    const y = 10
    const w = 17
    const h = 12

    vid.setTextColors(0xEE, uint8Max, 0xE2)

    // the panel background is drawn using special characters from FB_TXT.FNT
    // top-left rounded corner
    vid.pcDrawchar(0x81, y, x)
    // top-right rounded corner
    vid.pcDrawchar(0x82, y, x + w)
    // bottom-left rounded corner
    vid.pcDrawchar(0x83, y + h, x)
    // bottom-right rounded corner
    vid.pcDrawchar(0x84, y + h, x + w)
    // horizontal lines
    for (let i = 1; i < w; ++i) {
        vid.pcDrawchar(0x85, y, x + i)
        vid.pcDrawchar(0x88, y + h, x + i)
    }
    for (let j = 1; j < h; ++j) {
        vid.setTextTransparentColor(uint8Max)
        // left vertical line
        vid.pcDrawchar(0x86, y + j, x)
        // right vertical line
        vid.pcDrawchar(0x87, y + j, x + w)
        vid.setTextTransparentColor(0xE2)
        for (let i = 1; i < w; ++i) {
            vid.pcDrawchar(0x20, y + j, x + i)
        }
    }

    menu._charVar3 = 0xE4
    menu._charVar4 = 0xE5
    menu._charVar1 = 0xE2
    menu._charVar2 = 0xEE

    vid.fullRefresh()
    const menuItemAbort = 1
    const menuItemLoad = 2
    const menuItemSave = 3
    const colors = [ 2, 3, 3, 3 ]
    let current = 0
    gameDebugLog(game, 'session', `[config-panel] opened stateSlot=${session.stateSlot}`)
    while (!stub.input.quit) {
        menu.drawString(res.getMenuString(LocaleData.Id.li18ResumeGame), y + 2, 9, colors[0])
        menu.drawString(res.getMenuString(LocaleData.Id.li19AbortGame), y + 4, 9, colors[1])
        menu.drawString(res.getMenuString(LocaleData.Id.li20LoadGame), y + 6, 9, colors[2])
        menu.drawString(res.getMenuString(LocaleData.Id.li21SaveGame), y + 8, 9, colors[3])
        vid.fillRect(charW * (x + 1), charW * (y + 10), charW * (w - 2), charW, 0xE2)
        const buf = res.getMenuString(LocaleData.Id.li22SaveSlot) + " < " + session.stateSlot.toString().padStart(2, "0") + " >"
        menu.drawString(buf, y + 10, 9, 1)

        vid.updateScreen()
        await stub.sleep(80)
        await gameInpUpdate(game)

        let prev = current
        if (stub.input.dirMask & dirUp) {
            stub.input.dirMask &= ~dirUp
            current = (current + 3) % 4
        }
        if (stub.input.dirMask & dirDown) {
            stub.input.dirMask &= ~dirDown
            current = (current + 1) % 4
        }
        if (stub.input.dirMask & dirLeft) {
            stub.input.dirMask &= ~dirLeft
            gameChangeStateSlot(game, -1)
        }
        if (stub.input.dirMask & dirRight) {
            stub.input.dirMask &= ~dirRight
            gameChangeStateSlot(game, 1)
        }
        if (prev !== current) {
            const tmp = colors[prev]
            colors[prev] = colors[current]
            colors[current] = tmp
            gameDebugLog(game, 'session', `[config-panel] selection=${current} stateSlot=${session.stateSlot}`)
        }
        if (stub.input.enter) {
            stub.input.enter = false
            switch (current) {
                case menuItemLoad:
                    stub.input.load = true
                    break
                case menuItemSave:
                    stub.input.save = true
                    break
            }
            gameDebugLog(game, 'session', `[config-panel] confirmed selection=${current} load=${stub.input.load} save=${stub.input.save} stateSlot=${session.stateSlot}`)
            break
        }
        if (stub.input.escape) {
            stub.input.escape = false
            gameDebugLog(game, 'session', '[config-panel] closed via escape')
            break
        }
    }
    vid.fullRefresh()
    return (current === menuItemAbort)
}


export async function gameHandleInventory(game: Game) {
    const { res, stub, vid } = getGameServices(game)
    const world = getGameWorldState(game)
    const ui = getGameUiState(game)
    const runtime = getRuntimeRegistryState(game)
    let selectedPge: LivePGE = null
    const pge: LivePGE = runtime.livePgesByIndex[0]
    const inventoryItemIndices = gameGetInventoryItemIndices(game, pge)
    if (pge.life > 0 && inventoryItemIndices.length !== 0) {
        gameDebugLog(game, 'session', `[inventory] opened owner=${pge.index} items=${inventoryItemIndices.join(',')}`)
        gamePlaySound(game, 66, 0)
        const items: InventoryItem[] = new Array(24).fill(null).map(() => ({
            iconNum: 0,
            livePge: null,
            initPge: null,
        }))
        let numItems = 0
        for (const invPge of inventoryItemIndices) {
            items[numItems] = {
                iconNum: res.level.pgeAllInitialStateFromFile[invPge].iconNum,
                initPge: res.level.pgeAllInitialStateFromFile[invPge],
                livePge: runtime.livePgesByIndex[invPge]
            }
            ++numItems
        }
        items[numItems].iconNum = uint8Max
        let currentItem = 0
        const numLines = (((numItems - 1) / 4) >> 0) + 1
        let currentLine = 0
        let displayScore = false
        while (!stub.input.backspace && !stub.input.quit) {
            const iconSprW = 16
            const iconSprH = 16

            let iconNum = 31
            for (let y = 140; y < 140 + 5 * iconSprH; y += iconSprH) {
                for (let x = 56; x < 56 + 9 * iconSprW; x += iconSprW) {
                    gameDrawIcon(game, iconNum, x, y, 0xF)
                    ++iconNum
                }
            }

            if (!displayScore) {
                let iconXPos = 72
                for (let i = 0; i < 4; ++i) {
                    const itemIt = currentLine * 4 + i
                    if (items[itemIt].iconNum === uint8Max) {
                        break
                    }
                    gameDrawIcon(game, items[itemIt].iconNum, iconXPos, 157, 0xC)
                    if (currentItem === itemIt) {
                        gameDrawIcon(game, 76, iconXPos, 157, 0xC)
                        selectedPge = items[itemIt].livePge
                        gameDebugLog(game, 'session', `[inventory] highlight itemIndex=${currentItem} line=${currentLine} pge=${selectedPge.index} icon=${items[itemIt].iconNum} scoreView=${displayScore}`)
                        const txtNum = items[itemIt].initPge.textNum
                        const str = res.getTextString(world.currentLevel, txtNum)
                        gameDrawString(game, str, gamescreenW, 189, 0xED, true)
                        if (items[itemIt].initPge.initFlags & 4) {
                            const buf = selectedPge.life.toString()
                            vid.drawString(buf, ((gamescreenW - buf.length * charW) / 2) >> 0, 197, 0xED)
                        }
                    }
                    iconXPos += 32
                }
                if (currentLine !== 0) {
                    gameDrawIcon(game, 78, 120, 176, 0xC)
                }
                if (currentLine !== numLines - 1) {
                    gameDrawIcon(game, 77, 120, 143, 0xC)
                }
            } else {
                let buf = "SCORE " + ui.score.toString().padStart(8, "0")
                vid.drawString(buf, (((114 - buf.length * charW) / 2) >> 0) + 72, 158, 0xE5)
                buf = res.getMenuString(LocaleData.Id.li06Level) + ":" + res.getMenuString(LocaleData.Id.li13Easy + ui.skillLevel)
                vid.drawString(buf, (((114 - buf.length * charW) / 2) >> 0) + 72, 166, 0xE5)
            }

            await vid.updateScreen()
            await stub.sleep(80)
            await gameInpUpdate(game)

            if (stub.input.dirMask & dirUp) {
                stub.input.dirMask &= ~dirUp
                if (currentLine < numLines - 1) {
                    ++currentLine
                    currentItem = currentLine * 4
                    gameDebugLog(game, 'session', `[inventory] move up line=${currentLine} itemIndex=${currentItem}`)
                }
            }
            if (stub.input.dirMask & dirDown) {
                stub.input.dirMask &= ~dirDown
                if (currentLine > 0) {
                    --currentLine
                    currentItem = currentLine * 4
                    gameDebugLog(game, 'session', `[inventory] move down line=${currentLine} itemIndex=${currentItem}`)
                }
            }
            if (stub.input.dirMask & dirLeft) {
                stub.input.dirMask &= ~dirLeft
                if (currentItem > 0) {
                    const itemNum = currentItem % 4
                    if (itemNum > 0) {
                        --currentItem
                        gameDebugLog(game, 'session', `[inventory] move left itemIndex=${currentItem}`)
                    }
                }
            }
            if (stub.input.dirMask & dirRight) {
                stub.input.dirMask &= ~dirRight
                if (currentItem < numItems - 1) {
                    const itemNum = currentItem % 4
                    if (itemNum < 3) {
                        ++currentItem
                        gameDebugLog(game, 'session', `[inventory] move right itemIndex=${currentItem}`)
                    }
                }
            }
            if (stub.input.enter) {
                stub.input.enter = false
                displayScore = !displayScore
                gameDebugLog(game, 'session', `[inventory] toggled scoreView=${displayScore}`)
            }
        }
        vid.fullRefresh()
        stub.input.backspace = false
        if (selectedPge) {
            gameSetCurrentInventoryPgeSelection(game, selectedPge)
        }
        gameDebugLog(game, 'session', `[inventory] closed selected=${selectedPge?.index ?? 'none'} scoreView=${displayScore}`)
        gamePlaySound(game, 66, 0)
    }
}

export function gameFindInventoryItemBeforePge(game: Game, pge: LivePGE, lastPge: LivePGE) {
    const runtime = getRuntimeRegistryState(game)
    let previousInventoryItemOrOwner: LivePGE = pge
    const inventoryItemIndices = getOrCreateInventoryItemsForOwner(game, pge)

    for (const inventoryItemIndex of inventoryItemIndices) {
        const inventoryItem = runtime.livePgesByIndex[inventoryItemIndex]
        if (inventoryItem === lastPge) {
            break
        }
        previousInventoryItemOrOwner = inventoryItem
    }
    return previousInventoryItemOrOwner
}

export function gameRemovePgeFromInventoryChain(game: Game, pge1: LivePGE, pge2: LivePGE, pge3: LivePGE) {
    const inventoryItemIndices = getOrCreateInventoryItemsForOwner(game, pge3)
    const itemPosition = inventoryItemIndices.indexOf(pge2.index)
    if (itemPosition >= 0) {
        inventoryItemIndices.splice(itemPosition, 1)
    }
    pge2.unkF = uint8Max
}

export function gameAddPgeToInventoryChain(game: Game, pge1: LivePGE, pge2: LivePGE, pge3: LivePGE) {
    const inventoryItemIndices = getOrCreateInventoryItemsForOwner(game, pge3)
    const existingItemPosition = inventoryItemIndices.indexOf(pge2.index)
    if (existingItemPosition >= 0) {
        inventoryItemIndices.splice(existingItemPosition, 1)
    }
    pge2.unkF = pge3.index

    if (pge1 === pge3) {
        inventoryItemIndices.unshift(pge2.index)
    } else {
        const previousItemPosition = inventoryItemIndices.indexOf(pge1.index)
        if (previousItemPosition >= 0) {
            inventoryItemIndices.splice(previousItemPosition + 1, 0, pge2.index)
        } else {
            inventoryItemIndices.push(pge2.index)
        }
    }
}

export function gameSetCurrentInventoryPgeSelection(game: Game, pge: LivePGE) {
    const runtime = getRuntimeRegistryState(game)
    const _bx: LivePGE = gameFindInventoryItemBeforePge(game, runtime.livePgesByIndex[0], pge)
    if (_bx === runtime.livePgesByIndex[0]) {
        if (gameGetCurrentInventoryItemIndex(game, _bx) !== pge.index) {
            return 0
        }
    } else {
        if (gameGetNextInventoryItemIndex(game, runtime.livePgesByIndex[0], _bx.index) !== pge.index) {
            return 0
        }
    }
    gameRemovePgeFromInventoryChain(game, _bx, pge, runtime.livePgesByIndex[0])
    gameAddPgeToInventoryChain(game, runtime.livePgesByIndex[0], pge, runtime.livePgesByIndex[0])
    return uint16Max
}
