import type { LivePGE } from '../core/intern'
import type { Game } from './game'
import { Menu } from './menu'
import { ObjectType, LocaleData } from '../resource/resource'
import { dirDown, dirUp } from '../platform/systemstub-web'
import { charW, gamescreenW, uint8Max } from '../core/game_constants'
import { kAutoSaveIntervalMs, kAutoSaveSlot, kIngameSaveSlot, kRewindSize } from './game'
import { gameDrawAnims, gameDrawCurrentInventoryItem, gameDrawCurrentRoomOverlay, gameDrawLevelTexts, gameDrawStoryTexts } from './game-draw'
import { gameRebuildActiveRoomCollisionSlotLookup } from './game-collision'
import { gameHandleConfigPanel, gameHandleInventory } from './game-inventory'
import { getGameServices } from './game-services'
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
} from './game-lifecycle'
import { gameRebuildActiveFramePgeList, gameRebuildPgeCollisionStateForCurrentRoom, gameRunPgeFrameLogic, gameUpdatePgeDirectionalInputState } from './game-pge'
import { gameDebugLog, gameDebugWarn } from './game-debug'
import { getGameCollisionState, getGamePgeState, getGameSessionState, getGameUiState, getGameWorldState } from './game-state'
import { gameChangeLevel, gameHasLevelMap, gameLoadLevelData, gameLoadLevelMap, gamePrepareAnimationsInRooms, gameResetGameState } from './game-world'
import { getRuntimeRegistryState } from './game-runtime-data'
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
} from './game-session-flow'

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
    getGameServices(game).res.loadText()
}

async function gameLoadConradSpriteResources(game: Game) {
    const { res } = getGameServices(game)
    await res.loadSpriteOffsets('PERSO', res.sprites.spr1)
}

async function gameLoadSoundResources(game: Game) {
    const { res } = getGameServices(game)
    if (typeof res.loadSoundEffects === 'function') {
        await res.loadSoundEffects('GLOBAL')
    } else {
        // Legacy fallback for resource implementations that predate loadSoundEffects
        await (res as unknown as { loadFib(name: string): Promise<void> }).loadFib('GLOBAL')
    }
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
    game.services.stub._pi.dirMask = 0
    game.services.stub._pi.enter = false
    game.services.stub._pi.space = false
    game.services.stub._pi.shift = false
}

async function gameProcessActiveFrame(game: Game) {
    const world = getGameWorldState(game)
    const session = getGameSessionState(game)
    const runtime = getRuntimeRegistryState(game)
    game.services.vid.restoreFrontLayerFromBack()
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
    getGamePgeState(game).opcodeTempVar1 = 0
    return true
}

async function gameResolvePendingMapLoad(game: Game) {
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
        game.services.cut.setId(6)
        gameQueueDeathCutscene(game, 1)
        return
    }
    const room = runtime.livePgesByIndex[0].roomLocation
    gameDebugLog(game, 'runtime', `[map-load] committing level=${world.currentLevel} room=${room}`)
    gameCommitLoadedRoom(game, room)
    await gameLoadLevelMap(game, room)
    game.services.vid.fullRefresh()
    gameDebugLog(game, 'runtime', `[map-load] completed room=${room} overlayCounter=${getGameUiState(game).currentRoomOverlayCounter}`)
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
    await game.services.vid.updateScreen()
    await gameUpdateTiming(game)
    await gameDrawStoryTexts(game)
}

async function gameHandleFrameMenus(game: Game) {
    if (game.services.stub._pi.backspace) {
        game.services.stub._pi.backspace = false
        await gameHandleInventory(game)
    }
    if (game.services.stub._pi.escape) {
        if (await gameHandleConfigPanel(game)) {
            gameEndLoop(game)
            return true
        }
        game.services.stub._pi.escape = false
    }
    return false
}

export async function gameRunLoop(game: Game) {
    await gameMainLoop(game)
    if (!game.services.stub._pi.quit && !getGameSessionState(game).endLoop) {
        requestAnimationFrame(() => gameRunLoop(game))
    } else {
        // @ts-ignore
        game.renderDone()
    }
}

export async function gameRun(game: Game) {
    await gameBootResources(game)

    const presentMenu = true
    while (!game.services.stub._pi.quit) {
        gameDebugLog(game, 'runtime', `[session] title-loop level=${game.world.currentLevel} skill=${game.ui.skillLevel} autoSave=${game.session.autoSave}`)
        if (presentMenu) {
            if (!await gamePresentTitleScreen(game)) {
                break
            }
        }
        if (game.services.stub._pi.quit) {
            break
        }
        gamePreparePlaythroughSession(game)
        gameDebugLog(game, 'runtime', `[session] starting playthrough level=${game.world.currentLevel} skill=${game.ui.skillLevel} slot=${game.session.stateSlot}`)
        await game.loadLevelData()
        await gameStartRenderLoop(game)
        gameDebugLog(game, 'runtime', `[session] playthrough-ended quit=${game.services.stub._pi.quit} endLoop=${game.session.endLoop} renders=${game.renders}`)
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
