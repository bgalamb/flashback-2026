import { loadFileDataByFileName } from './file-access'
import { FileSystem } from './fs'
import { getAniDataView, getCineStringView, getGameStringView, getMenuStringValue, getTextStringView, loadDefaultLocaleTables } from './text-store'
import { ResourceLevelState, ResourceTextState } from './resource-state'

function loadText(textState: ResourceTextState) {
    const localeTables = loadDefaultLocaleTables()
    textState.stringsTable = localeTables.stringsTable
    textState.textsTable = localeTables.textsTable
}

async function loadCinematicText(fileSystem: FileSystem, textState: ResourceTextState) {
    if (textState.cineOff === null) {
        textState.cineOff = await loadFileDataByFileName(fileSystem, 'ENGCINE.BIN')
    }

    if (textState.cineTxt === null) {
        textState.cineTxt = await loadFileDataByFileName(fileSystem, 'ENGCINE.TXT')
    }
}

function getAnimationData(levelState: ResourceLevelState, animationIndex: number) {
    return getAniDataView(levelState.ani, animationIndex)
}

function getTextString(levelState: ResourceLevelState, _level: number, textIndex: number) {
    return getTextStringView(levelState.tbn, textIndex)
}

function getGameString(textState: ResourceTextState, stringIndex: number) {
    return getGameStringView(textState.stringsTable, stringIndex)
}

function getCinematicString(textState: ResourceTextState, stringIndex: number) {
    return getCineStringView(textState.cineOff, textState.cineTxt, textState.cineStrings, stringIndex)
}

function getMenuString(textState: ResourceTextState, stringIndex: number) {
    return getMenuStringValue(textState.textsTable, stringIndex)
}

export {
    getAnimationData,
    getCinematicString,
    getGameString,
    getMenuString,
    getTextString,
    loadCinematicText,
    loadText,
}
