import { execFileSync } from "child_process"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"

import { Cutscene } from "../cutscene"
import { Color, Language, ResourceType, WidescreenMode } from "../intern"
import { Resource } from "../resource"
import { _modulesFiles, _musicTable, _namesTable } from "../staticres"
import { Video } from "../video"

type CapturedFrame = {
    durationMs: number
    rgb: Uint8Array
}

type ManifestEntry = {
    audioSource: string | null
    captionsEnabled: boolean
    cutsceneId: number
    cutsceneName: string
    durationCapMs: number | null
    entryOffset: number
    exportScale: number
    moduleName: string | null
    outputPath: string
    routedName: string | null
}

type ExportVariant = {
    captionsEnabled: boolean
    labelSuffix: string
    scale: number
}

type LegacyLoopOptions = {
    stopOnFirstAdvancePrompt?: boolean
}

type MissionBriefing = {
    fileId: string
    sections: Array<{
        body: string
        title: string
    }>
    salary: string
    user: string
}

type PlayerInputState = {
    backspace: boolean
    dbgMask: number
    dirMask: number
    enter: boolean
    escape: boolean
    lastChar: string
    load: boolean
    quit: boolean
    rewind: boolean
    save: boolean
    shift: boolean
    space: boolean
    stateSlot: number
}

const HISTORICAL_COMMIT = "d5e794a6d8857c52d49099baf50b3efca5094361"
const DEFAULT_FPS = 30
const EXPORT_LAYER_SCALE = 2
const GLOBAL_SAFETY_LIMIT_MS = 120_000
const MISSION_BRIEFING_LIMIT_MS = 2_500
const MISSION_LIMIT_MS = 90_000
const MISSION_PAGE_HOLD_MS = 5_000
const SCORE_LIMIT_MS = 3_000

const MISSION_BRIEFINGS: Record<string, MissionBriefing> = {
    MISSION1: {
        fileId: "4324XB35",
        sections: [
            {
                title: "Object:",
                body: 'Receipt of parcel at the|Spaceport (Station ASIA)|and transportation to|"TITAN TRAVEL AGENCY"|(Station AFRICA).'
            }
        ],
        salary: "100 credits.",
        user: "TITAN SPACE LINES."
    },
    MISSION2: {
        fileId: "4324XB40",
        sections: [
            {
                title: "Object:",
                body: "Escort a VIP to the|Research Center. The|VIP will wait for you|at the entry to|Restricted Area 2."
            },
            {
                title: "Note:",
                body: "You'll need to be armed as|the area may be dangerous."
            }
        ],
        salary: "300 credits.",
        user: "VITAL Corp."
    },
    MISSION3: {
        fileId: "4334KR42",
        sections: [
            {
                title: "Object:",
                body: "A model CY-BORG 2.1|duplicator has escaped.|We believe it may have had|outside assistance."
            },
            {
                title: "Note:",
                body: "Your mission is to find it|and ELIMINATE it before|the virus controlling its|bio-brain can multiply.|You will be supplied with a|photograph of the individual.|Be careful, this machine is|dangerous."
            }
        ],
        salary: "400 credits.",
        user: "TITAN TV."
    },
    MISSION4: {
        fileId: "433TX102 PRIORITY REQUESTS",
        sections: [
            {
                title: "Object:",
                body: 'The generator which supplies|"NEW WASHINGTON" is|encountering|serious problems.|A maintenance check has|revealed that one of the|three boards on the main|computer has been altered.'
            },
            {
                title: "Note:",
                body: "Your mission is to replace|this board. However, you|will only have one-and-a-half|minutes before the whole|installation self-destructs.|The teleport on the level|below will take you directly|to the heart of the complex."
            }
        ],
        salary: "500 credits.",
        user: "TITAN Senior Advisory Board"
    },
    MISSION5: {
        fileId: "434TX103",
        sections: [
            {
                title: "Object:",
                body: 'The Restricted Area 3 has|been invaded tonight by a|colony of mutants. We fear|they will attack the|population.'
            },
            {
                title: "Note:",
                body: "Your mission is to clean|up this zone."
            }
        ],
        salary: "600 credits.",
        user: "New Washington City."
    }
}

