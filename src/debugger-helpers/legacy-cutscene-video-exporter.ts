import { Color } from "../intern"
import { Resource } from "../resource"
import { Video } from "../video"
import { LegacyCutscenePlayer } from "../cutscene-players/legacy-cutscene-player"
import type { SystemStub } from "../systemstub_web"

type CapturedFrame = {
    rgb: Uint8Array
    durationMs: number
}

type ExportOptions = {
    dataDir: string
    cutName: string
    outputPath: string
    entryOffset?: number
    fps?: number
    outputWidth?: number
    outputHeight?: number
}

const CUTSCENE_W = 256
const CUTSCENE_H = 224

type PlayerInputState = {
    dirMask: number
    enter: boolean
    space: boolean
    shift: boolean
    backspace: boolean
    escape: boolean
    lastChar: string
    save: boolean
    load: boolean
    stateSlot: number
    rewind: boolean
    dbgMask: number
    quit: boolean
}

class HeadlessSystemStub {
    _pi: PlayerInputState = {
        dirMask: 0,
        enter: false,
        space: false,
        shift: false,
        backspace: false,
        escape: false,
        lastChar: '',
        save: false,
        load: false,
        stateSlot: 0,
        rewind: false,
        dbgMask: 0,
        quit: false
    }

    private _rgbPalette = new Uint8Array(256 * 3)
    private _screen = new Uint8Array(CUTSCENE_W * CUTSCENE_H)
    private _capturedFrames: CapturedFrame[] = []
    private _virtualTimeMs = 0
    private _lastPresentedAt = 0

    setPaletteEntry(index: number, color: Color) {
        const dst = index * 3
        this._rgbPalette[dst + 0] = color.r
        this._rgbPalette[dst + 1] = color.g
        this._rgbPalette[dst + 2] = color.b
    }

    copyRect(x: number, y: number, w: number, h: number, src: Uint8Array, pitch: number) {
        this.blitRect(x, y, w, h, src, pitch)
    }

    presentLayer(layer: Uint8Array, pitch: number) {
        this._screen.fill(0)
        this.blitRect(0, 0, pitch, Math.floor(layer.length / pitch), layer, pitch)
    }

    private blitRect(x: number, y: number, w: number, h: number, src: Uint8Array, pitch: number) {
        for (let row = 0; row < h; ++row) {
            const srcOffset = row * pitch + x
            const rowData = src.subarray(srcOffset, Math.min(src.length, srcOffset + w))
            if (rowData.length === 0) {
                break
            }
            const dstOffset = (y + row) * CUTSCENE_W + x
            const available = Math.max(0, this._screen.length - dstOffset)
            if (available <= 0) {
                break
            }
            this._screen.set(rowData.subarray(0, Math.min(rowData.length, available)), dstOffset)
        }
    }

    async updateScreen(_shakeOffset: number) {
        const elapsed = this._virtualTimeMs - this._lastPresentedAt
        if (this._capturedFrames.length !== 0) {
            this._capturedFrames[this._capturedFrames.length - 1].durationMs = Math.max(1, elapsed)
        }
        this._capturedFrames.push({
            rgb: this.toRgbFrame(),
            durationMs: 0
        })
        this._lastPresentedAt = this._virtualTimeMs
    }

    async processEvents() {
        return
    }

    async sleep(duration: number) {
        this._virtualTimeMs += Math.max(0, duration)
    }

    getTimeStamp() {
        return this._virtualTimeMs
    }

    finishFrames(defaultDurationMs: number) {
        if (this._capturedFrames.length !== 0) {
            const last = this._capturedFrames[this._capturedFrames.length - 1]
            last.durationMs = Math.max(last.durationMs, defaultDurationMs)
        }
    }

    getFrames() {
        return this._capturedFrames
    }

    private toRgbFrame() {
        const rgb = new Uint8Array(this._screen.length * 3)
        for (let i = 0; i < this._screen.length; ++i) {
            const srcOffset = this._screen[i] * 3
            const dstOffset = i * 3
            rgb[dstOffset + 0] = this._rgbPalette[srcOffset + 0]
            rgb[dstOffset + 1] = this._rgbPalette[srcOffset + 1]
            rgb[dstOffset + 2] = this._rgbPalette[srcOffset + 2]
        }
        return rgb
    }
}

