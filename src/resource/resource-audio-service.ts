import { _voicesOffsetsTable } from '../core/staticres'
import { loadMenuMap, loadMenuPalette, loadSoundEffectsManifest, loadVoiceSegment } from './media-loaders'
import { ResourceAudioState } from './resource-state'
import { FileSystem } from './fs'

async function loadVoiceSegmentData(fileSystem: FileSystem, num: number, segment: number) {
    return loadVoiceSegment(fileSystem, _voicesOffsetsTable, num, segment)
}

async function loadSoundEffectsData(fileSystem: FileSystem, audioState: ResourceAudioState, fileName: string) {
    const entryName = `sound_effects/${fileName.toLowerCase()}.fib.json`
    const loaded = await loadSoundEffectsManifest(fileSystem, entryName)
    if (loaded) {
        audioState.numSfx = loaded.numSfx
        audioState.sfxList = loaded.sfxList
    }
    return entryName
}

async function loadMenuMapData(fileSystem: FileSystem, fileName: string, dstPtr: Uint8Array) {
    const entryName = `${fileName}.MAP`
    await loadMenuMap(fileSystem, entryName, dstPtr)
    return entryName
}

async function loadMenuPaletteData(fileSystem: FileSystem, fileName: string, dstPtr: Uint8Array) {
    const entryName = `${fileName}.PAL`
    await loadMenuPalette(fileSystem, entryName, dstPtr)
    return entryName
}

export {
    loadMenuMapData,
    loadMenuPaletteData,
    loadSoundEffectsData,
    loadVoiceSegmentData,
}
