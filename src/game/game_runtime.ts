import type { LivePGE } from '../core/intern'
import type { Game } from './game'
import { Menu } from './menu'
import { ObjectType, LocaleData } from '../resource/resource'
import { dirDown, dirUp } from '../platform/system-port'
import { charW, gamescreenW, uint8Max } from '../core/game_constants'
import { kAutoSaveIntervalMs, kAutoSaveSlot, kIngameSaveSlot, kRewindSize } from './game'
import { gameDrawAnims, gameDrawCurrentInventoryItem, gameDrawCurrentRoomOverlay, gameDrawLevelTexts, gameDrawStoryTexts } from './game_draw'
import { gameClearDynamicCollisionSlotState, gameRebuildActiveRoomCollisionSlotLookup } from './game_collision'
import { gameHandleConfigPanel, gameHandleInventory } from './game_inventory'
import { gameGetCurrentInventoryItemIndex } from './game_inventory'
import { getGameServices } from './game_services'
import {
    gameApplyTitleScreenSelection,
    gameBeginFrameLoop,
    gameBeginPlaythrough,
    gameChangeStateSlot,
    gameCommitLoadedRoom,
    gameCompleteFrameTiming,
    gameConsumeLevelCutsceneSkip,
    gameEndLoop,
    gameRequestMapReload,
    gameQueueDeathCutscene,
    gameSetSaveTimestamp,
    gameTickDeathCutscene
} from './game_lifecycle'
import { gameRebuildActiveFramePgeList, gameRebuildPgeCollisionStateForCurrentRoom, gameRunPgeFrameLogic, gameUpdatePgeDirectionalInputState } from './game_pge'
import { gameDebugLog, gameDebugWarn } from './game_debug'
import { getGameCollisionState, getGamePgeState, getGameSessionState, getGameUiState, getGameWorldState } from './game_state'
import { gameChangeLevel, gameHasLevelMap, gameLoadLevelData, gameLoadLevelMap, gamePrepareAnimationsInRooms, gameResetGameState } from './game_world'
import { getRuntimeRegistryState } from './game_runtime_data'
import {
    gameDidDie,
    gameDidFinishAllLevels,
    gameHandleContinueAbort,
    gameInpHandleSpecialKeys,
    gameLoadStateRewind,
    gameMaybeAutoSave,
    gamePlayCutscene,
    gameShowFinalScore,
    gameUpdateTiming,
} from './game_session_flow'

export {
    gameDidDie,
    gameHandleContinueAbort,
    gameInpHandleSpecialKeys,
    gameLoadStateRewind,
    gamePlayCutscene,
    gameShowFinalScore,
    gameUpdateTiming,
}

const kSnapshotVersion = 1

type LivePgeSnapshot = {
    state: Record<string, number | boolean | string | null>
    initPgeIndex: number
}

type GameSnapshot = {
    version: number
    level: number
    world: Record<string, number | boolean>
    ui: Record<string, number | boolean>
    session: {
        randSeed: number
        validSaveState: boolean
    }
    pge: Record<string, number | boolean>
    transient: Record<string, number | boolean>
    cutscene: {
        id: number
        deathCutSceneId: number
    }
    collisionMap: Uint8Array | null
    livePgesByIndex: LivePgeSnapshot[]
    inventoryItemIndicesByOwner: Array<[number, number[]]>
}

function getSavedGameStates(game: Game): Map<number, GameSnapshot> {
    const runtimeGame = game as Game & {
        __savedGameStates?: Map<number, GameSnapshot>
    }
    if (!runtimeGame.__savedGameStates) {
        runtimeGame.__savedGameStates = new Map()
    }
    return runtimeGame.__savedGameStates
}

function cloneLivePgeState(game: Game, pge: LivePGE): LivePgeSnapshot {
    const runtime = getRuntimeRegistryState(game)
    const initByIndex = runtime.livePgeStore?.initByIndex ?? []
    const initPgeIndex = initByIndex.indexOf(pge.initPge)
    const state: Record<string, number | boolean | string | null> = {}
    Object.entries(pge).forEach(([key, value]) => {
        if (key === 'initPge' || typeof value === 'function' || typeof value === 'undefined') {
            return
        }
        if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string' || value === null) {
            state[key] = value
        }
    })
    return {
        state,
        initPgeIndex: initPgeIndex >= 0 ? initPgeIndex : pge.index,
    }
}

