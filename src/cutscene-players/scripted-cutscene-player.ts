import { Graphics } from '../graphics'
import { Buffer, Color, Point, READ_BE_UINT16 } from '../intern'
import { ObjectType, Resource } from '../resource/resource'
import { SystemStub, DF_FASTMODE, DIR_UP, DIR_DOWN, DIR_LEFT, DIR_RIGHT } from '../systemstub_web'
import { Video } from '../video'
import { _cosTable, _musicTable, _namesTableDOS,  _offsetsTableDOS, _sinTable } from '../staticres'
import { SCREENBLOCK_W, SCREENBLOCK_H, GAMESCREEN_W, GAMESCREEN_H, CHAR_W, CHAR_H, UINT16_MAX, UINT8_MAX } from '../game_constants'
import { assert } from "../assert"



type OpcodeStub = () => void

const NUM_OPCODES = 15
const TIMER_SLICE = 15

const kTextJustifyLeft = 0
const kTextJustifyAlign = 1
const kTextJustifyCenter = 2

interface SetShape {
    offset: number
    size: number
}

const SIN = (a: number) => _sinTable[a] << 16 >> 16
const COS = (a: number) => _cosTable[a] << 16 >> 16

const scalePoints = (pt: Point[], count: number, scale: number) => {
    if (scale !== 1) {
        let i = 0
        while (count--) {
            pt[i].x *= scale
            pt[i].y *= scale
            i++
        }
    }
}

class ScriptedCutscenePlayer {
    _opcodeTable: OpcodeStub[] = [
    /* 0x00 */
	this.op_markCurPos.bind(this),
	this.op_refreshScreen.bind(this),
	this.op_waitForSync.bind(this),
	this.op_drawShape.bind(this),
	// /* 0x04 */
	this.op_setPalette.bind(this),
	this.op_markCurPos.bind(this),
	this.op_drawCaptionText.bind(this), // &Cutscene::op_drawCaptionText,
	null, // &Cutscene::op_nop,
	// /* 0x08 */
	null, // &Cutscene::op_skip3,
	this.op_refreshAll.bind(this), // &Cutscene::op_refreshAll,
	this.op_drawShapeScale.bind(this),
	this.op_drawShapeScaleRotate.bind(this),
	// /* 0x0C */
	this.op_drawCreditsText.bind(this),
	null,// &Cutscene::op_drawStringAtPos,
	this.op_handleKeys.bind(this)
    ]

    static _namesTableDOS: string[] = _namesTableDOS
    static _offsetsTableDOS: Uint16Array = _offsetsTableDOS
    static _musicTable: Uint8Array = _musicTable
    static kMaxPaletteSize = 32
    static kMaxShapesCount = 16

    private _gfx: Graphics = new Graphics()
    protected _res: Resource
    protected _stub: SystemStub
    protected _vid: Video

    private _deathCutsceneId: number
    private _getInterrupted: () => boolean
    private _setInterrupted: (interrupted: boolean) => void
    private _isEspionsCutscene: boolean
    private _stop: boolean
    private _polPtr: Uint8Array
    private _cmdPtr: Uint8Array
    private _cmdPtrOffset: number
    private _cmdPtrBak: Uint8Array
    private _cmdPtrBakOffset: number
    private _tstamp: number
    private _frameDelay: number
    private _newPal: boolean
    private _palBuf: Uint8Array
    private _baseOffset: number
    protected _creditsSequence: boolean
    private _rotMat: number[] = new Array(4)
    private _primitiveColor: number
    private _clearScreen: number
    private _vertices: Point[] = new Array(0x80).fill(null).map(() => ({
        x: 0,
        y: 0
    }))
    _hasAlphaColor: boolean
    _varKey: number
    _shape_ix: number
    _shape_iy: number
    _shape_ox: number
    _shape_oy: number
    _shape_cur_x: number
    _shape_cur_y: number
    _shape_prev_x: number
    _shape_prev_y: number
    _shape_count: number
    _shape_cur_x16: number
    _shape_cur_y16: number
    _shape_prev_x16: number
    _shape_prev_y16: number
    _textSep = new Uint8Array(0x14)
    _textCurBuf: Uint8Array
    _textCurBufOffset: number
    _creditsSlowText: number
    _creditsTextCounter: number
    _page0: Uint8Array
    _page1: Uint8Array
    _pageC: Uint8Array

    /** @deprecated Use Cutscene (mp4/delegated flow) instead. */
    constructor(res: Resource, stub: SystemStub, vid: Video, getInterrupted: () => boolean = () => false, setInterrupted: (interrupted: boolean) => void = () => {}) {
        this._res = res
        this._stub = stub
        this._vid = vid
        this._getInterrupted = getInterrupted
        this._setInterrupted = setInterrupted
        this._palBuf = new Uint8Array(64)
    }

    /** @deprecated Use Cutscene (mp4/delegated flow) instead. */
    static isNewLineChar(chr: number, res: Resource) {
        const nl = 0x7C
        return chr === nl
    }

    /** @deprecated Use Cutscene (mp4/delegated flow) instead. */
    isInterrupted() {
        return this._getInterrupted()
    }

    /** @deprecated Use Cutscene (mp4/delegated flow) instead. */
    getDeathCutSceneId() {
        return this._deathCutsceneId
    }

    /** @deprecated Use Cutscene (mp4/delegated flow) instead. */
    setDeathCutSceneId(cutSceneId: number) {
        this._deathCutsceneId = cutSceneId
    }

    /** @deprecated Use Cutscene (mp4/delegated flow) instead. */
    findTextSeparators(p: Uint8Array, len: number) {
        const q = this._textSep
        let index = 0
        let ret = 0
        let pos = 0
        for (let i = 0; i < len && p[i] !== 0xA; ++i) {
            if (ScriptedCutscenePlayer.isNewLineChar(p[i], this._res)) {
                q[index++] = pos
                if (pos > ret) {
                    ret = pos
                }
                pos = 0
            } else {
                ++pos
            }
        }
        q[index++] = pos
        if (pos > ret) {
            ret = pos
        }
        q[index++] = 0
        return ret
    }

