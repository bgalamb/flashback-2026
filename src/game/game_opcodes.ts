import { Game } from "./game"
import { ctDownRoom, ctLeftRoom, ctRightRoom, ctUpRoom } from "../core/game_constants"
import { LivePGE, PgeOpcodeArgs, RoomCollisionGridPatchRestoreSlot, PgeZOrderComparator } from "../core/intern"
import { colDetecthit, colDetecthitcallback3, colDetecthitcallback1, colDetecthitcallback2, colDetectgunhitcallback2, colDetectgunhitcallback1, colDetectgunhit, colDetectgunhitcallback3, colDetecthitcallback4, colDetecthitcallback5, colDetecthitcallback6 } from '../core/collision'
import { uint8Max, uint16Max, ctRoomSize, ctGridStride, ctGridWidth, ctHeaderSize, globalGameOptions, kIngameSaveSlot } from "../core/game_constants"
import { gameFindFirstMatchingCollidingObject, gameFindOverlappingPgeByObjectType, gameGetRoomCollisionGridData } from './game_collision'
import { gameDebugLog } from './game_debug'
import { gameInitializePgeDefaultAnimation } from './game_pge'
import { assert } from "../core/assert"
import { gameMarkSaveStateCompleted, gameQueueDeathCutscene, gameRequestMapReload, gameSetCurrentLevel } from './game_lifecycle'
import { getRuntimeRegistryState } from './game_runtime_data'
import { getGamePgeState, getGameSessionState, getGameUiState, getGameWorldState } from './game_state'
import { gameGetRandomNumber } from './game_world'

type OpcodeDebugSnapshot = Record<string, string | number | boolean>
type OpcodeDebugConfig = {
	before?: (args: PgeOpcodeArgs, game: Game) => OpcodeDebugSnapshot | null
	after?: (args: PgeOpcodeArgs, game: Game, result: number) => OpcodeDebugSnapshot | null
}

type PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => number

const formatOpcodeResult = (result: number) => result === uint16Max ? 'uint16Max' : String(result)

const formatOpcodeSnapshotDiff = (before: OpcodeDebugSnapshot | null | undefined, after: OpcodeDebugSnapshot | null | undefined) => {
	if (!after) {
		return ''
	}
	if (!before) {
		return Object.entries(after).map(([key, value]) => `${key}=${value}`).join(' ')
	}
	const keys = new Set([...Object.keys(before), ...Object.keys(after)])
	const changes: string[] = []
	for (const key of keys) {
		const beforeValue = before[key]
		const afterValue = after[key]
		if (beforeValue !== afterValue) {
			changes.push(`${key}:${beforeValue}->${afterValue}`)
		}
	}
	return changes.join(' ')
}

const withOpcodeDebug = (id: string, name: string, handler: PgeOpcodeHandler, config: OpcodeDebugConfig = {}): PgeOpcodeHandler => {
	return (args: PgeOpcodeArgs, game: Game) => {
		const before = config.before?.(args, game)
		const result = handler(args, game)
		const after = config.after?.(args, game, result)
		const diff = formatOpcodeSnapshotDiff(before, after)
		const world = getGameWorldState(game)
		gameDebugLog(
			game,
			'opcode',
			`[opcode] id=${id} name=${name} frame=${game.renders} currentRoom=${world.currentRoom} pge=${args.pge.index} pgeRoom=${args.pge.roomLocation} a=${args.a} b=${args.b} result=${formatOpcodeResult(result)}${diff ? ` ${diff}` : ''}`
		)
		return result
	}
}

const pgeOpIsinpup = (args: PgeOpcodeArgs, game: Game) => {
	if (1 === game.pge.currentPgeInputMask) {
		return uint16Max
	} else {
		return 0
	}
}

const pgeOpIsinpbackward = (args: PgeOpcodeArgs, game: Game) => {
	let mask = 8 // right
	if (game.pge.currentPgeFacingIsMirrored) {
		mask = 4 // left
	}
	if (mask === game.pge.currentPgeInputMask) {
		return uint16Max
	} else {
		return 0
	}
}

const pgeOpIsinpdown = (args: PgeOpcodeArgs, game: Game) => {
	if (2 === game.pge.currentPgeInputMask) {
		return uint16Max
	} else {
		return 0
	}
}

