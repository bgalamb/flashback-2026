import { assert } from "../core/assert"
import { ctLeftRoom, ctRightRoom, ctRoomSize, ctUpRoom, ctDownRoom, globalGameOptions, kIngameSaveSlot, uint8Max, uint16Max } from "../core/game_constants"
import { PgeOpcodeArgs } from "../core/intern"
import { Game } from "./game"
import { gamePlaySound } from "./game_audio"
import type { PgeOpcodeHandler } from "./game_opcode_debug"
import { gameInitializePgeDefaultAnimation, gameQueuePgeGroupSignal } from "./game_pge"
import { gameMarkSaveStateCompleted, gameQueueDeathCutscene, gameRequestMapReload, gameSetCurrentLevel } from "./game_lifecycle"
import { gameSaveGameState } from "./game_runtime"
import { getGameServices } from "./game_services"
import { getRuntimeRegistryState } from "./game_runtime_data"
import { getGameSessionState, getGameTransientState, getGameUiState, getGameWorldState } from "./game_state"
import { gameGetRandomNumber } from "./game_world"
import { gameGetInventoryItemIndices } from "./game_inventory"
import { gameFindOverlappingPgeByObjectType } from "./game_collision"

const pgeOpNop: PgeOpcodeHandler = () => 1

const pgeOpSetpgecounter: PgeOpcodeHandler = (args: PgeOpcodeArgs) => {
	args.pge.counterValue = args.a
	return 1
}

const pgeOpDecpgecounter: PgeOpcodeHandler = (args: PgeOpcodeArgs) => {
	args.pge.counterValue -= 1
	return args.a === args.pge.counterValue ? uint16Max : 0
}

const pgeOpWakeuppge: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	if (args.a <= 3) {
		const num = args.pge.initPge.counterValues[args.a]
		if (num >= 0) {
			const pge = runtime.livePgesByIndex[num]
			pge.flags |= 4
			runtime.livePgeStore.activeFrameByIndex[num] = pge
		}
	}
	return 1
}

const pgeOpRemovepge: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
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

const pgeOpRemovepgeifnotnear: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	const transient = getGameTransientState(game)
	const world = getGameWorldState(game)
	const runtime = getRuntimeRegistryState(game)
	const pge = args.pge
	const skipPge = () => {
		transient.shouldPlayPgeAnimationSound = false
		return 1
	}
	const killPge = () => {
		pge.flags &= ~4
		pge.collisionSlot = uint16Max
		runtime.livePgeStore.activeFrameByIndex[pge.index] = null
		return skipPge()
	}

	if (!(pge.initPge.flags & 4)) {
		return killPge()
	}
	if (world.currentRoom & 0x80) {
		return skipPge()
	}
	if (pge.roomLocation & 0x80) {
		return killPge()
	}
	if (pge.roomLocation > 0x3F) {
		return killPge()
	}
	if (pge.roomLocation === world.currentRoom) {
		return skipPge()
	}

	const { res } = getGameServices(game)
	if (pge.roomLocation === res.level.ctData[ctUpRoom + world.currentRoom]) {
		return skipPge()
	}
	if (pge.roomLocation === res.level.ctData[ctDownRoom + world.currentRoom]) {
		return skipPge()
	}
	if (pge.roomLocation === res.level.ctData[ctRightRoom + world.currentRoom]) {
		return skipPge()
	}
	if (pge.roomLocation === res.level.ctData[ctLeftRoom + world.currentRoom]) {
		return skipPge()
	}
	return killPge()
}

const pgeOpLoadpgecounter: PgeOpcodeHandler = (args: PgeOpcodeArgs) => {
	args.pge.counterValue = args.pge.initPge.counterValues[args.a]
	return 1
}

const pgeOpKillpge: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	const ui = getGameUiState(game)
	const pge = args.pge
	pge.roomLocation = 0xFE
	pge.flags &= ~4
	runtime.livePgeStore.activeFrameByIndex[pge.index] = null
	if (pge.initPge.objectType === 10) {
		ui.score += 200
	}
	return uint16Max
}

