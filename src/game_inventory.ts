import type { InventoryItem, LivePGE } from './intern'
import type { Game } from './game'
import { LocaleData } from './resource/resource'
import { DIR_DOWN, DIR_LEFT, DIR_RIGHT, DIR_UP } from './systemstub_web'
import { CHAR_W, GAMESCREEN_W } from './game_constants'
import { UINT16_MAX, UINT8_MAX } from './game_constants'

function getOrCreateInventoryItemsForOwner(game: Game, ownerPge: LivePGE) {
    let inventoryItemIndices = game._inventoryItemIndicesByOwner.get(ownerPge.index)
    if (!inventoryItemIndices) {
        inventoryItemIndices = []
        game._inventoryItemIndicesByOwner.set(ownerPge.index, inventoryItemIndices)
    }
    return inventoryItemIndices
}

export function gameGetInventoryItemIndices(game: Game, ownerPge: LivePGE) {
    return getOrCreateInventoryItemsForOwner(game, ownerPge)
}

export function gameGetCurrentInventoryItemIndex(game: Game, ownerPge: LivePGE) {
    const inventoryItemIndices = getOrCreateInventoryItemsForOwner(game, ownerPge)
    return inventoryItemIndices.length !== 0 ? inventoryItemIndices[0] : UINT8_MAX
}

export function gameGetNextInventoryItemIndex(game: Game, ownerPge: LivePGE, inventoryItemIndex: number) {
    const inventoryItemIndices = getOrCreateInventoryItemsForOwner(game, ownerPge)
    const currentItemPosition = inventoryItemIndices.indexOf(inventoryItemIndex)
    if (currentItemPosition >= 0 && currentItemPosition + 1 < inventoryItemIndices.length) {
        return inventoryItemIndices[currentItemPosition + 1]
    }
    return UINT8_MAX
}

export function gameFindInventoryItemByObjectId(game: Game, ownerPge: LivePGE, objectId: number) {
    for (const inventoryItemIndex of getOrCreateInventoryItemsForOwner(game, ownerPge)) {
        const inventoryItem = game._livePgesByIndex[inventoryItemIndex]
        if (inventoryItem.init_PGE.object_id === objectId) {
            return inventoryItem
        }
    }
    return null
}


export function gameReorderPgeInventoryLinks(game: Game, pge: LivePGE) {
    if (pge.unkF !== UINT8_MAX) {
        const _bx: LivePGE = game._livePgesByIndex[pge.unkF]
        const _di: LivePGE = game.findInventoryItemBeforePge(_bx, pge)
        if (_di === _bx) {
            if (gameGetCurrentInventoryItemIndex(game, _di) === pge.index) {
                game.removePgeFromInventory(_di, pge, _bx)
            }
        } else {
            if (gameGetNextInventoryItemIndex(game, _bx, _di.index) === pge.index) {
                game.removePgeFromInventory(_di, pge, _bx)
            }
        }
    }
}

export function gameUpdatePgeInventoryLinks(game: Game, pge1: LivePGE, pge2: LivePGE) {
    if (pge2.unkF !== UINT8_MAX) {
        game.reorderPgeInventory(pge2)
    }

    const _ax: LivePGE = game.findInventoryItemBeforePge(pge1, null)
    game.addPgeToInventory(_ax, pge2, pge1)
}

