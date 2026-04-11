import { uint16Max, kIngameSaveSlot, uint8Max } from '../core/game_constants'
import type { PgeOpcodeArgs } from '../core/intern'
import type { Game } from './game'
import { getGameServices } from './game_services'
import { getRuntimeRegistryState } from './game_runtime_data'
import { getGamePgeState, getGameSessionState, getGameWorldState } from './game_state'
import { gameDebugLog } from './game_debug'
import { gameGetCurrentInventoryItemIndex } from './game_inventory'

export type OpcodeDebugSnapshot = Record<string, string | number | boolean>
export type OpcodeDebugConfig = {
    before?: (args: PgeOpcodeArgs, game: Game) => OpcodeDebugSnapshot | null
    after?: (args: PgeOpcodeArgs, game: Game, result: number) => OpcodeDebugSnapshot | null
}

export type PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => number

type OpcodeDebugMetadata = {
    id: string
    name: string
    config?: OpcodeDebugConfig
}

const formatOpcodeResult = (result: number) => result === uint16Max ? 'uint16Max' : String(result)

const formatOpcodeSnapshotDiff = (before: OpcodeDebugSnapshot | null | undefined, after: OpcodeDebugSnapshot | null | undefined) => {
    if (!after) {
        return ''
    }
    if (!before) {
        return Object.entries(after).map(([key, value]) => `${key}=${value}`).join(' ')
    }
    const keys = new Set([...Object.keys(before), ...Object.keys(after)])
    const changes: string[] = []
    keys.forEach((key) => {
        const beforeValue = before[key]
        const afterValue = after[key]
        if (beforeValue !== afterValue) {
            changes.push(`${key}:${beforeValue}->${afterValue}`)
        }
    })
    return changes.join(' ')
}

const withOpcodeDebug = (id: string, name: string, handler: PgeOpcodeHandler, config: OpcodeDebugConfig = {}): PgeOpcodeHandler => {
    return (args: PgeOpcodeArgs, game: Game) => {
        const before = config.before?.(args, game)
        const result = handler(args, game)
        const after = config.after?.(args, game, result)
        const diff = formatOpcodeSnapshotDiff(before, after)
        const world = getGameWorldState(game)
        gameDebugLog(
            game,
            'opcode',
            `[opcode] id=${id} name=${name} frame=${game.renders} currentRoom=${world.currentRoom} pge=${args.pge.index} pgeRoom=${args.pge.roomLocation} a=${args.a} b=${args.b} result=${formatOpcodeResult(result)}${diff ? ` ${diff}` : ''}`
        )
        return result
    }
}

const opcodeInventoryItemSnapshot = (args: PgeOpcodeArgs, game: Game) => ({
    currentInventoryItem: gameGetCurrentInventoryItemIndex(game, args.pge)
})

const opcodeCounterSnapshot = (args: PgeOpcodeArgs) => ({
    counter: args.pge.counterValue
})

const opcodeLifeSnapshot = (args: PgeOpcodeArgs) => ({
    life: args.pge.life
})

const opcodeRoomPosSnapshot = (args: PgeOpcodeArgs) => ({
    room: args.pge.roomLocation,
    posX: args.pge.posX,
    posY: args.pge.posY,
})

const opcodePgeStateSnapshot = (args: PgeOpcodeArgs) => ({
    room: args.pge.roomLocation,
    posX: args.pge.posX,
    posY: args.pge.posY,
    life: args.pge.life,
    flags: args.pge.flags,
    collision: args.pge.collisionSlot,
    state: args.pge.scriptStateType,
    entry: args.pge.firstScriptEntryIndex,
    anim: args.pge.animSeq,
})

const opcodeCreditsSnapshot = (_args: PgeOpcodeArgs, game: Game) => {
    const world = getGameWorldState(game)
    return { credits: world.credits }
}

const opcodeTempVarSnapshot = (_args: PgeOpcodeArgs, game: Game) => ({
    tempVar1: getGamePgeState(game).opcodeTempVar1
})

