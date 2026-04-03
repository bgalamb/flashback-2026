import { File } from './file'
import { FileSystem } from "./fs"
import { READ_LE_UINT16, READ_LE_UINT32, ResolvedSpriteSet } from "../core/intern"
import { _gameSavedSoundLen, _splNames, _spmOffsetsTable, _voicesOffsetsTable, _gameSavedSoundData } from '../core/staticres'
import { _conradVisualVariants } from '../core/staticres'
import { bytekiller_unpack } from '../core/unpack'
import { LocaleData, NUM_BANK_BUFFERS, NUM_SPRITES, ObjectType } from './constants'
import { getResourceTypeConfig } from './loaders'
import { GAMESCREEN_H } from '../core/game_constants'
import { getCandidateEntryNames } from './entry-paths'
import { createResourceBankCache, ResourceBankCacheState } from './bank-cache'
import { clearBankData as clearBankDataFromState, findBankData as findBankDataFromState, getBankDataSize as getBankDataSizeFromState, loadBankData as loadBankDataFromState } from './resource-bank-service'
import { openFirstExistingFile, tryLoadCollisionOverride } from './file-access'
import { createResourceAudioState, createResourceLevelState, createResourceSpriteState, createResourceTextState, createResourceUiState, ResourceAudioState, ResourceLevelState, ResourceSpriteState, ResourceTextState, ResourceUiState } from './resource-state'
import { clearLevelResourceState, freeObjectNodes, unloadResourceType } from './resource-cleanup'
import { loadMenuMapData, loadMenuPaletteData, loadSoundEffectsData, loadVoiceSegmentData } from './resource-audio-service'
import { initializeConradVisuals as initializeConradVisualsForState, loadMonsterResolvedSpriteSet as loadMonsterResolvedSpriteSetFromFs, loadSpriteOffsets as loadSpriteOffsetsFromFs } from './resource-sprite-service'
import { getAnimationData, getCinematicString, getGameString, getMenuString, getTextString, loadCinematicText as loadCinematicTextIntoState, loadText as loadTextIntoState } from './resource-text-service'
import type { ResourceAssetLoaderContext } from './resource-asset-loaders'

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

    private getAssetLoaderContext(): ResourceAssetLoaderContext {
        return {
            entryName: this.entryName,
            level: this.level,
            sprites: this.sprites,
            text: this.text,
            ui: this.ui,
            numSprites: NUM_SPRITES,
            spmOffsetsTable: Resource._spmOffsetsTable,
        }
    }

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
        const typeConfig = getResourceTypeConfig(objType)

        if (!typeConfig) {
            throw new Error(`Load not implemented for object type: ${objType}`)
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
                    typeConfig.loader(this.getAssetLoaderContext(), opened.file)
                    return
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error)
                    throw new Error(`Failed to load ${this.entryName}: ${message}`)
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

    clearBankData() {
        clearBankDataFromState(this.bank)
    }
    
    getBankDataSize(bankIndex: number) {
        return getBankDataSizeFromState(this.level.mbk, this.level.bnq, bankIndex)
    }

    findBankData(bankIndex: number) {
        return findBankDataFromState(this.bank, bankIndex)
    }

    loadBankData(bankIndex: number) {
        return loadBankDataFromState(this.bank, this.level.mbk, this.level.bnq, bankIndex, bytekiller_unpack)
    }

    loadText() {
        loadTextIntoState(this.text)
    }

    async loadVoiceSegment(num: number, segment: number) {
        return loadVoiceSegmentData(this.fileSystem, num, segment)
    }


    async loadSpriteOffsets(fileName: string, sprData: Uint8Array) {
        const loadedSpriteOffsets = await loadSpriteOffsetsFromFs(this.fileSystem, fileName, sprData, NUM_SPRITES)
        this.entryName = loadedSpriteOffsets.entryName
        this.sprites.resolvedSpriteSet = loadedSpriteOffsets.resolvedSpriteSet
    }

    async loadMonsterResolvedSpriteSet(fileName: string): Promise<ResolvedSpriteSet> {
        return loadMonsterResolvedSpriteSetFromFs(this.fileSystem, fileName, NUM_SPRITES)
    }

    initializeConradVisuals(): void {
        initializeConradVisualsForState(this.sprites, _conradVisualVariants)
    }

    // LOAD SOUND EFFECTS
    async loadSoundEffects(fileName: string) {
        this.entryName = await loadSoundEffectsData(this.fileSystem, this.audio, fileName)
    }

    async loadMenuMap(fileName: string, dstPtr: Uint8Array) {
        this.entryName = await loadMenuMapData(this.fileSystem, fileName, dstPtr)
    }

    async loadMenuPalette(fileName: string, dstPtr: Uint8Array) {
        this.entryName = await loadMenuPaletteData(this.fileSystem, fileName, dstPtr)
    }

    async loadCinematicText() {
        await loadCinematicTextIntoState(this.fileSystem, this.text)
    }

    getAniData(num: number) {
        return getAnimationData(this.level, num)
    }

    getTextString(level: number, num: number) {
        return getTextString(this.level, level, num)
	}

	getGameString(num: number) {
		return getGameString(this.text, num)
	}

	getCineString(num: number) {
		return getCinematicString(this.text, num)
	}

	getMenuString(num: number) {
		return getMenuString(this.text, num)
	}

    // Unload, Clear, Free data
    ///////////////////////////
    unload(objType: number) {
        unloadResourceType(this.text, objType)
    }


    freeObjectNodes() {
        freeObjectNodes(this.level)
    }

    clearLevelAllResources() {
        clearLevelResourceState(this.level)
    }

}

export { LocaleData, Resource, ObjectType }
