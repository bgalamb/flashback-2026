import type { Color } from '../core/intern'
import type { PlayerInput, ScalerParameters } from './systemstub-types'

interface SystemPort {
    readonly input: PlayerInput
    readonly rgbPalette: Uint8ClampedArray
    getCanvasElement(): HTMLCanvasElement | null
    init(title: string, w: number, h: number, fullscreen: boolean, scalerParameters: ScalerParameters): Promise<void>
    copyRect(x: number, y: number, w: number, h: number, src: Uint8Array, pitch: number): void
    updateScreen(shakeOffset: number): Promise<void>
    processEvents(): Promise<void>
    sleep(duration: number): Promise<void>
    getTimeStamp(): number
    getPaletteEntry(index: number, color: Color): void
    setPaletteEntry(index: number, color: Color): void
    setPalette(palette: Uint8Array, n: number): void
    setOverscanColor(color: number): void
    setHiResRoomLayer(
        pixels: Uint8Array | null,
        width: number,
        height: number,
        scale: number,
        maskedLayer: Uint8Array | null,
        topLayer: Uint8Array | null
    ): void
    fadeScreen(): void
    postMessageToSoundProcessor(message: unknown): void
    postMessageToSFXProcessor(message: unknown): void
}

export type { PlayerInput, ScalerParameters, SystemPort }
export { defaultScaleParameters, dfDblocks, dfFastmode, dfSetlife, dirDown, dirLeft, dirRight, dirUp } from './systemstub-types'
