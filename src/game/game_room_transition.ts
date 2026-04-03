import type { InitPGE, LivePGE } from '../core/intern'
import type { Game } from './game'
import { CT_DOWN_ROOM, CT_LEFT_ROOM, CT_RIGHT_ROOM, CT_UP_ROOM, GAMESCREEN_W } from '../core/game_constants'
import { INIT_PGE_FLAG_IN_CURRENT_ROOM_LIST, PGE_FLAG_ACTIVE } from '../core/game_constants'
import { gameRequestMapReload } from './game_lifecycle'
import { gameRebuildActiveRoomCollisionSlotLookup } from './game_collision'
import { getRuntimeRegistryState } from './game_runtime_data'
import { getGameWorldState } from './game_state'

type PgeTransitionLogger = (scope: string, message: string, pge?: LivePGE) => void

interface PgeRoomBoundaryCrossing {
    roomLookup: Int8Array
}

function getPgeRoomBoundaryCrossing(game: Game, pge: LivePGE): PgeRoomBoundaryCrossing | null {
    if (pge.pos_x <= -10) {
        pge.pos_x += GAMESCREEN_W
        return { roomLookup: game._res.level.ctData.subarray(CT_LEFT_ROOM) }
    }
    if (pge.pos_x >= GAMESCREEN_W) {
        pge.pos_x -= GAMESCREEN_W
        return { roomLookup: game._res.level.ctData.subarray(CT_RIGHT_ROOM) }
    }
    if (pge.pos_y < 0) {
        pge.pos_y += 216
        return { roomLookup: game._res.level.ctData.subarray(CT_UP_ROOM) }
    }
    if (pge.pos_y >= 216) {
        pge.pos_y -= 216
        return { roomLookup: game._res.level.ctData.subarray(CT_DOWN_ROOM) }
    }
    return null
}

function activatePgeForCurrentFrame(game: Game, pge: LivePGE, log: PgeTransitionLogger, message: string) {
    log('pge-activate', message, pge)
    getRuntimeRegistryState(game).livePgeStore.activeFrameByIndex[pge.index] = pge
    pge.flags |= PGE_FLAG_ACTIVE
}

function activateCurrentRoomPges(game: Game, room: number, log: PgeTransitionLogger) {
    for (const pge of getRuntimeRegistryState(game).livePgeStore.liveByRoom[room]) {
        if (pge.init_PGE.flags & INIT_PGE_FLAG_IN_CURRENT_ROOM_LIST) {
            activatePgeForCurrentFrame(game, pge, log, `activate current-room pge=${pge.index} pos=(${pge.pos_x},${pge.pos_y})`)
        }
    }
}

function activateNeighborRoomPges(game: Game, room: number, minY: number, label: string, log: PgeTransitionLogger) {
    if (room < 0 || room >= 0x40) {
        return
    }
    for (const pge of getRuntimeRegistryState(game).livePgeStore.liveByRoom[room]) {
        if (pge.init_PGE.object_type !== 10 && pge.pos_y >= minY && (pge.init_PGE.flags & INIT_PGE_FLAG_IN_CURRENT_ROOM_LIST)) {
            activatePgeForCurrentFrame(game, pge, log, `activate ${label} pge=${pge.index} room=${room} pos=(${pge.pos_x},${pge.pos_y})`)
        }
    }
}

function activateRoomTransitionNeighbors(game: Game, currentRoom: number, log: PgeTransitionLogger) {
    activateCurrentRoomPges(game, currentRoom, log)
    activateNeighborRoomPges(game, game._res.level.ctData[CT_UP_ROOM + currentRoom], 48, 'upper-neighbor', log)
    activateNeighborRoomPges(game, game._res.level.ctData[CT_DOWN_ROOM + currentRoom], 176, 'lower-neighbor', log)
}

export function gameRelocatePgeToRoom(game: Game, pge: LivePGE, previousRoom: number, log: PgeTransitionLogger) {
    if (previousRoom === pge.room_location) {
        return
    }
    const runtime = getRuntimeRegistryState(game)
    const previousRoomList = runtime.livePgeStore.liveByRoom[previousRoom]
    if (!previousRoomList) {
        log('pge-live-list', `skip move missing previousRoomList oldRoom=${previousRoom} newRoom=${pge.room_location}`, pge)
        return
    }
    const previousRoomIndex = previousRoomList.indexOf(pge)
    if (previousRoomIndex < 0) {
        return
    }
    previousRoomList.splice(previousRoomIndex, 1)
    const nextRoomList = runtime.livePgeStore.liveByRoom[pge.room_location]
    if (!nextRoomList) {
        log('pge-live-list', `skip move missing nextRoomList oldRoom=${previousRoom} newRoom=${pge.room_location}`, pge)
        return
    }
    nextRoomList.push(pge)
    log('pge-live-list', `moved oldRoom=${previousRoom} newRoom=${pge.room_location}`, pge)
}

export function gameHandlePgeRoomTransition(game: Game, pge: LivePGE, initPge: InitPGE, previousRoom: number, log: PgeTransitionLogger) {
    const world = getGameWorldState(game)
    const crossing = getPgeRoomBoundaryCrossing(game, pge)
    if (!crossing) {
        gameRelocatePgeToRoom(game, pge, previousRoom, log)
        return
    }

    log('pge-transition', `crossing room boundary from=${pge.room_location} pos=(${pge.pos_x},${pge.pos_y}) objectType=${initPge.object_type}`, pge)
    let nextRoom = pge.room_location << 24 >> 24
    if (nextRoom >= 0) {
        nextRoom = crossing.roomLookup[nextRoom]
        pge.room_location = nextRoom
    }

    if (initPge.object_type === 1) {
        gameRequestMapReload(game, nextRoom)
        gameRebuildActiveRoomCollisionSlotLookup(game, world.currentRoom)
        if (!(world.currentRoom & 0x80) && world.currentRoom < 0x40) {
            activateRoomTransitionNeighbors(game, world.currentRoom, log)
        }
    }

    gameRelocatePgeToRoom(game, pge, previousRoom, log)
}
