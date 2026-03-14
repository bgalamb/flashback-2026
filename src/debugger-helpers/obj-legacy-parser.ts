import { createPgeScriptEntry, PgeScriptNode, READ_LE_UINT16, READ_LE_UINT32 } from "../intern"

function decodeLegacyOBJData(tmp: Uint8Array, size: number, numObjectNodes: number): { numObjectNodes: number, objectNodesMap: PgeScriptNode[] } {
    const offsets = new Uint32Array(256)
    let tmpOffset = 0
    for (let i = 0; i < numObjectNodes; ++i) {
        offsets[i] = READ_LE_UINT32(tmp, tmpOffset)
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
                last_obj_number: 0,
                objects: null,
                num_objects: 0
            }

            let objData = offsets[i]
            on.last_obj_number = READ_LE_UINT16(tmp, objData)
            objData += 2
            on.num_objects = objectsCount[iObj]
            on.objects = new Array(on.num_objects)
            for (let j = 0; j < on.num_objects; ++j) {
                const obj = createPgeScriptEntry()
                obj.type = READ_LE_UINT16(tmp, objData)
                objData += 2
                obj.dx = tmp[objData++] << 24 >> 24
                obj.dy = tmp[objData++] << 24 >> 24
                obj.next_script_state_type = READ_LE_UINT16(tmp, objData)
                objData += 2
                obj.opcode2 = tmp[objData++]
                obj.opcode1 = tmp[objData++]
                obj.flags = tmp[objData++]
                obj.opcode3 = tmp[objData++]
                obj.next_script_entry_index = READ_LE_UINT16(tmp, objData)
                objData += 2
                obj.opcode_arg1 = READ_LE_UINT16(tmp, objData) << 16 >> 16
                objData += 2
                obj.opcode_arg2 = READ_LE_UINT16(tmp, objData) << 16 >> 16
                objData += 2
                obj.opcode_arg3 = READ_LE_UINT16(tmp, objData) << 16 >> 16
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
    const numObjectNodes = READ_LE_UINT16(data)
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