    /** @deprecated Use Cutscene (mp4/delegated flow) instead. */
    drawText(x: number, y: number, p: Uint8Array, color: number, page: Uint8Array, textJustify: number) {
        let len = 0
        let str = new TextDecoder().decode(p)
        len = str.length

        const dcf = this._vid._drawChar
        const fnt = this._res._fnt
        let lastSep = 0
        if (textJustify !== kTextJustifyLeft) {
            lastSep = this.findTextSeparators(p, len)
            if (textJustify !== kTextJustifyCenter) {
                lastSep =  30
            }
        }
        const sep = this._textSep
        let index = 0
        y += 50
        x +=  8
        let yPos = y
        let xPos = x
        if (textJustify !== kTextJustifyLeft) {
            xPos += ((lastSep - sep[index++]) / 2) * CHAR_W
        }
        for (let i = 0; i < len && p[i] !== 0xA; ++i) {
            if (ScriptedCutscenePlayer.isNewLineChar(p[i], this._res)) {
                yPos += CHAR_H
                xPos = x
                if (textJustify !== kTextJustifyLeft) {
                    xPos += ((lastSep - sep[index++]) / 2) * CHAR_W
                }
            } else if (p[i] === 0x20) {
                xPos += CHAR_W
            } else if (p[i] === 0x9) {
                // ignore tab
            } else {
                dcf(page, this._vid._w, xPos, yPos, fnt, color, p[i])
                xPos += CHAR_W
            }
        }
    }


    /** @deprecated Use Cutscene (mp4/delegated flow) instead. */
    async mainLoop(num: number, cutsceneId: number = UINT16_MAX) {
        // console.log("=================")
        // console.log('mainLoop', num)
        this._frameDelay = 5
        this._tstamp = new Date().getTime()

        const c:Color = {
            r: 0,
            g: 0,
            b: 0
        }
        for (let i = 0; i < 0x20; ++i) {
            this._stub.setPaletteEntry(0xC0 + i, c)
        }
        this._newPal = false
        this._hasAlphaColor = false
        const p:Uint8Array = this.getCommandData()
        let offset = 0

            if (num !== 0) {
                offset = READ_BE_UINT16(p.buffer, 2 + num * 2)
            }
            this._baseOffset = (READ_BE_UINT16(p.buffer) + 1) * 2

        this._varKey = 0
        this._isEspionsCutscene = (cutsceneId === 0x39)
        this._cmdPtr = this._cmdPtrBak = new Uint8Array(p.buffer)
        this._cmdPtrOffset  = this._cmdPtrBakOffset = this._baseOffset + offset
        this._polPtr = this.getPolygonData()
        while (!this._stub._pi.quit && !this._getInterrupted() && !this._stop) {
            let op = this.fetchNextCmdByte()

            if (op & 0x80) {
                break
            }
            op >>= 2
            if (op >= NUM_OPCODES) {
                throw(`Invalid cutscene opcode = 0x${op.toString(16)}`)
            }
            try {
                await this._opcodeTable[op]()
            } catch(e) {
                debugger
            }
            await this._stub.processEvents()
            if (this._stub._pi.backspace) {
                this._stub._pi.backspace = false
                this._setInterrupted(true)
            }
        }
    }

    /** @deprecated Use Cutscene (mp4/delegated flow) instead. */
    fetchNextCmdByte() {
        return this._cmdPtr[this._cmdPtrOffset++]
    }

    /** @deprecated Use Cutscene (mp4/delegated flow) instead. */
    fetchNextCmdWord() {
        const i = READ_BE_UINT16(this._cmdPtr.buffer, this._cmdPtrOffset)
        this._cmdPtrOffset += 2
        return i
    }

    /** @deprecated Use Cutscene (mp4/delegated flow) instead. */
    getCommandData() {
        return this._res._cmd
    }

    /** @deprecated Use Cutscene (mp4/delegated flow) instead. */
    getPolygonData() {
        return this._res._pol
    }

    /** @deprecated Use Cutscene (mp4/delegated flow) instead. */
    async sync() {
        if (this._stub._pi.quit) {
            return
        }
        if (this._stub._pi.dbgMask & DF_FASTMODE) {
            return
        }
        const delay = this._stub.getTimeStamp() - this._tstamp
        const pause = this._frameDelay * TIMER_SLICE - delay
        if (pause > 0) {
            await this._stub.sleep(pause)
        }
        this._tstamp = this._stub.getTimeStamp()
    }

    /** @deprecated Use Cutscene (mp4/delegated flow) instead. */
    copyPalette(pal: Uint8Array, num:number) {
        const dst = this._palBuf
        let offset = 0
        if (num !== 0) {
            offset += 0x20
        }
        dst.set(pal.subarray(0, 0x20), offset)
        this._newPal = true
    }

    /** @deprecated Use Cutscene (mp4/delegated flow) instead. */
    updatePalette() {
        if (this._newPal) {
            const p = this._palBuf
            let offset = 0
            for (let i = 0; i < 32; ++i) {
                const color = READ_BE_UINT16(p.buffer, offset)
                offset += 2
                const c:Color = Video.AMIGA_convertColor(color)
                this._stub.setPaletteEntry(0xC0 +i, c)
            }
            this._newPal = false
        }
    }

    /** @deprecated Use Cutscene (mp4/delegated flow) instead. */
    async setPalette() {
        await this.sync()
        this.updatePalette()
        const tmp = this._page0
        this._page0 = this._page1
        this._page1 = tmp
        this._stub.copyRect(0, 0, this._vid._w, this._vid._h, this._page0, this._vid._w)
        await this._stub.updateScreen(0)
    }

    /** @deprecated Use Cutscene (mp4/delegated flow) instead. */
    async load(cutName: number): Promise<boolean> {
        assert(!(cutName === UINT16_MAX), `Assertion failed: ${cutName} !== UINT16_MAX`)
        let name = ScriptedCutscenePlayer._namesTableDOS[cutName & UINT8_MAX]
        const _res = this._res

        await _res.load(name, ObjectType.OT_CMD)
        await _res.load(name, ObjectType.OT_POL)

        await _res.load_CINE()
        return !!(_res._cmd && _res._pol)
    }

    /** @deprecated Use Cutscene (mp4/delegated flow) instead. */
    unload() {
        this._res.unload(ObjectType.OT_CMD)
        this._res.unload(ObjectType.OT_POL)
    }

    /** @deprecated Use Cutscene (mp4/delegated flow) instead. */
    prepare() {
        this._page0 = this._vid._frontLayer
        this._page1 = this._vid._tempLayer
        this._pageC = this._vid._tempLayer2
        this._stub._pi.dirMask = 0
        this._stub._pi.enter = false
        this._stub._pi.space = false
        this._stub._pi.shift = false
        this._setInterrupted(false)
        this._stop = false
        const w = 240
        const h = 128

        //black frame width?
        const x = 8 // (Video.GAMESCREEN_W - w) / 2  where GAMESCREEN_W =256
        //black frame height?
        const y = 50

        const sw = w
        const sh = h
        const sx = x
        const sy = y
        this._gfx.setClippingRect(sx, sy, sw, sh)
    }

