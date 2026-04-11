import type { Game } from "./game"
import { LivePGE, PgeOpcodeArgs, RoomCollisionGridPatchRestoreSlot } from "../core/intern"
import { ctDownRoom, ctLeftRoom, ctRightRoom, ctUpRoom, uint8Max, uint16Max, ctRoomSize, ctGridStride, ctGridWidth, ctHeaderSize } from "../core/game_constants"
import { _pgeModkeystable as modifierKeyMasks } from '../core/staticres'
import { gameFindOverlappingPgeByObjectType, gameGetRoomCollisionGridData } from './game-collision'
import { colDetectgunhit, colDetectgunhitcallback1, colDetectgunhitcallback2, colDetectgunhitcallback3, colDetecthit, colDetecthitcallback1, colDetecthitcallback2, colDetecthitcallback3, colDetecthitcallback4, colDetecthitcallback5, colDetecthitcallback6 } from './collision'
import { assert } from "../core/assert"
import { getRuntimeRegistryState } from './game-runtime-data'
import { getActiveRoomCollisionSlotHeadsByArea, pgeUpdatecollisionstate, pgeZorder, pgeZorderbyanimy, pgeZorderbyanimyiftype, pgeZorderbyindex, pgeZorderbyobj, pgeZorderbynumber, pgeZorderifdifferentdirection, pgeZorderifindex, pgeZorderifsamedirection, pgeZorderiftypeanddifferentdirection, pgeZorderiftypeandsamedirection } from './game-opcodes-collision'

export const pgeOUnk0x3c = (args: PgeOpcodeArgs, game: Game) => {
    return pgeZorder(args.pge, args.a, pgeZorderbyanimyiftype, args.b, game)
}

export const pgeOUnk0x3d = (args: PgeOpcodeArgs, game: Game) => {
	return pgeZorder(args.pge, args.a, pgeZorderbyanimy, 0, game)
}

