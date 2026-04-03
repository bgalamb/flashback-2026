import { _gameLevels } from "./staticres"

function getLevelAssetBaseName(levelName: string): string {
    const suffixIndex = levelName.indexOf("_")
    return suffixIndex === -1 ? levelName : levelName.slice(0, suffixIndex)
}

function getLevelDirectoryNames(levelName: string): string[] {
    const exactMatches = _gameLevels
        .filter((level) => level.name2 === levelName)
        .map((level) => level.name2)
    if (exactMatches.length !== 0) {
        return Array.from(new Set(exactMatches))
    }

    const baseMatches = _gameLevels
        .filter((level) => level.name === levelName)
        .map((level) => level.name2)
    if (baseMatches.length !== 0) {
        return Array.from(new Set(baseMatches))
    }

    return [levelName]
}

function getLevelAssetPathCandidates(levelName: string, extension: string, fileBaseName?: string): string[] {
    const resolvedFileBaseName = fileBaseName || levelName
    const candidates = getLevelDirectoryNames(levelName).map((dirName) =>
        `levels/${dirName}/${resolvedFileBaseName}.${extension}`
    )

    candidates.push(`${resolvedFileBaseName}.${extension}`)
    if (resolvedFileBaseName !== levelName) {
        candidates.push(`${levelName}.${extension}`)
    }
    return Array.from(new Set(candidates))
}

function getSharedAssetPathCandidates(fileName: string, extension: string, folderName: string): string[] {
    const candidates = [
        `${folderName}/${fileName}.${extension}`,
        `${fileName}.${extension}`
    ]
    return Array.from(new Set(candidates))
}

export {
    getLevelAssetBaseName,
    getLevelAssetPathCandidates,
    getLevelDirectoryNames,
    getSharedAssetPathCandidates
}
