require('ts-node/register/transpile-only')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { GlobalFibAudioExporter } = require('../src/debugger/global-fib-audio-exporter.ts')

function createGlobalFibFixture() {
    const count = 3
    const headerSize = 2 + (count * 6)
    const sample0 = Buffer.from([0xFE, 0x88, 0x88]) // -2, -2, -2, -2, -2
    const sample2 = Buffer.from([0x05, 0x89])       // 5, 5, 6
    const fib = Buffer.alloc(headerSize + sample0.length + sample2.length)
    fib.writeUInt16LE(count, 0)

    fib.writeUInt32LE(headerSize, 2)
    fib.writeUInt16LE(sample0.length, 6)

    fib.writeUInt32LE(0, 8)
    fib.writeUInt16LE(0, 12)

    fib.writeUInt32LE(headerSize + sample0.length, 14)
    fib.writeUInt16LE(sample2.length, 18)

    sample0.copy(fib, headerSize)
    sample2.copy(fib, headerSize + sample0.length)
    return fib
}

test('GlobalFibAudioExporter writes manifest and decoded pcm assets', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flashback-global-fib-'))

    try {
        fs.writeFileSync(path.join(tempDir, 'global.fib'), createGlobalFibFixture())
        fs.writeFileSync(path.join(tempDir, 'files.json'), JSON.stringify([], null, 2) + '\n', 'utf8')

        const result = GlobalFibAudioExporter.export(tempDir)
        const manifestPath = path.join(tempDir, 'sound_effects', 'global.fib.json')
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
        const decoded0 = fs.readFileSync(path.join(tempDir, 'sound_effects', 'pcm_s8_files', 'output_0.pcm_u8'))
        const decoded2 = fs.readFileSync(path.join(tempDir, 'sound_effects', 'pcm_s8_files', 'output_2.pcm_u8'))
        const filesIndex = JSON.parse(fs.readFileSync(path.join(tempDir, 'files.json'), 'utf8'))

        assert.equal(result.manifestPath, manifestPath)
        assert.equal(result.writtenFiles.length, 2)
        assert.deepEqual(decoded0, Buffer.from([0xFE, 0xFE, 0xFE, 0xFE, 0xFE]))
        assert.deepEqual(decoded2, Buffer.from([0x05, 0x05, 0x06]))

        assert.equal(manifest.source, 'global.fib')
        assert.equal(manifest.numSfx, 3)
        assert.deepEqual(manifest.soundEffects, [
            {
                index: 0,
                offset: 20,
                encodedLength: 3,
                decodedLength: 5,
                freq: 6000,
                peak: 2,
                file: 'sound_effects/pcm_s8_files/output_0.pcm_u8',
            },
            {
                index: 1,
                offset: 0,
                encodedLength: 0,
                decodedLength: 0,
                freq: 6000,
                peak: 0,
                file: null,
            },
            {
                index: 2,
                offset: 23,
                encodedLength: 2,
                decodedLength: 3,
                freq: 6000,
                peak: 6,
                file: 'sound_effects/pcm_s8_files/output_2.pcm_u8',
            },
        ])
        assert.deepEqual(filesIndex, [
            'sound_effects/global.fib.json',
            'sound_effects/pcm_s8_files/output_0.pcm_u8',
            'sound_effects/pcm_s8_files/output_2.pcm_u8',
        ])
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true })
    }
})