    /** @deprecated Use Cutscene (mp4/delegated flow) instead. */
    op_setPalette() {
        const num = this.fetchNextCmdByte()
        const palNum = this.fetchNextCmdByte()
        const off = READ_BE_UINT16(this._polPtr.buffer, 6)
        const p = new Uint8Array(this._polPtr.buffer, off + num * 32)
        this.copyPalette(p, palNum^1)
        if (this._creditsSequence) {
            this._palBuf[0x20] = 0x0F
            this._palBuf[0x21] = UINT8_MAX
        }
    }

    /** @deprecated Use Cutscene (mp4/delegated flow) instead. */
    drawShapeScaleRotate(data: Buffer, zoom: number, b: number, c: number, d: number, e: number, f: number, g: number) {
        const startOffset = data.offset
        this._gfx.setLayer(this._page1, this._vid._w)
        let numVertices = data.getUint8Array()[0]
        data.offset++
        if (numVertices & 0x80) {
            let x, y, ix, iy
            const pr = new Array<Point>(2);
            const pt = this._vertices
            let index = 0
            this._shape_cur_x = ix = b + (READ_BE_UINT16(data)  << 16 >> 16)
            data.offset += 2;
            this._shape_cur_y = iy = c + (READ_BE_UINT16(data) << 16 >> 16)
            data.offset += 2
            x = READ_BE_UINT16(data) << 16 >> 16
            data.offset += 2;
            y = READ_BE_UINT16(data) << 16 >> 16
            data.offset += 2
            this._shape_cur_x16 = this._shape_ix - ix;
            this._shape_cur_y16 = this._shape_iy - iy;
            this._shape_ox = this._shape_cur_x = this._shape_ix + ((this._shape_cur_x16 * this._rotMat[0] + this._shape_cur_y16 * this._rotMat[1]) >> 8);
            this._shape_oy = this._shape_cur_y = this._shape_iy + ((this._shape_cur_x16 * this._rotMat[2] + this._shape_cur_y16 * this._rotMat[3]) >> 8)
            pr[0] = {
                x: 0,
                y: -y
            }
            pr[1] = {
                x: -x,
                y: y
            }
            if (this._shape_count === 0) {
                f -= ((this._shape_ix - this._shape_cur_x) * zoom * 128 + 0x8000) >> 16
                g -= ((this._shape_iy - this._shape_cur_y) * zoom * 128 + 0x8000) >> 16
                pt[index].x = f
                pt[index].y = g
                index++
                this._shape_cur_x16 = f << 16
                this._shape_cur_y16 = g << 16
            } else {
                this._shape_cur_x16 = this._shape_prev_x16 + (this._shape_cur_x - this._shape_prev_x) * zoom * 128
                this._shape_cur_y16 = this._shape_prev_y16 + (this._shape_cur_y - this._shape_prev_y) * zoom * 128
                pt[index].x = (this._shape_cur_x16 + 0x8000) >> 16;
                pt[index].y = (this._shape_cur_y16 + 0x8000) >> 16;
                index++ 
            }
            for (let i = 0; i < 2; ++i) {
                this._shape_cur_x += pr[i].x
                this._shape_cur_x16 += pr[i].x * zoom * 128
                pt[index].x = (this._shape_cur_x16 + 0x8000) >> 16
                this._shape_cur_y += pr[i].y
                this._shape_cur_y16 += pr[i].y * zoom * 128
                pt[index].y = (this._shape_cur_y16 + 0x8000) >> 16
                index++
            }
            this._shape_prev_x = this._shape_cur_x
            this._shape_prev_y = this._shape_cur_y
            this._shape_prev_x16 = this._shape_cur_x16
            this._shape_prev_y16 = this._shape_cur_y16
            const po:Point = {
                x: this._vertices[0].x + d + this._shape_ix,
                y: this._vertices[0].y + e + this._shape_iy
            }

            const rx = this._vertices[0].x - this._vertices[2].x
            const ry = this._vertices[0].y - this._vertices[1].y
            scalePoints([po], 1, 1);
            this._gfx.drawEllipse(this._primitiveColor, this._hasAlphaColor, po, rx, ry)
        } else if (numVertices === 0) {
            // TODO
            debugger
        } else {
            let x, y, a, shape_last_x, shape_last_y
            const tempVertices = new Array<Point>(40)
            for (let i = 0; i < 40; ++i)
                tempVertices[i] = {
                    x: 0,
                    y: 0,
                }
            this._shape_cur_x = b + (READ_BE_UINT16(data) << 16 >> 16)
            data.offset += 2
            x = this._shape_cur_x
            this._shape_cur_y = c + (READ_BE_UINT16(data) << 16 >> 16)
            data.offset += 2
            y = this._shape_cur_y
            this._shape_cur_x16 = this._shape_ix - x
            this._shape_cur_y16 = this._shape_iy - y

            a = this._shape_ix + ((this._rotMat[0] * this._shape_cur_x16 + this._rotMat[1] * this._shape_cur_y16) >> 8)
            if (this._shape_count == 0) {
                this._shape_ox = a
            }
            this._shape_cur_x = shape_last_x = a
            a = this._shape_iy + ((this._rotMat[2] * this._shape_cur_x16 + this._rotMat[3] * this._shape_cur_y16) >> 8)
            if (this._shape_count == 0) {
               this. _shape_oy = a
            }
            this._shape_cur_y = shape_last_y = a

            let ix = x
            let iy = y
            let pt2 = 0
            let sx = 0
            for (let n = numVertices - 1; n >= 0; --n) {
                x = (data.getUint8Array()[0] << 24 >>24) + sx
                data.offset++
                y = (data.getUint8Array()[0] << 24 >>24)
                data.offset++
                if (y === 0 && n !== 0 && data.getUint8Array()[1] === 0) {
                    sx = x
                    --numVertices
                } else {
                    ix += x
                    iy += y
                    sx = 0
                    this._shape_cur_x16 = this._shape_ix - ix
                    this._shape_cur_y16 = this._shape_iy - iy
                    a = this._shape_ix + ((this._rotMat[0] * this._shape_cur_x16 + this._rotMat[1] * this._shape_cur_y16) >> 8)
                    tempVertices[pt2].x = a - shape_last_x
                    shape_last_x = a;
                    a = this._shape_iy + ((this._rotMat[2] * this._shape_cur_x16 + this._rotMat[3] * this._shape_cur_y16) >> 8);
                    tempVertices[pt2].y = a - shape_last_y
                    shape_last_y = a
                    ++pt2;
                }
            }
            const pt = this._vertices
            let index = 0
            if (this._shape_count == 0) {
                ix = this._shape_ox
                iy = this._shape_oy
                f -= (((this._shape_ix - ix) * zoom * 128) + 0x8000) >> 16
                g -= (((this._shape_iy - iy) * zoom * 128) + 0x8000) >> 16
                pt[index].x = f + this._shape_ix + d
                pt[index].y = g + this._shape_iy + e
                ++index
                this._shape_cur_x16 = f << 16
                this._shape_cur_y16 = g << 16
            } else {
                this._shape_cur_x16 = this._shape_prev_x16 + ((this._shape_cur_x - this._shape_prev_x) * zoom * 128)
                pt[index].x = this._shape_ix + d + ((this._shape_cur_x16 + 0x8000) >> 16)
                this._shape_cur_y16 = this._shape_prev_y16 + ((this._shape_cur_y - this._shape_prev_y) * zoom * 128)
                pt[index].y = this._shape_iy + e + ((this._shape_cur_y16 + 0x8000) >> 16)
                ++index
            }
            for (let i = 0; i < numVertices; ++i) {
                this._shape_cur_x += tempVertices[i].x
                this._shape_cur_x16 += tempVertices[i].x * zoom * 128
                pt[index].x = d + this._shape_ix + ((this._shape_cur_x16 + 0x8000) >> 16)
                this._shape_cur_y += tempVertices[i].y
                this._shape_cur_y16 += tempVertices[i].y * zoom * 128
                pt[index].y = e + this._shape_iy + ((this._shape_cur_y16 + 0x8000) >> 16)
                ++index
            }

            this._shape_prev_x = this._shape_cur_x
            this._shape_prev_y = this._shape_cur_y
            this._shape_prev_x16 = this._shape_cur_x16
            this._shape_prev_y16 = this._shape_cur_y16
            scalePoints(this._vertices, numVertices + 1, 1)
            this._gfx.drawPolygon(this._primitiveColor, this._hasAlphaColor, this._vertices, numVertices + 1)            
        }
        data.offset = startOffset
    }

