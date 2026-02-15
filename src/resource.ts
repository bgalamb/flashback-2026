import { File } from './file'
import { FileSystem } from "./fs"
import { Color, InitPGE, ObjectNode, READ_BE_UINT16, READ_BE_UINT32, READ_LE_UINT16, READ_LE_UINT32, SoundFx, CLIP, BankSlot, Buffer, CreateInitPGE, CreateObj } from "./intern"
import { ResourceAba } from "./resource_aba"
import {  _gameSavedSoundLen, _splNames, _spmOffsetsTable, _stringsTableEN, _textsTableEN, _voicesOffsetsTable, _gameSavedSoundData } from './staticres'
import { bytekiller_unpack } from './unpack'

type LoadStub = (file: File) => void


const normalizeSPL = (sfx: SoundFx) => {
	const kGain = 2

	sfx.peak = Math.abs(sfx.data[0])
	for (let i = 1; i < sfx.len; ++i) {
		const sample = sfx.data[i]
		if (Math.abs(sample) > sfx.peak) {
			sfx.peak = Math.abs(sample)
		}
		sfx.data[i] = (sample / kGain) >> 0
	}
}

const LocaleData = {
    Id: {
            LI_01_CONTINUE_OR_ABORT: 0,
            LI_02_TIME: 1,
            LI_03_CONTINUE: 2,
            LI_04_ABORT: 3,
            LI_05_COMPLETED: 4,
            LI_06_LEVEL: 5,
            LI_07_START: 6,
            LI_08_SKILL: 7,
            LI_09_PASSWORD: 8,
            LI_10_INFO: 9,
            LI_11_QUIT: 10,
            LI_12_SKILL_LEVEL: 11,
            LI_13_EASY: 12,
            LI_14_NORMAL: 13,
            LI_15_EXPERT: 14,
            LI_16_ENTER_PASSWORD1: 15,
            LI_17_ENTER_PASSWORD2: 16,
            LI_18_RESUME_GAME: 17,
            LI_19_ABORT_GAME: 18,
            LI_20_LOAD_GAME: 19,
            LI_21_SAVE_GAME: 20,
            LI_22_SAVE_SLOT: 21,
            LI_23_DEMO: 22,
            LI_NUM: 23
        },

    _textsTableEN: _textsTableEN,
    _stringsTableEN: _stringsTableEN,

}

enum ObjectType {
    OT_MBK,
    OT_PGE,
    OT_PAL,
    OT_CT,
    OT_MAP,
    OT_SPC,
    OT_RP,
    OT_RPC,
    OT_DEMO,
    OT_ANI,
    OT_OBJ,
    OT_TBN,
    OT_SPR,
    OT_TAB,
    OT_ICN,
    OT_FNT,
    OT_TXTBIN,
    OT_CMD,
    OT_POL,
    OT_SPRM,
    OT_OFF,
    OT_CMP,
    OT_OBC,
    OT_SPL,
    OT_LEV,
    OT_SGD,
    OT_BNQ,
    OT_SPM
}

const NUM_SFXS = 66
const NUM_BANK_BUFFERS = 50
const NUM_CUTSCENE_TEXTS = 117
const NUM_SPRITES = 1287

const kPaulaFreq = 3546897
const kScratchBufferSize = 320 * 224 + 1024

class Resource {
	static _voicesOffsetsTable: Uint16Array = _voicesOffsetsTable
	static _spmOffsetsTable: Uint32Array = _spmOffsetsTable
	static _splNames: string[] = _splNames
	static _gameSavedSoundData: Uint8Array = _gameSavedSoundData
	static _gameSavedSoundLen: number = _gameSavedSoundLen

    _fs: FileSystem
    _isDemo: boolean
    _aba: ResourceAba
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
    _ctData: Int8Array = new Int8Array(0x1D00)
    _spr1: Uint8Array
    _sprData: Uint8Array[] = new Array(NUM_SPRITES)
    _sprm: Uint8Array = new Uint8Array(0x10000)

    // number of total PGEs in the file
    _pgeNum: number
    //the initial structre where PGEs are loaded from the file
    _pgeInit: InitPGE[] = new Array(256).fill(null).map(() => CreateInitPGE())

    _map: Uint8Array
    _lev: Uint8Array
    _levNum: number
    _sgd: Uint8Array
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
    _dem: Uint8Array
    _demLen: number
    _resourceMacDataSize: number
    _clutSize: number
    _clut: Color[]
    _perso: Uint8Array
    _monster: Uint8Array
    _str: Uint8Array
    _credits: Uint8Array

