import { FILE } from './file'

interface FileName {
    name: string
    dir: number
}

export class FileSystem_impl {
    _dirsList: string[]
    _dirsCount: number
    _filesCount: number

    constructor() {
        this._dirsList = []
        this._dirsCount = 0
        this._filesCount = 0
    }

}

export class FileSystem {
    _impl: FileSystem_impl
    constructor(dataPath?: string) {
        if (typeof dataPath !== 'undefined') {
            throw 'should call setRootDirectory!'
        }
        this._impl = new FileSystem_impl()
    }

}