const AUDIO_MP3_BY_MODULE: Record<string, string> = {
    ascenseur: "flashback -14- in the lift.mp3",
    ceinture: "flashback -08- gravity belt - escaping from the jungle.mp3",
    debut: "flashback -04- wake up in the jungle.mp3",
    desinteg: "flashback -19- desintegration.mp3",
    donneobj: "flashback -05- received an object.mp3",
    fin: "flashback -17- destruction of the alien planet - ending.mp3",
    game_over: "flashback -20- game over.mp3",
    holocube: "flashback -06- the holocube.mp3",
    intro: "flashback -01- intro.mp3",
    journal: "flashback -10- searching for a job.mp3",
    level4: "flashback -13- teleportation part.a.mp3",
    logo: "flashback -00- logo.mp3",
    memoire: "flashback -09- recovering memory.mp3",
    missions: "flashback -10- searching for a job.mp3",
    missions2: "flashback -10- searching for a job.mp3",
    options: "flashback -02- options screen a.mp3",
    planetexplo: "flashback -17- destruction of the alien planet - ending.mp3",
    reunion: "flashback -15- secret meeting - captured by the aliens.mp3",
    taxi: "flashback -12- taxi.mp3",
    voyage: "flashback -11- traveling to earth.mp3"
}

class HeadlessSystemStub {
    _pi: PlayerInputState = {
        backspace: false,
        dbgMask: 0,
        dirMask: 0,
        enter: false,
        escape: false,
        lastChar: "",
        load: false,
        quit: false,
        rewind: false,
        save: false,
        shift: false,
        space: false,
        stateSlot: 0
    }

    private readonly _deadlineMs: number | null
    private readonly _rgbPalette = new Uint8Array(256 * 3)
    private _capturedFrames: CapturedFrame[] = []
    private _lastPresentedAt = 0
    private _screen = new Uint8Array(0)
    private _screenH = 0
    private _screenW = 0
    private _virtualTimeMs = 0