function createGameSnapshot(game: Game): GameSnapshot {
    const world = getGameWorldState(game)
    const ui = getGameUiState(game)
    const session = getGameSessionState(game)
    const pge = getGamePgeState(game)
    const runtime = getRuntimeRegistryState(game)
    const services = getGameServices(game)
    const cut = services?.cut
    const resource = services?.res as unknown as { level?: { ctData?: Int8Array | Uint8Array } } | undefined
    const ctData = resource?.level?.ctData
    const transientState = (game as Game & { transient?: Record<string, number | boolean> }).transient ?? {}
    const inventoryItemIndicesByOwner = runtime.inventoryItemIndicesByOwner ?? new Map()
    const livePgesByIndex = Array.isArray(runtime.livePgesByIndex) ? runtime.livePgesByIndex : []

    return {
        version: kSnapshotVersion,
        level: world.currentLevel,
        world: { ...world },
        ui: { ...ui },
        session: {
            randSeed: session.randSeed,
            validSaveState: session.validSaveState,
        },
        pge: { ...pge },
        transient: { ...transientState },
        cutscene: {
            id: typeof cut.getId === 'function' ? cut.getId() : -1,
            deathCutSceneId: typeof cut.getDeathCutSceneId === 'function' ? cut.getDeathCutSceneId() : uint8Max,
        },
        collisionMap: ctData instanceof Int8Array || ctData instanceof Uint8Array ? new Uint8Array(ctData) : null,
        livePgesByIndex: livePgesByIndex.map((currentPge) => cloneLivePgeState(game, currentPge)),
        inventoryItemIndicesByOwner: Array.from(typeof inventoryItemIndicesByOwner.entries === 'function' ? inventoryItemIndicesByOwner.entries() : []).map(([owner, itemIndices]) => [owner, Array.isArray(itemIndices) ? [...itemIndices] : []]),
    }
}

function getInventoryDebugSummary(game: Game, ownerIndex: number) {
    const runtime = getRuntimeRegistryState(game)
    const inventoryItemIndices = runtime.inventoryItemIndicesByOwner?.get(ownerIndex) ?? []
    return inventoryItemIndices.map((inventoryItemIndex) => {
        const inventoryItem = runtime.livePgesByIndex[inventoryItemIndex]
        const objectId = inventoryItem?.initPge?.objectId ?? uint8Max
        return `${inventoryItemIndex}:${objectId}`
    }).join(',')
}

function resetLoadedFrameState(game: Game) {
    const collision = getGameCollisionState(game)
    const render = (game as Game & { renderData?: Game['renderData'] }).renderData
    if (collision.dynamicPgeCollisionSlotsByPosition) {
        gameClearDynamicCollisionSlotState(game)
    }
    collision.activeRoomCollisionSlotWindow?.left?.fill?.(null)
    collision.activeRoomCollisionSlotWindow?.current?.fill?.(null)
    collision.activeRoomCollisionSlotWindow?.right?.fill?.(null)
    if (collision.roomCollisionGridPatchRestoreSlotPool) {
        collision.nextFreeRoomCollisionGridPatchRestoreSlot = collision.roomCollisionGridPatchRestoreSlotPool[0] ?? null
    }
    collision.activeRoomCollisionGridPatchRestoreSlots = null

    if (!render?.animBuffers) {
        return
    }
    render.animBuffers._states[0] = render.animBuffer0State
    render.animBuffers._curPos[0] = uint8Max
    render.animBuffers._states[1] = render.animBuffer1State
    render.animBuffers._curPos[1] = uint8Max
    render.animBuffers._states[2] = render.animBuffer2State
    render.animBuffers._curPos[2] = uint8Max
    render.animBuffers._states[3] = render.animBuffer3State
    render.animBuffers._curPos[3] = uint8Max
}

function restoreLivePgeState(game: Game, snapshot: GameSnapshot) {
    const runtime = getRuntimeRegistryState(game)
    const ui = getGameUiState(game)
    const initByIndex = runtime.livePgeStore?.initByIndex ?? []

    runtime.livePgeStore?.liveByRoom?.forEach((roomList) => {
        roomList.length = 0
    })
    runtime.livePgeStore?.activeFrameByIndex?.fill(null)
    if (runtime.livePgeStore?.activeFrameList) {
        runtime.livePgeStore.activeFrameList.length = 0
    }

    snapshot.livePgesByIndex.forEach((savedPgeState, index) => {
        const livePge = runtime.livePgesByIndex[index]
        Object.assign(livePge, savedPgeState.state)
        livePge.initPge = initByIndex[savedPgeState.initPgeIndex] ?? initByIndex[index] ?? livePge.initPge

        if (livePge.initPge && livePge.initPge.skill <= ui.skillLevel) {
            if (runtime.livePgeStore?.liveByRoom && livePge.roomLocation >= 0 && livePge.roomLocation < runtime.livePgeStore.liveByRoom.length) {
                runtime.livePgeStore.liveByRoom[livePge.roomLocation].push(livePge)
            }
            if ((livePge.flags & 4) && runtime.livePgeStore?.activeFrameByIndex && runtime.livePgeStore?.activeFrameList) {
                runtime.livePgeStore.activeFrameByIndex[livePge.index] = livePge
                runtime.livePgeStore.activeFrameList.push(livePge)
            }
        }
    })
}

