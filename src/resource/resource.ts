import { File } from './file'
import { FileSystem } from "./fs"
import { Color, InitPGE, ObjectNode, READ_BE_UINT16, READ_BE_UINT32, READ_LE_UINT16, READ_LE_UINT32, SoundFx, CLIP, BankSlot, Buffer, CreateInitPGE, CreateObj } from "../intern"
import { _gameSavedSoundLen, _splNames, _spmOffsetsTable, _voicesOffsetsTable, _gameSavedSoundData } from '../staticres'
import { bytekiller_unpack } from '../unpack'
import { LocaleData, NUM_BANK_BUFFERS, NUM_CUTSCENE_TEXTS, NUM_SFXS, NUM_SPRITES, ObjectType, kPaulaFreq } from './constants'
import { createObjectTypeMapping } from './loaders'
import { decodeOBJData, decodePGEData, processSpriteOffsetData } from './parsers'
import {CT_DATA_SIZE, GAMESCREEN_H, UINT16_MAX, UINT8_MAX} from '../game_constants'
import { assert } from "../assert"


class Resource {
	static _voicesOffsetsTable: Uint16Array = _voicesOffsetsTable
	static _spmOffsetsTable: Uint32Array = _spmOffsetsTable
	static _splNames: string[] = _splNames
	static _gameSavedSoundData: Uint8Array = _gameSavedSoundData
	static _gameSavedSoundLen: number = _gameSavedSoundLen

    _fs: FileSystem
    _readUint16: (buf: ArrayBuffer|Buffer|Uint8Array, offset?) => number
    _readUint32: (buf: ArrayBuffer|Buffer|Uint8Array, offset?) => number
    _scratchBuffer: Uint8Array
    _bankData: Uint8Array
    _bankDataHead: Uint8Array
    _bankDataTail: number
	_bankBuffersCount: number
    _bankBuffers: BankSlot[] = new Array(NUM_BANK_BUFFERS).fill(null).map(() => ({
        entryNum: 0,
        ptr: null,
    }))
    _hasSeqData: boolean
    _entryName: string
    _fnt: Uint8Array
    _mbk: Uint8Array
    _icn: Uint8Array
    _icnLen: number
    _tab: Uint8Array
    _spc: Uint8Array
    _numSpc: number
    _rp: Uint8Array = new Uint8Array(0x4A)
    _pal: Uint8Array
    _ani: Uint8Array
    _tbn: Uint8Array
    _ctData: Int8Array = new Int8Array(CT_DATA_SIZE)
    _spr1: Uint8Array
    // this contains all the data for the sprites
    _sprData: Uint8Array[] = new Array(NUM_SPRITES)
    _sprm: Uint8Array = new Uint8Array(0x10000)

    // number of total PGEs in the file
    _pgeTotalNumInFile: number
    //the initial structure to which all PGEs are loaded from the file
    _pgeAllInitialStateFromFile: InitPGE[] = new Array(256).fill(null).map(() => CreateInitPGE())

    _lev: Uint8Array
    _bnq: Uint8Array
    _numObjectNodes: number
    _objectNodesMap: ObjectNode[] = new Array(255)
    _sfxList: SoundFx[]
    _numSfx: number
    _cmd: Uint8Array
    _pol: Uint8Array
    _cineStrings: Uint8Array[]
    _cine_off: Uint8Array
    _cine_txt: Uint8Array
    _textsTable: string[]
    _stringsTable: Uint8Array
    _clutSize: number
    _clut: Color[]
    _perso: Uint8Array
    _monster: Uint8Array
    _str: Uint8Array
    _credits: Uint8Array

    constructor(fs: FileSystem) {
        // 	memset(this, 0, sizeof(Resource));
        this._fs = fs
        this._cine_txt = null
        this._cine_off = null
        this._perso = null
        this._monster = null
        this._str = null
        this._credits = null
        this._cmd = null
        this._pol = null
        this._cineStrings = null
        this._fnt = null
        this._mbk = null
        this._icn = null
        this._icnLen = 0
        this._tab = null
        this._spc = null
        this._numSpc = 0
        this._pal = null
        this._ani = null
        this._tbn = null
        this._spr1 = null
        // this._sprData = null
        // this._sprm = null
        this._pgeTotalNumInFile = 0
        // this._pgeInit = null
        this._lev = null
        this._bnq = null
        this._readUint16 = READ_LE_UINT16
        this._readUint32 = READ_LE_UINT32
        this._scratchBuffer = new Uint8Array(320 * GAMESCREEN_H + 1024)

        const kBankDataSize = 0x7000
        this._bankData = new Uint8Array(kBankDataSize)

        this._bankDataTail = kBankDataSize
        this.clearBankData()

    }

