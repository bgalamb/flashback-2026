import type { Color } from '../core/intern'
import { _gameLevels } from '../core/staticres'
import type { Resource } from '../resource/resource'
import type { SystemPort } from '../platform/system-port'
import { File } from '../resource/file'
import { decodeIndexedPng, paletteBankToColors } from '../core/indexed-png'
import type { PaletteHeaderColors, VideoLayerState, VideoPaletteState } from './video-state'

function clearHiResRoomState(layers: VideoLayerState) {
    layers.hiResRoomPixels = null
    layers.hiResRoomSource = null
    layers.hiResRoomWidth = 0
    layers.hiResRoomHeight = 0
    layers.hiResRoomScale = 1
    layers.hiResMaskedLayer.fill(0)
    layers.hiResMaskedBackLayer.fill(0)
    layers.hiResMaskedTempLayer.fill(0)
    layers.hiResTopLayer.fill(0)
    layers.hiResTopBackLayer.fill(0)
    layers.hiResTopTempLayer.fill(0)
}

function setHiResRoomState(layers: VideoLayerState, pixels: Uint8Array, width: number, height: number, source: string) {
    clearHiResRoomState(layers)
    layers.hiResRoomPixels = pixels
    layers.hiResRoomSource = source
    layers.hiResRoomWidth = width
    layers.hiResRoomHeight = height
    layers.hiResRoomScale = width / layers.w
}

function isSupportedHiResRoomBackground(layers: VideoLayerState, width: number, height: number) {
    if (width <= layers.w || height <= layers.h) {
        return false
    }
    if (width % layers.w !== 0 || height % layers.h !== 0) {
        return false
    }
    return width / layers.w === height / layers.h
}

function parsePaletteSlotColors(value: { colors?: unknown[] } | number | undefined): Color[] | null {
    if (typeof value === 'number' || !Array.isArray(value?.colors)) {
        return null
    }
    const colors = value.colors
    const out: Color[] = []
    for (let i = 0; i < colors.length && i < 16; ++i) {
        const item = colors[i] as { rgb?: { r?: number, g?: number, b?: number }, r?: number, g?: number, b?: number }
        const r = (typeof item?.rgb?.r === 'number') ? item.rgb.r : item?.r
        const g = (typeof item?.rgb?.g === 'number') ? item.rgb.g : item?.g
        const b = (typeof item?.rgb?.b === 'number') ? item.rgb.b : item?.b
        if (!Number.isInteger(r) || !Number.isInteger(g) || !Number.isInteger(b)) {
            return null
        }
        out.push({ r, g, b })
    }
    return out.length === 16 ? out : null
}