const opcodeGunVarSnapshot = (_args: PgeOpcodeArgs, game: Game) => ({
    gunVar: getGamePgeState(game).gunVar
})

const opcodeCutsceneSnapshot = (_args: PgeOpcodeArgs, game: Game) => {
    const { cut } = getGameServices(game)
    const world = getGameWorldState(game)
    const cutsceneId = typeof cut.getId === 'function' ? cut.getId() : -1
    return {
        cutsceneId,
        deathCutsceneCounter: world.deathCutsceneCounter,
    }
}

const opcodeTargetActiveSnapshot = (counterIndex: number) => (args: PgeOpcodeArgs, game: Game) => {
    const runtime = getRuntimeRegistryState(game)
    const targetIndex = args.pge.initPge.counterValues[counterIndex]
    const targetPge = targetIndex >= 0 ? runtime.livePgesByIndex[targetIndex] : null
    return {
        target: targetIndex,
        targetFlags: targetPge?.flags ?? -1,
        targetActive: Boolean(targetPge && (targetPge.flags & 4)),
    }
}

const opcodeGroupSignalSnapshot = (counterIndex: number) => (args: PgeOpcodeArgs) => ({
    target: args.pge.initPge.counterValues[counterIndex],
    signal: args.a,
})

const opcodeSoundSnapshot = (sfxId: number, softVol: number) => ({
    sfxId,
    softVol,
})

