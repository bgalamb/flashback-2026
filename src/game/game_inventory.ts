import type { InventoryItem, LivePGE } from '../core/intern'
import type { Game } from './game'
import { LocaleData } from '../resource/resource'
import { dirDown, dirLeft, dirRight, dirUp } from '../platform/systemstub_web'
import { charW, gamescreenW } from '../core/game_constants'
import { uint16Max, uint8Max } from '../core/game_constants'
import { gameChangeStateSlot } from './game_lifecycle'
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
    const session = getGameSessionState(game)
    const x = 7
    const y = 10
    const w = 17
    const h = 12

    game._vid.setTextColors(0xEE, uint8Max, 0xE2)

    // the panel background is drawn using special characters from FB_TXT.FNT
    // top-left rounded corner
    game._vid.pcDrawchar(0x81, y, x)
    // top-right rounded corner
    game._vid.pcDrawchar(0x82, y, x + w)
    // bottom-left rounded corner
    game._vid.pcDrawchar(0x83, y + h, x)
    // bottom-right rounded corner
    game._vid.pcDrawchar(0x84, y + h, x + w)
    // horizontal lines
    for (let i = 1; i < w; ++i) {
        game._vid.pcDrawchar(0x85, y, x + i)
        game._vid.pcDrawchar(0x88, y + h, x + i)
    }
    for (let j = 1; j < h; ++j) {
        game._vid.setTextTransparentColor(uint8Max)
        // left vertical line
        game._vid.pcDrawchar(0x86, y + j, x)
        // right vertical line
        game._vid.pcDrawchar(0x87, y + j, x + w)
        game._vid.setTextTransparentColor(0xE2)
        for (let i = 1; i < w; ++i) {
            game._vid.pcDrawchar(0x20, y + j, x + i)
        }
    }

    game._menu._charVar3 = 0xE4
    game._menu._charVar4 = 0xE5
    game._menu._charVar1 = 0xE2
    game._menu._charVar2 = 0xEE

    game._vid.fullRefresh()
    const menuItemAbort = 1
    const menuItemLoad = 2
    const menuItemSave = 3
    const colors = [ 2, 3, 3, 3 ]
    let current = 0
    while (!game._stub._pi.quit) {
        game._menu.drawString(game._res.getMenuString(LocaleData.Id.li18ResumeGame), y + 2, 9, colors[0])
        game._menu.drawString(game._res.getMenuString(LocaleData.Id.li19AbortGame), y + 4, 9, colors[1])
        game._menu.drawString(game._res.getMenuString(LocaleData.Id.li20LoadGame), y + 6, 9, colors[2])
        game._menu.drawString(game._res.getMenuString(LocaleData.Id.li21SaveGame), y + 8, 9, colors[3])
        game._vid.fillRect(charW * (x + 1), charW * (y + 10), charW * (w - 2), charW, 0xE2)
        const buf = game._res.getMenuString(LocaleData.Id.li22SaveSlot) + " < " + session.stateSlot.toString().padStart(2, "0") + " >"
        game._menu.drawString(buf, y + 10, 9, 1)

        game._vid.updateScreen()
        await game._stub.sleep(80)
        await game.inpUpdate()

        let prev = current
        if (game._stub._pi.dirMask & dirUp) {
            game._stub._pi.dirMask &= ~dirUp
            current = (current + 3) % 4
        }
        if (game._stub._pi.dirMask & dirDown) {
            game._stub._pi.dirMask &= ~dirDown
            current = (current + 1) % 4
        }
        if (game._stub._pi.dirMask & dirLeft) {
            game._stub._pi.dirMask &= ~dirLeft
            gameChangeStateSlot(game, -1)
        }
        if (game._stub._pi.dirMask & dirRight) {
            game._stub._pi.dirMask &= ~dirRight
            gameChangeStateSlot(game, 1)
        }
        if (prev !== current) {
            const tmp = colors[prev]
            colors[prev] = colors[current]
            colors[current] = tmp
        }
        if (game._stub._pi.enter) {
            game._stub._pi.enter = false
            switch (current) {
                case menuItemLoad:
                    game._stub._pi.load = true
                    break
                case menuItemSave:
                    game._stub._pi.save = true
                    break
            }
            break
        }
        if (game._stub._pi.escape) {
            game._stub._pi.escape = false
            break
        }
    }
    game._vid.fullRefresh()
    return (current === menuItemAbort)
}