async function tryLoadRoomPaletteOffsetsFromJson(resource: Resource, palette: VideoPaletteState, level: number, room: number): Promise<boolean> {
    const cached = palette.paletteHeaderOffsetsCache[level]
    if (cached === null) {
        return false
    }
    if (cached) {
        palette.mapPaletteOffsetSlot1 = cached[0]
        palette.mapPaletteOffsetSlot2 = cached[1]
        palette.mapPaletteOffsetSlot3 = cached[2]
        palette.mapPaletteOffsetSlot4 = cached[3]
        console.log(`Palette offsets source: json-cache level=${level} room=${room} slots=[${cached[0]},${cached[1]},${cached[2]},${cached[3]}]`)
        return true
    }
    const levelData = _gameLevels[level]
    if (!levelData) {
        palette.paletteHeaderOffsetsCache[level] = null
        return false
    }
    const candidates = [
        `levels/${levelData.name2}/${levelData.name}.paletteheader.json`,
        `levels/${levelData.name2}/${levelData.name}-room${room}.paletteheader.json`,
        `${levelData.name}.paletteheader.json`,
        `${levelData.name}-room${room}.paletteheader.json`
    ]
    for (const filename of candidates) {
        const file = new File()
        try {
            const opened = await file.open(filename, "rb", resource.fileSystem)
            if (!opened) {
                continue
            }
            const size = file.size()
            if (size <= 0) {
                file.close()
                continue
            }
            const raw = new Uint8Array(size)
            file.read(raw.buffer, size)
            if (file.ioErr()) {
                file.close()
                continue
            }
            file.close()
            const text = new TextDecoder("utf-8").decode(raw)
            const parsed: unknown = JSON.parse(text)
            const slots = (parsed as {
                slots?: {
                    slot1?: { dec?: number, colors?: unknown[] } | number
                    slot2?: { dec?: number, colors?: unknown[] } | number
                    slot3?: { dec?: number, colors?: unknown[] } | number
                    slot4?: { dec?: number, colors?: unknown[] } | number
                }
            }).slots
            const slot1Value = (typeof slots?.slot1 === 'number') ? slots.slot1 : slots?.slot1?.dec
            const slot2Value = (typeof slots?.slot2 === 'number') ? slots.slot2 : slots?.slot2?.dec
            const slot3Value = (typeof slots?.slot3 === 'number') ? slots.slot3 : slots?.slot3?.dec
            const slot4Value = (typeof slots?.slot4 === 'number') ? slots.slot4 : slots?.slot4?.dec
            const slot1Colors = parsePaletteSlotColors(slots?.slot1)
            const slot2Colors = parsePaletteSlotColors(slots?.slot2)
            const slot3Colors = parsePaletteSlotColors(slots?.slot3)
            const slot4Colors = parsePaletteSlotColors(slots?.slot4)
            if (
                Number.isInteger(slot1Value) && slot1Value >= 0 &&
                Number.isInteger(slot2Value) && slot2Value >= 0 &&
                Number.isInteger(slot3Value) && slot3Value >= 0 &&
                Number.isInteger(slot4Value) && slot4Value >= 0
            ) {
                palette.mapPaletteOffsetSlot1 = slot1Value
                palette.mapPaletteOffsetSlot2 = slot2Value
                palette.mapPaletteOffsetSlot3 = slot3Value
                palette.mapPaletteOffsetSlot4 = slot4Value
                palette.paletteHeaderOffsetsCache[level] = [slot1Value, slot2Value, slot3Value, slot4Value]
                palette.paletteHeaderColorsCache[level] = (slot1Colors && slot2Colors && slot3Colors && slot4Colors) ? {
                    slot1: slot1Colors,
                    slot2: slot2Colors,
                    slot3: slot3Colors,
                    slot4: slot4Colors
                } : null
                console.log(
                    `Palette offsets source: json-file '${filename}' level=${level} room=${room} slots=[${slot1Value},${slot2Value},${slot3Value},${slot4Value}] colors=${palette.paletteHeaderColorsCache[level] ? "embedded" : "offsets-only"}`
                )
                return true
            }
        } catch (_error) {
            file.close()
        }
    }
    palette.paletteHeaderOffsetsCache[level] = null
    palette.paletteHeaderColorsCache[level] = null
    return false
}

async function readRoomPaletteOffsets(resource: Resource, palette: VideoPaletteState, level: number, room: number) {
    if (await tryLoadRoomPaletteOffsetsFromJson(resource, palette, level, room)) {
        return
    }
    console.warn(`Palette offsets source: none level=${level} room=${room} (JSON required)`)
}

async function loadRoomPngBytes(resource: Resource, filename: string) {
    console.log(`[room-png] open begin '${filename}'`)
    const file = new File()
    const opened = await file.open(filename, "rb", resource.fileSystem)
    if (!opened) {
        console.warn(`[room-png] open failed '${filename}'`)
        return null
    }
    const size = file.size()
    console.log(`[room-png] opened '${filename}' size=${size}`)
    if (size <= 0) {
        file.close()
        console.warn(`[room-png] empty '${filename}'`)
        return null
    }
    const raw = new Uint8Array(size)
    file.read(raw.buffer, size)
    const hadIoErr = file.ioErr()
    file.close()
    console.log(`[room-png] read '${filename}' bytes=${raw.byteLength} ioErr=${hadIoErr}`)
    return hadIoErr ? null : raw
}

async function tryLoadFrontLayerFromIndexedPng(resource: Resource, layers: VideoLayerState, palette: VideoPaletteState, level: number, room: number): Promise<boolean> {
    const levelData = _gameLevels[level]
    const names = levelData ? [
        `levels/${levelData.name2}/${levelData.name}-room${room}.pixeldata.png`,
        `${levelData.name}-room${room}.pixeldata.png`
    ] : []
    names.push(`level${level + 1}-room${room}.pixeldata.png`)
    names.push(`level${level}-room${room}.pixeldata.png`)

    for (const filename of names) {
        const raw = await loadRoomPngBytes(resource, filename)
        if (!raw) {
            continue
        }
        try {
            console.log(`[room-png] decode begin '${filename}' bytes=${raw.byteLength}`)
            const png = await decodeIndexedPng(raw)
            console.log(`[room-png] decode success '${filename}' ${png.width}x${png.height} pixels=${png.pixels.length}`)
            if (png.width !== layers.w || png.height !== layers.h) {
                if (!isSupportedHiResRoomBackground(layers, png.width, png.height)) {
                    console.warn(`Invalid indexed PNG room size for '${filename}': got ${png.width}x${png.height}, expected ${layers.w}x${layers.h}`)
                    continue
                }
                setHiResRoomState(layers, png.pixels, png.width, png.height, filename)
                layers.frontLayer.fill(0)
                layers.backLayer.fill(0)
                palette.currentRoomPngPaletteColors = null
                palette.currentRoomPngPaletteColors = []
                for (let slot = 0; slot < 16; ++slot) {
                    const colors = paletteBankToColors(png.palette, slot)
                    if (colors) {
                        palette.currentRoomPngPaletteColors[slot] = colors
                    }
                }
                console.log(`Front layer source: hires-background '${filename}' (${png.width}x${png.height})`)
                return true
            }
            if (png.pixels.length !== layers.frontLayer.length) {
                console.warn(`Invalid indexed PNG pixel buffer size for '${filename}': got ${png.pixels.length}, expected ${layers.frontLayer.length}`)
                continue
            }
            clearHiResRoomState(layers)
            layers.frontLayer.set(png.pixels)
            palette.currentRoomPngPaletteColors = []
            for (let slot = 0; slot < 16; ++slot) {
                const colors = paletteBankToColors(png.palette, slot)
                if (colors) {
                    palette.currentRoomPngPaletteColors[slot] = colors
                }
            }
            console.log(`Front layer source: indexed-png '${filename}'`)
            return true
        } catch (error) {
            console.warn(`Could not load room PNG file '${filename}'`, error)
        }
    }
    return false
}