function applyGameSnapshot(game: Game, snapshot: GameSnapshot) {
    const world = getGameWorldState(game)
    if (snapshot.version !== kSnapshotVersion) {
        return false
    }

    const ui = getGameUiState(game)
    const session = getGameSessionState(game)
    const pge = getGamePgeState(game)
    const runtime = getRuntimeRegistryState(game)
    const services = getGameServices(game)
    const cut = services?.cut
    const resource = services?.res as unknown as { level?: { ctData?: Int8Array | Uint8Array } } | undefined
    const ctData = resource?.level?.ctData

    Object.assign(world, snapshot.world)
    Object.assign(ui, snapshot.ui)
    session.randSeed = snapshot.session.randSeed
    session.validSaveState = snapshot.session.validSaveState
    Object.assign(pge, snapshot.pge)
    if (!Object.prototype.hasOwnProperty.call(snapshot.pge, 'gunVar') && Object.prototype.hasOwnProperty.call(snapshot.pge, 'opcodeTempVar1')) {
        const legacyGunVar = snapshot.pge.opcodeTempVar1
        if (typeof legacyGunVar === 'number') {
            pge.gunVar = legacyGunVar
        }
    }
    const transientState = (game as Game & { transient?: Record<string, number | boolean> }).transient
    if (transientState) {
        Object.assign(transientState, snapshot.transient)
    }
    if ((ctData instanceof Int8Array || ctData instanceof Uint8Array) && snapshot.collisionMap instanceof Uint8Array) {
        ctData.set(snapshot.collisionMap)
    }
    if (typeof cut?.setId === 'function') {
        cut.setId(snapshot.cutscene.id)
    }
    if (typeof cut?.setDeathCutSceneId === 'function') {
        cut.setDeathCutSceneId(snapshot.cutscene.deathCutSceneId)
    }

    restoreLivePgeState(game, snapshot)
    runtime.pendingSignalsByTargetPgeIndex = new Map()
    runtime.inventoryItemIndicesByOwner = new Map((Array.isArray(snapshot.inventoryItemIndicesByOwner) ? snapshot.inventoryItemIndicesByOwner : []).map(([owner, itemIndices]) => [
        owner,
        Array.isArray(itemIndices) ? [...itemIndices] : [],
    ]))

    resetLoadedFrameState(game)
    const conradRoom = runtime.livePgesByIndex[0]?.roomLocation
    const currentInventoryItemIndex = gameGetCurrentInventoryItemIndex(game, runtime.livePgesByIndex[0])
    const currentInventoryObjectId = currentInventoryItemIndex !== uint8Max
        ? runtime.livePgesByIndex[currentInventoryItemIndex]?.initPge?.objectId
        : uint8Max
    console.log(`[rewind-runtime] restore room=${conradRoom} currentInv=${currentInventoryItemIndex} objectId=${currentInventoryObjectId} gunVar=${getGamePgeState(game).gunVar} tempVar1=${getGamePgeState(game).opcodeTempVar1} inventory=[${getInventoryDebugSummary(game, 0)}]`)
    if (typeof conradRoom === 'number') {
        gameRequestMapReload(game, conradRoom)
    }
    services?.vid?.fullRefresh?.()
    return true
}

function saveStateRewind(game: Game) {
    const rewind = game.rewind
    const previousPtr = rewind.ptr
    const previousLen = rewind.len
    if (rewind.ptr === kRewindSize - 1) {
        rewind.ptr = 0
    } else {
        ++rewind.ptr
    }
    rewind.buffer[rewind.ptr] = createGameSnapshot(game)
    if (rewind.len < kRewindSize) {
        ++rewind.len
    }
    console.log(`[rewind-runtime] save ptr=${previousPtr}->${rewind.ptr} len=${previousLen}->${rewind.len} room=${getGameWorldState(game).currentRoom} level=${getGameWorldState(game).currentLevel}`)
    return true
}

