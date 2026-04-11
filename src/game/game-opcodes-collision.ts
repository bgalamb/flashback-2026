import type { Game } from "./game"
import { LivePGE, PgeOpcodeArgs, RoomCollisionGridPatchRestoreSlot } from "../core/intern"
import type { PgeZOrderComparator } from './game-types'
import { ctDownRoom, ctLeftRoom, ctRightRoom, ctUpRoom, uint8Max, uint16Max, ctRoomSize, ctGridStride, ctGridWidth, ctHeaderSize } from "../core/game_constants"
import { _pgeModkeystable as modifierKeyMasks } from '../core/staticres'
import { gameGetRoomCollisionGridData } from './game-collision'
import { assert } from "../core/assert"

export const pgeOpIsinpup = (args: PgeOpcodeArgs, game: Game) => {
	if (1 === game.pge.currentPgeInputMask) {
		return uint16Max
	} else {
		return 0
	}
}

export const pgeOpIsinpbackward = (args: PgeOpcodeArgs, game: Game) => {
	let mask = 8
	if (game.pge.currentPgeFacingIsMirrored) {
		mask = 4
	}
	if (mask === game.pge.currentPgeInputMask) {
		return uint16Max
	} else {
		return 0
	}
}

export const pgeOpIsinpdown = (args: PgeOpcodeArgs, game: Game) => {
	if (2 === game.pge.currentPgeInputMask) {
		return uint16Max
	} else {
		return 0
	}
}

export const pgeOpIsinpforward = (args: PgeOpcodeArgs, game: Game) => {
	let mask = 4
	if (game.pge.currentPgeFacingIsMirrored) {
		mask = 8
	}
	if (mask === game.pge.currentPgeInputMask) {
		return uint16Max
	} else {
		return 0
	}
}

export const pgeOpIsinpbackwardmod = (args: PgeOpcodeArgs, game: Game) => {
    assert(!(args.a >= 3), `Assertion failed: ${args.a} < 3`)
	let mask = modifierKeyMasks[args.a]
	if (game.pge.currentPgeFacingIsMirrored) {
		mask |= 4
	} else {
		mask |= 8
	}
	if (mask === game.pge.currentPgeInputMask) {
		return uint16Max
	} else {
		return 0
	}
}

export const pgeOpIsinpdownmod = (args: PgeOpcodeArgs, game: Game) => {
    assert(!(args.a >= 3), `Assertion failed: ${args.a} < 3`)
	const mask = modifierKeyMasks[args.a] | 2
	if (mask === game.pge.currentPgeInputMask) {
		return uint16Max
	} else {
		return 0
	}
}

export const pgeOpIsinpforwardmod = (args: PgeOpcodeArgs, game: Game) => {
    assert(!(args.a >= 3), `Assertion failed: ${args.a} < 3`)
	let mask = modifierKeyMasks[args.a]
	if (game.pge.currentPgeFacingIsMirrored) {
		mask |= 8
	} else {
		mask |= 4
	}
	if (mask === game.pge.currentPgeInputMask) {
		return uint16Max
	} else {
		return 0
	}
}

export const pgeOpIsinpupmod = (args: PgeOpcodeArgs, game: Game) => {
    assert(!(args.a >= 3), `Assertion failed: ${args.a} < 3`)
	const mask = modifierKeyMasks[args.a] | 1
	if (mask === game.pge.currentPgeInputMask) {
		return uint16Max
	} else {
		return 0
	}
}

export const pgeOpDoesnotcollide1u = (args: PgeOpcodeArgs, game: Game) => {
	const r = gameGetRoomCollisionGridData(game, args.pge, 1, -args.a)
	return (r & uint16Max) ? 0 : uint16Max
}

export const pgeOpDoesnotcollide10 = (args: PgeOpcodeArgs, game: Game) => {
	const r = gameGetRoomCollisionGridData(game, args.pge, 1, 0)
	return (r & uint16Max) ? 0 : uint16Max
}

export const pgeOpDoesnotcollide1d = (args: PgeOpcodeArgs, game: Game) => {
	const r = gameGetRoomCollisionGridData(game, args.pge, 1, args.a)
	return (r & uint16Max) ? 0 : uint16Max
}

export const pgeOpDoesnotcollide2u = (args: PgeOpcodeArgs, game: Game) => {
	const r = gameGetRoomCollisionGridData(game, args.pge, 2, -args.a)
	return (r & uint16Max) ? 0 : uint16Max
}

export const pgeOpDoesnotcollide20 = (args: PgeOpcodeArgs, game: Game) => {
	const r = gameGetRoomCollisionGridData(game, args.pge, 2, 0)
	return (r & uint16Max) ? 0 : uint16Max
}

