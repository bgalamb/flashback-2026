import type { Game } from "./game"
import type { LivePGE, PgeOpcodeArgs } from "../core/intern"
import { ctDownRoom, ctLeftRoom, ctRightRoom, ctUpRoom, kIngameSaveSlot, ctRoomSize, uint8Max, uint16Max } from "../core/game_constants"
import { gameFindFirstMatchingCollidingObject, gameFindOverlappingPgeByObjectType } from './game-collision'
import { gameInitializePgeDefaultAnimation } from './game-pge'
import { assert } from "../core/assert"
import { gameMarkSaveStateCompleted, gameQueueDeathCutscene, gameRequestMapReload, gameSetCurrentLevel } from './game-lifecycle'
import { getRuntimeRegistryState } from './game-runtime-data'
import { getGamePgeState, getGameSessionState, getGameUiState, getGameWorldState } from './game-state'
import { gameGetRandomNumber } from './game-world'

export const pgeOpNop = (args: PgeOpcodeArgs, game: Game) => 1

export const pgeOpPickupobject = (args: PgeOpcodeArgs, game: Game) => {
	const pge: LivePGE = gameFindOverlappingPgeByObjectType(game, args.pge, 3)
	if (pge) {
		game.queuePgeGroupSignal(args.pge.index, pge.index, args.a)
		return uint16Max
	}
	return 0
}

export const pgeOpAdditemtoinventory = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	game.updatePgeInventory(runtime.livePgesByIndex[args.a], args.pge)
	args.pge.roomLocation = uint8Max
	return uint16Max
}

export const pgeOpCopypge = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	const src: LivePGE = runtime.livePgesByIndex[args.a]
	const dst: LivePGE = args.pge

	dst.posX = src.posX
	dst.posY = src.posY
	dst.roomLocation = src.roomLocation

	dst.flags &= 0xFE
	if (src.flags & 1) {
		dst.flags |= 1
	}
	game.reorderPgeInventory(args.pge)
	return uint16Max
}

export const pgeOpCanusecurrentinventoryitem = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	const pge: LivePGE = runtime.livePgesByIndex[0]
	const currentInventoryItemIndex = game.getCurrentInventoryItemIndex(pge)
	if (currentInventoryItemIndex !== uint8Max && game.services.res.level.pgeAllInitialStateFromFile[currentInventoryItemIndex].objectId === args.a) {
		return 1
	}
	return 0
}

export const pgeOpRemoveitemfrominventory = (args: PgeOpcodeArgs, game: Game) => {
	const currentInventoryItemIndex = game.getCurrentInventoryItemIndex(args.pge)
	if (currentInventoryItemIndex !== uint8Max) {
		game.queuePgeGroupSignal(args.pge.index, currentInventoryItemIndex, args.a)
	}
	return 1
}

export const pgeOpSetpgecounter = (args: PgeOpcodeArgs, game: Game) => {
	args.pge.counterValue = args.a
	return 1
}

export const pgeOpDecpgecounter = (args: PgeOpcodeArgs, game: Game) => {
	args.pge.counterValue -= 1
	return args.a === args.pge.counterValue ? uint16Max : 0
}

export const pgeOpWakeuppge = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	if (args.a <= 3) {
		const num = args.pge.initPge.counterValues[args.a]
		if (num >= 0) {
			const pge: LivePGE = runtime.livePgesByIndex[num]
			pge.flags |= 4
			runtime.livePgeStore.activeFrameByIndex[num] = pge
		}
	}
	return 1
}

export const pgeOpRemovepge = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	if (args.a <= 3) {
		const num = args.pge.initPge.counterValues[args.a]
		if (num >= 0) {
			runtime.livePgeStore.activeFrameByIndex[num] = null
			runtime.livePgesByIndex[num].flags &= ~4
		}
	}
	return 1
}

export const pgeOpKillpge = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	const ui = getGameUiState(game)
	const pge: LivePGE = args.pge
	pge.roomLocation = 0xFE
	pge.flags &= ~4
	runtime.livePgeStore.activeFrameByIndex[pge.index] = null
	if (pge.initPge.objectType === 10) {
		ui.score += 200
	}
	return uint16Max
}

export const pgeOpIsincurrentroom = (args: PgeOpcodeArgs, game: Game) => {
	return args.pge.roomLocation === game.world.currentRoom ? 1 : 0
}

