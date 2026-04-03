import { Game } from "../game/game"
import { UINT16_MAX, UINT8_MAX } from './game_constants'
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
    cutscene_id: number
    sound: number
    track: number
}

interface InitPGE {
    type: number
    pos_x: number
    pos_y: number
    script_node_index: number
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

const CreateInitPGE = () => ({
    type: 0,
    pos_x: 0,
    pos_y: 0,
    script_node_index: 0,
    life: 0,
    counter_values: [],
    object_type: 0,
    init_room: 0,
    room_location: 0,
    init_flags: 0,
    colliding_icon_num: 0,
    icon_num: 0,
    object_id: 0,
    skill: 0,
    mirror_x: 0,
    flags: 0,
    number_of_collision_segments: 0,
    text_num: 0
})

const CreatePGE = () => ({
    script_state_type: 0,
    pos_x: 0,
    pos_y: 0,
    anim_seq: 0,
    room_location: 0,
    life: 0,
    counter_value: 0,
    collision_slot: UINT16_MAX,
    unkF: 0,
    anim_number: 0,
    flags: 0,
    index: 0,
    first_script_entry_index: 0,
    init_PGE: null,
})

const createLivePGE = () => ({
    script_state_type: 0,
    pos_x: 0,
    pos_y: 0,
    anim_seq: 0,
    room_location: 0,
    life: 0,
    counter_value: 0,
    collision_slot: UINT16_MAX,
    unkF: 0,
    anim_number: 0,
    flags: 0,
    index: 0,
    first_script_entry_index: 0,
    init_PGE: null
})

interface LivePGE {
    script_state_type: number
    pos_x: number
    pos_y: number
    anim_seq: number
    room_location: number
    life: number
    counter_value: number
    collision_slot: number
    unkF: number
    anim_number: number
    flags: number
    index: number
    first_script_entry_index: number
    init_PGE: InitPGE
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
    next_script_state_type: 0,
    next_script_entry_index: 0,
    flags: 0,
    opcode1: 0,
    opcode2: 0,
    opcode3: 0,
    opcode_arg1: 0,
    opcode_arg2: 0,
    opcode_arg3: 0
})

interface PgeScriptEntry {
    type: number
    dx: number
    dy: number
    next_script_state_type: number
    next_script_entry_index: number
    flags: number
    opcode1: number
    opcode2: number
    opcode3: number
    opcode_arg1: number
    opcode_arg2: number
    opcode_arg3: number
}

interface PgeScriptNode {
    last_obj_number: number
    objects: PgeScriptEntry[]
    num_objects: number
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

type PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => number
type PgeZOrderComparator = (livePGE1: LivePGE, livePGE2: LivePGE, p1: number, p2: number, game: Game) => number

class AnimBuffers {
    _states: Array<AnimBufferState[]> = [null, null, null, null]
    _curPos: number[] = [0, 0, 0, 0]

    addState(stateNum: number, x: number, y: number, dataPtr: Uint8Array, pge: LivePGE, w: number = 0, h: number = 0, paletteColorMaskOverride: number = -1) {
        assert(!(stateNum >= 4), `Assertion failed: ${stateNum} < 4`)
        const curPos = this._curPos[stateNum]
        const index = curPos === UINT8_MAX ? 0 : curPos + 1
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
    collision_grid_position_index: number
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
    icon_num: number
    init_pge: InitPGE
    live_pge: LivePGE
}

interface SoundFx {
    offset: number
    len: number
    freq: number
    data: Uint8Array
    peak: number
}

const READ_BE_UINT16 = (ptr: ArrayBuffer|Buffer|Uint8Array, offset = 0): number => {
    if (ptr instanceof Uint8Array) {
        return (ptr[offset] << 8) | ptr[1 + offset]
    }
    const b = ptr instanceof Buffer ? new DataView(ptr.buffer, ptr.offset + offset) : new DataView(ptr, offset)
	return (b.getUint8(0) << 8) | b.getUint8(1)
}

const READ_BE_UINT32 = (ptr: ArrayBuffer|Buffer|Uint8Array, offset = 0): number => {
    if (ptr instanceof Uint8Array) {
        return ((ptr[offset] << 24) | (ptr[1 + offset] << 16) | (ptr[2 + offset] << 8) | ptr[3 + offset]) >>> 0
    }
    const b = ptr instanceof Buffer ? new DataView(ptr.buffer, ptr.offset + offset) : new DataView(ptr, offset)
	return ((b.getUint8(0) << 24) | (b.getUint8(1) << 16) | (b.getUint8(2) << 8) | b.getUint8(3)) >>> 0
}

const READ_LE_UINT16 = (ptr: ArrayBuffer|Buffer|Uint8Array, offset = 0): number => {
    if (ptr instanceof Uint8Array) {
        return (ptr[1 + offset] << 8) | ptr[offset]
    }
	const b = ptr instanceof Buffer ? new DataView(ptr.buffer, ptr.offset + offset) : new DataView(ptr, offset)
	return (b.getUint8(1) << 8) | b.getUint8(0)
}

const READ_LE_UINT32 = (ptr: ArrayBuffer|Buffer|Uint8Array, offset = 0): number => {
    if (ptr instanceof Uint8Array) {
        return ((ptr[3 + offset] << 24) | (ptr[2 + offset] << 16) | (ptr[1 + offset] << 8) | ptr[offset]) >>> 0
    }
	const b = ptr instanceof Buffer ? new DataView(ptr.buffer, ptr.offset + offset) : new DataView(ptr, offset)
	return ((b.getUint8(3) << 24) | (b.getUint8(2) << 16) | (b.getUint8(1) << 8) | b.getUint8(0)) >>> 0
}

const ADDC_S16 = (a: number, b: number) => {
	a += b
	if (a < -32768) {
		a = -32768
	} else if (a > 32767) {
		a = 32767
	}
	return a
}

const S8_to_S16 = (a: number) => {
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

export { createPgeScriptEntry, CreatePGE, CreateInitPGE, createLivePGE, createLivePgeRegistry, createActiveRoomCollisionSlotWindow, Skill, Color, Point, Demo, Level, InitPGE, LivePGE, PendingPgeSignal, ResolvedSpriteSet, LoadedMonsterVisual, LoadedConradVisual, PgeScriptEntry, PgeScriptNode, PgeOpcodeArgs, AnimBufferState, AnimBuffers, CollisionSlot, ActiveRoomCollisionSlotWindow, RoomCollisionGridPatchRestoreSlot, LivePgeRegistry, BankSlot, InventoryItem, SoundFx, READ_BE_UINT16, READ_BE_UINT32, READ_LE_UINT16, READ_LE_UINT32, CLIP, Buffer, ADDC_S16, S8_to_S16 }
export type { PgeOpcodeHandler, PgeZOrderComparator }