function loadStateRewind(game: Game) {
    try {
        const rewind = game.rewind
        if (rewind.len === 0 || rewind.ptr < 0) {
            return false
        }
        const ptr = rewind.ptr
        if (rewind.ptr === 0) {
            rewind.ptr = kRewindSize - 1
        } else {
            --rewind.ptr
        }
        const currentSnapshot = rewind.buffer[ptr] as GameSnapshot | undefined
        if (!currentSnapshot) {
            return false
        }
        const loaded = applyGameSnapshot(game, currentSnapshot)
        if (loaded && rewind.len > 0) {
            --rewind.len
        }
        return loaded
    } catch (error) {
        gameDebugWarn(game, 'runtime', `[rewind] restore failed error=${error instanceof Error ? error.message : String(error)}`)
        return false
    }
}

export function gameLoadRewindState(game: Game) {
    return loadStateRewind(game)
}

function gameLoadTextResources(game: Game) {
    const { res } = getGameServices(game)
    const legacyResource = res as typeof res & {
        loadText?: () => void
    }
    if (typeof res.loadText === 'function') {
        res.loadText()
        return
    }
    legacyResource.loadText()
}

async function gameLoadConradSpriteResources(game: Game) {
    const { res } = getGameServices(game)
    const legacyResource = res as typeof res & {
        loadSpriteOffsets?: (name: string, spr: unknown) => Promise<void>
    }
    if (typeof res.loadSpriteOffsets === 'function') {
        await res.loadSpriteOffsets('PERSO', res.sprites.spr1)
        return
    }
    await legacyResource.loadSpriteOffsets('PERSO', res.sprites.spr1)
}

async function gameLoadSoundResources(game: Game) {
    const { res } = getGameServices(game)
    const legacyResource = res as typeof res & {
        loadFib?: (name: string) => Promise<void>
    }
    if (typeof res.loadSoundEffects === 'function') {
        await res.loadSoundEffects('GLOBAL')
        return
    }
    await legacyResource.loadFib('GLOBAL')
}

async function gameBootResources(game: Game) {
    const { res, mix } = getGameServices(game)
    getGameSessionState(game).randSeed = new Date().getTime()
    gameLoadTextResources(game)
    await res.load('FB_TXT', ObjectType.otFnt)
    mix.init()

    await gamePlayCutscene(game, 0x40)
    await gamePlayCutscene(game, 0x0D)

    await res.load('GLOBAL', ObjectType.otIcn)
    await res.load('GLOBAL', ObjectType.otSpc)
    await res.load('PERSO', ObjectType.otSpr)
    await gameLoadConradSpriteResources(game)
    res.initializeConradVisuals()
    await gameLoadSoundResources(game)
}

async function gamePresentTitleScreen(game: Game) {
    const { menu, mix, stub } = getGameServices(game)
    mix.playMusic(1)
    await menu.handleTitleScreen()
    const selectedOption = typeof menu.selectedOption === 'number' ? menu.selectedOption : menu._selectedOption
    if (selectedOption === Menu.menuOptionItemQuit || stub.input.quit) {
        stub.input.quit = true
        return false
    }
    gameApplyTitleScreenSelection(game)
    mix.stopMusic()
    return true
}

function gamePreparePlaythroughSession(game: Game) {
    const { vid, stub } = getGameServices(game)
    vid.setTextPalette()
    vid.setPalette0xF()
    stub.setOverscanColor(0xE0)
    vid.clearLevelPaletteState()
    gameBeginPlaythrough(game)
}

function gameStartRenderLoop(game: Game) {
    gameResetGameState(game)
    gameBeginFrameLoop(game)
    if (getGameSessionState(game).autoSave) {
        gameSaveGameState(game, kAutoSaveSlot)
        gameSetSaveTimestamp(game)
        console.log(`[rewind-runtime] start-loop autosave len=${game.rewind.len} ptr=${game.rewind.ptr}`)
    }
    game.renders = 0
    if (typeof game.debugStartFrame !== 'number') {
        game.debugStartFrame = 10650
    }
    game.renderPromise = new Promise<void>((resolve) => {
        game.renderDone = () => resolve()
    })
    new Promise(() => requestAnimationFrame(() => gameRunLoop(game)))
    return game.renderPromise
}

function gameResetPostSessionInput(game: Game) {
    const input = getGameServices(game).stub.input
    input.dirMask = 0
    input.enter = false
    input.space = false
    input.shift = false
}