export const pgeOpIsnotincurrentroom = (args: PgeOpcodeArgs, game: Game) => {
	return args.pge.roomLocation === game.world.currentRoom ? 0 : 1
}

export const pgeOpScrollposy = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	let pge: LivePGE = args.pge
	args.pge.posY += args.a
	for (const inventoryItemIndex of game.getInventoryItemIndices(pge)) {
		pge = runtime.livePgesByIndex[inventoryItemIndex]
		pge.posY += args.a
	}
	return 1
}

export const pgeOpPlaydefaultdeathcutscene = (args: PgeOpcodeArgs, game: Game) => {
	gameQueueDeathCutscene(game, args.a)
	return 1
}

export const pgeOpDisplaytext = (args: PgeOpcodeArgs, game: Game) => {
	getGameWorldState(game).textToDisplay = args.a
	return uint16Max
}

export const pgeOpPlaysound = (args: PgeOpcodeArgs, game: Game) => {
	const sfxId = args.a & uint8Max
	const softVol = args.a >> 8
	game.playSound(sfxId, softVol)
	return uint16Max
}

export const pgeOpHasinventoryitem = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	for (const inventoryItemIndex of game.getInventoryItemIndices(runtime.livePgesByIndex[0])) {
		const pge = runtime.livePgesByIndex[inventoryItemIndex]
		if (pge.initPge.objectId === args.a) {
			return uint16Max
		}
	}
	return 0
}

export const pgeOpUpdategroup0 = (args: PgeOpcodeArgs, game: Game) => {
	game.queuePgeGroupSignal(args.pge.index, args.pge.initPge.counterValues[0], args.a)
	return uint16Max
}

export const pgeOpUpdategroup1 = (args: PgeOpcodeArgs, game: Game) => {
	game.queuePgeGroupSignal(args.pge.index, args.pge.initPge.counterValues[1], args.a)
	return uint16Max
}

export const pgeOpUpdategroup2 = (args: PgeOpcodeArgs, game: Game) => {
	game.queuePgeGroupSignal(args.pge.index, args.pge.initPge.counterValues[2], args.a)
	return uint16Max
}

export const pgeOpUpdategroup3 = (args: PgeOpcodeArgs, game: Game) => {
	game.queuePgeGroupSignal(args.pge.index, args.pge.initPge.counterValues[3], args.a)
	return uint16Max
}

export const pgeOpIspgedead = (args: PgeOpcodeArgs, game: Game) => {
	const ui = getGameUiState(game)
	const pge: LivePGE = args.pge
	if (pge.life <= 0) {
		if (pge.initPge.objectType === 10) {
			ui.score += 100
		}
		return 1
	}
	return 0
}

export const pgeOpIspgenear = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	return gameFindOverlappingPgeByObjectType(game, runtime.livePgesByIndex[0], args.a) !== null ? 1 : 0
}

export const pgeOpSetlife = (args: PgeOpcodeArgs, game: Game) => {
	args.pge.life = args.a
	return 1
}

export const pgeOpInclife = (args: PgeOpcodeArgs, game: Game) => {
	args.pge.life += args.a
	return 1
}

export const pgeOpSetpgedefaultanim = (args: PgeOpcodeArgs, game: Game) => {
	const world = getGameWorldState(game)
	assert(!(args.a < 0 || args.a >= 4), `Assertion failed: ${args.a} >= 0 && ${args.a} < 4`)
	const r = args.pge.initPge.counterValues[args.a]
	args.pge.roomLocation = r
	if (r === 1) {
		gameRequestMapReload(game, world.currentRoom)
	}
	gameInitializePgeDefaultAnimation(game, args.pge)
	return 1
}

export const pgeOpRemovepgeifnotnear = (args: PgeOpcodeArgs, game: Game) => {
    const world = getGameWorldState(game)
    const runtime = getRuntimeRegistryState(game)
    const pge: LivePGE = args.pge
    const skipPge = () => {
        game._shouldPlayPgeAnimationSound = false
        return 1
    }
    const killPge = () => {
        pge.flags &= ~4
        pge.collisionSlot = uint16Max
        runtime.livePgeStore.activeFrameByIndex[pge.index] = null
        return skipPge()
    }

	if (!(pge.initPge.flags & 4)) return killPge()
	if (world.currentRoom & 0x80) return skipPge()
	if (pge.roomLocation & 0x80) return killPge()
	if (pge.roomLocation > 0x3F) return killPge()
	if (pge.roomLocation === world.currentRoom) return skipPge()
	if (pge.roomLocation === game.services.res.level.ctData[ctUpRoom + world.currentRoom]) return skipPge()
	if (pge.roomLocation === game.services.res.level.ctData[ctDownRoom + world.currentRoom]) return skipPge()
	if (pge.roomLocation === game.services.res.level.ctData[ctRightRoom + world.currentRoom]) return skipPge()
	if (pge.roomLocation === game.services.res.level.ctData[ctLeftRoom + world.currentRoom]) return skipPge()
    return killPge()
}

