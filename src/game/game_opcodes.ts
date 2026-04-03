import { Game } from "./game"
import { CT_DOWN_ROOM, CT_LEFT_ROOM, CT_RIGHT_ROOM, CT_UP_ROOM } from "../core/game_constants"
import { LivePGE, PgeOpcodeArgs, RoomCollisionGridPatchRestoreSlot, PgeZOrderComparator } from "../core/intern"
import { col_detectHit, col_detectHitCallback3, col_detectHitCallback1, col_detectHitCallback2, col_detectGunHitCallback2, col_detectGunHitCallback1, col_detectGunHit, col_detectGunHitCallback3, col_detectHitCallback4, col_detectHitCallback5, col_detectHitCallback6 } from '../core/collision'
import { UINT8_MAX, UINT16_MAX, CT_ROOM_SIZE, CT_GRID_STRIDE, CT_GRID_WIDTH, CT_HEADER_SIZE, global_game_options, kIngameSaveSlot } from "../core/game_constants"
import { gameFindFirstMatchingCollidingObject, gameFindOverlappingPgeByObjectType, gameGetRoomCollisionGridData } from './game_collision'
import { gameInitializePgeDefaultAnimation } from './game_pge'
import { assert } from "../core/assert"
import { gameMarkSaveStateCompleted, gameQueueDeathCutscene, gameRequestMapReload, gameSetCurrentLevel } from './game_lifecycle'
import { getRuntimeRegistryState } from './game_runtime_data'
import { getGamePgeState, getGameSessionState, getGameUiState, getGameWorldState } from './game_state'
import { gameGetRandomNumber } from './game_world'

const pge_op_isInpUp = (args: PgeOpcodeArgs, game: Game) => {
	if (1 === game.pge.currentPgeInputMask) {
		return UINT16_MAX
	} else {
		return 0
	}
}

const pge_op_isInpBackward = (args: PgeOpcodeArgs, game: Game) => {
	let mask = 8 // right
	if (game.pge.currentPgeFacingIsMirrored) {
		mask = 4 // left
	}
	if (mask === game.pge.currentPgeInputMask) {
		return UINT16_MAX
	} else {
		return 0
	}
}

const pge_op_isInpDown = (args: PgeOpcodeArgs, game: Game) => {
	if (2 === game.pge.currentPgeInputMask) {
		return UINT16_MAX
	} else {
		return 0
	}
}

const pge_op_isInpForward = (args: PgeOpcodeArgs, game: Game) => {
	let mask = 4
	if (game.pge.currentPgeFacingIsMirrored) {
		mask = 8
	}
	if (mask === game.pge.currentPgeInputMask) {
		return UINT16_MAX
	} else {
		return 0
	}
}

const pge_op_isInpBackwardMod = (args: PgeOpcodeArgs, game: Game) => {
	// assert(args->a < 3);
    assert(!(args.a >= 3), `Assertion failed: ${args.a} < 3`)
	let mask = Game._modifierKeyMasks[args.a]
	if (game.pge.currentPgeFacingIsMirrored) {
		mask |= 4
	} else {
		mask |= 8
	}
	if (mask === game.pge.currentPgeInputMask) {
		return UINT16_MAX
	} else {
		return 0
	}
}

const pge_op_isInpDownMod = (args: PgeOpcodeArgs, game: Game) => {
    assert(!(args.a >= 3), `Assertion failed: ${args.a} < 3`)
	//assert(args->a < 3);
	const mask = Game._modifierKeyMasks[args.a] | 2
	if (mask === game.pge.currentPgeInputMask) {
		return UINT16_MAX
	} else {
		return 0
	}
}

const pge_op_isInpForwardMod = (args: PgeOpcodeArgs, game: Game) => {
    assert(!(args.a >= 3), `Assertion failed: ${args.a} < 3`)
	//assert(args->a < 3);
	let mask = Game._modifierKeyMasks[args.a]
	if (game.pge.currentPgeFacingIsMirrored) {
		mask |= 8
	} else {
		mask |= 4
	}
	if (mask === game.pge.currentPgeInputMask) {
		return UINT16_MAX
	} else {
		return 0
	}
}

const pge_op_isInpUpMod = (args: PgeOpcodeArgs, game: Game) => {
	// assert(args->a < 3);
    assert(!(args.a >= 3), `Assertion failed: ${args.a} < 3`)
	const mask = Game._modifierKeyMasks[args.a] | 1
	if (mask === game.pge.currentPgeInputMask) {
		return UINT16_MAX
	} else {
		return 0
	}
}

const pge_op_doesNotCollide1u = (args: PgeOpcodeArgs, game: Game) => {
	const r = gameGetRoomCollisionGridData(game, args.pge, 1, -args.a)
	if (r & UINT16_MAX) {
		return 0;
	} else {
		return UINT16_MAX
	}
}

const pge_op_doesNotCollide10 = (args: PgeOpcodeArgs, game: Game) => {
	const r = gameGetRoomCollisionGridData(game, args.pge, 1, 0)
	if (r & UINT16_MAX) {
		return 0
	} else {
		return UINT16_MAX
	}
}

const pge_op_doesNotCollide1d = (args: PgeOpcodeArgs, game: Game) => {
	const r = gameGetRoomCollisionGridData(game, args.pge, 1, args.a)
	if (r & UINT16_MAX) {
		return 0
	} else {
		return UINT16_MAX
	}
}

const pge_op_doesNotCollide2u = (args: PgeOpcodeArgs, game: Game) => {
	const r = gameGetRoomCollisionGridData(game, args.pge, 2, -args.a)
	if (r & UINT16_MAX) {
		return 0
	} else {
		return UINT16_MAX
	}
}

const pge_op_doesNotCollide20 = (args: PgeOpcodeArgs, game: Game) => {
	const r = gameGetRoomCollisionGridData(game, args.pge, 2, 0)
	if (r & UINT16_MAX) {
		return 0
	} else {
		return UINT16_MAX
	}
}

const pge_op_isInpNoMod = (args: PgeOpcodeArgs, game: Game) => {
	// assert(args->a < 3);
    assert(!(args.a >= 3), `Assertion failed: ${args.a} < 3`)
	const mask = Game._modifierKeyMasks[args.a]
	if (((game.pge.currentPgeInputMask & 0xF) | mask) === game.pge.currentPgeInputMask) {
		return UINT16_MAX
	} else {
		return 0
	}
}

const pge_op_getCollision0u = (args: PgeOpcodeArgs, game: Game) => {
	return gameGetRoomCollisionGridData(game, args.pge, 0, -args.a)
}

const pge_op_getCollision00 = (args: PgeOpcodeArgs, game: Game) => {
	return gameGetRoomCollisionGridData(game, args.pge, 0, 0)
}

const pge_op_getCollision0d = (args: PgeOpcodeArgs, game: Game) => {
	return gameGetRoomCollisionGridData(game, args.pge, 0, args.a)
}

const pge_op_isInpIdle = (args: PgeOpcodeArgs, game: Game) => {
	if (game.pge.currentPgeInputMask === 0) {
		return UINT16_MAX
	} else {
		return 0
	}    
}

const pge_op_getCollision10 = (args: PgeOpcodeArgs, game: Game) => {
	return gameGetRoomCollisionGridData(game, args.pge, 1, 0)
}

const pge_op_getCollision1d = (args: PgeOpcodeArgs, game: Game) => {
	return gameGetRoomCollisionGridData(game, args.pge, 1, args.a)
}

const pge_op_getCollision2u = (args: PgeOpcodeArgs, game: Game) => {
	return gameGetRoomCollisionGridData(game, args.pge, 2, -args.a)
}

const pge_op_getCollision20 = (args: PgeOpcodeArgs, game: Game) => {
	return gameGetRoomCollisionGridData(game, args.pge, 2, 0)
}

const pge_op_getCollision2d = (args: PgeOpcodeArgs, game: Game) => {
	return gameGetRoomCollisionGridData(game, args.pge, 2, args.a)
}

const pge_op_doesNotCollide0u = (args: PgeOpcodeArgs, game: Game) => {
	const r = gameGetRoomCollisionGridData(game, args.pge, 0, -args.a)
	if (r & UINT16_MAX) {
		return 0
	} else {
		return UINT16_MAX
	}
}

const pge_op_doesNotCollide00 = (args: PgeOpcodeArgs, game: Game) => {
	const r = gameGetRoomCollisionGridData(game, args.pge, 0, 0)
	if (r & UINT16_MAX) {
		return 0
	} else {
		return UINT16_MAX
	}
}

const pge_op_doesNotCollide0d = (args: PgeOpcodeArgs, game: Game) => {
	const r = gameGetRoomCollisionGridData(game, args.pge, 0, args.a)
	if (r & UINT16_MAX) {
		return 0
	} else {
		return UINT16_MAX
	}
}

const pge_op_getCollision1u = (args: PgeOpcodeArgs, game: Game) => {
	return gameGetRoomCollisionGridData(game, args.pge, 1, -args.a)
}

const pge_ZOrderByNumber = (pge1: LivePGE, pge2: LivePGE, comp: number, comp2: number, game: Game) => {
	return 0
	// return pge1 - pge2
}

const pge_ZOrderIfIndex = (pge1: LivePGE, pge2: LivePGE, comp: number, comp2: number, game: Game) => {
	if (pge1.index !== comp2) {
		game.queuePgeGroupSignal(pge2.index, pge1.index, comp)
		return 1
	}
	return 0
}