    // GENERAL FILE LOADERS
    protected loadFileData(f: File, offset: number = 0, seek: boolean = true, customLength?: number): Uint8Array {
        const len = customLength ?? (f.size() - offset);
        const data = new Uint8Array(len);
        if (offset > 0 && seek) {
            f.seek(offset);
        }
        f.read(data.buffer, len);
        if (f.ioErr()) {
            throw(`I/O error when reading '${this._entryName}'`)
        }
        return data;
    }

    private async loadFileDataByFileName(filename: string): Promise<Uint8Array> {
        const file = new File();
        if (await file.open(filename, "rb", this._fs)) {
            return this.loadFileData(file);
        } else {
            throw(`Failed to open '${filename}'`);
        }
    }

    // MAIN LOADER table
    private readonly OBJECT_TYPE_MAPPING = createObjectTypeMapping(this);

    // MAIN LOADER
    async load(objName: string, objType: number, ext?: string) {
        const typeConfig = this.OBJECT_TYPE_MAPPING[objType];

        if (!typeConfig) {
            throw new Error(`Load not implemented for object type: ${objType}`);
        }

        // Use provided extension or default to mapped extension
        this._entryName = `${objName}.${ext || typeConfig.extension}`;

        if (objType === ObjectType.OT_CT) {
            const overridePath = `levels/${objName}/${objName}.ct.bin`
            const overrideFile = new File()
            if (await overrideFile.open(overridePath, "rb", this._fs)) {
                const overrideSize = overrideFile.size()
                if (overrideSize === this._ctData.byteLength) {
                    overrideFile.read(this._ctData.buffer, this._ctData.byteLength)
                    if (!overrideFile.ioErr()) {
                        this._entryName = overridePath
                        console.log(`[Resource][CT] Loaded override binary '${overridePath}' (${overrideSize} bytes)`)
                        return
                    }
                } else {
                    console.warn(`[Resource][CT] Ignoring override '${overridePath}' (unexpected size ${overrideSize}, expected ${this._ctData.byteLength}). Falling back to packed CT.`)
                }
                overrideFile.close()
            }
        }

        const file = new File();
        if (await file.open(this._entryName, "rb", this._fs)) {
            try {
                typeConfig.loader.call(this, file);
            } catch (error) {
                throw new Error(`Failed to load ${this._entryName}: ${error.message}`);
            }
        }
    }

// +--------------------------------------------------------------------------------------------+
// |                              PGE (Page/Game Entity) Structure                              |
// +--------------------+-----------+---------------+-------------------------------------------+
// | Field             | Type      | Size (bytes)  | Description                                |
// +--------------------+-----------+---------------+-------------------------------------------+
// | Total PGE Count   | uint16    | 2             | Number of PGE entries                      |
// +--------------------+-----------+---------------+-------------------------------------------+
// | Per PGE Entry:    |           |               |                                            |
// +--------------------+-----------+---------------+-------------------------------------------+
// | type              | uint16    | 2             | PGE type identifier                        |
// | pos_x             | uint16    | 2             | X-axis position                            |
// | pos_y             | uint16    | 2             | Y-axis position                            |
// | obj_node_number   | uint16    | 2             | Associated object node number              |
// | life              | uint16    | 2             | Life/health value                          |
// | counter_values    | uint16[4] | 8             | 4 counter values (2 bytes each)            |
// | object_type       | uint8     | 1             | Type of object                             |
// | init_room         | uint8     | 1             | Initial room                               |
// | room_location     | uint8     | 1             | Current room location                      |
// | init_flags        | uint8     | 1             | Initial flags                              |
// | colliding_icon_num| uint8     | 1             | Colliding icon number                      |
// | icon_num          | uint8     | 1             | Icon number                                |
// | object_id         | uint8     | 1             | Object identifier                          |
// | skill             | uint8     | 1             | Skill level                                |
// | mirror_x          | uint8     | 1             | X-axis mirroring                           |
// | flags             | uint8     | 1             | Additional flags                           |
// | unk1C             | uint8     | 1             | Unknown/reserved byte                      |
// | text_num          | uint16    | 2             | Text/string number                         |
// +--------------------------------------------------------------------------------------------+
    load_PGE(f: File) {
        const _pge: Uint8Array =this.loadFileData(f, 12, false)
        this.decodePGE(_pge)
    }


