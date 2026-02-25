import { CreateInitPGE, CreateObj, InitPGE, ObjectNode, READ_LE_UINT16, READ_LE_UINT32 } from '../intern'

function decodePGEData(p: Uint8Array, maxPges: number): { pgeNum: number, pgeInit: InitPGE[] } {
    let index = 0
    const pgeNum = READ_LE_UINT16(p)
    index += 2
    const pgeInit: InitPGE[] = new Array(maxPges).fill(null).map(() => CreateInitPGE())
    if (pgeNum > pgeInit.length) {
        throw (`Assertion failed: ${pgeNum} <= ${pgeInit.length}`)
    }
    for (let i = 0; i < pgeNum; ++i) {
        const pge: InitPGE = pgeInit[i]
        pge.type = READ_LE_UINT16(p, index)
        index += 2
        pge.pos_x = READ_LE_UINT16(p, index)
        index += 2
        pge.pos_y = READ_LE_UINT16(p, index)
        index += 2
        pge.obj_node_number = READ_LE_UINT16(p, index)
        index += 2
        pge.life = READ_LE_UINT16(p, index)
        index += 2
        for (let lc = 0; lc < 4; ++lc) {
            pge.counter_values[lc] = READ_LE_UINT16(p, index)
            index += 2
        }
        pge.object_type = p[index++]
        pge.init_room = p[index++]
        pge.room_location = p[index++]
        pge.init_flags = p[index++]
        pge.colliding_icon_num = p[index++]
        pge.icon_num = p[index++]
        pge.object_id = p[index++]
        pge.skill = p[index++]
        pge.mirror_x = p[index++]
        pge.flags = p[index++]
        pge.number_of_collision_segments = p[index++]
        index++
        pge.text_num = READ_LE_UINT16(p, index)
        index += 2
    }
    return { pgeNum, pgeInit }
}

function decodeOBJData(tmp: Uint8Array, size: number, numObjectNodes: number): { numObjectNodes: number, objectNodesMap: ObjectNode[] } {
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
    let prevNode: ObjectNode = null
    let iObj = 0
    const objectNodesMap: ObjectNode[] = new Array(255)
    for (let i = 0; i < numObjectNodes; ++i) {
        if (prevOffset !== offsets[i]) {
            const on: ObjectNode = {
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
                const obj = CreateObj()
                obj.type = READ_LE_UINT16(tmp, objData)
                objData += 2
                obj.dx = tmp[objData++] << 24 >> 24
                obj.dy = tmp[objData++] << 24 >> 24
                obj.init_obj_type = READ_LE_UINT16(tmp, objData)
                objData += 2
                obj.opcode2 = tmp[objData++]
                obj.opcode1 = tmp[objData++]
                obj.flags = tmp[objData++]
                obj.opcode3 = tmp[objData++]
                obj.init_obj_number = READ_LE_UINT16(tmp, objData)
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

function processSpriteOffsetData(
    offDataForAMonster: Uint8Array,
    sprDataForAMonster: Uint8Array,
    sprData: Uint8Array[],
    numSprites: number,
    spriteTerminator: number,
    invalidOffset: number,
    entrySize: number
): void {
    if (!offDataForAMonster || !sprDataForAMonster) {
        return
    }

    for (let index = 0; index < offDataForAMonster.byteLength; index += entrySize) {
        const spriteIndex = READ_LE_UINT16(offDataForAMonster.buffer, index)
        if (spriteIndex === spriteTerminator) {
            break
        }
        if (spriteIndex >= numSprites) {
            throw new Error(`Invalid sprite index: ${spriteIndex}`)
        }
        const spriteOffset = READ_LE_UINT32(offDataForAMonster.buffer, index + 2)
        sprData[spriteIndex] = spriteOffset === invalidOffset ? null : sprDataForAMonster.subarray(spriteOffset)
    }
}

export { decodePGEData, decodeOBJData, processSpriteOffsetData }
