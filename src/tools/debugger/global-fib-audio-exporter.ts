const fs = require("fs")
const path = require("path")

interface SoundEffectsManifestEntry {
    index: number
    offset: number
    encodedLength: number
    decodedLength: number
    freq: number
    peak: number
    file: string | null
}

interface SoundEffectsManifest {
    source: string
    numSfx: number
    soundEffects: SoundEffectsManifestEntry[]
}

class GlobalFibAudioExporter {
    private static readonly filesIndexName = "files.json"
    private static readonly fibRelativePath = "global.fib"
    private static readonly manifestRelativePath = path.posix.join("sound_effects", "global.fib.json")
    private static readonly pcmOutputDirRelativePath = path.posix.join("sound_effects", "pcm_s8_files")
    private static readonly soundFrequencyHz = 6000
    private static readonly codeToDelta = [ -34, -21, -13, -8, -5, -3, -2, -1, 0, 1, 2, 3, 5, 8, 13, 21 ]

    static export(dataDir: string): { manifestPath: string, writtenFiles: string[] } {
        const fibPath = path.join(dataDir, GlobalFibAudioExporter.fibRelativePath)
        const fibData = fs.readFileSync(fibPath)
        const outputDir = path.join(dataDir, GlobalFibAudioExporter.pcmOutputDirRelativePath)
        fs.mkdirSync(outputDir, { recursive: true })

        const numSfx = fibData.readUInt16LE(0)
        const writtenFiles: string[] = []
        const manifest: SoundEffectsManifest = {
            source: GlobalFibAudioExporter.fibRelativePath,
            numSfx,
            soundEffects: [],
        }

        for (let i = 0; i < numSfx; ++i) {
            const tableOffset = 2 + (i * 6)
            const offset = fibData.readUInt32LE(tableOffset)
            const encodedLength = fibData.readUInt16LE(tableOffset + 4)
            const decoded = GlobalFibAudioExporter.decodePcmSegment(fibData, offset, encodedLength)
            const relativeOutputPath = decoded.length === 0
                ? null
                : path.posix.join(GlobalFibAudioExporter.pcmOutputDirRelativePath, `output_${i}.pcm_u8`)

            if (relativeOutputPath) {
                const outputPath = path.join(dataDir, relativeOutputPath)
                fs.writeFileSync(outputPath, decoded)
                writtenFiles.push(outputPath)
            }

            manifest.soundEffects.push({
                index: i,
                offset,
                encodedLength,
                decodedLength: decoded.length,
                freq: GlobalFibAudioExporter.soundFrequencyHz,
                peak: GlobalFibAudioExporter.getPeak(decoded),
                file: relativeOutputPath,
            })
        }

        const manifestPath = path.join(dataDir, GlobalFibAudioExporter.manifestRelativePath)
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8")
        GlobalFibAudioExporter.ensureFilesIndexContainsOutputs(dataDir, [
            manifestPath,
            ...writtenFiles,
        ])

        return {
            manifestPath,
            writtenFiles,
        }
    }

    static ensureFilesIndexContainsOutputs(dataDir: string, outputPaths: string[]): void {
        const filesIndexPath = path.join(dataDir, GlobalFibAudioExporter.filesIndexName)
        const filesIndex = JSON.parse(fs.readFileSync(filesIndexPath, "utf8"))
        if (!Array.isArray(filesIndex)) {
            throw new Error(`Expected ${filesIndexPath} to contain a JSON array`)
        }

        let changed = false
        for (const outputPath of outputPaths) {
            const relativePath = path.relative(dataDir, outputPath).split(path.sep).join(path.posix.sep)
            if (!filesIndex.includes(relativePath)) {
                filesIndex.push(relativePath)
                changed = true
            }
        }

        if (changed) {
            fs.writeFileSync(filesIndexPath, JSON.stringify(filesIndex, null, 2) + "\n", "utf8")
        }
    }

    static decodePcmSegment(source: Buffer, offset: number, encodedLength: number): Buffer {
        if (encodedLength === 0) {
            return Buffer.alloc(0)
        }
        const decodedLength = (encodedLength * 2) - 1
        const out = Buffer.alloc(decodedLength)
        let outIndex = 0
        let sample = source.readInt8(offset)
        out[outIndex++] = sample & 0xFF
        for (let i = 1; i < encodedLength; ++i) {
            const deltaByte = source[offset + i]
            sample = GlobalFibAudioExporter.clip(sample + GlobalFibAudioExporter.codeToDelta[deltaByte >> 4], -128, 127)
            out[outIndex++] = sample & 0xFF
            sample = GlobalFibAudioExporter.clip(sample + GlobalFibAudioExporter.codeToDelta[deltaByte & 0x0F], -128, 127)
            out[outIndex++] = sample & 0xFF
        }
        return out
    }

    static getPeak(decoded: Uint8Array): number {
        let peak = 0
        for (let i = 0; i < decoded.length; ++i) {
            const sample = decoded[i] << 24 >> 24
            const abs = Math.abs(sample)
            if (abs > peak) {
                peak = abs
            }
        }
        return peak
    }

    static clip(value: number, min: number, max: number): number {
        return Math.max(min, Math.min(max, value))
    }
}

export { GlobalFibAudioExporter }