    decodePGE(p: Uint8Array) {
        const parsed = decodePGEData(p, this._pgeAllInitialStateFromFile.length)
        this._pgeTotalNumInFile = parsed.pgeNum
        this._pgeAllInitialStateFromFile = parsed.pgeInit
    }

// +--------------------------------------------------------------------------------------------+
// |                              Object Node Structure                                         |
// +--------------------+-----------+---------------+-------------------------------------------+
// | Field             | Type      | Size (bytes)  | Description                                |
// +--------------------+-----------+---------------+-------------------------------------------+
// | last_obj_number   | uint16    | 2             | Last object number in the node             |
// | num_objects       | uint16    | -             | Number of objects in the node              |
// | objects           | Array<Obj>| -             | Collection of objects in the node          |
// +--------------------------------------------------------------------------------------------+
//
// +--------------------------------------------------------------------------------------------+
// |                             Individual Object Structure                                    |
// +--------------------+-----------+---------------+-------------------------------------------+
// | Field             | Type      | Size (bytes)  | Description                                |
// +--------------------+-----------+---------------+-------------------------------------------+
// | type              | uint16    | 2             | Object type                                |
// | dx                | int8      | 1             | X-axis displacement                        |
// | dy                | int8      | 1             | Y-axis displacement                        |
// | init_obj_type     | uint16    | 2             | Initial object type                        |
// | opcode2           | uint8     | 1             | Opcode 2                                   |
// | opcode1           | uint8     | 1             | Opcode 1                                   |
// | flags             | uint8     | 1             | Object flags                               |
// | opcode3           | uint8     | 1             | Opcode 3                                   |
// | init_obj_number   | uint16    | 2             | Initial object number                      |
// | opcode_arg1       | int16     | 2             | Opcode argument 1                          |
// | opcode_arg2       | int16     | 2             | Opcode argument 2                          |
// | opcode_arg3       | int16     | 2             | Opcode argument 3                          |
// +--------------------------------------------------------------------------------------------+
    load_OBJ(f: File) {
        const len = f.size()
        const dat = this.loadFileData(f)

        this._numObjectNodes = READ_LE_UINT16(dat)
        if (this._numObjectNodes !== 230 ){
            throw(`Assertion failed: ${this._numObjectNodes}`)
        }
        this.decodeOBJ(dat.subarray(2,len -2), len -2)
    }

    decodeOBJ(tmp: Uint8Array, size: number) {
        this._numObjectNodes = 230
        const parsed = decodeOBJData(tmp, size, this._numObjectNodes)
        this._numObjectNodes = parsed.numObjectNodes
        this._objectNodesMap = parsed.objectNodesMap
    }

    load_SPM(f: File) {
        debugger
        const kPersoDatSize = 178647
        const len = f.size()

        //read last 4 bytes
        f.seek(len - 4)
        const size = f.readUint32BE()

        //go back to the begining of the file
        f.seek(0)
        const tmp = this.loadFileData(f)
        if (size === kPersoDatSize) {
            this._spr1 = new Uint8Array(size)
            if (!bytekiller_unpack(this._spr1, size, tmp, len)) {
                throw("Bad CRC for SPM data")
            }
        } else {
            assert(!(size > this._sprm.byteLength), `Assertion failed: ${size} <= ${this._sprm.byteLength}`)
            // assert(size <= sizeof(_sprm));
            // sprm = sprite monster?
            if (!bytekiller_unpack(this._sprm, this._sprm.byteLength, tmp, len)) {
                throw("Bad CRC for SPRM data")
            }
        }


        for (let i = 0; i < NUM_SPRITES; ++i) {
            const offset = Resource._spmOffsetsTable[i]
            if (offset >= kPersoDatSize) {
                this._sprData[i] = this._sprm.subarray(offset - kPersoDatSize)
            } else {
                this._sprData[i] = this._spr1.subarray(offset)
            }
        }
    }