    constructor(deadlineMs: number | null) {
        this._deadlineMs = deadlineMs
    }

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
            durationMs: 0,
            rgb: this.toRgbFrame()
        })
        this._lastPresentedAt = this._virtualTimeMs
        this.enforceDeadline()
    }

    async processEvents() {
        this.enforceDeadline()
    }

    async sleep(duration: number) {
        this._virtualTimeMs += Math.max(0, duration)
        this.enforceDeadline()
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

    private enforceDeadline() {
        if (this._deadlineMs !== null && this._virtualTimeMs >= this._deadlineMs) {
            this._pi.backspace = true
        }
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

class ResourceResolver {
    private readonly _blobCache = new Map<string, Uint8Array>()
    private readonly _commitListCache = new Map<string, string[]>()
    private readonly _historicalCommit: string
    private readonly _rootDir: string

    constructor(rootDir: string, historicalCommit: string) {
        this._rootDir = rootDir
        this._historicalCommit = historicalCommit
    }

    readFont() {
        return this.readFirstExisting([
            path.join(this._rootDir, "dist", "DATA", "fb_txt.fnt"),
            path.join(this._rootDir, "DATA", "fb_txt.fnt")
        ], [
            "DATA/fb_txt.fnt"
        ], "font")
    }

    readCineOffset() {
        return this.readFirstExisting([
            path.join(this._rootDir, "dist", "DATA", "legacy", "legacyvideos", "video_text_captions", "engcine.bin")
        ], [
            "DATA/videos/legacyvideos/video_text_captions/engcine.bin"
        ], "engcine.bin")
    }

    readCineText() {
        return this.readFirstExisting([
            path.join(this._rootDir, "dist", "DATA", "legacy", "legacyvideos", "video_text_captions", "engcine.txt")
        ], [
            "DATA/videos/legacyvideos/video_text_captions/engcine.txt"
        ], "engcine.txt")
    }

    readCutsceneCommand(cutsceneName: string) {
        return this.readSceneBlob(cutsceneName, "cmd")
    }

    readCutscenePolygon(cutsceneName: string) {
        return this.readSceneBlob(cutsceneName, "pol")
    }

    resolveAudioPath(moduleName: string | null) {
        if (!moduleName) {
            return null
        }
        const oggPath = path.join(this._rootDir, "dist", "DATA", "music", "ogg", `${moduleName}.ogg`)
        if (fs.existsSync(oggPath)) {
            return oggPath
        }
        const mp3FileName = AUDIO_MP3_BY_MODULE[moduleName]
        if (!mp3FileName) {
            return null
        }
        const mp3Path = path.join(this._rootDir, "dist", "DATA", "music", "mp3", mp3FileName)
        return fs.existsSync(mp3Path) ? mp3Path : null
    }

    private readSceneBlob(cutsceneName: string, ext: "cmd" | "pol") {
        const lower = cutsceneName.toLowerCase()
        return this.readFirstExisting([
            path.join(this._rootDir, "dist", "DATA", "legacy", "legacyvideos", `${lower}.${ext}`)
        ], [
            `DATA/${lower}.${ext}`,
            `DATA/videos/legacyvideos/${lower}.${ext}`
        ], `${cutsceneName}.${ext}`)
    }

    private readFirstExisting(localPaths: string[], historicalPaths: string[], label: string) {
        for (const localPath of localPaths) {
            if (fs.existsSync(localPath)) {
                return new Uint8Array(fs.readFileSync(localPath))
            }
        }
        for (const historicalPath of historicalPaths) {
            for (const commit of this.getCandidateCommits(historicalPath)) {
                const cacheKey = `${commit}:${historicalPath}`
                const cached = this._blobCache.get(cacheKey)
                if (cached) {
                    return cached
                }
                try {
                    const buf: Buffer = execFileSync("git", ["show", `${commit}:${historicalPath}`], {
                        cwd: this._rootDir
                    })
                    const data = new Uint8Array(buf)
                    this._blobCache.set(cacheKey, data)
                    return data
                } catch {
                    continue
                }
            }
        }
        throw new Error(`Unable to resolve ${label}`)
    }

    private getCandidateCommits(historicalPath: string) {
        const cached = this._commitListCache.get(historicalPath)
        if (cached) {
            return cached
        }
        const commits: string[] = [this._historicalCommit]
        try {
            const output = execFileSync("git", ["rev-list", "--all", "--", historicalPath], {
                cwd: this._rootDir,
                encoding: "utf8"
            })
            for (const commit of output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)) {
                if (!commits.includes(commit)) {
                    commits.push(commit)
                }
            }
        } catch {
            // ignore and fall back to the preferred commit
        }
        this._commitListCache.set(historicalPath, commits)
        return commits
    }
}

function printUsage() {
    console.error("Usage: npx ts-node --transpile-only ./src/debugger-helpers/export-all-cutscene-cmdpol-videos.ts [outputDir]")
}

function getFramePath(tempDir: string, index: number) {
    return path.join(tempDir, `frame-${index.toString().padStart(6, "0")}.ppm`)
}

function getSceneOutputPath(outputDir: string, cutsceneId: number, routedName: string | null, cutsceneName: string, variant: ExportVariant) {
    const label = routedName || cutsceneName
    return path.join(outputDir, `${cutsceneId.toString().padStart(2, "0")}-${sanitizeName(label)}${variant.labelSuffix}.mp4`)
}

function sanitizeName(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
}

function makePpmPayload(w: number, h: number, rgb: Uint8Array) {
    const header = new TextEncoder().encode(`P6\n${w} ${h}\n255\n`)
    const payload = new Uint8Array(header.length + rgb.length)
    payload.set(header, 0)
    payload.set(rgb, header.length)
    return payload
}

function writeFrameSequence(tempDir: string, w: number, h: number, frames: CapturedFrame[], fps: number) {
    let frameIndex = 0
    for (const frame of frames) {
        const repeats = Math.max(1, Math.round(frame.durationMs * fps / 1000))
        for (let i = 0; i < repeats; ++i) {
            fs.writeFileSync(getFramePath(tempDir, frameIndex++), makePpmPayload(w, h, frame.rgb))
        }
    }
}

function encodeVideo(tempDir: string, fps: number, outputPath: string, audioPath: string | null, trimToShortest: boolean) {
    const args = [
        "-y",
        "-framerate", String(fps),
        "-i", path.join(tempDir, "frame-%06d.ppm")
    ]
    if (audioPath) {
        args.push("-i", audioPath)
        if (trimToShortest) {
            args.push("-shortest")
        }
    }
    args.push(
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart"
    )
    if (audioPath) {
        args.push("-ar", "44100", "-ac", "2", "-c:a", "aac", "-b:a", "192k")
    }
    args.push(outputPath)
    execFileSync("ffmpeg", args, { stdio: "inherit" })
}

function getCutsceneIds() {
    const ids: number[] = []
    for (let cutsceneId = 0; cutsceneId < Cutscene._offsetsTableDOS.length / 2; ++cutsceneId) {
        const cutNameIndex = Cutscene._offsetsTableDOS[cutsceneId * 2]
        if (cutNameIndex !== 0xFFFF) {
            ids.push(cutsceneId)
        }
    }
    const requested = process.env.CUTSCENE_IDS
    if (!requested) {
        return ids
    }
    const selected = new Set(
        requested
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean)
            .map((value) => value.toLowerCase().startsWith("0x") ? parseInt(value, 16) : parseInt(value, 10))
            .filter((value) => Number.isInteger(value))
    )
    return ids.filter((id) => selected.has(id))
}

