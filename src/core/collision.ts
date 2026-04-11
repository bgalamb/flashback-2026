import {ctDownRoom, ctLeftRoom, ctRightRoom, Game} from '../game/game'
import { CollisionSlot, InitPGE, LivePGE, PgeScriptEntry, PgeScriptNode } from './intern'
import type { colCallback1, colCallback2 } from '../game/game'
import { uint16Max } from './game_constants'
import { gameFindCollisionSlotBucketByGridPosition, gameGetRoomCollisionGridData } from '../game/game_collision'
import { gameQueuePgeGroupSignal } from '../game/game_pge'
import { getGameServices } from '../game/game_services'
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
const colDetecthit = (pge: LivePGE, arg2: number, arg4: number, callback1: colCallback1, callback2: colCallback2, argA: number, argC: number, game: Game) => {
	let stepX: number, stepY: number, verticalOffset: number, distanceStep: number
	let collisionScore = 0
	let pgeRoom = pge.roomLocation << 24 >> 24
    const { res } = getGameServices(game)

	if (pgeRoom < 0 || pgeRoom >= ctDownRoom) {
		return 0
	}
	let detectionRange = pge.initPge.counterValues[0]

	if (detectionRange > 0) {
		stepX = -1
		stepY = -1
	} else {
		stepX = 1
		stepY = 1
		detectionRange = -detectionRange
	}
	if (game.pge.currentPgeFacingIsMirrored) {
		stepX = -stepX
	}
	let gridPosX = (pge.posX + 8) >> 4
	let gridPosY = ((pge.posY / 72)) >> 0
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
				pgeRoom = res.level.ctData[ctLeftRoom + pgeRoom]
				if (pgeRoom < 0) break
				gridPosX += 16
			}
			if (gridPosX >= 16) {
				pgeRoom = res.level.ctData[ctRightRoom + pgeRoom]
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

const colDetecthitcallbackhelper = (pge:LivePGE, groupId: number, game: Game) => {
	const initPge:InitPGE = pge.initPge
    const { res } = getGameServices(game)
    assert(!(initPge.scriptNodeIndex >= res.level.numObjectNodes), `Assertion failed: ${initPge.scriptNodeIndex} < ${res.level.numObjectNodes}`)
	// assert(init_pge->script_node_index < _res.level.numObjectNodes);
	const scriptNode: PgeScriptNode = res.level.objectNodesMap[initPge.scriptNodeIndex]
	const maxEntryIndex = Math.min(scriptNode.lastObjNumber, scriptNode.objects.length - 1)
	if (pge.firstScriptEntryIndex < 0 || pge.firstScriptEntryIndex > maxEntryIndex) {
		console.warn(
			`[collision] Invalid script entry index during hit detection: pge=${pge.index} room=${pge.roomLocation} objectType=${initPge.objectType} scriptNode=${initPge.scriptNodeIndex} state=${pge.scriptStateType} entry=${pge.firstScriptEntryIndex} maxEntry=${maxEntryIndex} groupId=${groupId}`
		)
		return 0
	}
	let scriptEntry: PgeScriptEntry = scriptNode.objects[pge.firstScriptEntryIndex]
	if (!scriptEntry) {
		console.warn(
			`[collision] Missing script entry during hit detection: pge=${pge.index} room=${pge.roomLocation} objectType=${initPge.objectType} scriptNode=${initPge.scriptNodeIndex} state=${pge.scriptStateType} entry=${pge.firstScriptEntryIndex} groupId=${groupId}`
		)
		return 0
	}
	let i = pge.firstScriptEntryIndex
	while (pge.scriptStateType === scriptEntry.type && scriptNode.lastObjNumber > i) {
		if (scriptEntry.opcode2 === 0x6B) { // pge_op_isInGroupSlice
			if (scriptEntry.opcodeArg2 === 0) {
				if (groupId === 1 || groupId === 2) {
                    return uint16Max
                }
			}
			if (scriptEntry.opcodeArg2 === 1) {
				if (groupId === 3 || groupId === 4) {
                    return uint16Max
                }
			}
		} else if (scriptEntry.opcode2 === 0x22) { // pge_op_isInGroup
			if (scriptEntry.opcodeArg2 === groupId) {
                return uint16Max
            }
		}

		if (scriptEntry.opcode1 === 0x6B) { // pge_op_isInGroupSlice
			if (scriptEntry.opcodeArg1 === 0) {
				if (groupId === 1 || groupId === 2) {
                    return uint16Max
                }
			}
			if (scriptEntry.opcodeArg1 === 1) {
				if (groupId === 3 || groupId === 4) {
                    return uint16Max
                }
			}
		} else if (scriptEntry.opcode1 === 0x22) { // pge_op_isInGroup
			if (scriptEntry.opcodeArg1 === groupId) {
                return uint16Max
            }
		}
		// ++scriptEntry;
		++i;
        scriptEntry = scriptNode.objects[i]
		if (!scriptEntry) {
			console.warn(
				`[collision] Script walk ran past available entries: pge=${pge.index} room=${pge.roomLocation} objectType=${initPge.objectType} scriptNode=${initPge.scriptNodeIndex} state=${pge.scriptStateType} entry=${i} maxEntry=${maxEntryIndex} groupId=${groupId}`
			)
			return 0
		}
	}

	return 0
}

const colDetecthitcallback3 = (pge1: LivePGE, pge2: LivePGE, groupId: number, targetObjectType: number, game: Game) => {
	if (pge1 !== pge2 && (pge1.flags & 4)) {
		if (pge1.initPge.objectType === targetObjectType) {
			if ((pge1.flags & 1) != (pge2.flags & 1)) {
				if (colDetecthitcallbackhelper(pge1, groupId, game) === 0) {
					return 1
				}
			}
		}
	}

	return 0
}

const colDetecthitcallback2 = (pge1: LivePGE, pge2: LivePGE, groupId: number, targetObjectType: number, game: Game) => {
	if (pge1 !== pge2 && (pge1.flags & 4)) {
		if (pge1.initPge.objectType === targetObjectType) {
			if ((pge1.flags & 1) === (pge2.flags & 1)) {
				if (colDetecthitcallbackhelper(pge1, groupId, game) === 0) {
					return 1
				}
			}
		}
	}

	return 0
}

const colDetecthitcallback1 = (pge: LivePGE, dy: number, unk1: number, unk2: number, game: Game) => {
	if (gameGetRoomCollisionGridData(game, pge, 1, dy) !== 0) {
		return 1
	} else {
		return 0
	}
}

const colDetecthitcallback6 = (_pge: LivePGE, _dy: number, _unk1: number, _unk2: number, _game: Game) => {
	return 0
}

const colDetecthitcallback4 = (pge1: LivePGE, pge2: LivePGE, groupId: number, targetObjectType: number, game: Game) => {
	if (pge1 !== pge2 && (pge1.flags & 4)) {
		if (pge1.initPge.objectType === targetObjectType) {
			if ((pge1.flags & 1) !== (pge2.flags & 1)) {
				if (colDetecthitcallbackhelper(pge1, groupId, game) === 0) {
					gameQueuePgeGroupSignal(game, pge2.index, pge1.index, groupId)
					return 1
				}
			}
		}
	}
	return 0
}

const colDetecthitcallback5 = (pge1: LivePGE, pge2: LivePGE, groupId: number, targetObjectType: number, game: Game) => {
	if (pge1 !== pge2 && (pge1.flags & 4)) {
		if (pge1.initPge.objectType === targetObjectType) {
			if ((pge1.flags & 1) === (pge2.flags & 1)) {
				if (colDetecthitcallbackhelper(pge1, groupId, game) === 0) {
					gameQueuePgeGroupSignal(game, pge2.index, pge1.index, groupId)
					return 1
				}
			}
		}
	}
	return 0
}

const colDetectgunhitcallback1 = (pge: LivePGE, arg2: number, arg4: number, arg6: number, game: Game) => {
	const _ax = gameGetRoomCollisionGridData(game, pge, 1, arg2)
	if (_ax !== 0) {
		if (!(_ax & 2) || (arg6 !== 1)) {
			return _ax
		}
	}

	return 0
}

const colDetectgunhitcallback2 = (pge1: LivePGE, pge2: LivePGE, arg4: number, arg5: number, game: Game) => {
	if (pge1 !== pge2 && (pge1.flags & 4)) {
		if (pge1.initPge.objectType === 1 || pge1.initPge.objectType === 10) {
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
			if (colDetecthitcallbackhelper(pge1, id, game) !== 0) {
				gameQueuePgeGroupSignal(game, pge2.index, pge1.index, id)
				return 1
			}
		}
	}
	return 0;
}

const colDetectgunhitcallback3 = (pge1: LivePGE, pge2: LivePGE, arg4: number, arg5: number, game: Game) => {
	if (pge1 !== pge2 && (pge1.flags & 4)) {
		if (pge1.initPge.objectType === 1 || pge1.initPge.objectType === 12 || pge1.initPge.objectType === 10) {
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
			if (colDetecthitcallbackhelper(pge1, id, game) !== 0) {
				gameQueuePgeGroupSignal(game, pge2.index, pge1.index, id)
				return 1
			}
		}
	}

	return 0
}

const colDetectgunhit = (pge: LivePGE, arg2: number, arg4: number, callback1: colCallback1, callback2: colCallback2, argA: number, argC: number, game: Game) => {
	let pgeRoom = pge.roomLocation
    const { res } = getGameServices(game)
	if (pgeRoom < 0 || pgeRoom >= ctDownRoom) return 0
	let detectionRange, stepX, stepY
	if (argC === -1) {
		detectionRange = pge.initPge.counterValues[0]
	} else {
		detectionRange = pge.initPge.counterValues[3]
	}
	if (detectionRange > 0) {
		stepX = -1
		stepY = -1
	} else {
		stepX = 1
		stepY = 1
		detectionRange = -detectionRange
	}
	if (game.pge.currentPgeFacingIsMirrored) {
		stepX = -stepX
	}

	let gridPosX = (pge.posX + 8) >> 4
	let gridPosY = ((pge.posY - 8) / 72) >> 0

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
				pgeRoom = res.level.ctData[ctLeftRoom + pgeRoom]
				if (pgeRoom < 0) {
                    return 0
                }
				gridPosX += 0x10;
			}
			if (gridPosX >= 0x10) {
				pgeRoom = res.level.ctData[ctRightRoom + pgeRoom];
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

export { colDetecthitcallbackhelper, colDetecthitcallback1, colDetecthitcallback2, colDetecthitcallback3, colDetecthitcallback4, colDetecthitcallback5, colDetecthitcallback6, colDetecthit, colDetectgunhitcallback1, colDetectgunhitcallback2, colDetectgunhitcallback3, colDetectgunhit }