const pgeOpIsinpforward = (args: PgeOpcodeArgs, game: Game) => {
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

const pgeOpIsinpbackwardmod = (args: PgeOpcodeArgs, game: Game) => {
	// assert(args->a < 3);
    assert(!(args.a >= 3), `Assertion failed: ${args.a} < 3`)
	let mask = Game._modifierKeyMasks[args.a]
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

const pgeOpIsinpdownmod = (args: PgeOpcodeArgs, game: Game) => {
    assert(!(args.a >= 3), `Assertion failed: ${args.a} < 3`)
	//assert(args->a < 3);
	const mask = Game._modifierKeyMasks[args.a] | 2
	if (mask === game.pge.currentPgeInputMask) {
		return uint16Max
	} else {
		return 0
	}
}

const pgeOpIsinpforwardmod = (args: PgeOpcodeArgs, game: Game) => {
    assert(!(args.a >= 3), `Assertion failed: ${args.a} < 3`)
	//assert(args->a < 3);
	let mask = Game._modifierKeyMasks[args.a]
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

const pgeOpIsinpupmod = (args: PgeOpcodeArgs, game: Game) => {
	// assert(args->a < 3);
    assert(!(args.a >= 3), `Assertion failed: ${args.a} < 3`)
	const mask = Game._modifierKeyMasks[args.a] | 1
	if (mask === game.pge.currentPgeInputMask) {
		return uint16Max
	} else {
		return 0
	}
}

const pgeOpDoesnotcollide1u = (args: PgeOpcodeArgs, game: Game) => {
	const r = gameGetRoomCollisionGridData(game, args.pge, 1, -args.a)
	if (r & uint16Max) {
		return 0;
	} else {
		return uint16Max
	}
}

const pgeOpDoesnotcollide10 = (args: PgeOpcodeArgs, game: Game) => {
	const r = gameGetRoomCollisionGridData(game, args.pge, 1, 0)
	if (r & uint16Max) {
		return 0
	} else {
		return uint16Max
	}
}

const pgeOpDoesnotcollide1d = (args: PgeOpcodeArgs, game: Game) => {
	const r = gameGetRoomCollisionGridData(game, args.pge, 1, args.a)
	if (r & uint16Max) {
		return 0
	} else {
		return uint16Max
	}
}

const pgeOpDoesnotcollide2u = (args: PgeOpcodeArgs, game: Game) => {
	const r = gameGetRoomCollisionGridData(game, args.pge, 2, -args.a)
	if (r & uint16Max) {
		return 0
	} else {
		return uint16Max
	}
}

const pgeOpDoesnotcollide20 = (args: PgeOpcodeArgs, game: Game) => {
	const r = gameGetRoomCollisionGridData(game, args.pge, 2, 0)
	if (r & uint16Max) {
		return 0
	} else {
		return uint16Max
	}
}

const pgeOpIsinpnomod = (args: PgeOpcodeArgs, game: Game) => {
	// assert(args->a < 3);
    assert(!(args.a >= 3), `Assertion failed: ${args.a} < 3`)
	const mask = Game._modifierKeyMasks[args.a]
	if (((game.pge.currentPgeInputMask & 0xF) | mask) === game.pge.currentPgeInputMask) {
		return uint16Max
	} else {
		return 0
	}
}

const pgeOpGetcollision0u = (args: PgeOpcodeArgs, game: Game) => {
	return gameGetRoomCollisionGridData(game, args.pge, 0, -args.a)
}

const pgeOpGetcollision00 = (args: PgeOpcodeArgs, game: Game) => {
	return gameGetRoomCollisionGridData(game, args.pge, 0, 0)
}

const pgeOpGetcollision0d = (args: PgeOpcodeArgs, game: Game) => {
	return gameGetRoomCollisionGridData(game, args.pge, 0, args.a)
}

const pgeOpIsinpidle = (args: PgeOpcodeArgs, game: Game) => {
	if (game.pge.currentPgeInputMask === 0) {
		return uint16Max
	} else {
		return 0
	}    
}

const pgeOpGetcollision10 = (args: PgeOpcodeArgs, game: Game) => {
	return gameGetRoomCollisionGridData(game, args.pge, 1, 0)
}

const pgeOpGetcollision1d = (args: PgeOpcodeArgs, game: Game) => {
	return gameGetRoomCollisionGridData(game, args.pge, 1, args.a)
}

const pgeOpGetcollision2u = (args: PgeOpcodeArgs, game: Game) => {
	return gameGetRoomCollisionGridData(game, args.pge, 2, -args.a)
}

const pgeOpGetcollision20 = (args: PgeOpcodeArgs, game: Game) => {
	return gameGetRoomCollisionGridData(game, args.pge, 2, 0)
}

const pgeOpGetcollision2d = (args: PgeOpcodeArgs, game: Game) => {
	return gameGetRoomCollisionGridData(game, args.pge, 2, args.a)
}

const pgeOpDoesnotcollide0u = (args: PgeOpcodeArgs, game: Game) => {
	const r = gameGetRoomCollisionGridData(game, args.pge, 0, -args.a)
	if (r & uint16Max) {
		return 0
	} else {
		return uint16Max
	}
}

const pgeOpDoesnotcollide00 = (args: PgeOpcodeArgs, game: Game) => {
	const r = gameGetRoomCollisionGridData(game, args.pge, 0, 0)
	if (r & uint16Max) {
		return 0
	} else {
		return uint16Max
	}
}

const pgeOpDoesnotcollide0d = (args: PgeOpcodeArgs, game: Game) => {
	const r = gameGetRoomCollisionGridData(game, args.pge, 0, args.a)
	if (r & uint16Max) {
		return 0
	} else {
		return uint16Max
	}
}

const pgeOpGetcollision1u = (args: PgeOpcodeArgs, game: Game) => {
	return gameGetRoomCollisionGridData(game, args.pge, 1, -args.a)
}

const pgeZorderbynumber = (pge1: LivePGE, pge2: LivePGE, comp: number, comp2: number, game: Game) => {
	return 0
	// return pge1 - pge2
}

const pgeZorderifindex = (pge1: LivePGE, pge2: LivePGE, comp: number, comp2: number, game: Game) => {
	if (pge1.index !== comp2) {
		game.queuePgeGroupSignal(pge2.index, pge1.index, comp)
		return 1
	}
	return 0
}

const pgeZorderifsamedirection = (pge1: LivePGE, pge2: LivePGE, comp: number, comp2: number, game: Game) => {
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

const pgeZorderifdifferentdirection = (pge1: LivePGE, pge2: LivePGE, comp: number, comp2: number, game: Game) => {
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

const pgeZorderbyanimyiftype = (pge1: LivePGE, pge2: LivePGE, comp: number, comp2: number, game: Game) => {
	if (pge1.initPge.objectType === comp2) {
		if (game._res.getAniData(pge1.scriptStateType)[3] === comp) {
			return 1
		}
	}
	return 0
}

const pgeZorderbyanimy = (pge1: LivePGE, pge2: LivePGE, comp: number, comp2: number, game: Game) => {
	if (pge1 !== pge2) {
		if (game._res.getAniData(pge1.scriptStateType)[3] === comp) {
			return 1
		}
	}
	return 0
}

const pgeZorderbyindex = (pge1: LivePGE, pge2: LivePGE, comp: number, comp2: number, game: Game) => {
	if (pge1 !== pge2) {
		game.queuePgeGroupSignal(pge2.index, pge1.index, comp)
		game.pge.opcodeComparisonResult1 = uint16Max
	}

	return 0
}

const pgeZorderbyobj = (pge1: LivePGE, pge2: LivePGE, comp: number, comp2: number, game: Game) => {
	if (comp === 10) {
		if (pge1.initPge.objectType === comp && pge1.life >= 0) {
			return 1
		}
	} else {
		if (pge1.initPge.objectType === comp) {
			return 1
		}
	}

	return 0
}

const pgeZorderiftypeanddifferentdirection = (pge1: LivePGE, pge2: LivePGE, comp: number, comp2: number, game: Game) => {
	if (pge1.initPge.objectType === comp) {
		if ((pge1.flags & 1) !== (pge2.flags & 1)) {
			return 1
		}
	}
	return 0
}

const pgeZorderiftypeandsamedirection = (pge1: LivePGE, pge2: LivePGE, comp: number, comp2: number, game: Game) => {
	if (pge1.initPge.objectType === comp) {
		if ((pge1.flags & 1) === (pge2.flags & 1)) {
			return 1
		}
	}
	return 0
}

const pgeZorder = (pge: LivePGE, num: number, compare: PgeZOrderComparator, unk: number, game: Game) => {
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

const getActiveRoomCollisionSlotHeadsByArea = (game: Game, area: number) => {
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

const pgeUpdatecollisionstate = (pge: LivePGE, pgeDy: number, var8: number, game: Game) => {
	let pgeCollisionSegments = pge.initPge.numberOfCollisionSegments
	if (!(pge.roomLocation & 0x80) && pge.roomLocation < ctRoomSize) {
        const gridData = game._res.level.ctData.subarray(ctHeaderSize)
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
        let whileI = 0
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
                // int8 -> uint8
				dst[dstIndex++] = src[srcIndex] & uint8Max
                // uint8 -> int8
				src[srcIndex++] = (var8 << 24 >> 24)
			}

            game.collision.nextFreeRoomCollisionGridPatchRestoreSlot = game.collision.roomCollisionGridPatchRestoreSlotPool[slotIndex + 1]
			slot1.nextPatchedRegionRestoreSlot = game.collision.activeRoomCollisionGridPatchRestoreSlots
			game.collision.activeRoomCollisionGridPatchRestoreSlots = slot1
		}
	}
	return 1
}

const pgeOpNop = (args: PgeOpcodeArgs, game: Game) => {
	return 1
}

const pgeOpPickupobject = (args:PgeOpcodeArgs, game: Game) => {
	const pge:LivePGE = gameFindOverlappingPgeByObjectType(game, args.pge, 3)
	if (pge) {
		game.queuePgeGroupSignal(args.pge.index, pge.index, args.a)
		return uint16Max
	}
	return 0
}

const pgeOpAdditemtoinventory = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	game.updatePgeInventory(runtime.livePgesByIndex[args.a], args.pge)
	args.pge.roomLocation = uint8Max
	return uint16Max
}

const pgeOpCopypge = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	const src:LivePGE = runtime.livePgesByIndex[args.a]
	const dst:LivePGE = args.pge

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

const pgeOpCanusecurrentinventoryitem = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	const pge:LivePGE = runtime.livePgesByIndex[0]
	const currentInventoryItemIndex = game.getCurrentInventoryItemIndex(pge)
	if (currentInventoryItemIndex !== uint8Max && game._res.level.pgeAllInitialStateFromFile[currentInventoryItemIndex].objectId === args.a) {
		return 1
	}

	return 0
}

const pgeOpRemoveitemfrominventory = (args: PgeOpcodeArgs, game: Game) => {
	const currentInventoryItemIndex = game.getCurrentInventoryItemIndex(args.pge)
	if (currentInventoryItemIndex !== uint8Max) {
		game.queuePgeGroupSignal(args.pge.index, currentInventoryItemIndex, args.a)
	}

	return 1
}

const pgeOUnk0x3c = (args: PgeOpcodeArgs, game: Game) => {
    return pgeZorder(args.pge, args.a, pgeZorderbyanimyiftype, args.b, game)
}

const pgeOUnk0x3d = (args: PgeOpcodeArgs, game: Game) => {
	const res = pgeZorder(args.pge, args.a, pgeZorderbyanimy, 0, game)
    return res
}

const pgeOpSetpgecounter = (args: PgeOpcodeArgs, game: Game) => {
	args.pge.counterValue = args.a
	return 1
}

const pgeOpDecpgecounter = (args: PgeOpcodeArgs, game: Game) => {
	args.pge.counterValue -= 1
	if (args.a === args.pge.counterValue) {
		return uint16Max
	} else {
		return 0
	}
}

const pgeOUnk0x40 = (args: PgeOpcodeArgs, game: Game) => {
	let pgeRoom = args.pge.roomLocation
	if (pgeRoom < 0 || pgeRoom >= ctRoomSize) {
        return 0
    }
	let colArea
	if (game.world.currentRoom === pgeRoom) {
		colArea = 1
	} else if (game.collision.activeCollisionLeftRoom === pgeRoom) {
		colArea = 0
	} else if (game.collision.activeCollisionRightRoom === pgeRoom) {
		colArea = 2
	} else {
		return 0
	}

	let gridPosX = (args.pge.posX + 8) >> 4
	let gridPosY = (args.pge.posY / 72) >> 0

	if (gridPosY >= 0 && gridPosY <= 2) {
		gridPosY *= ctGridWidth
		let _cx = args.a
		if (game.pge.currentPgeFacingIsMirrored) {
			_cx = -_cx
		}
		let _bl
		if (_cx >= 0) {
				if (_cx > ctGridWidth) {
					_cx = ctGridWidth
				}
            let var2 = new Int8Array(game._res.level.ctData.buffer)
            let var2Index = game._res.level.ctData.byteOffset + ctHeaderSize + pgeRoom * ctGridStride + gridPosY * 2 + ctGridWidth + gridPosX

	            let activeRoomSlotHeads = getActiveRoomCollisionSlotHeadsByArea(game, colArea)
	            let activeRoomSlotIndex = gridPosY + gridPosX

				let var12 = gridPosX
				--_cx

				do {
					--var12
					if (var12 < 0) {
						--colArea
						if (colArea < 0) {
	                        return 0
	                    }
						pgeRoom = game._res.level.ctData[ctLeftRoom + pgeRoom]
						if (pgeRoom < 0) {
	                        return 0
	                    }
						var12 = ctGridWidth - 1
						var2 = new Int8Array(game._res.level.ctData.buffer)
	                    var2Index = game._res.level.ctData.byteOffset + ctHeaderSize + 1 + pgeRoom * ctGridStride + gridPosY * 2 + (ctGridWidth - 1) + ctGridWidth
						activeRoomSlotHeads = getActiveRoomCollisionSlotHeadsByArea(game, colArea)
						activeRoomSlotIndex = gridPosY + ctGridWidth
					}
					--activeRoomSlotIndex
					const activeCollisionSlotHead = activeRoomSlotHeads ? activeRoomSlotHeads[activeRoomSlotIndex] : null

					if (activeCollisionSlotHead) {
						for (const colSlot of activeCollisionSlotHead) {
							if (args.pge !== colSlot.pge && (colSlot.pge.flags & 4)) {
								if (colSlot.pge.initPge.objectType === args.b) {
									return 1
								}
							}
						}
					}
				--var2Index
				if (var2[var2Index] !== 0) {
                    return 0
                }
				--_cx;
			} while (_cx >= 0);
		} else {
			_cx = -_cx
				if (_cx > ctGridWidth) {
					_cx = ctGridWidth
				}

	            let var2 = game._res.level.ctData.subarray(ctHeaderSize + 1 + pgeRoom * ctGridStride + gridPosY * 2 + ctGridWidth + gridPosX)
				let var2Index = 0
	            let activeRoomSlotHeads = getActiveRoomCollisionSlotHeadsByArea(game, colArea)
	            let activeRoomSlotIndex = gridPosY + gridPosX
	            let var12 = gridPosX
				--_cx
				do {
					++var12
						if (var12 === ctGridWidth) {
					++colArea
					if (colArea > 2) {
                        return 0
                    }
					pgeRoom = game._res.level.ctData[ctRightRoom + pgeRoom]
					if (pgeRoom < 0) {
                        return 0
                    }

						var12 = 0
						var2 = game._res.level.ctData.subarray(ctHeaderSize + 1 + pgeRoom * ctGridStride + gridPosY * 2 + ctGridWidth)
	                    var2Index = 0
						activeRoomSlotHeads = getActiveRoomCollisionSlotHeadsByArea(game, colArea)
						activeRoomSlotIndex = gridPosY - 1
					}
					activeRoomSlotIndex++
					const activeCollisionSlotHead = activeRoomSlotHeads ? activeRoomSlotHeads[activeRoomSlotIndex] : null
					if (activeCollisionSlotHead) {
						for (const colSlot of activeCollisionSlotHead) {
							if (args.pge !== colSlot.pge && (colSlot.pge.flags & 4)) {
								if (colSlot.pge.initPge.objectType === args.b) {
									return 1
								}
							}
						}
					}
				_bl = var2[var2Index]
				++var2Index
				if (_bl !== 0) {
                    return 0
                }
				--_cx
			} while (_cx >= 0)
		}
	}

	return 0
}

const pgeOpWakeuppge = (args: PgeOpcodeArgs, game: Game) => {
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

const pgeOpRemovepge = (args: PgeOpcodeArgs, game: Game) => {
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

const pgeOpKillpge = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	const ui = getGameUiState(game)
	const pge:LivePGE = args.pge
	pge.roomLocation = 0xFE
	pge.flags &= ~4
	runtime.livePgeStore.activeFrameByIndex[pge.index] = null
	if (pge.initPge.objectType === 10) {
		ui.score += 200
	}

	return uint16Max
}

const pgeOpIsincurrentroom = (args: PgeOpcodeArgs, game: Game) => {
	return (args.pge.roomLocation === game.world.currentRoom) ? 1 : 0
}

const pgeOpIsnotincurrentroom = (args: PgeOpcodeArgs, game: Game) => {
	const res = (args.pge.roomLocation === game.world.currentRoom) ? 0 : 1
    return res
}

const pgeOpScrollposy = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	let pge: LivePGE = args.pge
	args.pge.posY += args.a
	for (const inventoryItemIndex of game.getInventoryItemIndices(pge)) {
		pge = runtime.livePgesByIndex[inventoryItemIndex]
		pge.posY += args.a
	}
	return 1
}

const pgeOpPlaydefaultdeathcutscene = (args: PgeOpcodeArgs, game: Game) => {
	gameQueueDeathCutscene(game, args.a)
	return 1
}

const pgeOpIsnotfacingconrad = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	const pge:LivePGE = args.pge
	const pgeConrad:LivePGE = runtime.livePgesByIndex[0]
	if ((pge.posY / 72) >> 0 === ((pgeConrad.posY - 8) / 72) >> 0)  { // same grid cell
		if (pge.roomLocation === pgeConrad.roomLocation) {
			if (args.a === 0) {
				if (game.pge.currentPgeFacingIsMirrored) {
					if (pge.posX < pgeConrad.posX) {
						return uint16Max
					}
				} else {
					if (pge.posX > pgeConrad.posX) {
						return uint16Max
					}
				}
			} else {
				let dx;
				if (game.pge.currentPgeFacingIsMirrored) {
					dx = pgeConrad.posX - pge.posX
				} else {
					dx = pge.posX - pgeConrad.posX
				}
				if (dx > 0 && dx < args.a * 16) {
					return uint16Max
				}
			}
		} else if (args.a === 0) {
			if (!(pge.roomLocation & 0x80) && pge.roomLocation < ctRoomSize) {
				if (game.pge.currentPgeFacingIsMirrored) {
					if (pgeConrad.roomLocation === game._res.level.ctData[ctRightRoom + pge.roomLocation])
						return uint16Max
				} else {
					if (pgeConrad.roomLocation === game._res.level.ctData[ctLeftRoom + pge.roomLocation])
						return uint16Max
				}
			}
		}
	}
	return 0
}

const pgeOpIsfacingconrad = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	const pge:LivePGE = args.pge
	const pgeConrad:LivePGE = runtime.livePgesByIndex[0]
	if ((pge.posY / 72) >> 0 === ((pgeConrad.posY - 8) / 72) >> 0) {
		if (pge.roomLocation === pgeConrad.roomLocation) {
			if (args.a === 0) {
				if (game.pge.currentPgeFacingIsMirrored) {
					if (pge.posX > pgeConrad.posX) {
						return uint16Max
					}
				} else {
					if (pge.posX <= pgeConrad.posX) {
						return uint16Max
					}
				}
			} else {
				let dx;
				if (game.pge.currentPgeFacingIsMirrored) {
					dx = pge.posX - pgeConrad.posX
				} else {
					dx = pgeConrad.posX - pge.posX
				}
				if (dx > 0 && dx < args.a * 16) {
					return uint16Max
				}
			}
		} else if (args.a === 0) {
			if (!(pge.roomLocation & 0x80) && pge.roomLocation < ctRoomSize) {
				if (game.pge.currentPgeFacingIsMirrored) {
					if (pgeConrad.roomLocation === game._res.level.ctData[ctLeftRoom + pge.roomLocation])
						return uint16Max
				} else {
					if (pgeConrad.roomLocation === game._res.level.ctData[ctRightRoom + pge.roomLocation])
						return uint16Max
				}
			}

		}
	}

	return 0
}

const pgeOpCollides4u = (args: PgeOpcodeArgs, game: Game) => {
	return gameGetRoomCollisionGridData(game, args.pge, 4, -args.a) !== 0 ? uint16Max : 0
}

const pgeOpDoesnotcollide4u = (args: PgeOpcodeArgs, game: Game) => {
	return gameGetRoomCollisionGridData(game, args.pge, 4, -args.a) === 0 ? uint16Max : 0
}

const pgeOpIsbelowconrad = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	const pge = args.pge
	const conrad = runtime.livePgesByIndex[0]
	if (conrad.roomLocation === pge.roomLocation) {
		if ((((conrad.posY - 8) / 72) >> 0) < ((pge.posY / 72) >> 0)) {
			return uint16Max
		}
	} else if (pge.roomLocation < ctRoomSize) {
		if (conrad.roomLocation === game._res.level.ctData[ctUpRoom + pge.roomLocation]) {
			return uint16Max
		}
	}
	return 0
}