function isMissionCutscene(cutsceneName: string, routedName: string | null) {
    const upperCutsceneName = cutsceneName.toUpperCase()
    const upperRoutedName = routedName ? routedName.toUpperCase() : ""
    return upperCutsceneName === "MISSIONS" || upperRoutedName.startsWith("MISSION") || upperRoutedName.startsWith("MISS")
}

function getDurationCapMs(cutsceneName: string, cutsceneId: number, routedName: string | null) {
    if (cutsceneId === 0x48 || routedName === "SCORE") {
        return SCORE_LIMIT_MS
    }
    if (routedName && Object.prototype.hasOwnProperty.call(MISSION_BRIEFINGS, routedName)) {
        return MISSION_BRIEFING_LIMIT_MS
    }
    if (isMissionCutscene(cutsceneName, routedName)) {
        return MISSION_LIMIT_MS
    }
    return GLOBAL_SAFETY_LIMIT_MS
}

function getModuleName(cutsceneId: number) {
    const moduleIndex = _musicTable[cutsceneId]
    const moduleInfo = _modulesFiles[moduleIndex]
    return moduleInfo ? moduleInfo[0] || null : null
}

function getExportVariants(): ExportVariant[] {
    return [
        { captionsEnabled: true, labelSuffix: "-low", scale: 1 },
        { captionsEnabled: true, labelSuffix: "-mid", scale: 2 },
        { captionsEnabled: true, labelSuffix: "-high", scale: 4 }
    ]
}

function configureNativeExportScale(vid: Video, scale: number) {
    if (scale <= 1) {
        return
    }
    vid._layerScale = scale
    vid._w = Video.GAMESCREEN_W * scale
    vid._h = Video.GAMESCREEN_H * scale
    vid._layerSize = vid._w * vid._h
    vid._frontLayer = new Uint8Array(vid._layerSize)
    vid._backLayer = new Uint8Array(vid._layerSize)
    vid._tempLayer = new Uint8Array(vid._layerSize)
    vid._tempLayer2 = new Uint8Array(vid._layerSize)
    vid._screenBlocks = new Uint8Array((vid._w / 8) * (vid._h / 8))

    const originalDrawChar = vid._drawChar
    vid._drawChar = ((dst: Uint8Array, pitch: number, x: number, y: number, src: Uint8Array, color: number, chr: number) => {
        const scratchPitch = Video.CHAR_W
        const scratch = new Uint8Array(Video.CHAR_W * Video.CHAR_H)
        originalDrawChar(scratch, scratchPitch, 0, 0, src, color, chr)

        const scaledX = x * scale
        const scaledY = y * scale
        for (let srcY = 0; srcY < Video.CHAR_H; ++srcY) {
            for (let srcX = 0; srcX < Video.CHAR_W; ++srcX) {
                const value = scratch[srcY * scratchPitch + srcX]
                if (value === 0) {
                    continue
                }
                const dstBase = (scaledY + srcY * scale) * pitch + scaledX + srcX * scale
                for (let dy = 0; dy < scale; ++dy) {
                    const rowOffset = dstBase + dy * pitch
                    dst.fill(value, rowOffset, rowOffset + scale)
                }
            }
        }
    }) as typeof vid._drawChar
}

