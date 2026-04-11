import { assert } from "../core/assert"
import {
	ctDownRoom,
	ctGridStride,
	ctGridWidth,
	ctHeaderSize,
	ctLeftRoom,
	ctRightRoom,
	ctRoomSize,
	ctUpRoom,
	uint16Max,
	uint8Max
} from "../core/game_constants"
import {
	colDetectgunhit,
	colDetectgunhitcallback1,
	colDetectgunhitcallback2,
	colDetectgunhitcallback3,
	colDetecthit,
	colDetecthitcallback1,
	colDetecthitcallback2,
	colDetecthitcallback3,
	colDetecthitcallback4,
	colDetecthitcallback5,
	colDetecthitcallback6
} from "../core/collision"
import { LivePGE, PgeOpcodeArgs, PgeZOrderComparator, RoomCollisionGridPatchRestoreSlot } from "../core/intern"
import { Game } from "./game"
import { gameFindFirstMatchingCollidingObject, gameGetRoomCollisionGridData } from "./game_collision"
import type { PgeOpcodeHandler } from "./game_opcode_debug"
import { gameQueuePgeGroupSignal } from "./game_pge"
import { getGameServices } from "./game_services"
import { getRuntimeRegistryState } from "./game_runtime_data"
import { getGameCollisionState, getGamePgeState, getGameWorldState } from "./game_state"

const pgeOpDoesnotcollide1u: PgeOpcodeHandler = (args, game) => gameGetRoomCollisionGridData(game, args.pge, 1, -args.a) & uint16Max ? 0 : uint16Max
const pgeOpDoesnotcollide10: PgeOpcodeHandler = (args, game) => gameGetRoomCollisionGridData(game, args.pge, 1, 0) & uint16Max ? 0 : uint16Max
const pgeOpDoesnotcollide1d: PgeOpcodeHandler = (args, game) => gameGetRoomCollisionGridData(game, args.pge, 1, args.a) & uint16Max ? 0 : uint16Max
const pgeOpDoesnotcollide2u: PgeOpcodeHandler = (args, game) => gameGetRoomCollisionGridData(game, args.pge, 2, -args.a) & uint16Max ? 0 : uint16Max
const pgeOpDoesnotcollide20: PgeOpcodeHandler = (args, game) => gameGetRoomCollisionGridData(game, args.pge, 2, 0) & uint16Max ? 0 : uint16Max
const pgeOpGetcollision0u: PgeOpcodeHandler = (args, game) => gameGetRoomCollisionGridData(game, args.pge, 0, -args.a)
const pgeOpGetcollision00: PgeOpcodeHandler = (args, game) => gameGetRoomCollisionGridData(game, args.pge, 0, 0)
const pgeOpGetcollision0d: PgeOpcodeHandler = (args, game) => gameGetRoomCollisionGridData(game, args.pge, 0, args.a)
const pgeOpGetcollision10: PgeOpcodeHandler = (args, game) => gameGetRoomCollisionGridData(game, args.pge, 1, 0)
const pgeOpGetcollision1d: PgeOpcodeHandler = (args, game) => gameGetRoomCollisionGridData(game, args.pge, 1, args.a)
const pgeOpGetcollision2u: PgeOpcodeHandler = (args, game) => gameGetRoomCollisionGridData(game, args.pge, 2, -args.a)
const pgeOpGetcollision20: PgeOpcodeHandler = (args, game) => gameGetRoomCollisionGridData(game, args.pge, 2, 0)
const pgeOpGetcollision2d: PgeOpcodeHandler = (args, game) => gameGetRoomCollisionGridData(game, args.pge, 2, args.a)
const pgeOpDoesnotcollide0u: PgeOpcodeHandler = (args, game) => gameGetRoomCollisionGridData(game, args.pge, 0, -args.a) & uint16Max ? 0 : uint16Max
const pgeOpDoesnotcollide00: PgeOpcodeHandler = (args, game) => gameGetRoomCollisionGridData(game, args.pge, 0, 0) & uint16Max ? 0 : uint16Max
const pgeOpDoesnotcollide0d: PgeOpcodeHandler = (args, game) => gameGetRoomCollisionGridData(game, args.pge, 0, args.a) & uint16Max ? 0 : uint16Max
const pgeOpGetcollision1u: PgeOpcodeHandler = (args, game) => gameGetRoomCollisionGridData(game, args.pge, 1, -args.a)
const pgeOpDoesnotcollide2d: PgeOpcodeHandler = (args, game) => gameGetRoomCollisionGridData(game, args.pge, 2, args.a) & uint16Max ? 0 : uint16Max

const pgeZorderbynumber: PgeZOrderComparator = () => 0

const pgeZorderifindex: PgeZOrderComparator = (pge1, pge2, comp, comp2, game) => {
	if (pge1.index !== comp2) {
		gameQueuePgeGroupSignal(game, pge2.index, pge1.index, comp)
		return 1
	}
	return 0
}