    load_SPRM(f: File) {
        this._sprm = this.loadFileData(f,12)
    }

    load_ANI(f: File) {
        this._ani = this.loadFileData(f)
    }

    load_LEV(f: File) {
        this._lev = this.loadFileData(f)
    }

    load_BNQ(f: File) {
        this._bnq = this.loadFileData(f)
    }

    load_PAL(f: File) {
        this._pal = this.loadFileData(f)
    }

    load_RP(f: File) {
        const len = f.size()
        if (len !== 0x4A) {
            throw(`Unexpected size ${len} for '${this._entryName}'`)
        }
       this._rp =this.loadFileData(f)

    }

    load_MBK(f: File) {
        this._mbk = this.loadFileData(f)
    }

    load_CT(pf: File) {
        const len = pf.size()
        const tmp = this.loadFileData(pf)
        if (len === this._ctData.byteLength) {
            new Uint8Array(this._ctData.buffer).set(tmp)
            console.log(`[Resource][CT] Loaded raw CT data from '${this._entryName}' (${len} bytes)`)
            return
        }
        if (!bytekiller_unpack(new Uint8Array(this._ctData.buffer), this._ctData.byteLength, tmp, len)) {
            throw("Bad CRC for collision data")
        }
        console.log(`[Resource][CT] Loaded packed CT data from '${this._entryName}' (${len} bytes -> ${this._ctData.byteLength} bytes)`)
    }

    load_FNT(f: File) {
        this._fnt = this.loadFileData(f)
    }

    load_TBN(f: File) {
        this._tbn = this.loadFileData(f)
    }

    load_CMD(f: File) {
        this._cmd = this.loadFileData(f)
    }

    load_POL(f: File) {
        this._pol = this.loadFileData(f)
    }

    load_ICN(f: File) {
        this._icnLen = f.size()
        this._icn = this.loadFileData(f)
    }

    load_SPC(f: File) {
        this._spc = this.loadFileData(f)
        this._numSpc = READ_BE_UINT16(this._spc.buffer) / 2
    }

    load_SPRITE(f: File) {
        this._spr1 = this.loadFileData(f,12)
    }

    clearBankData() {
        this._bankBuffersCount = 0
        this._bankDataHead = this._bankData
    }
    
    getBankDataSize(num: number) {
        let len = READ_BE_UINT16(this._mbk, num * 6 + 4)
        if (len & 0x8000) {
                if (this._mbk === this._bnq) { // demo .bnq use signed int
                    len = -(len << 16 >> 16)

                }else {
                    len &= 0x7FFF
                }
            }

        return len * 32
    }

    findBankData(num: number) {
        for (let i = 0; i < this._bankBuffersCount; ++i) {
            if (this._bankBuffers[i].entryNum === num) {
                return this._bankBuffers[i].ptr
            }
        }
        return null
    }

    loadBankData(num: number) {
        const ptr = this._mbk.subarray(num * 6)
        let dataOffset = READ_BE_UINT32(ptr)

        // first byte of the data buffer corresponds
        // to the total count of entries
        dataOffset &= UINT16_MAX

        const size = this.getBankDataSize(num)
        const avail = this._bankDataTail - this._bankDataHead.byteOffset

        if (avail < size) {
            this.clearBankData()
        }
        assert(!((this._bankDataHead.byteOffset + size) > this._bankDataTail), `Assertion failed: ${this._bankDataHead.byteOffset + size} <= ${this._bankDataTail}`)
        assert(!(this._bankBuffersCount >= this._bankBuffers.length), `Assertion failed: ${this._bankBuffersCount} < ${this._bankBuffers.length}`)
        this._bankBuffers[this._bankBuffersCount].entryNum = num
        this._bankBuffers[this._bankBuffersCount].ptr = this._bankDataHead
        const data = this._mbk.subarray(dataOffset)
        if (READ_BE_UINT16(ptr, 4) & 0x8000) {
            this._bankDataHead.set(data.subarray(0, size))
        } else {
            assert(!(dataOffset <= 4), `Assertion failed: ${dataOffset} > 4`)
            assert(!(size !== (READ_BE_UINT32(data.buffer, data.byteOffset - 4) << 32 >> 32)), `Assertion failed: ${size} === ${(READ_BE_UINT32(data.buffer, data.byteOffset - 4) << 32 >> 32)}`)

            if (!bytekiller_unpack(this._bankDataHead, this._bankDataTail, data, 0)) {
                console.error(`Bad CRC for bank data ${num}`)
            }
        }
        const bankData = this._bankDataHead
        this._bankDataHead = this._bankDataHead.subarray(size)
        return bankData
    }