function patchHolocubeIntro(cut: Cutscene) {
    let captionCount = 0
    const original = cut.op_drawCaptionText.bind(cut)
    const replacement = function(this: Cutscene) {
        const peekOffset = this._cmdPtrOffset
        const strId = this.fetchNextCmdWord()
        this._cmdPtrOffset = peekOffset
        if (this._id === 0x11 && !this._creditsSequence && strId !== 0xFFFF && captionCount === 0) {
            this.fetchNextCmdWord()
            const h = 45 * this._vid._layerScale
            const y = Video.GAMESCREEN_H * this._vid._layerScale - h
            this._pageC.fill(0xC0, y * this._vid._w, y * this._vid._w + h * this._vid._w)
            this._page1.fill(0xC0, y * this._vid._w, y * this._vid._w + h * this._vid._w)
            this._page0.fill(0xC0, y * this._vid._w, y * this._vid._w + h * this._vid._w)
            const text = new TextEncoder().encode("Hey, it's me")
            this.drawText(0, 129, text, 0xEF, this._page1, 1)
            this.drawText(0, 129, text, 0xEF, this._pageC, 1)
            captionCount += 1
            return
        }
        if (strId !== 0xFFFF) {
            captionCount += 1
        }
        return original()
    } as typeof cut.op_drawCaptionText
    cut.op_drawCaptionText = replacement
    cut._opcodeTable[6] = replacement
}

function suppressCaptionDrawing(cut: Cutscene) {
    const noopCaption = function(this: Cutscene) {
        this.fetchNextCmdWord()
    } as typeof cut.op_drawCaptionText
    cut.op_drawCaptionText = noopCaption
    cut._opcodeTable[6] = noopCaption
}

function attachCaptionDebug(cut: Cutscene) {
    if (process.env.DEBUG_CAPTIONS !== "1") {
        return
    }
    const original = cut.op_drawCaptionText.bind(cut)
    const wrapped = function(this: Cutscene) {
        const peekOffset = this._cmdPtrOffset
        const strId = this.fetchNextCmdWord()
        this._cmdPtrOffset = peekOffset
        const raw = strId !== 0xFFFF ? this._res.getCineString(strId) : null
        const text = raw ? new TextDecoder().decode(raw).split("\u0000")[0].replace(/\n/g, "|") : "<clear>"
        console.log(`[caption id=0x${this._id.toString(16)} str=${strId}] ${text}`)
        return original()
    } as typeof cut.op_drawCaptionText
    cut.op_drawCaptionText = wrapped
    cut._opcodeTable[6] = wrapped
}

async function presentFrame(cut: Cutscene) {
    cut._cmdPtrBak = cut._cmdPtr
    cut._cmdPtrBakOffset = cut._cmdPtrOffset
    cut._frameDelay = 5
    await cut.setPalette()
    cut.swapLayers()
    cut._creditsSlowText = 0
}

function hasAdvanceKeyPrompt(cut: Cutscene, endCmdPtrOffset: number) {
    let offset = cut._cmdPtrOffset
    while (offset < endCmdPtrOffset) {
        const keyMask = cut._cmdPtr[offset++]
        if (keyMask === 0xFF) {
            return false
        }
        if (keyMask === 0x80) {
            return true
        }
        offset += 2
    }
    return false
}

function drawStringAtPos(cut: Cutscene) {
    const id = cut.fetchNextCmdWord()
    if (id === 0xFFFF) {
        return
    }
    const x = cut.fetchNextCmdByte()
    const y = cut.fetchNextCmdByte()
    const strId = id & 0x0FFF
    const color = 0xC0 + 16 + (id >> 12)
    const text = cut._res.getCineString(strId)
    if (!text) {
        return
    }
    cut.drawText(x * 8, y * 8, text, color, cut._page1, 0)
}

function skipStringAtPos(cut: Cutscene) {
    const id = cut.fetchNextCmdWord()
    if (id !== 0xFFFF) {
        cut.fetchNextCmdByte()
        cut.fetchNextCmdByte()
    }
}

