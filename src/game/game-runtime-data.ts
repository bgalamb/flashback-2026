import type { AnimBufferState, LivePGE, LivePgeRegistry, PendingPgeSignal } from '../core/intern'
import { AnimBuffers, createLivePGE } from '../core/intern'
import { pgeNum } from '../core/game_constants'
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

function createInitialAnimBufferState(size: number): AnimBufferState[] {
    return new Array(size).fill(null).map(() => ({
        x: 0,
        y: 0,
        w: 0,
        h: 0,
        dataPtr: null,
        pge: null,
        paletteColorMaskOverride: -1,
    }))
}

export function createInitialRuntimeRegistryState(): RuntimeRegistryState {
    return {
        livePgesByIndex: new Array<LivePGE>(pgeNum).fill(null).map(() => createLivePGE()),
        livePgeStore: null,
        pendingSignalsByTargetPgeIndex: new Map(),
        inventoryItemIndicesByOwner: new Map(),
    }
}

export function createInitialRenderDataState(): RenderDataState {
    return {
        animBuffer0State: createInitialAnimBufferState(41),
        animBuffer1State: createInitialAnimBufferState(6),
        animBuffer2State: createInitialAnimBufferState(42),
        animBuffer3State: createInitialAnimBufferState(12),
        animBuffers: new AnimBuffers(),
    }
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