const pgeOpIsaboveconrad = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	const pge = args.pge
	const conrad = runtime.livePgesByIndex[0]
	if (conrad.roomLocation === pge.roomLocation) {
		if ((((conrad.posY - 8) / 72) >> 0) > ((pge.posY / 72) >> 0)) {
			return uint16Max
		}
	} else if (pge.roomLocation < ctRoomSize) {
		if (conrad.roomLocation === game._res.level.ctData[ctDownRoom + pge.roomLocation]) {
			return uint16Max
		}
	}
	return 0
}

const pgeOpCollides2u1u = (args: PgeOpcodeArgs, game: Game) => {
	if (gameGetRoomCollisionGridData(game, args.pge, 1, -args.a) === 0) {
		if (gameGetRoomCollisionGridData(game, args.pge, 2, -(args.a + 1)) & uint16Max) {
			return uint16Max
		}
	}
	return 0
}

const pgeOpDisplaytext = (args: PgeOpcodeArgs, game: Game) => {
	const world = getGameWorldState(game)
	world.textToDisplay = args.a
	return uint16Max
}

const pgeOUnk0x7c = (args: PgeOpcodeArgs, game: Game) => {
	let pge:LivePGE = gameFindOverlappingPgeByObjectType(game, args.pge, 3)
	if (pge === null) {
		pge = gameFindOverlappingPgeByObjectType(game, args.pge, 5)
		if (pge == null) {
			pge = gameFindOverlappingPgeByObjectType(game, args.pge, 9)
			if (pge === null) {
				pge = gameFindOverlappingPgeByObjectType(game, args.pge, uint16Max)
			}
		}
	}
	if (pge !== null) {
		game.queuePgeGroupSignal(args.pge.index, pge.index, args.a)
	}
	return 0
}

const pgeOpPlaysound = (args: PgeOpcodeArgs, game: Game) => {
	const sfxId = args.a & uint8Max
	const softVol = args.a >> 8
	game.playSound(sfxId, softVol)
	return uint16Max
}

const pgeOUnk0x7e = (args: PgeOpcodeArgs, game: Game) => {
	game.pge.opcodeComparisonResult1 = 0
	pgeZorder(args.pge, args.a, pgeZorderbyindex, 0, game)
	return game.pge.opcodeComparisonResult1
}

const pgeOpHasinventoryitem = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	for (const inventoryItemIndex of game.getInventoryItemIndices(runtime.livePgesByIndex[0])) {
		const pge = runtime.livePgesByIndex[inventoryItemIndex]
		if (pge.initPge.objectId === args.a) {
			return uint16Max
		}
	}
	return 0
}

const pgeOpUpdategroup0 = (args: PgeOpcodeArgs, game: Game) => {
	const pge: LivePGE = args.pge
	game.queuePgeGroupSignal(pge.index, pge.initPge.counterValues[0], args.a)
	return uint16Max;
}

const pgeOpUpdategroup1 = (args: PgeOpcodeArgs, game: Game) => {
	const pge:LivePGE = args.pge
	game.queuePgeGroupSignal(pge.index, pge.initPge.counterValues[1], args.a)
	return uint16Max
}