function getCommandOffset(p: Uint8Array, entryOffset: number) {
    if (entryOffset <= 0) {
        return 0
    }
    return (p[2 + entryOffset * 2] << 8) | p[2 + entryOffset * 2 + 1]
}

function getCommandBounds(p: Uint8Array, entryOffset: number) {
    const entryCount = (p[0] << 8) | p[1]
    const baseOffset = (entryCount + 1) * 2
    const startOffset = getCommandOffset(p, entryOffset)
    let endOffset = Number.POSITIVE_INFINITY
    for (let i = entryOffset + 1; i < entryCount; ++i) {
        const candidate = getCommandOffset(p, i)
        if (candidate > startOffset && candidate < endOffset) {
            endOffset = candidate
        }
    }
    return {
        baseOffset,
        endCmdPtrOffset: Number.isFinite(endOffset) ? baseOffset + endOffset : Number.POSITIVE_INFINITY,
        startCmdPtrOffset: baseOffset + startOffset
    }
}

async function runLegacyCmdPolLoop(cut: Cutscene, entryOffset: number, options: LegacyLoopOptions = {}) {
    cut._frameDelay = 5
    cut._tstamp = cut._stub.getTimeStamp()

    for (let i = 0; i < 0x20; ++i) {
        cut._stub.setPaletteEntry(0xC0 + i, { r: 0, g: 0, b: 0 })
    }
    cut._newPal = false
    cut._hasAlphaColor = false

    const p = cut.getCommandData()
    const bounds = getCommandBounds(p, entryOffset)
    cut._baseOffset = bounds.baseOffset
    cut._varKey = 0
    cut._cmdPtr = cut._cmdPtrBak = new Uint8Array(p.buffer, p.byteOffset, p.byteLength)
    cut._cmdPtrOffset = cut._cmdPtrBakOffset = bounds.startCmdPtrOffset
    cut._polPtr = cut.getPolygonData()
    while (!cut._stub._pi.quit && !cut._interrupted && !cut._stop && cut._cmdPtrOffset < bounds.endCmdPtrOffset) {
        if (cut._cmdPtrOffset >= bounds.endCmdPtrOffset) {
            break
        }
        const raw = cut.fetchNextCmdByte()
        if (raw & 0x80) {
            break
        }
        const op = raw >> 2
        switch (op) {
            case 0:
            case 5:
                await presentFrame(cut)
                break
            case 1:
                cut.op_refreshScreen()
                break
            case 2:
                cut._frameDelay = cut.fetchNextCmdByte() * 4
                await cut.sync()
                break
            case 3:
                cut.op_drawShape()
                break
            case 4:
                cut.op_setPalette()
                break
            case 6:
                cut.op_drawCaptionText()
                break
            case 7:
                break
            case 8:
                cut._cmdPtrOffset += 3
                break
            case 9:
                await presentFrame(cut)
                while (cut._cmdPtrOffset < bounds.endCmdPtrOffset && cut.fetchNextCmdByte() !== 0xFF) {
                    if (cut._cmdPtrOffset + 1 >= bounds.endCmdPtrOffset) {
                        break
                    }
                    cut.fetchNextCmdWord()
                }
                break
            case 10:
                cut.op_drawShapeScale()
                break
            case 11:
                cut.op_drawShapeScaleRotate()
                break
            case 12:
                cut._frameDelay = 10
                await cut.sync()
                break
            case 13:
                drawStringAtPos(cut)
                break
            case 14:
                if (options.stopOnFirstAdvancePrompt && hasAdvanceKeyPrompt(cut, bounds.endCmdPtrOffset)) {
                    cut._stop = true
                    break
                }
                cut.op_handleKeys()
                break
            default:
                throw new Error(`Invalid legacy cutscene opcode = 0x${op.toString(16)}`)
        }
        await cut._stub.processEvents()
        if (cut._stub._pi.backspace) {
            cut._stub._pi.backspace = false
            cut._interrupted = true
        }
    }
}

