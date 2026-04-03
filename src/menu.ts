import {  Skill } from "./intern"
import { LocaleData, Resource } from "./resource/resource"
import { DIR_DOWN, DIR_UP, SystemStub } from "./systemstub_web"
import {GAMESCREEN_H, GAMESCREEN_W, Video} from "./video"
import { CHAR_W, CHAR_H, UINT8_MAX } from './game_constants'
import { _gameLevels } from './staticres'


const SCREEN_TITLE = 0
const SCREEN_LEVEL = 1
const SCREEN_INFO = 4

const EVENTS_DELAY = 80

interface Item {
    str: number
    opt: number
}

class Menu {

    static MENU_OPTION_ITEM_START = 0
    static MENU_OPTION_ITEM_INFO = 4
    static MENU_OPTION_ITEM_QUIT = 6

    _res: Resource
    _stub: SystemStub
    _vid: Video

    _currentScreen: number
    _nextScreen: number
    _selectedOption: number

    _skill: number
    _level: number

    _charVar1: number
    _charVar2: number
    _charVar3: number
    _charVar4: number
    _charVar5: number
    _levelItems: Item[]

    constructor(res: Resource, stub: SystemStub, vid: Video) {
        this._res = res
        this._stub = stub
        this._vid = vid
        this._skill = Skill.kSkillNormal
        this._level = 0
        this._levelItems = _gameLevels.map((_, index) => ({
            str: index,
            opt: index
        }))
    }

    initMenuItems() {
        const MENU_ITEMS = [
            {
                str: LocaleData.Id.LI_07_START,
                opt: Menu.MENU_OPTION_ITEM_START
            },
            {
                str: LocaleData.Id.LI_10_INFO,
                opt: Menu.MENU_OPTION_ITEM_INFO
            },
            {
                str: LocaleData.Id.LI_11_QUIT,
                opt: Menu.MENU_OPTION_ITEM_QUIT
            }
        ];

        return {
            menuItems: MENU_ITEMS,
            menuItemsCount: MENU_ITEMS.length
        };
    }

    private getLevelLabel(levelIndex: number) {
        const level = _gameLevels[levelIndex]
        const label = level.name2.replace('level', '')
        if (label.includes('_')) {
            return `LEVEL ${label.replace('_', '-')}`
        }
        return `LEVEL ${label}`
    }

    private drawPane(x: number, y: number, w: number, h: number) {
        const previousColors = this._vid.getTextColors()

        this._vid.setTextColors(0xEE, UINT8_MAX, 0xE2)

        this._vid.PC_drawChar(0x81, y, x)
        this._vid.PC_drawChar(0x82, y, x + w)
        this._vid.PC_drawChar(0x83, y + h, x)
        this._vid.PC_drawChar(0x84, y + h, x + w)

        for (let i = 1; i < w; ++i) {
            this._vid.PC_drawChar(0x85, y, x + i)
            this._vid.PC_drawChar(0x88, y + h, x + i)
        }

        for (let j = 1; j < h; ++j) {
            this._vid.setTextTransparentColor(UINT8_MAX)
            this._vid.PC_drawChar(0x86, y + j, x)
            this._vid.PC_drawChar(0x87, y + j, x + w)
            this._vid.setTextTransparentColor(0xE2)
            for (let i = 1; i < w; ++i) {
                this._vid.PC_drawChar(0x20, y + j, x + i)
            }
        }

        this._vid.markBlockAsDirty(x * CHAR_W, y * CHAR_H, (w + 1) * CHAR_W, (h + 1) * CHAR_H, 1)

        this._vid.setTextColors(previousColors.frontColor, previousColors.transparentColor, previousColors.shadowColor)
    }

    async handleLevelScreen() {
        let currentEntry = Math.min(this._level, this._levelItems.length - 1)
        const initialEntry = currentEntry
        const paneX = 9
        const paneY = 3
        const paneW = 21
        const paneH = 24

        while (!this._stub._pi.quit) {
            if (this._nextScreen === SCREEN_LEVEL) {
                this._currentScreen = SCREEN_LEVEL
                this._nextScreen = -1
            }

            if (this._stub._pi.dirMask & DIR_UP) {
                this._stub._pi.dirMask &= ~DIR_UP
                if (currentEntry !== 0) {
                    --currentEntry
                } else {
                    currentEntry = this._levelItems.length - 1
                }
            }
            if (this._stub._pi.dirMask & DIR_DOWN) {
                this._stub._pi.dirMask &= ~DIR_DOWN
                if (currentEntry !== this._levelItems.length - 1) {
                    ++currentEntry
                } else {
                    currentEntry = 0
                }
            }
            if (this._stub._pi.escape) {
                this._stub._pi.escape = false
                return false
            }
            if (this._stub._pi.enter) {
                this._stub._pi.enter = false
                this._level = this._levelItems[currentEntry].opt
                return true
            }

            this.drawPane(paneX, paneY, paneW, paneH)

            const title = 'SELECT LEVEL'
            this.drawString(title, paneY + 2, paneX + (((paneW + 1) - title.length) / 2 >> 0), 2)

            const yPos = paneY + 5
            for (let i = 0; i < this._levelItems.length; ++i) {
                const label = this.getLevelLabel(i)
                this.drawString(label, yPos + i * 2, paneX + (((paneW + 1) - label.length) / 2 >> 0), (i === currentEntry) ? 2 : 3)
            }

            const hint = 'ESC TO RETURN'
            this.drawString(hint, paneY + 22, paneX + (((paneW + 1) - hint.length) / 2 >> 0), 4)

            await this._vid.updateScreen()
            await this._stub.sleep(EVENTS_DELAY)
            await this._stub.processEvents()
        }

        return false
    }