export const pgeOpLoadpgecounter = (args: PgeOpcodeArgs, game: Game) => {
	args.pge.counterValue = args.pge.initPge.counterValues[args.a]
	return 1
}

export const pgeOpFindandcopypge = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	for (const pendingGroup of runtime.pendingSignalsByTargetPgeIndex.get(args.pge.index) ?? []) {
		if (pendingGroup.signalId === args.a) {
			args.a = pendingGroup.senderPgeIndex
			args.b = 0
			pgeOpCopypge(args, game)
			return 1
		}
	}
	return 0
}

export const pgeOpIsinrandomrange = (args: PgeOpcodeArgs, game: Game) => {
	let n = args.a & uint16Max
	if (n !== 0) {
		const randomNumber = game.getRandomNumber()
		if ((randomNumber % n) === 0) {
			return 1
		}
	}
	return 0
}

export const pgeOpAddtocredits = (args: PgeOpcodeArgs, game: Game) => {
    const world = getGameWorldState(game)
    const runtime = getRuntimeRegistryState(game)
    const creditsInventoryPgeIndex = args.pge.initPge.counterValues[0]
    const pickedUpCreditAmount = args.pge.initPge.counterValues[1]
    const creditsInventoryPge = runtime.livePgesByIndex[creditsInventoryPgeIndex]
    world.credits += pickedUpCreditAmount
    creditsInventoryPge.life = world.credits
    args.pge.roomLocation = uint8Max
    return uint16Max
}

export const pgeOpSubfromcredits = (args: PgeOpcodeArgs, game: Game) => {
	game.world.credits -= args.a
	return game.world.credits >= 0 ? 1 : 0
}

export const pgeOpSavestate = (args: PgeOpcodeArgs, game: Game) => {
	const session = getGameSessionState(game)
	gameMarkSaveStateCompleted(game)
	game.saveGameState(kIngameSaveSlot)
	if (session.validSaveState && game.options.playGamesavedSound) {
		game.playSound(68, 0)
	}
	return uint16Max
}

export const pgeOpIscollidingobject = (args: PgeOpcodeArgs, game: Game) => {
	const { obj } = gameFindFirstMatchingCollidingObject(game, args.pge, 3, uint8Max, uint8Max)
	return obj === args.a ? 1 : 0
}

export const pgeIstoggleable = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	for (const pendingGroup of runtime.pendingSignalsByTargetPgeIndex.get(args.pge.index) ?? []) {
		if (args.a === 0) {
			if (pendingGroup.signalId === 1 || pendingGroup.signalId === 2) return 1
		} else if (pendingGroup.signalId === 3 || pendingGroup.signalId === 4) {
			return 1
		}
	}
	return 0
}

export const pgeOpSetlifecounter = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	runtime.livePgesByIndex[args.a].life = args.pge.initPge.counterValues[0]
	return 1
}

export const pgeOpDeclifecounter = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	args.pge.life = runtime.livePgesByIndex[args.a].life - 1
	return 1
}

export const pgeOpPlaycutscene = (args: PgeOpcodeArgs, game: Game) => {
	const world = getGameWorldState(game)
	if (world.deathCutsceneCounter === 0) {
		game.services.cut.setId(args.a)
	}
	return 1
}

export const pgeOpCompareunkvar = (args: PgeOpcodeArgs, game: Game) => {
	return args.a === -1 ? 1 : 0
}

export const pgeOpPlaydeathcutscene = (args: PgeOpcodeArgs, game: Game) => {
	gameQueueDeathCutscene(game, args.pge.initPge.counterValues[3] + 1, args.a)
	return 1
}

export const pgeOpPlaysoundgroup = (args: PgeOpcodeArgs, game: Game) => {
    assert(!(args.a >= 4), `Assertion failed: ${args.a} < 4`)
	const c = args.pge.initPge.counterValues[args.a] & uint16Max
	const sfxId = c & uint8Max
	const softVol = c >> 8
	game.playSound(sfxId, softVol)
	return uint16Max
}