function frameFromIndexedBuffer(page: Uint8Array, w: number, h: number) {
    const rgb = new Uint8Array(w * h * 3)
    for (let i = 0; i < page.length; ++i) {
        const dst = i * 3
        switch (page[i]) {
            case 0xC1:
                rgb[dst] = 120
                rgb[dst + 1] = 255
                rgb[dst + 2] = 120
                break
            case 0xC0:
                rgb[dst] = 0
                rgb[dst + 1] = 88
                rgb[dst + 2] = 0
                break
            default:
                rgb[dst] = 0
                rgb[dst + 1] = 0
                rgb[dst + 2] = 0
                break
        }
    }
    return rgb
}

function renderMissionBriefingPage(
    cut: Cutscene,
    blocks: Array<{
        justify: number
        text: string
        y: number
    }>
) {
    const page = new Uint8Array(cut._vid._layerSize)
    const scale = cut._vid._layerScale
    const boxX = 8 * scale
    const boxY = 50 * scale
    const boxW = 240 * scale
    const boxH = 128 * scale
    for (let row = 0; row < boxH; ++row) {
        const offset = (boxY + row) * cut._vid._w + boxX
        page.fill(0xC0, offset, offset + boxW)
    }
    for (const block of blocks) {
        cut.drawText(0, block.y, new TextEncoder().encode(block.text), 0xC1, page, block.justify)
    }
    return {
        durationMs: MISSION_PAGE_HOLD_MS,
        rgb: frameFromIndexedBuffer(page, cut._vid._w, cut._vid._h)
    }
}

function trimMissionRawBriefingTail(frames: CapturedFrame[], cut: Cutscene) {
    const scale = cut._vid._layerScale
    const x0 = 8 * scale
    const y0 = 50 * scale
    const x1 = Math.min(cut._vid._w, x0 + 240 * scale)
    const y1 = Math.min(cut._vid._h, y0 + 128 * scale)
    const brightPixelThreshold = 500 * scale * scale

    for (let i = 0; i < frames.length; ++i) {
        const frame = frames[i]
        let brightPixels = 0
        for (let y = y0; y < y1; ++y) {
            let src = (y * cut._vid._w + x0) * 3
            for (let x = x0; x < x1; ++x) {
                const r = frame.rgb[src]
                const g = frame.rgb[src + 1]
                const b = frame.rgb[src + 2]
                if (g >= 200 && r <= 180 && b <= 180) {
                    ++brightPixels
                }
                src += 3
            }
        }
        if (brightPixels >= brightPixelThreshold) {
            frames.splice(i)
            return
        }
    }
}

function appendMissionBriefingFrames(frames: CapturedFrame[], cut: Cutscene, routedName: string | null) {
    if (!routedName) {
        return
    }
    const briefing = MISSION_BRIEFINGS[routedName]
    if (!briefing) {
        return
    }
    frames.push(renderMissionBriefingPage(cut, [
        { justify: 2, text: "File:", y: 8 },
        { justify: 2, text: briefing.fileId, y: 24 },
        { justify: 2, text: "User:", y: 48 },
        { justify: 2, text: briefing.user, y: 64 }
    ]))
    for (let i = 0; i < briefing.sections.length; ++i) {
        const section = briefing.sections[i]
        const blocks = [
            { justify: 2, text: section.title, y: 4 },
            { justify: 1, text: section.body, y: 20 }
        ]
        if (i === briefing.sections.length - 1) {
            blocks.push({ justify: 2, text: "Salary:", y: 84 })
            blocks.push({ justify: 2, text: briefing.salary, y: 100 })
        }
        frames.push(renderMissionBriefingPage(cut, blocks))
    }
}

