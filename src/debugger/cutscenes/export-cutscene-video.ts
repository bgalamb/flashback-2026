import { Cutscene } from "../../cutscene-players/cutscene"
import { Color, Language, ResourceType, WidescreenMode } from "../../core/intern"
import { Resource } from "../../resource/resource"
import { _cineSceneVideoOverridesDOS } from "../../core/staticres"
import { Video } from "../../video/video"

type CapturedFrame = {
    rgb: Uint8Array
    durationMs: number
}

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
    private _screen = new Uint8Array(0)
    private _screenW = 0
    private _screenH = 0
    private _capturedFrames: CapturedFrame[] = []
    private _virtualTimeMs = 0
    private _lastPresentedAt = 0

    setScreenSize(w: number, h: number) {
        this._screenW = w
        this._screenH = h
        this._screen = new Uint8Array(w * h)
    }

    setPaletteEntry(index: number, color: Color) {
        const dst = index * 3
        this._rgbPalette[dst] = color.r
        this._rgbPalette[dst + 1] = color.g
        this._rgbPalette[dst + 2] = color.b
    }

    copyRect(x: number, y: number, w: number, h: number, src: Uint8Array, pitch: number) {
        for (let row = 0; row < h; ++row) {
            const srcOffset = row * pitch + x
            const dstOffset = (y + row) * this._screenW + x
            this._screen.set(src.subarray(srcOffset, srcOffset + w), dstOffset)
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
            rgb[dstOffset] = this._rgbPalette[srcOffset]
            rgb[dstOffset + 1] = this._rgbPalette[srcOffset + 1]
            rgb[dstOffset + 2] = this._rgbPalette[srcOffset + 2]
        }
        return rgb
    }
}

function printUsage() {
    console.error("Usage: npx ts-node --transpile-only ./src/debugger-helpers/export-cutscene-video.ts <dataDir> <cutsceneId> <output.(avi|mp4)>")
}

function getFileExtension(outputPath: string) {
    const path = require("path")
    const ext = path.extname(outputPath).toLowerCase()
    if (ext !== ".avi" && ext !== ".mp4") {
        throw new Error(`Unsupported output extension '${ext}'. Use .avi or .mp4.`)
    }
    return ext
}

function makePpmPayload(w: number, h: number, rgb: Uint8Array) {
    const header = new TextEncoder().encode(`P6\n${w} ${h}\n255\n`)
    const payload = new Uint8Array(header.length + rgb.length)
    payload.set(header, 0)
    payload.set(rgb, header.length)
    return payload
}

function getFramePath(tempDir: string, index: number) {
    const path = require("path")
    return path.join(tempDir, `frame-${index.toString().padStart(6, "0")}.ppm`)
}

function writeFrameSequence(tempDir: string, w: number, h: number, frames: CapturedFrame[], fps: number) {
    const fs = require("fs")
    let frameIndex = 0
    for (const frame of frames) {
        const repeats = Math.max(1, Math.round(frame.durationMs * fps / 1000))
        for (let i = 0; i < repeats; ++i) {
            fs.writeFileSync(getFramePath(tempDir, frameIndex++), makePpmPayload(w, h, frame.rgb))
        }
    }
}

function encodeVideo(tempDir: string, fps: number, outputPath: string) {
    const childProcess = require("child_process")
    const path = require("path")
    const ext = getFileExtension(outputPath)
    const args = [
        "-y",
        "-framerate", String(fps),
        "-i", path.join(tempDir, "frame-%06d.ppm")
    ]
    if (ext === ".avi") {
        args.push("-c:v", "mpeg4")
    } else {
        args.push("-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart")
    }
    args.push(outputPath)
    childProcess.execFileSync("ffmpeg", args, {
        stdio: "inherit"
    })
}

