import { File } from './file'
import { ResourceLevelState, ResourceSpriteState, ResourceTextState, ResourceUiState } from './resource-state'
import { readFileData } from './file-access'
import { decodeParsedObjIntoLevelState, decodeParsedPgeIntoLevelState, decodeParsedTbnIntoLevelState, loadCollisionAsset, loadPackedSpriteAsset, loadSpcAsset } from './resource-level-loaders'
import { bytekiller_unpack } from '../core/unpack'

interface ResourceAssetLoaderContext {
    entryName: string
    level: ResourceLevelState
    sprites: ResourceSpriteState
    text: ResourceTextState
    ui: ResourceUiState
    numSprites: number
    spmOffsetsTable: Uint32Array
}

function decodeJsonFile(file: File, entryName: string) {
    return new TextDecoder('utf-8').decode(readFileData(file, entryName))
}

function loadParsedPgeAsset(ctx: ResourceAssetLoaderContext, file: File) {
    decodeParsedPgeIntoLevelState(ctx.level, decodeJsonFile(file, ctx.entryName))
}

function loadParsedObjAsset(ctx: ResourceAssetLoaderContext, file: File) {
    decodeParsedObjIntoLevelState(ctx.level, decodeJsonFile(file, ctx.entryName))
}

function loadParsedTbnAsset(ctx: ResourceAssetLoaderContext, file: File) {
    decodeParsedTbnIntoLevelState(ctx.level, decodeJsonFile(file, ctx.entryName))
}

function loadPackedSpriteResource(ctx: ResourceAssetLoaderContext, file: File) {
    const len = file.size()
    const data = readFileData(file, ctx.entryName)
    loadPackedSpriteAsset(ctx.sprites, data, len, ctx.numSprites, ctx.spmOffsetsTable, bytekiller_unpack)
}

function loadSpriteMaskResource(ctx: ResourceAssetLoaderContext, file: File) {
    ctx.sprites.sprm = readFileData(file, ctx.entryName, 12)
}

function loadAnimationResource(ctx: ResourceAssetLoaderContext, file: File) {
    ctx.level.ani = readFileData(file, ctx.entryName)
}

function loadBankDataResource(ctx: ResourceAssetLoaderContext, file: File) {
    ctx.level.bnq = readFileData(file, ctx.entryName)
}

function loadPaletteResource(ctx: ResourceAssetLoaderContext, file: File) {
    ctx.level.pal = readFileData(file, ctx.entryName)
}

function loadRpResource(ctx: ResourceAssetLoaderContext, file: File) {
    const len = file.size()
    if (len !== 0x4A) {
        throw new Error(`Unexpected size ${len} for '${ctx.entryName}'`)
    }
    ctx.ui.rp = readFileData(file, ctx.entryName)
}

function loadMbkResource(ctx: ResourceAssetLoaderContext, file: File) {
    ctx.level.mbk = readFileData(file, ctx.entryName)
}

function loadCollisionResource(ctx: ResourceAssetLoaderContext, file: File) {
    const len = file.size()
    const data = readFileData(file, ctx.entryName)
    loadCollisionAsset(ctx.entryName, ctx.level.ctData, data, len, bytekiller_unpack)
}

function loadFontResource(ctx: ResourceAssetLoaderContext, file: File) {
    ctx.ui.fnt = readFileData(file, ctx.entryName)
}

function loadCommandTextResource(ctx: ResourceAssetLoaderContext, file: File) {
    ctx.text.cmd = readFileData(file, ctx.entryName)
}

function loadPolygonTextResource(ctx: ResourceAssetLoaderContext, file: File) {
    ctx.text.pol = readFileData(file, ctx.entryName)
}

function loadIconResource(ctx: ResourceAssetLoaderContext, file: File) {
    ctx.ui.icnLen = file.size()
    ctx.ui.icn = readFileData(file, ctx.entryName)
}

function loadSpcResource(ctx: ResourceAssetLoaderContext, file: File) {
    loadSpcAsset(ctx.sprites, readFileData(file, ctx.entryName))
}

function loadSpriteResource(ctx: ResourceAssetLoaderContext, file: File) {
    ctx.sprites.spr1 = readFileData(file, ctx.entryName, 12)
}

export type { ResourceAssetLoaderContext }
export {
    loadAnimationResource,
    loadBankDataResource,
    loadCollisionResource,
    loadCommandTextResource,
    loadFontResource,
    loadIconResource,
    loadMbkResource,
    loadPackedSpriteResource,
    loadPaletteResource,
    loadParsedObjAsset,
    loadParsedPgeAsset,
    loadParsedTbnAsset,
    loadPolygonTextResource,
    loadRpResource,
    loadSpcResource,
    loadSpriteMaskResource,
    loadSpriteResource,
}