const pgeOpUpdategroup2 = (args: PgeOpcodeArgs, game: Game) => {
	const pge:LivePGE = args.pge
	game.queuePgeGroupSignal(pge.index, pge.initPge.counterValues[2], args.a)
	return uint16Max
}

const pgeOpUpdategroup3 = (args: PgeOpcodeArgs, game: Game) => {
	const pge:LivePGE = args.pge
	game.queuePgeGroupSignal(pge.index, pge.initPge.counterValues[3], args.a)
	return uint16Max
}

const pgeOpIspgedead = (args: PgeOpcodeArgs, game: Game) => {
	const ui = getGameUiState(game)
	const pge:LivePGE = args.pge
	if (pge.life <= 0) {
		if (pge.initPge.objectType === 10) {
			ui.score += 100
		}
		return 1
	}

	return 0
}

const pgeOpCollides1u2o = (args: PgeOpcodeArgs, game: Game) => {
	if (gameGetRoomCollisionGridData(game, args.pge, 1, args.a - 1) & uint16Max) {
		if (gameGetRoomCollisionGridData(game, args.pge, 2, args.a) === 0) {
			return uint16Max
		}
	}

	return 0
}

const pgeOpCollides1u1o = (args: PgeOpcodeArgs, game: Game) => {
	if (gameGetRoomCollisionGridData(game, args.pge, 1, args.a - 1) & uint16Max) {
		if (gameGetRoomCollisionGridData(game, args.pge, 1, args.a) === 0) {
			return uint16Max
		}
	}

	return 0
}

const pgeOpCollides1o1u = (args: PgeOpcodeArgs, game: Game) => {
	if (gameGetRoomCollisionGridData(game, args.pge, 1, args.a - 1) === 0) {
		if (gameGetRoomCollisionGridData(game, args.pge, 1, args.a) & uint16Max) {
			return uint16Max
		}
	}

	return 0
}

const pgeOUnk0x2b = (args: PgeOpcodeArgs, game: Game) => {
	return pgeZorder(args.pge, args.a, pgeZorderiftypeanddifferentdirection, 0, game)
}

const pgeOUnk0x2c = (args: PgeOpcodeArgs, game: Game) => {
	return pgeZorder(args.pge, args.a, pgeZorderiftypeandsamedirection, 0, game)
}

const pgeOUnk0x2d = (args: PgeOpcodeArgs, game: Game) => {
	return pgeZorder(args.pge, args.a, pgeZorderbyobj, 0, game) ^ 1
}

const pgeOpDoesnotcollide2d = (args: PgeOpcodeArgs, game: Game) => {
	const r = gameGetRoomCollisionGridData(game, args.pge, 2, args.a)
	if (r & uint16Max) {
		return 0;
	} else {
		return uint16Max;
	}
}

const pgeOpCollides0o0d = (args: PgeOpcodeArgs, game: Game) => {
	if (gameGetRoomCollisionGridData(game, args.pge, 0, args.a) & uint16Max) {
		if (gameGetRoomCollisionGridData(game, args.pge, 0, args.a + 1) === 0) {
			if (gameGetRoomCollisionGridData(game, args.pge, -1, args.a) === 0) {
				return uint16Max
			}
		}
	}

	return 0
}

const pgeOpCollides2o2d = (args: PgeOpcodeArgs, game: Game) => {
	if (gameGetRoomCollisionGridData(game, args.pge, 2, args.a) & uint16Max) {
		if (gameGetRoomCollisionGridData(game, args.pge, 2, args.a + 1) === 0) {
			if (gameGetRoomCollisionGridData(game, args.pge, 1, args.a) === 0) {
				return uint16Max
			}
		}
	}

	return 0
}

const pgeOpCollides0o0u = (args: PgeOpcodeArgs, game: Game) => {
	if (gameGetRoomCollisionGridData(game, args.pge, 0, args.a) & uint16Max) {
		if (gameGetRoomCollisionGridData(game, args.pge, 0, args.a - 1) === 0) {
			if (gameGetRoomCollisionGridData(game, args.pge, -1, args.a) === 0) {
				return uint16Max
			}
		}
	}

	return 0
}

const pgeOpCollides2o2u = (args: PgeOpcodeArgs, game: Game) => {
	if (gameGetRoomCollisionGridData(game, args.pge, 2, args.a) & uint16Max) {
		if (gameGetRoomCollisionGridData(game, args.pge, 2, args.a - 1) === 0) {
			if (gameGetRoomCollisionGridData(game, args.pge, 1, args.a) === 0) {
				return uint16Max
			}
		}
	}

	return 0
}

const pgeOpCollides2u2o = (args: PgeOpcodeArgs, game: Game) => {
	if (gameGetRoomCollisionGridData(game, args.pge, 2, args.a - 1) & uint16Max) {
		if (gameGetRoomCollisionGridData(game, args.pge, 2, args.a) === 0) {
			if (gameGetRoomCollisionGridData(game, args.pge, 1, args.a - 1) === 0) {
                return uint16Max
			}
		}
	}

	return 0
}

const pgeOpIsingroup = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	for (const pendingGroup of runtime.pendingSignalsByTargetPgeIndex.get(args.pge.index) ?? []) {
		if (pendingGroup.signalId === args.a) {
			return uint16Max
		}
	}

	return 0
}

const pgeOUnk0x50 = (args: PgeOpcodeArgs, game: Game) => {
	return pgeZorder(args.pge, args.a, pgeZorderbyobj, 0, game)
}

const pgeOUnk0x52 = (args: PgeOpcodeArgs, game: Game) => {
	return colDetecthit(args.pge, args.a, args.b, colDetecthitcallback4, colDetecthitcallback1, 0, 0, game)
}

const pgeOUnk0x53 = (args: PgeOpcodeArgs, game: Game) => {
	return colDetecthit(args.pge, args.a, args.b, colDetecthitcallback5, colDetecthitcallback1, 0, 0, game)
}

const pgeOpIspgenear = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	if (gameFindOverlappingPgeByObjectType(game, runtime.livePgesByIndex[0], args.a) !== null) {
		return 1
	}
	return 0
}

const pgeOpSetlife = (args: PgeOpcodeArgs, game: Game) => {
	args.pge.life = args.a
	return 1
}

const pgeOpInclife = (args: PgeOpcodeArgs, game: Game) => {
	args.pge.life += args.a
	return 1
}

const pgeOpSetpgedefaultanim = (args: PgeOpcodeArgs, game: Game) => {
	const world = getGameWorldState(game)
	assert(!(args.a < 0 || args.a >= 4), `Assertion failed: ${args.a} >= 0 && ${args.a} < 4`)

	const r = args.pge.initPge.counterValues[args.a]
	args.pge.roomLocation = r
	if (r === 1) {
		// this happens after death tower, on earth, when Conrad passes
		// by the first policeman who's about to shoot him in the back
		gameRequestMapReload(game, world.currentRoom)
	}
	gameInitializePgeDefaultAnimation(game, args.pge)
	return 1
}

const pgeOUnk0x34 = (args: PgeOpcodeArgs, game: Game) => {
	const mask = (game.pge.currentPgeInputMask & 0xF) | Game._modifierKeyMasks[0]
	if (mask === game.pge.currentPgeInputMask) {
		if (gameGetRoomCollisionGridData(game, args.pge, 2, -args.a) === 0) {
			return uint16Max
		}
	}

	return 0
}

const pgeOpIsinpmod = (args: PgeOpcodeArgs, game: Game) => {
    assert(!(args.a >= 3), `Assertion failed: ${args.a} < 3`)
	const mask = Game._modifierKeyMasks[args.a]
	if (mask === game.pge.currentPgeInputMask) {
		return uint16Max
	} else {
		return 0
	}
}

const pgeOpSetcollisionstate1 = (args: PgeOpcodeArgs, game: Game) => {
	return pgeUpdatecollisionstate(args.pge, args.a, 1, game)
}

const pgeOpSetcollisionstate0 = (args: PgeOpcodeArgs, game: Game) => {
	return pgeUpdatecollisionstate(args.pge, args.a, 0, game)
}

const pgeIsingroup = (pgeDst: LivePGE, signalId: number, counter: number, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	assert(!(counter < 1 || counter > 4), `Assertion failed: ${counter} >= 1 1 && ${counter} <= 4`)

	const c = pgeDst.initPge.counterValues[counter - 1]
	for (const pendingGroup of runtime.pendingSignalsByTargetPgeIndex.get(pgeDst.index) ?? []) {
		if (pendingGroup.signalId === signalId && pendingGroup.senderPgeIndex === c) {
			return 1
		}
	}
	return 0
}

const pgeOpIsingroup1 = (args: PgeOpcodeArgs, game: Game) => {
	return pgeIsingroup(args.pge, args.a, 1, game)
}

const pgeOpIsingroup2 = (args: PgeOpcodeArgs, game: Game) => {
	return pgeIsingroup(args.pge, args.a, 2, game)
}

const pgeOpIsingroup3 = (args: PgeOpcodeArgs, game: Game) => {
	return pgeIsingroup(args.pge, args.a, 3, game)
}

const pgeOpIsingroup4 = (args: PgeOpcodeArgs, game: Game) => {
	return pgeIsingroup(args.pge, args.a, 4, game)
}

const pgeOpRemovepgeifnotnear = (args: PgeOpcodeArgs, game: Game) => {
    const world = getGameWorldState(game)
    const runtime = getRuntimeRegistryState(game)
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

	const pge: LivePGE = args.pge
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
	if (pge.roomLocation === game._res.level.ctData[ctUpRoom + world.currentRoom]) {
        return skipPge()
    }
	if (pge.roomLocation === game._res.level.ctData[ctDownRoom + world.currentRoom]) {
        return skipPge()
    }
	if (pge.roomLocation === game._res.level.ctData[ctRightRoom + world.currentRoom]) {
        return skipPge()
    }
	if (pge.roomLocation === game._res.level.ctData[ctLeftRoom + world.currentRoom]) {
        return skipPge()
    }

    return killPge()
}