async function tryLoadFrontLayerFromFile(resource: Resource, layers: VideoLayerState, palette: VideoPaletteState, level: number, room: number): Promise<boolean> {
    palette.currentRoomPngPaletteColors = null
    return tryLoadFrontLayerFromIndexedPng(resource, layers, palette, level, room)
}

function setPaletteColors(stub: SystemPort, paletteSlot: number, colors: Color[]) {
    for (let i = 0; i < 16; ++i) {
        stub.setPaletteEntry(paletteSlot * 16 + i, colors[i])
    }
}

function getJsonPaletteColorsForOffset(palette: VideoPaletteState, level: number, palOffset: number): Color[] | null {
    const colors = palette.paletteHeaderColorsCache[level]
    const offsets = palette.paletteHeaderOffsetsCache[level]
    if (!colors || !offsets) {
        return null
    }
    if (palOffset === offsets[0]) {
        return colors.slot1
    }
    if (palOffset === offsets[1]) {
        return colors.slot2
    }
    if (palOffset === offsets[2]) {
        return colors.slot3
    }
    if (palOffset === offsets[3]) {
        return colors.slot4
    }
    return null
}

function getCurrentRoomPngPaletteColors(palette: VideoPaletteState, slot: number): Color[] | null {
    if (!palette.currentRoomPngPaletteColors || slot < 0 || slot >= palette.currentRoomPngPaletteColors.length) {
        return null
    }
    return palette.currentRoomPngPaletteColors[slot] || null
}

function hasAnyNonBlackColor(colors: Color[] | null) {
    if (!colors) {
        return false
    }
    for (const color of colors) {
        if (color.r !== 0 || color.g !== 0 || color.b !== 0) {
            return true
        }
    }
    return false
}

function getActiveConradVisualFromPaletteHeader(resource: Resource, palette: VideoPaletteState) {
    const conradVariantId = palette.unkPalSlot1 === palette.mapPaletteOffsetSlot3 ? 1 : 2
    return resource.sprites.loadedConradVisualsByVariantId.get(conradVariantId)
}

