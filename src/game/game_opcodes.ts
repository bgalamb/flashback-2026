import { instrumentOpcodeTable } from './game_opcode_debug'
import type { PgeOpcodeHandler } from './game_opcode_debug'
import { collisionOpcodeHandlers } from './game_opcode_collision'
import { inputOpcodeHandlers } from './game_opcode_input'
import { inventoryOpcodeHandlers } from './game_opcode_inventory'
import { worldOpcodeHandlers } from './game_opcode_world'

const createBasePgeOpcodeTable = (): Array<PgeOpcodeHandler | null> => {
	const table: Array<PgeOpcodeHandler | null> = new Array(0x8C).fill(null)
	for (const patch of [
		inputOpcodeHandlers,
		collisionOpcodeHandlers,
		inventoryOpcodeHandlers,
		worldOpcodeHandlers
	]) {
		for (const [opcode, handler] of Object.entries(patch)) {
			table[Number(opcode)] = handler
		}
	}
	return table
}

const basePgeOpcodetable = createBasePgeOpcodeTable()

const _pgeOpcodetable = instrumentOpcodeTable(basePgeOpcodetable)

export { _pgeOpcodetable }