const pgeOpLoadpgecounter = (args: PgeOpcodeArgs, game: Game) => {
	args.pge.counterValue = args.pge.initPge.counterValues[args.a]
	return 1
}

const pgeOUnk0x45 = (args: PgeOpcodeArgs, game: Game) => {
	return pgeZorder(args.pge, args.a, pgeZorderbynumber, 0, game)
}

const pgeOUnk0x46 = (args: PgeOpcodeArgs, game: Game) => {
	game.pge.opcodeComparisonResult1 = 0
	pgeZorder(args.pge, args.a, pgeZorderifdifferentdirection, 0, game)
	return game.pge.opcodeComparisonResult1
}

const pgeOUnk0x47 = (args: PgeOpcodeArgs, game: Game) => {
	game.pge.opcodeComparisonResult2 = 0
	pgeZorder(args.pge, args.a, pgeZorderifsamedirection, 0, game)
	return game.pge.opcodeComparisonResult2
}

const pgeOUnk0x48 = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	const pge:LivePGE = gameFindOverlappingPgeByObjectType(game, runtime.livePgesByIndex[0], args.pge.initPge.counterValues[0])
	if (pge && pge.life === args.pge.life) {
		game.queuePgeGroupSignal(args.pge.index, pge.index, args.a)
		return 1
	}
	return 0
}

const pgeOUnk0x49 = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	return pgeZorder(runtime.livePgesByIndex[0], args.a, pgeZorderifindex, args.pge.initPge.counterValues[0], game)
}

const pgeOUnk0x4a = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	const pge: LivePGE = args.pge
	pge.roomLocation = 0xFE
	pge.flags &= ~4
	runtime.livePgeStore.activeFrameByIndex[pge.index] = null
	const invPge:LivePGE = game.findInventoryItemBeforePge(runtime.livePgesByIndex[args.a], pge)
	if (invPge === runtime.livePgesByIndex[args.a]) {
		if (pge.index !== game.getCurrentInventoryItemIndex(invPge)) {
			return 1
		}
	} else {
		if (pge.index !== game.getNextInventoryItemIndex(runtime.livePgesByIndex[args.a], invPge.index)) {
			return 1
		}
	}
	game.removePgeFromInventory(invPge, pge, runtime.livePgesByIndex[args.a])
	return 1
}

const pgeOUnk0x7f = (args: PgeOpcodeArgs, game: Game) => {
	const _si: LivePGE = args.pge
	let var4 = _si.collisionSlot
	let var2 = _si.index

	while (var4 !== uint16Max) {
		const slotBucket = game.collision.dynamicPgeCollisionSlotsByPosition.get(var4)
		if (!slotBucket) {
			return 1
		}
		let nextCollisionGridPositionIndex = uint16Max
		for (const slot of slotBucket) {
			if (slot.pge !== args.pge) {
				if (slot.pge.initPge.objectType === 3 && var2 !== slot.pge.unkF) {
					return 0
				}
			}
			if (slot.pge === args.pge) {
				nextCollisionGridPositionIndex = slot.index
			}
		}
		var4 = nextCollisionGridPositionIndex
	}

	return uint16Max;
}

const pgeOUnk0x6a = (args: PgeOpcodeArgs, game: Game) => {
	let _si: LivePGE = args.pge
	let pgeRoom = _si.roomLocation
	if (pgeRoom < 0 || pgeRoom >= ctRoomSize) {
		return 0
	}
	let _bl
	let colArea = 0
	let ctData:Int8Array = null
	let ctIndex = 0
	if (game.world.currentRoom === pgeRoom) {
		colArea = 1
	} else if (game.collision.activeCollisionLeftRoom === pgeRoom) {
		colArea = 0
	} else if (game.collision.activeCollisionRightRoom === pgeRoom) {
		colArea = 2
	} else {
		return 0
	}
	let gridPosX = (_si.posX + 8) >> 4
	let gridPosY = (_si.posY / 72) >> 0
	if (gridPosY >= 0 && gridPosY <= 2) {
		gridPosY *= ctGridWidth
		let _cx = args.a
		if (game.pge.currentPgeFacingIsMirrored) {
			_cx = -_cx
		}
		if (_cx >= 0) {
				if (_cx > ctGridWidth) {
					_cx = ctGridWidth
				}

				ctData = game._res.level.ctData
				ctIndex = ctHeaderSize + pgeRoom * ctGridStride + gridPosY * 2 + ctGridWidth + gridPosX
				let activeRoomSlotHeads = getActiveRoomCollisionSlotHeadsByArea(game, colArea)
				let activeRoomSlotIndex = gridPosY + gridPosX + 1
				++ctIndex
				let varA = gridPosX
				do {
				--varA
				if (varA < 0) {
					--colArea
					if (colArea < 0) {
						return 0
					}
					pgeRoom = game._res.level.ctData[ctLeftRoom + pgeRoom]
					if (pgeRoom < 0) {
							return 0
						}
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
								if (args.pge !== _si && (_si.flags & 4) && _si.life >= 0) {
									if (_si.initPge.objectType === 1 || _si.initPge.objectType === 10) {
										return 1
									}
								}
							}
						}
					--ctIndex
					if (ctData[ctIndex] !== 0) {
						return 0
				}
				--_cx
			} while (_cx >= 0)
		} else {
			_cx = -_cx
				if (_cx > ctGridWidth) {
					_cx = ctGridWidth
				}

				ctData = game._res.level.ctData
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
						if (colArea > 2) {
							return 0
							}
							pgeRoom = game._res.level.ctData[ctRightRoom + pgeRoom]
						if (pgeRoom < 0) {
							return 0
							}
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
								if (args.pge !== _si && (_si.flags & 4) && _si.life >= 0) {
									if (_si.initPge.objectType === 1 || _si.initPge.objectType === 10) {
										return 1
									}
								}
							}
						}
					_bl = ctData[ctIndex] << 24 >> 24
				++ctIndex
				if (_bl !== 0) {
					return 0
				}
				--_cx
			} while (_cx >= 0)
		}
	}

	return 0
}

const pgeOpIsingroupslice = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	const pge:LivePGE = args.pge
	if (args.a === 0) {
		for (const pendingGroup of runtime.pendingSignalsByTargetPgeIndex.get(pge.index) ?? []) {
			if (pendingGroup.signalId === 1 || pendingGroup.signalId === 2) {
				return 1
			}
		}
	} else {
		for (const pendingGroup of runtime.pendingSignalsByTargetPgeIndex.get(pge.index) ?? []) {
			if (pendingGroup.signalId === 3 || pendingGroup.signalId === 4) {
				return 1
			}
		}
	}

	return 0
}

const pgeOUnk0x5f = (args: PgeOpcodeArgs, game: Game) => {
	const pge:LivePGE = args.pge

	let pgeRoom = pge.roomLocation
	if (pgeRoom < 0 || pgeRoom >= ctRoomSize) {
        return 0
    }

	let dx
	let _cx = pge.initPge.counterValues[0]
	if (_cx <= 0) {
		dx = 1
		_cx = -_cx
	} else {
		dx = -1
	}
	if (game.pge.currentPgeFacingIsMirrored) {
		dx = -dx
	}
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
			pgeRoom = game._res.level.ctData[ctLeftRoom + pgeRoom]
			if (pgeRoom < 0 || pgeRoom >= ctRoomSize) {
                return 0
            }
				gridPosX += ctGridWidth
			} else if (gridPosX > ctGridWidth - 1) {
			pgeRoom = game._res.level.ctData[ctRightRoom + pgeRoom]
			if (pgeRoom < 0 || pgeRoom >= ctRoomSize) {
                return 0
            }
				gridPosX -= ctGridWidth
		}
		gridPosX += dx
		++gridPosY
	} while (gridPosY <= _cx)

	return 0
}

const pgeOpFindandcopypge = (args: PgeOpcodeArgs, game: Game) => {
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

const pgeOpIsinrandomrange = (args: PgeOpcodeArgs, game: Game) => {
	let n = args.a & uint16Max
	if (n !== 0) {
		const randomNumber = typeof (game as unknown as { getRandomNumber?: () => number }).getRandomNumber === 'function'
			? (game as unknown as { getRandomNumber: () => number }).getRandomNumber()
			: gameGetRandomNumber(game)
		if ((randomNumber % n) === 0) {
			return 1
		}
	}

	return 0
}

const pgeOUnk0x62 = (args: PgeOpcodeArgs, game: Game) => {
	return colDetecthit(args.pge, args.a, args.b, colDetecthitcallback3, colDetecthitcallback1, 0, -1, game)
}

const pgeOUnk0x63 = (args: PgeOpcodeArgs, game: Game) => {
	return colDetecthit(args.pge, args.a, args.b, colDetecthitcallback2, colDetecthitcallback1, 0, -1, game)
}

const pgeOUnk0x64 = (args: PgeOpcodeArgs, game: Game) => {
	return colDetectgunhit(args.pge, args.a, args.b, colDetectgunhitcallback3, colDetectgunhitcallback1, 1, -1, game)
}

const pgeOpAddtocredits = (args: PgeOpcodeArgs, game: Game) => {
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

const pgeOpSubfromcredits = (args: PgeOpcodeArgs, game: Game) => {
	game.world.credits -= args.a;
	return game.world.credits >= 0 ? 1: 0
}

const pgeOUnk0x67 = (args: PgeOpcodeArgs, game: Game) => {
	if (gameGetRoomCollisionGridData(game, args.pge, 1, -args.a) & 2) {
		return uint16Max
	}

	return 0
}

const pgeOpSetcollisionstate2 = (args: PgeOpcodeArgs, game: Game) => {
	return pgeUpdatecollisionstate(args.pge, args.a, 2, game)
}

const pgeOpSavestate = (args: PgeOpcodeArgs, game: Game) => {
	const session = getGameSessionState(game)
	gameMarkSaveStateCompleted(game)
	game.saveGameState(kIngameSaveSlot)
	if (session.validSaveState && globalGameOptions.playGamesavedSound) {
		game.playSound(68, 0)
	}
	return uint16Max
}

const pgeOpIscollidingobject = (args: PgeOpcodeArgs, game: Game) => {
	const { obj } = gameFindFirstMatchingCollidingObject(game, args.pge, 3, uint8Max, uint8Max)
	if (obj === args.a) {
		return 1
	} else {
		return 0
	}
}

const pgeIstoggleable = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	for (const pendingGroup of runtime.pendingSignalsByTargetPgeIndex.get(args.pge.index) ?? []) {
		if (args.a === 0) {
			if (pendingGroup.signalId === 1 || pendingGroup.signalId === 2) {
				return 1
			}
		} else if (pendingGroup.signalId === 3 || pendingGroup.signalId === 4) {
			return 1
		}
	}
	return 0
}

const pgeOUnk0x6c = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	const pge = gameFindOverlappingPgeByObjectType(game, runtime.livePgesByIndex[0], args.pge.initPge.counterValues[0])
	if (pge && pge.life <= args.pge.life) {
		game.queuePgeGroupSignal(args.pge.index, pge.index, args.a)
		return 1
	}
	return 0
}