const pgeZorderifsamedirection: PgeZOrderComparator = (pge1, pge2, comp, comp2, game) => {
	if (pge1 !== pge2 && (pge1.flags & 1) === (pge2.flags & 1)) {
		getGamePgeState(game).opcodeComparisonResult2 = 1
		gameQueuePgeGroupSignal(game, pge2.index, pge1.index, comp)
		if (pge2.index === 0) {
			return uint16Max
		}
	}
	return 0
}

const pgeZorderifdifferentdirection: PgeZOrderComparator = (pge1, pge2, comp, comp2, game) => {
	if (pge1 !== pge2 && (pge1.flags & 1) !== (pge2.flags & 1)) {
		getGamePgeState(game).opcodeComparisonResult1 = 1
		gameQueuePgeGroupSignal(game, pge2.index, pge1.index, comp)
		if (pge2.index === 0) {
			return uint16Max
		}
	}
	return 0
}

const pgeZorderbyanimyiftype: PgeZOrderComparator = (pge1, pge2, comp, comp2, game) => {
	const { res } = getGameServices(game)
	if (pge1.initPge.objectType === comp2 && res.getAniData(pge1.scriptStateType)[3] === comp) {
		return 1
	}
	return 0
}

const pgeZorderbyanimy: PgeZOrderComparator = (pge1, pge2, comp, comp2, game) => {
	const { res } = getGameServices(game)
	if (pge1 !== pge2 && res.getAniData(pge1.scriptStateType)[3] === comp) {
		return 1
	}
	return 0
}

const pgeZorderbyindex: PgeZOrderComparator = (pge1, pge2, comp, comp2, game) => {
	if (pge1 !== pge2) {
		gameQueuePgeGroupSignal(game, pge2.index, pge1.index, comp)
		getGamePgeState(game).opcodeComparisonResult1 = uint16Max
	}
	return 0
}

const pgeZorderbyobj: PgeZOrderComparator = (pge1, pge2, comp) => {
	if (comp === 10) {
		return pge1.initPge.objectType === comp && pge1.life >= 0 ? 1 : 0
	}
	return pge1.initPge.objectType === comp ? 1 : 0
}

const pgeZorderiftypeanddifferentdirection: PgeZOrderComparator = (pge1, pge2, comp) => {
	return pge1.initPge.objectType === comp && (pge1.flags & 1) !== (pge2.flags & 1) ? 1 : 0
}

const pgeZorderiftypeandsamedirection: PgeZOrderComparator = (pge1, pge2, comp) => {
	return pge1.initPge.objectType === comp && (pge1.flags & 1) === (pge2.flags & 1) ? 1 : 0
}

const pgeZorder = (pge: LivePGE, num: number, compare: PgeZOrderComparator, unk: number, game: Game) => {
	const collision = getGameCollisionState(game)
	let collisionGridPositionIndex = pge.collisionSlot
	while (collisionGridPositionIndex !== uint16Max) {
		const slotBucket = collision.dynamicPgeCollisionSlotsByPosition.get(collisionGridPositionIndex)
		if (!slotBucket) {
			return 0
		}
		const currentPositionKey = collisionGridPositionIndex
		collisionGridPositionIndex = uint16Max
		for (const slot of slotBucket) {
			if (compare(slot.pge, pge, num, unk, game) !== 0) {
				return 1
			}
			if (pge === slot.pge) {
				collisionGridPositionIndex = slot.index
			}
		}
		if (collisionGridPositionIndex === currentPositionKey) {
			return 0
		}
	}
	return 0
}

const getActiveRoomCollisionSlotHeadsByArea = (game: Game, area: number) => {
	const collision = getGameCollisionState(game)
	switch (area) {
	case 0:
		return collision.activeRoomCollisionSlotWindow.left
	case 1:
		return collision.activeRoomCollisionSlotWindow.current
	case 2:
		return collision.activeRoomCollisionSlotWindow.right
	default:
		return null
	}
}

