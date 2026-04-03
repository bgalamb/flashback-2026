import { ResolvedSpriteSet } from '../core/intern'
import { FileSystem } from './fs'
import { getSharedSpriteEntryNames } from './entry-paths'
import { buildResolvedSpriteSet, initializeConradVisualsByVariant } from './sprite-store'
import { loadFileDataByCandidateNames, openFirstExistingFile, readFileData } from './file-access'
import { ResourceSpriteState } from './resource-state'

async function loadSpriteOffsets(
    fileSystem: FileSystem,
    fileName: string,
    sprData: Uint8Array,
    numSprites: number
): Promise<{ resolvedSpriteSet: ResolvedSpriteSet, entryName: string }> {
    const candidates = getSharedSpriteEntryNames(fileName, 'OFF')
    const { data: offsetData, filename } = await loadFileDataByCandidateNames(fileSystem, candidates)
    return {
        resolvedSpriteSet: buildResolvedSpriteSet(numSprites, offsetData, sprData),
        entryName: filename,
    }
}

async function loadMonsterResolvedSpriteSet(
    fileSystem: FileSystem,
    fileName: string,
    numSprites: number
): Promise<ResolvedSpriteSet> {
    const spriteCandidates = getSharedSpriteEntryNames(fileName, 'SPR')
    const openedSpriteFile = await openFirstExistingFile(fileSystem, spriteCandidates)
    if (!openedSpriteFile) {
        throw new Error(`Cannot load '${spriteCandidates[0]}'`)
    }

    const spriteBlob = readFileData(openedSpriteFile.file, openedSpriteFile.filename, 12)
    const { data: offsetData } = await loadFileDataByCandidateNames(fileSystem, getSharedSpriteEntryNames(fileName, 'OFF'))
    return buildResolvedSpriteSet(numSprites, offsetData, spriteBlob)
}

function initializeConradVisuals(
    spriteState: ResourceSpriteState,
    conradVisualVariants: { id: number, palette: Uint8Array, paletteSlot: number }[]
) {
    spriteState.loadedConradVisualsByVariantId = initializeConradVisualsByVariant(
        conradVisualVariants,
        spriteState.resolvedSpriteSet
    )
}

export {
    initializeConradVisuals,
    loadMonsterResolvedSpriteSet,
    loadSpriteOffsets,
}
