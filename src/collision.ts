import {CT_DOWN_ROOM, CT_LEFT_ROOM, CT_RIGHT_ROOM, Game} from './game'
import { CollisionSlot, InitPGE, LivePGE, PgeScriptEntry, PgeScriptNode } from './intern'
import type { col_Callback1, col_Callback2 } from './game'
import { UINT16_MAX } from './game_constants'
import { gameFindCollisionSlotBucketByGridPosition, gameGetRoomCollisionGridData } from './game_collision'
import { assert } from "./assert"


// Conrad standing-position reference for the runtime collision grid math:
//
// X mapping:
// - Snapped/aligned X positions are 16-pixel multiples (`pos_x &= 0xFFF0` elsewhere).
// - The collision column used here is `gridPosX = (pge.pos_x + 8) >> 4`.
// - For snapped positions this means `gridX = pos_x / 16`.
//
// Y mapping:
// - Canonical standing Y positions are 70, 142, and 214.
// - The 3-lane grouping used here is `gridPosY = (pge.pos_y / 72) >> 0`,
//   which maps those standing positions to lanes 0, 1, and 2 respectively.
// - The static 16x7 room collision grid uses a different anchor:
//   `gridYBase = (((pge.pos_y / 36) >> 0) & ~1)`, so standing Y values anchor
//   Conrad to row windows 0..2, 2..4, and 4..6 respectively.
//
// Combined standing reference:
// | gridX | snapped pos_x | top floor | middle floor | bottom floor |
// |     0 |             0 |         70 |          142 |          214 |
// |     1 |            16 |         70 |          142 |          214 |
// |     2 |            32 |         70 |          142 |          214 |
// |     3 |            48 |         70 |          142 |          214 |
// |     4 |            64 |         70 |          142 |          214 |
// |     5 |            80 |         70 |          142 |          214 |
// |     6 |            96 |         70 |          142 |          214 |
// |     7 |           112 |         70 |          142 |          214 |
// |     8 |           128 |         70 |          142 |          214 |
// |     9 |           144 |         70 |          142 |          214 |
// |    10 |           160 |         70 |          142 |          214 |
// |    11 |           176 |         70 |          142 |          214 |
// |    12 |           192 |         70 |          142 |          214 |
// |    13 |           208 |         70 |          142 |          214 |
// |    14 |           224 |         70 |          142 |          214 |
// |    15 |           240 |         70 |          142 |          214 |
//
// Practical room-grid interpretation:
// - top floor    => pos_y 70  => lane 0 => static room-grid rows 0..2
// - middle floor => pos_y 142 => lane 1 => static room-grid rows 2..4
// - bottom floor => pos_y 214 => lane 2 => static room-grid rows 4..6
const col_detectHit = (pge: LivePGE, arg2: number, arg4: number, callback1: col_Callback1, callback2: col_Callback2, argA: number, argC: number, game: Game) => {
	let stepX: number, stepY: number, verticalOffset: number, distanceStep: number
	let collisionScore = 0
	let pgeRoom = pge.room_location << 24 >> 24

	if (pgeRoom < 0 || pgeRoom >= CT_DOWN_ROOM) {
		return 0
	}
	let detectionRange = pge.init_PGE.counter_values[0]

	if (detectionRange > 0) {
		stepX = -1
		stepY = -1
	} else {
		stepX = 1
		stepY = 1
		detectionRange = -detectionRange
	}
	if (game._currentPgeFacingIsMirrored) {
		stepX = -stepX
	}
	let gridPosX = (pge.pos_x + 8) >> 4
	let gridPosY = ((pge.pos_y / 72)) >> 0
	if (gridPosY >= 0 && gridPosY <= 2) {
		gridPosY *= 16
		collisionScore = 0
		verticalOffset = 0
		distanceStep = 0
		if (argA !== 0) {
			verticalOffset = stepY
			gridPosX += stepX
			distanceStep = 1
		}
		while (distanceStep <= detectionRange) {
			if (gridPosX < 0) {
				pgeRoom = game._res._ctData[CT_LEFT_ROOM + pgeRoom]
				if (pgeRoom < 0) break
				gridPosX += 16
			}
			if (gridPosX >= 16) {
				pgeRoom = game._res._ctData[CT_RIGHT_ROOM + pgeRoom]
				if (pgeRoom < 0) break
				gridPosX -= 16
			}
			const slotBucket = gameFindCollisionSlotBucketByGridPosition(game, gridPosY + gridPosX + pgeRoom * 64)
			if (slotBucket) {
				for (const cs of slotBucket) {
					collisionScore += callback1(cs.pge, pge, arg2, arg4, game)
				}
			}
			if (callback2(pge, verticalOffset, distanceStep, arg2, game) !== 0) {
				break
			}
			gridPosX += stepX
			++distanceStep
			verticalOffset += stepY
		}
	}
	if (argC === -1) {
		return collisionScore
	} else {
		return 0
	}
}

