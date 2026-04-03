import { readBeUint16, readLeUint16 } from '../core/intern'
import { LocaleData, numCutsceneTexts } from './constants'

function loadDefaultLocaleTables() {
    return {
        stringsTable: LocaleData._stringsTableEN,
        textsTable: LocaleData._textsTableEN,
    }
}

function getAniDataView(ani: Uint8Array, num: number) {
    const offset = readLeUint16(ani, 2 + num * 2)
    return ani.subarray(2 + offset)
}

function getTextStringView(tbn: Uint8Array[], num: number) {
    return tbn[num] || new Uint8Array(1)
}

function getGameStringView(stringsTable: Uint8Array, num: number) {
    return stringsTable.subarray(readLeUint16(stringsTable, num * 2))
}

function getCineStringView(cineOff: Uint8Array, cineTxt: Uint8Array, cineStrings: Uint8Array[], num: number) {
    if (cineOff) {
        const offset = readBeUint16(cineOff, num * 2)
        return cineTxt.subarray(offset)
    }
    return (num >= 0 && num < numCutsceneTexts) ? cineStrings[num] : 0
}

function getMenuStringValue(textsTable: string[], num: number) {
    return (num >= 0 && num < LocaleData.Id.liNum) ? textsTable[num] : ''
}

export {
    getAniDataView,
    getCineStringView,
    getGameStringView,
    getMenuStringValue,
    getTextStringView,
    loadDefaultLocaleTables,
}