    async handleTitleScreen() {
        this._charVar1 = 0
        this._charVar2 = 0
        this._charVar3 = 0
        this._charVar4 = 0
        this._charVar5 = 0

        let { menuItems, menuItemsCount } = this.initMenuItems()

        this._selectedOption = -1
        this._currentScreen = -1
        this._nextScreen = SCREEN_TITLE
    
        let quitLoop = false
        let currentEntry = 0

        while (!quitLoop && !this._stub._pi.quit) {
    
            let selectedItem = -1

            if (this._nextScreen === SCREEN_TITLE) {
                await this._vid.fadeOut()
                await this.loadPicture("menu1")
                this._vid.fullRefresh()
                this._charVar3 = 1
                this._charVar4 = 2
                currentEntry = 0
                this._currentScreen = this._nextScreen
                this._nextScreen = -1
            }

            //Navigate up or down in the menu
            if (this._stub._pi.dirMask & DIR_UP) {
                this._stub._pi.dirMask &= ~DIR_UP
                if (currentEntry !== 0) {
                    --currentEntry
                } else {
                    currentEntry = menuItemsCount - 1
                }
            }
            if (this._stub._pi.dirMask & DIR_DOWN) {
                this._stub._pi.dirMask &= ~DIR_DOWN
                if (currentEntry !== menuItemsCount - 1) {
                    ++currentEntry
                } else {
                    currentEntry = 0
                }
            }
            if (this._stub._pi.enter) {
                this._stub._pi.enter = false
                selectedItem = currentEntry
            }
            if (selectedItem !== -1) {
                this._selectedOption = menuItems[selectedItem].opt
                switch (this._selectedOption) {
                case Menu.MENU_OPTION_ITEM_START:
                    this._currentScreen = SCREEN_LEVEL
                    this._nextScreen = SCREEN_LEVEL
                    if (await this.handleLevelScreen()) {
                        quitLoop = true
                    }
                    break
                case Menu.MENU_OPTION_ITEM_INFO:
                    this._currentScreen = SCREEN_INFO
                    await this.handleInfoScreen()
                    break
                case Menu.MENU_OPTION_ITEM_QUIT:
                    quitLoop = true
                    break
                }
                this._nextScreen = SCREEN_TITLE
                continue
            }
    
            // draw the options
            const yPos = 26 - menuItemsCount * 2
            for (let i = 0; i < menuItemsCount; ++i) {
                this.drawString(this._res.getMenuString(menuItems[i].str), yPos + i * 2, 20, (i === currentEntry) ? 2 : 3);
            }
    
            await this._vid.updateScreen()
            await this._stub.sleep(EVENTS_DELAY)
            await this._stub.processEvents()
        }
    }

    async handleInfoScreen() {
        await this._vid.fadeOut()
        await this.loadPicture("instru_e")

        this._vid.fullRefresh()
        await this._vid.updateScreen()
        do {
            await this._stub.sleep(EVENTS_DELAY)
            await this._stub.processEvents()
            if (this._stub._pi.escape) {
                this._stub._pi.escape = false
                break
            }
            if (this._stub._pi.enter) {
                this._stub._pi.enter = false
                break
            }
        } while (!this._stub._pi.quit)
    }

    drawString(str: string, y: number, x: number, color: number) {
        const previousColors = this._vid.getTextColors()

        switch (color) {
        case 0:
            this._vid.setTextColors(this._charVar1, this._charVar2, this._charVar2)
            break;
        case 1:
            this._vid.setTextColors(this._charVar2, this._charVar1, this._charVar1)
            break;
        case 2:
            this._vid.setTextColors(this._charVar3, UINT8_MAX, this._charVar1)
            break;
        case 3:
            this._vid.setTextColors(this._charVar4, UINT8_MAX, this._charVar1)
            break;
        case 4:
            this._vid.setTextColors(this._charVar2, UINT8_MAX, this._charVar1)
            break;
        case 5:
            this._vid.setTextColors(this._charVar2, UINT8_MAX, this._charVar5)
            break;
        }
    
        this.drawString2(str, y, x)
    
        this._vid.setTextColors(previousColors.frontColor, previousColors.transparentColor, previousColors.shadowColor)
    }
    
    drawString2(str: string, y: number, x: number) {
        const w = CHAR_W
        const h = CHAR_H
        let len = 0

        for (; str[len]; ++len) {
            this._vid.PC_drawChar(str.charCodeAt(len), y, x + len)
        }

        this._vid.markBlockAsDirty(x * w, y * h, len * w, h, 1)
    }

    async loadPicture(prefix: string) {
        const kPictureW = GAMESCREEN_W
        const kPictureH = GAMESCREEN_H
        await this._res.load_MAP_menu(prefix, this._res.scratchBuffer)
        for (let i = 0; i < 4; ++i) {
            for (let y = 0; y < kPictureH; ++y) {
                for (let x = 0; x < kPictureW / 4; ++x) {
                    this._vid.layers.frontLayer[i + x * 4 + kPictureW * y] = this._res.scratchBuffer[0x3800 * i + x + 64 * y]
                }
            }
        }
        this._vid.copyFrontLayerToBack()
        await this._res.load_PAL_menu(prefix, this._res.scratchBuffer)
        this._stub.setPalette(this._res.scratchBuffer, 256)
    }

}

export { Menu }
