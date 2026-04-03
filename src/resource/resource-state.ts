import { Color, InitPGE, LoadedConradVisual, PgeScriptNode, ResolvedSpriteSet, SoundFx, CreateInitPGE } from '../intern'
import { CT_DATA_SIZE } from '../game_constants'
import { createEmptyResolvedSpriteSet } from './sprite-store'

interface ResourceUiState {
    fnt: Uint8Array
    icn: Uint8Array
    icnLen: number
    tab: Uint8Array
    rp: Uint8Array
}

interface ResourceSpriteState {
    spc: Uint8Array
    numSpc: number
    spr1: Uint8Array
    resolvedSpriteSet: ResolvedSpriteSet
    loadedConradVisualsByVariantId: Map<number, LoadedConradVisual>
    sprm: Uint8Array
    perso: Uint8Array
    monster: Uint8Array
}

interface ResourceLevelState {
    mbk: Uint8Array
    pal: Uint8Array
    ani: Uint8Array
    tbn: Uint8Array[]
    ctData: Int8Array
    pgeTotalNumInFile: number
    pgeAllInitialStateFromFile: InitPGE[]
    bnq: Uint8Array
    numObjectNodes: number
    objectNodesMap: PgeScriptNode[]
    clutSize: number
    clut: Color[]
}

interface ResourceTextState {
    cmd: Uint8Array
    pol: Uint8Array
    cineStrings: Uint8Array[]
    cineOff: Uint8Array
    cineTxt: Uint8Array
    textsTable: string[]
    stringsTable: Uint8Array
    str: Uint8Array
    credits: Uint8Array
}

interface ResourceAudioState {
    hasSeqData: boolean
    sfxList: SoundFx[]
    numSfx: number
}

function createResourceUiState(): ResourceUiState {
    return {
        fnt: null,
        icn: null,
        icnLen: 0,
        tab: null,
        rp: new Uint8Array(0x4A),
    }
}

function createResourceSpriteState(numSprites: number): ResourceSpriteState {
    return {
        spc: null,
        numSpc: 0,
        spr1: null,
        resolvedSpriteSet: createEmptyResolvedSpriteSet(numSprites),
        loadedConradVisualsByVariantId: new Map(),
        sprm: new Uint8Array(0x10000),
        perso: null,
        monster: null,
    }
}

function createResourceLevelState(): ResourceLevelState {
    return {
        mbk: null,
        pal: null,
        ani: null,
        tbn: [],
        ctData: new Int8Array(CT_DATA_SIZE),
        pgeTotalNumInFile: 0,
        pgeAllInitialStateFromFile: new Array(256).fill(null).map(() => CreateInitPGE()),
        bnq: null,
        numObjectNodes: 0,
        objectNodesMap: new Array(255),
        clutSize: 0,
        clut: null,
    }
}

function createResourceTextState(): ResourceTextState {
    return {
        cmd: null,
        pol: null,
        cineStrings: null,
        cineOff: null,
        cineTxt: null,
        textsTable: null,
        stringsTable: null,
        str: null,
        credits: null,
    }
}

function createResourceAudioState(): ResourceAudioState {
    return {
        hasSeqData: false,
        sfxList: null,
        numSfx: 0,
    }
}

export {
    createResourceAudioState,
    createResourceLevelState,
    createResourceSpriteState,
    createResourceTextState,
    createResourceUiState,
    ResourceAudioState,
    ResourceLevelState,
    ResourceSpriteState,
    ResourceTextState,
    ResourceUiState,
}