export const pgeOpIsinpnomod = (args: PgeOpcodeArgs, game: Game) => {
    assert(!(args.a >= 3), `Assertion failed: ${args.a} < 3`)
	const mask = modifierKeyMasks[args.a]
	if (((game.pge.currentPgeInputMask & 0xF) | mask) === game.pge.currentPgeInputMask) {
		return uint16Max
	} else {
		return 0
	}
}

export const pgeOpGetcollision0u = (args: PgeOpcodeArgs, game: Game) => gameGetRoomCollisionGridData(game, args.pge, 0, -args.a)
export const pgeOpGetcollision00 = (args: PgeOpcodeArgs, game: Game) => gameGetRoomCollisionGridData(game, args.pge, 0, 0)
export const pgeOpGetcollision0d = (args: PgeOpcodeArgs, game: Game) => gameGetRoomCollisionGridData(game, args.pge, 0, args.a)

export const pgeOpIsinpidle = (args: PgeOpcodeArgs, game: Game) => {
	return game.pge.currentPgeInputMask === 0 ? uint16Max : 0
}

export const pgeOpGetcollision10 = (args: PgeOpcodeArgs, game: Game) => gameGetRoomCollisionGridData(game, args.pge, 1, 0)
export const pgeOpGetcollision1d = (args: PgeOpcodeArgs, game: Game) => gameGetRoomCollisionGridData(game, args.pge, 1, args.a)
export const pgeOpGetcollision2u = (args: PgeOpcodeArgs, game: Game) => gameGetRoomCollisionGridData(game, args.pge, 2, -args.a)
export const pgeOpGetcollision20 = (args: PgeOpcodeArgs, game: Game) => gameGetRoomCollisionGridData(game, args.pge, 2, 0)
export const pgeOpGetcollision2d = (args: PgeOpcodeArgs, game: Game) => gameGetRoomCollisionGridData(game, args.pge, 2, args.a)

export const pgeOpDoesnotcollide0u = (args: PgeOpcodeArgs, game: Game) => {
	const r = gameGetRoomCollisionGridData(game, args.pge, 0, -args.a)
	return (r & uint16Max) ? 0 : uint16Max
}

export const pgeOpDoesnotcollide00 = (args: PgeOpcodeArgs, game: Game) => {
	const r = gameGetRoomCollisionGridData(game, args.pge, 0, 0)
	return (r & uint16Max) ? 0 : uint16Max
}

export const pgeOpDoesnotcollide0d = (args: PgeOpcodeArgs, game: Game) => {
	const r = gameGetRoomCollisionGridData(game, args.pge, 0, args.a)
	return (r & uint16Max) ? 0 : uint16Max
}

export const pgeOpGetcollision1u = (args: PgeOpcodeArgs, game: Game) => gameGetRoomCollisionGridData(game, args.pge, 1, -args.a)

export const pgeZorderbynumber = (pge1: LivePGE, pge2: LivePGE, comp: number, comp2: number, game: Game) => {
	return 0
}

export const pgeZorderifindex = (pge1: LivePGE, pge2: LivePGE, comp: number, comp2: number, game: Game) => {
	if (pge1.index !== comp2) {
		game.queuePgeGroupSignal(pge2.index, pge1.index, comp)
		return 1
	}
	return 0
}

export const pgeZorderifsamedirection = (pge1: LivePGE, pge2: LivePGE, comp: number, comp2: number, game: Game) => {
	if (pge1 !== pge2) {
		if ((pge1.flags & 1) === (pge2.flags & 1)) {
			game.pge.opcodeComparisonResult2 = 1
			game.queuePgeGroupSignal(pge2.index, pge1.index, comp)
			if (pge2.index === 0) {
				return uint16Max
			}
		}
	}
	return 0
}

export const pgeZorderifdifferentdirection = (pge1: LivePGE, pge2: LivePGE, comp: number, comp2: number, game: Game) => {
	if (pge1 !== pge2) {
		if ((pge1.flags & 1) !== (pge2.flags & 1)) {
			game.pge.opcodeComparisonResult1 = 1
			game.queuePgeGroupSignal(pge2.index, pge1.index, comp)
			if (pge2.index === 0) {
				return uint16Max
			}
		}
	}
	return 0
}

export const pgeZorderbyanimyiftype = (pge1: LivePGE, pge2: LivePGE, comp: number, comp2: number, game: Game) => {
	if (pge1.initPge.objectType === comp2) {
		if (game.services.res.getAniData(pge1.scriptStateType)[3] === comp) {
			return 1
		}
	}
	return 0
}