const pge_ZOrderIfSameDirection = (pge1: LivePGE, pge2: LivePGE, comp: number, comp2: number, game: Game) => {
	if (pge1 !== pge2) {
		if ((pge1.flags & 1) === (pge2.flags & 1)) {
			game.pge.opcodeComparisonResult2 = 1
			game.queuePgeGroupSignal(pge2.index, pge1.index, comp)
			if (pge2.index === 0) {
				return UINT16_MAX
			}
		}
	}
	return 0
}

const pge_ZOrderIfDifferentDirection = (pge1: LivePGE, pge2: LivePGE, comp: number, comp2: number, game: Game) => {
	if (pge1 !== pge2) {
		if ((pge1.flags & 1) !== (pge2.flags & 1)) {
			game.pge.opcodeComparisonResult1 = 1
			game.queuePgeGroupSignal(pge2.index, pge1.index, comp)
			if (pge2.index === 0) {
				return UINT16_MAX
			}
		}
	}
	return 0
}

const pge_ZOrderByAnimYIfType = (pge1: LivePGE, pge2: LivePGE, comp: number, comp2: number, game: Game) => {
	if (pge1.init_PGE.object_type === comp2) {
		if (game._res.getAniData(pge1.script_state_type)[3] === comp) {
			return 1
		}
	}
	return 0
}

const pge_ZOrderByAnimY = (pge1: LivePGE, pge2: LivePGE, comp: number, comp2: number, game: Game) => {
	if (pge1 !== pge2) {
		if (game._res.getAniData(pge1.script_state_type)[3] === comp) {
			return 1
		}
	}
	return 0
}

const pge_ZOrderByIndex = (pge1: LivePGE, pge2: LivePGE, comp: number, comp2: number, game: Game) => {
	if (pge1 !== pge2) {
		game.queuePgeGroupSignal(pge2.index, pge1.index, comp)
		game.pge.opcodeComparisonResult1 = UINT16_MAX
	}

	return 0
}

const pge_ZOrderByObj = (pge1: LivePGE, pge2: LivePGE, comp: number, comp2: number, game: Game) => {
	if (comp === 10) {
		if (pge1.init_PGE.object_type === comp && pge1.life >= 0) {
			return 1
		}
	} else {
		if (pge1.init_PGE.object_type === comp) {
			return 1
		}
	}

	return 0
}

const pge_ZOrderIfTypeAndDifferentDirection = (pge1: LivePGE, pge2: LivePGE, comp: number, comp2: number, game: Game) => {
	if (pge1.init_PGE.object_type === comp) {
		if ((pge1.flags & 1) !== (pge2.flags & 1)) {
			return 1
		}
	}
	return 0
}

const pge_ZOrderIfTypeAndSameDirection = (pge1: LivePGE, pge2: LivePGE, comp: number, comp2: number, game: Game) => {
	if (pge1.init_PGE.object_type === comp) {
		if ((pge1.flags & 1) === (pge2.flags & 1)) {
			return 1
		}
	}
	return 0
}

