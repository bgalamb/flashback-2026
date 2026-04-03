import { BankSlot, READ_BE_UINT32 } from '../core/intern'
import { UINT16_MAX } from '../core/game_constants'
import { assert } from '../core/assert'

interface ResourceBankCacheState {
    bankData: Uint8Array
    bankDataHead: Uint8Array
    bankDataTail: number
    bankBuffersCount: number
    bankBuffers: BankSlot[]
}

function createResourceBankCache(bankDataSize: number, bufferCount: number): ResourceBankCacheState {
    const bankData = new Uint8Array(bankDataSize)
    return {
        bankData,
        bankDataHead: bankData,
        bankDataTail: bankDataSize,
        bankBuffersCount: 0,
        bankBuffers: new Array(bufferCount).fill(null).map(() => ({
            entryNum: 0,
            ptr: null,
        })),
    }
}

function clearResourceBankCache(cache: ResourceBankCacheState) {
    cache.bankBuffersCount = 0
    cache.bankDataHead = cache.bankData
}

function findResourceBankData(cache: ResourceBankCacheState, num: number) {
    for (let i = 0; i < cache.bankBuffersCount; ++i) {
        if (cache.bankBuffers[i].entryNum === num) {
            return cache.bankBuffers[i].ptr
        }
    }
    return null
}

function loadResourceBankData(
    cache: ResourceBankCacheState,
    mbk: Uint8Array,
    num: number,
    size: number,
    unpack: (dst: Uint8Array, dstSize: number, src: Uint8Array, srcSize: number) => boolean
) {
    const ptr = mbk.subarray(num * 6)
    let dataOffset = READ_BE_UINT32(ptr)

    // First byte of the data buffer corresponds to the total count of entries.
    dataOffset &= UINT16_MAX

    const avail = cache.bankDataTail - cache.bankDataHead.byteOffset
    if (avail < size) {
        clearResourceBankCache(cache)
    }

    assert(!((cache.bankDataHead.byteOffset + size) > cache.bankDataTail), `Assertion failed: ${cache.bankDataHead.byteOffset + size} <= ${cache.bankDataTail}`)
    assert(!(cache.bankBuffersCount >= cache.bankBuffers.length), `Assertion failed: ${cache.bankBuffersCount} < ${cache.bankBuffers.length}`)

    cache.bankBuffers[cache.bankBuffersCount].entryNum = num
    cache.bankBuffers[cache.bankBuffersCount].ptr = cache.bankDataHead

    const data = mbk.subarray(dataOffset)
    if ((ptr[4] & 0x80) !== 0) {
        cache.bankDataHead.set(data.subarray(0, size))
    } else {
        assert(!(dataOffset <= 4), `Assertion failed: ${dataOffset} > 4`)
        assert(!(size !== (READ_BE_UINT32(data.buffer, data.byteOffset - 4) << 32 >> 32)), `Assertion failed: ${size} === ${(READ_BE_UINT32(data.buffer, data.byteOffset - 4) << 32 >> 32)}`)
        if (!unpack(cache.bankDataHead, cache.bankDataTail, data, 0)) {
            console.error(`Bad CRC for bank data ${num}`)
        }
    }

    const bankData = cache.bankDataHead
    cache.bankDataHead = cache.bankDataHead.subarray(size)
    return bankData
}

export {
    ResourceBankCacheState,
    clearResourceBankCache,
    createResourceBankCache,
    findResourceBankData,
    loadResourceBankData,
}