const pgeUpdatecollisionstate = (pge: LivePGE, pgeDy: number, var8: number, game: Game) => {
	const collision = getGameCollisionState(game)
	const pgeState = getGamePgeState(game)
	const { res } = getGameServices(game)
	let pgeCollisionSegments = pge.initPge.numberOfCollisionSegments
	if (!(pge.roomLocation & 0x80) && pge.roomLocation < ctRoomSize) {
		const gridData = res.level.ctData.subarray(ctHeaderSize)
		let dataIndex = ctGridStride * pge.roomLocation
		let pgePosY = (((pge.posY / 36) >> 0) & ~1) + pgeDy
		let pgePosX = (pge.posX + 8) >> 4
		dataIndex += pgePosX + pgePosY * ctGridWidth

		let slot1: RoomCollisionGridPatchRestoreSlot = collision.activeRoomCollisionGridPatchRestoreSlots
		let i = 255
		if (pgeState.currentPgeFacingIsMirrored) {
			i = pgeCollisionSegments - 1
			dataIndex -= i
		}
		while (slot1) {
			if (slot1.patchedGridDataView.buffer === gridData.buffer && slot1.patchedGridDataView.byteOffset === gridData.byteOffset + dataIndex) {
				slot1.patchedCellCount = pgeCollisionSegments - 1
				assert(!(pgeCollisionSegments >= ctGridStride), `Assertion failed: ${pgeCollisionSegments} < ${ctGridStride}`)
				gridData.subarray(dataIndex).fill(var8, 0, pgeCollisionSegments)
				return 1
			}
			slot1 = slot1.nextPatchedRegionRestoreSlot
			if (--i === 0) {
				break
			}
		}

		const slotIndex = collision.roomCollisionGridPatchRestoreSlotPool.findIndex((slot) => slot === collision.nextFreeRoomCollisionGridPatchRestoreSlot)
		if (slotIndex < 255) {
			slot1 = collision.nextFreeRoomCollisionGridPatchRestoreSlot
			slot1.patchedGridDataView = gridData.subarray(dataIndex)
			slot1.patchedCellCount = pgeCollisionSegments - 1
			const dst = slot1.originalGridCellValues
			const src = gridData.subarray(dataIndex)
			let srcIndex = 0
			let dstIndex = 0
			let n = pgeCollisionSegments
			assert(!(n >= ctGridWidth), `Assertion failed: ${n} < ${ctGridWidth}`)
			while (n--) {
				dst[dstIndex++] = src[srcIndex] & uint8Max
				src[srcIndex++] = var8 << 24 >> 24
			}
			collision.nextFreeRoomCollisionGridPatchRestoreSlot = collision.roomCollisionGridPatchRestoreSlotPool[slotIndex + 1]
			slot1.nextPatchedRegionRestoreSlot = collision.activeRoomCollisionGridPatchRestoreSlots
			collision.activeRoomCollisionGridPatchRestoreSlots = slot1
		}
	}
	return 1
}

const pgeOpCollides0o0d: PgeOpcodeHandler = (args, game) => gameGetRoomCollisionGridData(game, args.pge, 0, args.a) & uint16Max && gameGetRoomCollisionGridData(game, args.pge, 0, args.a + 1) === 0 && gameGetRoomCollisionGridData(game, args.pge, -1, args.a) === 0 ? uint16Max : 0
const pgeOpCollides2o2d: PgeOpcodeHandler = (args, game) => gameGetRoomCollisionGridData(game, args.pge, 2, args.a) & uint16Max && gameGetRoomCollisionGridData(game, args.pge, 2, args.a + 1) === 0 && gameGetRoomCollisionGridData(game, args.pge, 1, args.a) === 0 ? uint16Max : 0
const pgeOpCollides0o0u: PgeOpcodeHandler = (args, game) => gameGetRoomCollisionGridData(game, args.pge, 0, args.a) & uint16Max && gameGetRoomCollisionGridData(game, args.pge, 0, args.a - 1) === 0 && gameGetRoomCollisionGridData(game, args.pge, -1, args.a) === 0 ? uint16Max : 0
const pgeOpCollides2o2u: PgeOpcodeHandler = (args, game) => gameGetRoomCollisionGridData(game, args.pge, 2, args.a) & uint16Max && gameGetRoomCollisionGridData(game, args.pge, 2, args.a - 1) === 0 && gameGetRoomCollisionGridData(game, args.pge, 1, args.a) === 0 ? uint16Max : 0
const pgeOpCollides2u2o: PgeOpcodeHandler = (args, game) => gameGetRoomCollisionGridData(game, args.pge, 2, args.a - 1) & uint16Max && gameGetRoomCollisionGridData(game, args.pge, 2, args.a) === 0 && gameGetRoomCollisionGridData(game, args.pge, 1, args.a - 1) === 0 ? uint16Max : 0
const pgeOpCollides1u2o: PgeOpcodeHandler = (args, game) => gameGetRoomCollisionGridData(game, args.pge, 1, args.a - 1) & uint16Max && gameGetRoomCollisionGridData(game, args.pge, 2, args.a) === 0 ? uint16Max : 0
const pgeOpCollides1u1o: PgeOpcodeHandler = (args, game) => gameGetRoomCollisionGridData(game, args.pge, 1, args.a - 1) & uint16Max && gameGetRoomCollisionGridData(game, args.pge, 1, args.a) === 0 ? uint16Max : 0
const pgeOpCollides1o1u: PgeOpcodeHandler = (args, game) => gameGetRoomCollisionGridData(game, args.pge, 1, args.a - 1) === 0 && gameGetRoomCollisionGridData(game, args.pge, 1, args.a) & uint16Max ? uint16Max : 0