    /** @deprecated Use Cutscene (mp4/delegated flow) instead. */
    drawShapeScale(data: Buffer, zoom: number, b: number, c: number, d: number, e: number, f: number, g: number) {
        const startOffset = data.offset
        this._gfx.setLayer(this._page1, this._vid._w)
        let numVertices = data.getUint8Array()[0]
        data.offset++
        if (numVertices & 0x80) {
            let x, y
            const pt = this._vertices
            let index = 0
            const pr:[Point, Point] = [{
                x: 0,
                y: 0
            }, {
                x: 0,
                y: 0
            }]
            this._shape_cur_x = b + (READ_BE_UINT16(data) << 16 >> 16)
            data.offset += 2
            this._shape_cur_y = c + (READ_BE_UINT16(data) << 16 >> 16)
            data.offset += 2
            x = READ_BE_UINT16(data) << 16 >> 16
            data.offset += 2
            y = READ_BE_UINT16(data) << 16 >> 16
            data.offset += 2
            this._shape_cur_x16 = 0
            this._shape_cur_y16 = 0
            pr[0].x =  0
            pr[0].y = -y
            pr[1].x = -x
            pr[1].y =  y
            if (this._shape_count == 0) {
                f -= ((((this._shape_ix - this._shape_ox) * zoom) * 128) + 0x8000) >> 16
                g -= ((((this._shape_iy - this._shape_oy) * zoom) * 128) + 0x8000) >> 16
                pt[index].x = f
                pt[index].y = g
                index++
                this._shape_cur_x16 = f << 16
                this._shape_cur_y16 = g << 16
            } else {
                this._shape_cur_x16 = this._shape_prev_x16 + ((this._shape_cur_x - this._shape_prev_x) * zoom) * 128
                pt[index].x = (this._shape_cur_x16 + 0x8000) >> 16
                this._shape_cur_y16 = this._shape_prev_y16 + ((this._shape_cur_y - this._shape_prev_y) * zoom) * 128
                pt[index].y = (this._shape_cur_y16 + 0x8000) >> 16
                index++
            }
            for (let i = 0; i < 2; ++i) {
                this._shape_cur_x += pr[i].x
                this._shape_cur_x16 += pr[i].x * zoom * 128
                pt[index].x = (this._shape_cur_x16 + 0x8000) >> 16
                this._shape_cur_y += pr[i].y
                this._shape_cur_y16 += pr[i].y * zoom * 128
                pt[index].y = (this._shape_cur_y16 + 0x8000) >> 16
                index++
            }
            this._shape_prev_x = this._shape_cur_x
            this._shape_prev_y = this._shape_cur_y
            this._shape_prev_x16 = this._shape_cur_x16
            this._shape_prev_y16 = this._shape_cur_y16
            const po: Point = {
                x: this._vertices[0].x + d + this._shape_ix,
                y: this._vertices[0].y + e + this._shape_iy
            }
            let rx = this._vertices[0].x - this._vertices[2].x
            let ry = this._vertices[0].y - this._vertices[1].y
            scalePoints([po], 1, 1);
            this._gfx.drawEllipse(this._primitiveColor, this._hasAlphaColor, po, rx, ry)
        } else if (numVertices === 0) {
            // TODO
            debugger
        } else {
            const pt = this._vertices
            let index = 0
            let ix, iy
            this._shape_cur_x = ix = (READ_BE_UINT16(data) << 16 >> 16) + b
            data.offset += 2
            this._shape_cur_y = iy = (READ_BE_UINT16(data) << 16 >> 16) + c
            data.offset += 2
            if (this._shape_count === 0) {
                f -= ((((this._shape_ix - this._shape_ox) * zoom) * 128) + 0x8000) >> 16
                g -= ((((this._shape_iy - this._shape_oy) * zoom) * 128) + 0x8000) >> 16
                pt[index].x = f + this._shape_ix + d
                pt[index].y = g + this._shape_iy + e
                index++
                this._shape_cur_x16 = f << 16;
                this._shape_cur_y16 = g << 16;
            } else {
                this._shape_cur_x16 = this._shape_prev_x16 + ((this._shape_cur_x - this._shape_prev_x) * zoom) * 128
                this._shape_cur_y16 = this._shape_prev_y16 + ((this._shape_cur_y - this._shape_prev_y) * zoom) * 128;
                pt[index].x = ix = ((this._shape_cur_x16 + 0x8000) >> 16) + this._shape_ix + d
                pt[index].y = iy = ((this._shape_cur_y16 + 0x8000) >> 16) + this._shape_iy + e
                index++
            }
            let n = numVertices -1
            ++numVertices
            let sx = 0
            for (; n >= 0; --n) {
                ix = (data.getUint8Array()[0] << 24 >>24) + sx
                data.offset++
                iy = (data.getUint8Array()[0] << 24 >>24)
                data.offset++
                if (iy === 0 && n !== 0 && (data.getUint8Array()[1]) === 0) {
                    sx = ix
                    --numVertices
                } else {
                    sx = 0
                    this._shape_cur_x += ix
                    this._shape_cur_y += iy
                    this._shape_cur_x16 += ix * zoom * 128
                    this._shape_cur_y16 += iy * zoom * 128
                    pt[index].x = ((this._shape_cur_x16 + 0x8000) >> 16) + this._shape_ix + d
                    pt[index].y = ((this._shape_cur_y16 + 0x8000) >> 16) + this._shape_iy + e
                    index++
                }
            }
            this._shape_prev_x = this._shape_cur_x
            this._shape_prev_y = this._shape_cur_y
            this._shape_prev_x16 = this._shape_cur_x16
            this._shape_prev_y16 = this._shape_cur_y16
            scalePoints(this._vertices, numVertices, 1)
            this._gfx.drawPolygon(this._primitiveColor, this._hasAlphaColor, this._vertices, numVertices)
        }
        data.offset = startOffset
    }