export async function gameHandleConfigPanel(game: Game) {
    const x = 7
    const y = 10
    const w = 17
    const h = 12

    game._vid.setTextColors(0xEE, UINT8_MAX, 0xE2)

    // the panel background is drawn using special characters from FB_TXT.FNT
    // top-left rounded corner
    game._vid.PC_drawChar(0x81, y, x)
    // top-right rounded corner
    game._vid.PC_drawChar(0x82, y, x + w)
    // bottom-left rounded corner
    game._vid.PC_drawChar(0x83, y + h, x)
    // bottom-right rounded corner
    game._vid.PC_drawChar(0x84, y + h, x + w)
    // horizontal lines
    for (let i = 1; i < w; ++i) {
        game._vid.PC_drawChar(0x85, y, x + i)
        game._vid.PC_drawChar(0x88, y + h, x + i)
    }
    for (let j = 1; j < h; ++j) {
        game._vid.setTextTransparentColor(UINT8_MAX)
        // left vertical line
        game._vid.PC_drawChar(0x86, y + j, x)
        // right vertical line
        game._vid.PC_drawChar(0x87, y + j, x + w)
        game._vid.setTextTransparentColor(0xE2)
        for (let i = 1; i < w; ++i) {
            game._vid.PC_drawChar(0x20, y + j, x + i)
        }
    }

    game._menu._charVar3 = 0xE4
    game._menu._charVar4 = 0xE5
    game._menu._charVar1 = 0xE2
    game._menu._charVar2 = 0xEE

    game._vid.fullRefresh()
    const MENU_ITEM_ABORT = 1
    const MENU_ITEM_LOAD = 2
    const MENU_ITEM_SAVE = 3
    const colors = [ 2, 3, 3, 3 ]
    let current = 0
    while (!game._stub._pi.quit) {
        game._menu.drawString(game._res.getMenuString(LocaleData.Id.LI_18_RESUME_GAME), y + 2, 9, colors[0])
        game._menu.drawString(game._res.getMenuString(LocaleData.Id.LI_19_ABORT_GAME), y + 4, 9, colors[1])
        game._menu.drawString(game._res.getMenuString(LocaleData.Id.LI_20_LOAD_GAME), y + 6, 9, colors[2])
        game._menu.drawString(game._res.getMenuString(LocaleData.Id.LI_21_SAVE_GAME), y + 8, 9, colors[3])
        game._vid.fillRect(CHAR_W * (x + 1), CHAR_W * (y + 10), CHAR_W * (w - 2), CHAR_W, 0xE2)
        const buf = game._res.getMenuString(LocaleData.Id.LI_22_SAVE_SLOT) + " < " + game._stateSlot.toString().padStart(2, "0") + " >"
        game._menu.drawString(buf, y + 10, 9, 1)

        game._vid.updateScreen()
        await game._stub.sleep(80)
        await game.inp_update()

        let prev = current
        if (game._stub._pi.dirMask & DIR_UP) {
            game._stub._pi.dirMask &= ~DIR_UP
            current = (current + 3) % 4
        }
        if (game._stub._pi.dirMask & DIR_DOWN) {
            game._stub._pi.dirMask &= ~DIR_DOWN
            current = (current + 1) % 4
        }
        if (game._stub._pi.dirMask & DIR_LEFT) {
            game._stub._pi.dirMask &= ~DIR_LEFT
            --game._stateSlot
            if (game._stateSlot < 1) {
                game._stateSlot = 1
            }
        }
        if (game._stub._pi.dirMask & DIR_RIGHT) {
            game._stub._pi.dirMask &= ~DIR_RIGHT
            ++game._stateSlot
            if (game._stateSlot > 99) {
                game._stateSlot = 99
            }
        }
        if (prev !== current) {
            const tmp = colors[prev]
            colors[prev] = colors[current]
            colors[current] = tmp
        }
        if (game._stub._pi.enter) {
            game._stub._pi.enter = false
            switch (current) {
                case MENU_ITEM_LOAD:
                    game._stub._pi.load = true
                    break
                case MENU_ITEM_SAVE:
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
    return (current === MENU_ITEM_ABORT)
}


export async function gameHandleInventory(game: Game) {
    let selected_pge: LivePGE = null
    const pge: LivePGE = game._livePgesByIndex[0]
    const inventoryItemIndices = gameGetInventoryItemIndices(game, pge)
    if (pge.life > 0 && inventoryItemIndices.length !== 0) {
        game.playSound(66, 0)
        const items: InventoryItem[] = new Array(24).fill(null).map(() => ({
            icon_num: 0,
            live_pge: null,
            init_pge: null,
        }))
        let num_items = 0
        for (const inv_pge of inventoryItemIndices) {
            items[num_items] = {
                icon_num: game._res.level.pgeAllInitialStateFromFile[inv_pge].icon_num,
                init_pge: game._res.level.pgeAllInitialStateFromFile[inv_pge],
                live_pge: game._livePgesByIndex[inv_pge]
            }
            ++num_items
        }
        items[num_items].icon_num = UINT8_MAX
        let current_item = 0
        const num_lines = (((num_items - 1) / 4) >> 0) + 1
        let current_line = 0
        let display_score = false
        while (!game._stub._pi.backspace && !game._stub._pi.quit) {
            const icon_spr_w = 16
            const icon_spr_h = 16

            let icon_num = 31
            for (let y = 140; y < 140 + 5 * icon_spr_h; y += icon_spr_h) {
                for (let x = 56; x < 56 + 9 * icon_spr_w; x += icon_spr_w) {
                    game.drawIcon(icon_num, x, y, 0xF)
                    ++icon_num
                }
            }

            if (!display_score) {
                let icon_x_pos = 72
                for (let i = 0; i < 4; ++i) {
                    const item_it = current_line * 4 + i
                    if (items[item_it].icon_num === UINT8_MAX) {
                        break
                    }
                    game.drawIcon(items[item_it].icon_num, icon_x_pos, 157, 0xC)
                    if (current_item === item_it) {
                        game.drawIcon(76, icon_x_pos, 157, 0xC)
                        selected_pge = items[item_it].live_pge
                        const txt_num = items[item_it].init_pge.text_num
                        const str = game._res.getTextString(game._currentLevel, txt_num)
                        game.drawString(str, GAMESCREEN_W, 189, 0xED, true)
                        if (items[item_it].init_pge.init_flags & 4) {
                            const buf = selected_pge.life.toString()
                            game._vid.drawString(buf, ((GAMESCREEN_W - buf.length * CHAR_W) / 2) >> 0, 197, 0xED)
                        }
                    }
                    icon_x_pos += 32
                }
                if (current_line !== 0) {
                    game.drawIcon(78, 120, 176, 0xC)
                }
                if (current_line !== num_lines - 1) {
                    game.drawIcon(77, 120, 143, 0xC)
                }
            } else {
                let buf = "SCORE " + game._score.toString().padStart(8, "0")
                game._vid.drawString(buf, (((114 - buf.length * CHAR_W) / 2) >> 0) + 72, 158, 0xE5)
                buf = game._res.getMenuString(LocaleData.Id.LI_06_LEVEL) + ":" + game._res.getMenuString(LocaleData.Id.LI_13_EASY + game._skillLevel)
                game._vid.drawString(buf, (((114 - buf.length * CHAR_W) / 2) >> 0) + 72, 166, 0xE5)
            }

            await game._vid.updateScreen()
            await game._stub.sleep(80)
            await game.inp_update()

            if (game._stub._pi.dirMask & DIR_UP) {
                game._stub._pi.dirMask &= ~DIR_UP
                if (current_line < num_lines - 1) {
                    ++current_line
                    current_item = current_line * 4
                }
            }
            if (game._stub._pi.dirMask & DIR_DOWN) {
                game._stub._pi.dirMask &= ~DIR_DOWN
                if (current_line > 0) {
                    --current_line
                    current_item = current_line * 4
                }
            }
            if (game._stub._pi.dirMask & DIR_LEFT) {
                game._stub._pi.dirMask &= ~DIR_LEFT
                if (current_item > 0) {
                    const item_num = current_item % 4
                    if (item_num > 0) {
                        --current_item
                    }
                }
            }
            if (game._stub._pi.dirMask & DIR_RIGHT) {
                game._stub._pi.dirMask &= ~DIR_RIGHT
                if (current_item < num_items - 1) {
                    const item_num = current_item % 4
                    if (item_num < 3) {
                        ++current_item
                    }
                }
            }
            if (game._stub._pi.enter) {
                game._stub._pi.enter = false
                display_score = !display_score
            }
        }
        game._vid.fullRefresh()
        game._stub._pi.backspace = false
        if (selected_pge) {
            game.setCurrentInventoryPge(selected_pge)
        }
        game.playSound(66, 0)
    }
}

export function gameFindInventoryItemBeforePge(game: Game, pge: LivePGE, last_pge: LivePGE) {
    let previousInventoryItemOrOwner: LivePGE = pge
    const inventoryItemIndices = getOrCreateInventoryItemsForOwner(game, pge)

    for (const inventoryItemIndex of inventoryItemIndices) {
        const inventoryItem = game._livePgesByIndex[inventoryItemIndex]
        if (inventoryItem === last_pge) {
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
    pge2.unkF = UINT8_MAX
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
    const _bx: LivePGE = game.findInventoryItemBeforePge(game._livePgesByIndex[0], pge)
    if (_bx === game._livePgesByIndex[0]) {
        if (gameGetCurrentInventoryItemIndex(game, _bx) !== pge.index) {
            return 0
        }
    } else {
        if (gameGetNextInventoryItemIndex(game, game._livePgesByIndex[0], _bx.index) !== pge.index) {
            return 0
        }
    }
    game.removePgeFromInventory(_bx, pge, game._livePgesByIndex[0])
    game.addPgeToInventory(game._livePgesByIndex[0], pge, game._livePgesByIndex[0])
    return UINT16_MAX
}
