import { CreateInitPGE, createPgeScriptEntry, InitPGE, PgeScriptNode, READ_LE_UINT16, READ_LE_UINT32 } from '../intern'

interface ParsedPgeEntryData {
    type: number
    pos_x: number
    pos_y: number
    obj_node_number: number
    life: number
    counter_values: number[]
    object_type: number
    init_room: number
    room_location: number
    init_flags: number
    colliding_icon_num: number
    icon_num: number
    object_id: number
    skill: number
    mirror_x: number
    flags: number
    number_of_collision_segments: number
    text_num: number
}

interface ParsedPgeFileData {
    pgeNum: number
    pgeInit: ParsedPgeEntryData[]
}

interface ParsedObjData {
    type: number
    dx: number
    dy: number
    init_obj_type: number
    opcode1: number
    opcode2: number
    flags: number
    opcode3: number
    init_obj_number: number
    opcode_arg1: number
    opcode_arg2: number
    opcode_arg3: number
}

interface ParsedObjectNodeData {
    last_obj_number: number
    num_objects: number
    objects: ParsedObjData[]
}

interface ParsedObjFileData {
    numObjectNodes: number
    objectNodesMap: ParsedObjectNodeData[]
}

function hydrateParsedPGEData(parsed: ParsedPgeFileData, maxPges: number): { pgeNum: number, pgeInit: InitPGE[] } {
    if (!parsed || typeof parsed !== 'object') {
        throw new Error('Parsed PGE data is missing or invalid')
    }
    const pgeNum = parsed.pgeNum
    if (typeof pgeNum !== 'number' || Math.floor(pgeNum) !== pgeNum || pgeNum < 0 || pgeNum > maxPges) {
        throw new Error(`Invalid parsed PGE count: ${pgeNum}`)
    }
    if (!Array.isArray(parsed.pgeInit) || parsed.pgeInit.length < pgeNum) {
        throw new Error(`Parsed PGE entries are missing. Expected at least ${pgeNum}, got ${parsed.pgeInit ? parsed.pgeInit.length : 0}`)
    }

    const pgeInit: InitPGE[] = new Array(maxPges).fill(null).map(() => CreateInitPGE())
    for (let i = 0; i < pgeNum; ++i) {
        const source = parsed.pgeInit[i]
        if (!source) {
            throw new Error(`Parsed PGE entry ${i} is missing`)
        }
        const target = pgeInit[i]
        target.type = source.type
        target.pos_x = source.pos_x
        target.pos_y = source.pos_y
        target.script_node_index = source.obj_node_number
        target.life = source.life
        target.counter_values = new Array(4).fill(0)
        for (let counterIndex = 0; counterIndex < 4; ++counterIndex) {
            target.counter_values[counterIndex] = Array.isArray(source.counter_values) ? (source.counter_values[counterIndex] || 0) : 0
        }
        target.object_type = source.object_type
        target.init_room = source.init_room
        target.room_location = source.room_location
        target.init_flags = source.init_flags
        target.colliding_icon_num = source.colliding_icon_num
        target.icon_num = source.icon_num
        target.object_id = source.object_id
        target.skill = source.skill
        target.mirror_x = source.mirror_x
        target.flags = source.flags
        target.number_of_collision_segments = source.number_of_collision_segments
        target.text_num = source.text_num
    }
    return { pgeNum, pgeInit }
}

function hydrateParsedOBJData(parsed: ParsedObjFileData): { numObjectNodes: number, objectNodesMap: PgeScriptNode[] } {
    if (!parsed || typeof parsed !== 'object') {
        throw new Error('Parsed OBJ data is missing or invalid')
    }
    if (typeof parsed.numObjectNodes !== 'number' || Math.floor(parsed.numObjectNodes) !== parsed.numObjectNodes || parsed.numObjectNodes < 0) {
        throw new Error(`Invalid parsed object node count: ${parsed.numObjectNodes}`)
    }
    if (!Array.isArray(parsed.objectNodesMap) || parsed.objectNodesMap.length < parsed.numObjectNodes) {
        throw new Error(`Parsed object node entries are missing. Expected at least ${parsed.numObjectNodes}, got ${parsed.objectNodesMap ? parsed.objectNodesMap.length : 0}`)
    }

    const objectNodesMap: PgeScriptNode[] = new Array(parsed.numObjectNodes)
    for (let i = 0; i < parsed.numObjectNodes; ++i) {
        const sourceNode = parsed.objectNodesMap[i]
        if (!sourceNode) {
            throw new Error(`Parsed object node ${i} is missing`)
        }
        const objects = new Array(sourceNode.num_objects)
        for (let j = 0; j < sourceNode.num_objects; ++j) {
            const sourceObject = sourceNode.objects[j]
            if (!sourceObject) {
                throw new Error(`Parsed object node ${i} object ${j} is missing`)
            }
            const targetObject = createPgeScriptEntry()
            targetObject.type = sourceObject.type
            targetObject.dx = sourceObject.dx
            targetObject.dy = sourceObject.dy
            targetObject.next_script_state_type = sourceObject.init_obj_type
            targetObject.opcode1 = sourceObject.opcode1
            targetObject.opcode2 = sourceObject.opcode2
            targetObject.flags = sourceObject.flags
            targetObject.opcode3 = sourceObject.opcode3
            targetObject.next_script_entry_index = sourceObject.init_obj_number
            targetObject.opcode_arg1 = sourceObject.opcode_arg1
            targetObject.opcode_arg2 = sourceObject.opcode_arg2
            targetObject.opcode_arg3 = sourceObject.opcode_arg3
            objects[j] = targetObject
        }
        objectNodesMap[i] = {
            last_obj_number: sourceNode.last_obj_number,
            num_objects: sourceNode.num_objects,
            objects
        }
    }
    return {
        numObjectNodes: parsed.numObjectNodes,
        objectNodesMap
    }
}

function buildResolvedSpriteViewsByIndex(
    offDataForAMonster: Uint8Array,
    sprDataForAMonster: Uint8Array,
    numSprites: number,
    spriteTerminator: number,
    invalidOffset: number,
    entrySize: number
): Array<Uint8Array | null> {
    const resolvedSpriteViewsByIndex: Array<Uint8Array | null> = new Array(numSprites).fill(null)
    if (!offDataForAMonster || !sprDataForAMonster) {
        return resolvedSpriteViewsByIndex
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
        resolvedSpriteViewsByIndex[spriteIndex] = spriteOffset === invalidOffset ? null : sprDataForAMonster.subarray(spriteOffset)
    }
    return resolvedSpriteViewsByIndex
}

export { ParsedPgeEntryData, ParsedPgeFileData, ParsedObjData, ParsedObjectNodeData, ParsedObjFileData, hydrateParsedPGEData, hydrateParsedOBJData, buildResolvedSpriteViewsByIndex }