    /** @deprecated Use Cutscene (mp4/delegated flow) instead. */
    async op_refreshAll() {
        this._frameDelay = 5
        await this.setPalette()
        this.swapLayers()
        this._creditsSlowText = UINT8_MAX
        this.op_handleKeys()
    }

    /** @deprecated Use Cutscene (mp4/delegated flow) instead. */
    op_drawShapeScale() {
        this._shape_count = 0
        let x = 0
        let y = 0
        let shapeOffset = this.fetchNextCmdWord()
        if (shapeOffset & 0x8000) {
            x = this.fetchNextCmdWord() << 16 >> 16
            y = this.fetchNextCmdWord() << 16 >> 16
        }
        let zoom = (this.fetchNextCmdWord() + 512) % 65536
        this._shape_ix = this.fetchNextCmdByte()
        this._shape_iy = this.fetchNextCmdByte()

        const shapeOffsetTable = new Buffer(this._polPtr.buffer, READ_BE_UINT16(this._polPtr.buffer, 0x02))
        const shapeDataTable = new Buffer(this._polPtr.buffer, READ_BE_UINT16(this._polPtr.buffer, 0x0E))
        const verticesOffsetTable = new Buffer(this._polPtr.buffer, READ_BE_UINT16(this._polPtr.buffer, 0x0A))
        const verticesDataTable = new Buffer(this._polPtr.buffer, READ_BE_UINT16(this._polPtr.buffer, 0x12))
        
        const shapeData = shapeDataTable.from(READ_BE_UINT16(shapeOffsetTable, (shapeOffset & 0x7FF) * 2))
        let primitiveCount = READ_BE_UINT16(shapeData)
        shapeData.offset += 2

        if (primitiveCount !== 0) {
            let verticesOffset = READ_BE_UINT16(shapeData)
            let dx = 0
            let dy = 0
            if (verticesOffset & 0x8000) {
                // cast uint16 to int16
                dx = READ_BE_UINT16(shapeData, 2) << 16 >> 16
                dy = READ_BE_UINT16(shapeData, 4) << 16 >> 16
            }

            let p = verticesDataTable.from(READ_BE_UINT16(verticesOffsetTable, (verticesOffset & 0x3FFF) * 2) + 1)

            this._shape_ox = (READ_BE_UINT16(p) << 16 >> 16) + dx
            p.offset += 2
            this._shape_oy = (READ_BE_UINT16(p) << 16 >> 16) + dy
            p.offset += 2

            while (primitiveCount--) {
                verticesOffset = READ_BE_UINT16(shapeData)
                shapeData.offset += 2
                p = verticesDataTable.from(READ_BE_UINT16(verticesOffsetTable, (verticesOffset & 0x3FFF) * 2))
                dx = 0
                dy = 0

                if (verticesOffset & 0x8000) {
                    dx = READ_BE_UINT16(shapeData) << 16 >> 16
                    shapeData.offset += 2
                    dy = READ_BE_UINT16(shapeData) << 16 >> 16
                    shapeData.offset += 2
                }
                this._hasAlphaColor = (verticesOffset & 0x4000) !== 0
                let color = shapeData.getUint8Array()[0]
                shapeData.offset++
                if (this._clearScreen === 0) {
                    color += 0x10
                }
                this._primitiveColor = 0xC0 + color
                this.drawShapeScale(p, zoom, dx, dy, x, y, 0, 0)
                ++this._shape_count
            }
        }
    }

