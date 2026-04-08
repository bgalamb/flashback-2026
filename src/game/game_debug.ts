import type { Game } from './game'

type GameDebugChannel =
    | 'collision'
    | 'opcode'
    | 'pge'
    | 'runtime'
    | 'session'
    | 'storyText'
    | 'world'

type DebuggableGame = {
    debugFlags?: Partial<Record<GameDebugChannel, boolean>>
    debugStartFrame?: number
    renders?: number
}

const defaultDebugFlags: Record<GameDebugChannel, boolean> = {
    collision: false,
    opcode: false,
    pge: false,
    runtime: false,
    session: false,
    storyText: false,
    world: false,
}

function isEnabled(game: Game, channel: GameDebugChannel) {
    const debugGame = game as unknown as DebuggableGame
    return debugGame.debugFlags?.[channel] ?? defaultDebugFlags[channel]
}

export function gameDebugLog(game: Game, channel: GameDebugChannel, message: string) {
    if (isEnabled(game, channel)) {
        console.log(message)
    }
}

export function gameDebugTrace(game: Game, channel: GameDebugChannel, message: string) {
    const debugGame = game as unknown as DebuggableGame
    if ((debugGame.renders ?? 0) > (debugGame.debugStartFrame ?? Number.MAX_SAFE_INTEGER) && isEnabled(game, channel)) {
        console.log(message)
    }
}

export function gameDebugWarn(_game: Game, _channel: GameDebugChannel, message: string) {
    console.warn(message)
}