    load_TEXT() {
        this._stringsTable = null
        this._stringsTable = LocaleData._stringsTableEN
        this._textsTable = null
        this._textsTable = LocaleData._textsTableEN

    }

    async load_VCE(num: number, segment: number) {
        let res = {
            buf: null as Uint8Array,
            bufSize: 0
        }
        let offset = _voicesOffsetsTable[num]
        if (offset !== UINT16_MAX) {
            const p = _voicesOffsetsTable.subarray(offset / 2)
            let pIndex = 0
            offset = p[pIndex++] * 2048
            let count = p[pIndex++]
            if (segment < count) {
                const f = new File()
                if (await f.open("VOICE.VCE", "rb", this._fs)) {
                    let voiceSize = p[pIndex + segment] * 2048 / 5
                    const voiceBuf = new Uint8Array(voiceSize)
                    if (voiceBuf) {
                        let dst = 0
                        offset += 0x2000
                        for (let s = 0; s < count; ++s) {
                            let len = p[pIndex + s] * 2048
                            for (let i = 0; i < (len / (0x2000 + 2048)) >> 0; ++i) {
                                if (s === segment) {
                                    f.seek(offset)
                                    let n = 2048
                                    while (n--) {
                                        let v = f.readByte()
                                        if (v & 0x80) {
                                            v = -(v & 0x7F)
                                        }
                                        voiceBuf[dst++] = (v & UINT8_MAX) >>> 0
                                    }
                                }
                                offset += 0x2000 + 2048
                            }
                            if (s === segment) {
                                break
                            }
                        }

                        res.buf = voiceBuf
                        res.bufSize = voiceSize
                    }
                }
            }
        }
        return res
    }


    //LOAD SPRITE
    private readonly SPRITE_TERMINATOR = UINT16_MAX;
    private readonly INVALID_OFFSET = 0xFFFFFFFF;
    private readonly ENTRY_SIZE = 6; // 2 bytes for pos + 4 bytes for offset

    async load_SPRITE_OFFSETS(fileName: string, sprData: Uint8Array) {
        this._entryName = `${fileName}.OFF`;
        const offData = await this.loadFileDataByFileName(this._entryName)
        if (!offData) {
            throw new Error(`Cannot load '${this._entryName}'`);
        }
        this._processOffsetData(offData, sprData);
    }

    private _processOffsetData(offDataForAMonster: Uint8Array, sprDataForAMonster: Uint8Array): void {
        processSpriteOffsetData(
            offDataForAMonster,
            sprDataForAMonster,
            this._sprData,
            NUM_SPRITES,
            this.SPRITE_TERMINATOR,
            this.INVALID_OFFSET,
            this.ENTRY_SIZE
        )
    }

    // LOAD SOUND EFFECTS
    async load_FIB(fileName: string) {
        this._entryName = `${fileName}.FIB`
        const f = new File()
        if (await f.open(this._entryName, "rb", this._fs)) {
            //the first byte contains the number of different effects in this file
            this._numSfx = f.readUint16LE()

            this._sfxList = new Array(this._numSfx).fill(null).map(() => ({
                offset: 0,
                freq: 0,
                len: 0,
                peak: 0,
                data: null,
            }))

            for (let i = 0; i < this._numSfx; ++i) {
                const sfx:SoundFx = this._sfxList[i]
                sfx.offset = f.readUint32LE()
                sfx.len = f.readUint16LE()
                sfx.freq = 6000
                sfx.data = null
            }
            for (let i = 0; i < this._numSfx; ++i) {
                const sfx:SoundFx = this._sfxList[i]
                if (sfx.len === 0) {
                    continue
                }
                f.seek(sfx.offset)
                const len = (sfx.len * 2) - 1
                const data = new Uint8Array(len)

                sfx.data = data
                let index = 0
                // Fibonacci-delta decoding
                const codeToDelta:number[] = [ -34, -21, -13, -8, -5, -3, -2, -1, 0, 1, 2, 3, 5, 8, 13, 21 ]
                let c = f.readByte() << 24 >>24
                data[index++] = c
                sfx.peak = Math.abs(c)
                for (let j = 1; j < sfx.len; ++j) {
                    const d = f.readByte()

                    c += codeToDelta[d >> 4]

                    data[index++] = CLIP(c, -128, 127)
                    if (Math.abs(c) > sfx.peak) {
                        sfx.peak = Math.abs(c)
                    }
    
                    c += codeToDelta[d & 15]
                    data[index++] = CLIP(c, -128, 127)
                    if (Math.abs(c) > sfx.peak) {
                        sfx.peak = Math.abs(c)
                    }
                }
                sfx.len = len
            }
            if (f.ioErr()) {
                console.error(`I/O error when reading '${this._entryName}'`)
            }
        } else {
            console.error(`Cannot open '${this._entryName}'`)
        }
    }