export const pgeOUnk0x40 = (args: PgeOpcodeArgs, game: Game) => {
	let pgeRoom = args.pge.roomLocation
	if (pgeRoom < 0 || pgeRoom >= ctRoomSize) return 0

	let colArea
	if (game.world.currentRoom === pgeRoom) colArea = 1
	else if (game.collision.activeCollisionLeftRoom === pgeRoom) colArea = 0
	else if (game.collision.activeCollisionRightRoom === pgeRoom) colArea = 2
	else return 0

	let gridPosX = (args.pge.posX + 8) >> 4
	let gridPosY = (args.pge.posY / 72) >> 0

	if (gridPosY >= 0 && gridPosY <= 2) {
		gridPosY *= ctGridWidth
		let _cx = args.a
		if (game.pge.currentPgeFacingIsMirrored) _cx = -_cx
		let _bl
		if (_cx >= 0) {
			if (_cx > ctGridWidth) _cx = ctGridWidth
			let var2 = new Int8Array(game.services.res.level.ctData.buffer)
			let var2Index = game.services.res.level.ctData.byteOffset + ctHeaderSize + pgeRoom * ctGridStride + gridPosY * 2 + ctGridWidth + gridPosX
			let activeRoomSlotHeads = getActiveRoomCollisionSlotHeadsByArea(game, colArea)
			let activeRoomSlotIndex = gridPosY + gridPosX
			let var12 = gridPosX
			--_cx

			do {
				--var12
				if (var12 < 0) {
					--colArea
					if (colArea < 0) return 0
					pgeRoom = game.services.res.level.ctData[ctLeftRoom + pgeRoom]
					if (pgeRoom < 0) return 0
					var12 = ctGridWidth - 1
					var2 = new Int8Array(game.services.res.level.ctData.buffer)
					var2Index = game.services.res.level.ctData.byteOffset + ctHeaderSize + 1 + pgeRoom * ctGridStride + gridPosY * 2 + (ctGridWidth - 1) + ctGridWidth
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
				--var2Index
				if (var2[var2Index] !== 0) return 0
				--_cx
			} while (_cx >= 0)
		} else {
			_cx = -_cx
			if (_cx > ctGridWidth) _cx = ctGridWidth

			let var2 = game.services.res.level.ctData.subarray(ctHeaderSize + 1 + pgeRoom * ctGridStride + gridPosY * 2 + ctGridWidth + gridPosX)
			let var2Index = 0
			let activeRoomSlotHeads = getActiveRoomCollisionSlotHeadsByArea(game, colArea)
			let activeRoomSlotIndex = gridPosY + gridPosX
			let var12 = gridPosX
			--_cx
			do {
				++var12
				if (var12 === ctGridWidth) {
					++colArea
					if (colArea > 2) return 0
					pgeRoom = game.services.res.level.ctData[ctRightRoom + pgeRoom]
					if (pgeRoom < 0) return 0
					var12 = 0
					var2 = game.services.res.level.ctData.subarray(ctHeaderSize + 1 + pgeRoom * ctGridStride + gridPosY * 2 + ctGridWidth)
					var2Index = 0
					activeRoomSlotHeads = getActiveRoomCollisionSlotHeadsByArea(game, colArea)
					activeRoomSlotIndex = gridPosY - 1
				}
				activeRoomSlotIndex++
				const activeCollisionSlotHead = activeRoomSlotHeads ? activeRoomSlotHeads[activeRoomSlotIndex] : null
				if (activeCollisionSlotHead) {
					for (const colSlot of activeCollisionSlotHead) {
						if (args.pge !== colSlot.pge && (colSlot.pge.flags & 4) && colSlot.pge.initPge.objectType === args.b) {
							return 1
						}
					}
				}
				_bl = var2[var2Index]
				++var2Index
				if (_bl !== 0) return 0
				--_cx
			} while (_cx >= 0)
		}
	}

	return 0
}

export const pgeOpIsnotfacingconrad = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	const pge = args.pge
	const pgeConrad = runtime.livePgesByIndex[0]
	if ((pge.posY / 72) >> 0 === ((pgeConrad.posY - 8) / 72) >> 0) {
		if (pge.roomLocation === pgeConrad.roomLocation) {
			if (args.a === 0) {
				if (game.pge.currentPgeFacingIsMirrored) {
					if (pge.posX < pgeConrad.posX) return uint16Max
				} else if (pge.posX > pgeConrad.posX) return uint16Max
			} else {
				let dx
				if (game.pge.currentPgeFacingIsMirrored) dx = pgeConrad.posX - pge.posX
				else dx = pge.posX - pgeConrad.posX
				if (dx > 0 && dx < args.a * 16) return uint16Max
			}
		} else if (args.a === 0 && !(pge.roomLocation & 0x80) && pge.roomLocation < ctRoomSize) {
			if (game.pge.currentPgeFacingIsMirrored) {
				if (pgeConrad.roomLocation === game.services.res.level.ctData[ctRightRoom + pge.roomLocation]) return uint16Max
			} else if (pgeConrad.roomLocation === game.services.res.level.ctData[ctLeftRoom + pge.roomLocation]) return uint16Max
		}
	}
	return 0
}

export const pgeOpIsfacingconrad = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	const pge = args.pge
	const pgeConrad = runtime.livePgesByIndex[0]
	if ((pge.posY / 72) >> 0 === ((pgeConrad.posY - 8) / 72) >> 0) {
		if (pge.roomLocation === pgeConrad.roomLocation) {
			if (args.a === 0) {
				if (game.pge.currentPgeFacingIsMirrored) {
					if (pge.posX > pgeConrad.posX) return uint16Max
				} else if (pge.posX <= pgeConrad.posX) return uint16Max
			} else {
				let dx
				if (game.pge.currentPgeFacingIsMirrored) dx = pge.posX - pgeConrad.posX
				else dx = pgeConrad.posX - pge.posX
				if (dx > 0 && dx < args.a * 16) return uint16Max
			}
		} else if (args.a === 0 && !(pge.roomLocation & 0x80) && pge.roomLocation < ctRoomSize) {
			if (game.pge.currentPgeFacingIsMirrored) {
				if (pgeConrad.roomLocation === game.services.res.level.ctData[ctLeftRoom + pge.roomLocation]) return uint16Max
			} else if (pgeConrad.roomLocation === game.services.res.level.ctData[ctRightRoom + pge.roomLocation]) return uint16Max
		}
	}
	return 0
}

