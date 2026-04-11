import { uint8Max, uint16Max } from "../core/game_constants"
import { LivePGE, PgeOpcodeArgs } from "../core/intern"
import { Game } from "./game"
import type { PgeOpcodeHandler } from "./game_opcode_debug"
import { gameGetCurrentInventoryItemIndex, gameGetInventoryItemIndices, gameGetNextInventoryItemIndex } from "./game_inventory"
import {
	gameFindInventoryItemBeforePge,
	gameQueuePgeGroupSignal,
	gameRemovePgeFromInventory,
	gameReorderPgeInventory,
	gameUpdatePgeInventory
} from "./game_pge"
import { getRuntimeRegistryState } from "./game_runtime_data"
import { getGameServices } from "./game_services"
import { getGamePgeState, getGameUiState, getGameWorldState } from "./game_state"
import { gameFindOverlappingPgeByObjectType } from "./game_collision"

const pgeOpPickupobject: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	const pge = gameFindOverlappingPgeByObjectType(game, args.pge, 3)
	if (pge) {
		gameQueuePgeGroupSignal(game, args.pge.index, pge.index, args.a)
		return uint16Max
	}
	return 0
}

const pgeOpAdditemtoinventory: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	gameUpdatePgeInventory(game, runtime.livePgesByIndex[args.a], args.pge)
	args.pge.roomLocation = uint8Max
	return uint16Max
}

const pgeOpCopypge: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	const src = runtime.livePgesByIndex[args.a]
	const dst = args.pge

	dst.posX = src.posX
	dst.posY = src.posY
	dst.roomLocation = src.roomLocation
	dst.flags &= 0xFE
	if (src.flags & 1) {
		dst.flags |= 1
	}
	gameReorderPgeInventory(game, args.pge)
	return uint16Max
}

const pgeOpCanusecurrentinventoryitem: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	const { res } = getGameServices(game)
	const runtime = getRuntimeRegistryState(game)
	const currentInventoryItemIndex = gameGetCurrentInventoryItemIndex(game, runtime.livePgesByIndex[0])
	if (
		currentInventoryItemIndex !== uint8Max &&
		res.level.pgeAllInitialStateFromFile[currentInventoryItemIndex].objectId === args.a
	) {
		return 1
	}
	return 0
}

const pgeOpRemoveitemfrominventory: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	const currentInventoryItemIndex = gameGetCurrentInventoryItemIndex(game, args.pge)
	if (currentInventoryItemIndex !== uint8Max) {
		gameQueuePgeGroupSignal(game, args.pge.index, currentInventoryItemIndex, args.a)
	}
	return 1
}

const pgeOpHasinventoryitem: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	const inventoryItemIndices = gameGetInventoryItemIndices(game, runtime.livePgesByIndex[0])
	for (const inventoryItemIndex of inventoryItemIndices) {
		const pge = runtime.livePgesByIndex[inventoryItemIndex]
		if (pge.initPge.objectId === args.a) {
			if (args.pge.index === 0 && (getGamePgeState(game).currentPgeInputMask & 0x20)) {
				const inventorySummary = inventoryItemIndices.map((index) => `${index}:${runtime.livePgesByIndex[index]?.initPge?.objectId ?? uint8Max}`).join(',')
				console.log(`[rewind-inventory] has-item owner=${args.pge.index} wanted=${args.a} result=1 inventory=[${inventorySummary}]`)
			}
			return uint16Max
		}
	}
	if (args.pge.index === 0 && (getGamePgeState(game).currentPgeInputMask & 0x20)) {
		const inventorySummary = inventoryItemIndices.map((index) => `${index}:${runtime.livePgesByIndex[index]?.initPge?.objectId ?? uint8Max}`).join(',')
		console.log(`[rewind-inventory] has-item owner=${args.pge.index} wanted=${args.a} result=0 inventory=[${inventorySummary}]`)
	}
	return 0
}

const pgeOpUpdategroup0: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	gameQueuePgeGroupSignal(game, args.pge.index, args.pge.initPge.counterValues[0], args.a)
	return uint16Max
}

const pgeOpUpdategroup1: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	gameQueuePgeGroupSignal(game, args.pge.index, args.pge.initPge.counterValues[1], args.a)
	return uint16Max
}

const pgeOpUpdategroup2: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	gameQueuePgeGroupSignal(game, args.pge.index, args.pge.initPge.counterValues[2], args.a)
	return uint16Max
}

const pgeOpUpdategroup3: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	gameQueuePgeGroupSignal(game, args.pge.index, args.pge.initPge.counterValues[3], args.a)
	return uint16Max
}

const pgeOpIspgedead: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	if (args.pge.life <= 0) {
		if (args.pge.initPge.objectType === 10) {
			getGameUiState(game).score += 100
		}
		return 1
	}
	return 0
}

const pgeOpIsingroup: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	for (const pendingGroup of runtime.pendingSignalsByTargetPgeIndex.get(args.pge.index) ?? []) {
		if (pendingGroup.signalId === args.a) {
			return uint16Max
		}
	}
	return 0
}

const pgeIsingroup = (pgeDst: LivePGE, signalId: number, counter: number, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	const senderIndex = pgeDst.initPge.counterValues[counter - 1]
	for (const pendingGroup of runtime.pendingSignalsByTargetPgeIndex.get(pgeDst.index) ?? []) {
		if (pendingGroup.signalId === signalId && pendingGroup.senderPgeIndex === senderIndex) {
			return 1
		}
	}
	return 0
}

