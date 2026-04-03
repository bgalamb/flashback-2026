import { File } from './file'
import { ObjectType } from './constants'
import type { ResourceAssetLoaderContext } from './resource-asset-loaders'
import {
    loadAnimationResource,
    loadBankDataResource,
    loadCollisionResource,
    loadCommandTextResource,
    loadFontResource,
    loadIconResource,
    loadMbkResource,
    loadPackedSpriteResource,
    loadPaletteResource,
    loadParsedObjAsset,
    loadParsedPgeAsset,
    loadParsedTbnAsset,
    loadPolygonTextResource,
    loadRpResource,
    loadSpcResource,
    loadSpriteMaskResource,
    loadSpriteResource,
} from './resource-asset-loaders'

type ResourceFileLoader = (ctx: ResourceAssetLoaderContext, file: File) => void

interface ResourceTypeConfig {
    extension: string
    loader: ResourceFileLoader
}

const UNIMPLEMENTED_RESOURCE_LOADER: ResourceFileLoader = () => {
    throw new Error('Function not implemented.')
}

const RESOURCE_TYPE_CONFIG: Record<number, ResourceTypeConfig> = {
    [ObjectType.OT_RP]: { extension: 'RP', loader: loadRpResource },
    [ObjectType.OT_PAL]: { extension: 'PAL', loader: loadPaletteResource },
    [ObjectType.OT_TBN]: { extension: 'json', loader: loadParsedTbnAsset },
    [ObjectType.OT_ANI]: { extension: 'ANI', loader: loadAnimationResource },
    [ObjectType.OT_BNQ]: { extension: 'BNQ', loader: loadBankDataResource },
    [ObjectType.OT_SPM]: { extension: 'SPM', loader: loadPackedSpriteResource },
    [ObjectType.OT_SPRM]: { extension: 'SPR', loader: loadSpriteMaskResource },
    [ObjectType.OT_MBK]: { extension: 'MBK', loader: loadMbkResource },
    [ObjectType.OT_FNT]: { extension: 'FNT', loader: loadFontResource },
    [ObjectType.OT_CMD]: { extension: 'CMD', loader: loadCommandTextResource },
    [ObjectType.OT_PGE]: { extension: 'json', loader: loadParsedPgeAsset },
    [ObjectType.OT_CT]: { extension: 'CT', loader: loadCollisionResource },
    [ObjectType.OT_POL]: { extension: 'POL', loader: loadPolygonTextResource },
    [ObjectType.OT_ICN]: { extension: 'ICN', loader: loadIconResource },
    [ObjectType.OT_SPC]: { extension: 'SPC', loader: loadSpcResource },
    [ObjectType.OT_SPR]: { extension: 'SPR', loader: loadSpriteResource },
    [ObjectType.OT_OBJ]: { extension: 'OBJ', loader: loadParsedObjAsset },
    [ObjectType.OT_MAP]: { extension: '', loader: UNIMPLEMENTED_RESOURCE_LOADER },
    [ObjectType.OT_RPC]: { extension: '', loader: UNIMPLEMENTED_RESOURCE_LOADER },
    [ObjectType.OT_DEMO]: { extension: '', loader: UNIMPLEMENTED_RESOURCE_LOADER },
    [ObjectType.OT_TAB]: { extension: '', loader: UNIMPLEMENTED_RESOURCE_LOADER },
    [ObjectType.OT_TXTBIN]: { extension: '', loader: UNIMPLEMENTED_RESOURCE_LOADER },
    [ObjectType.OT_OFF]: { extension: '', loader: UNIMPLEMENTED_RESOURCE_LOADER },
    [ObjectType.OT_CMP]: { extension: '', loader: UNIMPLEMENTED_RESOURCE_LOADER },
    [ObjectType.OT_OBC]: { extension: '', loader: UNIMPLEMENTED_RESOURCE_LOADER },
    [ObjectType.OT_SPL]: { extension: '', loader: UNIMPLEMENTED_RESOURCE_LOADER },
}

function getResourceTypeConfig(objType: number): ResourceTypeConfig | undefined {
    return RESOURCE_TYPE_CONFIG[objType]
}

export { getResourceTypeConfig }
export type { ResourceFileLoader, ResourceTypeConfig }