export const pgeOpCollides4u = (args: PgeOpcodeArgs, game: Game) => gameGetRoomCollisionGridData(game, args.pge, 4, -args.a) !== 0 ? uint16Max : 0
export const pgeOpDoesnotcollide4u = (args: PgeOpcodeArgs, game: Game) => gameGetRoomCollisionGridData(game, args.pge, 4, -args.a) === 0 ? uint16Max : 0

export const pgeOpIsbelowconrad = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	const pge = args.pge
	const conrad = runtime.livePgesByIndex[0]
	if (conrad.roomLocation === pge.roomLocation) {
		if ((((conrad.posY - 8) / 72) >> 0) < ((pge.posY / 72) >> 0)) return uint16Max
	} else if (pge.roomLocation < ctRoomSize && conrad.roomLocation === game.services.res.level.ctData[ctUpRoom + pge.roomLocation]) {
		return uint16Max
	}
	return 0
}

export const pgeOpIsaboveconrad = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	const pge = args.pge
	const conrad = runtime.livePgesByIndex[0]
	if (conrad.roomLocation === pge.roomLocation) {
		if ((((conrad.posY - 8) / 72) >> 0) > ((pge.posY / 72) >> 0)) return uint16Max
	} else if (pge.roomLocation < ctRoomSize && conrad.roomLocation === game.services.res.level.ctData[ctDownRoom + pge.roomLocation]) {
		return uint16Max
	}
	return 0
}

export const pgeOpCollides2u1u = (args: PgeOpcodeArgs, game: Game) => {
	if (gameGetRoomCollisionGridData(game, args.pge, 1, -args.a) === 0) {
		if (gameGetRoomCollisionGridData(game, args.pge, 2, -(args.a + 1)) & uint16Max) return uint16Max
	}
	return 0
}

export const pgeOUnk0x7c = (args: PgeOpcodeArgs, game: Game) => {
	let pge = gameFindOverlappingPgeByObjectType(game, args.pge, 3)
	if (pge === null) {
		pge = gameFindOverlappingPgeByObjectType(game, args.pge, 5)
		if (pge == null) {
			pge = gameFindOverlappingPgeByObjectType(game, args.pge, 9)
			if (pge === null) pge = gameFindOverlappingPgeByObjectType(game, args.pge, uint16Max)
		}
	}
	if (pge !== null) game.queuePgeGroupSignal(args.pge.index, pge.index, args.a)
	return 0
}

export const pgeOUnk0x7e = (args: PgeOpcodeArgs, game: Game) => {
	game.pge.opcodeComparisonResult1 = 0
	pgeZorder(args.pge, args.a, pgeZorderbyindex, 0, game)
	return game.pge.opcodeComparisonResult1
}

export const pgeOpCollides1u2o = (args: PgeOpcodeArgs, game: Game) => {
	if (gameGetRoomCollisionGridData(game, args.pge, 1, args.a - 1) & uint16Max) {
		if (gameGetRoomCollisionGridData(game, args.pge, 2, args.a) === 0) return uint16Max
	}
	return 0
}

export const pgeOpCollides1u1o = (args: PgeOpcodeArgs, game: Game) => {
	if (gameGetRoomCollisionGridData(game, args.pge, 1, args.a - 1) & uint16Max) {
		if (gameGetRoomCollisionGridData(game, args.pge, 1, args.a) === 0) return uint16Max
	}
	return 0
}

export const pgeOpCollides1o1u = (args: PgeOpcodeArgs, game: Game) => {
	if (gameGetRoomCollisionGridData(game, args.pge, 1, args.a - 1) === 0) {
		if (gameGetRoomCollisionGridData(game, args.pge, 1, args.a) & uint16Max) return uint16Max
	}
	return 0
}