// elevator
const pgeOUnk0x6e = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	for (const pendingGroup of runtime.pendingSignalsByTargetPgeIndex.get(args.pge.index) ?? []) {
		if (pendingGroup.signalId === args.a) {
			game.updatePgeInventory(runtime.livePgesByIndex[pendingGroup.senderPgeIndex], args.pge)
			return uint16Max
		}
	}
	return 0
}

const pgeOUnk0x6f = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	const pge:LivePGE = args.pge
	for (const pendingGroup of runtime.pendingSignalsByTargetPgeIndex.get(pge.index) ?? []) {
		if (args.a === pendingGroup.signalId) {
			game.queuePgeGroupSignal(pge.index, pendingGroup.senderPgeIndex, 0xC)
			return 1;
		}
	}

	return 0
}

const pgeOUnk0x70 = (args: PgeOpcodeArgs, game: Game) => {
	for (const inventoryItemIndex of game.getInventoryItemIndices(args.pge)) {
		game.queuePgeGroupSignal(args.pge.index, inventoryItemIndex, args.a)
	}
	return 1
}

// elevator
const pgeOUnk0x71 = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	for (const pendingGroup of runtime.pendingSignalsByTargetPgeIndex.get(args.pge.index) ?? []) {
		if (pendingGroup.signalId === args.a) {
			game.reorderPgeInventory(args.pge)
			return 1
		}
	}
	return 0
}

const pgeOUnk0x72 = (args: PgeOpcodeArgs, game: Game) => {
	const roomCollisionGrid = new Int8Array(
		game._res.level.ctData.buffer,
		game._res.level.ctData.byteOffset + ctHeaderSize + args.pge.roomLocation * ctGridStride,
		ctGridStride
	)
	const pgeCollisionGridY = (((args.pge.posY / 36) >> 0) & ~1) + args.a
	const pgeCollisionGridX = (args.pge.posX + 8) >> 4
	const patchedGridOffset = pgeCollisionGridY * ctGridWidth + pgeCollisionGridX

	let restoreSlot = game.collision.activeRoomCollisionGridPatchRestoreSlots
	let count = 256
	while (restoreSlot && count !== 0) {
		if (
			restoreSlot.patchedGridDataView.buffer === roomCollisionGrid.buffer &&
			restoreSlot.patchedGridDataView.byteOffset === roomCollisionGrid.byteOffset + patchedGridOffset
		) {
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

const pgeOUnk0x73 = (args: PgeOpcodeArgs, game: Game) => {
	const pge:LivePGE = gameFindOverlappingPgeByObjectType(game, args.pge, args.a)
	if (pge !== null) {
		game.updatePgeInventory(pge, args.pge)
		return uint16Max
	}
	return 0
}

const pgeOpSetlifecounter = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	runtime.livePgesByIndex[args.a].life = args.pge.initPge.counterValues[0]
	return 1
}

const pgeOpDeclifecounter = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	args.pge.life = runtime.livePgesByIndex[args.a].life - 1
	return 1
}

const pgeOpPlaycutscene = (args: PgeOpcodeArgs, game: Game) => {
	const world = getGameWorldState(game)
	if (world.deathCutsceneCounter === 0) {
		game._cut.setId(args.a)
	}

	return 1
}

const pgeOpCompareunkvar = (args: PgeOpcodeArgs, game: Game) => {
	return args.a === -1 ? 1 : 0
}

const pgeOpPlaydeathcutscene = (args: PgeOpcodeArgs, game: Game) => {
	gameQueueDeathCutscene(game, args.pge.initPge.counterValues[3] + 1, args.a)
	return 1
}

const pgeOUnk0x5d = (args: PgeOpcodeArgs, game: Game) => {
	return colDetecthit(args.pge, args.a, args.b, colDetecthitcallback4, colDetecthitcallback6, 0, 0, game)
}

const pgeOUnk0x5e = (args: PgeOpcodeArgs, game: Game) => {
	return colDetecthit(args.pge, args.a, args.b, colDetecthitcallback5, colDetecthitcallback6, 0, 0, game)
}

const pgeOUnk0x86 = (args:PgeOpcodeArgs, game: Game) => {
	return colDetectgunhit(args.pge, args.a, args.b, colDetectgunhitcallback2, colDetectgunhitcallback1, 1, 0, game)
}

const pgeOpPlaysoundgroup = (args: PgeOpcodeArgs, game: Game) => {
    assert(!(args.a >= 4), `Assertion failed: ${args.a} < 4`)
	const c = args.pge.initPge.counterValues[args.a] & uint16Max
	const sfxId = c & uint8Max
	const softVol = c >> 8
	game.playSound(sfxId, softVol)
	return uint16Max
}

const pgeOpAdjustpos = (args: PgeOpcodeArgs, game: Game) => {
	const pge: LivePGE = args.pge
	pge.posX &= 0xFFF0
	if (pge.posY !== 70 && pge.posY != 142 && pge.posY !== 214) {
		pge.posY = (((pge.posY / 72) >> 0) + 1) * 72 - 2
	}

	return uint16Max
}

const pgeOpSetpgeposx = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	const ownerPgeIndex = args.pge.unkF
	if (ownerPgeIndex !== uint8Max) {
		args.pge.posX = runtime.livePgesByIndex[ownerPgeIndex].posX
	}
	return uint16Max
}

const pgeOpSetpgeposmodx = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	const ownerPgeIndex = args.pge.unkF
	if (ownerPgeIndex !== uint8Max) {
		let dx = runtime.livePgesByIndex[ownerPgeIndex].posX % 256
		if (dx >= args.pge.posX) {
			dx -= args.pge.posX
		}
		args.pge.posX += dx
	}
	return uint16Max
}

