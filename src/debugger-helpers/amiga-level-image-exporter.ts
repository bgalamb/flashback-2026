import { assert } from "../assert"
import { READ_BE_UINT16, READ_BE_UINT32, READ_LE_UINT16 } from "../intern"
import { CT_ROOM_SIZE, GAMESCREEN_H, GAMESCREEN_W, UINT8_MAX } from "../game_constants"
import { bytekiller_unpack } from "../unpack"
import { Video } from "../video"
import { _gameLevels } from "../staticres"

// Loads a room from LEV/MBK-or-BNQ/PAL/SGD assets, decodes the Amiga front layer,
// applies the room palettes, and writes the rendered RGB result as a PPM image file.
class AmigaLevelImageExporter {
    private _mbk: Uint8Array
    private _pal: Uint8Array
    private _sgd: Uint8Array
    private _usesBnqFormat: boolean
    private _bankCache: { [key: string]: Uint8Array } = {}
    private _rgbPalette: Uint8Array = new Uint8Array(256 * 3)

    private constructor(mbk: Uint8Array, pal: Uint8Array, sgd: Uint8Array, usesBnqFormat: boolean) {
        this._mbk = mbk
        this._pal = pal
        this._sgd = sgd
        this._usesBnqFormat = usesBnqFormat
    }

    static exportRoomImage(levPath: string, mbkPath: string, palPath: string, sgdPath: string, level: number, room: number, outputPath: string, prevFrontLayer? :Uint8Array): Uint8Array {
        const fs = require('fs')
        const path = require('path')
        const lev = new Uint8Array(fs.readFileSync(levPath))
        let bankPath = mbkPath
        let usesBnqFormat = false
        let mbk = new Uint8Array(fs.readFileSync(bankPath))
        if (AmigaLevelImageExporter.isPlaceholderMbk(mbk)) {
            const ext = path.extname(mbkPath)
            const bnqPath = mbkPath.slice(0, mbkPath.length - ext.length) + '.BNQ'
            const altBnqPath = mbkPath.slice(0, mbkPath.length - ext.length) + '.bnq'
            if (fs.existsSync(bnqPath)) {
                bankPath = bnqPath
            } else if (fs.existsSync(altBnqPath)) {
                bankPath = altBnqPath
            } else {
                throw new Error(`Unsupported MBK format in '${mbkPath}' and no matching BNQ file was found`)
            }
            mbk = new Uint8Array(fs.readFileSync(bankPath))
            usesBnqFormat = true
        }
        const pal = new Uint8Array(fs.readFileSync(palPath))
        const sgd = fs.existsSync(sgdPath) ? new Uint8Array(fs.readFileSync(sgdPath)) : new Uint8Array(0)

        const exporter = new AmigaLevelImageExporter(mbk, pal, sgd, usesBnqFormat)
        const frontLayer = exporter.decodeRoom(lev, level, room)
        if (frontLayer != prevFrontLayer) {
            exporter.writePpm(outputPath, frontLayer)
        }
        return frontLayer
    }