export const pgeOpAdjustpos = (args: PgeOpcodeArgs, game: Game) => {
	const pge: LivePGE = args.pge
	pge.posX &= 0xFFF0
	if (pge.posY !== 70 && pge.posY != 142 && pge.posY !== 214) {
		pge.posY = (((pge.posY / 72) >> 0) + 1) * 72 - 2
	}
	return uint16Max
}

export const pgeOpSetpgeposx = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	const ownerPgeIndex = args.pge.inventoryOwnerPgeIndex
	if (ownerPgeIndex !== uint8Max) {
		args.pge.posX = runtime.livePgesByIndex[ownerPgeIndex].posX
	}
	return uint16Max
}

export const pgeOpSetpgeposmodx = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	const ownerPgeIndex = args.pge.inventoryOwnerPgeIndex
	if (ownerPgeIndex !== uint8Max) {
		let dx = runtime.livePgesByIndex[ownerPgeIndex].posX % 256
		if (dx >= args.pge.posX) {
			dx -= args.pge.posX
		}
		args.pge.posX += dx
	}
	return uint16Max
}

export const pgeOpChangeroom = (args: PgeOpcodeArgs, game: Game) => {
	const world = getGameWorldState(game)
	const runtime = getRuntimeRegistryState(game)
	const destinationPgeIndex = args.pge.initPge.counterValues[args.a]
	const sourcePgeIndex = args.pge.initPge.counterValues[args.a + 1]
	const destinationPge = runtime.livePgesByIndex[destinationPgeIndex]
	const sourcePge = runtime.livePgesByIndex[sourcePgeIndex]
	if (sourcePge.roomLocation >= 0 && sourcePge.roomLocation < ctRoomSize) {
		const previousRoom = destinationPge.roomLocation
		destinationPge.posX = sourcePge.posX
		destinationPge.posY = sourcePge.posY
		destinationPge.roomLocation = sourcePge.roomLocation

		if (previousRoom !== destinationPge.roomLocation) {
			const previousRoomList = runtime.livePgeStore.liveByRoom[previousRoom]
			if (previousRoomList) {
				const previousRoomIndex = previousRoomList.indexOf(destinationPge)
				if (previousRoomIndex >= 0) previousRoomList.splice(previousRoomIndex, 1)
			}
			const nextRoomList = runtime.livePgeStore.liveByRoom[destinationPge.roomLocation]
			if (nextRoomList) nextRoomList.push(destinationPge)
		}

		if (destinationPge.initPge.scriptNodeIndex === sourcePge.initPge.scriptNodeIndex) {
			destinationPge.flags &= ~1
			if (sourcePge.flags & 1) destinationPge.flags |= 1
			destinationPge.scriptStateType = sourcePge.scriptStateType
			destinationPge.animSeq = 0
			const objectNode = game.services.res.level.objectNodesMap[destinationPge.initPge.scriptNodeIndex]
			let firstObjNumber = 0
			while (objectNode.objects[firstObjNumber].type !== destinationPge.scriptStateType) {
				++firstObjNumber
			}
			destinationPge.firstScriptEntryIndex = firstObjNumber
		}

		if (destinationPge.initPge.objectType === 1 && world.currentRoom !== destinationPge.roomLocation) {
			gameRequestMapReload(game, destinationPge.roomLocation)
		}
		gameInitializePgeDefaultAnimation(game, destinationPge)
	}
	return uint16Max
}

export const pgeOpChangelevel = (args: PgeOpcodeArgs, game: Game) => {
	const world = getGameWorldState(game)
	gameSetCurrentLevel(game, args.a - 1)
	return world.currentLevel
}

export const pgeOpShakescreen = (args: PgeOpcodeArgs, game: Game) => {
	game.services.vid.setShakeOffset(gameGetRandomNumber(game) & 7)
	return uint16Max
}

export const pgeOpSettempvar1 = (args: PgeOpcodeArgs, game: Game) => {
	getGamePgeState(game).opcodeTempVar1 = args.a
	return uint16Max
}

export const pgeOpIstempvar1set = (args: PgeOpcodeArgs, game: Game) => {
	return getGamePgeState(game).opcodeTempVar1 !== args.a ? 0 : uint16Max
}