export const pgeOUnk0x2b = (args: PgeOpcodeArgs, game: Game) => pgeZorder(args.pge, args.a, pgeZorderiftypeanddifferentdirection, 0, game)
export const pgeOUnk0x2c = (args: PgeOpcodeArgs, game: Game) => pgeZorder(args.pge, args.a, pgeZorderiftypeandsamedirection, 0, game)
export const pgeOUnk0x2d = (args: PgeOpcodeArgs, game: Game) => pgeZorder(args.pge, args.a, pgeZorderbyobj, 0, game) ^ 1

export const pgeOpDoesnotcollide2d = (args: PgeOpcodeArgs, game: Game) => {
	const r = gameGetRoomCollisionGridData(game, args.pge, 2, args.a)
	return (r & uint16Max) ? 0 : uint16Max
}

export const pgeOpCollides0o0d = (args: PgeOpcodeArgs, game: Game) => {
	if (gameGetRoomCollisionGridData(game, args.pge, 0, args.a) & uint16Max) {
		if (gameGetRoomCollisionGridData(game, args.pge, 0, args.a + 1) === 0 && gameGetRoomCollisionGridData(game, args.pge, -1, args.a) === 0) {
			return uint16Max
		}
	}
	return 0
}

export const pgeOpCollides2o2d = (args: PgeOpcodeArgs, game: Game) => {
	if (gameGetRoomCollisionGridData(game, args.pge, 2, args.a) & uint16Max) {
		if (gameGetRoomCollisionGridData(game, args.pge, 2, args.a + 1) === 0 && gameGetRoomCollisionGridData(game, args.pge, 1, args.a) === 0) {
			return uint16Max
		}
	}
	return 0
}

export const pgeOpCollides0o0u = (args: PgeOpcodeArgs, game: Game) => {
	if (gameGetRoomCollisionGridData(game, args.pge, 0, args.a) & uint16Max) {
		if (gameGetRoomCollisionGridData(game, args.pge, 0, args.a - 1) === 0 && gameGetRoomCollisionGridData(game, args.pge, -1, args.a) === 0) {
			return uint16Max
		}
	}
	return 0
}

export const pgeOpCollides2o2u = (args: PgeOpcodeArgs, game: Game) => {
	if (gameGetRoomCollisionGridData(game, args.pge, 2, args.a) & uint16Max) {
		if (gameGetRoomCollisionGridData(game, args.pge, 2, args.a - 1) === 0 && gameGetRoomCollisionGridData(game, args.pge, 1, args.a) === 0) {
			return uint16Max
		}
	}
	return 0
}

export const pgeOpCollides2u2o = (args: PgeOpcodeArgs, game: Game) => {
	if (gameGetRoomCollisionGridData(game, args.pge, 2, args.a - 1) & uint16Max) {
		if (gameGetRoomCollisionGridData(game, args.pge, 2, args.a) === 0 && gameGetRoomCollisionGridData(game, args.pge, 1, args.a - 1) === 0) {
            return uint16Max
		}
	}
	return 0
}

export const pgeOpIsingroup = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	for (const pendingGroup of runtime.pendingSignalsByTargetPgeIndex.get(args.pge.index) ?? []) {
		if (pendingGroup.signalId === args.a) return uint16Max
	}
	return 0
}

export const pgeOUnk0x50 = (args: PgeOpcodeArgs, game: Game) => pgeZorder(args.pge, args.a, pgeZorderbyobj, 0, game)
export const pgeOUnk0x52 = (args: PgeOpcodeArgs, game: Game) => colDetecthit(args.pge, args.a, args.b, colDetecthitcallback4, colDetecthitcallback1, 0, 0, game)
export const pgeOUnk0x53 = (args: PgeOpcodeArgs, game: Game) => colDetecthit(args.pge, args.a, args.b, colDetecthitcallback5, colDetecthitcallback1, 0, 0, game)

