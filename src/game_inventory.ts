import type { InventoryItem, LivePGE } from './intern'
import type { Game } from './game'
import { LocaleData } from './resource'
import { DIR_DOWN, DIR_LEFT, DIR_RIGHT, DIR_UP } from './systemstub_web'
import { CHAR_W, GAMESCREEN_W } from './configs/config'
import { UINT8_MAX } from './game_constants'

export function gamePgeReorderInventory(game: Game, pge: LivePGE) {
    if (pge.unkF !== UINT8_MAX) {
        const _bx: LivePGE = game._pgeLiveAll[pge.unkF]
        const _di: LivePGE = game.pge_getInventoryItemBefore(_bx, pge)
        if (_di === _bx) {
            if (_di.current_inventory_PGE === pge.index) {
                game.pge_removeFromInventory(_di, pge, _bx)
            }
        } else {
            if (_di.next_inventory_PGE === pge.index) {
                game.pge_removeFromInventory(_di, pge, _bx)
            }
        }
    }
}

export function gamePgeUpdateInventory(game: Game, pge1: LivePGE, pge2: LivePGE) {
    if (pge2.unkF !== UINT8_MAX) {
        game.pge_reorderInventory(pge2)
    }

    const _ax: LivePGE = game.pge_getInventoryItemBefore(pge1, null)
    game.pge_addToInventory(_ax, pge2, pge1)
}

export async function gameHandleInventory(game: Game) {
    let selected_pge: LivePGE = null
    const pge: LivePGE = game._pgeLiveAll[0]
    if (pge.life > 0 && pge.current_inventory_PGE !== UINT8_MAX) {
        game.playSound(66, 0)
        const items: InventoryItem[] = new Array(24).fill(null).map(() => ({
            icon_num: 0,
            live_pge: null,
            init_pge: null,
        }))
        let num_items = 0
        let inv_pge = pge.current_inventory_PGE
        while (inv_pge !== UINT8_MAX) {
            items[num_items] = {
                icon_num: game._res._pgeAllInitialStateFromFile[inv_pge].icon_num,
                init_pge: game._res._pgeAllInitialStateFromFile[inv_pge],
                live_pge: game._pgeLiveAll[inv_pge]
            }

            inv_pge = game._pgeLiveAll[inv_pge].next_inventory_PGE
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
                    game.drawIcon(items[item_it].icon_num, icon_x_pos, 157, 0xA)
                    if (current_item === item_it) {
                        game.drawIcon(76, icon_x_pos, 157, 0xA)
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
                    game.drawIcon(78, 120, 176, 0xA)
                }
                if (current_line !== num_lines - 1) {
                    game.drawIcon(77, 120, 143, 0xA)
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
            game.pge_setCurrentInventoryObject(selected_pge)
        }
        game.playSound(66, 0)
    }
}

export function gamePgeGetInventoryItemBefore(game: Game, pge: LivePGE, last_pge: LivePGE) {
    let _di: LivePGE = pge
    let n = _di.current_inventory_PGE

    while (n !== UINT8_MAX) {
        const _si: LivePGE = game._pgeLiveAll[n]
        if (_si === last_pge) {
            break
        } else {
            _di = _si
            n = _di.next_inventory_PGE
        }
    }
    return _di
}

export function gamePgeRemoveFromInventory(game: Game, pge1: LivePGE, pge2: LivePGE, pge3: LivePGE) {
    pge2.unkF = UINT8_MAX
    if (pge3 === pge1) {
        pge3.current_inventory_PGE = pge2.next_inventory_PGE
        pge2.next_inventory_PGE = UINT8_MAX
    } else {
        pge1.next_inventory_PGE = pge2.next_inventory_PGE
        pge2.next_inventory_PGE = UINT8_MAX
    }
}

export function gamePgeAddToInventory(game: Game, pge1: LivePGE, pge2: LivePGE, pge3: LivePGE) {
    pge2.unkF = pge3.index

    if (pge1 === pge3) {
        pge2.next_inventory_PGE = pge1.current_inventory_PGE
        pge1.current_inventory_PGE = pge2.index
    } else {
        pge2.next_inventory_PGE = pge1.next_inventory_PGE
        pge1.next_inventory_PGE = pge2.index
    }
}

export function gamePgeSetCurrentInventoryObject(game: Game, pge: LivePGE) {
    const _bx: LivePGE = game.pge_getInventoryItemBefore(game._pgeLiveAll[0], pge)
    if (_bx === game._pgeLiveAll[0]) {
        if (_bx.current_inventory_PGE !== pge.index) {
            return 0
        }
    } else {
        if (_bx.next_inventory_PGE !== pge.index) {
            return 0
        }
    }
    game.pge_removeFromInventory(_bx, pge, game._pgeLiveAll[0])
    game.pge_addToInventory(game._pgeLiveAll[0], pge, game._pgeLiveAll[0])
    return 0xFFFF
}
