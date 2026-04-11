import { CreateInitPGE, InitPGE, readLeUint16 } from "../../core/intern"

function decodeLegacyPGEData(p: Uint8Array, maxPges: number): { pgeNum: number, pgeInit: InitPGE[] } {
    let index = 0
    const pgeNum = readLeUint16(p)
    index += 2
    const pgeInit: InitPGE[] = new Array(maxPges).fill(null).map(() => CreateInitPGE())
    if (pgeNum > pgeInit.length) {
        throw (`Assertion failed: ${pgeNum} <= ${pgeInit.length}`)
    }
    for (let i = 0; i < pgeNum; ++i) {
        const pge: InitPGE = pgeInit[i]
        pge.type = readLeUint16(p, index)
        index += 2
        pge.posX = readLeUint16(p, index)
        index += 2
        pge.posY = readLeUint16(p, index)
        index += 2
        pge.scriptNodeIndex = readLeUint16(p, index)
        index += 2
        pge.life = readLeUint16(p, index)
        index += 2
        for (let lc = 0; lc < 4; ++lc) {
            pge.counterValues[lc] = readLeUint16(p, index)
            index += 2
        }
        pge.objectType = p[index++]
        pge.initRoom = p[index++]
        pge.roomLocation = p[index++]
        pge.initFlags = p[index++]
        pge.collidingIconNum = p[index++]
        pge.iconNum = p[index++]
        pge.objectId = p[index++]
        pge.skill = p[index++]
        pge.mirrorX = p[index++]
        pge.flags = p[index++]
        pge.numberOfCollisionSegments = p[index++]
        index++
        pge.textNum = readLeUint16(p, index)
        index += 2
    }
    return { pgeNum, pgeInit }
}

function encodeLegacyPGEDataAsJson(p: Uint8Array, maxPges: number): string {
    const parsed = decodeLegacyPGEData(p, maxPges)
    return JSON.stringify({
        pgeNum: parsed.pgeNum,
        pgeInit: parsed.pgeInit.slice(0, parsed.pgeNum)
    }, null, 2)
}

export { decodeLegacyPGEData, encodeLegacyPGEDataAsJson }
