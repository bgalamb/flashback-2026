import { READ_BE_UINT16 } from '../intern'
import { hydrateParsedOBJData, hydrateParsedPGEData, hydrateParsedTbnData } from './parsers'
import { ResourceLevelState, ResourceSpriteState } from './resource-state'
import { decodePackedSpriteSet } from './sprite-store'

function decodeParsedPgeIntoLevelState(levelState: ResourceLevelState, json: string) {
    const parsed = hydrateParsedPGEData(JSON.parse(json), levelState.pgeAllInitialStateFromFile.length)
    levelState.pgeTotalNumInFile = parsed.pgeNum
    levelState.pgeAllInitialStateFromFile = parsed.pgeInit
}

function decodeParsedObjIntoLevelState(levelState: ResourceLevelState, json: string) {
    const parsed = hydrateParsedOBJData(JSON.parse(json))
    levelState.numObjectNodes = parsed.numObjectNodes
    levelState.objectNodesMap = parsed.objectNodesMap
}

function decodeParsedTbnIntoLevelState(levelState: ResourceLevelState, json: string) {
    levelState.tbn = hydrateParsedTbnData(JSON.parse(json))
}

function loadPackedSpriteAsset(
    spriteState: ResourceSpriteState,
    packedData: Uint8Array,
    packedLength: number,
    numSprites: number,
    spmOffsetsTable: Uint32Array,
    unpack: (dst: Uint8Array, dstSize: number, src: Uint8Array, srcSize: number) => boolean
) {
    const decoded = decodePackedSpriteSet(packedData, packedLength, numSprites, spmOffsetsTable, unpack)
    spriteState.spr1 = decoded.spr1
    spriteState.sprm = decoded.sprm
    spriteState.resolvedSpriteSet = decoded.resolvedSpriteSet
}

function loadCollisionAsset(
    entryName: string,
    collisionData: Int8Array,
    packedData: Uint8Array,
    packedLength: number,
    unpack: (dst: Uint8Array, dstSize: number, src: Uint8Array, srcSize: number) => boolean
) {
    if (packedLength === collisionData.byteLength) {
        new Uint8Array(collisionData.buffer).set(packedData)
        console.log(`[Resource][CT] Loaded raw CT data from '${entryName}' (${packedLength} bytes)`)
        return
    }
    if (!unpack(new Uint8Array(collisionData.buffer), collisionData.byteLength, packedData, packedLength)) {
        throw new Error('Bad CRC for collision data')
    }
    console.log(`[Resource][CT] Loaded packed CT data from '${entryName}' (${packedLength} bytes -> ${collisionData.byteLength} bytes)`)
}

function loadSpcAsset(spriteState: ResourceSpriteState, data: Uint8Array) {
    spriteState.spc = data
    spriteState.numSpc = READ_BE_UINT16(data.buffer) / 2
}

export {
    decodeParsedObjIntoLevelState,
    decodeParsedPgeIntoLevelState,
    decodeParsedTbnIntoLevelState,
    loadCollisionAsset,
    loadPackedSpriteAsset,
    loadSpcAsset,
}