    constructor(fs: FileSystem) {
        // 	memset(this, 0, sizeof(Resource));
        this._fs = fs
        this._isDemo = false
        this._aba = null
        this._cine_txt = null
        this._cine_off = null
        this._perso = null
        this._monster = null
        this._str = null
        this._credits = null
        this._dem = null
        this._demLen = 0
        this._resourceMacDataSize = 0
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
        this._pgeNum = 0
        // this._pgeInit = null
        this._map = null
        this._lev = null
        this._levNum = 0
        this._sgd = null
        this._bnq = null
        this._readUint16 = READ_LE_UINT16
        this._readUint32 = READ_LE_UINT32
        this._scratchBuffer = new Uint8Array(kScratchBufferSize)

        const kBankDataSize = 0x7000
        this._bankData = new Uint8Array(kBankDataSize)

        this._bankDataTail = kBankDataSize
        this.clearBankData()
    }

    // GENERAL FILE LOADERS
    private loadFileData(f: File, offset: number = 0, seek: boolean = true, customLength?: number): Uint8Array {
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

    private loadFileDataByFileName(filename: string): Uint8Array {
        const file = new File();
        if (file.open(filename, "rb", this._fs)) {
            return this.loadFileData(file);
        } else {
            throw(`Failed to open '${filename}'`);
        }
    }

    // LOADER switch
    private readonly OBJECT_TYPE_MAPPING: Record<ObjectType, {
        extension: string;
        loader: (f: File) => void
    }> = {
        [ObjectType.OT_RP]: {extension: 'RP', loader: this.load_RP},
        [ObjectType.OT_PAL]: {extension: 'PAL', loader: this.load_PAL},
        [ObjectType.OT_TBN]: {extension: 'TBN', loader: this.load_TBN},
        [ObjectType.OT_ANI]: {extension: 'ANI', loader: this.load_ANI},
        [ObjectType.OT_BNQ]: {extension: 'BNQ', loader: this.load_BNQ},
        [ObjectType.OT_SPM]: {extension: 'SPM', loader: this.load_SPM},
        [ObjectType.OT_SPRM]: {extension: 'SPR', loader: this.load_SPRM},
        [ObjectType.OT_MBK]: {extension: 'MBK', loader: this.load_MBK},
        [ObjectType.OT_FNT]: {extension: 'FNT', loader: this.load_FNT},
        [ObjectType.OT_CMD]: {extension: 'CMD', loader: this.load_CMD},
        [ObjectType.OT_PGE]: {extension: 'PGE', loader: this.load_PGE},
        [ObjectType.OT_CT]: {extension: 'CT', loader: this.load_CT},
        [ObjectType.OT_POL]: {extension: 'POL', loader: this.load_POL},
        [ObjectType.OT_ICN]: {extension: 'ICN', loader: this.load_ICN},
        [ObjectType.OT_SPC]: {extension: 'SPC', loader: this.load_SPC},
        [ObjectType.OT_SPR]: {extension: 'SPR', loader: this.load_SPRITE},
        [ObjectType.OT_SGD]: {extension: 'SGD', loader: this.load_SGD},
        [ObjectType.OT_LEV]: {extension: 'LEV', loader: this.load_LEV},
        [ObjectType.OT_OBJ]: {extension: 'OBJ', loader: this.load_OBJ},
        [ObjectType.OT_MAP]: {
            extension: '',
            loader: function (f: File): void {
                throw new Error('Function not implemented.')
            }
        },
        [ObjectType.OT_RPC]: {
            extension: '',
            loader: function (f: File): void {
                throw new Error('Function not implemented.')
            }
        },
        [ObjectType.OT_DEMO]: {
            extension: '',
            loader: function (f: File): void {
                throw new Error('Function not implemented.')
            }
        },
        [ObjectType.OT_TAB]: {
            extension: '',
            loader: function (f: File): void {
                throw new Error('Function not implemented.')
            }
        },
        [ObjectType.OT_TXTBIN]: {
            extension: '',
            loader: function (f: File): void {
                throw new Error('Function not implemented.')
            }
        },
        [ObjectType.OT_OFF]: {
            extension: '',
            loader: function (f: File): void {
                throw new Error('Function not implemented.')
            }
        },
        [ObjectType.OT_CMP]: {
            extension: '',
            loader: function (f: File): void {
                throw new Error('Function not implemented.')
            }
        },
        [ObjectType.OT_OBC]: {
            extension: '',
            loader: function (f: File): void {
                throw new Error('Function not implemented.')
            }
        },
        [ObjectType.OT_SPL]: {
            extension: '',
            loader: function (f: File): void {
                throw new Error('Function not implemented.')
            }
        }
    };

    async load(objName: string, objType: number, ext?: string) {
        const typeConfig = this.OBJECT_TYPE_MAPPING[objType];

        if (!typeConfig) {
            throw new Error(`Load not implemented for object type: ${objType}`);
        }

        // Use provided extension or default to mapped extension
        this._entryName = `${objName}.${ext || typeConfig.extension}`;

        const file = new File();
        if (await file.open(this._entryName, "rb", this._fs)) {
            try {
                typeConfig.loader.call(this, file);
            } catch (error) {
                throw new Error(`Failed to load ${this._entryName}: ${error.message}`);
            }
        }
    }

    decodePGE(p: Uint8Array) {
        let index = 0
        this._pgeNum = this._readUint16(p)
        index += 2
        this._pgeInit = this._pgeInit.fill(null).map(() => CreateInitPGE())
        if (this._pgeNum > this._pgeInit.length) {
            throw(`Assertion failed: ${this._pgeNum} <= ${this._pgeInit.length}`)
        }
        for (let i = 0; i < this._pgeNum; ++i) {
            const pge: InitPGE = this._pgeInit[i]
            pge.type = this._readUint16(p, index)
            index += 2
            pge.pos_x = this._readUint16(p, index)
            index += 2
            pge.pos_y = this._readUint16(p, index)
            index += 2
            pge.obj_node_number = this._readUint16(p, index)
            index += 2
            pge.life = this._readUint16(p, index)
            index += 2
            for (let lc = 0; lc < 4; ++lc) {
                pge.counter_values[lc] = this._readUint16(p, index)
                index += 2
            }
            pge.object_type = p[index++]
            pge.init_room = p[index++]
            pge.room_location = p[index++]
            pge.init_flags = p[index++]
            pge.colliding_icon_num = p[index++]
            pge.icon_num = p[index++]
            pge.object_id = p[index++]
            pge.skill = p[index++]
            pge.mirror_x = p[index++]
            pge.flags = p[index++]
            pge.unk1C = p[index++]
            index++
            pge.text_num = this._readUint16(p, index)
            index += 2
        }
    }

    decodeOBJ(tmp: Uint8Array, size: number) {
        const offsets = new Uint32Array(256)
        let tmpOffset = 0
        this._numObjectNodes = 230
        for (let i = 0; i <this. _numObjectNodes; ++i) {
            offsets[i] = this._readUint32(tmp, tmpOffset)
            tmpOffset += 4
        }
        offsets[this._numObjectNodes] = size
        let numObjectsCount = 0
        const objectsCount = new Uint16Array(256)
        for (let i = 0; i < this._numObjectNodes; ++i) {
            let diff = offsets[i + 1] - offsets[i]
            if (diff !== 0) {
                objectsCount[numObjectsCount] = ((diff - 2) / 0x12) >> 0
                ++numObjectsCount
            }
        }
        let prevOffset = 0
        let prevNode: ObjectNode = null
        let iObj = 0
        for (let i = 0; i < this._numObjectNodes; ++i) {
            if (prevOffset !== offsets[i]) {
                const on: ObjectNode = {
                    last_obj_number: 0,
                    objects: null,
                    num_objects: 0
                }

                let objData = offsets[i]
                on.last_obj_number = this._readUint16(tmp, objData)
                objData += 2
                on.num_objects = objectsCount[iObj]
                on.objects = new Array(on.num_objects)
                for (let j = 0; j < on.num_objects; ++j) {
                    // Object *obj = &on->objects[j];
                    const obj = CreateObj()
                    obj.type = this._readUint16(tmp, objData)
                    objData += 2
                    obj.dx = tmp[objData++] << 24 >> 24
                    obj.dy = tmp[objData++] << 24 >> 24
                    obj.init_obj_type = this._readUint16(tmp, objData)
                    objData += 2
                    obj.opcode2 = tmp[objData++]
                    obj.opcode1 = tmp[objData++]
                    obj.flags = tmp[objData++]
                    obj.opcode3 = tmp[objData++]
                    obj.init_obj_number = this._readUint16(tmp, objData)
                    objData += 2
                    obj.opcode_arg1 = this._readUint16(tmp, objData) << 16 >> 16
                    objData += 2
                    obj.opcode_arg2 = this._readUint16(tmp, objData) << 16 >> 16
                    objData += 2
                    obj.opcode_arg3 = this._readUint16(tmp, objData) << 16 >> 16
                    objData += 2
                    on.objects[j] = obj
                }
                ++iObj
                prevOffset = offsets[i]
                prevNode = on
            }
            this._objectNodesMap[i] = prevNode
        }
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
            if (size > this._sprm.byteLength) {
                throw(`Assertion error: ${size} <= ${this._sprm.byteLength}`)
            }
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



    load_PGE(f: File) {
        const _pge: Uint8Array =this.loadFileData(f, 12, false)
        this.decodePGE(_pge)
    }

    load_OBJ(f: File) {
        const len = f.size()
        const dat = this.loadFileData(f)

        this._numObjectNodes = READ_LE_UINT16(dat)
        if (this._numObjectNodes !== 230 ){
            throw(`assertion failed ${this._numObjectNodes}`)
        }
        this.decodeOBJ(dat.subarray(2,len -2), len -2)
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

    load_SGD(f: File) {
        this._sgd = this.loadFileData(f)
        this._sgd[0] = 0
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
        const tmp =this.loadFileData(pf)
        if (!bytekiller_unpack(new Uint8Array(this._ctData.buffer), this._ctData.byteLength, tmp, len)) {
            throw("Bad CRC for collision data")

        }
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
        dataOffset &= 0xFFFF

        const size = this.getBankDataSize(num)
        const avail = this._bankDataTail - this._bankDataHead.byteOffset

        if (avail < size) {
            this.clearBankData()
        }
        if ((this._bankDataHead.byteOffset + size) > this._bankDataTail) {
            throw(`Assertion failed: ${this._bankDataHead.byteOffset + size} <= ${this._bankDataTail}`)
        }
        if (this._bankBuffersCount >= this._bankBuffers.length) {
            throw(`Assersion failed: ${this._bankBuffersCount} < ${this._bankBuffers.length}`)
        }
        this._bankBuffers[this._bankBuffersCount].entryNum = num
        this._bankBuffers[this._bankBuffersCount].ptr = this._bankDataHead
        const data = this._mbk.subarray(dataOffset)
        if (READ_BE_UINT16(ptr, 4) & 0x8000) {
            this._bankDataHead.set(data.subarray(0, size))
        } else {
            if (dataOffset <= 4) {
                throw(`Assertion failed: ${dataOffset} > 4`)
            }
            if (size !== (READ_BE_UINT32(data.buffer, data.byteOffset - 4) << 32 >> 32)) {
                throw(`Assertion failed: ${size} === ${(READ_BE_UINT32(data.buffer, data.byteOffset - 4) << 32 >> 32)}`)
            }

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
        if (offset !== 0xFFFF) {
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
                                        voiceBuf[dst++] = (v & 0xFF) >>> 0
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

    async load_SPRITE_OFFSETS(fileName: string, sprData: Uint8Array) {
        this._entryName = `${fileName}.OFF`;
        try {
            const offData = await this._loadOffsetData();
            if (!offData) {
                throw new Error(`Cannot load '${this._entryName}'`);
            }
            this._processOffsetData(offData, sprData);
        } catch (error) {
            console.error(error.message);
        }
    }

    private async _loadOffsetData(): Promise<Uint8Array | null> {
        try {
            const f = new File();
            if (await f.open(this._entryName, "rb", this._fs)) {
                return this.loadFileData(f)
            }
        } catch (error) {
            console.error("Error loading offset data:", error);
            return null;
        }
    }

    private readonly SPRITE_TERMINATOR = 0xFFFF;
    private readonly INVALID_OFFSET = 0xFFFFFFFF;
    private readonly ENTRY_SIZE = 6; // 2 bytes for pos + 4 bytes for offset

    private _processOffsetData(offData: Uint8Array, sprData: Uint8Array): void {
        if (!offData || !sprData) {
            return;
        }

        for (let index = 0; index < offData.byteLength; index += this.ENTRY_SIZE) {
            const spriteIndex = READ_LE_UINT16(offData.buffer, index);

            // Check for terminator condition
            if (spriteIndex === this.SPRITE_TERMINATOR) {
                break;
            }

            // Validate sprite index
            if (spriteIndex >= NUM_SPRITES) {
                throw new Error(`Invalid sprite index: ${spriteIndex}`);
            }

            const spriteOffset = READ_LE_UINT32(offData.buffer, index + 2);

            // Assign sprite data or null based on offset
            this._sprData[spriteIndex] = spriteOffset === this.INVALID_OFFSET
                ? null
                : sprData.subarray(spriteOffset);
        }
    }

    // This file contains the background sound effects
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
            this._entryName = `ENGCINE.BIN`
            const f:File = new File()
            if (await f.open(this._entryName, "rb", this._fs)) {
                this._cine_off = this.loadFileData(f)
            }
        }

        if (this._cine_txt === null) {
            this._entryName = `ENGCINE.TXT`
            const f:File = new File()
            if (await f.open(this._entryName, "rb", this._fs)) {
                this._cine_txt =this.loadFileData(f)
            }
        }
    }

    getAniData(num: number) {
       const offset = this._readUint16(this._ani, 2 + num * 2)
        // Return a subarray starting from the calculated offset
        return this._ani.subarray(2 + offset)
    }

    getTextString(level: number, num: number) {
		return this._tbn.subarray(this._readUint16(this._tbn, num * 2))
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

    clearLevelRes() {
        this._tbn = null
        this._mbk = null
        this._pal = null
        this._map = null
        this._lev = null
        this._levNum = -1
        this._sgd = null
        this._bnq = null
        this._ani = null
        this.free_OBJ()
    }

}

export { LocaleData, kScratchBufferSize, Resource, ObjectType }