    /** @deprecated Use Cutscene (mp4/delegated flow) instead. */
    op_drawShapeScaleRotate() {
        this._shape_count = 0

        let x = 0
        let y = 0
        let shapeOffset = this.fetchNextCmdWord()
        if (shapeOffset & 0x8000) {
            x = this.fetchNextCmdWord() << 16 >> 16
            y = this.fetchNextCmdWord() << 16 >> 16
        }

        let zoom = 512
        if (shapeOffset & 0x4000) {
            zoom = (zoom + this.fetchNextCmdWord()) % 65536
        }
        this._shape_ix = this.fetchNextCmdByte()
        this._shape_iy = this.fetchNextCmdByte()

        let r1, r2, r3
        r1 = this.fetchNextCmdWord()
        r2 = 180
        if (shapeOffset & 0x2000) {
            r2 = this.fetchNextCmdWord()
        }
        r3 = 90
        if (shapeOffset & 0x1000) {
            r3 = this.fetchNextCmdWord()
        }
        this.setRotationTransform(r1, r2, r3)

        const shapeOffsetTable = new Buffer(this._polPtr.buffer, READ_BE_UINT16(this._polPtr.buffer, 0x02))
        const shapeDataTable = new Buffer(this._polPtr.buffer, READ_BE_UINT16(this._polPtr.buffer, 0x0E))
        const verticesOffsetTable = new Buffer(this._polPtr.buffer, READ_BE_UINT16(this._polPtr.buffer, 0x0A))
        const verticesDataTable = new Buffer(this._polPtr.buffer, READ_BE_UINT16(this._polPtr.buffer, 0x12))
        
        const shapeData = shapeDataTable.from(READ_BE_UINT16(shapeOffsetTable, (shapeOffset & 0x7FF) * 2))
        let primitiveCount = READ_BE_UINT16(shapeData)
        shapeData.offset += 2
    
        while (primitiveCount--) {
            let verticesOffset = READ_BE_UINT16(shapeData)
            shapeData.offset += 2
            const p = verticesDataTable.from(READ_BE_UINT16(verticesOffsetTable, (verticesOffset & 0x3FFF) * 2))
            let dx = 0
            let dy = 0
            if (verticesOffset & 0x8000) {
                dx = READ_BE_UINT16(shapeData) << 16 >> 16
                shapeData.offset += 2
                dy = READ_BE_UINT16(shapeData) << 16 >> 16
                shapeData.offset += 2
            }
            this._hasAlphaColor = (verticesOffset & 0x4000) !== 0
            let color = shapeData.getUint8Array()[0]
            shapeData.offset++
            if (this._clearScreen === 0) {
                color += 0x10 // 2nd pal buf
            }
            this._primitiveColor = 0xC0 + color
            this.drawShapeScaleRotate(p, zoom, dx, dy, x, y, 0, 0)
            ++this._shape_count
        }
    }
    
    /** @deprecated Use Cutscene (mp4/delegated flow) instead. */
    setRotationTransform(a: number, b: number, c: number) {
        // identity a:0 b:180 c:90
        let sin_a = SIN(a)
        let cos_a = COS(a)
        let sin_c = SIN(c)
        let cos_c = COS(c)
        let sin_b = SIN(b)
        let cos_b = COS(b)
        this._rotMat[0] = ((cos_a * cos_b) >> 8) - ((((cos_c * sin_a) >> 8) * sin_b) >> 8)
        this._rotMat[1] = ((sin_a * cos_b) >> 8) + ((((cos_c * cos_a) >> 8) * sin_b) >> 8)
        this._rotMat[2] = ( sin_c * sin_a) >> 8
        this._rotMat[3] = (-sin_c * cos_a) >> 8
    }

    /** @deprecated Use Cutscene (mp4/delegated flow) instead. */
    async op_markCurPos() {
        this._cmdPtrBak = this._cmdPtr
        this._cmdPtrBakOffset = this._cmdPtrOffset
        this.drawCreditsText()
        this._frameDelay = 5
        await this.setPalette()
        this.swapLayers()
        this._creditsSlowText = 0
    }

    /** @deprecated Use Cutscene (mp4/delegated flow) instead. */
    op_drawCaptionText() {
        const strId = this.fetchNextCmdWord()
        if (!this._creditsSequence) {
            // 'espions' - ignore last call, allows caption to be displayed longer on the screen
            if (this._isEspionsCutscene && strId === UINT16_MAX) {
                if (((this._cmdPtr.byteOffset - this._cmdPtrBak.byteOffset) === 0x10)) {
                    this._frameDelay = 100
                    this.setPalette()
                    return
                }
            }
    
            const h = 45
            const y = GAMESCREEN_H  - h

            this._pageC.fill(0xC0, y * this._vid._w, y * this._vid._w + h * this._vid._w)
            this._page1.fill(0xC0, y * this._vid._w, y * this._vid._w + h * this._vid._w)
            this._page0.fill(0xC0, y * this._vid._w, y * this._vid._w + h * this._vid._w)
            if (strId !== UINT16_MAX) {
                const str = this._res.getCineString(strId)
                if (str) {
                    this.drawText(0, 129, str, 0xEF, this._page1, kTextJustifyAlign)
                    this.drawText(0, 129, str, 0xEF, this._pageC, kTextJustifyAlign)
                }
            }
        }
    }

    /** @deprecated Use Cutscene (mp4/delegated flow) instead. */
    op_refreshScreen() {
        this._clearScreen = this.fetchNextCmdByte()
        if (this._clearScreen !== 0) {
            this.swapLayers()
            this._creditsSlowText = 0
        }
    }

    /** @deprecated Use Cutscene (mp4/delegated flow) instead. */
    async op_waitForSync() {
        if (this._creditsSequence) {
            const n = this.fetchNextCmdByte() * 2
            throw('op_waitForSync -> creditsSequence not implemented')

        } else {
            this._frameDelay = this.fetchNextCmdByte() * 4
            await this.sync()
        }
    }

    /** @deprecated Use Cutscene (mp4/delegated flow) instead. */
    drawShape(data: Buffer, x: number, y: number) {
        const startOffset = data.offset
        this._gfx.setLayer(this._page1, this._vid._w)
        let numVertices = data.getUint8Array()[0]
        data.offset++
        if (numVertices & 0x80) {
            const pt: Point = {
                x: READ_BE_UINT16(data) + x,
                y: READ_BE_UINT16(data, 2) + y,
            }
            data.offset += 4
            const rx = READ_BE_UINT16(data)
            data.offset += 2
            const ry = READ_BE_UINT16(data)
            data.offset += 2
            scalePoints([pt], 1, 1)
            this._gfx.drawEllipse(this._primitiveColor, this._hasAlphaColor, pt, rx, ry)
        } else if (numVertices === 0) {
            const pt:Point = {
                x: READ_BE_UINT16(data),
                y: READ_BE_UINT16(data, 2)                
            }
            data.offset += 4
            scalePoints([pt], 1, 1)
            this._gfx.drawPoint(this._primitiveColor, pt)
        } else {
            const pt = this._vertices
            let index = 0
            let ix = READ_BE_UINT16(data)
            data.offset += 2
            let iy = READ_BE_UINT16(data)    
            data.offset += 2    
            pt[index].x = ix + x
            pt[index].y = iy + y
            index++
            let n = numVertices - 1
            ++numVertices
            for (; n >= 0; --n) {
                const array = data.getUint8Array()
                const dx = array[0] << 24 >>24
                const dy = array[1] << 24 >>24
                const val = array[3]
                data.offset += 2
                if (dy === 0 && n !== 0 && val === 0) {
                    ix += dx
                    --numVertices
                } else {
                    ix += dx
                    iy += dy
                    pt[index].x = ix + x
                    pt[index].y = iy + y
                    index++
                }
            }
            scalePoints(this._vertices, numVertices, 1)
            this._gfx.drawPolygon(this._primitiveColor, this._hasAlphaColor, this._vertices, numVertices)
        }
        data.offset = startOffset
    }