const pgeOUnk0x2b: PgeOpcodeHandler = (args, game) => pgeZorder(args.pge, args.a, pgeZorderiftypeanddifferentdirection, 0, game)
const pgeOUnk0x2c: PgeOpcodeHandler = (args, game) => pgeZorder(args.pge, args.a, pgeZorderiftypeandsamedirection, 0, game)
const pgeOUnk0x2d: PgeOpcodeHandler = (args, game) => pgeZorder(args.pge, args.a, pgeZorderbyobj, 0, game) ^ 1
const pgeOUnk0x3c: PgeOpcodeHandler = (args, game) => pgeZorder(args.pge, args.a, pgeZorderbyanimyiftype, args.b, game)
const pgeOUnk0x3d: PgeOpcodeHandler = (args, game) => pgeZorder(args.pge, args.a, pgeZorderbyanimy, 0, game)

const pgeOUnk0x40: PgeOpcodeHandler = (args, game) => {
	const collision = getGameCollisionState(game)
	const pgeState = getGamePgeState(game)
	const { res } = getGameServices(game)
	let pgeRoom = args.pge.roomLocation
	if (pgeRoom < 0 || pgeRoom >= ctRoomSize) {
		return 0
	}
	let colArea
	if (getGameWorldState(game).currentRoom === pgeRoom) {
		colArea = 1
	} else if (collision.activeCollisionLeftRoom === pgeRoom) {
		colArea = 0
	} else if (collision.activeCollisionRightRoom === pgeRoom) {
		colArea = 2
	} else {
		return 0
	}

	let gridPosX = (args.pge.posX + 8) >> 4
	let gridPosY = (args.pge.posY / 72) >> 0
	if (gridPosY < 0 || gridPosY > 2) {
		return 0
	}
	gridPosY *= ctGridWidth
	let distance = args.a
	if (pgeState.currentPgeFacingIsMirrored) {
		distance = -distance
	}

	if (distance >= 0) {
		if (distance > ctGridWidth) {
			distance = ctGridWidth
		}
		let gridData = new Int8Array(res.level.ctData.buffer)
		let gridIndex = res.level.ctData.byteOffset + ctHeaderSize + pgeRoom * ctGridStride + gridPosY * 2 + ctGridWidth + gridPosX
		let activeRoomSlotHeads = getActiveRoomCollisionSlotHeadsByArea(game, colArea)
		let activeRoomSlotIndex = gridPosY + gridPosX
		let x = gridPosX
		--distance
		do {
			--x
			if (x < 0) {
				--colArea
				if (colArea < 0) {
					return 0
				}
				pgeRoom = res.level.ctData[ctLeftRoom + pgeRoom]
				if (pgeRoom < 0) {
					return 0
				}
				x = ctGridWidth - 1
				gridData = new Int8Array(res.level.ctData.buffer)
				gridIndex = res.level.ctData.byteOffset + ctHeaderSize + 1 + pgeRoom * ctGridStride + gridPosY * 2 + (ctGridWidth - 1) + ctGridWidth
				activeRoomSlotHeads = getActiveRoomCollisionSlotHeadsByArea(game, colArea)
				activeRoomSlotIndex = gridPosY + ctGridWidth
			}
			--activeRoomSlotIndex
			const activeCollisionSlotHead = activeRoomSlotHeads ? activeRoomSlotHeads[activeRoomSlotIndex] : null
			if (activeCollisionSlotHead) {
				for (const colSlot of activeCollisionSlotHead) {
					if (args.pge !== colSlot.pge && (colSlot.pge.flags & 4) && colSlot.pge.initPge.objectType === args.b) {
						return 1
					}
				}
			}
			--gridIndex
			if (gridData[gridIndex] !== 0) {
				return 0
			}
			--distance
		} while (distance >= 0)
		return 0
	}

	distance = -distance
	if (distance > ctGridWidth) {
		distance = ctGridWidth
	}
	let gridData = res.level.ctData.subarray(ctHeaderSize + 1 + pgeRoom * ctGridStride + gridPosY * 2 + ctGridWidth + gridPosX)
	let gridIndex = 0
	let activeRoomSlotHeads = getActiveRoomCollisionSlotHeadsByArea(game, colArea)
	let activeRoomSlotIndex = gridPosY + gridPosX
	let x = gridPosX
	--distance
	do {
		++x
		if (x === ctGridWidth) {
			++colArea
			if (colArea > 2) {
				return 0
			}
			pgeRoom = res.level.ctData[ctRightRoom + pgeRoom]
			if (pgeRoom < 0) {
				return 0
			}
			x = 0
			gridData = res.level.ctData.subarray(ctHeaderSize + 1 + pgeRoom * ctGridStride + gridPosY * 2 + ctGridWidth)
			gridIndex = 0
			activeRoomSlotHeads = getActiveRoomCollisionSlotHeadsByArea(game, colArea)
			activeRoomSlotIndex = gridPosY - 1
		}
		++activeRoomSlotIndex
		const activeCollisionSlotHead = activeRoomSlotHeads ? activeRoomSlotHeads[activeRoomSlotIndex] : null
		if (activeCollisionSlotHead) {
			for (const colSlot of activeCollisionSlotHead) {
				if (args.pge !== colSlot.pge && (colSlot.pge.flags & 4) && colSlot.pge.initPge.objectType === args.b) {
					return 1
				}
			}
		}
		if (gridData[gridIndex] !== 0) {
			return 0
		}
		++gridIndex
		--distance
	} while (distance >= 0)
	return 0
}
const pgeOUnk0x45: PgeOpcodeHandler = (args, game) => pgeZorder(args.pge, args.a, pgeZorderbynumber, 0, game)

