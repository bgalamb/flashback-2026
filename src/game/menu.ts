import {  Skill } from "../core/intern"
import { LocaleData, Resource } from "../resource/resource"
import { dirDown, dirUp } from "../platform/system-port"
import type { SystemPort } from "../platform/system-port"
import {gamescreenH, gamescreenW, Video} from "../video/video"
import { charW, charH, uint8Max } from '../core/game_constants'
import { _gameLevels } from '../core/staticres'


const screenTitle = 0
const screenLevel = 1
const screenInfo = 4

const eventsDelay = 80

interface Item {
    str: number
    opt: number
}

class Menu {

    static menuOptionItemStart = 0
    static menuOptionItemInfo = 4
    static menuOptionItemQuit = 6

    _res: Resource
    _stub: SystemPort
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

    constructor(res: Resource, stub: SystemPort, vid: Video) {
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

    get skillLevel() {
        return this._skill
    }

    get selectedLevel() {
        return this._level
    }

    get selectedOption() {
        return this._selectedOption
    }

    initMenuItems() {
        const menuItems = [
            {
                str: LocaleData.Id.li07Start,
                opt: Menu.menuOptionItemStart
            },
            {
                str: LocaleData.Id.li10Info,
                opt: Menu.menuOptionItemInfo
            },
            {
                str: LocaleData.Id.li11Quit,
                opt: Menu.menuOptionItemQuit
            }
        ];

        return {
            menuItems: menuItems,
            menuItemsCount: menuItems.length
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

        this._vid.setTextColors(0xEE, uint8Max, 0xE2)

        this._vid.pcDrawchar(0x81, y, x)
        this._vid.pcDrawchar(0x82, y, x + w)
        this._vid.pcDrawchar(0x83, y + h, x)
        this._vid.pcDrawchar(0x84, y + h, x + w)

        for (let i = 1; i < w; ++i) {
            this._vid.pcDrawchar(0x85, y, x + i)
            this._vid.pcDrawchar(0x88, y + h, x + i)
        }

        for (let j = 1; j < h; ++j) {
            this._vid.setTextTransparentColor(uint8Max)
            this._vid.pcDrawchar(0x86, y + j, x)
            this._vid.pcDrawchar(0x87, y + j, x + w)
            this._vid.setTextTransparentColor(0xE2)
            for (let i = 1; i < w; ++i) {
                this._vid.pcDrawchar(0x20, y + j, x + i)
            }
        }

        this._vid.markBlockAsDirty(x * charW, y * charH, (w + 1) * charW, (h + 1) * charH, 1)

        this._vid.setTextColors(previousColors.frontColor, previousColors.transparentColor, previousColors.shadowColor)
    }

    async handleLevelScreen() {
        let currentEntry = Math.min(this._level, this._levelItems.length - 1)
        const initialEntry = currentEntry
        const paneX = 9
        const paneY = 3
        const paneW = 21
        const paneH = 24

        while (!this._stub.input.quit) {
            if (this._nextScreen === screenLevel) {
                this._currentScreen = screenLevel
                this._nextScreen = -1
            }

            if (this._stub.input.dirMask & dirUp) {
                this._stub.input.dirMask &= ~dirUp
                if (currentEntry !== 0) {
                    --currentEntry
                } else {
                    currentEntry = this._levelItems.length - 1
                }
            }
            if (this._stub.input.dirMask & dirDown) {
                this._stub.input.dirMask &= ~dirDown
                if (currentEntry !== this._levelItems.length - 1) {
                    ++currentEntry
                } else {
                    currentEntry = 0
                }
            }
            if (this._stub.input.escape) {
                this._stub.input.escape = false
                return false
            }
            if (this._stub.input.enter) {
                this._stub.input.enter = false
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
            await this._stub.sleep(eventsDelay)
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
        this._nextScreen = screenTitle
    
        let quitLoop = false
        let currentEntry = 0

        while (!quitLoop && !this._stub.input.quit) {
    
            let selectedItem = -1

            if (this._nextScreen === screenTitle) {
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
            if (this._stub.input.dirMask & dirUp) {
                this._stub.input.dirMask &= ~dirUp
                if (currentEntry !== 0) {
                    --currentEntry
                } else {
                    currentEntry = menuItemsCount - 1
                }
            }
            if (this._stub.input.dirMask & dirDown) {
                this._stub.input.dirMask &= ~dirDown
                if (currentEntry !== menuItemsCount - 1) {
                    ++currentEntry
                } else {
                    currentEntry = 0
                }
            }
            if (this._stub.input.enter) {
                this._stub.input.enter = false
                selectedItem = currentEntry
            }
            if (selectedItem !== -1) {
                this._selectedOption = menuItems[selectedItem].opt
                switch (this._selectedOption) {
                case Menu.menuOptionItemStart:
                    this._currentScreen = screenLevel
                    this._nextScreen = screenLevel
                    if (await this.handleLevelScreen()) {
                        quitLoop = true
                    }
                    break
                case Menu.menuOptionItemInfo:
                    this._currentScreen = screenInfo
                    await this.handleInfoScreen()
                    break
                case Menu.menuOptionItemQuit:
                    quitLoop = true
                    break
                }
                this._nextScreen = screenTitle
                continue
            }
    
            // draw the options
            const yPos = 26 - menuItemsCount * 2
            for (let i = 0; i < menuItemsCount; ++i) {
                this.drawString(this._res.getMenuString(menuItems[i].str), yPos + i * 2, 20, (i === currentEntry) ? 2 : 3);
            }
    
            await this._vid.updateScreen()
            await this._stub.sleep(eventsDelay)
            await this._stub.processEvents()
        }
    }

    async handleInfoScreen() {
        await this._vid.fadeOut()
        await this.loadPicture("instru_e")

        this._vid.fullRefresh()
        await this._vid.updateScreen()
        do {
            await this._stub.sleep(eventsDelay)
            await this._stub.processEvents()
            if (this._stub.input.escape) {
                this._stub.input.escape = false
                break
            }
            if (this._stub.input.enter) {
                this._stub.input.enter = false
                break
            }
        } while (!this._stub.input.quit)
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
            this._vid.setTextColors(this._charVar3, uint8Max, this._charVar1)
            break;
        case 3:
            this._vid.setTextColors(this._charVar4, uint8Max, this._charVar1)
            break;
        case 4:
            this._vid.setTextColors(this._charVar2, uint8Max, this._charVar1)
            break;
        case 5:
            this._vid.setTextColors(this._charVar2, uint8Max, this._charVar5)
            break;
        }
    
        this.drawString2(str, y, x)
    
        this._vid.setTextColors(previousColors.frontColor, previousColors.transparentColor, previousColors.shadowColor)
    }
    
    drawString2(str: string, y: number, x: number) {
        const w = charW
        const h = charH
        let len = 0

        for (; str[len]; ++len) {
            this._vid.pcDrawchar(str.charCodeAt(len), y, x + len)
        }

        this._vid.markBlockAsDirty(x * w, y * h, len * w, h, 1)
    }

    async loadPicture(prefix: string) {
        const kPictureW = gamescreenW
        const kPictureH = gamescreenH
        await this._res.loadMenuMap(prefix, this._res.scratchBuffer)
        for (let i = 0; i < 4; ++i) {
            for (let y = 0; y < kPictureH; ++y) {
                for (let x = 0; x < kPictureW / 4; ++x) {
                    this._vid.layers.frontLayer[i + x * 4 + kPictureW * y] = this._res.scratchBuffer[0x3800 * i + x + 64 * y]
                }
            }
        }
        this._vid.copyFrontLayerToBack()
        await this._res.loadMenuPalette(prefix, this._res.scratchBuffer)
        this._stub.setPalette(this._res.scratchBuffer, 256)
    }

}

export { Menu }
