import { assert } from "../core/assert"
import { uint16Max } from "../core/game_constants"
import { PgeOpcodeArgs } from "../core/intern"
import { Game } from "./game"
import type { PgeOpcodeHandler } from "./game_opcode_debug"
import { gameGetRoomCollisionGridData } from "./game_collision"
import { getGamePgeState } from "./game_state"

const pgeOpIsinpup: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	return getGamePgeState(game).currentPgeInputMask === 1 ? uint16Max : 0
}

const pgeOpIsinpbackward: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	const pgeState = getGamePgeState(game)
	let mask = 8
	if (pgeState.currentPgeFacingIsMirrored) {
		mask = 4
	}
	return mask === pgeState.currentPgeInputMask ? uint16Max : 0
}

const pgeOpIsinpdown: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	return getGamePgeState(game).currentPgeInputMask === 2 ? uint16Max : 0
}

const pgeOpIsinpforward: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	const pgeState = getGamePgeState(game)
	let mask = 4
	if (pgeState.currentPgeFacingIsMirrored) {
		mask = 8
	}
	return mask === pgeState.currentPgeInputMask ? uint16Max : 0
}

const pgeOpIsinpbackwardmod: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	const pgeState = getGamePgeState(game)
	assert(!(args.a >= 3), `Assertion failed: ${args.a} < 3`)
	let mask = Game._modifierKeyMasks[args.a]
	if (pgeState.currentPgeFacingIsMirrored) {
		mask |= 4
	} else {
		mask |= 8
	}
	return mask === pgeState.currentPgeInputMask ? uint16Max : 0
}

const pgeOpIsinpdownmod: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	assert(!(args.a >= 3), `Assertion failed: ${args.a} < 3`)
	const mask = Game._modifierKeyMasks[args.a] | 2
	return mask === getGamePgeState(game).currentPgeInputMask ? uint16Max : 0
}

const pgeOpIsinpforwardmod: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	const pgeState = getGamePgeState(game)
	assert(!(args.a >= 3), `Assertion failed: ${args.a} < 3`)
	let mask = Game._modifierKeyMasks[args.a]
	if (pgeState.currentPgeFacingIsMirrored) {
		mask |= 8
	} else {
		mask |= 4
	}
	return mask === pgeState.currentPgeInputMask ? uint16Max : 0
}

const pgeOpIsinpupmod: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	assert(!(args.a >= 3), `Assertion failed: ${args.a} < 3`)
	const mask = Game._modifierKeyMasks[args.a] | 1
	return mask === getGamePgeState(game).currentPgeInputMask ? uint16Max : 0
}

const pgeOpIsinpnomod: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	assert(!(args.a >= 3), `Assertion failed: ${args.a} < 3`)
	const mask = Game._modifierKeyMasks[args.a]
	const inputMask = getGamePgeState(game).currentPgeInputMask
	return (((inputMask & 0xF) | mask) === inputMask) ? uint16Max : 0
}

const pgeOpIsinpidle: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	return getGamePgeState(game).currentPgeInputMask === 0 ? uint16Max : 0
}

const pgeOUnk0x34: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	const inputMask = getGamePgeState(game).currentPgeInputMask
	const mask = (inputMask & 0xF) | Game._modifierKeyMasks[0]
	if (mask === inputMask) {
		return gameGetRoomCollisionGridData(game, args.pge, 2, -args.a) === 0 ? uint16Max : 0
	}
	return 0
}

const pgeOpIsinpmod: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	assert(!(args.a >= 3), `Assertion failed: ${args.a} < 3`)
	const mask = Game._modifierKeyMasks[args.a]
	return mask === getGamePgeState(game).currentPgeInputMask ? uint16Max : 0
}

const pgeOpSetgunvar: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	getGamePgeState(game).gunVar = args.a
	return uint16Max
}

const pgeOpComparegunvar: PgeOpcodeHandler = (args: PgeOpcodeArgs, game: Game) => {
	return getGamePgeState(game).gunVar === args.a ? uint16Max : 0
}

export const inputOpcodeHandlers: Record<number, PgeOpcodeHandler | null> = {
	0x01: pgeOpIsinpup,
	0x02: pgeOpIsinpbackward,
	0x03: pgeOpIsinpdown,
	0x04: pgeOpIsinpforward,
	0x05: pgeOpIsinpupmod,
	0x06: pgeOpIsinpbackwardmod,
	0x07: pgeOpIsinpdownmod,
	0x08: pgeOpIsinpforwardmod,
	0x09: pgeOpIsinpidle,
	0x0A: pgeOpIsinpnomod,
	0x34: pgeOUnk0x34,
	0x35: pgeOpIsinpmod,
	0x8A: pgeOpSetgunvar,
	0x8B: pgeOpComparegunvar
}