export const pgeOUnk0x34 = (args: PgeOpcodeArgs, game: Game) => {
	const mask = (game.pge.currentPgeInputMask & 0xF) | modifierKeyMasks[0]
	if (mask === game.pge.currentPgeInputMask && gameGetRoomCollisionGridData(game, args.pge, 2, -args.a) === 0) {
		return uint16Max
	}
	return 0
}

export const pgeOpIsinpmod = (args: PgeOpcodeArgs, game: Game) => {
    assert(!(args.a >= 3), `Assertion failed: ${args.a} < 3`)
	const mask = modifierKeyMasks[args.a]
	return mask === game.pge.currentPgeInputMask ? uint16Max : 0
}

const pgeIsingroup = (pgeDst: LivePGE, signalId: number, counter: number, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	assert(!(counter < 1 || counter > 4), `Assertion failed: ${counter} >= 1 1 && ${counter} <= 4`)
	const c = pgeDst.initPge.counterValues[counter - 1]
	for (const pendingGroup of runtime.pendingSignalsByTargetPgeIndex.get(pgeDst.index) ?? []) {
		if (pendingGroup.signalId === signalId && pendingGroup.senderPgeIndex === c) return 1
	}
	return 0
}

export const pgeOpIsingroup1 = (args: PgeOpcodeArgs, game: Game) => pgeIsingroup(args.pge, args.a, 1, game)
export const pgeOpIsingroup2 = (args: PgeOpcodeArgs, game: Game) => pgeIsingroup(args.pge, args.a, 2, game)
export const pgeOpIsingroup3 = (args: PgeOpcodeArgs, game: Game) => pgeIsingroup(args.pge, args.a, 3, game)
export const pgeOpIsingroup4 = (args: PgeOpcodeArgs, game: Game) => pgeIsingroup(args.pge, args.a, 4, game)
export const pgeOpSetcollisionstate1 = (args: PgeOpcodeArgs, game: Game) => pgeUpdatecollisionstate(args.pge, args.a, 1, game)
export const pgeOpSetcollisionstate0 = (args: PgeOpcodeArgs, game: Game) => pgeUpdatecollisionstate(args.pge, args.a, 0, game)

export const pgeOUnk0x45 = (args: PgeOpcodeArgs, game: Game) => pgeZorder(args.pge, args.a, pgeZorderbynumber, 0, game)
export const pgeOUnk0x46 = (args: PgeOpcodeArgs, game: Game) => {
	game.pge.opcodeComparisonResult1 = 0
	pgeZorder(args.pge, args.a, pgeZorderifdifferentdirection, 0, game)
	return game.pge.opcodeComparisonResult1
}
export const pgeOUnk0x47 = (args: PgeOpcodeArgs, game: Game) => {
	game.pge.opcodeComparisonResult2 = 0
	pgeZorder(args.pge, args.a, pgeZorderifsamedirection, 0, game)
	return game.pge.opcodeComparisonResult2
}

export const pgeOUnk0x48 = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	const pge = gameFindOverlappingPgeByObjectType(game, runtime.livePgesByIndex[0], args.pge.initPge.counterValues[0])
	if (pge && pge.life === args.pge.life) {
		game.queuePgeGroupSignal(args.pge.index, pge.index, args.a)
		return 1
	}
	return 0
}

export const pgeOUnk0x49 = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	return pgeZorder(runtime.livePgesByIndex[0], args.a, pgeZorderifindex, args.pge.initPge.counterValues[0], game)
}

export const pgeOUnk0x4a = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	const pge: LivePGE = args.pge
	pge.roomLocation = 0xFE
	pge.flags &= ~4
	runtime.livePgeStore.activeFrameByIndex[pge.index] = null
	const invPge: LivePGE = game.findInventoryItemBeforePge(runtime.livePgesByIndex[args.a], pge)
	if (invPge === runtime.livePgesByIndex[args.a]) {
		if (pge.index !== game.getCurrentInventoryItemIndex(invPge)) return 1
	} else if (pge.index !== game.getNextInventoryItemIndex(runtime.livePgesByIndex[args.a], invPge.index)) {
		return 1
	}
	game.removePgeFromInventory(invPge, pge, runtime.livePgesByIndex[args.a])
	return 1
}

