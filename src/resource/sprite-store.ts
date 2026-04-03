import { LoadedConradVisual, ResolvedSpriteSet, READ_BE_UINT32 } from '../intern'
import { assert } from '../assert'
import { buildResolvedSpriteViewsByIndex } from './parsers'

const kPersoDatSize = 178647
const kSpriteTerminator = 0xFFFF
const kInvalidSpriteOffset = 0xFFFFFFFF
const kSpriteOffsetEntrySize = 6
const kMonsterSpriteBufferSize = 0x10000

interface ConradVisualVariant {
    id: number
    palette: Uint8Array
    paletteSlot: number
}

function createEmptyResolvedSpriteSet(numSprites: number): ResolvedSpriteSet {
    return {
        spritesByIndex: new Array(numSprites).fill(null)
    }
}

function decodePackedSpriteSet(
    data: Uint8Array,
    dataLength: number,
    numSprites: number,
    spmOffsetsTable: Uint32Array,
    unpack: (dst: Uint8Array, dstSize: number, src: Uint8Array, srcSize: number) => boolean
): { spr1: Uint8Array, sprm: Uint8Array, resolvedSpriteSet: ResolvedSpriteSet } {
    const packedSize = READ_BE_UINT32(data, dataLength - 4)
    const sprm = new Uint8Array(kMonsterSpriteBufferSize)
    let spr1: Uint8Array | null = null

    if (packedSize === kPersoDatSize) {
        spr1 = new Uint8Array(packedSize)
        if (!unpack(spr1, packedSize, data, dataLength)) {
            throw new Error('Bad CRC for SPM data')
        }
    } else {
        assert(!(packedSize > sprm.byteLength), `Assertion failed: ${packedSize} <= ${sprm.byteLength}`)
        if (!unpack(sprm, sprm.byteLength, data, dataLength)) {
            throw new Error('Bad CRC for SPRM data')
        }
    }

    const resolvedSpriteSet = createEmptyResolvedSpriteSet(numSprites)
    for (let i = 0; i < numSprites; ++i) {
        const offset = spmOffsetsTable[i]
        if (offset >= kPersoDatSize) {
            resolvedSpriteSet.spritesByIndex[i] = sprm.subarray(offset - kPersoDatSize)
        } else {
            resolvedSpriteSet.spritesByIndex[i] = spr1 ? spr1.subarray(offset) : null
        }
    }

    return {
        spr1,
        sprm,
        resolvedSpriteSet,
    }
}

function buildResolvedSpriteSet(numSprites: number, offData: Uint8Array, sprData: Uint8Array): ResolvedSpriteSet {
    return {
        spritesByIndex: buildResolvedSpriteViewsByIndex(
            offData,
            sprData,
            numSprites,
            kSpriteTerminator,
            kInvalidSpriteOffset,
            kSpriteOffsetEntrySize
        )
    }
}

function initializeConradVisualsByVariant(
    variants: ConradVisualVariant[],
    resolvedSpriteSet: ResolvedSpriteSet
): Map<number, LoadedConradVisual> {
    const visuals = new Map<number, LoadedConradVisual>()
    for (const conradVisualVariant of variants) {
        visuals.set(conradVisualVariant.id, {
            id: conradVisualVariant.id,
            palette: conradVisualVariant.palette,
            paletteSlot: conradVisualVariant.paletteSlot,
            resolvedSpriteSet
        })
    }
    return visuals
}

export {
    buildResolvedSpriteSet,
    createEmptyResolvedSpriteSet,
    decodePackedSpriteSet,
    initializeConradVisualsByVariant,
}
