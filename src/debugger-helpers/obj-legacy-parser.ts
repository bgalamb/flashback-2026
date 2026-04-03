import { createPgeScriptEntry, PgeScriptNode, readLeUint16, readLeUint32 } from "../core/intern"

function decodeLegacyOBJData(tmp: Uint8Array, size: number, numObjectNodes: number): { numObjectNodes: number, objectNodesMap: PgeScriptNode[] } {
    const offsets = new Uint32Array(256)
    let tmpOffset = 0
    for (let i = 0; i < numObjectNodes; ++i) {
        offsets[i] = readLeUint32(tmp, tmpOffset)
        tmpOffset += 4
    }
    offsets[numObjectNodes] = size
    let numObjectsCount = 0
    const objectsCount = new Uint16Array(256)
    for (let i = 0; i < numObjectNodes; ++i) {
        const diff = offsets[i + 1] - offsets[i]
        if (diff !== 0) {
            objectsCount[numObjectsCount] = ((diff - 2) / 0x12) >> 0
            ++numObjectsCount
        }
    }
    let prevOffset = 0
    let prevNode: PgeScriptNode = null
    let iObj = 0
    const objectNodesMap: PgeScriptNode[] = new Array(255)
    for (let i = 0; i < numObjectNodes; ++i) {
        if (prevOffset !== offsets[i]) {
            const on: PgeScriptNode = {
                lastObjNumber: 0,
                objects: null,
                numObjects: 0
            }

            let objData = offsets[i]
            on.lastObjNumber = readLeUint16(tmp, objData)
            objData += 2
            on.numObjects = objectsCount[iObj]
            on.objects = new Array(on.numObjects)
            for (let j = 0; j < on.numObjects; ++j) {
                const obj = createPgeScriptEntry()
                obj.type = readLeUint16(tmp, objData)
                objData += 2
                obj.dx = tmp[objData++] << 24 >> 24
                obj.dy = tmp[objData++] << 24 >> 24
                obj.nextScriptStateType = readLeUint16(tmp, objData)
                objData += 2
                obj.opcode2 = tmp[objData++]
                obj.opcode1 = tmp[objData++]
                obj.flags = tmp[objData++]
                obj.opcode3 = tmp[objData++]
                obj.nextScriptEntryIndex = readLeUint16(tmp, objData)
                objData += 2
                obj.opcodeArg1 = readLeUint16(tmp, objData) << 16 >> 16
                objData += 2
                obj.opcodeArg2 = readLeUint16(tmp, objData) << 16 >> 16
                objData += 2
                obj.opcodeArg3 = readLeUint16(tmp, objData) << 16 >> 16
                objData += 2
                on.objects[j] = obj
            }
            ++iObj
            prevOffset = offsets[i]
            prevNode = on
        }
        objectNodesMap[i] = prevNode
    }
    return { numObjectNodes, objectNodesMap }
}

function encodeLegacyOBJDataAsJson(data: Uint8Array): string {
    const numObjectNodes = readLeUint16(data)
    if (numObjectNodes !== 230) {
        throw new Error(`Assertion failed: ${numObjectNodes}`)
    }
    const parsed = decodeLegacyOBJData(data.subarray(2, data.length - 2), data.length - 2, numObjectNodes)
    return JSON.stringify({
        numObjectNodes: parsed.numObjectNodes,
        objectNodesMap: parsed.objectNodesMap.slice(0, parsed.numObjectNodes)
    }, null, 2)
}

export { decodeLegacyOBJData, encodeLegacyOBJDataAsJson }
