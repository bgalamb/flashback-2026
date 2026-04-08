import { execFileSync } from "child_process"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"

type SubtitleCue = {
    endSec: number
    startSec: number
    text: string
    x: number | "center"
    y: number
}

const VIDEO_W = 256
const VIDEO_H = 224
const FPS = 30
const OUTPUT_DURATION_SEC = 61.178333

const cues: SubtitleCue[] = [
    {
        startSec: 9.0,
        endSec: 12.0,
        text: "Hey, it's me",
        x: "center",
        y: 196
    },
    {
        startSec: 12.0,
        endSec: 26.0,
        text: "Hi Conrad. You must be|wondering how you recorded|this message without|remembering it.",
        x: 8,
        y: 10
    },
    {
        startSec: 26.0,
        endSec: 44.0,
        text: "Good question, but it would|take too long to explain|and time is short, and if|you want to save your hide...",
        x: 8,
        y: 10
    },
    {
        startSec: 44.0,
        endSec: 53.0,
        text: "You must contact your old|friend Ian in New|Washington.",
        x: 8,
        y: 10
    },
    {
        startSec: 53.0,
        endSec: OUTPUT_DURATION_SEC,
        text: "He'll explain it all there.|Good luck and watch your|back,because it's my life|you're playing with.",
        x: 8,
        y: 10
    }
]

function printUsage() {
    console.error("Usage: npx ts-node --transpile-only ./src/debugger-helpers/export-holocube-video-with-text.ts <baseVideo> <fontFile> <output.(mp4|avi)>")
}

function getFramePath(tempDir: string, index: number) {
    return path.join(tempDir, `frame-${index.toString().padStart(6, "0")}.ppm`)
}

function parsePpm(rgbPpm: Uint8Array) {
    const nextToken = (state: { index: number }) => {
        while (state.index < rgbPpm.length) {
            const c = rgbPpm[state.index]
            if (c === 35) {
                while (state.index < rgbPpm.length && rgbPpm[state.index] !== 10) {
                    ++state.index
                }
            }
            if (state.index < rgbPpm.length && /\s/.test(String.fromCharCode(rgbPpm[state.index]))) {
                ++state.index
                continue
            }
            break
        }
        const start = state.index
        while (state.index < rgbPpm.length && !/\s/.test(String.fromCharCode(rgbPpm[state.index]))) {
            ++state.index
        }
        return new TextDecoder().decode(rgbPpm.subarray(start, state.index))
    }

    const state = { index: 0 }
    const magic = nextToken(state)
    if (magic !== "P6") {
        throw new Error(`Unsupported PPM magic '${magic}'`)
    }
    const w = Number(nextToken(state))
    const h = Number(nextToken(state))
    const maxValue = Number(nextToken(state))
    if (w !== VIDEO_W || h !== VIDEO_H || maxValue !== 255) {
        throw new Error(`Unexpected PPM header ${w}x${h} max=${maxValue}`)
    }
    while (state.index < rgbPpm.length && /\s/.test(String.fromCharCode(rgbPpm[state.index]))) {
        ++state.index
    }
    return {
        header: rgbPpm.subarray(0, state.index),
        rgb: rgbPpm.slice(state.index)
    }
}

function drawGlyph(rgb: Uint8Array, fnt: Uint8Array, chr: number, x: number, y: number, color: [number, number, number]) {
    if (chr < 32) {
        return
    }
    const srcOffsetBase = (chr - 32) * 8 * 4
    for (let row = 0; row < 8; ++row) {
        if (y + row < 0 || y + row >= VIDEO_H) {
            continue
        }
        let srcOffset = srcOffsetBase + row * 4
        for (let nibble = 0; nibble < 8; ++nibble) {
            const byte = fnt[srcOffset + (nibble >> 1)]
            const value = (nibble & 1) === 0 ? (byte >>> 4) : (byte & 0x0F)
            const px = x + nibble
            if (value !== 0 && px >= 0 && px < VIDEO_W) {
                const dstOffset = (y + row) * VIDEO_W * 3 + px * 3
                rgb[dstOffset] = color[0]
                rgb[dstOffset + 1] = color[1]
                rgb[dstOffset + 2] = color[2]
            }
        }
    }
}

function drawText(rgb: Uint8Array, fnt: Uint8Array, cue: SubtitleCue) {
    const lines = cue.text.split("|")
    const baseX = cue.x === "center" ? 0 : cue.x
    for (let lineIndex = 0; lineIndex < lines.length; ++lineIndex) {
        const line = lines[lineIndex]
        const x = cue.x === "center" ? Math.floor((VIDEO_W - line.length * 8) / 2) : baseX
        const y = cue.y + lineIndex * 10
        for (let i = 0; i < line.length; ++i) {
            const chr = line.charCodeAt(i)
            const charX = x + i * 8
            drawGlyph(rgb, fnt, chr, charX + 1, y + 1, [0, 0, 0])
            drawGlyph(rgb, fnt, chr, charX, y, [255, 255, 255])
        }
    }
}

function findCueAtTime(t: number) {
    return cues.find((cue) => t >= cue.startSec && t < cue.endSec) || null
}

function extractFrames(baseVideoPath: string, tempDir: string) {
    const holdDuration = Math.max(0, OUTPUT_DURATION_SEC - 8.733333)
    execFileSync("ffmpeg", [
        "-y",
        "-i", baseVideoPath,
        "-vf", `tpad=stop_mode=clone:stop_duration=${holdDuration.toFixed(6)},fps=${FPS}`,
        "-t", OUTPUT_DURATION_SEC.toFixed(6),
        getFramePath(tempDir, 0).replace("000000", "%06d")
    ], {
        stdio: "inherit"
    })
}

function encodeVideo(tempDir: string, outputPath: string) {
    const ext = path.extname(outputPath).toLowerCase()
    const args = [
        "-y",
        "-framerate", String(FPS),
        "-i", getFramePath(tempDir, 0).replace("000000", "%06d")
    ]
    if (ext === ".avi") {
        args.push("-c:v", "mpeg4")
    } else {
        args.push("-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart")
    }
    args.push(outputPath)
    execFileSync("ffmpeg", args, {
        stdio: "inherit"
    })
}

function main() {
    const args = process.argv.slice(2)
    if (args.length !== 3) {
        printUsage()
        process.exit(1)
    }

    const [baseVideoPath, fontFilePath, outputPath] = args
    const fnt = new Uint8Array(fs.readFileSync(fontFilePath))
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "flashback-holocube-overlay-"))

    try {
        extractFrames(baseVideoPath, tempDir)

        const frameFiles = fs.readdirSync(tempDir)
            .filter((name) => /^frame-\d+\.ppm$/.test(name))
            .sort()

        for (let i = 0; i < frameFiles.length; ++i) {
            const cue = findCueAtTime(i / FPS)
            if (!cue) {
                continue
            }
            const framePath = path.join(tempDir, frameFiles[i])
            const ppm = new Uint8Array(fs.readFileSync(framePath))
            const parsed = parsePpm(ppm)
            drawText(parsed.rgb, fnt, cue)
            const out = new Uint8Array(parsed.header.length + parsed.rgb.length)
            out.set(parsed.header, 0)
            out.set(parsed.rgb, parsed.header.length)
            fs.writeFileSync(framePath, out)
        }

        fs.mkdirSync(path.dirname(outputPath), { recursive: true })
        encodeVideo(tempDir, outputPath)
        console.log(`Wrote ${outputPath}`)
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true })
    }
}

main()