class CutsceneVideoExporter {
    static async exportVideo(options: ExportOptions) {
        const fs = require('fs')
        const path = require('path')
        const childProcess = require('child_process')
        const os = require('os')

        const entryOffset = options.entryOffset ?? 0
        const fps = options.fps ?? 30
        const outputWidth = options.outputWidth ?? CUTSCENE_W
        const outputHeight = options.outputHeight ?? CUTSCENE_H
        const cmd = CutsceneVideoExporter.readDataFile(options.dataDir, options.cutName, 'cmd')
        const pol = CutsceneVideoExporter.readDataFile(options.dataDir, options.cutName, 'pol')
        const fnt = CutsceneVideoExporter.readDataFile(options.dataDir, 'FB_TXT', 'fnt')

        const res = new Resource(null as any)
        res._cmd = cmd
        res._pol = pol
        res._fnt = fnt

        const cineBinPath = CutsceneVideoExporter.resolveDataFile(options.dataDir, 'ENGCINE', 'bin')
        const cineTxtPath = CutsceneVideoExporter.resolveDataFile(options.dataDir, 'ENGCINE', 'txt')
        if (cineBinPath && cineTxtPath) {
            res._cine_off = new Uint8Array(fs.readFileSync(cineBinPath))
            res._cine_txt = new Uint8Array(fs.readFileSync(cineTxtPath))
        }

        const stub = new HeadlessSystemStub()
        const vid = new Video(res, stub as unknown as SystemStub)
        const cut = new LegacyCutscenePlayer(res, stub as unknown as SystemStub, vid)

        cut.prepare()

        await cut.mainLoop(entryOffset)
        let frames = stub.getFrames()
        if (frames.length === 0) {
            const currentPage = ((cut as any)._page0 as Uint8Array) || vid._frontLayer
            stub.presentLayer(currentPage, vid._w)
            await stub.updateScreen(0)
            frames = stub.getFrames()
        }
        stub.finishFrames(75)
        if (frames.length === 0) {
            throw new Error(`No frames were captured for '${options.cutName}'`)
        }

            const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flashback-cutscene-'))
        try {
            CutsceneVideoExporter.writeFrameSequence(tempDir, frames, fps)
            fs.mkdirSync(path.dirname(options.outputPath), { recursive: true })
            CutsceneVideoExporter.encodeVideo(tempDir, fps, options.outputPath, childProcess, outputWidth, outputHeight)
        } finally {
            fs.rmSync(tempDir, { recursive: true, force: true })
        }
    }

    private static writeFrameSequence(tempDir: string, frames: CapturedFrame[], fps: number) {
        const fs = require('fs')
        let frameIndex = 0
        for (const frame of frames) {
            const repeats = Math.max(1, Math.round(frame.durationMs * fps / 1000))
            for (let i = 0; i < repeats; ++i) {
                const outputPath = CutsceneVideoExporter.getFramePath(tempDir, frameIndex++)
                fs.writeFileSync(outputPath, CutsceneVideoExporter.makePpmPayload(frame.rgb))
            }
        }
    }

    private static encodeVideo(tempDir: string, fps: number, outputPath: string, childProcess: any, outputWidth: number, outputHeight: number) {
        const path = require('path')
        const ext = path.extname(outputPath).toLowerCase()
        const codec = ext === '.avi' ? 'mpeg4' : 'mpeg1video'
        const filters = (outputWidth !== CUTSCENE_W || outputHeight !== CUTSCENE_H)
            ? ['-vf', `scale=${outputWidth}:${outputHeight}`]
            : []
        try {
            childProcess.execFileSync('ffmpeg', [
                '-y',
                '-framerate', String(fps),
                '-i', path.join(tempDir, 'frame-%06d.ppm'),
                ...filters,
                '-c:v', codec,
                outputPath
            ], {
                stdio: 'inherit'
            })
        } catch (error) {
            throw new Error(`Failed to encode video with ffmpeg. Ensure ffmpeg is installed and available on PATH. ${error}`)
        }
    }

    private static makePpmPayload(rgb: Uint8Array) {
        const header = new TextEncoder().encode(`P6\n${CUTSCENE_W} ${CUTSCENE_H}\n255\n`)
        const payload = new Uint8Array(header.length + rgb.length)
        payload.set(header, 0)
        payload.set(rgb, header.length)
        return payload
    }

    private static getFramePath(tempDir: string, index: number) {
        const path = require('path')
        return path.join(tempDir, `frame-${index.toString().padStart(6, '0')}.ppm`)
    }

    private static readDataFile(dataDir: string, baseName: string, ext: string) {
        const fs = require('fs')
        const resolved = CutsceneVideoExporter.resolveDataFile(dataDir, baseName, ext)
        if (!resolved) {
            throw new Error(`Missing '${baseName}.${ext}' in '${dataDir}'`)
        }
        return new Uint8Array(fs.readFileSync(resolved))
    }

    private static resolveDataFile(dataDir: string, baseName: string, ext: string) {
        const fs = require('fs')
        const path = require('path')
        const candidates = [
            path.join(dataDir, `${baseName}.${ext.toUpperCase()}`),
            path.join(dataDir, `${baseName}.${ext.toLowerCase()}`)
        ]
        for (const candidate of candidates) {
            if (fs.existsSync(candidate)) {
                return candidate
            }
        }
        return null
    }
}

export { CutsceneVideoExporter }