const pgeOUnk0x46: PgeOpcodeHandler = (args, game) => {
	const pgeState = getGamePgeState(game)
	pgeState.opcodeComparisonResult1 = 0
	pgeZorder(args.pge, args.a, pgeZorderifdifferentdirection, 0, game)
	return pgeState.opcodeComparisonResult1
}

const pgeOUnk0x47: PgeOpcodeHandler = (args, game) => {
	const pgeState = getGamePgeState(game)
	pgeState.opcodeComparisonResult2 = 0
	pgeZorder(args.pge, args.a, pgeZorderifsamedirection, 0, game)
	return pgeState.opcodeComparisonResult2
}

const pgeOUnk0x49: PgeOpcodeHandler = (args, game) => {
	const runtime = getRuntimeRegistryState(game)
	return pgeZorder(runtime.livePgesByIndex[0], args.a, pgeZorderifindex, args.pge.initPge.counterValues[0], game)
}

const pgeOUnk0x50: PgeOpcodeHandler = (args, game) => pgeZorder(args.pge, args.a, pgeZorderbyobj, 0, game)
const pgeOUnk0x52: PgeOpcodeHandler = (args, game) => colDetecthit(args.pge, args.a, args.b, colDetecthitcallback4, colDetecthitcallback1, 0, 0, game)
const pgeOUnk0x53: PgeOpcodeHandler = (args, game) => colDetecthit(args.pge, args.a, args.b, colDetecthitcallback5, colDetecthitcallback1, 0, 0, game)
const pgeOUnk0x5d: PgeOpcodeHandler = (args, game) => colDetecthit(args.pge, args.a, args.b, colDetecthitcallback4, colDetecthitcallback6, 0, 0, game)
const pgeOUnk0x5e: PgeOpcodeHandler = (args, game) => colDetecthit(args.pge, args.a, args.b, colDetecthitcallback5, colDetecthitcallback6, 0, 0, game)
const pgeOUnk0x62: PgeOpcodeHandler = (args, game) => colDetecthit(args.pge, args.a, args.b, colDetecthitcallback3, colDetecthitcallback1, 0, -1, game)
const pgeOUnk0x63: PgeOpcodeHandler = (args, game) => colDetecthit(args.pge, args.a, args.b, colDetecthitcallback2, colDetecthitcallback1, 0, -1, game)
const pgeOUnk0x64: PgeOpcodeHandler = (args, game) => colDetectgunhit(args.pge, args.a, args.b, colDetectgunhitcallback3, colDetectgunhitcallback1, 1, -1, game)
const pgeOUnk0x67: PgeOpcodeHandler = (args, game) => gameGetRoomCollisionGridData(game, args.pge, 1, -args.a) & 2 ? uint16Max : 0
const pgeOpSetcollisionstate1: PgeOpcodeHandler = (args, game) => pgeUpdatecollisionstate(args.pge, args.a, 1, game)
const pgeOpSetcollisionstate0: PgeOpcodeHandler = (args, game) => pgeUpdatecollisionstate(args.pge, args.a, 0, game)
const pgeOpSetcollisionstate2: PgeOpcodeHandler = (args, game) => pgeUpdatecollisionstate(args.pge, args.a, 2, game)

const pgeOpCollides4u: PgeOpcodeHandler = (args, game) => gameGetRoomCollisionGridData(game, args.pge, 4, -args.a) !== 0 ? uint16Max : 0
const pgeOpDoesnotcollide4u: PgeOpcodeHandler = (args, game) => gameGetRoomCollisionGridData(game, args.pge, 4, -args.a) === 0 ? uint16Max : 0

const pgeOpIsbelowconrad: PgeOpcodeHandler = (args, game) => {
	const { res } = getGameServices(game)
	const runtime = getRuntimeRegistryState(game)
	const conrad = runtime.livePgesByIndex[0]
	if (conrad.roomLocation === args.pge.roomLocation) {
		return (((conrad.posY - 8) / 72) >> 0) < ((args.pge.posY / 72) >> 0) ? uint16Max : 0
	}
	if (args.pge.roomLocation < ctRoomSize && conrad.roomLocation === res.level.ctData[ctUpRoom + args.pge.roomLocation]) {
		return uint16Max
	}
	return 0
}

