import { CreateInitPGE, InitPGE, READ_LE_UINT16 } from "../intern"

function decodeLegacyPGEData(p: Uint8Array, maxPges: number): { pgeNum: number, pgeInit: InitPGE[] } {
    let index = 0
    const pgeNum = READ_LE_UINT16(p)
    index += 2
    const pgeInit: InitPGE[] = new Array(maxPges).fill(null).map(() => CreateInitPGE())
    if (pgeNum > pgeInit.length) {
        throw (`Assertion failed: ${pgeNum} <= ${pgeInit.length}`)
    }
    for (let i = 0; i < pgeNum; ++i) {
        const pge: InitPGE = pgeInit[i]
        pge.type = READ_LE_UINT16(p, index)
        index += 2
        pge.pos_x = READ_LE_UINT16(p, index)
        index += 2
        pge.pos_y = READ_LE_UINT16(p, index)
        index += 2
        pge.script_node_index = READ_LE_UINT16(p, index)
        index += 2
        pge.life = READ_LE_UINT16(p, index)
        index += 2
        for (let lc = 0; lc < 4; ++lc) {
            pge.counter_values[lc] = READ_LE_UINT16(p, index)
            index += 2
        }
        pge.object_type = p[index++]
        pge.init_room = p[index++]
        pge.room_location = p[index++]
        pge.init_flags = p[index++]
        pge.colliding_icon_num = p[index++]
        pge.icon_num = p[index++]
        pge.object_id = p[index++]
        pge.skill = p[index++]
        pge.mirror_x = p[index++]
        pge.flags = p[index++]
        pge.number_of_collision_segments = p[index++]
        index++
        pge.text_num = READ_LE_UINT16(p, index)
        index += 2
    }
    return { pgeNum, pgeInit }
}

function encodeLegacyPGEDataAsJson(p: Uint8Array, maxPges: number): string {
    const parsed = decodeLegacyPGEData(p, maxPges)
    return JSON.stringify({
        pgeNum: parsed.pgeNum,
        pgeInit: parsed.pgeInit.slice(0, parsed.pgeNum)
    }, null, 2)
}

export { decodeLegacyPGEData, encodeLegacyPGEDataAsJson }