const col_detectHitCallbackHelper = (pge:LivePGE, groupId: number, game: Game) => {
	const init_pge:InitPGE = pge.init_PGE
    assert(!(init_pge.script_node_index >= game._res._numObjectNodes), `Assertion failed: ${init_pge.script_node_index} < ${game._res._numObjectNodes}`)
	// assert(init_pge->script_node_index < _res._numObjectNodes);
	const scriptNode: PgeScriptNode = game._res._objectNodesMap[init_pge.script_node_index]
	let scriptEntry: PgeScriptEntry = scriptNode.objects[pge.first_script_entry_index]
	let i = pge.first_script_entry_index
	while (pge.script_state_type === scriptEntry.type && scriptNode.last_obj_number > i) {
		if (scriptEntry.opcode2 === 0x6B) { // pge_op_isInGroupSlice
			if (scriptEntry.opcode_arg2 === 0) {
				if (groupId === 1 || groupId === 2) {
                    return UINT16_MAX
                }
			}
			if (scriptEntry.opcode_arg2 === 1) {
				if (groupId === 3 || groupId === 4) {
                    return UINT16_MAX
                }
			}
		} else if (scriptEntry.opcode2 === 0x22) { // pge_op_isInGroup
			if (scriptEntry.opcode_arg2 === groupId) {
                return UINT16_MAX
            }
		}

		if (scriptEntry.opcode1 === 0x6B) { // pge_op_isInGroupSlice
			if (scriptEntry.opcode_arg1 === 0) {
				if (groupId === 1 || groupId === 2) {
                    return UINT16_MAX
                }
			}
			if (scriptEntry.opcode_arg1 === 1) {
				if (groupId === 3 || groupId === 4) {
                    return UINT16_MAX
                }
			}
		} else if (scriptEntry.opcode1 === 0x22) { // pge_op_isInGroup
			if (scriptEntry.opcode_arg1 === groupId) {
                return UINT16_MAX
            }
		}
		// ++scriptEntry;
		++i;
        scriptEntry = scriptNode.objects[i]
	}

	return 0
}

const col_detectHitCallback3 = (pge1: LivePGE, pge2: LivePGE, groupId: number, targetObjectType: number, game: Game) => {
	if (pge1 !== pge2 && (pge1.flags & 4)) {
		if (pge1.init_PGE.object_type === targetObjectType) {
			if ((pge1.flags & 1) != (pge2.flags & 1)) {
				if (col_detectHitCallbackHelper(pge1, groupId, game) === 0) {
					return 1
				}
			}
		}
	}

	return 0
}

const col_detectHitCallback2 = (pge1: LivePGE, pge2: LivePGE, groupId: number, targetObjectType: number, game: Game) => {
	if (pge1 !== pge2 && (pge1.flags & 4)) {
		if (pge1.init_PGE.object_type === targetObjectType) {
			if ((pge1.flags & 1) === (pge2.flags & 1)) {
				if (col_detectHitCallbackHelper(pge1, groupId, game) === 0) {
					return 1
				}
			}
		}
	}

	return 0
}

const col_detectHitCallback1 = (pge: LivePGE, dy: number, unk1: number, unk2: number, game: Game) => {
	if (gameGetRoomCollisionGridData(game, pge, 1, dy) !== 0) {
		return 1
	} else {
		return 0
	}
}

const col_detectHitCallback6 = (_pge: LivePGE, _dy: number, _unk1: number, _unk2: number, _game: Game) => {
	return 0
}

const col_detectHitCallback4 = (pge1: LivePGE, pge2: LivePGE, groupId: number, targetObjectType: number, game: Game) => {
	if (pge1 !== pge2 && (pge1.flags & 4)) {
		if (pge1.init_PGE.object_type === targetObjectType) {
			if ((pge1.flags & 1) !== (pge2.flags & 1)) {
				if (col_detectHitCallbackHelper(pge1, groupId, game) === 0) {
					game.queuePgeGroupSignal(pge2.index, pge1.index, groupId)
					return 1
				}
			}
		}
	}
	return 0
}

const col_detectHitCallback5 = (pge1: LivePGE, pge2: LivePGE, groupId: number, targetObjectType: number, game: Game) => {
	if (pge1 !== pge2 && (pge1.flags & 4)) {
		if (pge1.init_PGE.object_type === targetObjectType) {
			if ((pge1.flags & 1) === (pge2.flags & 1)) {
				if (col_detectHitCallbackHelper(pge1, groupId, game) === 0) {
					game.queuePgeGroupSignal(pge2.index, pge1.index, groupId)
					return 1
				}
			}
		}
	}
	return 0
}

