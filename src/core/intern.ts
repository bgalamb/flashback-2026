import { Game } from "../game/game"
import { uint16Max, uint8Max } from './game_constants'
import { assert } from "./assert"

const Skill = {
    kSkillEasy: 0,
    kSkillNormal: 1,
    kSkillExpert: 2,
}

interface Color {
    r: number
    g: number
    b: number
}

interface Point {
    x: number
    y: number
}

interface Demo {
    name: string
    level: number
    room: number
    x: number
    y: number
}

interface Level {
    name: string
    name2: string
    cutsceneId: number
    sound: number
    track: number
}

interface InitPGE {
    type: number
    posX: number
    posY: number
    scriptNodeIndex: number
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

const CreateInitPGE = () => ({
    type: 0,
    posX: 0,
    posY: 0,
    scriptNodeIndex: 0,
    life: 0,
    counterValues: [],
    objectType: 0,
    initRoom: 0,
    roomLocation: 0,
    initFlags: 0,
    collidingIconNum: 0,
    iconNum: 0,
    objectId: 0,
    skill: 0,
    mirrorX: 0,
    flags: 0,
    numberOfCollisionSegments: 0,
    textNum: 0
})

const CreatePGE = () => ({
    scriptStateType: 0,
    posX: 0,
    posY: 0,
    animSeq: 0,
    roomLocation: 0,
    life: 0,
    counterValue: 0,
    collisionSlot: uint16Max,
    unkF: 0,
    animNumber: 0,
    flags: 0,
    index: 0,
    firstScriptEntryIndex: 0,
    initPge: null,
})

const createLivePGE = () => ({
    scriptStateType: 0,
    posX: 0,
    posY: 0,
    animSeq: 0,
    roomLocation: 0,
    life: 0,
    counterValue: 0,
    collisionSlot: uint16Max,
    unkF: 0,
    animNumber: 0,
    flags: 0,
    index: 0,
    firstScriptEntryIndex: 0,
    initPge: null
})

interface LivePGE {
    scriptStateType: number
    posX: number
    posY: number
    animSeq: number
    roomLocation: number
    life: number
    counterValue: number
    collisionSlot: number
    unkF: number
    animNumber: number
    flags: number
    index: number
    firstScriptEntryIndex: number
    initPge: InitPGE
}

interface LivePgeRegistry {
    initByIndex: InitPGE[]
    liveByIndex: LivePGE[]
    liveByRoom: LivePGE[][]
    activeFrameByIndex: Array<LivePGE | null>
    activeFrameList: LivePGE[]
}

const createLivePgeRegistry = (liveByIndex: LivePGE[]): LivePgeRegistry => ({
    initByIndex: [],
    liveByIndex,
    liveByRoom: new Array(liveByIndex.length).fill(null).map(() => []),
    activeFrameByIndex: new Array<LivePGE | null>(liveByIndex.length).fill(null),
    activeFrameList: []
})

interface PendingPgeSignal {
    senderPgeIndex: number
    signalId: number
}

interface ResolvedSpriteSet {
    spritesByIndex: Array<Uint8Array | null>
}

interface LoadedMonsterVisual {
    monsterId: number
    monsterScriptNodeIndex: number
    palette: Uint8Array
    paletteSlot: number
    resolvedSpriteSet: ResolvedSpriteSet
}

interface LoadedConradVisual {
    id: number
    palette: Uint8Array
    paletteSlot: number
    resolvedSpriteSet: ResolvedSpriteSet
}

const createPgeScriptEntry = () => ({
    type: 0,
    dx: 0,
    dy: 0,
    nextScriptStateType: 0,
    nextScriptEntryIndex: 0,
    flags: 0,
    opcode1: 0,
    opcode2: 0,
    opcode3: 0,
    opcodeArg1: 0,
    opcodeArg2: 0,
    opcodeArg3: 0
})

interface PgeScriptEntry {
    type: number
    dx: number
    dy: number
    nextScriptStateType: number
    nextScriptEntryIndex: number
    flags: number
    opcode1: number
    opcode2: number
    opcode3: number
    opcodeArg1: number
    opcodeArg2: number
    opcodeArg3: number
}

interface PgeScriptNode {
    lastObjNumber: number
    objects: PgeScriptEntry[]
    numObjects: number
}

interface PgeOpcodeArgs {
    pge: LivePGE
    a: number
    b: number
}

interface AnimBufferState {
    x: number
    y: number
    w: number
    h: number
    dataPtr: Uint8Array
    pge: LivePGE
    paletteColorMaskOverride: number
}

function createAnimBufferEntry(): AnimBufferState {
    return {
        x: 0,
        y: 0,
        w: 0,
        h: 0,
        dataPtr: null,
        pge: null,
        paletteColorMaskOverride: -1,
    }
}

type PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => number
type PgeZOrderComparator = (livePGE1: LivePGE, livePGE2: LivePGE, p1: number, p2: number, game: Game) => number

class AnimBuffers {
    _states: Array<AnimBufferState[]> = [null, null, null, null]
    _curPos: number[] = [0, 0, 0, 0]