const pgeOpIsincurrentroom: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	return args.pge.roomLocation === getGameWorldState(game).currentRoom ? 1 : 0
}

const pgeOpIsnotincurrentroom: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	return args.pge.roomLocation === getGameWorldState(game).currentRoom ? 0 : 1
}

const pgeOpScrollposy: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	args.pge.posY += args.a
	for (const inventoryItemIndex of gameGetInventoryItemIndices(game, args.pge)) {
		runtime.livePgesByIndex[inventoryItemIndex].posY += args.a
	}
	return 1
}

const pgeOpPlaydefaultdeathcutscene: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	gameQueueDeathCutscene(game, args.a)
	return 1
}

const pgeOpDisplaytext: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	getGameWorldState(game).textToDisplay = args.a
	return uint16Max
}

const pgeOUnk0x7c: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	let pge = gameFindOverlappingPgeByObjectType(game, args.pge, 3)
	if (pge === null) {
		pge = gameFindOverlappingPgeByObjectType(game, args.pge, 5)
		if (pge === null) {
			pge = gameFindOverlappingPgeByObjectType(game, args.pge, 9)
			if (pge === null) {
				pge = gameFindOverlappingPgeByObjectType(game, args.pge, uint16Max)
			}
		}
	}
	if (pge !== null) {
		gameQueuePgeGroupSignal(game, args.pge.index, pge.index, args.a)
	}
	return 0
}

const pgeOpPlaysound: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	const sfxId = args.a & uint8Max
	const softVol = args.a >> 8
	gamePlaySound(game, sfxId, softVol)
	return uint16Max
}

const pgeOpIspgenear: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	return gameFindOverlappingPgeByObjectType(game, getRuntimeRegistryState(game).livePgesByIndex[0], args.a) !== null ? 1 : 0
}

const pgeOpSetlife: PgeOpcodeHandler = (args: PgeOpcodeArgs) => {
	args.pge.life = args.a
	return 1
}

const pgeOpInclife: PgeOpcodeHandler = (args: PgeOpcodeArgs) => {
	args.pge.life += args.a
	return 1
}

const pgeOpSetpgedefaultanim: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	const world = getGameWorldState(game)
	assert(!(args.a < 0 || args.a >= 4), `Assertion failed: ${args.a} >= 0 && ${args.a} < 4`)
	const room = args.pge.initPge.counterValues[args.a]
	args.pge.roomLocation = room
	if (room === 1) {
		gameRequestMapReload(game, world.currentRoom)
	}
	gameInitializePgeDefaultAnimation(game, args.pge)
	return 1
}

const pgeOpSetlifecounter: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	getRuntimeRegistryState(game).livePgesByIndex[args.a].life = args.pge.initPge.counterValues[0]
	return 1
}

const pgeOpDeclifecounter: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	args.pge.life = getRuntimeRegistryState(game).livePgesByIndex[args.a].life - 1
	return 1
}

const pgeOpPlaycutscene: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	const { cut } = getGameServices(game)
	if (getGameWorldState(game).deathCutsceneCounter === 0) {
		cut.setId(args.a)
	}
	return 1
}

const pgeOpCompareunkvar: PgeOpcodeHandler = (args: PgeOpcodeArgs) => {
	return args.a === -1 ? 1 : 0
}

const pgeOpPlaydeathcutscene: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	gameQueueDeathCutscene(game, args.pge.initPge.counterValues[3] + 1, args.a)
	return 1
}

const pgeOpIsinrandomrange: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	const n = args.a & uint16Max
	if (n !== 0) {
		return gameGetRandomNumber(game) % n === 0 ? 1 : 0
	}
	return 0
}

const pgeOpSavestate: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	const session = getGameSessionState(game)
	gameMarkSaveStateCompleted(game)
	gameSaveGameState(game, kIngameSaveSlot)
	if (session.validSaveState && globalGameOptions.playGamesavedSound) {
		gamePlaySound(game, 68, 0)
	}
	return uint16Max
}

