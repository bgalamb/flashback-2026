import { CreateInitPGE, createPgeScriptEntry, InitPGE, PgeScriptNode, readLeUint16, readLeUint32 } from '../core/intern'

interface ParsedPgeEntryData {
    type: number
    posX: number
    posY: number
    objNodeNumber: number
    life: number
    counterValues: number[]
    objectType: number
    initRoom: number
    roomLocation: number
    initFlags: number
    collidingIconNum: number
    iconNum: number
    objectId: number
    skill: number
    mirrorX: number
    flags: number
    numberOfCollisionSegments: number
    textNum: number
}

interface ParsedPgeFileData {
    pgeNum: number
    pgeInit: ParsedPgeEntryData[]
}

interface ParsedObjData {
    type: number
    dx: number
    dy: number
    initObjType: number
    opcode1: number
    opcode2: number
    flags: number
    opcode3: number
    initObjNumber: number
    opcodeArg1: number
    opcodeArg2: number
    opcodeArg3: number
}

interface ParsedObjectNodeData {
    lastObjNumber: number
    numObjects: number
    objects: ParsedObjData[]
}

interface ParsedObjFileData {
    numObjectNodes: number
    objectNodesMap: ParsedObjectNodeData[]
}

interface ParsedTbnFileData {
    texts: string[]
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
        target.posX = source.posX
        target.posY = source.posY
        target.scriptNodeIndex = source.objNodeNumber
        target.life = source.life
        target.counterValues = new Array(4).fill(0)
        for (let counterIndex = 0; counterIndex < 4; ++counterIndex) {
            target.counterValues[counterIndex] = Array.isArray(source.counterValues) ? (source.counterValues[counterIndex] || 0) : 0
        }
        target.objectType = source.objectType
        target.initRoom = source.initRoom
        target.roomLocation = source.roomLocation
        target.initFlags = source.initFlags
        target.collidingIconNum = source.collidingIconNum
        target.iconNum = source.iconNum
        target.objectId = source.objectId
        target.skill = source.skill
        target.mirrorX = source.mirrorX
        target.flags = source.flags
        target.numberOfCollisionSegments = source.numberOfCollisionSegments
        target.textNum = source.textNum
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
        const objects = new Array(sourceNode.numObjects)
        for (let j = 0; j < sourceNode.numObjects; ++j) {
            const sourceObject = sourceNode.objects[j]
            if (!sourceObject) {
                throw new Error(`Parsed object node ${i} object ${j} is missing`)
            }
            const targetObject = createPgeScriptEntry()
            targetObject.type = sourceObject.type
            targetObject.dx = sourceObject.dx
            targetObject.dy = sourceObject.dy
            targetObject.nextScriptStateType = sourceObject.initObjType
            targetObject.opcode1 = sourceObject.opcode1
            targetObject.opcode2 = sourceObject.opcode2
            targetObject.flags = sourceObject.flags
            targetObject.opcode3 = sourceObject.opcode3
            targetObject.nextScriptEntryIndex = sourceObject.initObjNumber
            targetObject.opcodeArg1 = sourceObject.opcodeArg1
            targetObject.opcodeArg2 = sourceObject.opcodeArg2
            targetObject.opcodeArg3 = sourceObject.opcodeArg3
            objects[j] = targetObject
        }
        objectNodesMap[i] = {
            lastObjNumber: sourceNode.lastObjNumber,
            numObjects: sourceNode.numObjects,
            objects
        }
    }
    return {
        numObjectNodes: parsed.numObjectNodes,
        objectNodesMap
    }
}

function hydrateParsedTbnData(parsed: ParsedTbnFileData): Uint8Array[] {
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.texts)) {
        throw new Error('Parsed TBN data is missing or invalid')
    }
    const encoder = new TextEncoder()
    return parsed.texts.map((text, index) => {
        if (typeof text !== 'string') {
            throw new Error(`Parsed TBN text ${index} is invalid`)
        }
        const raw = encoder.encode(text)
        const out = new Uint8Array(raw.length + 1)
        out.set(raw)
        return out
    })
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
        const spriteIndex = readLeUint16(offDataForAMonster.buffer, index)
        if (spriteIndex === spriteTerminator) {
            break
        }
        if (spriteIndex >= numSprites) {
            throw new Error(`Invalid sprite index: ${spriteIndex}`)
        }
        const spriteOffset = readLeUint32(offDataForAMonster.buffer, index + 2)
        resolvedSpriteViewsByIndex[spriteIndex] = spriteOffset === invalidOffset ? null : sprDataForAMonster.subarray(spriteOffset)
    }
    return resolvedSpriteViewsByIndex
}

export { ParsedPgeEntryData, ParsedPgeFileData, ParsedObjData, ParsedObjectNodeData, ParsedObjFileData, ParsedTbnFileData, hydrateParsedPGEData, hydrateParsedOBJData, hydrateParsedTbnData, buildResolvedSpriteViewsByIndex }
