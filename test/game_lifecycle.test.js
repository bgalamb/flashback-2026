require('ts-node/register/transpile-only')

const test = require('node:test')
const assert = require('node:assert/strict')

const {
    UINT16_MAX,
} = require('../src/core/game_constants.ts')
const {
    ROOM_OVERLAY_DURATION_FRAMES,
    gameRequestMapReload,
    gameCommitLoadedRoom,
    gameResetLevelLifecycle,
    gameMarkSaveStateCompleted,
} = require('../src/game/game_lifecycle.ts')

test('lifecycle helpers update grouped state on real Game-shaped objects instead of legacy flat fields', () => {
    const world = {
        currentLevel: 1,
        currentRoom: 4,
        currentIcon: 0,
        loadMap: false,
        printLevelCodeCounter: 0,
        credits: 9,
        blinkingConradCounter: 3,
        textToDisplay: 12,
        eraseBackground: false,
        deathCutsceneCounter: 2,
    }
    const ui = {
        skillLevel: 1,
        score: 0,
        currentRoomOverlayCounter: 7,
        currentInventoryIconNum: 0,
        saveStateCompleted: true,
    }
    const session = {
        randSeed: 0,
        endLoop: false,
        skipNextLevelCutscene: false,
        startedFromLevelSelect: false,
        frameTimestamp: 0,
        autoSave: false,
        saveTimestamp: 0,
        stateSlot: 1,
        validSaveState: false,
    }
    const pge = {
        shouldProcessCurrentPgeObjectNode: true,
        opcodeTempVar1: 6,
        opcodeTempVar2: 7,
    }
    const game = {
        world,
        ui,
        session,
        pge,
        _currentRoom: 99,
        _loadMap: false,
        _credits: 88,
        _deathCutsceneCounter: 77,
        _textToDisplay: 66,
        _currentRoomOverlayCounter: 55,
        _saveStateCompleted: false,
        _validSaveState: false,
        _opcodeTempVar1: 44,
        _opcodeTempVar2: 33,
        _shouldProcessCurrentPgeObjectNode: true,
        _cut: {
            deathCutsceneId: null,
            setDeathCutSceneId(id) {
                this.deathCutsceneId = id
            },
        },
    }

    gameRequestMapReload(game, 8)
    assert.equal(world.currentRoom, 8)
    assert.equal(world.loadMap, true)
    assert.equal(game._currentRoom, 99)

    gameCommitLoadedRoom(game, 6)
    assert.equal(world.currentRoom, 6)
    assert.equal(world.loadMap, false)
    assert.equal(ui.currentRoomOverlayCounter, ROOM_OVERLAY_DURATION_FRAMES)
    assert.equal(game._currentRoomOverlayCounter, 55)

    gameResetLevelLifecycle(game, 3)
    assert.equal(world.currentRoom, 3)
    assert.equal(world.credits, 0)
    assert.equal(world.deathCutsceneCounter, 0)
    assert.equal(world.loadMap, true)
    assert.equal(world.blinkingConradCounter, 0)
    assert.equal(world.textToDisplay, UINT16_MAX)
    assert.equal(ui.currentRoomOverlayCounter, 0)
    assert.equal(ui.saveStateCompleted, false)
    assert.equal(session.validSaveState, false)
    assert.equal(pge.opcodeTempVar1, 0)
    assert.equal(pge.opcodeTempVar2, UINT16_MAX)
    assert.equal(pge.shouldProcessCurrentPgeObjectNode, false)
    assert.equal(game._credits, 88)
    assert.equal(game._textToDisplay, 66)

    gameMarkSaveStateCompleted(game)
    assert.equal(ui.saveStateCompleted, true)
    assert.equal(session.validSaveState, true)
    assert.equal(game._saveStateCompleted, false)
    assert.equal(game._validSaveState, false)
})