const pgeOpIsaboveconrad: PgeOpcodeHandler = (args, game) => {
	const { res } = getGameServices(game)
	const runtime = getRuntimeRegistryState(game)
	const conrad = runtime.livePgesByIndex[0]
	if (conrad.roomLocation === args.pge.roomLocation) {
		return (((conrad.posY - 8) / 72) >> 0) > ((args.pge.posY / 72) >> 0) ? uint16Max : 0
	}
	if (args.pge.roomLocation < ctRoomSize && conrad.roomLocation === res.level.ctData[ctDownRoom + args.pge.roomLocation]) {
		return uint16Max
	}
	return 0
}

const pgeOpIsnotfacingconrad: PgeOpcodeHandler = (args, game) => {
	const { res } = getGameServices(game)
	const pgeState = getGamePgeState(game)
	const runtime = getRuntimeRegistryState(game)
	const pgeConrad = runtime.livePgesByIndex[0]
	if ((args.pge.posY / 72) >> 0 === ((pgeConrad.posY - 8) / 72) >> 0) {
		if (args.pge.roomLocation === pgeConrad.roomLocation) {
			if (args.a === 0) {
				if (pgeState.currentPgeFacingIsMirrored ? args.pge.posX < pgeConrad.posX : args.pge.posX > pgeConrad.posX) {
					return uint16Max
				}
			} else {
				const dx = pgeState.currentPgeFacingIsMirrored ? pgeConrad.posX - args.pge.posX : args.pge.posX - pgeConrad.posX
				if (dx > 0 && dx < args.a * 16) {
					return uint16Max
				}
			}
		} else if (args.a === 0 && !(args.pge.roomLocation & 0x80) && args.pge.roomLocation < ctRoomSize) {
			if (pgeState.currentPgeFacingIsMirrored ? pgeConrad.roomLocation === res.level.ctData[ctRightRoom + args.pge.roomLocation] : pgeConrad.roomLocation === res.level.ctData[ctLeftRoom + args.pge.roomLocation]) {
				return uint16Max
			}
		}
	}
	return 0
}

const pgeOpIsfacingconrad: PgeOpcodeHandler = (args, game) => {
	const { res } = getGameServices(game)
	const pgeState = getGamePgeState(game)
	const runtime = getRuntimeRegistryState(game)
	const pgeConrad = runtime.livePgesByIndex[0]
	if ((args.pge.posY / 72) >> 0 === ((pgeConrad.posY - 8) / 72) >> 0) {
		if (args.pge.roomLocation === pgeConrad.roomLocation) {
			if (args.a === 0) {
				if (pgeState.currentPgeFacingIsMirrored ? args.pge.posX > pgeConrad.posX : args.pge.posX <= pgeConrad.posX) {
					return uint16Max
				}
			} else {
				const dx = pgeState.currentPgeFacingIsMirrored ? args.pge.posX - pgeConrad.posX : pgeConrad.posX - args.pge.posX
				if (dx > 0 && dx < args.a * 16) {
					return uint16Max
				}
			}
		} else if (args.a === 0 && !(args.pge.roomLocation & 0x80) && args.pge.roomLocation < ctRoomSize) {
			if (pgeState.currentPgeFacingIsMirrored ? pgeConrad.roomLocation === res.level.ctData[ctLeftRoom + args.pge.roomLocation] : pgeConrad.roomLocation === res.level.ctData[ctRightRoom + args.pge.roomLocation]) {
				return uint16Max
			}
		}
	}
	return 0
}

const pgeOpCollides2u1u: PgeOpcodeHandler = (args, game) => {
	return gameGetRoomCollisionGridData(game, args.pge, 1, -args.a) === 0 && gameGetRoomCollisionGridData(game, args.pge, 2, -(args.a + 1)) & uint16Max ? uint16Max : 0
}

