import { File } from './file'
import { FileSystem } from './fs'
import { getCollisionOverrideEntryNames } from './entry-paths'

interface OpenedFileRef {
    file: File
    filename: string
}

function readFileData(file: File, entryName: string, offset: number = 0, seek: boolean = true, customLength?: number): Uint8Array {
    const len = customLength ?? (file.size() - offset)
    const data = new Uint8Array(len)
    if (offset > 0 && seek) {
        file.seek(offset)
    }
    file.read(data.buffer, len)
    if (file.ioErr()) {
        throw new Error(`I/O error when reading '${entryName}'`)
    }
    return data
}

async function openFirstExistingFile(fs: FileSystem, filenames: string[]): Promise<OpenedFileRef | null> {
    for (const filename of filenames) {
        const file = new File()
        if (await file.open(filename, 'rb', fs)) {
            return { file, filename }
        }
    }
    return null
}

async function loadFileDataByFileName(fs: FileSystem, filename: string): Promise<Uint8Array> {
    const opened = await openFirstExistingFile(fs, [filename])
    if (!opened) {
        throw new Error(`Failed to open '${filename}'`)
    }
    return readFileData(opened.file, opened.filename)
}

async function loadFileDataByCandidateNames(fs: FileSystem, filenames: string[]): Promise<{ data: Uint8Array, filename: string }> {
    const opened = await openFirstExistingFile(fs, filenames)
    if (!opened) {
        throw new Error(`Failed to open '${filenames[0]}'`)
    }
    return {
        data: readFileData(opened.file, opened.filename),
        filename: opened.filename
    }
}

async function tryLoadCollisionOverride(fs: FileSystem, levelName: string, collisionData: Int8Array): Promise<{ filename: string, size: number } | null> {
    const candidates = getCollisionOverrideEntryNames(levelName)
    for (const filename of candidates) {
        const file = new File()
        if (!await file.open(filename, 'rb', fs)) {
            continue
        }
        const size = file.size()
        if (size !== collisionData.byteLength) {
            file.close()
            continue
        }
        file.read(collisionData.buffer, collisionData.byteLength)
        const hasIoErr = file.ioErr()
        file.close()
        if (!hasIoErr) {
            return { filename, size }
        }
    }
    return null
}

export {
    loadFileDataByCandidateNames,
    loadFileDataByFileName,
    openFirstExistingFile,
    readFileData,
    tryLoadCollisionOverride,
}
