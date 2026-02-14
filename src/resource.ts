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
        if (!this._scratchBuffer) {
            throw("Unable to allocate temporary memory buffer");
        }
        const kBankDataSize = 0x7000
        this._bankData = new Uint8Array(kBankDataSize)
        if (!this._bankData) {
            throw("Unable to allocate bank data buffer");
        }
        this._bankDataTail = kBankDataSize
        this.clearBankData()
    }

	async init() {
        if (this._fs.exists(ResourceAba.FILENAME)) {
            this._aba = new ResourceAba(this._fs)
            await this._aba.readEntries()
            this._isDemo = true
        }
        const exists = this.fileExists("LEVEL1.MAP")
        if (!exists) {
            this._isDemo = true
        }
    }

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

    async load(objName: string, objType: number, ext: string = "") {
        let loadStub:LoadStub = null
        //first let's try to load the real file
        switch(objType) {
            case ObjectType.OT_RP:
                this._entryName = `${objName}.RP`
                loadStub = this.load_RP.bind(this)
                break

            case ObjectType.OT_PAL:
                this._entryName = `${objName}.PAL`
                loadStub = this.load_PAL.bind(this)
                break

            case ObjectType.OT_TBN:
                this._entryName = `${objName}.TBN`
                if (!this._fs.exists(this._entryName)) {
                    this._entryName = `${objName}.TBN`
                }
                loadStub = this.load_TBN.bind(this)
                break;

            case ObjectType.OT_ANI:
                this._entryName = `${objName}.ANI`
                loadStub = this.load_ANI.bind(this)
                break

            case ObjectType.OT_BNQ:
                this._entryName = `${objName}.BNQ`
                loadStub = this.load_BNQ.bind(this)
                break

            case ObjectType.OT_SPM:
                this._entryName = `${objName}.SPM`
                loadStub = this.load_SPM.bind(this)
                break

            case ObjectType.OT_SPRM:
                this._entryName = `${objName}.SPR`
                loadStub = this.load_SPRM.bind(this)
                break

            case ObjectType.OT_MBK:
                this._entryName = `${objName}.MBK`
                loadStub = this.load_MBK.bind(this)
                break

            case ObjectType.OT_FNT:
                this._entryName = `${objName}.FNT`
                loadStub = this.load_FNT.bind(this)
                break

            case ObjectType.OT_CMD:
                this._entryName = `${objName}.CMD`
                loadStub = this.load_CMD.bind(this)
                break

            case ObjectType.OT_PGE:
                this._entryName = `${objName}.PGE`
                loadStub = this.load_PGE.bind(this)
                break

            case ObjectType.OT_CT:
                this._entryName = `${objName}.CT`
                loadStub = this.load_CT.bind(this)
                break

            case ObjectType.OT_POL:
                this._entryName = `${objName}.POL`
                loadStub = this.load_POL.bind(this)
                break                

            case ObjectType.OT_ICN:
                this._entryName = `${objName}.ICN`
                loadStub = this.load_ICN.bind(this)
                break

            case ObjectType.OT_SPC:
                this._entryName = `${objName}.SPC`
                loadStub = this.load_SPC.bind(this)
                break

            case ObjectType.OT_SPR:
                this._entryName = `${objName}.SPR`
                loadStub = this.load_SPRITE.bind(this)
                break

            case ObjectType.OT_SGD:
                this._entryName = `${objName}.SGD`
                loadStub = this.load_SGD.bind(this)
                break

            case ObjectType.OT_LEV:
                this._entryName = `${objName}.LEV`
                loadStub = this.load_LEV.bind(this)
                break
            case ObjectType.OT_OBJ:
                this._entryName = `${objName}.OBJ`
                loadStub = this.load_OBJ.bind(this)
                break

            default:
                throw(`load not implemented for ${objType} !`)
        }

        if (ext) {
            this._entryName = `${objName}.${ext}`
        }

        const f:File = new File()
        if (await f.open(this._entryName, "rb", this._fs)) {
            if (!loadStub) {
                throw(`assertion failed ${loadStub}`)
            }
            loadStub(f)
            if (f.ioErr()) {
                throw(`I/O error when reading '${this._entryName}'`)
            }
        } else {
            // as a fallback let's try to load the ABA entry
            if (this._aba) {
                const {dat, size } = this._aba.loadEntry(this._entryName)
                if (dat) {
                    switch(objType) {
                        case ObjectType.OT_PAL:
                            this._pal = dat
                            break                        
                        case ObjectType.OT_MBK:
                            this._mbk = dat
                            break
                        case ObjectType.OT_FNT:
                            this._fnt = dat
                            break
                        case ObjectType.OT_BNQ:
                            this._bnq = dat
                            break
                        case ObjectType.OT_ANI:
                            this._ani = dat
                            break
                        case ObjectType.OT_TBN:
                            this._tbn = dat
                            break                            
                        case ObjectType.OT_RP:
                            if (size !== 0x4A) {
                                throw(`Unexpected size ${size} for '${this._entryName}'`)
                            }
                            this._rp.set(dat.subarray(0, size))
                            break                            
                        case ObjectType.OT_CMD:
                            this._cmd = dat
                            break
                        case ObjectType.OT_CT:
                            if (!bytekiller_unpack(new Uint8Array(this._ctData.buffer), this._ctData.byteLength, dat, size)) {
                                debugger
                                throw(`Bad CRC for '${this._entryName}`)
                            }
                            break                            
                        case ObjectType.OT_POL:
                            this._pol = dat
                            break
                        case ObjectType.OT_ICN:
                            this._icn = dat
                            break
                        case ObjectType.OT_SPC:
                            this._spc = dat
                            this._numSpc = READ_BE_UINT16(this._spc.buffer) / 2
                            break
                        case ObjectType.OT_OBJ:
                            this._numObjectNodes = READ_LE_UINT16(dat)
                            if (this._numObjectNodes !== 230 ){
                                throw(`assertion failed ${this._numObjectNodes}`)
                            }
                            this.decodeOBJ(dat.subarray(2,size -2), size -2)
                            break
                        default:
                            debugger
                            throw(`${objType} not supported!`)
                    }
                    return
                }
            } else if (this._isDemo) {
                switch(objType) {
                    case ObjectType.OT_CMD:
                    case ObjectType.OT_POL:
                        console.warn(`Unable to load '${this._entryName}' type %${objType}`)
                }
            }
            throw(`Cannot open ${this._entryName}`)
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
            //log out the value to understand better
            //log out the value to understand better
            console.log('Init PGE Fields:', {
                type: pge.type,
                pos_x: pge.pos_x,
                pos_y: pge.pos_y,
                obj_node_number: pge.obj_node_number,
                init_room: pge.init_room,
                room_location: pge.room_location,
                init_flags: pge.init_flags,
                colliding_icon_num: pge.colliding_icon_num,
                icon_num: pge.icon_num,
                object_id: pge.object_id,
                skill: pge.skill,
                mirror_x: pge.mirror_x,
                flags: pge.flags,
                unk1C: pge.unk1C,
                text_num: pge.text_num
            });
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
                if (!on) {
                    throw(`Unable to allocate ObjectNode num=${i}`)
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
        f.seek(len - 4)
        const size = f.readUint32BE()
        f.seek(0)
        const tmp = new Uint8Array(len)
        if (!tmp) {
            throw("Unable to allocate SPM temporary buffer")
        }
        f.read(tmp.buffer, len)
        if (size === kPersoDatSize) {
            this._spr1 = new Uint8Array(size)
            if (!this._spr1) {
                throw("Unable to allocate SPR1 buffer")
            }
            if (!bytekiller_unpack(this._spr1, size, tmp, len)) {
                throw("Bad CRC for SPM data")
            }
        } else {
            if (size > this._sprm.byteLength) {
                throw(`Assertion error: ${size} <= ${this._sprm.byteLength}`)
            }
            // assert(size <= sizeof(_sprm));
            if (!bytekiller_unpack(this._sprm, this._sprm.byteLength, tmp, len)) {
                throw("Bad CRC for SPM data")
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
        const len = f.size() - 12
        const _pge: Uint8Array = new Uint8Array(len)
        f.read(_pge.buffer, len)
        this.decodePGE(_pge)
        // //load the first byte from the file, that's going to indicate the number of PGEs contained
        // this._pgeNum = f.readUint16LE()
        // console.info(`There are a total of ${this._pgeNum} PGEs in this file`)
        // //pgeInitLengt = 256 and it's completely empty
        // if (this._pgeNum > this._pgeInit.length) {
        //     throw(`Assertion error: ${this._pgeNum} <= ${this._pgeInit.length}`)
        // }
        // //this will fill the PGEs in the init array, as many as they are.
        // for (let i = 0; i < this._pgeNum; ++i) {
        //     const pge: InitPGE = this._pgeInit[i]
        //     pge.type = f.readUint16LE()
        //     pge.pos_x = f.readUint16LE()
        //     pge.pos_y = f.readUint16LE()
        //     pge.obj_node_number = f.readUint16LE()
        //     pge.life = f.readUint16LE()
        //     for (let lc = 0; lc < 4; ++lc) {
        //         pge.counter_values[lc] = f.readUint16LE()
        //     }
        //     pge.object_type = f.readByte()
        //     pge.init_room = f.readByte()
        //     pge.room_location = f.readByte()
        //     pge.init_flags = f.readByte()
        //     pge.colliding_icon_num = f.readByte()
        //     pge.icon_num = f.readByte()
        //     pge.object_id = f.readByte()
        //     pge.skill = f.readByte()
        //     pge.mirror_x = f.readByte()
        //     pge.flags = f.readByte()
        //     pge.unk1C = f.readByte()
        //     f.readByte()
        //     pge.text_num = f.readUint16LE()
        //
        //     //log out the value to understand better
        //     console.log('Init PGE Fields:', {
        //         type: pge.type,
        //         pos_x: pge.pos_x,
        //         pos_y: pge.pos_y,
        //         obj_node_number: pge.obj_node_number,
        //         init_room: pge.init_room,
        //         room_location: pge.room_location,
        //         init_flags: pge.init_flags,
        //         colliding_icon_num: pge.colliding_icon_num,
        //         icon_num: pge.icon_num,
        //         object_id: pge.object_id,
        //         skill: pge.skill,
        //         mirror_x: pge.mirror_x,
        //         flags: pge.flags,
        //         unk1C: pge.unk1C,
        //         text_num: pge.text_num
        //     });
        //
        // }
    }

    load_OBJ(f: File) {
        const len = f.size()
        const dat = new Uint8Array(len)
        f.read(dat.buffer, len)

        this._numObjectNodes = READ_LE_UINT16(dat)
        if (this._numObjectNodes !== 230 ){
            throw(`assertion failed ${this._numObjectNodes}`)
        }
        this.decodeOBJ(dat.subarray(2,len -2), len -2)
    }

    load_SPRM(f: File) {
        const len = f.size() - 12
        f.seek(12)
        f.read(this._sprm.buffer, len)
    }

    load_ANI(f: File) {
        const len = f.size()
        this._ani = new Uint8Array(len)
        f.read(this._ani.buffer, len)
    }

    load_LEV(f: File) {
        const len = f.size()
        this._lev = new Uint8Array(len)
        f.read(this._lev.buffer, len)
    }

    load_BNQ(f: File) {
        const len = f.size()
        this._bnq = new Uint8Array(len)
        f.read(this._bnq.buffer, len)
    }

    load_SGD(f: File) {
        const len = f.size()
        this._sgd = new Uint8Array(len)
        f.read(this._sgd.buffer, len)
        this._sgd[0] = 0
    }

    load_PAL(f: File) {
        const len = f.size()
        this._pal = new Uint8Array(len)
        f.read(this._pal.buffer, len)
    }

    load_RP(f: File) {
        const len = f.size()
        if (len !== 0x4A) {
            throw(`Unexpected size ${len} for '${this._entryName}'`)
        }
        f.read(this._rp.buffer, 0x4A)

    }

    load_MBK(f: File) {
        const len = f.size()
        this._mbk = new Uint8Array(len)
        f.read(this._mbk.buffer, len)
    }

    load_CT(pf: File) {
        const len = pf.size()
        const tmp = new Uint8Array(len)
        pf.read(tmp.buffer, len)
        if (!bytekiller_unpack(new Uint8Array(this._ctData.buffer), this._ctData.byteLength, tmp, len)) {
            throw("Bad CRC for collision data")

        }
    }

    load_FNT(f: File) {
        const len = f.size()
        this._fnt = new Uint8Array(len)
        f.read(this._fnt.buffer, len)
    }

    load_TBN(f: File) {
        const len = f.size()
        this._tbn = new Uint8Array(len)
        f.read(this._tbn.buffer, len)
    }

    load_CMD(f: File) {
        const len = f.size()
        this._cmd = new Uint8Array(len)
        f.read(this._cmd.buffer, len)
    }

    load_POL(f: File) {
        const len = f.size()
        this._pol = new Uint8Array(len)
        f.read(this._pol.buffer, len)
    }

    load_ICN(f: File) {
        const len = f.size()
        this._icnLen = len
        this._icn = new Uint8Array(len)
        f.read(this._icn.buffer, len)
    }


    load_SPC(f: File) {
        const len = f.size()
        this._spc = new Uint8Array(len)
        f.read(this._spc.buffer, len)
        this._numSpc = READ_BE_UINT16(this._spc.buffer) / 2
    }

    load_SPRITE(f: File) {
        const len = f.size() - 12
        this._spr1 = new Uint8Array(len)
        f.seek(12)
        f.read(this._spr1.buffer, len)

    }

    fileExists(filename: string): boolean {
        if (this._fs.exists(filename)) {
            return true
        } else if (this._aba) {
            return this._aba.findEntry(filename) !== null
        }
        return false
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
                const len = f.size();
                const offData = new Uint8Array(len);
                f.read(offData.buffer, len);
                if (f.ioErr()) {
                    throw new Error(`I/O error when reading '${this._entryName}'`);
                }
                return offData;
            }

            if (this._aba) {
                const res = this._aba.loadEntry(this._entryName);
                return res.dat;
            }

            return null;
        } catch (error) {
            console.error("Error loading offset data:", error);
            return null;
        }
    }

    private _processOffsetData(offData: Uint8Array, sprData: Uint8Array) {
        let index = 0;
        while (true) {
            const pos = READ_LE_UINT16(offData.buffer, index);
            if (pos === 0xFFFF) break;
            if (pos >= NUM_SPRITES) {
                throw new Error(`Invalid sprite index: ${pos}`);
            }
            const off = READ_LE_UINT32(offData.buffer, index + 2);
            this._sprData[pos] = off === 0xFFFFFFFF
                ? null
                : sprData.subarray(off);
            index += 6;
        }
    }


    async load_FIB(fileName: string) {
        this._entryName = `${fileName}.FIB`
        const f = new File()
        if (await f.open(this._entryName, "rb", this._fs)) {
            this._numSfx = f.readUint16LE()
            this._sfxList = new Array(this._numSfx).fill(null).map(() => ({
                offset: 0,
                freq: 0,
                len: 0,
                peak: 0,
                data: null,
            }))
            if (!this._sfxList) {
                console.error("Unable to allocate SoundFx table");
            }
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
                if (!data) {
                    console.error("Unable to allocate SoundFx data buffer")
                }
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
        } else if (this._aba) {
            const { dat, size } = this._aba.loadEntry(this._entryName)
            if (dat) {
                if (size !== kMenuMapSize) {
                    console.error(`Unexpected size ${size} for '${this._entryName}'`)
                }
                dstPtr.set(dat.subarray(0, size))
                return
            }
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
        } else if (this._aba) {
            const { dat, size } = this._aba.loadEntry(this._entryName)
            if (dat) {
                if (size !== kMenuPalSize) {
                    console.error(`Unexpected size ${size} for '${this._entryName}'`)
                }
                dstPtr.set(dat.subarray(0, size))
                return
            }
        }
        console.error(`Cannot load '${this._entryName}'`)
    }

    async load_CINE() {
        const prefix = 'ENG'

                if (this._cine_off === null) {
                    this._entryName = `${prefix}.BIN`
                    if (!this._fs.exists(this._entryName)) {
                        this._entryName = "ENGCINE.BIN"
                    }
                    const f:File = new File()
                    if (await f.open(this._entryName, "rb", this._fs)) {
                        const len = f.size()
                        this._cine_off = new Uint8Array(len)
                        if (!this._cine_off) {
                            throw(`Unable to allocate cinematics offsets (size=${len})`)
                        }
                        f.read(this._cine_off, len)
                        if (f.ioErr()) {
                            throw(`I/O error when reading '${this._entryName}'`)
                        }
                    } else if (this._aba) {
                        const { dat } = this._aba.loadEntry(this._entryName)
                        this._cine_off = dat
                    } else if (this._isDemo) {
                        return // some demos do not have cutscene datafiles                        
                    }
                }
                if (!this._cine_off) {
                    throw(`Cannot load '${this._entryName}'`)
                }
                if (this._cine_txt === null) {
                    this._entryName = `${prefix}CINE.TXT`
                    if (!this._fs.exists(this._entryName)) {
                        this._entryName = "ENGCINE.TXT"
                    }
                    const f:File = new File()
                    if (await f.open(this._entryName, "rb", this._fs)) {
                        const len = f.size()
                        this._cine_txt = new Uint8Array(len)
                        if (!this._cine_txt) {
                            throw(`Unable to allocate cinematics text data (size=${len})`)
                        }
                        f.read(this._cine_txt, len)
                        if (f.ioErr()) {
                            throw(`I/O error when reading '${this._entryName}`)
                        }
                    } else if (this._aba) {
                        const { dat } = this._aba.loadEntry(this._entryName)
                        this._cine_txt = dat
                    } else if (this._isDemo) {
                        return // some demos do not have cutscene datafiles                            
                    }
                }
                if (!this._cine_txt) {
                    throw(`Cannot load '${this._entryName}'`)
                }
    }


    getAniData(num: number) {
       const offset = this._readUint16(this._ani, 2 + num * 2)

        // Return a subarray starting from the calculated offset
        return this._ani.subarray(2 + offset)
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

    destructor() {
        throw 'resource::descrutor not implemented!'
    }
}

export { LocaleData, kScratchBufferSize, Resource, ObjectType }
