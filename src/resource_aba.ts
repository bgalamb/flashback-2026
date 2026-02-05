import { File } from "./file"
import { FileSystem } from "./fs"
import { bytekiller_unpack } from "./unpack"

interface ResourceAbaEntry {
    name: string
    offset: number
    compressedSize: number
    size: number
}

interface LoadEntryResult {
    dat: Uint8Array | null
    size: number
}

class ResourceAba {
    static readonly FILENAME = 'DEMO_UK.ABA'
    static readonly TAG = 0x442E4D2E
    static readonly ENTRY_SIZE = 30
    static compareAbaEntry = (a: ResourceAbaEntry, b: ResourceAbaEntry) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())

    private readonly _fs: FileSystem
    private _f: File = new File()
    private _entries: ResourceAbaEntry[] | null = null
    private _entriesCount = 0

    constructor(fs: FileSystem) {
        this._fs = fs
    }

    async readEntries(): Promise<void> {
        if (!await this._f.open(ResourceAba.FILENAME, 'rb', this._fs)) {
            throw new Error(`Failed to open ${ResourceAba.FILENAME}`);
        }

        this._entriesCount = this._f.readUint16BE()
        if (this._entriesCount <= 0) {
            throw new Error(`Invalid entries count: ${this._entriesCount}`);
        }

        const entrySize = this._f.readUint16BE()
        if (entrySize !== ResourceAba.ENTRY_SIZE) {
            throw new Error(`Invalid entry size: ${entrySize}, expected ${ResourceAba.ENTRY_SIZE}`);
        }

        this._entries = new Array(this._entriesCount)
        let nextOffset = 0

        for (let i = 0; i < this._entriesCount; ++i) {
            const entry: ResourceAbaEntry = {
                name: this._f.readString(14),
                offset: this._f.readUint32BE(),
                compressedSize: this._f.readUint32BE(),
                size: this._f.readUint32BE(),
            }

            const tag = this._f.readUint32BE()
            if (tag !== ResourceAba.TAG) {
                throw new Error(`Invalid entry tag: ${tag.toString(16)}, expected ${ResourceAba.TAG.toString(16)}`);
            }

            if (i !== 0 && nextOffset !== entry.offset) {
                throw new Error(`Invalid offset at entry ${i}: ${entry.offset}, expected ${nextOffset}`);
            }

            this._entries[i] = entry
            nextOffset = entry.offset + entry.compressedSize
        }

        this._entries.sort(ResourceAba.compareAbaEntry)
    }

    findEntry(name: string): ResourceAbaEntry | null {
        if (!this._entries) {
            throw new Error('Entries not loaded. Call readEntries() first.');
        }
        return this._entries.find((entry: ResourceAbaEntry) => 
            entry.name.toLowerCase() === name.toLowerCase()) || null;
    }

    loadEntry(name: string): LoadEntryResult {
        const res: LoadEntryResult = {
            dat: null,
            size: 0,
        }

        if (!this._entries) {
            throw new Error('Entries not loaded. Call readEntries() first.');
        }

        const entry = this.findEntry(name)
        if (!entry) {
            return res
        }

        const tmp = new Uint8Array(entry.compressedSize)
        this._f.seek(entry.offset)
        this._f.read(tmp.buffer, entry.compressedSize)

        res.size = entry.size

        if (entry.compressedSize === entry.size) {
            res.dat = tmp
        } else {
            res.dat = new Uint8Array(entry.size)
            const success = bytekiller_unpack(res.dat, entry.size, tmp, entry.compressedSize)
            if (!success) {
                throw new Error(`Failed to decompress entry '${name}'`);
            }
        }

        return res
    }

    close(): void {
        this._f.close()
        this._entries = null
        this._entriesCount = 0
    }
}

export { ResourceAba, ResourceAbaEntry, LoadEntryResult }