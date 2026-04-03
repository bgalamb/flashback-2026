import { readBeUint16 } from '../core/intern'
import { hydrateParsedOBJData, hydrateParsedPGEData, hydrateParsedTbnData } from './parsers'
import { ResourceLevelState, ResourceSpriteState } from './resource-state'
import { decodePackedSpriteSet } from './sprite-store'

function toCamelCaseKey(key: string) {
    return key.replace(/_([a-zA-Z0-9])/g, (_match, char: string) => char.toUpperCase())
}

function normalizeParsedJson(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map((entry) => normalizeParsedJson(entry))
    }
    if (!value || typeof value !== 'object') {
        return value
    }
    const normalized: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value)) {
        normalized[toCamelCaseKey(key)] = normalizeParsedJson(entry)
    }
    return normalized
}

function decodeParsedPgeIntoLevelState(levelState: ResourceLevelState, json: string) {
    const parsed = hydrateParsedPGEData(normalizeParsedJson(JSON.parse(json)), levelState.pgeAllInitialStateFromFile.length)
    levelState.pgeTotalNumInFile = parsed.pgeNum
    levelState.pgeAllInitialStateFromFile = parsed.pgeInit
}

function decodeParsedObjIntoLevelState(levelState: ResourceLevelState, json: string) {
    const parsed = hydrateParsedOBJData(normalizeParsedJson(JSON.parse(json)))
    levelState.numObjectNodes = parsed.numObjectNodes
    levelState.objectNodesMap = parsed.objectNodesMap
}

function decodeParsedTbnIntoLevelState(levelState: ResourceLevelState, json: string) {
    levelState.tbn = hydrateParsedTbnData(normalizeParsedJson(JSON.parse(json)))
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
    spriteState.numSpc = readBeUint16(data.buffer) / 2
}

export {
    decodeParsedObjIntoLevelState,
    decodeParsedPgeIntoLevelState,
    decodeParsedTbnIntoLevelState,
    loadCollisionAsset,
    loadPackedSpriteAsset,
    loadSpcAsset,
}