async function main() {
    const fsNode = require("fs")
    const os = require("os")
    const path = require("path")

    const args = process.argv.slice(2)
    if (args.length !== 3) {
        printUsage()
        process.exit(1)
    }

    const [dataDir, cutsceneIdArg, outputPath] = args
    const cutsceneId = Number(cutsceneIdArg)
    if (!Number.isInteger(cutsceneId) || cutsceneId < 0) {
        printUsage()
        process.exit(1)
    }

    const stub = new HeadlessSystemStub()
    const res = new Resource(null as any, ResourceType.kResourceTypeDOS, Language.LANG_EN)
    const vid = new Video(res, stub as any, WidescreenMode.kWidescreenNone)
    stub.setScreenSize(vid._w, vid._h)
    const cut = new Cutscene(res, stub as any, vid)

    const cutNameRaw = Cutscene._offsetsTableDOS[cutsceneId * 2]
    const cutOff = Cutscene._offsetsTableDOS[cutsceneId * 2 + 1]
    const sceneKey = `${cutNameRaw}:${cutOff}`
    const mappedVideo = _cineSceneVideoOverridesDOS.find((entry) => (
        entry.sceneId === cutsceneId &&
        entry.cutNameIndex === cutNameRaw &&
        entry.cutOffset === cutOff
    ))
    const mappedVideoPath = mappedVideo ? mappedVideo.mpegFileName : null
    if (cutNameRaw === 0xFFFF) {
        throw new Error(`Cutscene id 0x${cutsceneId.toString(16)} does not map to a DOS cutscene resource`)
    }
    const cutName = Cutscene._namesTableDOS[cutNameRaw & 0xFF]
    if (!cutName) {
        throw new Error(`Invalid cutscene name index 0x${cutNameRaw.toString(16)} for cutscene id 0x${cutsceneId.toString(16)}`)
    }
    console.log(`Exporting scene key '${sceneKey}'${mappedVideoPath ? ` (${mappedVideoPath})` : ""}`)

    res._fnt = readDataFile(dataDir, "FB_TXT", "FNT")
    res._cmd = readDataFile(dataDir, cutName, "CMD")
    res._pol = readDataFile(dataDir, cutName, "POL")
    res._cine_off = readDataFile(dataDir, "ENGCINE", "BIN")
    res._cine_txt = readDataFile(dataDir, "ENGCINE", "TXT")

    if (process.env.DEBUG_CAPTIONS === "1") {
        const originalDrawCaptionText = cut.op_drawCaptionText.bind(cut)
        const wrappedDrawCaptionText = function() {
            const peekOffset = this._cmdPtrOffset
            const strId = this.fetchNextCmdWord()
            this._cmdPtrOffset = peekOffset
            const raw = strId !== 0xFFFF ? this._res.getCineString(strId) : null
            const text = raw ? new TextDecoder().decode(raw).split("\u0000")[0].replace(/\n/g, "|") : "<clear>"
            console.log(`[caption t=${stub.getTimeStamp()}ms id=${strId}] ${text}`)
            return originalDrawCaptionText()
        } as any
        cut.op_drawCaptionText = wrappedDrawCaptionText
        cut._opcodeTable[6] = wrappedDrawCaptionText
    }

    cut._id = cutsceneId
    cut._creditsSequence = false
    cut._textCurBuf = null
    cut.prepare()
    await cut.mainLoop(cutOff)

    stub.finishFrames(75)
    const frames = stub.getFrames()
    if (frames.length === 0) {
        throw new Error(`No frames were captured for cutscene id 0x${cutsceneId.toString(16)}`)
    }

    const fps = 30
    const tempDir = fsNode.mkdtempSync(path.join(os.tmpdir(), "flashback-cutscene-"))
    try {
        writeFrameSequence(tempDir, vid._w, vid._h, frames, fps)
        fsNode.mkdirSync(path.dirname(outputPath), { recursive: true })
        encodeVideo(tempDir, fps, outputPath)
    } finally {
        fsNode.rmSync(tempDir, { recursive: true, force: true })
    }

    console.log(`Wrote ${outputPath}`)
}

function resolveDataFile(dataDir: string, baseName: string, ext: string) {
    const fsNode = require("fs")
    const path = require("path")
    const candidates = [
        path.join(dataDir, `${baseName}.${ext.toUpperCase()}`),
        path.join(dataDir, `${baseName}.${ext.toLowerCase()}`)
    ]
    for (const candidate of candidates) {
        if (fsNode.existsSync(candidate)) {
            return candidate
        }
    }
    return null
}

function readDataFile(dataDir: string, baseName: string, ext: string) {
    const fsNode = require("fs")
    const resolved = resolveDataFile(dataDir, baseName, ext)
    if (!resolved) {
        throw new Error(`Missing '${baseName}.${ext}' in '${dataDir}'`)
    }
    return new Uint8Array(fsNode.readFileSync(resolved))
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
})
