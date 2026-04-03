import type { AnimBufferState, AnimBuffers, LivePGE, LivePgeRegistry, PendingPgeSignal } from '../core/intern'
import type { Game } from './game'

type RuntimeDataGame = Record<string, unknown>

type RuntimeRegistryState = {
    livePgesByIndex: LivePGE[]
    livePgeStore: LivePgeRegistry
    pendingSignalsByTargetPgeIndex: Map<number, PendingPgeSignal[]>
    inventoryItemIndicesByOwner: Map<number, number[]>
}

type RenderDataState = {
    animBuffer0State: AnimBufferState[]
    animBuffer1State: AnimBufferState[]
    animBuffer2State: AnimBufferState[]
    animBuffer3State: AnimBufferState[]
    animBuffers: AnimBuffers
}

export function getRuntimeRegistryState(game: Game): RuntimeRegistryState {
    const runtimeGame = game as unknown as RuntimeDataGame
    const groupedState = runtimeGame['runtimeData'] as RuntimeRegistryState | undefined
    return groupedState ?? {
        get livePgesByIndex() { return runtimeGame['_livePgesByIndex'] as LivePGE[] },
        set livePgesByIndex(value: LivePGE[]) { runtimeGame['_livePgesByIndex'] = value },
        get livePgeStore() { return runtimeGame['_livePgeStore'] as LivePgeRegistry },
        set livePgeStore(value: LivePgeRegistry) { runtimeGame['_livePgeStore'] = value },
        get pendingSignalsByTargetPgeIndex() { return runtimeGame['_pendingSignalsByTargetPgeIndex'] as Map<number, PendingPgeSignal[]> },
        set pendingSignalsByTargetPgeIndex(value: Map<number, PendingPgeSignal[]>) { runtimeGame['_pendingSignalsByTargetPgeIndex'] = value },
        get inventoryItemIndicesByOwner() { return runtimeGame['_inventoryItemIndicesByOwner'] as Map<number, number[]> },
        set inventoryItemIndicesByOwner(value: Map<number, number[]>) { runtimeGame['_inventoryItemIndicesByOwner'] = value },
    }
}

export function getRenderDataState(game: Game): RenderDataState {
    const runtimeGame = game as unknown as RuntimeDataGame
    const groupedState = runtimeGame['renderData'] as RenderDataState | undefined
    return groupedState ?? {
        get animBuffer0State() { return runtimeGame['_animBuffer0State'] as AnimBufferState[] },
        set animBuffer0State(value: AnimBufferState[]) { runtimeGame['_animBuffer0State'] = value },
        get animBuffer1State() { return runtimeGame['_animBuffer1State'] as AnimBufferState[] },
        set animBuffer1State(value: AnimBufferState[]) { runtimeGame['_animBuffer1State'] = value },
        get animBuffer2State() { return runtimeGame['_animBuffer2State'] as AnimBufferState[] },
        set animBuffer2State(value: AnimBufferState[]) { runtimeGame['_animBuffer2State'] = value },
        get animBuffer3State() { return runtimeGame['_animBuffer3State'] as AnimBufferState[] },
        set animBuffer3State(value: AnimBufferState[]) { runtimeGame['_animBuffer3State'] = value },
        get animBuffers() { return runtimeGame['_animBuffers'] as AnimBuffers },
        set animBuffers(value: AnimBuffers) { runtimeGame['_animBuffers'] = value },
    }
}
