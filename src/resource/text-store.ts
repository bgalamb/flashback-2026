import { READ_BE_UINT16, READ_LE_UINT16 } from '../intern'
import { LocaleData, NUM_CUTSCENE_TEXTS } from './constants'

function loadDefaultLocaleTables() {
    return {
        stringsTable: LocaleData._stringsTableEN,
        textsTable: LocaleData._textsTableEN,
    }
}

function getAniDataView(ani: Uint8Array, num: number) {
    const offset = READ_LE_UINT16(ani, 2 + num * 2)
    return ani.subarray(2 + offset)
}

function getTextStringView(tbn: Uint8Array[], num: number) {
    return tbn[num] || new Uint8Array(1)
}

function getGameStringView(stringsTable: Uint8Array, num: number) {
    return stringsTable.subarray(READ_LE_UINT16(stringsTable, num * 2))
}

function getCineStringView(cineOff: Uint8Array, cineTxt: Uint8Array, cineStrings: Uint8Array[], num: number) {
    if (cineOff) {
        const offset = READ_BE_UINT16(cineOff, num * 2)
        return cineTxt.subarray(offset)
    }
    return (num >= 0 && num < NUM_CUTSCENE_TEXTS) ? cineStrings[num] : 0
}

function getMenuStringValue(textsTable: string[], num: number) {
    return (num >= 0 && num < LocaleData.Id.LI_NUM) ? textsTable[num] : ''
}

export {
    getAniDataView,
    getCineStringView,
    getGameStringView,
    getMenuStringValue,
    getTextStringView,
    loadDefaultLocaleTables,
}