const pgeOUnk0x6a: PgeOpcodeHandler = (args, game) => {
	const collision = getGameCollisionState(game)
	const pgeState = getGamePgeState(game)
	const { res } = getGameServices(game)
	let activePge = args.pge
	let pgeRoom = activePge.roomLocation
	if (pgeRoom < 0 || pgeRoom >= ctRoomSize) {
		return 0
	}
	let colArea = 0
	if (getGameWorldState(game).currentRoom === pgeRoom) {
		colArea = 1
	} else if (collision.activeCollisionLeftRoom === pgeRoom) {
		colArea = 0
	} else if (collision.activeCollisionRightRoom === pgeRoom) {
		colArea = 2
	} else {
		return 0
	}
	let gridPosX = (activePge.posX + 8) >> 4
	let gridPosY = (activePge.posY / 72) >> 0
	if (gridPosY < 0 || gridPosY > 2) {
		return 0
	}
	gridPosY *= ctGridWidth
	let distance = args.a
	if (pgeState.currentPgeFacingIsMirrored) {
		distance = -distance
	}
	let ctData = res.level.ctData
	if (distance >= 0) {
		if (distance > ctGridWidth) distance = ctGridWidth
		let ctIndex = ctHeaderSize + pgeRoom * ctGridStride + gridPosY * 2 + ctGridWidth + gridPosX + 1
		let activeRoomSlotHeads = getActiveRoomCollisionSlotHeadsByArea(game, colArea)
		let activeRoomSlotIndex = gridPosY + gridPosX + 1
		let x = gridPosX
		do {
			--x
			if (x < 0) {
				--colArea
				if (colArea < 0) return 0
				pgeRoom = res.level.ctData[ctLeftRoom + pgeRoom]
				if (pgeRoom < 0) return 0
				x = ctGridWidth - 1
				ctIndex = ctHeaderSize + 1 + pgeRoom * ctGridStride + gridPosY * 2 + ctGridWidth + x
				activeRoomSlotHeads = getActiveRoomCollisionSlotHeadsByArea(game, colArea)
				activeRoomSlotIndex = gridPosY + ctGridWidth
			}
			--activeRoomSlotIndex
			const activeCollisionSlotHead = activeRoomSlotHeads ? activeRoomSlotHeads[activeRoomSlotIndex] : null
			if (activeCollisionSlotHead) {
				for (const collisionSlot of activeCollisionSlotHead) {
					activePge = collisionSlot.pge
					if (args.pge !== activePge && (activePge.flags & 4) && activePge.life >= 0 && (activePge.initPge.objectType === 1 || activePge.initPge.objectType === 10)) {
						return 1
					}
				}
			}
			--ctIndex
			if (ctData[ctIndex] !== 0) {
				return 0
			}
			--distance
		} while (distance >= 0)
		return 0
	}

	distance = -distance
	if (distance > ctGridWidth) distance = ctGridWidth
	let ctIndex = ctHeaderSize + 1 + pgeRoom * ctGridStride + gridPosY * 2 + ctGridWidth + gridPosX
	let activeRoomSlotHeads = getActiveRoomCollisionSlotHeadsByArea(game, colArea)
	let activeRoomSlotIndex = gridPosY + gridPosX + 1
	let x = gridPosX
	let firstRun = true
	do {
		if (!firstRun) {
			++x
			if (x === ctGridWidth) {
				++colArea
				if (colArea > 2) return 0
				pgeRoom = res.level.ctData[ctRightRoom + pgeRoom]
				if (pgeRoom < 0) return 0
				x = 0
				ctIndex = ctHeaderSize + pgeRoom * ctGridStride + gridPosY * 2 + ctGridWidth + x
				activeRoomSlotHeads = getActiveRoomCollisionSlotHeadsByArea(game, colArea)
				activeRoomSlotIndex = gridPosY
			}
		}
		firstRun = false
		const activeCollisionSlotHead = activeRoomSlotHeads ? activeRoomSlotHeads[activeRoomSlotIndex] : null
		++activeRoomSlotIndex
		if (activeCollisionSlotHead) {
			for (const collisionSlot of activeCollisionSlotHead) {
				activePge = collisionSlot.pge
				if (args.pge !== activePge && (activePge.flags & 4) && activePge.life >= 0 && (activePge.initPge.objectType === 1 || activePge.initPge.objectType === 10)) {
					return 1
				}
			}
		}
		const value = ctData[ctIndex] << 24 >> 24
		++ctIndex
		if (value !== 0) return 0
		--distance
	} while (distance >= 0)
	return 0
}

const pgeOUnk0x72: PgeOpcodeHandler = (args, game) => {
	const collision = getGameCollisionState(game)
	const { res } = getGameServices(game)
	const roomCollisionGrid = new Int8Array(
		res.level.ctData.buffer,
		res.level.ctData.byteOffset + ctHeaderSize + args.pge.roomLocation * ctGridStride,
		ctGridStride
	)
	const pgeCollisionGridY = (((args.pge.posY / 36) >> 0) & ~1) + args.a
	const pgeCollisionGridX = (args.pge.posX + 8) >> 4
	const patchedGridOffset = pgeCollisionGridY * ctGridWidth + pgeCollisionGridX
	let restoreSlot = collision.activeRoomCollisionGridPatchRestoreSlots
	let count = 256
	while (restoreSlot && count !== 0) {
		if (restoreSlot.patchedGridDataView.buffer === roomCollisionGrid.buffer && restoreSlot.patchedGridDataView.byteOffset === roomCollisionGrid.byteOffset + patchedGridOffset) {
			const cellCount = restoreSlot.patchedCellCount + 1
			for (let i = 0; i < cellCount; ++i) {
				restoreSlot.patchedGridDataView[i] = restoreSlot.originalGridCellValues[i] << 24 >> 24
			}
			break
		}
		restoreSlot = restoreSlot.nextPatchedRegionRestoreSlot
		--count
	}
	return uint16Max
}