const pgeOpIsingroup1: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => pgeIsingroup(args.pge, args.a, 1, game)
const pgeOpIsingroup2: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => pgeIsingroup(args.pge, args.a, 2, game)
const pgeOpIsingroup3: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => pgeIsingroup(args.pge, args.a, 3, game)
const pgeOpIsingroup4: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => pgeIsingroup(args.pge, args.a, 4, game)

const pgeOUnk0x48: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	const pge = gameFindOverlappingPgeByObjectType(game, runtime.livePgesByIndex[0], args.pge.initPge.counterValues[0])
	if (pge && pge.life === args.pge.life) {
		gameQueuePgeGroupSignal(game, args.pge.index, pge.index, args.a)
		return 1
	}
	return 0
}

const pgeOUnk0x4a: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	const pge = args.pge
	pge.roomLocation = 0xFE
	pge.flags &= ~4
	runtime.livePgeStore.activeFrameByIndex[pge.index] = null
	const owner = runtime.livePgesByIndex[args.a]
	const invPge = gameFindInventoryItemBeforePge(game, owner, pge)
	if (invPge === owner) {
		if (pge.index !== gameGetCurrentInventoryItemIndex(game, invPge)) {
			return 1
		}
	} else if (pge.index !== gameGetNextInventoryItemIndex(game, owner, invPge.index)) {
		return 1
	}
	gameRemovePgeFromInventory(game, invPge, pge, owner)
	return 1
}

const pgeOpFindandcopypge: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	for (const pendingGroup of runtime.pendingSignalsByTargetPgeIndex.get(args.pge.index) ?? []) {
		if (pendingGroup.signalId === args.a) {
			args.a = pendingGroup.senderPgeIndex
			args.b = 0
			return pgeOpCopypge(args, game)
		}
	}
	return 0
}

const pgeOpAddtocredits: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
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

const pgeOpSubfromcredits: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	const world = getGameWorldState(game)
	world.credits -= args.a
	return world.credits >= 0 ? 1 : 0
}

const pgeOUnk0x6c: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	const pge = gameFindOverlappingPgeByObjectType(game, runtime.livePgesByIndex[0], args.pge.initPge.counterValues[0])
	if (pge && pge.life <= args.pge.life) {
		gameQueuePgeGroupSignal(game, args.pge.index, pge.index, args.a)
		return 1
	}
	return 0
}

const pgeOUnk0x6e: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	for (const pendingGroup of runtime.pendingSignalsByTargetPgeIndex.get(args.pge.index) ?? []) {
		if (pendingGroup.signalId === args.a) {
			gameUpdatePgeInventory(game, runtime.livePgesByIndex[pendingGroup.senderPgeIndex], args.pge)
			return uint16Max
		}
	}
	return 0
}

const pgeOUnk0x6f: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	for (const pendingGroup of runtime.pendingSignalsByTargetPgeIndex.get(args.pge.index) ?? []) {
		if (args.a === pendingGroup.signalId) {
			gameQueuePgeGroupSignal(game, args.pge.index, pendingGroup.senderPgeIndex, 0xC)
			return 1
		}
	}
	return 0
}

const pgeOUnk0x70: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	for (const inventoryItemIndex of gameGetInventoryItemIndices(game, args.pge)) {
		gameQueuePgeGroupSignal(game, args.pge.index, inventoryItemIndex, args.a)
	}
	return 1
}

const pgeOUnk0x71: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	for (const pendingGroup of runtime.pendingSignalsByTargetPgeIndex.get(args.pge.index) ?? []) {
		if (pendingGroup.signalId === args.a) {
			gameReorderPgeInventory(game, args.pge)
			return 1
		}
	}
	return 0
}

const pgeOUnk0x73: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	const pge = gameFindOverlappingPgeByObjectType(game, args.pge, args.a)
	if (pge !== null) {
		gameUpdatePgeInventory(game, pge, args.pge)
		return uint16Max
	}
	return 0
}

const pgeIstoggleable: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	const wantedSignals = args.a === 0 ? [1, 2] : [3, 4]
	for (const pendingGroup of runtime.pendingSignalsByTargetPgeIndex.get(args.pge.index) ?? []) {
		if (wantedSignals.includes(pendingGroup.signalId)) {
			return 1
		}
	}
	return 0
}

export const inventoryOpcodeHandlers: Record<number, PgeOpcodeHandler | null> = {
	0x22: pgeOpIsingroup,
	0x23: pgeOpUpdategroup0,
	0x24: pgeOpUpdategroup1,
	0x25: pgeOpUpdategroup2,
	0x26: pgeOpUpdategroup3,
	0x27: pgeOpIspgedead,
	0x2F: pgeOpPickupobject,
	0x30: pgeOpAdditemtoinventory,
	0x31: pgeOpCopypge,
	0x32: pgeOpCanusecurrentinventoryitem,
	0x33: pgeOpRemoveitemfrominventory,
	0x38: pgeOpIsingroup1,
	0x39: pgeOpIsingroup2,
	0x3A: pgeOpIsingroup3,
	0x3B: pgeOpIsingroup4,
	0x48: pgeOUnk0x48,
	0x4A: pgeOUnk0x4a,
	0x60: pgeOpFindandcopypge,
	0x65: pgeOpAddtocredits,
	0x66: pgeOpSubfromcredits,
	0x6B: pgeIstoggleable,
	0x6C: pgeOUnk0x6c,
	0x6E: pgeOUnk0x6e,
	0x6F: pgeOUnk0x6f,
	0x70: pgeOUnk0x70,
	0x71: pgeOUnk0x71,
	0x73: pgeOUnk0x73,
	0x83: pgeOpHasinventoryitem
}