async function gameProcessActiveFrame(game: Game) {
    const { cut, vid } = getGameServices(game)
    const world = getGameWorldState(game)
    const session = getGameSessionState(game)
    const runtime = getRuntimeRegistryState(game)
    vid.restoreFrontLayerFromBack()
    await gameUpdatePgeDirectionalInputState(game)
    gameRebuildPgeCollisionStateForCurrentRoom(game, world.currentRoom)
    gameRebuildActiveRoomCollisionSlotLookup(game, world.currentRoom)
    gameRebuildActiveFramePgeList(game)

    const oldLevel = world.currentLevel
    gameProcessActivePgesForFrame(game, runtime.livePgeStore.activeFrameList, world.currentRoom)
    if (session.startedFromLevelSelect && game.renders < 5) {
        const conrad = runtime.livePgesByIndex[0]
        gameDebugLog(
            game,
            'runtime',
            `[direct-start] frame=${game.renders} level=${world.currentLevel} currentRoom=${world.currentRoom} conradRoom=${conrad.roomLocation} pos=(${conrad.posX},${conrad.posY}) state=${conrad.scriptStateType}/${conrad.firstScriptEntryIndex} anim=${conrad.animNumber} deathCounter=${world.deathCutsceneCounter} loadMap=${world.loadMap}`
        )
    }
    return oldLevel
}

async function gameResolveLevelChange(game: Game, previousLevel: number) {
    if (previousLevel === getGameWorldState(game).currentLevel) {
        return false
    }
    await gameChangeLevel(game)
    if (getGameSessionState(game).autoSave) {
        gameSaveGameState(game, kAutoSaveSlot)
        gameSetSaveTimestamp(game)
        console.log(`[rewind-runtime] level-change autosave len=${game.rewind.len} ptr=${game.rewind.ptr}`)
    }
    getGamePgeState(game).opcodeTempVar1 = 0
    return true
}

async function gameResolvePendingMapLoad(game: Game) {
    const { cut, vid } = getGameServices(game)
    const runtime = getRuntimeRegistryState(game)
    const world = getGameWorldState(game)
    if (!world.loadMap) {
        return
    }
    gameDebugLog(game, 'runtime', `[map-load] requested level=${world.currentLevel} worldRoom=${world.currentRoom} conradRoom=${runtime.livePgesByIndex[0].roomLocation}`)
    if (world.currentRoom === uint8Max || !gameHasLevelMap(game, runtime.livePgesByIndex[0].roomLocation)) {
        const conrad = runtime.livePgesByIndex[0]
        gameDebugWarn(
            game,
            'runtime',
            `[direct-start] triggering death cutscene due to missing map: frame=${game.renders} level=${world.currentLevel} currentRoom=${world.currentRoom} conradRoom=${conrad.roomLocation} pos=(${conrad.posX},${conrad.posY}) state=${conrad.scriptStateType}/${conrad.firstScriptEntryIndex} anim=${conrad.animNumber}`
        )
        cut.setId(6)
        gameQueueDeathCutscene(game, 1)
        return
    }
    const room = runtime.livePgesByIndex[0].roomLocation
    gameDebugLog(game, 'runtime', `[map-load] committing level=${world.currentLevel} room=${room}`)
    gameCommitLoadedRoom(game, room)
    await gameLoadLevelMap(game, room)
    vid.fullRefresh()
    gameDebugLog(game, 'runtime', `[map-load] completed room=${room} overlayCounter=${getGameUiState(game).currentRoomOverlayCounter}`)
}

async function gameRenderCurrentFrame(game: Game) {
    const { vid } = getGameServices(game)
    const world = getGameWorldState(game)
    await gamePrepareAnimationsInRooms(game, world.currentRoom)
    await gameDrawAnims(game)
    game.renders++
    gameDrawCurrentInventoryItem(game)
    gameDrawCurrentRoomOverlay(game)
    gameDrawLevelTexts(game)

    if (world.blinkingConradCounter !== 0) {
        --world.blinkingConradCounter
    }
    await vid.updateScreen()
    await gameUpdateTiming(game)
    await gameDrawStoryTexts(game)
}

async function gameHandleFrameMenus(game: Game) {
    const { stub } = getGameServices(game)
    if (stub.input.backspace) {
        stub.input.backspace = false
        await gameHandleInventory(game)
    }
    if (stub.input.escape) {
        if (await gameHandleConfigPanel(game)) {
            gameEndLoop(game)
            return true
        }
        stub.input.escape = false
    }
    return false
}

