import { globalGameOptions } from "../core/game_constants"

const dumpedFrontLayers: { [key: string]: boolean } = {}
const dumpedFrontLayerPixels: { [key: string]: boolean } = {}

function writeLayerImages(
    level: number,
    room: number,
    layer: Uint8Array,
    width: number,
    height: number,
    palette: Uint8ClampedArray
) {
    if (!globalGameOptions.dumpFrontLayerImage) {
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
    const download = (href: string, layerGroup: string) => {
        const link = document.createElement('a')
        link.href = href
        link.download = `front-layer-level-${level}-room-${room}-palette-layers-${layerGroup}.png`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }

    // The decoded front layer uses 0x10 and 0x80 as palette-layer bits, yielding 4 layers.
    // Export grouped images: layers 1+2, layers 3+4, and all layers combined.
    const layerGroups = [
        { label: "1-2", includes: [0, 1] },
        { label: "3-4", includes: [2, 3] },
        { label: "all", includes: [0, 1, 2, 3] }
    ]

    for (const layerGroup of layerGroups) {
        const dst = imageData.data
        for (let i = 0; i < layer.length; ++i) {
            const srcColorIndex = layer[i]
            const srcPaletteLayerIndex = ((srcColorIndex & 0x80) !== 0 ? 2 : 0) + ((srcColorIndex & 0x10) !== 0 ? 1 : 0)
            const dstOffset = i * 4
            if (layerGroup.includes.indexOf(srcPaletteLayerIndex) !== -1) {
                const srcOffset = srcColorIndex * 4
                dst[dstOffset + 0] = palette[srcOffset + 0]
                dst[dstOffset + 1] = palette[srcOffset + 1]
                dst[dstOffset + 2] = palette[srcOffset + 2]
                dst[dstOffset + 3] = palette[srcOffset + 3]
            } else {
                dst[dstOffset + 0] = 0
                dst[dstOffset + 1] = 0
                dst[dstOffset + 2] = 0
                dst[dstOffset + 3] = 0
            }
        }
        context.putImageData(imageData, 0, 0)

        if (canvas.toBlob) {
            canvas.toBlob((blob) => {
                if (!blob) {
                    return
                }
                const url = URL.createObjectURL(blob)
                download(url, layerGroup.label)
                URL.revokeObjectURL(url)
            }, 'image/png')
            continue
        }

        download(canvas.toDataURL('image/png'), layerGroup.label)
    }
}

function writeLayerPixelData(
    level: number,
    room: number,
    layer: Uint8Array
) {
    if (!globalGameOptions.dumpFrontLayerPixelData) {
        return
    }
    const key = `${level}-${room}`
    if (dumpedFrontLayerPixels[key]) {
        return
    }
    dumpedFrontLayerPixels[key] = true

    const payload = layer.slice()
    const blob = new Blob([payload], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${level}-${room}.pixel.bin`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
}

export { writeLayerImages, writeLayerPixelData }