export const pgeOUnk0x7f = (args: PgeOpcodeArgs, game: Game) => {
	const _si: LivePGE = args.pge
	let var4 = _si.collisionSlot
	let var2 = _si.index
	while (var4 !== uint16Max) {
		const slotBucket = game.collision.dynamicPgeCollisionSlotsByPosition.get(var4)
		if (!slotBucket) return 1
		let nextCollisionGridPositionIndex = uint16Max
		for (const slot of slotBucket) {
			if (slot.pge !== args.pge && slot.pge.initPge.objectType === 3 && var2 !== slot.pge.inventoryOwnerPgeIndex) return 0
			if (slot.pge === args.pge) nextCollisionGridPositionIndex = slot.index
		}
		var4 = nextCollisionGridPositionIndex
	}
	return uint16Max
}

export const pgeOUnk0x6a = (args: PgeOpcodeArgs, game: Game) => {
	let _si: LivePGE = args.pge
	let pgeRoom = _si.roomLocation
	if (pgeRoom < 0 || pgeRoom >= ctRoomSize) return 0
	let _bl
	let colArea = 0
	let ctData: Int8Array = null
	let ctIndex = 0
	if (game.world.currentRoom === pgeRoom) colArea = 1
	else if (game.collision.activeCollisionLeftRoom === pgeRoom) colArea = 0
	else if (game.collision.activeCollisionRightRoom === pgeRoom) colArea = 2
	else return 0

	let gridPosX = (_si.posX + 8) >> 4
	let gridPosY = (_si.posY / 72) >> 0
	if (gridPosY >= 0 && gridPosY <= 2) {
		gridPosY *= ctGridWidth
		let _cx = args.a
		if (game.pge.currentPgeFacingIsMirrored) _cx = -_cx
		if (_cx >= 0) {
			if (_cx > ctGridWidth) _cx = ctGridWidth
			ctData = game.services.res.level.ctData
			ctIndex = ctHeaderSize + pgeRoom * ctGridStride + gridPosY * 2 + ctGridWidth + gridPosX
			let activeRoomSlotHeads = getActiveRoomCollisionSlotHeadsByArea(game, colArea)
			let activeRoomSlotIndex = gridPosY + gridPosX + 1
			++ctIndex
			let varA = gridPosX
			do {
				--varA
				if (varA < 0) {
					--colArea
					if (colArea < 0) return 0
					pgeRoom = game.services.res.level.ctData[ctLeftRoom + pgeRoom]
					if (pgeRoom < 0) return 0
					varA = ctGridWidth - 1
					ctIndex = ctHeaderSize + 1 + pgeRoom * ctGridStride + gridPosY * 2 + ctGridWidth + varA
					activeRoomSlotHeads = getActiveRoomCollisionSlotHeadsByArea(game, colArea)
					activeRoomSlotIndex = gridPosY + ctGridWidth
				}
				--activeRoomSlotIndex
				const activeCollisionSlotHead = activeRoomSlotHeads ? activeRoomSlotHeads[activeRoomSlotIndex] : null
				if (activeCollisionSlotHead) {
					for (const collisionSlot of activeCollisionSlotHead) {
						_si = collisionSlot.pge
						if (args.pge !== _si && (_si.flags & 4) && _si.life >= 0 && (_si.initPge.objectType === 1 || _si.initPge.objectType === 10)) return 1
					}
				}
				--ctIndex
				if (ctData[ctIndex] !== 0) return 0
				--_cx
			} while (_cx >= 0)
		} else {
			_cx = -_cx
			if (_cx > ctGridWidth) _cx = ctGridWidth
			ctData = game.services.res.level.ctData
			ctIndex = ctHeaderSize + 1 + pgeRoom * ctGridStride + gridPosY * 2 + ctGridWidth + gridPosX
			let activeRoomSlotHeads = getActiveRoomCollisionSlotHeadsByArea(game, colArea)
			let activeRoomSlotIndex = gridPosY + gridPosX + 1
			let varA = gridPosX
			let firstRun = true
			do {
				if (!firstRun) {
					++varA
					if (varA === ctGridWidth) {
						++colArea
						if (colArea > 2) return 0
						pgeRoom = game.services.res.level.ctData[ctRightRoom + pgeRoom]
						if (pgeRoom < 0) return 0
						varA = 0
						ctIndex = ctHeaderSize + pgeRoom * ctGridStride + gridPosY * 2 + ctGridWidth + varA
						activeRoomSlotHeads = getActiveRoomCollisionSlotHeadsByArea(game, colArea)
						activeRoomSlotIndex = gridPosY
					}
				}
				firstRun = false
				const activeCollisionSlotHead = activeRoomSlotHeads ? activeRoomSlotHeads[activeRoomSlotIndex] : null
				++activeRoomSlotIndex
				if (activeCollisionSlotHead) {
					for (const collisionSlot of activeCollisionSlotHead) {
						_si = collisionSlot.pge
						if (args.pge !== _si && (_si.flags & 4) && _si.life >= 0 && (_si.initPge.objectType === 1 || _si.initPge.objectType === 10)) return 1
					}
				}
				_bl = ctData[ctIndex] << 24 >> 24
				++ctIndex
				if (_bl !== 0) return 0
				--_cx
			} while (_cx >= 0)
		}
	}
	return 0
}