export async function gameRunLoop(game: Game) {
    await gameMainLoop(game)
    if (!getGameServices(game).stub.input.quit && !getGameSessionState(game).endLoop) {
        requestAnimationFrame(() => gameRunLoop(game))
    } else {
        // @ts-ignore
        game.renderDone()
    }
}

export async function gameRun(game: Game) {
    await gameBootResources(game)

    const presentMenu = true
    while (!getGameServices(game).stub.input.quit) {
        const world = getGameWorldState(game)
        const ui = getGameUiState(game)
        const session = getGameSessionState(game)
        gameDebugLog(game, 'runtime', `[session] title-loop level=${world.currentLevel} skill=${ui.skillLevel} autoSave=${session.autoSave}`)
        if (presentMenu) {
            if (!await gamePresentTitleScreen(game)) {
                break
            }
        }
        if (getGameServices(game).stub.input.quit) {
            break
        }
        gamePreparePlaythroughSession(game)
        gameDebugLog(game, 'runtime', `[session] starting playthrough level=${world.currentLevel} skill=${ui.skillLevel} slot=${session.stateSlot}`)
        await gameLoadLevelData(game)
        await gameStartRenderLoop(game)
        gameDebugLog(game, 'runtime', `[session] playthrough-ended quit=${getGameServices(game).stub.input.quit} endLoop=${session.endLoop} renders=${game.renders}`)
        gameResetPostSessionInput(game)
    }
}

export function gameSaveGameState(game: Game, slot: number) {
    if (slot === kAutoSaveSlot) {
        return saveStateRewind(game)
    }
    getSavedGameStates(game).set(slot, createGameSnapshot(game))
    return true
}

export function gameLoadGameState(game: Game, slot: number) {
    if (slot === kAutoSaveSlot) {
        return loadStateRewind(game)
    }
    const snapshot = getSavedGameStates(game).get(slot)
    if (!snapshot) {
        return false
    }
    return applyGameSnapshot(game, snapshot)
}

// Process each active PGE once for this frame after the dynamic collision slots and the
// active left/current/right room collision window have been rebuilt. For each non-null PGE
// entry, this loop refreshes the per-PGE collision-grid origin used by room-collision queries
// and then hands control to gameRunPgeFrameLogic() to run that entity's frame logic.
export function gameProcessActivePgesForFrame(game: Game, activeFramePges: LivePGE[], currentRoom: number) {
    gameDebugLog(game, 'runtime', `[frame] active-pges count=${activeFramePges.length} room=${currentRoom} frame=${game.renders}`)
    for (const pge of activeFramePges) {
        getGameCollisionState(game).currentPgeCollisionGridY = ((pge.posY / 36) >> 0) & ~1
        getGameCollisionState(game).currentPgeCollisionGridX = (pge.posX + 8) >> 4
        gameDebugLog(game, 'runtime', `[frame] pge=${pge.index} room=${pge.roomLocation} pos=(${pge.posX},${pge.posY}) collisionOrigin=(${getGameCollisionState(game).currentPgeCollisionGridX},${getGameCollisionState(game).currentPgeCollisionGridY})`)
        gameRunPgeFrameLogic(game, pge, currentRoom)
    }
}

export async function gameMainLoop(game: Game) {
    const runtime = getRuntimeRegistryState(game)
    const world = getGameWorldState(game)
    const conrad = runtime.livePgesByIndex[0]
    gameDebugLog(game, 'runtime', `[frame] begin frame=${game.renders} level=${world.currentLevel} room=${world.currentRoom} conradRoom=${conrad?.roomLocation} loadMap=${world.loadMap} text=${world.textToDisplay}`)
    if (!gameConsumeLevelCutsceneSkip(game)) {
        await gamePlayCutscene(game)
    }
    if (await gameDidFinishAllLevels(game)) return
    if (await gameDidDie(game)) return

    const oldLevel = await gameProcessActiveFrame(game)
    if (await gameResolveLevelChange(game, oldLevel)) {
        return
    }
    await gameResolvePendingMapLoad(game)
    await gameRenderCurrentFrame(game)
    if (await gameHandleFrameMenus(game)) return
    gameInpHandleSpecialKeys(game)
    gameMaybeAutoSave(game, kAutoSaveIntervalMs)
    gameDebugLog(game, 'runtime', `[frame] end frame=${game.renders} level=${world.currentLevel} room=${world.currentRoom} conradRoom=${runtime.livePgesByIndex[0]?.roomLocation} loadMap=${world.loadMap}`)
}
