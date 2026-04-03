import { File } from './file'
import { FileSystem } from "./fs"
import { Color, InitPGE, PgeScriptNode, READ_BE_UINT16, READ_LE_UINT16, READ_LE_UINT32, SoundFx, BankSlot, Buffer, ResolvedSpriteSet, LoadedConradVisual } from "../core/intern"
import { _gameSavedSoundLen, _splNames, _spmOffsetsTable, _voicesOffsetsTable, _gameSavedSoundData } from '../core/staticres'
import { _conradVisualVariants } from '../core/staticres'
import { bytekiller_unpack } from '../core/unpack'
import { LocaleData, NUM_BANK_BUFFERS, NUM_CUTSCENE_TEXTS, NUM_SFXS, NUM_SPRITES, ObjectType, kPaulaFreq } from './constants'
import { createObjectTypeMapping } from './loaders'
import {CT_DATA_SIZE, GAMESCREEN_H, UINT16_MAX, UINT8_MAX} from '../core/game_constants'
import { assert } from "../core/assert"
import { getCandidateEntryNames, getSharedSpriteEntryNames } from './entry-paths'
import { clearResourceBankCache, createResourceBankCache, findResourceBankData, loadResourceBankData, ResourceBankCacheState } from './bank-cache'
import { buildResolvedSpriteSet, createEmptyResolvedSpriteSet, initializeConradVisualsByVariant } from './sprite-store'
import { loadFileDataByCandidateNames, loadFileDataByFileName, openFirstExistingFile, readFileData, tryLoadCollisionOverride } from './file-access'
import { getAniDataView, getCineStringView, getGameStringView, getMenuStringValue, getTextStringView, loadDefaultLocaleTables } from './text-store'
import { loadMenuMap, loadMenuPalette, loadSoundEffects, loadVoiceSegment } from './media-loaders'
import { createResourceAudioState, createResourceLevelState, createResourceSpriteState, createResourceTextState, createResourceUiState, ResourceAudioState, ResourceLevelState, ResourceSpriteState, ResourceTextState, ResourceUiState } from './resource-state'
import { decodeParsedObjIntoLevelState, decodeParsedPgeIntoLevelState, decodeParsedTbnIntoLevelState, loadCollisionAsset, loadPackedSpriteAsset, loadSpcAsset } from './resource-level-loaders'
import { clearLevelResourceState, freeObjectNodes, unloadResourceType } from './resource-cleanup'

const kBankDataSize = 0x7000

class Resource {
	static _voicesOffsetsTable: Uint16Array = _voicesOffsetsTable
	static _spmOffsetsTable: Uint32Array = _spmOffsetsTable
	static _splNames: string[] = _splNames
	static _gameSavedSoundData: Uint8Array = _gameSavedSoundData
	static _gameSavedSoundLen: number = _gameSavedSoundLen

    readonly fileSystem: FileSystem
    readonly readUint16: (buf: ArrayBuffer|Buffer|Uint8Array, offset?: number) => number
    readonly readUint32: (buf: ArrayBuffer|Buffer|Uint8Array, offset?: number) => number
    readonly scratchBuffer: Uint8Array
    readonly bank: ResourceBankCacheState = createResourceBankCache(kBankDataSize, NUM_BANK_BUFFERS)
    entryName: string
    readonly ui: ResourceUiState = createResourceUiState()
    readonly sprites: ResourceSpriteState = createResourceSpriteState(NUM_SPRITES)
    readonly level: ResourceLevelState = createResourceLevelState()
    readonly text: ResourceTextState = createResourceTextState()
    readonly audio: ResourceAudioState = createResourceAudioState()

    constructor(fs: FileSystem) {
        this.fileSystem = fs
        this.readUint16 = READ_LE_UINT16
        this.readUint32 = READ_LE_UINT32
        this.scratchBuffer = new Uint8Array(320 * GAMESCREEN_H + 1024)
        this.clearBankData()

    }

    // MAIN LOADER table
    private readonly OBJECT_TYPE_MAPPING = createObjectTypeMapping(this);

    // MAIN LOADER
    private async tryLoadCollisionOverride(levelName: string) {
        const override = await tryLoadCollisionOverride(this.fileSystem, levelName, this.level.ctData)
        if (override) {
            this.entryName = override.filename
            console.log(`[Resource][CT] Loaded override binary '${override.filename}' (${override.size} bytes)`)
            return true
        }
        return false
    }

    async loadCollisionData(levelName: string) {
        if (await this.tryLoadCollisionOverride(levelName)) {
            return
        }
        await this.load(levelName, ObjectType.OT_CT)
    }