async function renderCutscene(
    resolver: ResourceResolver,
    cutsceneId: number,
    outputDir: string,
    variant: ExportVariant
): Promise<ManifestEntry> {
    const cutNameIndex = Cutscene._offsetsTableDOS[cutsceneId * 2]
    const entryOffset = Cutscene._offsetsTableDOS[cutsceneId * 2 + 1]
    const cutsceneName = Cutscene._namesTableDOS[cutNameIndex & 0xFF]
    if (!cutsceneName) {
        throw new Error(`Invalid DOS cutscene name for id 0x${cutsceneId.toString(16)}`)
    }
    const routedName = _namesTable[cutsceneId] || null
    const isMission = isMissionCutscene(cutsceneName, routedName)
    const durationCapMs = getDurationCapMs(cutsceneName, cutsceneId, routedName)
    const trimToShortest = !isMission
    const moduleName = getModuleName(cutsceneId)
    const audioPath = process.env.SKIP_AUDIO === "1" ? null : resolver.resolveAudioPath(moduleName)

    const stub = new HeadlessSystemStub(durationCapMs)
    const res = new Resource(null as any, ResourceType.kResourceTypeDOS, Language.LANG_EN)
    const vid = new Video(res, stub as any, WidescreenMode.kWidescreenNone)
    configureNativeExportScale(vid, variant.scale)
    stub.setScreenSize(vid._w, vid._h)
    vid.setTextPalette()

    res._fnt = resolver.readFont()
    res._cmd = resolver.readCutsceneCommand(cutsceneName)
    res._pol = resolver.readCutscenePolygon(cutsceneName)
    res._cine_off = resolver.readCineOffset()
    res._cine_txt = resolver.readCineText()

    const cut = new Cutscene(res, stub as any, vid)
    cut._id = cutsceneId
    cut._creditsSequence = false
    cut._textCurBuf = null
    if (variant.captionsEnabled) {
        patchHolocubeIntro(cut)
        attachCaptionDebug(cut)
    } else {
        suppressCaptionDrawing(cut)
        cut._opcodeTable[13] = () => skipStringAtPos(cut)
    }
    cut.prepare()
    await runLegacyCmdPolLoop(cut, entryOffset, {
        stopOnFirstAdvancePrompt: isMission && !!routedName && Object.prototype.hasOwnProperty.call(MISSION_BRIEFINGS, routedName)
    })

    stub.finishFrames(75)
    const frames = stub.getFrames()
    if (frames.length === 0) {
        throw new Error(`No frames captured for id 0x${cutsceneId.toString(16)}`)
    }
    if (isMission) {
        trimMissionRawBriefingTail(frames, cut)
    }
    appendMissionBriefingFrames(frames, cut, routedName)
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "flashback-cutscene-batch-"))
    const outputPath = getSceneOutputPath(outputDir, cutsceneId, routedName, cutsceneName, variant)
    try {
        writeFrameSequence(tempDir, vid._w, vid._h, frames, DEFAULT_FPS)
        fs.mkdirSync(path.dirname(outputPath), { recursive: true })
        encodeVideo(tempDir, DEFAULT_FPS, outputPath, audioPath, trimToShortest)
    } finally {
        fs.rmSync(tempDir, { force: true, recursive: true })
    }

    return {
        audioSource: audioPath,
        captionsEnabled: variant.captionsEnabled,
        cutsceneId,
        cutsceneName,
        durationCapMs: durationCapMs === GLOBAL_SAFETY_LIMIT_MS ? null : durationCapMs,
        entryOffset,
        exportScale: variant.scale,
        moduleName,
        outputPath,
        routedName
    }
}

async function main() {
    const args = process.argv.slice(2)
    if (args.length > 1) {
        printUsage()
        process.exit(1)
    }

    const rootDir = process.cwd()
    const outputDir = args[0]
        ? path.resolve(rootDir, args[0])
        : path.join(rootDir, "out", "cutscene-cmdpol-exports")

    fs.mkdirSync(outputDir, { recursive: true })

    const resolver = new ResourceResolver(rootDir, HISTORICAL_COMMIT)
    const manifest: ManifestEntry[] = []
    const cutsceneIds = getCutsceneIds()
    const variants = getExportVariants()

    for (const cutsceneId of cutsceneIds) {
        const routedName = _namesTable[cutsceneId] || Cutscene._namesTableDOS[Cutscene._offsetsTableDOS[cutsceneId * 2] & 0xFF]
        for (const variant of variants) {
            const variantLabel = `${variant.labelSuffix.slice(1)} @${variant.scale}x`
            console.log(`Exporting 0x${cutsceneId.toString(16).padStart(2, "0")} ${routedName} ${variantLabel}`)
            const entry = await renderCutscene(resolver, cutsceneId, outputDir, variant)
            manifest.push(entry)
        }
    }

    const manifestPath = path.join(outputDir, "manifest.json")
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
    console.log(`Wrote ${manifestPath}`)
}

main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error))
    process.exit(1)
})
