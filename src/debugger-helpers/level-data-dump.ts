import { global_game_options } from "../configs/global_game_options"

const dumpedLevelRooms: { [key: string]: boolean } = {}

function writeUnpackedLevelData(level: number, room: number, data: Uint8Array) {
    if (!global_game_options.dump_unpacked_level_data) {
        return
    }
    const key = `${level}-${room}`
    if (dumpedLevelRooms[key]) {
        return
    }
    dumpedLevelRooms[key] = true
    const payload = data.slice()
    const blob = new Blob([payload], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `level-${level}-room-${room}.bin`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
}

export { writeUnpackedLevelData }