    async load_MAP_menu(fileName: string, dstPtr: Uint8Array) {
        const kMenuMapSize = 0x3800 * 4
        this._entryName = `${fileName}.MAP`
        const f = new File()
        if (await f.open(this._entryName, "rb", this._fs)) {
            if (f.read(dstPtr.buffer, kMenuMapSize) != kMenuMapSize) {
                console.error(`Failed to read '${this._entryName}'`)
            }
            if (f.ioErr()) {
                console.error(`I/O error when reading '${this._entryName}'`)
            }
            return
        }
        console.error(`Cannot load '${this._entryName}'`)
    }

    async load_PAL_menu(fileName: string, dstPtr: Uint8Array) {
        const kMenuPalSize = 768
        this._entryName = `${fileName}.PAL`
        const f = new File()
        if (await f.open(this._entryName, "rb", this._fs)) {
            if (f.read(dstPtr.buffer, kMenuPalSize) !== kMenuPalSize) {
                console.error(`Failed to read '${this._entryName}'`)
            }
            if (f.ioErr()) {
                console.error(`I/O error when reading '${this._entryName}'`)
            }
            return
        }
        console.error(`Cannot load '${this._entryName}'`)
    }

    async load_CINE() {
        if (this._cine_off === null) {
            this._cine_off = await this.loadFileDataByFileName(`ENGCINE.BIN`)
        }

        if (this._cine_txt === null) {
            this._cine_txt =await this.loadFileDataByFileName(`ENGCINE.TXT`)
        }
    }

    getAniData(num: number) {
       const offset = READ_LE_UINT16(this._ani, 2 + num * 2)
        // Return a subarray starting from the calculated offset
        return this._ani.subarray(2 + offset)
    }

    getTextString(level: number, num: number) {
		return this._tbn.subarray(READ_LE_UINT16(this._tbn, num * 2))
	}

	getGameString(num: number) {
		return this._stringsTable.subarray(READ_LE_UINT16(this._stringsTable, num * 2))
	}

	getCineString(num: number) {
		if (this._cine_off) {
			const offset = READ_BE_UINT16(this._cine_off, num * 2)
			return this._cine_txt.subarray(offset)
		}
		return (num >= 0 && num < NUM_CUTSCENE_TEXTS) ? this._cineStrings[num] : 0;
	}

	getMenuString(num: number) {
		return (num >= 0 && num < LocaleData.Id.LI_NUM) ? this._textsTable[num] : "";
	}

    // Unload, Clear, Free data
    ///////////////////////////
    unload(objType: number) {
        switch (objType) {
            case ObjectType.OT_CMD:
                this._cmd = null
                break
            case ObjectType.OT_POL:
                this._pol = null
                break
            case ObjectType.OT_CMP:
                this._cmd = null
                this._pol = null
                break
            default:
                console.error(`Unimplemented Resource::unload() type ${objType}`)
                break
        }
    }


    free_OBJ() {
        let prevNode: ObjectNode = null
        for (let i = 0; i < this._numObjectNodes; ++i) {
            if (this._objectNodesMap[i] !== prevNode) {
                const curNode = this._objectNodesMap[i]
                curNode.objects.length = 0
                prevNode = curNode
            }
            this._objectNodesMap[i] = null
        }
    }

    clearLevelAllResources() {
        this._tbn = null
        this._mbk = null
        this._pal = null
        this._lev = null
        this._bnq = null
        this._ani = null
        this.free_OBJ()
    }

}

export { LocaleData, Resource, ObjectType }
