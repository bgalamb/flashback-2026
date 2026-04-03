import type { LivePGE } from '../core/intern'
import type { Game } from './game'
import { Menu } from './menu'
import { ObjectType, LocaleData } from '../resource/resource'
import { dirDown, dirUp } from '../platform/systemstub_web'
import { charW, gamescreenW, uint8Max } from '../core/game_constants'
import { kAutoSaveIntervalMs, kAutoSaveSlot, kIngameSaveSlot, kRewindSize } from './game'
import { gameDrawAnims, gameDrawCurrentInventoryItem, gameDrawCurrentRoomOverlay, gameDrawLevelTexts, gameDrawStoryTexts } from './game_draw'
import { gameRebuildActiveRoomCollisionSlotLookup } from './game_collision'
import { gameHandleConfigPanel, gameHandleInventory } from './game_inventory'
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
    gameQueueDeathCutscene,
    gameSetSaveTimestamp,
    gameTickDeathCutscene
} from './game_lifecycle'
import { gameRebuildActiveFramePgeList, gameRebuildPgeCollisionStateForCurrentRoom, gameRunPgeFrameLogic, gameUpdatePgeDirectionalInputState } from './game_pge'
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
    const { mix, stub } = getGameServices(game)
    mix.playMusic(1)
    await game._menu.handleTitleScreen()
    if (game._menu._selectedOption === Menu.menuOptionItemQuit || stub._pi.quit) {
        stub._pi.quit = true
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
    game.resetGameState()
    gameBeginFrameLoop(game)
    game.renders = 0
    game.debugStartFrame = 10650
    game.renderPromise = new Promise<void>((resolve) => {
        game.renderDone = () => resolve()
    })
    new Promise(() => requestAnimationFrame(() => gameRunLoop(game)))
    return game.renderPromise
}

function gameResetPostSessionInput(game: Game) {
    game._stub._pi.dirMask = 0
    game._stub._pi.enter = false
    game._stub._pi.space = false
    game._stub._pi.shift = false
}

async function gameProcessActiveFrame(game: Game) {
    const world = getGameWorldState(game)
    const session = getGameSessionState(game)
    const runtime = getRuntimeRegistryState(game)
    game._vid.restoreFrontLayerFromBack()
    await gameUpdatePgeDirectionalInputState(game)
    gameRebuildPgeCollisionStateForCurrentRoom(game, world.currentRoom)
    gameRebuildActiveRoomCollisionSlotLookup(game, world.currentRoom)
    gameRebuildActiveFramePgeList(game)

    const oldLevel = world.currentLevel
    gameProcessActivePgesForFrame(game, runtime.livePgeStore.activeFrameList, world.currentRoom)
    if (session.startedFromLevelSelect && game.renders < 5) {
        const conrad = runtime.livePgesByIndex[0]
        console.log(
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
    getGamePgeState(game).opcodeTempVar1 = 0
    return true
}

async function gameResolvePendingMapLoad(game: Game) {
    const runtime = getRuntimeRegistryState(game)
    const world = getGameWorldState(game)
    if (!world.loadMap) {
        return
    }
    if (world.currentRoom === uint8Max || !gameHasLevelMap(game, runtime.livePgesByIndex[0].roomLocation)) {
        const conrad = runtime.livePgesByIndex[0]
        console.warn(
            `[direct-start] triggering death cutscene due to missing map: frame=${game.renders} level=${world.currentLevel} currentRoom=${world.currentRoom} conradRoom=${conrad.roomLocation} pos=(${conrad.posX},${conrad.posY}) state=${conrad.scriptStateType}/${conrad.firstScriptEntryIndex} anim=${conrad.animNumber}`
        )
        game._cut.setId(6)
        gameQueueDeathCutscene(game, 1)
        return
    }
    const room = runtime.livePgesByIndex[0].roomLocation
    gameCommitLoadedRoom(game, room)
    await gameLoadLevelMap(game, room)
    game._vid.fullRefresh()
}

async function gameRenderCurrentFrame(game: Game) {
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
    await game._vid.updateScreen()
    await gameUpdateTiming(game)
    await gameDrawStoryTexts(game)
}

async function gameHandleFrameMenus(game: Game) {
    if (game._stub._pi.backspace) {
        game._stub._pi.backspace = false
        await gameHandleInventory(game)
    }
    if (game._stub._pi.escape) {
        if (await gameHandleConfigPanel(game)) {
            gameEndLoop(game)
            return true
        }
        game._stub._pi.escape = false
    }
    return false
}

export async function gameRunLoop(game: Game) {
    await gameMainLoop(game)
    if (!game._stub._pi.quit && !getGameSessionState(game).endLoop) {
        requestAnimationFrame(() => gameRunLoop(game))
    } else {
        // @ts-ignore
        game.renderDone()
    }
}

export async function gameRun(game: Game) {
    await gameBootResources(game)

    const presentMenu = true
    while (!game._stub._pi.quit) {
        if (presentMenu) {
            if (!await gamePresentTitleScreen(game)) {
                break
            }
        }
        if (game._stub._pi.quit) {
            break
        }
        gamePreparePlaythroughSession(game)
        await game.loadLevelData()
        await gameStartRenderLoop(game)
        gameResetPostSessionInput(game)
    }
}

export function gameSaveGameState(_game: Game, _slot: number) {
    return
}

export function gameLoadGameState(_game: Game, _slot: number) {
    return true
}

// Process each active PGE once for this frame after the dynamic collision slots and the
// active left/current/right room collision window have been rebuilt. For each non-null PGE
// entry, this loop refreshes the per-PGE collision-grid origin used by room-collision queries
// and then hands control to gameRunPgeFrameLogic() to run that entity's frame logic.
export function gameProcessActivePgesForFrame(game: Game, activeFramePges: LivePGE[], currentRoom: number) {
    for (const pge of activeFramePges) {
        getGameCollisionState(game).currentPgeCollisionGridY = ((pge.posY / 36) >> 0) & ~1
        getGameCollisionState(game).currentPgeCollisionGridX = (pge.posX + 8) >> 4
        gameRunPgeFrameLogic(game, pge, currentRoom)
    }
}

export async function gameMainLoop(game: Game) {
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
}