export const pgeOpIsingroupslice = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	const pge = args.pge
	if (args.a === 0) {
		for (const pendingGroup of runtime.pendingSignalsByTargetPgeIndex.get(pge.index) ?? []) {
			if (pendingGroup.signalId === 1 || pendingGroup.signalId === 2) return 1
		}
	} else {
		for (const pendingGroup of runtime.pendingSignalsByTargetPgeIndex.get(pge.index) ?? []) {
			if (pendingGroup.signalId === 3 || pendingGroup.signalId === 4) return 1
		}
	}
	return 0
}

export const pgeOUnk0x5f = (args: PgeOpcodeArgs, game: Game) => {
	const pge = args.pge
	let pgeRoom = pge.roomLocation
	if (pgeRoom < 0 || pgeRoom >= ctRoomSize) return 0
	let dx
	let _cx = pge.initPge.counterValues[0]
	if (_cx <= 0) {
		dx = 1
		_cx = -_cx
	} else {
		dx = -1
	}
	if (game.pge.currentPgeFacingIsMirrored) dx = -dx
	let gridPosX = (pge.posX + 8) >> 4
	let gridPosY = 0

	do {
		let _ax = gameGetRoomCollisionGridData(game, pge, 1, -gridPosY)
		if (_ax !== 0) {
			if (!(_ax & 2) || args.a !== 1) {
				pge.roomLocation = pgeRoom
				pge.posX = gridPosX * ctGridWidth
				return 1
			}
		}
		if (gridPosX < 0) {
			pgeRoom = game.services.res.level.ctData[ctLeftRoom + pgeRoom]
			if (pgeRoom < 0 || pgeRoom >= ctRoomSize) return 0
			gridPosX += ctGridWidth
		} else if (gridPosX > ctGridWidth - 1) {
			pgeRoom = game.services.res.level.ctData[ctRightRoom + pgeRoom]
			if (pgeRoom < 0 || pgeRoom >= ctRoomSize) return 0
			gridPosX -= ctGridWidth
		}
		gridPosX += dx
		++gridPosY
	} while (gridPosY <= _cx)

	return 0
}

export const pgeOUnk0x62 = (args: PgeOpcodeArgs, game: Game) => colDetecthit(args.pge, args.a, args.b, colDetecthitcallback3, colDetecthitcallback1, 0, -1, game)
export const pgeOUnk0x63 = (args: PgeOpcodeArgs, game: Game) => colDetecthit(args.pge, args.a, args.b, colDetecthitcallback2, colDetecthitcallback1, 0, -1, game)
export const pgeOUnk0x64 = (args: PgeOpcodeArgs, game: Game) => colDetectgunhit(args.pge, args.a, args.b, colDetectgunhitcallback3, colDetectgunhitcallback1, 1, -1, game)

