import {  Skill } from "./intern"
import { LocaleData, Resource } from "./resource"
import { DIR_DOWN, DIR_UP, SystemStub } from "./systemstub_web"
import { Video } from "./video"
import { _levelNames } from './staticres'

const SCREEN_TITLE = 0
const SCREEN_INFO = 4

const EVENTS_DELAY = 80

interface Item {
    str: number
    opt: number
}

class Menu {

    static MENU_OPTION_ITEM_START = 0
    static MENU_OPTION_ITEM_LEVEL = 3
    static MENU_OPTION_ITEM_INFO = 4
    static MENU_OPTION_ITEM_QUIT = 6

    static _levelNames: string[] = _levelNames

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

    constructor(res: Resource, stub: SystemStub, vid: Video) {
        this._res = res
        this._stub = stub
        this._vid = vid
        this._skill = Skill.kSkillNormal
        this._level = 0
    }

    initMenuItems(){
        const menuItems:Item[] = new Array(3).fill(null).map(() => ({
            str: 0,
            opt: 0,
        }))
        let menuItemsCount = 0

        menuItems[menuItemsCount].str = LocaleData.Id.LI_07_START
        menuItems[menuItemsCount].opt = Menu.MENU_OPTION_ITEM_START
        ++menuItemsCount
        if (!this._res._isDemo) {
            debugger
            menuItems[menuItemsCount].str = LocaleData.Id.LI_06_LEVEL
            menuItems[menuItemsCount].opt = Menu.MENU_OPTION_ITEM_LEVEL
            ++menuItemsCount

        }
        menuItems[menuItemsCount].str = LocaleData.Id.LI_10_INFO
        menuItems[menuItemsCount].opt = Menu.MENU_OPTION_ITEM_INFO
        ++menuItemsCount
        menuItems[menuItemsCount].str = LocaleData.Id.LI_11_QUIT
        menuItems[menuItemsCount].opt = Menu.MENU_OPTION_ITEM_QUIT
        ++menuItemsCount

        return {menuItems, menuItemsCount}
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
                    quitLoop = true
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
        this._vid.fadeOut()
        await this.loadPicture("instru_e")

        this._vid.fullRefresh()
        await this._vid.updateScreen(true)
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
        const v1b = this._vid._charFrontColor
        const v2b = this._vid._charTransparentColor
        const v3b = this._vid._charShadowColor

        switch (color) {
        case 0:
            this._vid._charFrontColor = this._charVar1
            this._vid._charTransparentColor = this._charVar2
            this._vid._charShadowColor = this._charVar2
            break;
        case 1:
            this._vid._charFrontColor = this._charVar2
            this._vid._charTransparentColor = this._charVar1
            this._vid._charShadowColor = this._charVar1
            break;
        case 2:
            this._vid._charFrontColor = this._charVar3
            this._vid._charTransparentColor = 0xFF
            this._vid._charShadowColor = this._charVar1
            break;
        case 3:
            this._vid._charFrontColor = this._charVar4
            this._vid._charTransparentColor = 0xFF
            this._vid._charShadowColor = this._charVar1
            break;
        case 4:
            this._vid._charFrontColor = this._charVar2
            this._vid._charTransparentColor = 0xFF
            this._vid._charShadowColor = this._charVar1
            break;
        case 5:
            this._vid._charFrontColor = this._charVar2
            this._vid._charTransparentColor = 0xFF
            this._vid._charShadowColor = this._charVar5
            break;
        }
    
        this.drawString2(str, y, x)
    
        this._vid._charFrontColor = v1b
        this._vid._charTransparentColor = v2b
        this._vid._charShadowColor = v3b
    }
    
    drawString2(str: string, y: number, x: number) {
        const w = Video.CHAR_W
        const h = Video.CHAR_H
        let len = 0

        for (; str[len]; ++len) {
            this._vid.PC_drawChar(str.charCodeAt(len), y, x + len, true)
        }

        this._vid.markBlockAsDirty(x * w, y * h, len * w, h, this._vid._layerScale)
    }

    async loadPicture(prefix: string) {
        const kPictureW = 256
        const kPictureH = 224
        await this._res.load_MAP_menu(prefix, this._res._scratchBuffer)
        for (let i = 0; i < 4; ++i) {
            for (let y = 0; y < kPictureH; ++y) {
                for (let x = 0; x < kPictureW / 4; ++x) {
                    this._vid._frontLayer[i + x * 4 + kPictureW * y] = this._res._scratchBuffer[0x3800 * i + x + 64 * y]
                }
            }
        }
        this._vid._backLayer.set(this._vid._frontLayer.subarray(0, this._vid._layerSize))
        await this._res.load_PAL_menu(prefix, this._res._scratchBuffer)
        this._stub.setPalette(this._res._scratchBuffer, 256)
        this._vid.updateWidescreen()
    }

}

export { Menu }
