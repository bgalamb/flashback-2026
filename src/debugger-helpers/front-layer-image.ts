import { global_game_options } from "../configs/global_game_options"

const dumpedFrontLayers: { [key: string]: boolean } = {}

function writeFrontLayerImage(
    level: number,
    room: number,
    layer: Uint8Array,
    width: number,
    height: number,
    palette: Uint8ClampedArray
) {
    if (!global_game_options.dump_front_layer_image) {
        return
    }
    const key = `${level}-${room}`
    if (dumpedFrontLayers[key]) {
        return
    }
    dumpedFrontLayers[key] = true

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) {
        return
    }

    const imageData = context.createImageData(width, height)
    const dst = imageData.data
    for (let i = 0; i < layer.length; ++i) {
        const srcOffset = layer[i] * 4
        const dstOffset = i * 4
        dst[dstOffset + 0] = palette[srcOffset + 0]
        dst[dstOffset + 1] = palette[srcOffset + 1]
        dst[dstOffset + 2] = palette[srcOffset + 2]
        dst[dstOffset + 3] = palette[srcOffset + 3]
    }
    context.putImageData(imageData, 0, 0)

    const download = (href: string) => {
        const link = document.createElement('a')
        link.href = href
        link.download = `front-layer-level-${level}-room-${room}.png`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }

    if (canvas.toBlob) {
        canvas.toBlob((blob) => {
            if (!blob) {
                return
            }
            const url = URL.createObjectURL(blob)
            download(url)
            URL.revokeObjectURL(url)
        }, 'image/png')
        return
    }

    download(canvas.toDataURL('image/png'))
}

export { writeFrontLayerImage }