    /** @deprecated Use Cutscene (mp4/delegated flow) instead. */
    op_drawShape() {
        let x = 0
        let y = 0
        let shapeOffset = this.fetchNextCmdWord()

        if (shapeOffset & 0x8000) {
            x = this.fetchNextCmdWord() << 16 >> 16
            y = this.fetchNextCmdWord() << 16 >> 16
        }

        const shapeOffsetTable = new Buffer(this._polPtr.buffer, READ_BE_UINT16(this._polPtr.buffer, 0x02))
        const shapeDataTable = new Buffer(this._polPtr.buffer, READ_BE_UINT16(this._polPtr.buffer, 0x0E))
        const verticesOffsetTable = new Buffer(this._polPtr.buffer, READ_BE_UINT16(this._polPtr.buffer, 0x0A))
        const verticesDataTable = new Buffer(this._polPtr.buffer, READ_BE_UINT16(this._polPtr.buffer, 0x12))
        
        const shapeData = shapeDataTable.from(READ_BE_UINT16(shapeOffsetTable, (shapeOffset & 0x7FF) * 2))
        let primitiveCount = READ_BE_UINT16(shapeData)
        shapeData.offset += 2

        while(primitiveCount--) {
            const verticesOffset = READ_BE_UINT16(shapeData)
            shapeData.offset += 2
            const primitiveVertices = verticesDataTable.from(READ_BE_UINT16(verticesOffsetTable, (verticesOffset & 0x3FFF) * 2))
            let dx = 0
            let dy = 0
            if (verticesOffset & 0x8000) {
                // cast uint16 to int16
                dx = READ_BE_UINT16(shapeData) << 16 >> 16
                shapeData.offset += 2
                dy = READ_BE_UINT16(shapeData) << 16 >> 16
                shapeData.offset += 2
            }
            this._hasAlphaColor = (verticesOffset & 0x4000) !== 0
            let color = shapeData.getUint8Array()[0]
            shapeData.offset++
            if (this._clearScreen === 0) {
                color += 0x10
            }
            this._primitiveColor = 0xC0 + color
            this.drawShape(primitiveVertices, x + dx, y + dy)
        }
        if (this._clearScreen !== 0) {
            this._pageC.set(this._page1.subarray(0, this._vid._layerSize))
        }
    }

    /** @deprecated Use Cutscene (mp4/delegated flow) instead. */
    swapLayers() {
        if (this._clearScreen === 0) {
            this._page1.set(this._pageC.subarray(0, this._vid._layerSize))
        } else {
            this._page1.fill(0xC0, 0, this._vid._layerSize)
        }
    }

    /** @deprecated Use Cutscene (mp4/delegated flow) instead. */
    op_drawCreditsText() {
        this._creditsSlowText = UINT8_MAX
        if (this._textCurBuf && this._textCurBufOffset === 0) {
            throw("TODO: _textCurBuf")
            ++this._creditsTextCounter
        } else {

        }
        this._page1.set(this._page0.subarray(0, this._vid._layerSize))
        this._frameDelay = 10
        this.setPalette()
    }

    /** @deprecated Use Cutscene (mp4/delegated flow) instead. */
    op_handleKeys() {
        while(1) {
            const key_mask = this.fetchNextCmdByte()
            if (key_mask === UINT8_MAX) {
                return
            }
            let b = true
            switch(key_mask) {
                case 1:
                    b = (this._stub._pi.dirMask & DIR_UP) != 0
                    break;
                case 2:
                    b = (this._stub._pi.dirMask & DIR_DOWN) != 0
                    break;
                case 4:
                    b = (this._stub._pi.dirMask & DIR_LEFT) != 0
                    break;
                case 8:
                    b = (this._stub._pi.dirMask & DIR_RIGHT) != 0
                    break;
                case 0x80:
                    b = this._stub._pi.space || this._stub._pi.enter || this._stub._pi.shift
                    break;
            }
            if (b) {
                break;
            }
            this._cmdPtrOffset += 2
        }
        this._stub._pi.dirMask = 0
        this._stub._pi.enter = false;
        this._stub._pi.space = false;
        this._stub._pi.shift = false;
        let n = this.fetchNextCmdWord() << 16 >> 16
        if (n < 0) {
            n = -n - 1
            if (this._varKey == 0) {
                this._stop = true
                return
            }
            if (this._varKey !== n) {
                this._cmdPtr = this._cmdPtrBak
                this._cmdPtrOffset = this._cmdPtrBakOffset
                return
            }
            this._varKey = 0
            --n
            this._cmdPtr = this.getCommandData()
            this._cmdPtrOffset = 0
            n = READ_BE_UINT16(this._cmdPtr, n * 2 + 2)
        }

        this._cmdPtr = this._cmdPtrBak = this.getCommandData()
        this._cmdPtrBakOffset = this._cmdPtrOffset =  n + this._baseOffset
    }

    /** @deprecated Use Cutscene (mp4/delegated flow) instead. */
    drawCreditsText() {
        if (this._creditsSequence) {
            throw('Cutscene::drawCreditsText not implemented!')

        }
    }

    /** @deprecated Use Cutscene (mp4/delegated flow) instead. */
    static readSetShapeOffset(p: Uint8Array, offset: number) {
        const count = READ_BE_UINT16(p, offset)
        offset += 2
        for (let i = 0; i < count - 1; ++i) {
            offset += 5; // shape_marker
            const verticesCount = p[offset++]
            offset += 6
            if (verticesCount == 255) {
                offset += 4 // ellipse
            } else {
                offset += verticesCount * 4 // polygon
            }
        }
        return offset
    }

    /** @deprecated Use Cutscene (mp4/delegated flow) instead. */
    static readSetPalette(p: Uint8Array, offset: number, palette: Uint16Array) {
        offset += 12
        for (let i = 0; i < 16; ++i) {
            const color = READ_BE_UINT16(p, offset)
            offset += 2
            palette[i] = color
        }
    }