const pgeOUnk0x7e: PgeOpcodeHandler = (args, game) => {
	const pgeState = getGamePgeState(game)
	pgeState.opcodeComparisonResult1 = 0
	pgeZorder(args.pge, args.a, pgeZorderbyindex, 0, game)
	return pgeState.opcodeComparisonResult1
}

const pgeOUnk0x7f: PgeOpcodeHandler = (args, game) => {
	const collision = getGameCollisionState(game)
	let slotIndex = args.pge.collisionSlot
	let previousIndex = args.pge.index
	while (slotIndex !== uint16Max) {
		const slotBucket = collision.dynamicPgeCollisionSlotsByPosition.get(slotIndex)
		if (!slotBucket) {
			return 1
		}
		let nextCollisionGridPositionIndex = uint16Max
		for (const slot of slotBucket) {
			if (slot.pge !== args.pge && slot.pge.initPge.objectType === 3 && previousIndex !== slot.pge.unkF) {
				return 0
			}
			if (slot.pge === args.pge) {
				nextCollisionGridPositionIndex = slot.index
			}
		}
		slotIndex = nextCollisionGridPositionIndex
	}
	return uint16Max
}

const pgeOpIscollidingobject: PgeOpcodeHandler = (args, game) => {
	const { obj } = gameFindFirstMatchingCollidingObject(game, args.pge, 3, uint8Max, uint8Max)
	return obj === args.a ? 1 : 0
}

const pgeOUnk0x86: PgeOpcodeHandler = (args, game) => colDetectgunhit(args.pge, args.a, args.b, colDetectgunhitcallback2, colDetectgunhitcallback1, 1, 0, game)

export const collisionOpcodeHandlers: Record<number, PgeOpcodeHandler | null> = {
	0x0B: pgeOpGetcollision0u,
	0x0C: pgeOpGetcollision00,
	0x0D: pgeOpGetcollision0d,
	0x0E: pgeOpGetcollision1u,
	0x0F: pgeOpGetcollision10,
	0x10: pgeOpGetcollision1d,
	0x11: pgeOpGetcollision2u,
	0x12: pgeOpGetcollision20,
	0x13: pgeOpGetcollision2d,
	0x14: pgeOpDoesnotcollide0u,
	0x15: pgeOpDoesnotcollide00,
	0x16: pgeOpDoesnotcollide0d,
	0x17: pgeOpDoesnotcollide1u,
	0x18: pgeOpDoesnotcollide10,
	0x19: pgeOpDoesnotcollide1d,
	0x1A: pgeOpDoesnotcollide2u,
	0x1B: pgeOpDoesnotcollide20,
	0x1C: pgeOpDoesnotcollide2d,
	0x1D: pgeOpCollides0o0d,
	0x1E: pgeOpCollides2o2d,
	0x1F: pgeOpCollides0o0u,
	0x20: pgeOpCollides2o2u,
	0x21: pgeOpCollides2u2o,
	0x28: pgeOpCollides1u2o,
	0x29: pgeOpCollides1u1o,
	0x2A: pgeOpCollides1o1u,
	0x2B: pgeOUnk0x2b,
	0x2C: pgeOUnk0x2c,
	0x2D: pgeOUnk0x2d,
	0x36: pgeOpSetcollisionstate1,
	0x37: pgeOpSetcollisionstate0,
	0x3C: pgeOUnk0x3c,
	0x3D: pgeOUnk0x3d,
	0x40: pgeOUnk0x40,
	0x45: pgeOUnk0x45,
	0x46: pgeOUnk0x46,
	0x47: pgeOUnk0x47,
	0x49: pgeOUnk0x49,
	0x50: pgeOUnk0x50,
	0x52: pgeOUnk0x52,
	0x53: pgeOUnk0x53,
	0x5D: pgeOUnk0x5d,
	0x5E: pgeOUnk0x5e,
	0x62: pgeOUnk0x62,
	0x63: pgeOUnk0x63,
	0x64: pgeOUnk0x64,
	0x67: pgeOUnk0x67,
	0x68: pgeOpSetcollisionstate2,
	0x6A: pgeOUnk0x6a,
	0x6D: pgeOpIscollidingobject,
	0x72: pgeOUnk0x72,
	0x74: pgeOpCollides4u,
	0x75: pgeOpDoesnotcollide4u,
	0x76: pgeOpIsbelowconrad,
	0x77: pgeOpIsaboveconrad,
	0x78: pgeOpIsnotfacingconrad,
	0x79: pgeOpIsfacingconrad,
	0x7A: pgeOpCollides2u1u,
	0x7E: pgeOUnk0x7e,
	0x7F: pgeOUnk0x7f,
	0x86: pgeOUnk0x86
}
