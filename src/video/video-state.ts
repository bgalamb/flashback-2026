import type { Color } from '../core/intern'
import { gamescreenH, gamescreenW, screenblockH, screenblockW } from '../core/game_constants'

type drawCharFunc = (p1: Uint8Array, p2: number, p3: number, p4: number, p5: Uint8Array, p6: number, p7: number) => void

type PaletteHeaderColors = {
    slot1: Color[]
    slot2: Color[]
    slot3: Color[]
    slot4: Color[]
}

interface VideoLayerState {
    w: number
    h: number
    layerSize: number
    frontLayer: Uint8Array
    backLayer: Uint8Array
    tempLayer: Uint8Array
    tempLayer2: Uint8Array
}

interface VideoPaletteState {
    unkPalSlot1: number
    unkPalSlot2: number
    mapPaletteOffsetSlot1: number
    mapPaletteOffsetSlot2: number
    mapPaletteOffsetSlot3: number
    mapPaletteOffsetSlot4: number
    paletteHeaderOffsetsCache: Array<[number, number, number, number] | null | undefined>
    paletteHeaderColorsCache: Array<PaletteHeaderColors | null | undefined>
    currentRoomPngPaletteColors: Color[][] | null
}

interface VideoTextState {
    charFrontColor: number
    charTransparentColor: number
    charShadowColor: number
    drawChar: drawCharFunc
}

interface VideoScreenState {
    screenBlocks: Uint8Array
    fullRefresh: boolean
    shakeOffset: number
}

function createVideoLayerState(w: number = gamescreenW, h: number = gamescreenH): VideoLayerState {
    const layerSize = w * h
    return {
        w,
        h,
        layerSize,
        frontLayer: new Uint8Array(layerSize),
        backLayer: new Uint8Array(layerSize),
        tempLayer: new Uint8Array(layerSize),
        tempLayer2: new Uint8Array(layerSize),
    }
}

function createVideoPaletteState(): VideoPaletteState {
    return {
        unkPalSlot1: 0,
        unkPalSlot2: 0,
        mapPaletteOffsetSlot1: 0,
        mapPaletteOffsetSlot2: 0,
        mapPaletteOffsetSlot3: 0,
        mapPaletteOffsetSlot4: 0,
        paletteHeaderOffsetsCache: [],
        paletteHeaderColorsCache: [],
        currentRoomPngPaletteColors: null,
    }
}

function createVideoTextState(drawChar: drawCharFunc): VideoTextState {
    return {
        charFrontColor: 0,
        charTransparentColor: 0,
        charShadowColor: 0,
        drawChar,
    }
}

function createVideoScreenState(w: number = gamescreenW, h: number = gamescreenH): VideoScreenState {
    return {
        screenBlocks: new Uint8Array((w / screenblockW) * (h / screenblockH)),
        fullRefresh: true,
        shakeOffset: 0,
    }
}

export {
    createVideoLayerState,
    createVideoPaletteState,
    createVideoScreenState,
    createVideoTextState,
    drawCharFunc,
    PaletteHeaderColors,
    VideoLayerState,
    VideoPaletteState,
    VideoScreenState,
    VideoTextState,
}
