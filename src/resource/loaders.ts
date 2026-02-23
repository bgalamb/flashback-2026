import { File } from '../file'
import { ObjectType } from './constants'

function createObjectTypeMapping(resource: any): Record<number, { extension: string, loader: (f: File) => void }> {
    return {
        [ObjectType.OT_RP]: { extension: 'RP', loader: resource.load_RP },
        [ObjectType.OT_PAL]: { extension: 'PAL', loader: resource.load_PAL },
        [ObjectType.OT_TBN]: { extension: 'TBN', loader: resource.load_TBN },
        [ObjectType.OT_ANI]: { extension: 'ANI', loader: resource.load_ANI },
        [ObjectType.OT_BNQ]: { extension: 'BNQ', loader: resource.load_BNQ },
        [ObjectType.OT_SPM]: { extension: 'SPM', loader: resource.load_SPM },
        [ObjectType.OT_SPRM]: { extension: 'SPR', loader: resource.load_SPRM },
        [ObjectType.OT_MBK]: { extension: 'MBK', loader: resource.load_MBK },
        [ObjectType.OT_FNT]: { extension: 'FNT', loader: resource.load_FNT },
        [ObjectType.OT_CMD]: { extension: 'CMD', loader: resource.load_CMD },
        [ObjectType.OT_PGE]: { extension: 'PGE', loader: resource.load_PGE },
        [ObjectType.OT_CT]: { extension: 'CT', loader: resource.load_CT },
        [ObjectType.OT_POL]: { extension: 'POL', loader: resource.load_POL },
        [ObjectType.OT_ICN]: { extension: 'ICN', loader: resource.load_ICN },
        [ObjectType.OT_SPC]: { extension: 'SPC', loader: resource.load_SPC },
        [ObjectType.OT_SPR]: { extension: 'SPR', loader: resource.load_SPRITE },
        [ObjectType.OT_SGD]: { extension: 'SGD', loader: resource.load_SGD },
        [ObjectType.OT_LEV]: { extension: 'LEV', loader: resource.load_LEV },
        [ObjectType.OT_OBJ]: { extension: 'OBJ', loader: resource.load_OBJ },
        [ObjectType.OT_MAP]: {
            extension: '',
            loader: function (_f: File): void {
                throw new Error('Function not implemented.')
            }
        },
        [ObjectType.OT_RPC]: {
            extension: '',
            loader: function (_f: File): void {
                throw new Error('Function not implemented.')
            }
        },
        [ObjectType.OT_DEMO]: {
            extension: '',
            loader: function (_f: File): void {
                throw new Error('Function not implemented.')
            }
        },
        [ObjectType.OT_TAB]: {
            extension: '',
            loader: function (_f: File): void {
                throw new Error('Function not implemented.')
            }
        },
        [ObjectType.OT_TXTBIN]: {
            extension: '',
            loader: function (_f: File): void {
                throw new Error('Function not implemented.')
            }
        },
        [ObjectType.OT_OFF]: {
            extension: '',
            loader: function (_f: File): void {
                throw new Error('Function not implemented.')
            }
        },
        [ObjectType.OT_CMP]: {
            extension: '',
            loader: function (_f: File): void {
                throw new Error('Function not implemented.')
            }
        },
        [ObjectType.OT_OBC]: {
            extension: '',
            loader: function (_f: File): void {
                throw new Error('Function not implemented.')
            }
        },
        [ObjectType.OT_SPL]: {
            extension: '',
            loader: function (_f: File): void {
                throw new Error('Function not implemented.')
            }
        }
    }
}

export { createObjectTypeMapping }