function applyLevelPalettes(
    resource: Resource,
    stub: SystemPort,
    palette: VideoPaletteState,
    level: number,
    setPaletteSlotLE: (palSlot: number, palData: Uint8Array) => void,
    setTextPalette: () => void
) {
    if (palette.unkPalSlot2 === 0) {
        palette.unkPalSlot2 = palette.mapPaletteOffsetSlot3
    }
    if (palette.unkPalSlot1 === 0) {
        palette.unkPalSlot1 = palette.mapPaletteOffsetSlot3
    }
    const pngSlot0 = getCurrentRoomPngPaletteColors(palette, 0x0)
    const pngSlot1 = getCurrentRoomPngPaletteColors(palette, 0x1)
    const pngSlot2 = getCurrentRoomPngPaletteColors(palette, 0x2)
    const pngSlot3 = getCurrentRoomPngPaletteColors(palette, 0x3)
    const pngSlot8 = getCurrentRoomPngPaletteColors(palette, 0x8)
    const pngSlot9 = getCurrentRoomPngPaletteColors(palette, 0x9)
    const pngSlotA = getCurrentRoomPngPaletteColors(palette, 0xA)
    const pngSlotB = getCurrentRoomPngPaletteColors(palette, 0xB)
    const pngSlotC = getCurrentRoomPngPaletteColors(palette, 0xC)
    const pngSlotD = getCurrentRoomPngPaletteColors(palette, 0xD)
    const jsonColors = palette.paletteHeaderColorsCache[level]
    const headerSlot1Colors = getJsonPaletteColorsForOffset(palette, level, palette.mapPaletteOffsetSlot1) || jsonColors?.slot1 || null
    const dedicatedDoorSwitchColors = headerSlot1Colors || pngSlot8 || pngSlot9 || null
    const inventoryColors = getJsonPaletteColorsForOffset(palette, level, palette.unkPalSlot2) || jsonColors?.slot3 || null
    const uiSlotC = inventoryColors || (hasAnyNonBlackColor(pngSlotC) ? pngSlotC : pngSlotA)
    const uiSlotD = jsonColors?.slot4 || (hasAnyNonBlackColor(pngSlotD) ? pngSlotD : pngSlotB)
    const pickPaletteColors = (pngColors: Color[] | null, fallbackColors: Color[] | null) => {
        return hasAnyNonBlackColor(pngColors) ? pngColors : fallbackColors
    }
    const resolvedSlot0 = pngSlot0
    const resolvedSlot1 = pngSlot1
    const resolvedSlot2 = pngSlot2
    const resolvedSlot3 = pngSlot3
    const resolvedSlot6 = dedicatedDoorSwitchColors
    const resolvedSlot8 = pickPaletteColors(pngSlot8, headerSlot1Colors)
    const resolvedSlot9 = pickPaletteColors(pngSlot9, level === 0 ? headerSlot1Colors : (jsonColors?.slot2 || null))
    const resolvedSlotA = pickPaletteColors(pngSlotA, jsonColors?.slot3 || null)
    const resolvedSlotB = pickPaletteColors(pngSlotB, jsonColors?.slot4 || null)
    const resolvedSlotC = uiSlotC
    const resolvedSlotD = uiSlotD
    if (resolvedSlot0 && resolvedSlot1 && resolvedSlot2 && resolvedSlot3 && resolvedSlot6 && resolvedSlot8 && resolvedSlot9 && resolvedSlotA && resolvedSlotB && resolvedSlotC && resolvedSlotD) {
        console.log(`Palette colors source: png-with-header-fallback level=${level}`)
        setPaletteColors(stub, 0x0, resolvedSlot0)
        setPaletteColors(stub, 0x1, resolvedSlot1)
        setPaletteColors(stub, 0x2, resolvedSlot2)
        setPaletteColors(stub, 0x3, resolvedSlot3)
        const activeConradVisual = getActiveConradVisualFromPaletteHeader(resource, palette)
        setPaletteSlotLE(activeConradVisual.paletteSlot, activeConradVisual.palette)
        setPaletteColors(stub, 0x6, resolvedSlot6)
        setPaletteColors(stub, 0x8, resolvedSlot8)
        setPaletteColors(stub, 0x9, resolvedSlot9)
        setPaletteColors(stub, 0xA, resolvedSlotA)
        setPaletteColors(stub, 0xB, resolvedSlotB)
        setPaletteColors(stub, 0xC, resolvedSlotC)
        setPaletteColors(stub, 0xD, resolvedSlotD)
        setTextPalette()
        return
    }
    if (jsonColors) {
        console.log(`Palette colors source: json-embedded level=${level}`)
        setPaletteColors(stub, 0x0, jsonColors.slot1)
        setPaletteColors(stub, 0x1, jsonColors.slot2)
        setPaletteColors(stub, 0x2, jsonColors.slot3)
        setPaletteColors(stub, 0x3, jsonColors.slot4)
        setPaletteColors(stub, 0x6, headerSlot1Colors || jsonColors.slot1)
        const activeConradVisual = getActiveConradVisualFromPaletteHeader(resource, palette)
        setPaletteSlotLE(activeConradVisual.paletteSlot, activeConradVisual.palette)
        setPaletteColors(stub, 0x8, headerSlot1Colors || jsonColors.slot1)
        setPaletteColors(stub, 0x9, level === 0 ? (headerSlot1Colors || jsonColors.slot1) : jsonColors.slot2)
        setPaletteColors(stub, 0xA, jsonColors.slot3)
        setPaletteColors(stub, 0xB, jsonColors.slot4)
        setPaletteColors(stub, 0xC, inventoryColors || jsonColors.slot3)
        setPaletteColors(stub, 0xD, jsonColors.slot4)
        setTextPalette()
        return
    }
    console.warn(`Palette colors source: none level=${level} (JSON palette colors/offsets required; level.pal fallback disabled)`)
}

export {
    applyLevelPalettes,
    PaletteHeaderColors,
    readRoomPaletteOffsets,
    tryLoadFrontLayerFromFile,
}