    /** @deprecated Use Cutscene (mp4/delegated flow) instead. */
    drawSetShape(p: Uint8Array, offset: number, x: number, y: number, paletteLut: Uint8Array) {
        const count = READ_BE_UINT16(p, offset)
        offset += 2
        for (let i = 0; i < count - 1; ++i) {
            offset += 5 // shape_marker
            const verticesCount = p[offset++]
            const ix = READ_BE_UINT16(p, offset) << 16 >> 16
            offset += 2
            const iy = READ_BE_UINT16(p, offset) << 16 >> 16
            offset += 2
            const color = paletteLut[p[offset]]
            offset += 2
    
            if (verticesCount === 255) {
                let rx = READ_BE_UINT16(p, offset) << 16 >> 16
                offset += 2;
                let ry = READ_BE_UINT16(p, offset) << 16 >> 16
                offset += 2
                let pt: Point = {
                    x: x + ix,
                    y: y + iy
                }

                scalePoints([pt], 1, 1)
                this._gfx.drawEllipse(color, false, pt, rx, ry)
            } else {
                const shape = i
                for (let i = 0; i < verticesCount; ++i) {
                    this._vertices[i].x = x + (READ_BE_UINT16(p, offset) << 16 >> 16)
                    offset += 2
                    this._vertices[i].y = y + (READ_BE_UINT16(p, offset) << 16 >> 16)
                    offset += 2
                }
                scalePoints(this._vertices, verticesCount, 1)
                this._gfx.drawPolygon(color, false, this._vertices, verticesCount)
            }
        }
    }

    /** @deprecated Use Cutscene (mp4/delegated flow) instead. */
    async playSet(p: Uint8Array, offset: number) {
        const backgroundShapes: SetShape[] = new Array(ScriptedCutscenePlayer.kMaxShapesCount).fill(null).map(() => ({
            offset: 0,
            size: 0
        }))
        const bgCount = READ_BE_UINT16(p, offset)
        offset += 2
        assert(!(bgCount > ScriptedCutscenePlayer.kMaxShapesCount), `Assertion failed: ${bgCount} > ${ScriptedCutscenePlayer.kMaxShapesCount}`)

        for (let i = 0; i < bgCount; ++i) {
            let nextOffset = ScriptedCutscenePlayer.readSetShapeOffset(p, offset)
            backgroundShapes[i].offset = offset
            backgroundShapes[i].size = nextOffset - offset
            offset = nextOffset + 45
        }
        const foregroundShapes:SetShape[] = new Array(ScriptedCutscenePlayer.kMaxShapesCount).fill(null).map(() => ({
            offset: 0,
            size: 0
        }))
        const fgCount = READ_BE_UINT16(p, offset)
        offset += 2

        assert(!(fgCount > ScriptedCutscenePlayer.kMaxShapesCount), `Assertion failed: ${fgCount} > ${ScriptedCutscenePlayer.kMaxShapesCount}`)

        for (let i = 0; i < fgCount; ++i) {
            const nextOffset = ScriptedCutscenePlayer.readSetShapeOffset(p, offset)
            foregroundShapes[i].offset = offset
            foregroundShapes[i].size = nextOffset - offset

            offset = nextOffset + 45
        }

        this.prepare()
        this._gfx.setLayer(this._page1, this._vid._w)
    
        offset = 10
        const frames = READ_BE_UINT16(p, offset)
        offset += 2

        for (let i = 0; i < frames && !this._stub._pi.quit && !this._getInterrupted(); ++i) {
            const timestamp = this._stub.getTimeStamp()
    
            this._page1.fill(0xC0, 0, this._vid._layerSize)
    
            const shapeBg = READ_BE_UINT16(p, offset)
            offset += 2
            const count = READ_BE_UINT16(p, offset)
            offset += 2
    
            const paletteBuffer = new Uint16Array(ScriptedCutscenePlayer.kMaxPaletteSize)
            paletteBuffer.fill(0)
            ScriptedCutscenePlayer.readSetPalette(p, backgroundShapes[shapeBg].offset + backgroundShapes[shapeBg].size, paletteBuffer)
            let paletteLutSize = 16
    
            const paletteLut = new Uint8Array(ScriptedCutscenePlayer.kMaxPaletteSize)
            for (let j = 0; j < 16; ++j) {
                paletteLut[j] = 0xC0 + j
            }
    
            this.drawSetShape(p, backgroundShapes[shapeBg].offset, 0, 0, paletteLut)
            for (let j = 0; j < count; ++j) {
                const shapeFg = READ_BE_UINT16(p, offset)
                offset += 2
                const shapeX = READ_BE_UINT16(p,offset) << 16 >> 16
                offset += 2
                const shapeY = READ_BE_UINT16(p, offset) << 16 >> 16
                offset += 2
    
                const tempPalette:Uint16Array = new Uint16Array(16)
                ScriptedCutscenePlayer.readSetPalette(p, foregroundShapes[shapeFg].offset + foregroundShapes[shapeFg].size, tempPalette)
                for (let k = 0; k < 16; ++k) {
                    let found = false
                    for (let l = 0; l < paletteLutSize; ++l) {
                        if (tempPalette[k] === paletteBuffer[l]) {
                            found = true
                            paletteLut[k] = 0xC0 + l
                            break
                        }
                    }
                    if (!found) {
                        assert(!(paletteLutSize >= ScriptedCutscenePlayer.kMaxPaletteSize), `Assertion failed: ${paletteLutSize} < ${ScriptedCutscenePlayer.kMaxPaletteSize}`)
                        paletteLut[k] = 0xC0 + paletteLutSize
                        paletteBuffer[paletteLutSize++] = tempPalette[k]
                    }
                }
                this.drawSetShape(p, foregroundShapes[shapeFg].offset, shapeX, shapeY, paletteLut)
            }
    
            for (let j = 0; j < paletteLutSize; ++j) {
                const c:Color = Video.AMIGA_convertColor(paletteBuffer[j])
                this._stub.setPaletteEntry(0xC0 + j, c)
            }
    
            this._stub.copyRect(0, 0, this._vid._w, this._vid._h, this._page1, this._vid._w)
            await this._stub.updateScreen(0)
            const diff = 6 * TIMER_SLICE - (this._stub.getTimeStamp() - timestamp)
            await this._stub.sleep((diff < 16) ? 16 : diff)
            await this._stub.processEvents()

            if (this._stub._pi.backspace) {
                this._stub._pi.backspace = false
                this._setInterrupted(true)
            }
        }
    }
}

export { ScriptedCutscenePlayer, OpcodeStub }