    addState(stateNum: number, x: number, y: number, dataPtr: Uint8Array, pge: LivePGE, w: number = 0, h: number = 0, paletteColorMaskOverride: number = -1) {
        assert(!(stateNum >= 4), `Assertion failed: ${stateNum} < 4`)
        const curPos = this._curPos[stateNum]
        const index = curPos === uint8Max ? 0 : curPos + 1
        if (!this._states[stateNum]) {
            this._states[stateNum] = []
        }
        if (!this._states[stateNum][index]) {
            this._states[stateNum][index] = createAnimBufferEntry()
        }
        const state: AnimBufferState = this._states[stateNum][index]
        state.x = x
        state.y = y
        state.w = w
        state.h = h
        state.dataPtr = dataPtr
        state.pge = pge
        state.paletteColorMaskOverride = paletteColorMaskOverride
        this._curPos[stateNum] = (this._curPos[stateNum] + 1) % 256
    }
}

interface CollisionSlot {
    collisionGridPositionIndex: number
    pge: LivePGE
    index: number
}

interface ActiveRoomCollisionSlotWindow {
    left: Array<CollisionSlot[] | null>
    current: Array<CollisionSlot[] | null>
    right: Array<CollisionSlot[] | null>
}

const createActiveRoomCollisionSlotWindow = () => ({
    left: new Array<CollisionSlot[] | null>(0x30).fill(null),
    current: new Array<CollisionSlot[] | null>(0x30).fill(null),
    right: new Array<CollisionSlot[] | null>(0x30).fill(null)
})

interface BankSlot {
    entryNum: number
    ptr: Uint8Array
}

interface RoomCollisionGridPatchRestoreSlot {
    nextPatchedRegionRestoreSlot: RoomCollisionGridPatchRestoreSlot
    patchedGridDataView: Int8Array
    patchedCellCount: number
    originalGridCellValues: Uint8Array
}

interface InventoryItem {
    iconNum: number
    initPge: InitPGE
    livePge: LivePGE
}

interface SoundFx {
    offset: number
    len: number
    freq: number
    data: Uint8Array
    peak: number
}

const readBeUint16 = (ptr: ArrayBuffer|Buffer|Uint8Array, offset = 0): number => {
    if (ptr instanceof Uint8Array) {
        return (ptr[offset] << 8) | ptr[1 + offset]
    }
    const b = ptr instanceof Buffer ? new DataView(ptr.buffer, ptr.offset + offset) : new DataView(ptr, offset)
	return (b.getUint8(0) << 8) | b.getUint8(1)
}

const readBeUint32 = (ptr: ArrayBuffer|Buffer|Uint8Array, offset = 0): number => {
    if (ptr instanceof Uint8Array) {
        return ((ptr[offset] << 24) | (ptr[1 + offset] << 16) | (ptr[2 + offset] << 8) | ptr[3 + offset]) >>> 0
    }
    const b = ptr instanceof Buffer ? new DataView(ptr.buffer, ptr.offset + offset) : new DataView(ptr, offset)
	return ((b.getUint8(0) << 24) | (b.getUint8(1) << 16) | (b.getUint8(2) << 8) | b.getUint8(3)) >>> 0
}

const readLeUint16 = (ptr: ArrayBuffer|Buffer|Uint8Array, offset = 0): number => {
    if (ptr instanceof Uint8Array) {
        return (ptr[1 + offset] << 8) | ptr[offset]
    }
	const b = ptr instanceof Buffer ? new DataView(ptr.buffer, ptr.offset + offset) : new DataView(ptr, offset)
	return (b.getUint8(1) << 8) | b.getUint8(0)
}

const readLeUint32 = (ptr: ArrayBuffer|Buffer|Uint8Array, offset = 0): number => {
    if (ptr instanceof Uint8Array) {
        return ((ptr[3 + offset] << 24) | (ptr[2 + offset] << 16) | (ptr[1 + offset] << 8) | ptr[offset]) >>> 0
    }
	const b = ptr instanceof Buffer ? new DataView(ptr.buffer, ptr.offset + offset) : new DataView(ptr, offset)
	return ((b.getUint8(3) << 24) | (b.getUint8(2) << 16) | (b.getUint8(1) << 8) | b.getUint8(0)) >>> 0
}

const addcS16 = (a: number, b: number) => {
	a += b
	if (a < -32768) {
		a = -32768
	} else if (a > 32767) {
		a = 32767
	}
	return a
}

const s8ToS16 = (a: number) => {
	if (a < -128) {
		return -32768
	} else if (a > 127) {
		return 32767
	} else {
		const u8 = (a ^ 0x80)
		return ((u8 << 8) | u8) - 32768
	}
}

const CLIP = (val: number, a: number, b: number) => {
    if (val < a) {
        return a
    } else if (val > b) {
        return b
    }
    return val
}

class Buffer {
    offset: number
    buffer: ArrayBuffer

    constructor(buffer: ArrayBuffer, off = 0) {
        this.buffer = buffer
        this.offset = off
    }

    from(offset: number) {
        const buf = new Buffer(this.buffer, offset + this.offset)
        return buf
    }

    getUint8Array() {
        return new Uint8Array(this.buffer, this.offset)
    }
}

export { createPgeScriptEntry, CreatePGE, CreateInitPGE, createLivePGE, createLivePgeRegistry, createActiveRoomCollisionSlotWindow, Skill, Color, Point, Demo, Level, InitPGE, LivePGE, PendingPgeSignal, ResolvedSpriteSet, LoadedMonsterVisual, LoadedConradVisual, PgeScriptEntry, PgeScriptNode, PgeOpcodeArgs, AnimBufferState, AnimBuffers, CollisionSlot, ActiveRoomCollisionSlotWindow, RoomCollisionGridPatchRestoreSlot, LivePgeRegistry, BankSlot, InventoryItem, SoundFx, readBeUint16, readBeUint32, readLeUint16, readLeUint32, CLIP, Buffer, addcS16, s8ToS16 }
export type { PgeOpcodeHandler, PgeZOrderComparator }