export const pgeOUnk0x67 = (args: PgeOpcodeArgs, game: Game) => {
	if (gameGetRoomCollisionGridData(game, args.pge, 1, -args.a) & 2) return uint16Max
	return 0
}

export const pgeOpSetcollisionstate2 = (args: PgeOpcodeArgs, game: Game) => pgeUpdatecollisionstate(args.pge, args.a, 2, game)

export const pgeOUnk0x6c = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	const pge = gameFindOverlappingPgeByObjectType(game, runtime.livePgesByIndex[0], args.pge.initPge.counterValues[0])
	if (pge && pge.life <= args.pge.life) {
		game.queuePgeGroupSignal(args.pge.index, pge.index, args.a)
		return 1
	}
	return 0
}

export const pgeOUnk0x6e = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	for (const pendingGroup of runtime.pendingSignalsByTargetPgeIndex.get(args.pge.index) ?? []) {
		if (pendingGroup.signalId === args.a) {
			game.updatePgeInventory(runtime.livePgesByIndex[pendingGroup.senderPgeIndex], args.pge)
			return uint16Max
		}
	}
	return 0
}

export const pgeOUnk0x6f = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	const pge = args.pge
	for (const pendingGroup of runtime.pendingSignalsByTargetPgeIndex.get(pge.index) ?? []) {
		if (args.a === pendingGroup.signalId) {
			game.queuePgeGroupSignal(pge.index, pendingGroup.senderPgeIndex, 0xC)
			return 1
		}
	}
	return 0
}

export const pgeOUnk0x70 = (args: PgeOpcodeArgs, game: Game) => {
	for (const inventoryItemIndex of game.getInventoryItemIndices(args.pge)) {
		game.queuePgeGroupSignal(args.pge.index, inventoryItemIndex, args.a)
	}
	return 1
}

export const pgeOUnk0x71 = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	for (const pendingGroup of runtime.pendingSignalsByTargetPgeIndex.get(args.pge.index) ?? []) {
		if (pendingGroup.signalId === args.a) {
			game.reorderPgeInventory(args.pge)
			return 1
		}
	}
	return 0
}

export const pgeOUnk0x72 = (args: PgeOpcodeArgs, game: Game) => {
	const roomCollisionGrid = new Int8Array(
		game.services.res.level.ctData.buffer,
		game.services.res.level.ctData.byteOffset + ctHeaderSize + args.pge.roomLocation * ctGridStride,
		ctGridStride
	)
	const pgeCollisionGridY = (((args.pge.posY / 36) >> 0) & ~1) + args.a
	const pgeCollisionGridX = (args.pge.posX + 8) >> 4
	const patchedGridOffset = pgeCollisionGridY * ctGridWidth + pgeCollisionGridX
	let restoreSlot = game.collision.activeRoomCollisionGridPatchRestoreSlots
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

export const pgeOUnk0x73 = (args: PgeOpcodeArgs, game: Game) => {
	const pge = gameFindOverlappingPgeByObjectType(game, args.pge, args.a)
	if (pge !== null) {
		game.updatePgeInventory(pge, args.pge)
		return uint16Max
	}
	return 0
}

export const pgeOUnk0x5d = (args: PgeOpcodeArgs, game: Game) => colDetecthit(args.pge, args.a, args.b, colDetecthitcallback4, colDetecthitcallback6, 0, 0, game)
export const pgeOUnk0x5e = (args: PgeOpcodeArgs, game: Game) => colDetecthit(args.pge, args.a, args.b, colDetecthitcallback5, colDetecthitcallback6, 0, 0, game)
export const pgeOUnk0x86 = (args: PgeOpcodeArgs, game: Game) => colDetectgunhit(args.pge, args.a, args.b, colDetectgunhitcallback2, colDetectgunhitcallback1, 1, 0, game)
