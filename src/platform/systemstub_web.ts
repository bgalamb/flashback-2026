import { Color } from '../core/intern'
import { Scaler, ScalerType } from '../core/scaler'
import { assert } from "../core/assert"
import type { Game } from '../game/game'
import { createAudioContext, initializeAudioNodes, postWorkletMessage, resumeAudioContext } from './systemstub-audio'
import { applyCanvasStyles, copyIndexedRectToScreenBuffer, copyRgb24RectToScreenBuffer, drawRectOutline, getClippedScaleFactor, getPaletteEntry as readPaletteEntry, getRootCanvasElement, presentScreen, resolveScaler, setPalette as writePalette, setPaletteColor as writePaletteColor } from './systemstub-canvas'
import { applyKeyDown, applyKeyUp, queueBrowserEvent, resetPlayerInput } from './systemstub-input'
import { defaultScaleParameters, dfDblocks, dfFastmode, dfSetlife, dirDown, dirLeft, dirRight, dirUp } from './systemstub-types'
import type { PlayerInput, ScalerParameters } from './systemstub-types'

type AudioCallback = (param: any, stream: Int16Array, len: number) => void

class SystemStub {
	_pi: PlayerInput
	_canvas: HTMLCanvasElement
	_context: CanvasRenderingContext2D
	_imageData: ImageData
	_scaler: Scaler
	_scaleFactor: number
	_caption: string
	_texW: number
	_texH: number
	_screenBuffer: Uint8ClampedArray
	_fadeOnUpdateScreen: boolean
	_fullscreen: boolean
	_overscanColor: number
	_screenW: number
	_screenH: number
	_scalerType: ScalerType
	_wideMargin: number
	_screenshot: number
	_audioCbData: ArrayBuffer
	_audioContext: AudioContext
	_audioPlayer: AudioWorkletNode
	_sfxPlayer: AudioWorkletNode
	_audioInitFailed: boolean
	_audioUnavailableWarned: boolean
	_unsupportedWarnings: Record<string, boolean>
	_events: Event[] = new Array()
	_game: Game | null
	_rgbPalette: Uint8ClampedArray = new Uint8ClampedArray(256*4)
	_darkPalette: Uint8ClampedArray = new Uint8ClampedArray(256
		*4)
	_kAudioHz: number

	constructor() {
		this._audioContext = createAudioContext()
		this._audioInitFailed = false
		this._audioUnavailableWarned = false
		this._unsupportedWarnings = {}
		this._game = null
		this.resumeAudio()
	}

	private warnUnsupportedOnce(feature: string, message: string) {
		if (this._unsupportedWarnings[feature]) {
			return
		}
		this._unsupportedWarnings[feature] = true
		console.warn(message)
	}

	initCanvas(w: number, h: number) {
		const canvas = getRootCanvasElement()
		this._canvas = canvas
		const context = canvas.getContext('2d')
		if (!context) {
			throw new Error('Unable to acquire 2D canvas context')
		}
		this._context = context
		applyCanvasStyles(canvas, w, h)
	}

	async initAudio() {
		try {
			const initializedAudio = await initializeAudioNodes(
				this._audioContext,
				this.onSoundProcessorMessage,
				this.onSFXProcessorMessage
			)
			this._audioPlayer = initializedAudio.audioPlayer
			this._sfxPlayer = initializedAudio.sfxPlayer
			this._kAudioHz = initializedAudio.outputSampleRate
			this._audioInitFailed = false
		} catch(e) {
			this._audioInitFailed = true
			console.error('error setting up audio')
			console.dir(e)
		}
	}

	resumeAudio = () => {
		return resumeAudioContext(this._audioContext)
	}

	onSoundProcessorMessage = (_event: MessageEvent) => {
	}

	onSFXProcessorMessage = (_event: MessageEvent) => {
	}

