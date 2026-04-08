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

const unimplementedResourceLoader: ResourceFileLoader = () => {
    throw new Error('Function not implemented.')
}

const resourceTypeConfig: Record<number, ResourceTypeConfig> = {
    [ObjectType.otRp]: { extension: 'RP', loader: loadRpResource },
    [ObjectType.otPal]: { extension: 'PAL', loader: loadPaletteResource },
    [ObjectType.otTbn]: { extension: 'json', loader: loadParsedTbnAsset },
    [ObjectType.otAni]: { extension: 'ANI', loader: loadAnimationResource },
    [ObjectType.otBnq]: { extension: 'BNQ', loader: loadBankDataResource },
    [ObjectType.otSpm]: { extension: 'SPM', loader: loadPackedSpriteResource },
    [ObjectType.otSprm]: { extension: 'SPR', loader: loadSpriteMaskResource },
    [ObjectType.otMbk]: { extension: 'MBK', loader: loadMbkResource },
    [ObjectType.otFnt]: { extension: 'FNT', loader: loadFontResource },
    [ObjectType.otCmd]: { extension: 'CMD', loader: loadCommandTextResource },
    [ObjectType.otPge]: { extension: 'json', loader: loadParsedPgeAsset },
    [ObjectType.otCt]: { extension: 'CT', loader: loadCollisionResource },
    [ObjectType.otPol]: { extension: 'POL', loader: loadPolygonTextResource },
    [ObjectType.otIcn]: { extension: 'ICN', loader: loadIconResource },
    [ObjectType.otSpc]: { extension: 'SPC', loader: loadSpcResource },
    [ObjectType.otSpr]: { extension: 'SPR', loader: loadSpriteResource },
    [ObjectType.otObj]: { extension: 'OBJ', loader: loadParsedObjAsset },
    [ObjectType.otMap]: { extension: '', loader: unimplementedResourceLoader },
    [ObjectType.otRpc]: { extension: '', loader: unimplementedResourceLoader },
    [ObjectType.otDemo]: { extension: '', loader: unimplementedResourceLoader },
    [ObjectType.otTab]: { extension: '', loader: unimplementedResourceLoader },
    [ObjectType.otTxtbin]: { extension: '', loader: unimplementedResourceLoader },
    [ObjectType.otOff]: { extension: '', loader: unimplementedResourceLoader },
    [ObjectType.otCmp]: { extension: '', loader: unimplementedResourceLoader },
    [ObjectType.otObc]: { extension: '', loader: unimplementedResourceLoader },
    [ObjectType.otSpl]: { extension: '', loader: unimplementedResourceLoader },
}

function getResourceTypeConfig(objType: number): ResourceTypeConfig | undefined {
    return resourceTypeConfig[objType]
}

export { getResourceTypeConfig }
export type { ResourceFileLoader, ResourceTypeConfig }