const pge_ZOrder = (pge: LivePGE, num: number, compare: PgeZOrderComparator, unk: number, game: Game) => {
	let collisionGridPositionIndex = pge.collision_slot
	while (collisionGridPositionIndex !== UINT16_MAX) {
		const slotBucket = game.collision.dynamicPgeCollisionSlotsByPosition.get(collisionGridPositionIndex)
		if (!slotBucket) {
			return 0
		}
		const currentPositionKey = collisionGridPositionIndex
		collisionGridPositionIndex = UINT16_MAX
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

const pge_updateCollisionState = (pge: LivePGE, pge_dy: number, var8: number, game: Game) => {
	let pge_collision_segments = pge.init_PGE.number_of_collision_segments
	if (!(pge.room_location & 0x80) && pge.room_location < CT_ROOM_SIZE) {
        const grid_data = game._res.level.ctData.subarray(CT_HEADER_SIZE)
		let dataIndex = CT_GRID_STRIDE * pge.room_location
		let pge_pos_y = (((pge.pos_y / 36)>>0) & ~1) + pge_dy
		let pge_pos_x = (pge.pos_x + 8) >> 4

		dataIndex += pge_pos_x + pge_pos_y * CT_GRID_WIDTH

		let slot1: RoomCollisionGridPatchRestoreSlot = game.collision.activeRoomCollisionGridPatchRestoreSlots
		let i = 255
		pge_pos_x = i
		if (game.pge.currentPgeFacingIsMirrored) {
			i = pge_collision_segments - 1
			dataIndex -= i
		}
        let while_i = 0
		while (slot1) {
			if (slot1.patchedGridDataView.buffer === grid_data.buffer && slot1.patchedGridDataView.byteOffset === (grid_data.byteOffset + dataIndex)) {
				slot1.patchedCellCount = pge_collision_segments - 1
                assert(!(pge_collision_segments >= CT_GRID_STRIDE), `Assertion failed: ${pge_collision_segments} < ${CT_GRID_STRIDE}`)
                grid_data.subarray(dataIndex).fill(var8, 0, pge_collision_segments)
				dataIndex += pge_collision_segments
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
			slot1.patchedGridDataView = grid_data.subarray(dataIndex)
			slot1.patchedCellCount = pge_collision_segments - 1
			const dst = slot1.originalGridCellValues
			const src = grid_data.subarray(dataIndex)
            let srcIndex = 0
            let dstIndex = 0
			let n = pge_collision_segments
            assert(!(n >= CT_GRID_WIDTH), `Assertion failed: ${n} < ${CT_GRID_WIDTH}`)
			while (n--) {
                // int8 -> uint8
				dst[dstIndex++] = src[srcIndex] & UINT8_MAX
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

const pge_op_nop = (args: PgeOpcodeArgs, game: Game) => {
	return 1
}

const pge_op_pickupObject = (args:PgeOpcodeArgs, game: Game) => {
	const pge:LivePGE = gameFindOverlappingPgeByObjectType(game, args.pge, 3)
	if (pge) {
		game.queuePgeGroupSignal(args.pge.index, pge.index, args.a)
		return UINT16_MAX
	}
	return 0
}

const pge_op_addItemToInventory = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	game.updatePgeInventory(runtime.livePgesByIndex[args.a], args.pge)
	args.pge.room_location = UINT8_MAX
	return UINT16_MAX
}

const pge_op_copyPge = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	const src:LivePGE = runtime.livePgesByIndex[args.a]
	const dst:LivePGE = args.pge

	dst.pos_x = src.pos_x
	dst.pos_y = src.pos_y
	dst.room_location = src.room_location

	dst.flags &= 0xFE
	if (src.flags & 1) {
		dst.flags |= 1
	}
	game.reorderPgeInventory(args.pge)
	return UINT16_MAX
}

const pge_op_canUseCurrentInventoryItem = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	const pge:LivePGE = runtime.livePgesByIndex[0]
	const currentInventoryItemIndex = game.getCurrentInventoryItemIndex(pge)
	if (currentInventoryItemIndex !== UINT8_MAX && game._res.level.pgeAllInitialStateFromFile[currentInventoryItemIndex].object_id === args.a) {
		return 1
	}

	return 0
}

const pge_op_removeItemFromInventory = (args: PgeOpcodeArgs, game: Game) => {
	const currentInventoryItemIndex = game.getCurrentInventoryItemIndex(args.pge)
	if (currentInventoryItemIndex !== UINT8_MAX) {
		game.queuePgeGroupSignal(args.pge.index, currentInventoryItemIndex, args.a)
	}

	return 1
}

const pge_o_unk0x3C = (args: PgeOpcodeArgs, game: Game) => {
    return pge_ZOrder(args.pge, args.a, pge_ZOrderByAnimYIfType, args.b, game)
}

const pge_o_unk0x3D = (args: PgeOpcodeArgs, game: Game) => {
	const res = pge_ZOrder(args.pge, args.a, pge_ZOrderByAnimY, 0, game)
    return res
}

const pge_op_setPgeCounter = (args: PgeOpcodeArgs, game: Game) => {
	args.pge.counter_value = args.a
	return 1
}

const pge_op_decPgeCounter = (args: PgeOpcodeArgs, game: Game) => {
	args.pge.counter_value -= 1
	if (args.a === args.pge.counter_value) {
		return UINT16_MAX
	} else {
		return 0
	}
}

const pge_o_unk0x40 = (args: PgeOpcodeArgs, game: Game) => {
	let pge_room = args.pge.room_location
	if (pge_room < 0 || pge_room >= CT_ROOM_SIZE) {
        return 0
    }
	let col_area
	if (game.world.currentRoom === pge_room) {
		col_area = 1
	} else if (game.collision.activeCollisionLeftRoom === pge_room) {
		col_area = 0
	} else if (game.collision.activeCollisionRightRoom === pge_room) {
		col_area = 2
	} else {
		return 0
	}

	let grid_pos_x = (args.pge.pos_x + 8) >> 4
	let grid_pos_y = (args.pge.pos_y / 72) >> 0

	if (grid_pos_y >= 0 && grid_pos_y <= 2) {
		grid_pos_y *= CT_GRID_WIDTH
		let _cx = args.a
		if (game.pge.currentPgeFacingIsMirrored) {
			_cx = -_cx
		}
		let _bl
		if (_cx >= 0) {
				if (_cx > CT_GRID_WIDTH) {
					_cx = CT_GRID_WIDTH
				}
            let var2 = new Int8Array(game._res.level.ctData.buffer)
            let var2Index = game._res.level.ctData.byteOffset + CT_HEADER_SIZE + pge_room * CT_GRID_STRIDE + grid_pos_y * 2 + CT_GRID_WIDTH + grid_pos_x

	            let activeRoomSlotHeads = getActiveRoomCollisionSlotHeadsByArea(game, col_area)
	            let activeRoomSlotIndex = grid_pos_y + grid_pos_x

				let var12 = grid_pos_x
				--_cx

				do {
					--var12
					if (var12 < 0) {
						--col_area
						if (col_area < 0) {
	                        return 0
	                    }
						pge_room = game._res.level.ctData[CT_LEFT_ROOM + pge_room]
						if (pge_room < 0) {
	                        return 0
	                    }
						var12 = CT_GRID_WIDTH - 1
						var2 = new Int8Array(game._res.level.ctData.buffer)
	                    var2Index = game._res.level.ctData.byteOffset + CT_HEADER_SIZE + 1 + pge_room * CT_GRID_STRIDE + grid_pos_y * 2 + (CT_GRID_WIDTH - 1) + CT_GRID_WIDTH
						activeRoomSlotHeads = getActiveRoomCollisionSlotHeadsByArea(game, col_area)
						activeRoomSlotIndex = grid_pos_y + CT_GRID_WIDTH
					}
					--activeRoomSlotIndex
					const activeCollisionSlotHead = activeRoomSlotHeads ? activeRoomSlotHeads[activeRoomSlotIndex] : null

					if (activeCollisionSlotHead) {
						for (const col_slot of activeCollisionSlotHead) {
							if (args.pge !== col_slot.pge && (col_slot.pge.flags & 4)) {
								if (col_slot.pge.init_PGE.object_type === args.b) {
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
				if (_cx > CT_GRID_WIDTH) {
					_cx = CT_GRID_WIDTH
				}

	            let var2 = game._res.level.ctData.subarray(CT_HEADER_SIZE + 1 + pge_room * CT_GRID_STRIDE + grid_pos_y * 2 + CT_GRID_WIDTH + grid_pos_x)
				let var2Index = 0
	            let activeRoomSlotHeads = getActiveRoomCollisionSlotHeadsByArea(game, col_area)
	            let activeRoomSlotIndex = grid_pos_y + grid_pos_x
	            let var12 = grid_pos_x
				--_cx
				do {
					++var12
						if (var12 === CT_GRID_WIDTH) {
					++col_area
					if (col_area > 2) {
                        return 0
                    }
					pge_room = game._res.level.ctData[CT_RIGHT_ROOM + pge_room]
					if (pge_room < 0) {
                        return 0
                    }

						var12 = 0
						var2 = game._res.level.ctData.subarray(CT_HEADER_SIZE + 1 + pge_room * CT_GRID_STRIDE + grid_pos_y * 2 + CT_GRID_WIDTH)
	                    var2Index = 0
						activeRoomSlotHeads = getActiveRoomCollisionSlotHeadsByArea(game, col_area)
						activeRoomSlotIndex = grid_pos_y - 1
					}
					activeRoomSlotIndex++
					const activeCollisionSlotHead = activeRoomSlotHeads ? activeRoomSlotHeads[activeRoomSlotIndex] : null
					if (activeCollisionSlotHead) {
						for (const col_slot of activeCollisionSlotHead) {
							if (args.pge !== col_slot.pge && (col_slot.pge.flags & 4)) {
								if (col_slot.pge.init_PGE.object_type === args.b) {
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

const pge_op_wakeUpPge = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	if (args.a <= 3) {
		const num = args.pge.init_PGE.counter_values[args.a]
		if (num >= 0) {
			const pge: LivePGE = runtime.livePgesByIndex[num]
			pge.flags |= 4
			runtime.livePgeStore.activeFrameByIndex[num] = pge
		}
	}
	return 1
}

const pge_op_removePge = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	if (args.a <= 3) {
		const num = args.pge.init_PGE.counter_values[args.a]
		if (num >= 0) {
			runtime.livePgeStore.activeFrameByIndex[num] = null
			runtime.livePgesByIndex[num].flags &= ~4
		}
	}
	return 1
}

const pge_op_killPge = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	const ui = getGameUiState(game)
	const pge:LivePGE = args.pge
	pge.room_location = 0xFE
	pge.flags &= ~4
	runtime.livePgeStore.activeFrameByIndex[pge.index] = null
	if (pge.init_PGE.object_type === 10) {
		ui.score += 200
	}

	return UINT16_MAX
}

const pge_op_isInCurrentRoom = (args: PgeOpcodeArgs, game: Game) => {
	return (args.pge.room_location === game.world.currentRoom) ? 1 : 0
}

const pge_op_isNotInCurrentRoom = (args: PgeOpcodeArgs, game: Game) => {
	const res = (args.pge.room_location === game.world.currentRoom) ? 0 : 1
    return res
}

const pge_op_scrollPosY = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	let pge: LivePGE = args.pge
	args.pge.pos_y += args.a
	for (const inventoryItemIndex of game.getInventoryItemIndices(pge)) {
		pge = runtime.livePgesByIndex[inventoryItemIndex]
		pge.pos_y += args.a
	}
	return 1
}

const pge_op_playDefaultDeathCutscene = (args: PgeOpcodeArgs, game: Game) => {
	gameQueueDeathCutscene(game, args.a)
	return 1
}

const pge_op_isNotFacingConrad = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	const pge:LivePGE = args.pge
	const pge_conrad:LivePGE = runtime.livePgesByIndex[0]
	if ((pge.pos_y / 72) >> 0 === ((pge_conrad.pos_y - 8) / 72) >> 0)  { // same grid cell
		if (pge.room_location === pge_conrad.room_location) {
			if (args.a === 0) {
				if (game.pge.currentPgeFacingIsMirrored) {
					if (pge.pos_x < pge_conrad.pos_x) {
						return UINT16_MAX
					}
				} else {
					if (pge.pos_x > pge_conrad.pos_x) {
						return UINT16_MAX
					}
				}
			} else {
				let dx;
				if (game.pge.currentPgeFacingIsMirrored) {
					dx = pge_conrad.pos_x - pge.pos_x
				} else {
					dx = pge.pos_x - pge_conrad.pos_x
				}
				if (dx > 0 && dx < args.a * 16) {
					return UINT16_MAX
				}
			}
		} else if (args.a === 0) {
			if (!(pge.room_location & 0x80) && pge.room_location < CT_ROOM_SIZE) {
				if (game.pge.currentPgeFacingIsMirrored) {
					if (pge_conrad.room_location === game._res.level.ctData[CT_RIGHT_ROOM + pge.room_location])
						return UINT16_MAX
				} else {
					if (pge_conrad.room_location === game._res.level.ctData[CT_LEFT_ROOM + pge.room_location])
						return UINT16_MAX
				}
			}
		}
	}
	return 0
}

const pge_op_isFacingConrad = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	const pge:LivePGE = args.pge
	const pge_conrad:LivePGE = runtime.livePgesByIndex[0]
	if ((pge.pos_y / 72) >> 0 === ((pge_conrad.pos_y - 8) / 72) >> 0) {
		if (pge.room_location === pge_conrad.room_location) {
			if (args.a === 0) {
				if (game.pge.currentPgeFacingIsMirrored) {
					if (pge.pos_x > pge_conrad.pos_x) {
						return UINT16_MAX
					}
				} else {
					if (pge.pos_x <= pge_conrad.pos_x) {
						return UINT16_MAX
					}
				}
			} else {
				let dx;
				if (game.pge.currentPgeFacingIsMirrored) {
					dx = pge.pos_x - pge_conrad.pos_x
				} else {
					dx = pge_conrad.pos_x - pge.pos_x
				}
				if (dx > 0 && dx < args.a * 16) {
					return UINT16_MAX
				}
			}
		} else if (args.a === 0) {
			if (!(pge.room_location & 0x80) && pge.room_location < CT_ROOM_SIZE) {
				if (game.pge.currentPgeFacingIsMirrored) {
					if (pge_conrad.room_location === game._res.level.ctData[CT_LEFT_ROOM + pge.room_location])
						return UINT16_MAX
				} else {
					if (pge_conrad.room_location === game._res.level.ctData[CT_RIGHT_ROOM + pge.room_location])
						return UINT16_MAX
				}
			}

		}
	}

	return 0
}

const pge_op_collides4u = (args: PgeOpcodeArgs, game: Game) => {
	return gameGetRoomCollisionGridData(game, args.pge, 4, -args.a) !== 0 ? UINT16_MAX : 0
}

const pge_op_doesNotCollide4u = (args: PgeOpcodeArgs, game: Game) => {
	return gameGetRoomCollisionGridData(game, args.pge, 4, -args.a) === 0 ? UINT16_MAX : 0
}

const pge_op_isBelowConrad = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	const pge = args.pge
	const conrad = runtime.livePgesByIndex[0]
	if (conrad.room_location === pge.room_location) {
		if ((((conrad.pos_y - 8) / 72) >> 0) < ((pge.pos_y / 72) >> 0)) {
			return UINT16_MAX
		}
	} else if (pge.room_location < CT_ROOM_SIZE) {
		if (conrad.room_location === game._res.level.ctData[CT_UP_ROOM + pge.room_location]) {
			return UINT16_MAX
		}
	}
	return 0
}

const pge_op_isAboveConrad = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	const pge = args.pge
	const conrad = runtime.livePgesByIndex[0]
	if (conrad.room_location === pge.room_location) {
		if ((((conrad.pos_y - 8) / 72) >> 0) > ((pge.pos_y / 72) >> 0)) {
			return UINT16_MAX
		}
	} else if (pge.room_location < CT_ROOM_SIZE) {
		if (conrad.room_location === game._res.level.ctData[CT_DOWN_ROOM + pge.room_location]) {
			return UINT16_MAX
		}
	}
	return 0
}

const pge_op_collides2u1u = (args: PgeOpcodeArgs, game: Game) => {
	if (gameGetRoomCollisionGridData(game, args.pge, 1, -args.a) === 0) {
		if (gameGetRoomCollisionGridData(game, args.pge, 2, -(args.a + 1)) & UINT16_MAX) {
			return UINT16_MAX
		}
	}
	return 0
}

const pge_op_displayText = (args: PgeOpcodeArgs, game: Game) => {
	const world = getGameWorldState(game)
	console.log(`[pge-text] frame=${game.renders} currentRoom=${world.currentRoom} pge=${args.pge.index} pgeRoom=${args.pge.room_location} text=${args.a} previousText=${world.textToDisplay}`)
	world.textToDisplay = args.a
	return UINT16_MAX
}

const pge_o_unk0x7C = (args: PgeOpcodeArgs, game: Game) => {
	let pge:LivePGE = gameFindOverlappingPgeByObjectType(game, args.pge, 3)
	if (pge === null) {
		pge = gameFindOverlappingPgeByObjectType(game, args.pge, 5)
		if (pge == null) {
			pge = gameFindOverlappingPgeByObjectType(game, args.pge, 9)
			if (pge === null) {
				pge = gameFindOverlappingPgeByObjectType(game, args.pge, UINT16_MAX)
			}
		}
	}
	if (pge !== null) {
		game.queuePgeGroupSignal(args.pge.index, pge.index, args.a)
	}
	return 0
}

const pge_op_playSound = (args: PgeOpcodeArgs, game: Game) => {
	const sfxId = args.a & UINT8_MAX
	const softVol = args.a >> 8
	game.playSound(sfxId, softVol)
	return UINT16_MAX
}

const pge_o_unk0x7E = (args: PgeOpcodeArgs, game: Game) => {
	game.pge.opcodeComparisonResult1 = 0
	pge_ZOrder(args.pge, args.a, pge_ZOrderByIndex, 0, game)
	return game.pge.opcodeComparisonResult1
}

const pge_op_hasInventoryItem = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	for (const inventoryItemIndex of game.getInventoryItemIndices(runtime.livePgesByIndex[0])) {
		const pge = runtime.livePgesByIndex[inventoryItemIndex]
		if (pge.init_PGE.object_id === args.a) {
			return UINT16_MAX
		}
	}
	return 0
}

const pge_op_updateGroup0 = (args: PgeOpcodeArgs, game: Game) => {
	const pge: LivePGE = args.pge
	game.queuePgeGroupSignal(pge.index, pge.init_PGE.counter_values[0], args.a)
	return UINT16_MAX;
}

const pge_op_updateGroup1 = (args: PgeOpcodeArgs, game: Game) => {
	const pge:LivePGE = args.pge
	game.queuePgeGroupSignal(pge.index, pge.init_PGE.counter_values[1], args.a)
	return UINT16_MAX
}

const pge_op_updateGroup2 = (args: PgeOpcodeArgs, game: Game) => {
	const pge:LivePGE = args.pge
	game.queuePgeGroupSignal(pge.index, pge.init_PGE.counter_values[2], args.a)
	return UINT16_MAX
}

const pge_op_updateGroup3 = (args: PgeOpcodeArgs, game: Game) => {
	const pge:LivePGE = args.pge
	game.queuePgeGroupSignal(pge.index, pge.init_PGE.counter_values[3], args.a)
	return UINT16_MAX
}

const pge_op_isPgeDead = (args: PgeOpcodeArgs, game: Game) => {
	const ui = getGameUiState(game)
	const pge:LivePGE = args.pge
	if (pge.life <= 0) {
		if (pge.init_PGE.object_type === 10) {
			ui.score += 100
		}
		return 1
	}

	return 0
}

const pge_op_collides1u2o = (args: PgeOpcodeArgs, game: Game) => {
	if (gameGetRoomCollisionGridData(game, args.pge, 1, args.a - 1) & UINT16_MAX) {
		if (gameGetRoomCollisionGridData(game, args.pge, 2, args.a) === 0) {
			return UINT16_MAX
		}
	}

	return 0
}

const pge_op_collides1u1o = (args: PgeOpcodeArgs, game: Game) => {
	if (gameGetRoomCollisionGridData(game, args.pge, 1, args.a - 1) & UINT16_MAX) {
		if (gameGetRoomCollisionGridData(game, args.pge, 1, args.a) === 0) {
			return UINT16_MAX
		}
	}

	return 0
}

const pge_op_collides1o1u = (args: PgeOpcodeArgs, game: Game) => {
	if (gameGetRoomCollisionGridData(game, args.pge, 1, args.a - 1) === 0) {
		if (gameGetRoomCollisionGridData(game, args.pge, 1, args.a) & UINT16_MAX) {
			return UINT16_MAX
		}
	}

	return 0
}

const pge_o_unk0x2B = (args: PgeOpcodeArgs, game: Game) => {
	return pge_ZOrder(args.pge, args.a, pge_ZOrderIfTypeAndDifferentDirection, 0, game)
}

const pge_o_unk0x2C = (args: PgeOpcodeArgs, game: Game) => {
	return pge_ZOrder(args.pge, args.a, pge_ZOrderIfTypeAndSameDirection, 0, game)
}

const pge_o_unk0x2D = (args: PgeOpcodeArgs, game: Game) => {
	return pge_ZOrder(args.pge, args.a, pge_ZOrderByObj, 0, game) ^ 1
}

const pge_op_doesNotCollide2d = (args: PgeOpcodeArgs, game: Game) => {
	const r = gameGetRoomCollisionGridData(game, args.pge, 2, args.a)
	if (r & UINT16_MAX) {
		return 0;
	} else {
		return UINT16_MAX;
	}
}

const pge_op_collides0o0d = (args: PgeOpcodeArgs, game: Game) => {
	if (gameGetRoomCollisionGridData(game, args.pge, 0, args.a) & UINT16_MAX) {
		if (gameGetRoomCollisionGridData(game, args.pge, 0, args.a + 1) === 0) {
			if (gameGetRoomCollisionGridData(game, args.pge, -1, args.a) === 0) {
				return UINT16_MAX
			}
		}
	}

	return 0
}

const pge_op_collides2o2d = (args: PgeOpcodeArgs, game: Game) => {
	if (gameGetRoomCollisionGridData(game, args.pge, 2, args.a) & UINT16_MAX) {
		if (gameGetRoomCollisionGridData(game, args.pge, 2, args.a + 1) === 0) {
			if (gameGetRoomCollisionGridData(game, args.pge, 1, args.a) === 0) {
				return UINT16_MAX
			}
		}
	}

	return 0
}

const pge_op_collides0o0u = (args: PgeOpcodeArgs, game: Game) => {
	if (gameGetRoomCollisionGridData(game, args.pge, 0, args.a) & UINT16_MAX) {
		if (gameGetRoomCollisionGridData(game, args.pge, 0, args.a - 1) === 0) {
			if (gameGetRoomCollisionGridData(game, args.pge, -1, args.a) === 0) {
				return UINT16_MAX
			}
		}
	}

	return 0
}

const pge_op_collides2o2u = (args: PgeOpcodeArgs, game: Game) => {
	if (gameGetRoomCollisionGridData(game, args.pge, 2, args.a) & UINT16_MAX) {
		if (gameGetRoomCollisionGridData(game, args.pge, 2, args.a - 1) === 0) {
			if (gameGetRoomCollisionGridData(game, args.pge, 1, args.a) === 0) {
				return UINT16_MAX
			}
		}
	}

	return 0
}

const pge_op_collides2u2o = (args: PgeOpcodeArgs, game: Game) => {
	if (gameGetRoomCollisionGridData(game, args.pge, 2, args.a - 1) & UINT16_MAX) {
		if (gameGetRoomCollisionGridData(game, args.pge, 2, args.a) === 0) {
			if (gameGetRoomCollisionGridData(game, args.pge, 1, args.a - 1) === 0) {
                return UINT16_MAX
			}
		}
	}

	return 0
}

const pge_op_isInGroup = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	for (const pendingGroup of runtime.pendingSignalsByTargetPgeIndex.get(args.pge.index) ?? []) {
		if (pendingGroup.signalId === args.a) {
			return UINT16_MAX
		}
	}

	return 0
}

const pge_o_unk0x50 = (args: PgeOpcodeArgs, game: Game) => {
	return pge_ZOrder(args.pge, args.a, pge_ZOrderByObj, 0, game)
}

const pge_o_unk0x52 = (args: PgeOpcodeArgs, game: Game) => {
	return col_detectHit(args.pge, args.a, args.b, col_detectHitCallback4, col_detectHitCallback1, 0, 0, game)
}

const pge_o_unk0x53 = (args: PgeOpcodeArgs, game: Game) => {
	return col_detectHit(args.pge, args.a, args.b, col_detectHitCallback5, col_detectHitCallback1, 0, 0, game)
}

const pge_op_isPgeNear = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	if (gameFindOverlappingPgeByObjectType(game, runtime.livePgesByIndex[0], args.a) !== null) {
		return 1
	}
	return 0
}

const pge_op_setLife = (args: PgeOpcodeArgs, game: Game) => {
	args.pge.life = args.a
	return 1
}

const pge_op_incLife = (args: PgeOpcodeArgs, game: Game) => {
	args.pge.life += args.a
	return 1
}

const pge_op_setPgeDefaultAnim = (args: PgeOpcodeArgs, game: Game) => {
	const world = getGameWorldState(game)
	assert(!(args.a < 0 || args.a >= 4), `Assertion failed: ${args.a} >= 0 && ${args.a} < 4`)

	const r = args.pge.init_PGE.counter_values[args.a]
	args.pge.room_location = r
	if (r === 1) {
		// this happens after death tower, on earth, when Conrad passes
		// by the first policeman who's about to shoot him in the back
		gameRequestMapReload(game, world.currentRoom)
	}
	gameInitializePgeDefaultAnimation(game, args.pge)
	return 1
}

const pge_o_unk0x34 = (args: PgeOpcodeArgs, game: Game) => {
	const mask = (game.pge.currentPgeInputMask & 0xF) | Game._modifierKeyMasks[0]
	if (mask === game.pge.currentPgeInputMask) {
		if (gameGetRoomCollisionGridData(game, args.pge, 2, -args.a) === 0) {
			return UINT16_MAX
		}
	}

	return 0
}

const pge_op_isInpMod = (args: PgeOpcodeArgs, game: Game) => {
    assert(!(args.a >= 3), `Assertion failed: ${args.a} < 3`)
	const mask = Game._modifierKeyMasks[args.a]
	if (mask === game.pge.currentPgeInputMask) {
		return UINT16_MAX
	} else {
		return 0
	}
}

const pge_op_setCollisionState1 = (args: PgeOpcodeArgs, game: Game) => {
	return pge_updateCollisionState(args.pge, args.a, 1, game)
}

const pge_op_setCollisionState0 = (args: PgeOpcodeArgs, game: Game) => {
	return pge_updateCollisionState(args.pge, args.a, 0, game)
}

const pge_isInGroup = (pge_dst: LivePGE, signalId: number, counter: number, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	assert(!(counter < 1 || counter > 4), `Assertion failed: ${counter} >= 1 1 && ${counter} <= 4`)

	const c = pge_dst.init_PGE.counter_values[counter - 1]
	for (const pendingGroup of runtime.pendingSignalsByTargetPgeIndex.get(pge_dst.index) ?? []) {
		if (pendingGroup.signalId === signalId && pendingGroup.senderPgeIndex === c) {
			return 1
		}
	}
	return 0
}

const pge_op_isInGroup1 = (args: PgeOpcodeArgs, game: Game) => {
	return pge_isInGroup(args.pge, args.a, 1, game)
}

const pge_op_isInGroup2 = (args: PgeOpcodeArgs, game: Game) => {
	return pge_isInGroup(args.pge, args.a, 2, game)
}

const pge_op_isInGroup3 = (args: PgeOpcodeArgs, game: Game) => {
	return pge_isInGroup(args.pge, args.a, 3, game)
}

const pge_op_isInGroup4 = (args: PgeOpcodeArgs, game: Game) => {
	return pge_isInGroup(args.pge, args.a, 4, game)
}

const pge_op_removePgeIfNotNear = (args: PgeOpcodeArgs, game: Game) => {
    const world = getGameWorldState(game)
    const runtime = getRuntimeRegistryState(game)
    const skip_pge = () => {
        game._shouldPlayPgeAnimationSound = false
        return 1
    }
    const kill_pge = () => {
        pge.flags &= ~4
        pge.collision_slot = UINT16_MAX
        runtime.livePgeStore.activeFrameByIndex[pge.index] = null
        return skip_pge()
    }

	const pge: LivePGE = args.pge
	if (!(pge.init_PGE.flags & 4)) {
        return kill_pge()
    }
	if (world.currentRoom & 0x80) {
        return skip_pge()
    }
	if (pge.room_location & 0x80) {
        return kill_pge()
    }
	if (pge.room_location > 0x3F) {
        return kill_pge()
    }
	if (pge.room_location === world.currentRoom) {
        return skip_pge()
    }
	if (pge.room_location === game._res.level.ctData[CT_UP_ROOM + world.currentRoom]) {
        return skip_pge()
    }
	if (pge.room_location === game._res.level.ctData[CT_DOWN_ROOM + world.currentRoom]) {
        return skip_pge()
    }
	if (pge.room_location === game._res.level.ctData[CT_RIGHT_ROOM + world.currentRoom]) {
        return skip_pge()
    }
	if (pge.room_location === game._res.level.ctData[CT_LEFT_ROOM + world.currentRoom]) {
        return skip_pge()
    }

    return kill_pge()
}

const pge_op_loadPgeCounter = (args: PgeOpcodeArgs, game: Game) => {
	args.pge.counter_value = args.pge.init_PGE.counter_values[args.a]
	return 1
}

const pge_o_unk0x45 = (args: PgeOpcodeArgs, game: Game) => {
	return pge_ZOrder(args.pge, args.a, pge_ZOrderByNumber, 0, game)
}

const pge_o_unk0x46 = (args: PgeOpcodeArgs, game: Game) => {
	game.pge.opcodeComparisonResult1 = 0
	pge_ZOrder(args.pge, args.a, pge_ZOrderIfDifferentDirection, 0, game)
	return game.pge.opcodeComparisonResult1
}

const pge_o_unk0x47 = (args: PgeOpcodeArgs, game: Game) => {
	game.pge.opcodeComparisonResult2 = 0
	pge_ZOrder(args.pge, args.a, pge_ZOrderIfSameDirection, 0, game)
	return game.pge.opcodeComparisonResult2
}

const pge_o_unk0x48 = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	const pge:LivePGE = gameFindOverlappingPgeByObjectType(game, runtime.livePgesByIndex[0], args.pge.init_PGE.counter_values[0])
	if (pge && pge.life === args.pge.life) {
		game.queuePgeGroupSignal(args.pge.index, pge.index, args.a)
		return 1
	}
	return 0
}

const pge_o_unk0x49 = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	return pge_ZOrder(runtime.livePgesByIndex[0], args.a, pge_ZOrderIfIndex, args.pge.init_PGE.counter_values[0], game)
}

const pge_o_unk0x4A = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	const pge: LivePGE = args.pge
	pge.room_location = 0xFE
	pge.flags &= ~4
	runtime.livePgeStore.activeFrameByIndex[pge.index] = null
	const inv_pge:LivePGE = game.findInventoryItemBeforePge(runtime.livePgesByIndex[args.a], pge)
	if (inv_pge === runtime.livePgesByIndex[args.a]) {
		if (pge.index !== game.getCurrentInventoryItemIndex(inv_pge)) {
			return 1
		}
	} else {
		if (pge.index !== game.getNextInventoryItemIndex(runtime.livePgesByIndex[args.a], inv_pge.index)) {
			return 1
		}
	}
	game.removePgeFromInventory(inv_pge, pge, runtime.livePgesByIndex[args.a])
	return 1
}

const pge_o_unk0x7F = (args: PgeOpcodeArgs, game: Game) => {
	const _si: LivePGE = args.pge
	let var4 = _si.collision_slot
	let var2 = _si.index

	while (var4 !== UINT16_MAX) {
		const slotBucket = game.collision.dynamicPgeCollisionSlotsByPosition.get(var4)
		if (!slotBucket) {
			return 1
		}
		let nextCollisionGridPositionIndex = UINT16_MAX
		for (const slot of slotBucket) {
			if (slot.pge !== args.pge) {
				if (slot.pge.init_PGE.object_type === 3 && var2 !== slot.pge.unkF) {
					return 0
				}
			}
			if (slot.pge === args.pge) {
				nextCollisionGridPositionIndex = slot.index
			}
		}
		var4 = nextCollisionGridPositionIndex
	}

	return UINT16_MAX;
}

const pge_o_unk0x6A = (args: PgeOpcodeArgs, game: Game) => {
	let _si: LivePGE = args.pge
	let pge_room = _si.room_location
	if (pge_room < 0 || pge_room >= CT_ROOM_SIZE) {
		return 0
	}
	let _bl
	let col_area = 0
	let ct_data:Int8Array = null
	let ctIndex = 0
	if (game.world.currentRoom === pge_room) {
		col_area = 1
	} else if (game.collision.activeCollisionLeftRoom === pge_room) {
		col_area = 0
	} else if (game.collision.activeCollisionRightRoom === pge_room) {
		col_area = 2
	} else {
		return 0
	}
	let grid_pos_x = (_si.pos_x + 8) >> 4
	let grid_pos_y = (_si.pos_y / 72) >> 0
	if (grid_pos_y >= 0 && grid_pos_y <= 2) {
		grid_pos_y *= CT_GRID_WIDTH
		let _cx = args.a
		if (game.pge.currentPgeFacingIsMirrored) {
			_cx = -_cx
		}
		if (_cx >= 0) {
				if (_cx > CT_GRID_WIDTH) {
					_cx = CT_GRID_WIDTH
				}

				ct_data = game._res.level.ctData
				ctIndex = CT_HEADER_SIZE + pge_room * CT_GRID_STRIDE + grid_pos_y * 2 + CT_GRID_WIDTH + grid_pos_x
				let activeRoomSlotHeads = getActiveRoomCollisionSlotHeadsByArea(game, col_area)
				let activeRoomSlotIndex = grid_pos_y + grid_pos_x + 1
				++ctIndex
				let varA = grid_pos_x
				do {
				--varA
				if (varA < 0) {
					--col_area
					if (col_area < 0) {
						return 0
					}
					pge_room = game._res.level.ctData[CT_LEFT_ROOM + pge_room]
					if (pge_room < 0) {
							return 0
						}
							varA = CT_GRID_WIDTH - 1
							ctIndex = CT_HEADER_SIZE + 1 + pge_room * CT_GRID_STRIDE + grid_pos_y * 2 + CT_GRID_WIDTH + varA
						activeRoomSlotHeads = getActiveRoomCollisionSlotHeadsByArea(game, col_area)
						activeRoomSlotIndex = grid_pos_y + CT_GRID_WIDTH
					}
					--activeRoomSlotIndex
					const activeCollisionSlotHead = activeRoomSlotHeads ? activeRoomSlotHeads[activeRoomSlotIndex] : null
						if (activeCollisionSlotHead) {
							for (const collision_slot of activeCollisionSlotHead) {
								_si = collision_slot.pge
								if (args.pge !== _si && (_si.flags & 4) && _si.life >= 0) {
									if (_si.init_PGE.object_type === 1 || _si.init_PGE.object_type === 10) {
										return 1
									}
								}
							}
						}
					--ctIndex
					if (ct_data[ctIndex] !== 0) {
						return 0
				}
				--_cx
			} while (_cx >= 0)
		} else {
			_cx = -_cx
				if (_cx > CT_GRID_WIDTH) {
					_cx = CT_GRID_WIDTH
				}

				ct_data = game._res.level.ctData
				ctIndex = CT_HEADER_SIZE + 1 + pge_room * CT_GRID_STRIDE + grid_pos_y * 2 + CT_GRID_WIDTH + grid_pos_x
				let activeRoomSlotHeads = getActiveRoomCollisionSlotHeadsByArea(game, col_area)
				let activeRoomSlotIndex = grid_pos_y + grid_pos_x + 1
				let varA = grid_pos_x
				let firstRun = true
				do {
				if (!firstRun) {
					++varA
						if (varA === CT_GRID_WIDTH) {
						++col_area
						if (col_area > 2) {
							return 0
							}
							pge_room = game._res.level.ctData[CT_RIGHT_ROOM + pge_room]
						if (pge_room < 0) {
							return 0
							}
							varA = 0
								ctIndex = CT_HEADER_SIZE + pge_room * CT_GRID_STRIDE + grid_pos_y * 2 + CT_GRID_WIDTH + varA
							activeRoomSlotHeads = getActiveRoomCollisionSlotHeadsByArea(game, col_area)
							activeRoomSlotIndex = grid_pos_y
						}
					}
					firstRun = false

					const activeCollisionSlotHead = activeRoomSlotHeads ? activeRoomSlotHeads[activeRoomSlotIndex] : null
					++activeRoomSlotIndex
						if (activeCollisionSlotHead) {
							for (const collision_slot of activeCollisionSlotHead) {
								_si = collision_slot.pge
								if (args.pge !== _si && (_si.flags & 4) && _si.life >= 0) {
									if (_si.init_PGE.object_type === 1 || _si.init_PGE.object_type === 10) {
										return 1
									}
								}
							}
						}
					_bl = ct_data[ctIndex] << 24 >> 24
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

const pge_op_isInGroupSlice = (args: PgeOpcodeArgs, game: Game) => {
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

const pge_o_unk0x5F = (args: PgeOpcodeArgs, game: Game) => {
	const pge:LivePGE = args.pge

	let pge_room = pge.room_location
	if (pge_room < 0 || pge_room >= CT_ROOM_SIZE) {
        return 0
    }

	let dx
	let _cx = pge.init_PGE.counter_values[0]
	if (_cx <= 0) {
		dx = 1
		_cx = -_cx
	} else {
		dx = -1
	}
	if (game.pge.currentPgeFacingIsMirrored) {
		dx = -dx
	}
	let grid_pos_x = (pge.pos_x + 8) >> 4
	let grid_pos_y = 0

	do {
		let _ax = gameGetRoomCollisionGridData(game, pge, 1, -grid_pos_y)
		if (_ax !== 0) {
			if (!(_ax & 2) || args.a !== 1) {
				pge.room_location = pge_room
					pge.pos_x = grid_pos_x * CT_GRID_WIDTH

				return 1
			}
		}
		if (grid_pos_x < 0) {
			pge_room = game._res.level.ctData[CT_LEFT_ROOM + pge_room]
			if (pge_room < 0 || pge_room >= CT_ROOM_SIZE) {
                return 0
            }
				grid_pos_x += CT_GRID_WIDTH
			} else if (grid_pos_x > CT_GRID_WIDTH - 1) {
			pge_room = game._res.level.ctData[CT_RIGHT_ROOM + pge_room]
			if (pge_room < 0 || pge_room >= CT_ROOM_SIZE) {
                return 0
            }
				grid_pos_x -= CT_GRID_WIDTH
		}
		grid_pos_x += dx
		++grid_pos_y
	} while (grid_pos_y <= _cx)

	return 0
}

const pge_op_findAndCopyPge = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	for (const pendingGroup of runtime.pendingSignalsByTargetPgeIndex.get(args.pge.index) ?? []) {
		if (pendingGroup.signalId === args.a) {
			args.a = pendingGroup.senderPgeIndex
			args.b = 0
			pge_op_copyPge(args, game)
			return 1
		}
	}
	return 0
}

const pge_op_isInRandomRange = (args: PgeOpcodeArgs, game: Game) => {
	let n = args.a & UINT16_MAX
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

const pge_o_unk0x62 = (args: PgeOpcodeArgs, game: Game) => {
	return col_detectHit(args.pge, args.a, args.b, col_detectHitCallback3, col_detectHitCallback1, 0, -1, game)
}

const pge_o_unk0x63 = (args: PgeOpcodeArgs, game: Game) => {
	return col_detectHit(args.pge, args.a, args.b, col_detectHitCallback2, col_detectHitCallback1, 0, -1, game)
}

const pge_o_unk0x64 = (args: PgeOpcodeArgs, game: Game) => {
	return col_detectGunHit(args.pge, args.a, args.b, col_detectGunHitCallback3, col_detectGunHitCallback1, 1, -1, game)
}

const pge_op_addToCredits = (args: PgeOpcodeArgs, game: Game) => {
    const world = getGameWorldState(game)
    const runtime = getRuntimeRegistryState(game)
    const creditsInventoryPgeIndex = args.pge.init_PGE.counter_values[0]
    const pickedUpCreditAmount = args.pge.init_PGE.counter_values[1]
    const creditsInventoryPge = runtime.livePgesByIndex[creditsInventoryPgeIndex]

    world.credits += pickedUpCreditAmount
    creditsInventoryPge.life = world.credits
    args.pge.room_location = UINT8_MAX
    return UINT16_MAX
}

const pge_op_subFromCredits = (args: PgeOpcodeArgs, game: Game) => {
	game.world.credits -= args.a;
	return game.world.credits >= 0 ? 1: 0
}

const pge_o_unk0x67 = (args: PgeOpcodeArgs, game: Game) => {
	if (gameGetRoomCollisionGridData(game, args.pge, 1, -args.a) & 2) {
		return UINT16_MAX
	}

	return 0
}

const pge_op_setCollisionState2 = (args: PgeOpcodeArgs, game: Game) => {
	return pge_updateCollisionState(args.pge, args.a, 2, game)
}

const pge_op_saveState = (args: PgeOpcodeArgs, game: Game) => {
	const session = getGameSessionState(game)
	gameMarkSaveStateCompleted(game)
	game.saveGameState(kIngameSaveSlot)
	if (session.validSaveState && global_game_options.play_gamesaved_sound) {
		game.playSound(68, 0)
	}
	return UINT16_MAX
}

const pge_op_isCollidingObject = (args: PgeOpcodeArgs, game: Game) => {
	const { obj } = gameFindFirstMatchingCollidingObject(game, args.pge, 3, UINT8_MAX, UINT8_MAX)
	if (obj === args.a) {
		return 1
	} else {
		return 0
	}
}

const pge_isToggleable = (args: PgeOpcodeArgs, game: Game) => {
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

const pge_o_unk0x6C = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	const pge = gameFindOverlappingPgeByObjectType(game, runtime.livePgesByIndex[0], args.pge.init_PGE.counter_values[0])
	if (pge && pge.life <= args.pge.life) {
		game.queuePgeGroupSignal(args.pge.index, pge.index, args.a)
		return 1
	}
	return 0
}

// elevator
const pge_o_unk0x6E = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	for (const pendingGroup of runtime.pendingSignalsByTargetPgeIndex.get(args.pge.index) ?? []) {
		if (pendingGroup.signalId === args.a) {
			game.updatePgeInventory(runtime.livePgesByIndex[pendingGroup.senderPgeIndex], args.pge)
			return UINT16_MAX
		}
	}
	return 0
}

const pge_o_unk0x6F = (args: PgeOpcodeArgs, game: Game) => {
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

const pge_o_unk0x70 = (args: PgeOpcodeArgs, game: Game) => {
	for (const inventoryItemIndex of game.getInventoryItemIndices(args.pge)) {
		game.queuePgeGroupSignal(args.pge.index, inventoryItemIndex, args.a)
	}
	return 1
}

// elevator
const pge_o_unk0x71 = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	for (const pendingGroup of runtime.pendingSignalsByTargetPgeIndex.get(args.pge.index) ?? []) {
		if (pendingGroup.signalId === args.a) {
			game.reorderPgeInventory(args.pge)
			return 1
		}
	}
	return 0
}

const pge_o_unk0x72 = (args: PgeOpcodeArgs, game: Game) => {
	const roomCollisionGrid = new Int8Array(
		game._res.level.ctData.buffer,
		game._res.level.ctData.byteOffset + CT_HEADER_SIZE + args.pge.room_location * CT_GRID_STRIDE,
		CT_GRID_STRIDE
	)
	const pgeCollisionGridY = (((args.pge.pos_y / 36) >> 0) & ~1) + args.a
	const pgeCollisionGridX = (args.pge.pos_x + 8) >> 4
	const patchedGridOffset = pgeCollisionGridY * CT_GRID_WIDTH + pgeCollisionGridX

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
	return UINT16_MAX
}

const pge_o_unk0x73 = (args: PgeOpcodeArgs, game: Game) => {
	const pge:LivePGE = gameFindOverlappingPgeByObjectType(game, args.pge, args.a)
	if (pge !== null) {
		game.updatePgeInventory(pge, args.pge)
		return UINT16_MAX
	}
	return 0
}

const pge_op_setLifeCounter = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	runtime.livePgesByIndex[args.a].life = args.pge.init_PGE.counter_values[0]
	return 1
}

const pge_op_decLifeCounter = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	args.pge.life = runtime.livePgesByIndex[args.a].life - 1
	return 1
}

const pge_op_playCutscene = (args: PgeOpcodeArgs, game: Game) => {
	const world = getGameWorldState(game)
	if (world.deathCutsceneCounter === 0) {
		game._cut.setId(args.a)
	}

	return 1
}

const pge_op_compareUnkVar = (args: PgeOpcodeArgs, game: Game) => {
	return args.a === -1 ? 1 : 0
}

const pge_op_playDeathCutscene = (args: PgeOpcodeArgs, game: Game) => {
	gameQueueDeathCutscene(game, args.pge.init_PGE.counter_values[3] + 1, args.a)
	return 1
}

const pge_o_unk0x5D = (args: PgeOpcodeArgs, game: Game) => {
	return col_detectHit(args.pge, args.a, args.b, col_detectHitCallback4, col_detectHitCallback6, 0, 0, game)
}

const pge_o_unk0x5E = (args: PgeOpcodeArgs, game: Game) => {
	return col_detectHit(args.pge, args.a, args.b, col_detectHitCallback5, col_detectHitCallback6, 0, 0, game)
}

const pge_o_unk0x86 = (args:PgeOpcodeArgs, game: Game) => {
	return col_detectGunHit(args.pge, args.a, args.b, col_detectGunHitCallback2, col_detectGunHitCallback1, 1, 0, game)
}

const pge_op_playSoundGroup = (args: PgeOpcodeArgs, game: Game) => {
    assert(!(args.a >= 4), `Assertion failed: ${args.a} < 4`)
	const c = args.pge.init_PGE.counter_values[args.a] & UINT16_MAX
	const sfxId = c & UINT8_MAX
	const softVol = c >> 8
	game.playSound(sfxId, softVol)
	return UINT16_MAX
}

const pge_op_adjustPos = (args: PgeOpcodeArgs, game: Game) => {
	const pge: LivePGE = args.pge
	pge.pos_x &= 0xFFF0
	if (pge.pos_y !== 70 && pge.pos_y != 142 && pge.pos_y !== 214) {
		pge.pos_y = (((pge.pos_y / 72) >> 0) + 1) * 72 - 2
	}

	return UINT16_MAX
}

const pge_op_setPgePosX = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	const ownerPgeIndex = args.pge.unkF
	if (ownerPgeIndex !== UINT8_MAX) {
		args.pge.pos_x = runtime.livePgesByIndex[ownerPgeIndex].pos_x
	}
	return UINT16_MAX
}

const pge_op_setPgePosModX = (args: PgeOpcodeArgs, game: Game) => {
	const runtime = getRuntimeRegistryState(game)
	const ownerPgeIndex = args.pge.unkF
	if (ownerPgeIndex !== UINT8_MAX) {
		let dx = runtime.livePgesByIndex[ownerPgeIndex].pos_x % 256
		if (dx >= args.pge.pos_x) {
			dx -= args.pge.pos_x
		}
		args.pge.pos_x += dx
	}
	return UINT16_MAX
}

// taxi and teleporter
const pge_op_changeRoom = (args: PgeOpcodeArgs, game: Game) => {
	const world = getGameWorldState(game)
	const runtime = getRuntimeRegistryState(game)
	const destinationPgeIndex = args.pge.init_PGE.counter_values[args.a]
	const sourcePgeIndex = args.pge.init_PGE.counter_values[args.a + 1]
	const destinationPge = runtime.livePgesByIndex[destinationPgeIndex]
	const sourcePge = runtime.livePgesByIndex[sourcePgeIndex]
	if (sourcePge.room_location >= 0 && sourcePge.room_location < CT_ROOM_SIZE) {
		const previousRoom = destinationPge.room_location
		destinationPge.pos_x = sourcePge.pos_x
		destinationPge.pos_y = sourcePge.pos_y
		destinationPge.room_location = sourcePge.room_location

		if (previousRoom !== destinationPge.room_location) {
			const previousRoomList = runtime.livePgeStore.liveByRoom[previousRoom]
			if (previousRoomList) {
				const previousRoomIndex = previousRoomList.indexOf(destinationPge)
				if (previousRoomIndex >= 0) {
					previousRoomList.splice(previousRoomIndex, 1)
				}
			}
			const nextRoomList = runtime.livePgeStore.liveByRoom[destinationPge.room_location]
			if (nextRoomList) {
				nextRoomList.push(destinationPge)
			}
		}

		if (destinationPge.init_PGE.script_node_index === sourcePge.init_PGE.script_node_index) {
			destinationPge.flags &= ~1
			if (sourcePge.flags & 1) {
				destinationPge.flags |= 1
			}
			destinationPge.script_state_type = sourcePge.script_state_type
			destinationPge.anim_seq = 0
			const objectNode = game._res.level.objectNodesMap[destinationPge.init_PGE.script_node_index]
			let firstObjNumber = 0
			while (objectNode.objects[firstObjNumber].type !== destinationPge.script_state_type) {
				++firstObjNumber
			}
			destinationPge.first_script_entry_index = firstObjNumber
		}

		if (destinationPge.init_PGE.object_type === 1 && world.currentRoom !== destinationPge.room_location) {
			gameRequestMapReload(game, destinationPge.room_location)
		}
		gameInitializePgeDefaultAnimation(game, destinationPge)
	}
	return UINT16_MAX
}

const pge_op_changeLevel = (args: PgeOpcodeArgs, game: Game) => {
	const world = getGameWorldState(game)
	gameSetCurrentLevel(game, args.a - 1)
	return world.currentLevel
}

const pge_op_shakeScreen = (args: PgeOpcodeArgs, game: Game) => {
	game._vid.setShakeOffset(gameGetRandomNumber(game) & 7)
	return UINT16_MAX
}

const pge_op_setTempVar1 = (args: PgeOpcodeArgs, game: Game) => {
	getGamePgeState(game).opcodeTempVar1 = args.a

	return UINT16_MAX
}

const pge_op_isTempVar1Set = (args: PgeOpcodeArgs, game: Game) => {
	if (getGamePgeState(game).opcodeTempVar1 !== args.a) {
		return 0
	} else {
		return UINT16_MAX
	}
}

const _pge_opcodeTable = [
    null,
    pge_op_isInpUp, // this.pge_op_isInpUp.bind(this),
    pge_op_isInpBackward, // this.pge_op_isInpBackward.bind(this),
    pge_op_isInpDown, // this.pge_op_isInpDown.bind(this),
    // /* 0x04 */
    pge_op_isInpForward, // this.pge_op_isInpForward.bind(this),
    pge_op_isInpUpMod, // this.pge_op_isInpUpMod.bind(this),
    pge_op_isInpBackwardMod, // this.pge_op_isInpBackwardMod.bind(this),
    pge_op_isInpDownMod, // this.pge_op_isInpDownMod.bind(this),
    // /* 0x08 */
    pge_op_isInpForwardMod, // this.pge_op_isInpForwardMod.bind(this),
    pge_op_isInpIdle, // this.pge_op_isInpIdle.bind(this),
    pge_op_isInpNoMod, // this.pge_op_isInpNoMod.bind(this),
    pge_op_getCollision0u, // this.pge_op_getCollision0u.bind(this),
    // /* 0x0C */
    pge_op_getCollision00, // this.pge_op_getCollision00.bind(this),
    pge_op_getCollision0d, // this.pge_op_getCollision0d.bind(this),
    pge_op_getCollision1u, // this.pge_op_getCollision1u.bind(this),
    pge_op_getCollision10, // this.pge_op_getCollision10.bind(this),
    // /* 0x10 */
    pge_op_getCollision1d, // this.pge_op_getCollision1d.bind(this),
    pge_op_getCollision2u, // this.pge_op_getCollision2u.bind(this),
    pge_op_getCollision20, // this.pge_op_getCollision20.bind(this),
    pge_op_getCollision2d, // this.pge_op_getCollision2d.bind(this),
    // /* 0x14 */
    pge_op_doesNotCollide0u, // this.pge_op_doesNotCollide0u.bind(this),
    pge_op_doesNotCollide00, // this.pge_op_doesNotCollide00.bind(this),
    pge_op_doesNotCollide0d, // this.pge_op_doesNotCollide0d.bind(this),
    pge_op_doesNotCollide1u, // this.pge_op_doesNotCollide1u.bind(this),
    // /* 0x18 */
    pge_op_doesNotCollide10, // this.pge_op_doesNotCollide10.bind(this),
    pge_op_doesNotCollide1d, // this.pge_op_doesNotCollide1d.bind(this),
    pge_op_doesNotCollide2u, // this.pge_op_doesNotCollide2u.bind(this),
    pge_op_doesNotCollide20, // this.pge_op_doesNotCollide20.bind(this),
    // /* 0x1C */
    pge_op_doesNotCollide2d, // this.pge_op_doesNotCollide2d.bind(this),
    pge_op_collides0o0d, // this.pge_op_collides0o0d.bind(this),
    pge_op_collides2o2d, // this.pge_op_collides2o2d.bind(this),
    pge_op_collides0o0u, // this.pge_op_collides0o0u.bind(this),
    // /* 0x20 */
    pge_op_collides2o2u, // this.pge_op_collides2o2u.bind(this),
    pge_op_collides2u2o, // this.pge_op_collides2u2o.bind(this),
    pge_op_isInGroup, // this.pge_op_isInGroup.bind(this),
    pge_op_updateGroup0, // this.pge_op_updateGroup0.bind(this),
    // /* 0x24 */
    pge_op_updateGroup1, // this.pge_op_updateGroup1.bind(this),
    pge_op_updateGroup2, // this.pge_op_updateGroup2.bind(this),
    pge_op_updateGroup3, // this.pge_op_updateGroup3.bind(this),
    pge_op_isPgeDead, // this.pge_op_isPgeDead.bind(this),
    // /* 0x28 */
    pge_op_collides1u2o, // this.pge_op_collides1u2o.bind(this),
    pge_op_collides1u1o, // this.pge_op_collides1u1o.bind(this),
    pge_op_collides1o1u, // this.pge_op_collides1o1u.bind(this),
    pge_o_unk0x2B, // this.pge_o_unk0x2B.bind(this),
    // /* 0x2C */
    pge_o_unk0x2C, // this.pge_o_unk0x2C.bind(this),
    pge_o_unk0x2D, // this.pge_o_unk0x2D.bind(this),
    pge_op_nop, // this.pge_op_nop.bind(this),
    pge_op_pickupObject, // this.pge_op_pickupObject.bind(this),
    // /* 0x30 */
    pge_op_addItemToInventory, // this.pge_op_addItemToInventory.bind(this),
    pge_op_copyPge, // this.pge_op_copyPge.bind(this),
    pge_op_canUseCurrentInventoryItem, // this.pge_op_canUseCurrentInventoryItem.bind(this),
    pge_op_removeItemFromInventory, // this.pge_op_removeItemFromInventory.bind(this),
    // /* 0x34 */
    pge_o_unk0x34, // this.pge_o_unk0x34.bind(this),
    pge_op_isInpMod, // this.pge_op_isInpMod.bind(this),
    pge_op_setCollisionState1, // this.pge_op_setCollisionState1.bind(this),
    pge_op_setCollisionState0, // this.pge_op_setCollisionState0.bind(this),
    // /* 0x38 */
    pge_op_isInGroup1, // this.pge_op_isInGroup1.bind(this),
    pge_op_isInGroup2, // this.pge_op_isInGroup2.bind(this),
    pge_op_isInGroup3, // this.pge_op_isInGroup3.bind(this),
    pge_op_isInGroup4, // this.pge_op_isInGroup4.bind(this),
    // /* 0x3C */
    pge_o_unk0x3C, // this.pge_o_unk0x3C.bind(this),
    pge_o_unk0x3D, // this.pge_o_unk0x3D.bind(this),
    pge_op_setPgeCounter, // this.pge_op_setPgeCounter.bind(this),
    pge_op_decPgeCounter, // this.pge_op_decPgeCounter.bind(this),
    // /* 0x40 */
    pge_o_unk0x40, // this.pge_o_unk0x40.bind(this),
    pge_op_wakeUpPge, // this.pge_op_wakeUpPge.bind(this),
    pge_op_removePge, // this.pge_op_removePge.bind(this),
    pge_op_removePgeIfNotNear, // this.pge_op_removePgeIfNotNear.bind(this),
    // /* 0x44 */
    pge_op_loadPgeCounter, // this.pge_op_loadPgeCounter.bind(this),
    pge_o_unk0x45, // this.pge_o_unk0x45.bind(this),
    pge_o_unk0x46, // this.pge_o_unk0x46.bind(this),
    pge_o_unk0x47, // this.pge_o_unk0x47.bind(this),
    // /* 0x48 */
    pge_o_unk0x48, // this.pge_o_unk0x48.bind(this),
    pge_o_unk0x49, // this.pge_o_unk0x49.bind(this),
    pge_o_unk0x4A, // this.pge_o_unk0x4A.bind(this),
    pge_op_killPge, // this.pge_op_killPge.bind(this),
    // /* 0x4C */
    pge_op_isInCurrentRoom, // this.pge_op_isInCurrentRoom.bind(this),
    pge_op_isNotInCurrentRoom, // this.pge_op_isNotInCurrentRoom.bind(this),
    pge_op_scrollPosY, // this.pge_op_scrollPosY.bind(this),
    pge_op_playDefaultDeathCutscene, // this.pge_op_playDefaultDeathCutscene.bind(this),
    // /* 0x50 */
    pge_o_unk0x50, // this.pge_o_unk0x50.bind(this),
    null,
    pge_o_unk0x52, // this.pge_o_unk0x52.bind(this),
    pge_o_unk0x53, // this.pge_o_unk0x53.bind(this),
    // /* 0x54 */
    pge_op_isPgeNear, // this.pge_op_isPgeNear.bind(this),
    pge_op_setLife, // this.pge_op_setLife.bind(this),
    pge_op_incLife, // this.pge_op_incLife.bind(this),
    pge_op_setPgeDefaultAnim, // this.pge_op_setPgeDefaultAnim.bind(this),
    // /* 0x58 */
    pge_op_setLifeCounter, // this.pge_op_setLifeCounter.bind(this),
    pge_op_decLifeCounter, // this.pge_op_decLifeCounter.bind(this),
    pge_op_playCutscene, // this.pge_op_playCutscene.bind(this),
    pge_op_compareUnkVar, // this.pge_op_compareUnkVar.bind(this),
    // /* 0x5C */
    pge_op_playDeathCutscene, // this.pge_op_playDeathCutscene.bind(this),
    pge_o_unk0x5D, // this.pge_o_unk0x5D.bind(this),
    pge_o_unk0x5E, // this.pge_o_unk0x5E.bind(this),
    pge_o_unk0x5F, // this.pge_o_unk0x5F.bind(this),
    // /* 0x60 */
    pge_op_findAndCopyPge, // this.pge_op_findAndCopyPge.bind(this),
    pge_op_isInRandomRange, // this.pge_op_isInRandomRange.bind(this),
    pge_o_unk0x62, // this.pge_o_unk0x62.bind(this),
    pge_o_unk0x63, // this.pge_o_unk0x63.bind(this),
    // /* 0x64 */
    pge_o_unk0x64, // this.pge_o_unk0x64.bind(this),
	pge_op_addToCredits, // this.pge_op_addToCredits.bind(this),
	pge_op_subFromCredits, // this.pge_op_subFromCredits.bind(this),
    pge_o_unk0x67, // this.pge_o_unk0x67.bind(this),
    // /* 0x68 */
    pge_op_setCollisionState2, // this.pge_op_setCollisionState2.bind(this),
    pge_op_saveState, // this.pge_op_saveState.bind(this),
    pge_o_unk0x6A, // this.pge_o_unk0x6A.bind(this),
    pge_isToggleable, // this.pge_isToggleable.bind(this),
    // /* 0x6C */
    pge_o_unk0x6C, // this.pge_o_unk0x6C.bind(this),
    pge_op_isCollidingObject, // this.pge_op_isCollidingObject.bind(this),
    pge_o_unk0x6E, // this.pge_o_unk0x6E.bind(this),
    pge_o_unk0x6F, // this.pge_o_unk0x6F.bind(this),
    // /* 0x70 */
    pge_o_unk0x70, // this.pge_o_unk0x70.bind(this),
    pge_o_unk0x71, // this.pge_o_unk0x71.bind(this),
    pge_o_unk0x72, // this.pge_o_unk0x72.bind(this),
    pge_o_unk0x73, // this.pge_o_unk0x73.bind(this),
    // /* 0x74 */
    pge_op_collides4u, // this.pge_op_collides4u.bind(this),
    pge_op_doesNotCollide4u, // this.pge_op_doesNotCollide4u.bind(this),
    pge_op_isBelowConrad, // this.pge_op_isBelowConrad.bind(this),
    pge_op_isAboveConrad, // this.pge_op_isAboveConrad.bind(this),
    // /* 0x78 */
    pge_op_isNotFacingConrad, // this.pge_op_isNotFacingConrad.bind(this),
    pge_op_isFacingConrad, // this.pge_op_isFacingConrad.bind(this),
    pge_op_collides2u1u, // this.pge_op_collides2u1u.bind(this),
    pge_op_displayText, // this.pge_op_displayText.bind(this),
    // /* 0x7C */
    pge_o_unk0x7C, // this.pge_o_unk0x7C.bind(this),
    pge_op_playSound, // this.pge_op_playSound.bind(this),
    pge_o_unk0x7E, // this.pge_o_unk0x7E.bind(this),
    pge_o_unk0x7F, // this.pge_o_unk0x7F.bind(this),
    // /* 0x80 */
    pge_op_setPgePosX, // this.pge_op_setPgePosX.bind(this),
    pge_op_setPgePosModX, // this.pge_op_setPgePosModX.bind(this),
    pge_op_changeRoom, // this.pge_op_changeRoom.bind(this),
    pge_op_hasInventoryItem, // this.pge_op_hasInventoryItem.bind(this),
    // /* 0x84 */
    pge_op_changeLevel, // this.pge_op_changeLevel.bind(this),
    pge_op_shakeScreen, // this.pge_op_shakeScreen.bind(this),
    pge_o_unk0x86, // this.pge_o_unk0x86.bind(this),
    pge_op_playSoundGroup, // this.pge_op_playSoundGroup.bind(this),
    // /* 0x88 */
    pge_op_adjustPos, // this.pge_op_adjustPos.bind(this),
    null,
    pge_op_setTempVar1, // this.pge_op_setTempVar1.bind(this),
    pge_op_isTempVar1Set, // this.pge_op_isTempVar1Set.bind(this)
]

export { _pge_opcodeTable }