	postMessageToSoundProcessor(message) {
		if (!postWorkletMessage(this._audioPlayer, message)) {
			if (!this._audioUnavailableWarned) {
				const suffix = this._audioInitFailed ? ' (audio init failed earlier)' : ''
				console.warn(`Cannot send message to sound processor: not available${suffix}`)
				this._audioUnavailableWarned = true
			}
		}
	}

	postMessageToSFXProcessor(message) {
		if (!postWorkletMessage(this._sfxPlayer, message)) {
			if (!this._audioUnavailableWarned) {
				const suffix = this._audioInitFailed ? ' (audio init failed earlier)' : ''
				console.warn(`Cannot send message to sfx processor: not available${suffix}`)
				this._audioUnavailableWarned = true
			}
		}
	}	

	onKeyDown = (event: KeyboardEvent) => {
		this.resumeAudio()
		applyKeyDown(this._pi, event.key)
	}

	onKeyUp = (event: KeyboardEvent) => {
		applyKeyUp(this._pi, event.key)
	}

	initEvents() {
		document.addEventListener('keyup', this.onKbEvent)
		document.addEventListener('keydown', this.onKbEvent)
		document.addEventListener('click', this.resumeAudio)
	}

	onKbEvent = (event: Event) => {
		queueBrowserEvent(this._events, event)
	}

	async init(title: string, w: number, h: number, fullscreen: boolean, scalerParameters: ScalerParameters) {
		this.initCanvas(w, h)
		await this.initAudio()
		this.initEvents()
		this._scaleFactor = 1
		this._pi = resetPlayerInput()
		this._screenBuffer = null
		this._fadeOnUpdateScreen = false
		this._fullscreen = fullscreen
		this._scalerType = ScalerType.kScalerTypeInternal
		this._scaleFactor = 1
		this._scaler = null

		if (scalerParameters.name.length) {
			this.setScaler(scalerParameters)
		}
		this._rgbPalette = new Uint8ClampedArray(256 * 4)
		this._darkPalette = new Uint8ClampedArray(256 * 4)
		this._screenW = this._screenH = 0
		this._wideMargin = 0
		this.setScreenSize(w, h)
		this._screenshot = 1
	}

	setScaler(parameters: ScalerParameters) {
		const scalerConfig = resolveScaler(parameters.name)
		if (!scalerConfig) {
			throw 'systemStub_web::setScalers scaler not found!'
		}
		this._scalerType = scalerConfig.type
		this._scaler = scalerConfig.scaler
		this._scaleFactor = getClippedScaleFactor(this._scaler, parameters.factor)
	}

	setScreenSize(w: number, h: number) {
		if (this._screenW === w && this._screenH === h) {
			return
		}

		this.cleanupGraphics()
		if (this._screenBuffer) {
			this._screenBuffer = null
		}
		const screenBufferSize = w * h
		this._imageData = this._context.createImageData(w, h)
		this._screenBuffer = this._imageData.data

		if (!this._screenBuffer) {
			throw(`systemstubWeb::setScreenSize() Unable to allocate offscreen buffer, w=${w}, h=${h}`)
		}
		this._screenW = w
		this._screenH = h
		this.prepareGraphics()
	}

	setPaletteColor(color: number, r: number, g: number, b: number) {
		writePaletteColor(this._rgbPalette, this._darkPalette, color, r, g, b)
	}

	setPalette(pal: Uint8Array,  n: number) {
		writePalette(this._rgbPalette, this._darkPalette, pal, n)
	}

	setPaletteEntry(i: number, c: Color) {
		this.setPaletteColor(i, c.r, c.g, c.b)
	}

	getPaletteEntry(i: number, c: Color) {
		readPaletteEntry(this._rgbPalette, i, c)
	}

	copyRect(x: number, y: number, w: number, h: number, buf: Uint8Array, pitch: number) {
		copyIndexedRectToScreenBuffer(this._rgbPalette, this._screenBuffer, this._screenW, this._screenH, x, y, w, h, buf, pitch)
		if (this._pi.dbgMask & dfDblocks) {
			throw('not implemented!')
		}
	}