    async load(objName: string, objType: number, ext?: string) {
        const typeConfig = this.OBJECT_TYPE_MAPPING[objType];

        if (!typeConfig) {
            throw new Error(`Load not implemented for object type: ${objType}`);
        }

        const resolvedExtension = (ext || typeConfig.extension).toLowerCase()
        const entryNames = getCandidateEntryNames(objName, objType, resolvedExtension)

        if (objType === ObjectType.OT_CT) {
            if (await this.tryLoadCollisionOverride(objName)) {
                return
            }
        }

        for (const entryName of entryNames) {
            this.entryName = entryName
            const opened = await openFirstExistingFile(this.fileSystem, [this.entryName])
            if (opened) {
                this.entryName = opened.filename
                try {
                    typeConfig.loader.call(this, opened.file)
                    return
                } catch (error) {
                    throw new Error(`Failed to load ${this.entryName}: ${error.message}`)
                }
            }
        }

        this.entryName = entryNames[0]
        if (objType === ObjectType.OT_PGE) {
            throw new Error(`Missing parsed PGE file '${this.entryName}'. Regenerate PGE JSON assets from DATA/levels/legacy-level-data.`)
        } else if (objType === ObjectType.OT_OBJ) {
            throw new Error(`Missing parsed OBJ file '${this.entryName}'. Regenerate OBJ JSON assets from DATA/levels/legacy-level-data.`)
        } else if (objType === ObjectType.OT_TBN) {
            throw new Error(`Missing parsed TBN file '${this.entryName}'. Regenerate TBN JSON assets from level-scoped TBN files.`)
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
// | script_node_index   | uint16    | 2             | Associated object node number              |
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
    loadParsedPGE(f: File) {
        const parsedJson = new TextDecoder("utf-8").decode(readFileData(f, this.entryName))
        this.decodeParsedPGE(parsedJson)
    }

    decodeParsedPGE(json: string) {
        decodeParsedPgeIntoLevelState(this.level, json)
    }

// +--------------------------------------------------------------------------------------------+
// |                              Object Node Structure                                         |
// +--------------------+-----------+---------------+-------------------------------------------+
// | Field             | Type      | Size (bytes)  | Description                                |
// +--------------------+-----------+---------------+-------------------------------------------+
// | last_obj_number   | uint16    | 2             | Last object number in the node             |
// | num_objects       | uint16    | -             | Number of objects in the node              |
// | objects           | Array<PgeScriptEntry>| -             | Collection of objects in the node          |
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
// | next_script_state_type     | uint16    | 2             | Initial object type                        |
// | opcode2           | uint8     | 1             | Opcode 2                                   |
// | opcode1           | uint8     | 1             | Opcode 1                                   |
// | flags             | uint8     | 1             | Object flags                               |
// | opcode3           | uint8     | 1             | Opcode 3                                   |
// | next_script_entry_index   | uint16    | 2             | Initial object number                      |
// | opcode_arg1       | int16     | 2             | Opcode argument 1                          |
// | opcode_arg2       | int16     | 2             | Opcode argument 2                          |
// | opcode_arg3       | int16     | 2             | Opcode argument 3                          |
// +--------------------------------------------------------------------------------------------+
    load_OBJ_JSON(f: File) {
        const parsedJson = new TextDecoder("utf-8").decode(readFileData(f, this.entryName))
        this.decodeParsedOBJ(parsedJson)
    }

    decodeParsedOBJ(json: string) {
        decodeParsedObjIntoLevelState(this.level, json)
    }

    load_SPM(f: File) {
        const len = f.size()
        const tmp = readFileData(f, this.entryName)
        loadPackedSpriteAsset(this.sprites, tmp, len, NUM_SPRITES, Resource._spmOffsetsTable, bytekiller_unpack)
    }

    load_SPRM(f: File) {
        this.sprites.sprm = readFileData(f, this.entryName, 12)
    }

    load_ANI(f: File) {
        this.level.ani = readFileData(f, this.entryName)
    }

    load_BNQ(f: File) {
        this.level.bnq = readFileData(f, this.entryName)
    }

    load_PAL(f: File) {
        this.level.pal = readFileData(f, this.entryName)
    }

    load_RP(f: File) {
        const len = f.size()
        if (len !== 0x4A) {
            throw(`Unexpected size ${len} for '${this.entryName}'`)
        }
       this.ui.rp = readFileData(f, this.entryName)

    }

    load_MBK(f: File) {
        this.level.mbk = readFileData(f, this.entryName)
    }

    load_CT(pf: File) {
        const len = pf.size()
        const tmp = readFileData(pf, this.entryName)
        loadCollisionAsset(this.entryName, this.level.ctData, tmp, len, bytekiller_unpack)
    }

    load_FNT(f: File) {
        this.ui.fnt = readFileData(f, this.entryName)
    }

    loadParsedTBN(f: File) {
        const parsedJson = new TextDecoder("utf-8").decode(readFileData(f, this.entryName))
        this.decodeParsedTBN(parsedJson)
    }

    decodeParsedTBN(json: string) {
        decodeParsedTbnIntoLevelState(this.level, json)
    }

    load_CMD(f: File) {
        this.text.cmd = readFileData(f, this.entryName)
    }

    load_POL(f: File) {
        this.text.pol = readFileData(f, this.entryName)
    }

    load_ICN(f: File) {
        this.ui.icnLen = f.size()
        this.ui.icn = readFileData(f, this.entryName)
    }

    load_SPC(f: File) {
        loadSpcAsset(this.sprites, readFileData(f, this.entryName))
    }

    load_SPRITE(f: File) {
        this.sprites.spr1 = readFileData(f, this.entryName, 12)
    }

    clearBankData() {
        clearResourceBankCache(this.bank)
    }
    
    getBankDataSize(num: number) {
        let len = READ_BE_UINT16(this.level.mbk, num * 6 + 4)
        if (len & 0x8000) {
                if (this.level.mbk === this.level.bnq) { // demo .bnq use signed int
                    len = -(len << 16 >> 16)

                }else {
                    len &= 0x7FFF
                }
            }

        return len * 32
    }

    findBankData(num: number) {
        return findResourceBankData(this.bank, num)
    }

    loadBankData(num: number) {
        const size = this.getBankDataSize(num)
        return loadResourceBankData(this.bank, this.level.mbk, num, size, bytekiller_unpack)
    }

    load_TEXT() {
        const localeTables = loadDefaultLocaleTables()
        this.text.stringsTable = localeTables.stringsTable
        this.text.textsTable = localeTables.textsTable

    }

    async load_VCE(num: number, segment: number) {
        return loadVoiceSegment(this.fileSystem, _voicesOffsetsTable, num, segment)
    }


    //LOAD SPRITE
    async load_SPRITE_OFFSETS(fileName: string, sprData: Uint8Array) {
        const candidates = getSharedSpriteEntryNames(fileName, "OFF")
        this.entryName = candidates[0]
        const { data: offData, filename } = await loadFileDataByCandidateNames(this.fileSystem, candidates)
        this.entryName = filename
        if (!offData) {
            throw new Error(`Cannot load '${this.entryName}'`);
        }
        this.sprites.resolvedSpriteSet = buildResolvedSpriteSet(NUM_SPRITES, offData, sprData)
    }

    async loadMonsterResolvedSpriteSet(fileName: string): Promise<ResolvedSpriteSet> {
        const monsterSpriteCandidates = getSharedSpriteEntryNames(fileName, "SPR")
        let monsterSpriteEntryName = monsterSpriteCandidates[0]
        const opened = await openFirstExistingFile(this.fileSystem, monsterSpriteCandidates)
        if (!opened) {
            throw new Error(`Cannot load '${monsterSpriteEntryName}'`)
        }
        monsterSpriteEntryName = opened.filename
        const monsterSpriteBlob = readFileData(opened.file, monsterSpriteEntryName, 12)
        const { data: offData } = await loadFileDataByCandidateNames(this.fileSystem, getSharedSpriteEntryNames(fileName, "OFF"))
        return buildResolvedSpriteSet(NUM_SPRITES, offData, monsterSpriteBlob)
    }

    initializeConradVisuals(): void {
        this.sprites.loadedConradVisualsByVariantId = initializeConradVisualsByVariant(_conradVisualVariants, this.sprites.resolvedSpriteSet)
    }

    // LOAD SOUND EFFECTS
    async load_FIB(fileName: string) {
        this.entryName = `${fileName}.FIB`
        const loaded = await loadSoundEffects(this.fileSystem, this.entryName)
        if (loaded) {
            this.audio.numSfx = loaded.numSfx
            this.audio.sfxList = loaded.sfxList
        }
    }

    async load_MAP_menu(fileName: string, dstPtr: Uint8Array) {
        this.entryName = `${fileName}.MAP`
        await loadMenuMap(this.fileSystem, this.entryName, dstPtr)
    }

    async load_PAL_menu(fileName: string, dstPtr: Uint8Array) {
        this.entryName = `${fileName}.PAL`
        await loadMenuPalette(this.fileSystem, this.entryName, dstPtr)
    }

    async load_CINE() {
        if (this.text.cineOff === null) {
            this.text.cineOff = await loadFileDataByFileName(this.fileSystem, `ENGCINE.BIN`)
        }

        if (this.text.cineTxt === null) {
            this.text.cineTxt = await loadFileDataByFileName(this.fileSystem, `ENGCINE.TXT`)
        }
    }

    getAniData(num: number) {
        return getAniDataView(this.level.ani, num)
    }

    getTextString(level: number, num: number) {
        return getTextStringView(this.level.tbn, num)
	}

	getGameString(num: number) {
		return getGameStringView(this.text.stringsTable, num)
	}

	getCineString(num: number) {
		return getCineStringView(this.text.cineOff, this.text.cineTxt, this.text.cineStrings, num)
	}

	getMenuString(num: number) {
		return getMenuStringValue(this.text.textsTable, num)
	}

    // Unload, Clear, Free data
    ///////////////////////////
    unload(objType: number) {
        unloadResourceType(this.text, objType)
    }


    free_OBJ() {
        freeObjectNodes(this.level)
    }

    clearLevelAllResources() {
        clearLevelResourceState(this.level)
    }

}

export { LocaleData, Resource, ObjectType }