export const pgeZorderbyanimy = (pge1: LivePGE, pge2: LivePGE, comp: number, comp2: number, game: Game) => {
	if (pge1 !== pge2) {
		if (game.services.res.getAniData(pge1.scriptStateType)[3] === comp) {
			return 1
		}
	}
	return 0
}

export const pgeZorderbyindex = (pge1: LivePGE, pge2: LivePGE, comp: number, comp2: number, game: Game) => {
	if (pge1 !== pge2) {
		game.queuePgeGroupSignal(pge2.index, pge1.index, comp)
		game.pge.opcodeComparisonResult1 = uint16Max
	}
	return 0
}

export const pgeZorderbyobj = (pge1: LivePGE, pge2: LivePGE, comp: number, comp2: number, game: Game) => {
	if (comp === 10) {
		if (pge1.initPge.objectType === comp && pge1.life >= 0) {
			return 1
		}
	} else if (pge1.initPge.objectType === comp) {
		return 1
	}
	return 0
}

export const pgeZorderiftypeanddifferentdirection = (pge1: LivePGE, pge2: LivePGE, comp: number, comp2: number, game: Game) => {
	if (pge1.initPge.objectType === comp) {
		if ((pge1.flags & 1) !== (pge2.flags & 1)) {
			return 1
		}
	}
	return 0
}

export const pgeZorderiftypeandsamedirection = (pge1: LivePGE, pge2: LivePGE, comp: number, comp2: number, game: Game) => {
	if (pge1.initPge.objectType === comp) {
		if ((pge1.flags & 1) === (pge2.flags & 1)) {
			return 1
		}
	}
	return 0
}

export const pgeZorder = (pge: LivePGE, num: number, compare: PgeZOrderComparator, unk: number, game: Game) => {
	let collisionGridPositionIndex = pge.collisionSlot
	while (collisionGridPositionIndex !== uint16Max) {
		const slotBucket = game.collision.dynamicPgeCollisionSlotsByPosition.get(collisionGridPositionIndex)
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

export const getActiveRoomCollisionSlotHeadsByArea = (game: Game, area: number) => {
	switch (area) {
	case 0:
		return game.collision.activeRoomCollisionSlotWindow.left
	case 1:
		return game.collision.activeRoomCollisionSlotWindow.current
	case 2:
		return game.collision.activeRoomCollisionSlotWindow.right
	default:
		return null
	}
}

export const pgeUpdatecollisionstate = (pge: LivePGE, pgeDy: number, var8: number, game: Game) => {
	let pgeCollisionSegments = pge.initPge.numberOfCollisionSegments
	if (!(pge.roomLocation & 0x80) && pge.roomLocation < ctRoomSize) {
        const gridData = game.services.res.level.ctData.subarray(ctHeaderSize)
		let dataIndex = ctGridStride * pge.roomLocation
		let pgePosY = (((pge.posY / 36)>>0) & ~1) + pgeDy
		let pgePosX = (pge.posX + 8) >> 4

		dataIndex += pgePosX + pgePosY * ctGridWidth

		let slot1: RoomCollisionGridPatchRestoreSlot = game.collision.activeRoomCollisionGridPatchRestoreSlots
		let i = 255
		pgePosX = i
		if (game.pge.currentPgeFacingIsMirrored) {
			i = pgeCollisionSegments - 1
			dataIndex -= i
		}
		while (slot1) {
			if (slot1.patchedGridDataView.buffer === gridData.buffer && slot1.patchedGridDataView.byteOffset === (gridData.byteOffset + dataIndex)) {
				slot1.patchedCellCount = pgeCollisionSegments - 1
                assert(!(pgeCollisionSegments >= ctGridStride), `Assertion failed: ${pgeCollisionSegments} < ${ctGridStride}`)
                gridData.subarray(dataIndex).fill(var8, 0, pgeCollisionSegments)
				dataIndex += pgeCollisionSegments
				return 1
			} else {
				++i
				slot1 = slot1.nextPatchedRegionRestoreSlot
				if (--i === 0) {
					break
				}
			}
		}

        const slotIndex = game.collision.roomCollisionGridPatchRestoreSlotPool.findIndex((slot) => slot === game.collision.nextFreeRoomCollisionGridPatchRestoreSlot)
		if (slotIndex < 255) {
			slot1 = game.collision.nextFreeRoomCollisionGridPatchRestoreSlot
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
				src[srcIndex++] = (var8 << 24 >> 24)
			}

            game.collision.nextFreeRoomCollisionGridPatchRestoreSlot = game.collision.roomCollisionGridPatchRestoreSlotPool[slotIndex + 1]
			slot1.nextPatchedRegionRestoreSlot = game.collision.activeRoomCollisionGridPatchRestoreSlots
			game.collision.activeRoomCollisionGridPatchRestoreSlots = slot1
		}
	}
	return 1
}