export async function gameHandleInventory(game: Game) {
    const world = getGameWorldState(game)
    const ui = getGameUiState(game)
    const runtime = getRuntimeRegistryState(game)
    let selectedPge: LivePGE = null
    const pge: LivePGE = runtime.livePgesByIndex[0]
    const inventoryItemIndices = gameGetInventoryItemIndices(game, pge)
    if (pge.life > 0 && inventoryItemIndices.length !== 0) {
        game.playSound(66, 0)
        const items: InventoryItem[] = new Array(24).fill(null).map(() => ({
            iconNum: 0,
            livePge: null,
            initPge: null,
        }))
        let numItems = 0
        for (const invPge of inventoryItemIndices) {
            items[numItems] = {
                iconNum: game._res.level.pgeAllInitialStateFromFile[invPge].iconNum,
                initPge: game._res.level.pgeAllInitialStateFromFile[invPge],
                livePge: runtime.livePgesByIndex[invPge]
            }
            ++numItems
        }
        items[numItems].iconNum = uint8Max
        let currentItem = 0
        const numLines = (((numItems - 1) / 4) >> 0) + 1
        let currentLine = 0
        let displayScore = false
        while (!game._stub._pi.backspace && !game._stub._pi.quit) {
            const iconSprW = 16
            const iconSprH = 16

            let iconNum = 31
            for (let y = 140; y < 140 + 5 * iconSprH; y += iconSprH) {
                for (let x = 56; x < 56 + 9 * iconSprW; x += iconSprW) {
                    game.drawIcon(iconNum, x, y, 0xF)
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
                    game.drawIcon(items[itemIt].iconNum, iconXPos, 157, 0xC)
                    if (currentItem === itemIt) {
                        game.drawIcon(76, iconXPos, 157, 0xC)
                        selectedPge = items[itemIt].livePge
                        const txtNum = items[itemIt].initPge.textNum
                        const str = game._res.getTextString(world.currentLevel, txtNum)
                        game.drawString(str, gamescreenW, 189, 0xED, true)
                        if (items[itemIt].initPge.initFlags & 4) {
                            const buf = selectedPge.life.toString()
                            game._vid.drawString(buf, ((gamescreenW - buf.length * charW) / 2) >> 0, 197, 0xED)
                        }
                    }
                    iconXPos += 32
                }
                if (currentLine !== 0) {
                    game.drawIcon(78, 120, 176, 0xC)
                }
                if (currentLine !== numLines - 1) {
                    game.drawIcon(77, 120, 143, 0xC)
                }
            } else {
                let buf = "SCORE " + ui.score.toString().padStart(8, "0")
                game._vid.drawString(buf, (((114 - buf.length * charW) / 2) >> 0) + 72, 158, 0xE5)
                buf = game._res.getMenuString(LocaleData.Id.li06Level) + ":" + game._res.getMenuString(LocaleData.Id.li13Easy + ui.skillLevel)
                game._vid.drawString(buf, (((114 - buf.length * charW) / 2) >> 0) + 72, 166, 0xE5)
            }

            await game._vid.updateScreen()
            await game._stub.sleep(80)
            await game.inpUpdate()

            if (game._stub._pi.dirMask & dirUp) {
                game._stub._pi.dirMask &= ~dirUp
                if (currentLine < numLines - 1) {
                    ++currentLine
                    currentItem = currentLine * 4
                }
            }
            if (game._stub._pi.dirMask & dirDown) {
                game._stub._pi.dirMask &= ~dirDown
                if (currentLine > 0) {
                    --currentLine
                    currentItem = currentLine * 4
                }
            }
            if (game._stub._pi.dirMask & dirLeft) {
                game._stub._pi.dirMask &= ~dirLeft
                if (currentItem > 0) {
                    const itemNum = currentItem % 4
                    if (itemNum > 0) {
                        --currentItem
                    }
                }
            }
            if (game._stub._pi.dirMask & dirRight) {
                game._stub._pi.dirMask &= ~dirRight
                if (currentItem < numItems - 1) {
                    const itemNum = currentItem % 4
                    if (itemNum < 3) {
                        ++currentItem
                    }
                }
            }
            if (game._stub._pi.enter) {
                game._stub._pi.enter = false
                displayScore = !displayScore
            }
        }
        game._vid.fullRefresh()
        game._stub._pi.backspace = false
        if (selectedPge) {
            const inventoryGame = game as Game & { setCurrentInventoryPge?: (pge: LivePGE) => void }
            if (typeof inventoryGame.setCurrentInventoryPge === 'function') {
                inventoryGame.setCurrentInventoryPge(selectedPge)
            } else {
                gameSetCurrentInventoryPgeSelection(game, selectedPge)
            }
        }
        game.playSound(66, 0)
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