const col_detectGunHitCallback1 = (pge: LivePGE, arg2: number, arg4: number, arg6: number, game: Game) => {
	const _ax = gameGetRoomCollisionGridData(game, pge, 1, arg2)
	if (_ax !== 0) {
		if (!(_ax & 2) || (arg6 !== 1)) {
			return _ax
		}
	}

	return 0
}

const col_detectGunHitCallback2 = (pge1: LivePGE, pge2: LivePGE, arg4: number, arg5: number, game: Game) => {
	if (pge1 !== pge2 && (pge1.flags & 4)) {
		if (pge1.init_PGE.object_type === 1 || pge1.init_PGE.object_type === 10) {
			let id
			if ((pge1.flags & 1) !== (pge2.flags & 1)) {
				id = 4
				if (arg4 === 0) {
					id = 3
				}
			} else {
				id = 2
				if (arg4 === 0) {
					id = 1
				}
			}
			if (col_detectHitCallbackHelper(pge1, id, game) !== 0) {
				game.queuePgeGroupSignal(pge2.index, pge1.index, id)
				return 1
			}
		}
	}
	return 0;
}

const col_detectGunHitCallback3 = (pge1: LivePGE, pge2: LivePGE, arg4: number, arg5: number, game: Game) => {
	if (pge1 !== pge2 && (pge1.flags & 4)) {
		if (pge1.init_PGE.object_type === 1 || pge1.init_PGE.object_type === 12 || pge1.init_PGE.object_type === 10) {
			let id
			if ((pge1.flags & 1) !== (pge2.flags & 1)) {
				id = 4;
				if (arg4 === 0) {
					id = 3;
				}
			} else {
				id = 2;
				if (arg4 === 0) {
					id = 1;
				}
			}
			if (col_detectHitCallbackHelper(pge1, id, game) !== 0) {
				game.queuePgeGroupSignal(pge2.index, pge1.index, id)
				return 1
			}
		}
	}

	return 0
}

const col_detectGunHit = (pge: LivePGE, arg2: number, arg4: number, callback1: col_Callback1, callback2: col_Callback2, argA: number, argC: number, game: Game) => {
	let pgeRoom = pge.room_location
	if (pgeRoom < 0 || pgeRoom >= CT_DOWN_ROOM) return 0
	let detectionRange, stepX, stepY
	if (argC === -1) {
		detectionRange = pge.init_PGE.counter_values[0]
	} else {
		detectionRange = pge.init_PGE.counter_values[3]
	}
	if (detectionRange > 0) {
		stepX = -1
		stepY = -1
	} else {
		stepX = 1
		stepY = 1
		detectionRange = -detectionRange
	}
	if (game._currentPgeFacingIsMirrored) {
		stepX = -stepX
	}

	let gridPosX = (pge.pos_x + 8) >> 4
	let gridPosY = ((pge.pos_y - 8) / 72) >> 0

	if (gridPosY >= 0 && gridPosY <= 2) {
		gridPosY *= 16
		let verticalOffset = 0
		let distanceStep = 0
		if (argA !== 0) {
			verticalOffset = stepY
			gridPosX += stepX
			distanceStep = 1
		}
		while (distanceStep <= detectionRange) {
			if (gridPosX < 0) {
				pgeRoom = game._res._ctData[CT_LEFT_ROOM + pgeRoom]
				if (pgeRoom < 0) {
                    return 0
                }
				gridPosX += 0x10;
			}
			if (gridPosX >= 0x10) {
				pgeRoom = game._res._ctData[CT_RIGHT_ROOM + pgeRoom];
				if (pgeRoom < 0) {
                    return 0
                }
				gridPosX -= 0x10
			}
			const slotBucket = gameFindCollisionSlotBucketByGridPosition(game, pgeRoom * 64 + gridPosX + gridPosY)
			if (slotBucket) {
				for (const cs of slotBucket) {
					const r = callback1(cs.pge, pge, arg2, arg4, game)
					if (r !== 0) {
                        return r
                    }
				}
			}
			if (callback2(pge, verticalOffset, distanceStep, arg2, game) !== 0) {
				break
			}
			gridPosX += stepX
			++distanceStep
			verticalOffset += stepY
		}
	}

	return 0
}

export { col_detectHitCallbackHelper, col_detectHitCallback1, col_detectHitCallback2, col_detectHitCallback3, col_detectHitCallback4, col_detectHitCallback5, col_detectHitCallback6, col_detectHit, col_detectGunHitCallback1, col_detectGunHitCallback2, col_detectGunHitCallback3, col_detectGunHit }