// taxi and teleporter
const pgeOpChangeroom = (args: PgeOpcodeArgs, game: Game) => {
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
			const objectNode = game._res.level.objectNodesMap[destinationPge.initPge.scriptNodeIndex]
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

const pgeOpChangelevel = (args: PgeOpcodeArgs, game: Game) => {
	const world = getGameWorldState(game)
	gameSetCurrentLevel(game, args.a - 1)
	return world.currentLevel
}

const pgeOpShakescreen = (args: PgeOpcodeArgs, game: Game) => {
	game._vid.setShakeOffset(gameGetRandomNumber(game) & 7)
	return uint16Max
}

const pgeOpSettempvar1 = (args: PgeOpcodeArgs, game: Game) => {
	getGamePgeState(game).opcodeTempVar1 = args.a

	return uint16Max
}

const pgeOpIstempvar1set = (args: PgeOpcodeArgs, game: Game) => {
	if (getGamePgeState(game).opcodeTempVar1 !== args.a) {
		return 0
	} else {
		return uint16Max
	}
}

const opcodeInventoryItemSnapshot = (args: PgeOpcodeArgs, game: Game) => ({
	currentInventoryItem: game.getCurrentInventoryItemIndex(args.pge)
})

const opcodeCounterSnapshot = (args: PgeOpcodeArgs) => ({
	counter: args.pge.counterValue
})

const opcodeLifeSnapshot = (args: PgeOpcodeArgs) => ({
	life: args.pge.life
})

const opcodeRoomPosSnapshot = (args: PgeOpcodeArgs) => ({
	room: args.pge.roomLocation,
	posX: args.pge.posX,
	posY: args.pge.posY,
})

const opcodePgeStateSnapshot = (args: PgeOpcodeArgs) => ({
	room: args.pge.roomLocation,
	posX: args.pge.posX,
	posY: args.pge.posY,
	life: args.pge.life,
	flags: args.pge.flags,
	collision: args.pge.collisionSlot,
	state: args.pge.scriptStateType,
	entry: args.pge.firstScriptEntryIndex,
	anim: args.pge.animSeq,
})

const opcodeCreditsSnapshot = (_args: PgeOpcodeArgs, game: Game) => {
	const world = getGameWorldState(game)
	return { credits: world.credits }
}

const opcodeTempVarSnapshot = (_args: PgeOpcodeArgs, game: Game) => ({
	tempVar1: getGamePgeState(game).opcodeTempVar1
})

const opcodeCutsceneSnapshot = (_args: PgeOpcodeArgs, game: Game) => {
	const world = getGameWorldState(game)
	const cutsceneId = typeof game._cut.getId === 'function' ? game._cut.getId() : -1
	return {
		cutsceneId,
		deathCutsceneCounter: world.deathCutsceneCounter,
	}
}

const opcodeTargetActiveSnapshot = (counterIndex: number) => (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	const targetIndex = args.pge.initPge.counterValues[counterIndex]
	const targetPge = targetIndex >= 0 ? runtime.livePgesByIndex[targetIndex] : null
	return {
		target: targetIndex,
		targetFlags: targetPge?.flags ?? -1,
		targetActive: Boolean(targetPge && (targetPge.flags & 4)),
	}
}

const opcodeGroupSignalSnapshot = (counterIndex: number) => (args: PgeOpcodeArgs) => ({
	target: args.pge.initPge.counterValues[counterIndex],
	signal: args.a,
})

const opcodeSoundSnapshot = (sfxId: number, softVol: number) => ({
	sfxId,
	softVol,
})

const _pgeOpcodetable = [
    null,
    pgeOpIsinpup, // this.pge_op_isInpUp.bind(this),
    pgeOpIsinpbackward, // this.pge_op_isInpBackward.bind(this),
    pgeOpIsinpdown, // this.pge_op_isInpDown.bind(this),
    // /* 0x04 */
    pgeOpIsinpforward, // this.pge_op_isInpForward.bind(this),
    pgeOpIsinpupmod, // this.pge_op_isInpUpMod.bind(this),
    pgeOpIsinpbackwardmod, // this.pge_op_isInpBackwardMod.bind(this),
    pgeOpIsinpdownmod, // this.pge_op_isInpDownMod.bind(this),
    // /* 0x08 */
    pgeOpIsinpforwardmod, // this.pge_op_isInpForwardMod.bind(this),
    pgeOpIsinpidle, // this.pge_op_isInpIdle.bind(this),
    pgeOpIsinpnomod, // this.pge_op_isInpNoMod.bind(this),
    pgeOpGetcollision0u, // this.pge_op_getCollision0u.bind(this),
    // /* 0x0C */
    pgeOpGetcollision00, // this.pge_op_getCollision00.bind(this),
    pgeOpGetcollision0d, // this.pge_op_getCollision0d.bind(this),
    pgeOpGetcollision1u, // this.pge_op_getCollision1u.bind(this),
    pgeOpGetcollision10, // this.pge_op_getCollision10.bind(this),
    // /* 0x10 */
    pgeOpGetcollision1d, // this.pge_op_getCollision1d.bind(this),
    pgeOpGetcollision2u, // this.pge_op_getCollision2u.bind(this),
    pgeOpGetcollision20, // this.pge_op_getCollision20.bind(this),
    pgeOpGetcollision2d, // this.pge_op_getCollision2d.bind(this),
    // /* 0x14 */
    pgeOpDoesnotcollide0u, // this.pge_op_doesNotCollide0u.bind(this),
    pgeOpDoesnotcollide00, // this.pge_op_doesNotCollide00.bind(this),
    pgeOpDoesnotcollide0d, // this.pge_op_doesNotCollide0d.bind(this),
    pgeOpDoesnotcollide1u, // this.pge_op_doesNotCollide1u.bind(this),
    // /* 0x18 */
    pgeOpDoesnotcollide10, // this.pge_op_doesNotCollide10.bind(this),
    pgeOpDoesnotcollide1d, // this.pge_op_doesNotCollide1d.bind(this),
    pgeOpDoesnotcollide2u, // this.pge_op_doesNotCollide2u.bind(this),
    pgeOpDoesnotcollide20, // this.pge_op_doesNotCollide20.bind(this),
    // /* 0x1C */
    pgeOpDoesnotcollide2d, // this.pge_op_doesNotCollide2d.bind(this),
    pgeOpCollides0o0d, // this.pge_op_collides0o0d.bind(this),
    pgeOpCollides2o2d, // this.pge_op_collides2o2d.bind(this),
    pgeOpCollides0o0u, // this.pge_op_collides0o0u.bind(this),
    // /* 0x20 */
    pgeOpCollides2o2u, // this.pge_op_collides2o2u.bind(this),
    pgeOpCollides2u2o, // this.pge_op_collides2u2o.bind(this),
    pgeOpIsingroup, // this.pge_op_isInGroup.bind(this),
    withOpcodeDebug('0x23', 'updateGroup0', pgeOpUpdategroup0, { after: opcodeGroupSignalSnapshot(0) }), // this.pge_op_updateGroup0.bind(this),
    // /* 0x24 */
    withOpcodeDebug('0x24', 'updateGroup1', pgeOpUpdategroup1, { after: opcodeGroupSignalSnapshot(1) }), // this.pge_op_updateGroup1.bind(this),
    withOpcodeDebug('0x25', 'updateGroup2', pgeOpUpdategroup2, { after: opcodeGroupSignalSnapshot(2) }), // this.pge_op_updateGroup2.bind(this),
    withOpcodeDebug('0x26', 'updateGroup3', pgeOpUpdategroup3, { after: opcodeGroupSignalSnapshot(3) }), // this.pge_op_updateGroup3.bind(this),
    pgeOpIspgedead, // this.pge_op_isPgeDead.bind(this),
    // /* 0x28 */
    pgeOpCollides1u2o, // this.pge_op_collides1u2o.bind(this),
    pgeOpCollides1u1o, // this.pge_op_collides1u1o.bind(this),
    pgeOpCollides1o1u, // this.pge_op_collides1o1u.bind(this),
    pgeOUnk0x2b, // this.pge_o_unk0x2B.bind(this),
    // /* 0x2C */
    pgeOUnk0x2c, // this.pge_o_unk0x2C.bind(this),
    pgeOUnk0x2d, // this.pge_o_unk0x2D.bind(this),
    pgeOpNop, // this.pge_op_nop.bind(this),
    withOpcodeDebug('0x2F', 'pickupObject', pgeOpPickupobject, { after: opcodeGroupSignalSnapshot(0) }), // this.pge_op_pickupObject.bind(this),
    // /* 0x30 */
    withOpcodeDebug('0x30', 'addItemToInventory', pgeOpAdditemtoinventory, { before: opcodeRoomPosSnapshot, after: opcodeRoomPosSnapshot }), // this.pge_op_addItemToInventory.bind(this),
    pgeOpCopypge, // this.pge_op_copyPge.bind(this),
    pgeOpCanusecurrentinventoryitem, // this.pge_op_canUseCurrentInventoryItem.bind(this),
    withOpcodeDebug('0x33', 'removeItemFromInventory', pgeOpRemoveitemfrominventory, { before: opcodeInventoryItemSnapshot, after: opcodeInventoryItemSnapshot }), // this.pge_op_removeItemFromInventory.bind(this),
    // /* 0x34 */
    pgeOUnk0x34, // this.pge_o_unk0x34.bind(this),
    pgeOpIsinpmod, // this.pge_op_isInpMod.bind(this),
    withOpcodeDebug('0x36', 'setCollisionState1', pgeOpSetcollisionstate1, { after: (args) => ({ patchValue: 1, dy: args.a, room: args.pge.roomLocation }) }), // this.pge_op_setCollisionState1.bind(this),
    withOpcodeDebug('0x37', 'setCollisionState0', pgeOpSetcollisionstate0, { after: (args) => ({ patchValue: 0, dy: args.a, room: args.pge.roomLocation }) }), // this.pge_op_setCollisionState0.bind(this),
    // /* 0x38 */
    pgeOpIsingroup1, // this.pge_op_isInGroup1.bind(this),
    pgeOpIsingroup2, // this.pge_op_isInGroup2.bind(this),
    pgeOpIsingroup3, // this.pge_op_isInGroup3.bind(this),
    pgeOpIsingroup4, // this.pge_op_isInGroup4.bind(this),
    // /* 0x3C */
    pgeOUnk0x3c, // this.pge_o_unk0x3C.bind(this),
    pgeOUnk0x3d, // this.pge_o_unk0x3D.bind(this),
    withOpcodeDebug('0x3E', 'setPgeCounter', pgeOpSetpgecounter, { before: opcodeCounterSnapshot, after: opcodeCounterSnapshot }), // this.pge_op_setPgeCounter.bind(this),
    withOpcodeDebug('0x3F', 'decPgeCounter', pgeOpDecpgecounter, { before: opcodeCounterSnapshot, after: opcodeCounterSnapshot }), // this.pge_op_decPgeCounter.bind(this),
    // /* 0x40 */
    pgeOUnk0x40, // this.pge_o_unk0x40.bind(this),
    withOpcodeDebug('0x41', 'wakeUpPge', pgeOpWakeuppge, { before: opcodeTargetActiveSnapshot(0), after: opcodeTargetActiveSnapshot(0) }), // this.pge_op_wakeUpPge.bind(this),
    withOpcodeDebug('0x42', 'removePge', pgeOpRemovepge, { before: opcodeTargetActiveSnapshot(0), after: opcodeTargetActiveSnapshot(0) }), // this.pge_op_removePge.bind(this),
    withOpcodeDebug('0x43', 'removePgeIfNotNear', pgeOpRemovepgeifnotnear, { before: opcodePgeStateSnapshot, after: opcodePgeStateSnapshot }), // this.pge_op_removePgeIfNotNear.bind(this),
    // /* 0x44 */
    withOpcodeDebug('0x44', 'loadPgeCounter', pgeOpLoadpgecounter, { before: opcodeCounterSnapshot, after: opcodeCounterSnapshot }), // this.pge_op_loadPgeCounter.bind(this),
    pgeOUnk0x45, // this.pge_o_unk0x45.bind(this),
    pgeOUnk0x46, // this.pge_o_unk0x46.bind(this),
    pgeOUnk0x47, // this.pge_o_unk0x47.bind(this),
    // /* 0x48 */
    pgeOUnk0x48, // this.pge_o_unk0x48.bind(this),
    pgeOUnk0x49, // this.pge_o_unk0x49.bind(this),
    pgeOUnk0x4a, // this.pge_o_unk0x4A.bind(this),
    withOpcodeDebug('0x4B', 'killPge', pgeOpKillpge, { before: opcodePgeStateSnapshot, after: opcodePgeStateSnapshot }), // this.pge_op_killPge.bind(this),
    // /* 0x4C */
    pgeOpIsincurrentroom, // this.pge_op_isInCurrentRoom.bind(this),
    pgeOpIsnotincurrentroom, // this.pge_op_isNotInCurrentRoom.bind(this),
    pgeOpScrollposy, // this.pge_op_scrollPosY.bind(this),
    withOpcodeDebug('0x4F', 'playDefaultDeathCutscene', pgeOpPlaydefaultdeathcutscene, { before: opcodeCutsceneSnapshot, after: opcodeCutsceneSnapshot }), // this.pge_op_playDefaultDeathCutscene.bind(this),
    // /* 0x50 */
    pgeOUnk0x50, // this.pge_o_unk0x50.bind(this),
    null,
    pgeOUnk0x52, // this.pge_o_unk0x52.bind(this),
    pgeOUnk0x53, // this.pge_o_unk0x53.bind(this),
    // /* 0x54 */
    pgeOpIspgenear, // this.pge_op_isPgeNear.bind(this),
    withOpcodeDebug('0x55', 'setLife', pgeOpSetlife, { before: opcodeLifeSnapshot, after: opcodeLifeSnapshot }), // this.pge_op_setLife.bind(this),
    withOpcodeDebug('0x56', 'incLife', pgeOpInclife, { before: opcodeLifeSnapshot, after: opcodeLifeSnapshot }), // this.pge_op_incLife.bind(this),
    withOpcodeDebug('0x57', 'setPgeDefaultAnim', pgeOpSetpgedefaultanim, { before: opcodePgeStateSnapshot, after: opcodePgeStateSnapshot }), // this.pge_op_setPgeDefaultAnim.bind(this),
    // /* 0x58 */
    pgeOpSetlifecounter, // this.pge_op_setLifeCounter.bind(this),
    pgeOpDeclifecounter, // this.pge_op_decLifeCounter.bind(this),
    withOpcodeDebug('0x5A', 'playCutscene', pgeOpPlaycutscene, { before: opcodeCutsceneSnapshot, after: opcodeCutsceneSnapshot }), // this.pge_op_playCutscene.bind(this),
    pgeOpCompareunkvar, // this.pge_op_compareUnkVar.bind(this),
    // /* 0x5C */
    withOpcodeDebug('0x5C', 'playDeathCutscene', pgeOpPlaydeathcutscene, { before: opcodeCutsceneSnapshot, after: opcodeCutsceneSnapshot }), // this.pge_op_playDeathCutscene.bind(this),
    pgeOUnk0x5d, // this.pge_o_unk0x5D.bind(this),
    pgeOUnk0x5e, // this.pge_o_unk0x5E.bind(this),
    pgeOUnk0x5f, // this.pge_o_unk0x5F.bind(this),
    // /* 0x60 */
    withOpcodeDebug('0x60', 'findAndCopyPge', pgeOpFindandcopypge, { before: opcodePgeStateSnapshot, after: opcodePgeStateSnapshot }), // this.pge_op_findAndCopyPge.bind(this),
    pgeOpIsinrandomrange, // this.pge_op_isInRandomRange.bind(this),
    pgeOUnk0x62, // this.pge_o_unk0x62.bind(this),
    pgeOUnk0x63, // this.pge_o_unk0x63.bind(this),
    // /* 0x64 */
    pgeOUnk0x64, // this.pge_o_unk0x64.bind(this),
	withOpcodeDebug('0x65', 'addToCredits', pgeOpAddtocredits, { before: opcodeCreditsSnapshot, after: opcodeCreditsSnapshot }), // this.pge_op_addToCredits.bind(this),
	withOpcodeDebug('0x66', 'subFromCredits', pgeOpSubfromcredits, { before: opcodeCreditsSnapshot, after: opcodeCreditsSnapshot }), // this.pge_op_subFromCredits.bind(this),
    pgeOUnk0x67, // this.pge_o_unk0x67.bind(this),
    // /* 0x68 */
    withOpcodeDebug('0x68', 'setCollisionState2', pgeOpSetcollisionstate2, { after: (args) => ({ patchValue: 2, dy: args.a, room: args.pge.roomLocation }) }), // this.pge_op_setCollisionState2.bind(this),
    withOpcodeDebug('0x69', 'saveState', pgeOpSavestate, { after: (_args, game) => ({ validSaveState: getGameSessionState(game).validSaveState, slot: kIngameSaveSlot }) }), // this.pge_op_saveState.bind(this),
    pgeOUnk0x6a, // this.pge_o_unk0x6A.bind(this),
    pgeIstoggleable, // this.pge_isToggleable.bind(this),
    // /* 0x6C */
    pgeOUnk0x6c, // this.pge_o_unk0x6C.bind(this),
    pgeOpIscollidingobject, // this.pge_op_isCollidingObject.bind(this),
    pgeOUnk0x6e, // this.pge_o_unk0x6E.bind(this),
    pgeOUnk0x6f, // this.pge_o_unk0x6F.bind(this),
    // /* 0x70 */
    pgeOUnk0x70, // this.pge_o_unk0x70.bind(this),
    pgeOUnk0x71, // this.pge_o_unk0x71.bind(this),
    pgeOUnk0x72, // this.pge_o_unk0x72.bind(this),
    pgeOUnk0x73, // this.pge_o_unk0x73.bind(this),
    // /* 0x74 */
    pgeOpCollides4u, // this.pge_op_collides4u.bind(this),
    pgeOpDoesnotcollide4u, // this.pge_op_doesNotCollide4u.bind(this),
    pgeOpIsbelowconrad, // this.pge_op_isBelowConrad.bind(this),
    pgeOpIsaboveconrad, // this.pge_op_isAboveConrad.bind(this),
    // /* 0x78 */
    pgeOpIsnotfacingconrad, // this.pge_op_isNotFacingConrad.bind(this),
    pgeOpIsfacingconrad, // this.pge_op_isFacingConrad.bind(this),
    pgeOpCollides2u1u, // this.pge_op_collides2u1u.bind(this),
    withOpcodeDebug('0x7B', 'displayText', pgeOpDisplaytext, { after: (_args, game) => ({ textToDisplay: getGameWorldState(game).textToDisplay }) }), // this.pge_op_displayText.bind(this),
    // /* 0x7C */
    pgeOUnk0x7c, // this.pge_o_unk0x7C.bind(this),
    withOpcodeDebug('0x7D', 'playSound', pgeOpPlaysound, { after: (args) => opcodeSoundSnapshot(args.a & uint8Max, args.a >> 8) }), // this.pge_op_playSound.bind(this),
    pgeOUnk0x7e, // this.pge_o_unk0x7E.bind(this),
    pgeOUnk0x7f, // this.pge_o_unk0x7F.bind(this),
    // /* 0x80 */
    withOpcodeDebug('0x80', 'setPgePosX', pgeOpSetpgeposx, { before: opcodeRoomPosSnapshot, after: opcodeRoomPosSnapshot }), // this.pge_op_setPgePosX.bind(this),
    withOpcodeDebug('0x81', 'setPgePosModX', pgeOpSetpgeposmodx, { before: opcodeRoomPosSnapshot, after: opcodeRoomPosSnapshot }), // this.pge_op_setPgePosModX.bind(this),
    withOpcodeDebug('0x82', 'changeRoom', pgeOpChangeroom, { after: (args) => ({ destinationIndex: args.pge.initPge.counterValues[args.a], sourceIndex: args.pge.initPge.counterValues[args.a + 1] }) }), // this.pge_op_changeRoom.bind(this),
    pgeOpHasinventoryitem, // this.pge_op_hasInventoryItem.bind(this),
    // /* 0x84 */
    withOpcodeDebug('0x84', 'changeLevel', pgeOpChangelevel, { before: (_args, game) => ({ level: getGameWorldState(game).currentLevel }), after: (_args, game) => ({ level: getGameWorldState(game).currentLevel }) }), // this.pge_op_changeLevel.bind(this),
    withOpcodeDebug('0x85', 'shakeScreen', pgeOpShakescreen), // this.pge_op_shakeScreen.bind(this),
    pgeOUnk0x86, // this.pge_o_unk0x86.bind(this),
    withOpcodeDebug('0x87', 'playSoundGroup', pgeOpPlaysoundgroup, { after: (args) => {
		const c = args.pge.initPge.counterValues[args.a] & uint16Max
		return opcodeSoundSnapshot(c & uint8Max, c >> 8)
	} }), // this.pge_op_playSoundGroup.bind(this),
    // /* 0x88 */
    withOpcodeDebug('0x88', 'adjustPos', pgeOpAdjustpos, { before: opcodeRoomPosSnapshot, after: opcodeRoomPosSnapshot }), // this.pge_op_adjustPos.bind(this),
    null,
    withOpcodeDebug('0x8A', 'setTempVar1', pgeOpSettempvar1, { before: opcodeTempVarSnapshot, after: opcodeTempVarSnapshot }), // this.pge_op_setTempVar1.bind(this),
    withOpcodeDebug('0x8B', 'isTempVar1Set', pgeOpIstempvar1set, { before: opcodeTempVarSnapshot, after: opcodeTempVarSnapshot }), // this.pge_op_isTempVar1Set.bind(this)
]

export { _pgeOpcodetable }
