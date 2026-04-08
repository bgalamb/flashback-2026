import type { InitPGE, LivePGE } from '../core/intern'
import type { Game } from './game'
import { ctDownRoom, ctLeftRoom, ctRightRoom, ctUpRoom, gamescreenW } from '../core/game_constants'
import { initPgeFlagInCurrentRoomList, pgeFlagActive } from '../core/game_constants'
import { gameRequestMapReload } from './game_lifecycle'
import { gameRebuildActiveRoomCollisionSlotLookup } from './game_collision'
import { getRoomPges, getRuntimeRegistryState } from './game_runtime_data'
import { getGameWorldState } from './game_state'

type PgeTransitionLogger = (scope: string, message: string, pge?: LivePGE) => void

interface PgeRoomBoundaryCrossing {
    roomLookup: Int8Array
}

function getPgeRoomBoundaryCrossing(game: Game, pge: LivePGE): PgeRoomBoundaryCrossing | null {
    if (pge.posX <= -10) {
        pge.posX += gamescreenW
        return { roomLookup: game._res.level.ctData.subarray(ctLeftRoom) }
    }
    if (pge.posX >= gamescreenW) {
        pge.posX -= gamescreenW
        return { roomLookup: game._res.level.ctData.subarray(ctRightRoom) }
    }
    if (pge.posY < 0) {
        pge.posY += 216
        return { roomLookup: game._res.level.ctData.subarray(ctUpRoom) }
    }
    if (pge.posY >= 216) {
        pge.posY -= 216
        return { roomLookup: game._res.level.ctData.subarray(ctDownRoom) }
    }
    return null
}

function activatePgeForCurrentFrame(game: Game, pge: LivePGE, log: PgeTransitionLogger, message: string) {
    log('pge-activate', message, pge)
    getRuntimeRegistryState(game).livePgeStore.activeFrameByIndex[pge.index] = pge
    pge.flags |= pgeFlagActive
}

function activateCurrentRoomPges(game: Game, room: number, log: PgeTransitionLogger) {
    for (const pge of getRoomPges(game, room)) {
        if (pge.initPge.flags & initPgeFlagInCurrentRoomList) {
            activatePgeForCurrentFrame(game, pge, log, `activate current-room pge=${pge.index} pos=(${pge.posX},${pge.posY})`)
        }
    }
}

function activateNeighborRoomPges(game: Game, room: number, minY: number, label: string, log: PgeTransitionLogger) {
    if (room < 0 || room >= 0x40) {
        return
    }
    for (const pge of getRoomPges(game, room)) {
        if (pge.initPge.objectType !== 10 && pge.posY >= minY && (pge.initPge.flags & initPgeFlagInCurrentRoomList)) {
            activatePgeForCurrentFrame(game, pge, log, `activate ${label} pge=${pge.index} room=${room} pos=(${pge.posX},${pge.posY})`)
        }
    }
}

function activateRoomTransitionNeighbors(game: Game, currentRoom: number, log: PgeTransitionLogger) {
    activateCurrentRoomPges(game, currentRoom, log)
    activateNeighborRoomPges(game, game._res.level.ctData[ctUpRoom + currentRoom], 48, 'upper-neighbor', log)
    activateNeighborRoomPges(game, game._res.level.ctData[ctDownRoom + currentRoom], 176, 'lower-neighbor', log)
}

export function gameRelocatePgeToRoom(game: Game, pge: LivePGE, previousRoom: number, log: PgeTransitionLogger) {
    if (previousRoom === pge.roomLocation) {
        return
    }
    const runtime = getRuntimeRegistryState(game)
    const previousRoomList = runtime.livePgeStore.liveByRoom[previousRoom]
    if (!previousRoomList) {
        log('pge-live-list', `skip move missing previousRoomList oldRoom=${previousRoom} newRoom=${pge.roomLocation}`, pge)
        return
    }
    const previousRoomIndex = previousRoomList.indexOf(pge)
    if (previousRoomIndex < 0) {
        return
    }
    previousRoomList.splice(previousRoomIndex, 1)
    const nextRoomList = runtime.livePgeStore.liveByRoom[pge.roomLocation]
    if (!nextRoomList) {
        log('pge-live-list', `skip move missing nextRoomList oldRoom=${previousRoom} newRoom=${pge.roomLocation}`, pge)
        return
    }
    nextRoomList.push(pge)
    log('pge-live-list', `moved oldRoom=${previousRoom} newRoom=${pge.roomLocation}`, pge)
}

export function gameHandlePgeRoomTransition(game: Game, pge: LivePGE, initPge: InitPGE, previousRoom: number, log: PgeTransitionLogger) {
    const world = getGameWorldState(game)
    const crossing = getPgeRoomBoundaryCrossing(game, pge)
    if (!crossing) {
        gameRelocatePgeToRoom(game, pge, previousRoom, log)
        return
    }

    log('pge-transition', `crossing room boundary from=${pge.roomLocation} pos=(${pge.posX},${pge.posY}) objectType=${initPge.objectType}`, pge)
    let nextRoom = pge.roomLocation << 24 >> 24
    if (nextRoom >= 0) {
        nextRoom = crossing.roomLookup[nextRoom]
        pge.roomLocation = nextRoom
    }

    if (initPge.objectType === 1) {
        gameRequestMapReload(game, nextRoom)
        gameRebuildActiveRoomCollisionSlotLookup(game, world.currentRoom)
        if (!(world.currentRoom & 0x80) && world.currentRoom < 0x40) {
            activateRoomTransitionNeighbors(game, world.currentRoom, log)
        }
    }

    gameRelocatePgeToRoom(game, pge, previousRoom, log)
}