const pgeOpPlaydeathsoundGroup: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	assert(!(args.a >= 4), `Assertion failed: ${args.a} < 4`)
	const c = args.pge.initPge.counterValues[args.a] & uint16Max
	gamePlaySound(game, c & uint8Max, c >> 8)
	return uint16Max
}

const pgeOpAdjustpos: PgeOpcodeHandler = (args: PgeOpcodeArgs) => {
	args.pge.posX &= 0xFFF0
	if (args.pge.posY !== 70 && args.pge.posY !== 142 && args.pge.posY !== 214) {
		args.pge.posY = (((args.pge.posY / 72) >> 0) + 1) * 72 - 2
	}
	return uint16Max
}

const pgeOpSetpgeposx: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	const ownerPgeIndex = args.pge.unkF
	if (ownerPgeIndex !== uint8Max) {
		args.pge.posX = getRuntimeRegistryState(game).livePgesByIndex[ownerPgeIndex].posX
	}
	return uint16Max
}

const pgeOpSetpgeposmodx: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	const ownerPgeIndex = args.pge.unkF
	if (ownerPgeIndex !== uint8Max) {
		let dx = getRuntimeRegistryState(game).livePgesByIndex[ownerPgeIndex].posX % 256
		if (dx >= args.pge.posX) {
			dx -= args.pge.posX
		}
		args.pge.posX += dx
	}
	return uint16Max
}

const pgeOpChangeroom: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	const { res } = getGameServices(game)
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
				if (previousRoomIndex >= 0) {
					previousRoomList.splice(previousRoomIndex, 1)
				}
			}
			const nextRoomList = runtime.livePgeStore.liveByRoom[destinationPge.roomLocation]
			if (nextRoomList) {
				nextRoomList.push(destinationPge)
			}
		}

		if (destinationPge.initPge.scriptNodeIndex === sourcePge.initPge.scriptNodeIndex) {
			destinationPge.flags &= ~1
			if (sourcePge.flags & 1) {
				destinationPge.flags |= 1
			}
			destinationPge.scriptStateType = sourcePge.scriptStateType
			destinationPge.animSeq = 0
			const objectNode = res.level.objectNodesMap[destinationPge.initPge.scriptNodeIndex]
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

const pgeOpChangelevel: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	const world = getGameWorldState(game)
	gameSetCurrentLevel(game, args.a - 1)
	return world.currentLevel
}

const pgeOpShakescreen: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	getGameServices(game).vid.setShakeOffset(gameGetRandomNumber(game) & 7)
	return uint16Max
}

export const worldOpcodeHandlers: Record<number, PgeOpcodeHandler | null> = {
	0x2E: pgeOpNop,
	0x3E: pgeOpSetpgecounter,
	0x3F: pgeOpDecpgecounter,
	0x41: pgeOpWakeuppge,
	0x42: pgeOpRemovepge,
	0x43: pgeOpRemovepgeifnotnear,
	0x44: pgeOpLoadpgecounter,
	0x4B: pgeOpKillpge,
	0x4C: pgeOpIsincurrentroom,
	0x4D: pgeOpIsnotincurrentroom,
	0x4E: pgeOpScrollposy,
	0x4F: pgeOpPlaydefaultdeathcutscene,
	0x54: pgeOpIspgenear,
	0x55: pgeOpSetlife,
	0x56: pgeOpInclife,
	0x57: pgeOpSetpgedefaultanim,
	0x58: pgeOpSetlifecounter,
	0x59: pgeOpDeclifecounter,
	0x5A: pgeOpPlaycutscene,
	0x5B: pgeOpCompareunkvar,
	0x5C: pgeOpPlaydeathcutscene,
	0x61: pgeOpIsinrandomrange,
	0x69: pgeOpSavestate,
	0x7B: pgeOpDisplaytext,
	0x7C: pgeOUnk0x7c,
	0x7D: pgeOpPlaysound,
	0x80: pgeOpSetpgeposx,
	0x81: pgeOpSetpgeposmodx,
	0x82: pgeOpChangeroom,
	0x84: pgeOpChangelevel,
	0x85: pgeOpShakescreen,
	0x87: pgeOpPlaydeathsoundGroup,
	0x88: pgeOpAdjustpos
}
