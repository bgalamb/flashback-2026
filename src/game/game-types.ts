import type { LivePGE, PgeOpcodeArgs } from '../core/intern'
import type { Game } from './game'

export type colCallback1 = (colliderPge: LivePGE, detectorPge: LivePGE, groupId: number, targetObjectType: number, game: Game) => number
export type colCallback2 = (pge: LivePGE, verticalOffset: number, distanceStep: number, groupId: number, game: Game) => number
export type PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => number
export type PgeZOrderComparator = (colliderPge: LivePGE, detectorPge: LivePGE, groupId: number, targetObjectType: number, game: Game) => number
