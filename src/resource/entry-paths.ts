import { ObjectType } from './constants'
import { getLevelAssetBaseName, getLevelAssetPathCandidates, getSharedAssetPathCandidates } from '../core/level-asset-paths'

function getParsedLevelDataPath(levelName: string, suffix: 'pge' | 'obj' | 'tbn'): string {
    const baseName = getLevelAssetBaseName(levelName)
    return `levels/${levelName}/${baseName}.${suffix}.json`
}

function getRawLevelEntryNames(levelName: string, extension: string, useBaseName: boolean): string[] {
    return getLevelAssetPathCandidates(levelName, extension, useBaseName ? getLevelAssetBaseName(levelName) : levelName)
}

function getSharedSpriteEntryNames(fileName: string, extension: string): string[] {
    return getSharedAssetPathCandidates(fileName, extension, 'me_and_monsters')
}

function getCollisionOverrideEntryNames(levelName: string): string[] {
    return getRawLevelEntryNames(levelName, 'ct.bin', true)
}

function getCandidateEntryNames(objName: string, objType: number, extension: string): string[] {
    switch (objType) {
        case ObjectType.OT_PGE:
            return [getParsedLevelDataPath(objName, 'pge')]
        case ObjectType.OT_OBJ:
            return [getParsedLevelDataPath(objName, 'obj')]
        case ObjectType.OT_TBN:
            return [getParsedLevelDataPath(objName, 'tbn')]
        case ObjectType.OT_CT:
        case ObjectType.OT_MBK:
        case ObjectType.OT_RP:
        case ObjectType.OT_BNQ:
            return getRawLevelEntryNames(objName, extension, true)
        case ObjectType.OT_ANI:
            return getRawLevelEntryNames(objName, extension, false)
        case ObjectType.OT_SPR:
        case ObjectType.OT_OFF:
            return getSharedSpriteEntryNames(objName, extension)
        default:
            return [`${objName}.${extension}`]
    }
}

export {
    getCandidateEntryNames,
    getCollisionOverrideEntryNames,
    getRawLevelEntryNames,
    getSharedSpriteEntryNames,
}