const opcodeDebugMetadata: Partial<Record<number, OpcodeDebugMetadata>> = {
    0x23: { id: '0x23', name: 'updateGroup0', config: { after: opcodeGroupSignalSnapshot(0) } },
    0x24: { id: '0x24', name: 'updateGroup1', config: { after: opcodeGroupSignalSnapshot(1) } },
    0x25: { id: '0x25', name: 'updateGroup2', config: { after: opcodeGroupSignalSnapshot(2) } },
    0x26: { id: '0x26', name: 'updateGroup3', config: { after: opcodeGroupSignalSnapshot(3) } },
    0x2F: { id: '0x2F', name: 'pickupObject', config: { after: opcodeGroupSignalSnapshot(0) } },
    0x30: { id: '0x30', name: 'addItemToInventory', config: { before: opcodeRoomPosSnapshot, after: opcodeRoomPosSnapshot } },
    0x33: { id: '0x33', name: 'removeItemFromInventory', config: { before: opcodeInventoryItemSnapshot, after: opcodeInventoryItemSnapshot } },
    0x36: { id: '0x36', name: 'setCollisionState1', config: { after: (args) => ({ patchValue: 1, dy: args.a, room: args.pge.roomLocation }) } },
    0x37: { id: '0x37', name: 'setCollisionState0', config: { after: (args) => ({ patchValue: 0, dy: args.a, room: args.pge.roomLocation }) } },
    0x3E: { id: '0x3E', name: 'setPgeCounter', config: { before: opcodeCounterSnapshot, after: opcodeCounterSnapshot } },
    0x3F: { id: '0x3F', name: 'decPgeCounter', config: { before: opcodeCounterSnapshot, after: opcodeCounterSnapshot } },
    0x41: { id: '0x41', name: 'wakeUpPge', config: { before: opcodeTargetActiveSnapshot(0), after: opcodeTargetActiveSnapshot(0) } },
    0x42: { id: '0x42', name: 'removePge', config: { before: opcodeTargetActiveSnapshot(0), after: opcodeTargetActiveSnapshot(0) } },
    0x43: { id: '0x43', name: 'removePgeIfNotNear', config: { before: opcodePgeStateSnapshot, after: opcodePgeStateSnapshot } },
    0x44: { id: '0x44', name: 'loadPgeCounter', config: { before: opcodeCounterSnapshot, after: opcodeCounterSnapshot } },
    0x4B: { id: '0x4B', name: 'killPge', config: { before: opcodePgeStateSnapshot, after: opcodePgeStateSnapshot } },
    0x4F: { id: '0x4F', name: 'playDefaultDeathCutscene', config: { before: opcodeCutsceneSnapshot, after: opcodeCutsceneSnapshot } },
    0x55: { id: '0x55', name: 'setLife', config: { before: opcodeLifeSnapshot, after: opcodeLifeSnapshot } },
    0x56: { id: '0x56', name: 'incLife', config: { before: opcodeLifeSnapshot, after: opcodeLifeSnapshot } },
    0x57: { id: '0x57', name: 'setPgeDefaultAnim', config: { before: opcodePgeStateSnapshot, after: opcodePgeStateSnapshot } },
    0x5A: { id: '0x5A', name: 'playCutscene', config: { before: opcodeCutsceneSnapshot, after: opcodeCutsceneSnapshot } },
    0x5C: { id: '0x5C', name: 'playDeathCutscene', config: { before: opcodeCutsceneSnapshot, after: opcodeCutsceneSnapshot } },
    0x60: { id: '0x60', name: 'findAndCopyPge', config: { before: opcodePgeStateSnapshot, after: opcodePgeStateSnapshot } },
    0x65: { id: '0x65', name: 'addToCredits', config: { before: opcodeCreditsSnapshot, after: opcodeCreditsSnapshot } },
    0x66: { id: '0x66', name: 'subFromCredits', config: { before: opcodeCreditsSnapshot, after: opcodeCreditsSnapshot } },
    0x68: { id: '0x68', name: 'setCollisionState2', config: { after: (args) => ({ patchValue: 2, dy: args.a, room: args.pge.roomLocation }) } },
    0x69: { id: '0x69', name: 'saveState', config: { after: (_args, game) => ({ validSaveState: getGameSessionState(game).validSaveState, slot: kIngameSaveSlot }) } },
    0x7B: { id: '0x7B', name: 'displayText', config: { after: (_args, game) => ({ textToDisplay: getGameWorldState(game).textToDisplay }) } },
    0x7D: { id: '0x7D', name: 'playSound', config: { after: (args) => opcodeSoundSnapshot(args.a & uint8Max, args.a >> 8) } },
    0x80: { id: '0x80', name: 'setPgePosX', config: { before: opcodeRoomPosSnapshot, after: opcodeRoomPosSnapshot } },
    0x81: { id: '0x81', name: 'setPgePosModX', config: { before: opcodeRoomPosSnapshot, after: opcodeRoomPosSnapshot } },
    0x82: { id: '0x82', name: 'changeRoom', config: { after: (args) => ({ destinationIndex: args.pge.initPge.counterValues[args.a], sourceIndex: args.pge.initPge.counterValues[args.a + 1] }) } },
    0x84: { id: '0x84', name: 'changeLevel', config: { before: (_args, game) => ({ level: getGameWorldState(game).currentLevel }), after: (_args, game) => ({ level: getGameWorldState(game).currentLevel }) } },
    0x85: { id: '0x85', name: 'shakeScreen' },
    0x87: { id: '0x87', name: 'playSoundGroup', config: { after: (args) => {
        const c = args.pge.initPge.counterValues[args.a] & uint16Max
        return opcodeSoundSnapshot(c & uint8Max, c >> 8)
    } } },
    0x88: { id: '0x88', name: 'adjustPos', config: { before: opcodeRoomPosSnapshot, after: opcodeRoomPosSnapshot } },
    0x8A: { id: '0x8A', name: 'setGunVar', config: { before: opcodeGunVarSnapshot, after: opcodeGunVarSnapshot } },
    0x8B: { id: '0x8B', name: 'compareGunVar', config: { before: opcodeGunVarSnapshot, after: opcodeGunVarSnapshot } },
}

export const instrumentOpcodeTable = (handlers: (PgeOpcodeHandler | null)[]) =>
    handlers.map((handler, index) => {
        const metadata = opcodeDebugMetadata[index]
        if (!handler || !metadata) {
            return handler
        }
        return withOpcodeDebug(metadata.id, metadata.name, handler, metadata.config)
    })
