import { READ_BE_UINT16 } from '../core/intern'
import { clearResourceBankCache, findResourceBankData, loadResourceBankData, ResourceBankCacheState } from './bank-cache'

function clearBankData(bankCache: ResourceBankCacheState) {
    clearResourceBankCache(bankCache)
}

function getBankDataSize(mbk: Uint8Array, bnq: Uint8Array, bankIndex: number) {
    let entryLength = READ_BE_UINT16(mbk, bankIndex * 6 + 4)
    if (entryLength & 0x8000) {
        if (mbk === bnq) {
            // demo .bnq use signed int
            entryLength = -(entryLength << 16 >> 16)
        } else {
            entryLength &= 0x7FFF
        }
    }

    return entryLength * 32
}

function findBankData(bankCache: ResourceBankCacheState, bankIndex: number) {
    return findResourceBankData(bankCache, bankIndex)
}

function loadBankData(
    bankCache: ResourceBankCacheState,
    mbk: Uint8Array,
    bnq: Uint8Array,
    bankIndex: number,
    unpack: (dst: Uint8Array, dstSize: number, src: Uint8Array, srcSize: number) => boolean
) {
    const size = getBankDataSize(mbk, bnq, bankIndex)
    return loadResourceBankData(bankCache, mbk, bankIndex, size, unpack)
}

export {
    clearBankData,
    findBankData,
    getBankDataSize,
    loadBankData,
}
