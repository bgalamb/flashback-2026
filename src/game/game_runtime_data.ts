import type { AnimBufferState, AnimBuffers, LivePGE, LivePgeRegistry, PendingPgeSignal } from '../core/intern'
import type { Game } from './game'

export type RuntimeRegistryState = {
    livePgesByIndex: LivePGE[]
    livePgeStore: LivePgeRegistry
    pendingSignalsByTargetPgeIndex: Map<number, PendingPgeSignal[]>
    inventoryItemIndicesByOwner: Map<number, number[]>
}

export type RenderDataState = {
    animBuffer0State: AnimBufferState[]
    animBuffer1State: AnimBufferState[]
    animBuffer2State: AnimBufferState[]
    animBuffer3State: AnimBufferState[]
    animBuffers: AnimBuffers
}

export function getRuntimeRegistryState(game: Game): RuntimeRegistryState {
    return game.runtimeData
}

export function getRoomPges(game: Game, room: number): LivePGE[] {
    return game.runtimeData.livePgeStore.liveByRoom[room] ?? []
}

export function getRenderDataState(game: Game): RenderDataState {
    return game.renderData
}