    static exportAllGameLevelRooms(dataDir: string, outputDir: string, roomFrom: number = 1, roomTo: number = 100) {
        const fs = require('fs')
        const path = require('path')

        fs.mkdirSync(outputDir, { recursive: true })

        for (let levelIndex = 0; levelIndex < _gameLevels.length; ++levelIndex) {
            const level = _gameLevels[levelIndex]
            const resolved = AmigaLevelImageExporter.resolveLevelAssetPaths(dataDir, level.name)

            if (!resolved) {
                continue
            }

            const levelOutputDir = path.join(outputDir, `${level.name2}`)
            fs.mkdirSync(levelOutputDir, { recursive: true })
            const lev = new Uint8Array(fs.readFileSync(resolved.levPath))

            for (let room = roomFrom; room <= roomTo; ++room) {
                if (!AmigaLevelImageExporter.roomExists(lev, room)) {
                    continue
                }
                const outputPath = path.join(levelOutputDir, `${resolved.baseName}-room${room}.ppm`)
                try {AmigaLevelImageExporter.exportRoomImage(
                        resolved.levPath,
                        resolved.mbkPath,
                        resolved.palPath,
                        resolved.sgdPath || "",
                        levelIndex,
                        room,
                        outputPath
                    )
                    console.log(`Wrote ${outputPath}`)
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error)
                    console.warn(`Skipping level ${levelIndex} room ${room}: ${message}`)
                }
            }
        }
    }

    static exportRoomLayerArtifacts(
        levPath: string,
        mbkPath: string,
        palPath: string,
        sgdPath: string,
        level: number,
        room: number,
        outputPrefix: string
    ) {
        const fs = require('fs')
        const path = require('path')
        const lev = new Uint8Array(fs.readFileSync(levPath))
        let bankPath = mbkPath
        let usesBnqFormat = false
        let mbk = new Uint8Array(fs.readFileSync(bankPath))
        if (AmigaLevelImageExporter.isPlaceholderMbk(mbk)) {
            const ext = path.extname(mbkPath)
            const bnqPath = mbkPath.slice(0, mbkPath.length - ext.length) + '.BNQ'
            const altBnqPath = mbkPath.slice(0, mbkPath.length - ext.length) + '.bnq'
            if (fs.existsSync(bnqPath)) {
                bankPath = bnqPath
            } else if (fs.existsSync(altBnqPath)) {
                bankPath = altBnqPath
            } else {
                throw new Error(`Unsupported MBK format in '${mbkPath}' and no matching BNQ file was found`)
            }
            mbk = new Uint8Array(fs.readFileSync(bankPath))
            usesBnqFormat = true
        }
        const pal = new Uint8Array(fs.readFileSync(palPath))
        const sgd = fs.existsSync(sgdPath) ? new Uint8Array(fs.readFileSync(sgdPath)) : new Uint8Array(0)

        const exporter = new AmigaLevelImageExporter(mbk, pal, sgd, usesBnqFormat)
        const frontLayer = exporter.decodeRoom(lev, level, room)

        exporter.writePpm(`${outputPrefix}.ppm`, frontLayer)
        fs.writeFileSync(`${outputPrefix}.pixeldata.bin`, frontLayer)
        exporter.writePpmLayerGroup(`${outputPrefix}-backlayer.ppm`, frontLayer, [0, 1])
        exporter.writePpmLayerGroup(`${outputPrefix}-frontlayer.ppm`, frontLayer, [2, 3])
    }

    static exportAllGameLevelRoomLayerArtifacts(dataDir: string, outputDir: string, roomFrom: number = 1, roomTo: number = 100) {
        const fs = require('fs')
        const path = require('path')

        fs.mkdirSync(outputDir, { recursive: true })

        for (let levelIndex = 0; levelIndex < _gameLevels.length; ++levelIndex) {
            const level = _gameLevels[levelIndex]
            const resolved = AmigaLevelImageExporter.resolveLevelAssetPaths(dataDir, level.name)

            if (!resolved) {
                continue
            }

            const levelOutputDir = path.join(outputDir, `${level.name2}`)
            fs.mkdirSync(levelOutputDir, { recursive: true })
            const lev = new Uint8Array(fs.readFileSync(resolved.levPath))

            for (let room = roomFrom; room <= roomTo; ++room) {
                if (!AmigaLevelImageExporter.roomExists(lev, room)) {
                    continue
                }
                const outputPrefix = path.join(levelOutputDir, `${resolved.baseName}-room${room}`)
                try {
                    AmigaLevelImageExporter.exportRoomLayerArtifacts(
                        resolved.levPath,
                        resolved.mbkPath,
                        resolved.palPath,
                        resolved.sgdPath || "",
                        levelIndex,
                        room,
                        outputPrefix
                    )
                    console.log(`Wrote ${outputPrefix}.ppm`)
                    console.log(`Wrote ${outputPrefix}.pixeldata.bin`)
                    console.log(`Wrote ${outputPrefix}-backlayer.ppm`)
                    console.log(`Wrote ${outputPrefix}-frontlayer.ppm`)
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error)
                    console.warn(`Skipping level ${levelIndex} room ${room}: ${message}`)
                }
            }
        }
    }

    private static roomExists(lev: Uint8Array, room: number): boolean {
        if (room < 0 || room >= CT_ROOM_SIZE) {
            return false
        }
        const offset = room * 4
        if ((offset + 4) > lev.length) {
            return false
        }
        return READ_BE_UINT32(lev, offset) !== 0
    }

    private static isPlaceholderMbk(data: Uint8Array): boolean {
        if (data.length < 12) {
            return false
        }
        const firstOffset = READ_BE_UINT32(data) & 0xFFFF
        const firstSize = READ_BE_UINT16(data, 4)
        if (firstSize !== 0) {
            return false
        }
        for (let i = 1; i < 8; ++i) {
            const entryOffset = READ_BE_UINT32(data, i * 6) & 0xFFFF
            const entrySize = READ_BE_UINT16(data, i * 6 + 4)
            if (entryOffset !== firstOffset || entrySize !== firstSize) {
                return false
            }
        }
        return true
    }

    private static resolveDataFile(dataDir: string, baseName: string, ext: string): string | null {
        const fs = require('fs')
        const path = require('path')
        const candidates = [
            path.join(dataDir, `${baseName}.${ext.toLowerCase()}`),
            path.join(dataDir, `${baseName}.${ext.toUpperCase()}`)
        ]
        for (const candidate of candidates) {
            if (fs.existsSync(candidate)) {
                return candidate
            }
        }
        return null
    }

    private static resolveOptionalDataFile(dataDir: string, baseName: string, ext: string): string | null {
        return AmigaLevelImageExporter.resolveDataFile(dataDir, baseName, ext)
    }

    private static resolveLevelAssetPaths(dataDir: string, baseName: string) {
        const levPath = AmigaLevelImageExporter.resolveDataFile(dataDir, baseName, "lev")
        const mbkPath = AmigaLevelImageExporter.resolveDataFile(dataDir, baseName, "mbk")
        const palPath = AmigaLevelImageExporter.resolveDataFile(dataDir, baseName, "pal")
        if (levPath && mbkPath && palPath) {
            return {
                baseName,
                levPath,
                mbkPath,
                palPath,
                sgdPath: AmigaLevelImageExporter.resolveOptionalDataFile(dataDir, baseName, "sgd")
            }
        }
        return null
    }

    decodeRoom(lev: Uint8Array, level: number, room: number): Uint8Array {
        const leveldataScratch = new Uint8Array(320 * 224 + 1024)
        const offset = READ_BE_UINT32(lev, room * 4)
        if (!bytekiller_unpack(leveldataScratch, leveldataScratch.length, lev, offset)) {
            throw new Error(`Bad CRC for room ${room}`)
        }

        let sgdOffset = READ_BE_UINT16(leveldataScratch, 10)
        const offset12 = READ_BE_UINT16(leveldataScratch, 12)
        let bankDataChunkOffset = READ_BE_UINT16(leveldataScratch, 14)
        const mapPaletteOffsetSlot1 = READ_BE_UINT16(leveldataScratch, 2)
        const mapPaletteOffsetSlot2 = READ_BE_UINT16(leveldataScratch, 4)
        const mapPaletteOffsetSlot3 = READ_BE_UINT16(leveldataScratch, 6)
        const mapPaletteOffsetSlot4 = READ_BE_UINT16(leveldataScratch, 8)

        const kTempMbkSize = 1024
        const tileDataBuffer = new Uint8Array(kTempMbkSize * 32)
        tileDataBuffer.fill(0, 0, 32)
        let size = 32

        for (let loop = true; loop;) {
            let bankDataId = READ_BE_UINT16(leveldataScratch, bankDataChunkOffset)
            bankDataChunkOffset += 2
            if (bankDataId & 0x8000) {
                bankDataId &= ~0x8000
                loop = false
            }

            const bankData = this.loadBankData(bankDataId)
            const bankDataSize = bankData.length
            const chunkNumber = leveldataScratch[bankDataChunkOffset++]

            if (chunkNumber === UINT8_MAX) {
                assert(!(size + bankDataSize > kTempMbkSize * 32), `Assertion failed: ${size + bankDataSize} <= ${kTempMbkSize * 32}`)
                tileDataBuffer.set(bankData.subarray(0, bankDataSize), size)
                size += bankDataSize
            } else {
                for (let i = 0; i < chunkNumber + 1; ++i) {
                    const chunkSize = leveldataScratch[bankDataChunkOffset++]
                    assert(!(size + 32 > kTempMbkSize * 32), `Assertion failed: ${size + 32} <= ${kTempMbkSize * 32}`)
                    tileDataBuffer.set(bankData.subarray(chunkSize * 32, chunkSize * 32 + 32), size)
                    size += 32
                }
            }
        }

        const frontLayer = new Uint8Array(GAMESCREEN_W * GAMESCREEN_H)
        if (leveldataScratch[1] !== 0) {
            assert(!!this._sgd, `Assertion failed: ${this._sgd}`)
            AmigaLevelImageExporter.decodeSgd(frontLayer, new Uint8Array(leveldataScratch.buffer, leveldataScratch.byteOffset + sgdOffset), this._sgd)
            sgdOffset = 0
        }

        AmigaLevelImageExporter.decodeLevHelper(
            frontLayer,
            leveldataScratch,
            sgdOffset,
            offset12,
            tileDataBuffer,
            leveldataScratch[1] !== 0,
            true
        )

        this.setPaletteSlotBE(0x0, mapPaletteOffsetSlot1)
        this.setPaletteSlotBE(0x1, mapPaletteOffsetSlot2)
        this.setPaletteSlotBE(0x2, mapPaletteOffsetSlot3)
        this.setPaletteSlotBE(0x3, mapPaletteOffsetSlot4)
        this.setPaletteSlotBE(0x8, mapPaletteOffsetSlot1)
        this.setPaletteSlotBE(0x9, mapPaletteOffsetSlot2)
        this.setPaletteSlotBE(0xA, mapPaletteOffsetSlot3)
        this.setPaletteSlotBE(0xB, mapPaletteOffsetSlot4)

        if (level === 0) {
            this.setPaletteSlotBE(0x9, mapPaletteOffsetSlot1)
        }

        return frontLayer
    }

    private writePpm(outputPath: string, frontLayer: Uint8Array) {
        const fs = require('fs')
        const header = new TextEncoder().encode(`P6\n${GAMESCREEN_W} ${GAMESCREEN_H}\n255\n`)
        const body = new Uint8Array(frontLayer.length * 3)
        for (let i = 0; i < frontLayer.length; ++i) {
            const srcOffset = frontLayer[i] * 3
            const dstOffset = i * 3
            body[dstOffset + 0] = this._rgbPalette[srcOffset + 0]
            body[dstOffset + 1] = this._rgbPalette[srcOffset + 1]
            body[dstOffset + 2] = this._rgbPalette[srcOffset + 2]
        }
        const payload = new Uint8Array(header.length + body.length)
        payload.set(header, 0)
        payload.set(body, header.length)
        fs.writeFileSync(outputPath, payload)
    }

    private writePpmLayerGroup(outputPath: string, frontLayer: Uint8Array, paletteLayers: number[]) {
        const fs = require('fs')
        const header = new TextEncoder().encode(`P6\n${GAMESCREEN_W} ${GAMESCREEN_H}\n255\n`)
        const body = new Uint8Array(frontLayer.length * 3)

        for (let i = 0; i < frontLayer.length; ++i) {
            const srcColorIndex = frontLayer[i]
            const srcPaletteLayerIndex = ((srcColorIndex & 0x80) !== 0 ? 2 : 0) + ((srcColorIndex & 0x10) !== 0 ? 1 : 0)
            const dstOffset = i * 3
            if (paletteLayers.indexOf(srcPaletteLayerIndex) !== -1) {
                const srcOffset = srcColorIndex * 3
                body[dstOffset + 0] = this._rgbPalette[srcOffset + 0]
                body[dstOffset + 1] = this._rgbPalette[srcOffset + 1]
                body[dstOffset + 2] = this._rgbPalette[srcOffset + 2]
            } else {
                body[dstOffset + 0] = 0
                body[dstOffset + 1] = 0
                body[dstOffset + 2] = 0
            }
        }

        const payload = new Uint8Array(header.length + body.length)
        payload.set(header, 0)
        payload.set(body, header.length)
        fs.writeFileSync(outputPath, payload)
    }

    private setPaletteSlotBE(paletteSlot: number, palOffset: number) {
        let p = palOffset * 32
        for (let i = 0; i < 16; ++i) {
            const color = READ_BE_UINT16(this._pal, p)
            p += 2
            const rgb = AmigaLevelImageExporter.amigaConvertColor(color, true)
            const dst = (paletteSlot * 16 + i) * 3
            this._rgbPalette[dst + 0] = rgb.r
            this._rgbPalette[dst + 1] = rgb.g
            this._rgbPalette[dst + 2] = rgb.b
        }
    }

    private static AMIGA_decodeRle(dst: Uint8Array, src: Uint8Array) {
        const size = READ_BE_UINT16(src) & 0x7FFF
        let dstIndex = 0
        src = src.subarray(2)
        for (let i = 0; i < size;) {
            let code = src[i++]
            if ((code & 0x80) === 0) {
                ++code
                if (i + code > size) {
                    code = size - i
                }
                dst.set(src.subarray(i, i + code), dstIndex)
                i += code
            } else {
                code = 1 - (code << 24 >> 24)
                dst.fill(src[i], dstIndex, dstIndex + code)
                ++i
            }
            dstIndex += code
        }
    }

    private static PC_drawTileMask(dst: Uint8Array, x0: number, y0: number, w: number, h: number, m: Uint8Array, p: Uint8Array, size: number) {
        assert(!(size !== (w * 2 * h)), `Assertion failed: ${size} === ${w * 2 * h}`)
        let mIndex = 0
        let pIndex = 0
        for (let y = 0; y < h; ++y) {
            for (let x = 0; x < w; ++x) {
                const bits = READ_BE_UINT16(m, mIndex)
                mIndex += 2
                for (let bit = 0; bit < 8; ++bit) {
                    const j = y0 + y
                    const i = x0 + 2 * (x * 8 + bit)
                    if (i >= 0 && i < GAMESCREEN_W && j >= 0 && j < GAMESCREEN_H) {
                        const color = p[pIndex]
                        if (bits & (1 << (15 - (bit * 2)))) {
                            dst[j * GAMESCREEN_W + i] = color >> 4
                        }
                        if (bits & (1 << (15 - (bit * 2 + 1)))) {
                            dst[j * GAMESCREEN_W + i + 1] = color & 15
                        }
                    }
                    ++pIndex
                }
            }
        }
    }

    private static decodeSgd(dst: Uint8Array, src: Uint8Array, data: Uint8Array) {
        let num = -1
        let index = 0
        const buf = new Uint8Array(GAMESCREEN_W * 32)
        let count = READ_BE_UINT16(src) - 1
        index += 2
        do {
            let d2 = READ_BE_UINT16(src, index)
            index += 2
            const d0 = READ_BE_UINT16(src, index) << 16 >> 16
            index += 2
            const d1 = READ_BE_UINT16(src, index) << 16 >> 16
            index += 2

            if (d2 !== 0xFFFF) {
                d2 &= ~(1 << 15)
                const signedOffset = READ_BE_UINT32(data, d2 * 4) | 0
                if (signedOffset < 0) {
                    const ptrOffset = data.byteOffset - signedOffset
                    const hasEmbeddedPtr = ptrOffset >= 0 && (ptrOffset + 2) <= data.buffer.byteLength
                    if (hasEmbeddedPtr) {
                        const ptr = new Uint8Array(data.buffer, ptrOffset)
                        let ptrIndex = 0
                        const size = READ_BE_UINT16(ptr, ptrIndex)
                        ptrIndex += 2
                        if (num !== d2) {
                            num = d2
                            buf.set(ptr.subarray(ptrIndex, size + ptrIndex))
                        }
                    } else {
                        const offset = READ_BE_UINT32(data, d2 * 4) & 0xFFFFFF
                        if (num !== d2) {
                            num = d2
                            AmigaLevelImageExporter.AMIGA_decodeRle(buf, data.subarray(offset))
                        }
                    }
                } else {
                    if (num !== d2) {
                        num = d2
                        AmigaLevelImageExporter.AMIGA_decodeRle(buf, data.subarray(signedOffset))
                    }
                }
            }

            const w = (buf[0] + 1) >> 1
            const h = buf[1] + 1
            const planarSize = READ_BE_UINT16(buf, 2)
            AmigaLevelImageExporter.PC_drawTileMask(dst, d0, d1, w, h, buf.subarray(4), buf.subarray(4 + planarSize), planarSize)
        } while (--count >= 0)
    }

    private static PC_drawTile(dst: Uint8Array, src: Uint8Array, mask: number, xflip: boolean, yflip: boolean, colorKey: number) {
        let pitch = GAMESCREEN_W
        let dstIndex = 0
        let srcIndex = 0
        if (yflip) {
            dstIndex += 7 * pitch
            pitch = -pitch
        }
        let inc = 1
        if (xflip) {
            dstIndex += 7
            inc = -1
        }
        for (let y = 0; y < 8; ++y) {
            for (let i = 0; i < 8; i += 2) {
                let color = src[srcIndex] >> 4
                if (color !== colorKey) {
                    dst[dstIndex + inc * i] = mask | color
                }
                color = src[srcIndex] & 15
                if (color !== colorKey) {
                    dst[dstIndex + inc * (i + 1)] = mask | color
                }
                ++srcIndex
            }
            dstIndex += pitch
        }
    }

    private static decodeLevHelper(dst: Uint8Array, src: Uint8Array, sgdOffset: number, offset12: number, tileDataBuffer: Uint8Array, sgdBuf: boolean, isPC: boolean) {
        if (sgdOffset !== 0) {
            let a0 = sgdOffset
            for (let y = 0; y < GAMESCREEN_H; y += 8) {
                for (let x = 0; x < GAMESCREEN_W; x += 8) {
                    const d3 = isPC ? READ_LE_UINT16(src, a0) : READ_BE_UINT16(src, a0)
                    a0 += 2
                    const d0 = d3 & 0x7FF
                    if (d0 !== 0) {
                        const tileData = tileDataBuffer.subarray(d0 * 32)
                        const yflip = (d3 & (1 << 12)) !== 0
                        const xflip = (d3 & (1 << 11)) !== 0
                        let mask = 0
                        if ((d3 & 0x8000) !== 0) {
                            mask = 0x80 + ((d3 >> 6) & 0x10)
                        }
                        AmigaLevelImageExporter.PC_drawTile(dst.subarray(y * GAMESCREEN_W + x), tileData, mask, xflip, yflip, -1)
                    }
                }
            }
        }

        if (offset12 !== 0) {
            let a0 = offset12
            for (let y = 0; y < GAMESCREEN_H; y += 8) {
                for (let x = 0; x < GAMESCREEN_W; x += 8) {
                    const d3 = isPC ? READ_LE_UINT16(src, a0) : READ_BE_UINT16(src, a0)
                    a0 += 2
                    let d0 = d3 & 0x7FF
                    if (d0 !== 0 && sgdBuf) {
                        d0 -= 896
                    }
                    if (d0 !== 0) {
                        const tileData = tileDataBuffer.subarray(d0 * 32)
                        const yflip = (d3 & (1 << 12)) !== 0
                        const xflip = (d3 & (1 << 11)) !== 0
                        let mask = 0
                        if ((d3 & 0x6000) !== 0 && sgdBuf) {
                            mask = 0x10
                        } else if ((d3 & 0x8000) !== 0) {
                            mask = 0x80 + ((d3 >> 6) & 0x10)
                        }
                        AmigaLevelImageExporter.PC_drawTile(dst.subarray(y * GAMESCREEN_W + x), tileData, mask, xflip, yflip, 0)
                    }
                }
            }
        }
    }


    private static amigaConvertColor(color: number, bgr: boolean) {
        let r = (color & 0xF00) >> 8
        let g = (color & 0xF0) >> 4
        let b = color & 0xF
        if (bgr) {
            const tmp = r
            r = b
            b = tmp
        }
        return {
            r: (r << 4) | r,
            g: (g << 4) | g,
            b: (b << 4) | b
        }
    }

    private getBankDataSize(num: number): number {
        let len = READ_BE_UINT16(this._mbk, num * 6 + 4)
        if (len & 0x8000) {
            if (this._usesBnqFormat) {
                len = -(len << 16 >> 16)
            } else {
                len &= 0x7FFF
            }
        }
        return len * 32
    }

    private loadBankData(num: number): Uint8Array {
        const key = String(num)
        if (this._bankCache[key]) {
            return this._bankCache[key]
        }

        const ptr = this._mbk.subarray(num * 6)
        let dataOffset = READ_BE_UINT32(ptr) & 0xFFFF
        const size = this.getBankDataSize(num)
        const data = this._mbk.subarray(dataOffset)

        let decoded: Uint8Array
        if (READ_BE_UINT16(ptr, 4) & 0x8000) {
            decoded = data.slice(0, size)
        } else {
            assert(!(dataOffset <= 4), `Assertion failed: ${dataOffset} > 4`)
            const expectedSize = READ_BE_UINT32(data.buffer, data.byteOffset - 4) | 0
            assert(!(size !== expectedSize), `Assertion failed: ${size} === ${expectedSize}`)
            decoded = new Uint8Array(size)
            if (!bytekiller_unpack(decoded, size, data, 0)) {
                throw new Error(`Bad CRC for bank data ${num}`)
            }
        }

        this._bankCache[key] = decoded
        return decoded
    }

}

export { AmigaLevelImageExporter }