	setOverscanColor(i: number) {
		this._overscanColor = i
	}

	cleanupGraphics() {
	}

	prepareGraphics() {
		this._texW = this._screenW
		this._texH = this._screenH
	}

	startAudio(_callback: AudioCallback, _param: any) {
		this.warnUnsupportedOnce('startAudio', 'SystemStub.startAudio() is not used by the web adapter; audio is initialized through AudioWorklet setup.')
	}

	fadeScreen() {
		this._fadeOnUpdateScreen = true
	}

	copyRectRgb24(x: number, y: number, w: number, h: number, rgb: Uint8Array) {
		copyRgb24RectToScreenBuffer(this._screenBuffer, this._screenW, this._screenH, x, y, w, h, rgb)
		if (this._pi.dbgMask & dfDblocks) {
			this.drawRect(x, y, w, h, 0xE7)
		}
	}

	async updateScreen(shakeOffset: number) {
		this._fadeOnUpdateScreen = await presentScreen(
			this._context,
			this._imageData,
			this._screenW,
			this._screenH,
			this._scaleFactor,
			this._fadeOnUpdateScreen,
			shakeOffset,
			(duration) => this.sleep(duration)
		)
	}

	getTimeStamp() {
		return new Date().getTime()
	}

	async sleep(duration: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, duration))
	}

	clearWidescreen() {
		this.warnUnsupportedOnce('clearWidescreen', 'SystemStub.clearWidescreen() is not implemented in the web adapter.')
	} 

	async processEvents() {
		let paused = false
		while (true) {
			while (this._events.length) {
				this.processEvent(this._events.shift())
				if (this._pi.quit) {
					return
				}
			}
			if (!paused) {
				break
			}
			await this.sleep(100)
		}
	}

	processEvent = (e: Event) => {
		switch(e.type) {
			case 'keydown':
				this.onKeyDown(e as KeyboardEvent)
				break

			case 'keyup':
				this.onKeyUp(e as KeyboardEvent)
				break				
		}
	}

	getOutputSampleRate() {
		return this._kAudioHz
	}

	copyWidescreenLeft(w: number, h: number, buf: Uint8Array) {
		this.warnUnsupportedOnce('copyWidescreenLeft', 'SystemStub.copyWidescreenLeft() is not implemented in the web adapter.')
	}

	copyWidescreenRight(w: number, h: number, buf: Uint8Array) {
		this.warnUnsupportedOnce('copyWidescreenRight', 'SystemStub.copyWidescreenRight() is not implemented in the web adapter.')
	}

	copyWidescreenMirror( w: number, h: number, buf: Uint8Array) {
		this.warnUnsupportedOnce('copyWidescreenMirror', 'SystemStub.copyWidescreenMirror() is not implemented in the web adapter.')
	}

	copyWidescreenBlur( w: number, h: number, buf: Uint8Array) {
		this.warnUnsupportedOnce('copyWidescreenBlur', 'SystemStub.copyWidescreenBlur() is not implemented in the web adapter.')
	}

	drawRect(x: number, y: number, w: number, h: number, color: number) {
		const x1 = x
		const y1 = y
		const x2 = x + w - 1
		const y2 = y + h - 1
		assert(!(x1 < 0 && x2 >= this._screenW && y1 < 0 && y2 >= this._screenH), `Assertion failed: ${x1} < 0 && ${x2} >= ${this._screenW} && ${y1} < 0 && ${y2} >= ${this._screenH}`)
		drawRectOutline(this._screenBuffer, this._rgbPalette, this._screenW, this._screenH, x, y, w, h, color)
	}
}

export { ScalerParameters, defaultScaleParameters, PlayerInput, SystemStub, dfFastmode, dfDblocks, dfSetlife, dirUp, dirLeft, dirRight, dirDown }
