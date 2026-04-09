require('ts-node/register/transpile-only')

const test = require('node:test')
const assert = require('node:assert/strict')

const { Resource, LocaleData } = require('../src/resource/resource.ts')
const { numSprites } = require('../src/resource/constants.ts')

function createResource() {
    return new Resource({
        findPath(filename) {
            return filename
        },
    })
}

function installFetch(fixtures) {
    const originalFetch = global.fetch
    global.fetch = async (path) => {
        const data = fixtures[path]
        if (!data) {
            throw new Error(`missing fixture: ${path}`)
        }
        return {
            async arrayBuffer() {
                return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
            },
        }
    }
    return () => {
        global.fetch = originalFetch
    }
}

test('resource decodes parsed PGE, OBJ, and TBN payloads into runtime structures', () => {
    const resource = createResource()

    resource.decodeParsedPge(JSON.stringify({
        pgeNum: 1,
        pgeInit: [{
            type: 7,
            posX: 11,
            posY: 22,
            objNodeNumber: 3,
            life: 9,
            counterValues: [1, 2, 3, 4],
            objectType: 10,
            initRoom: 5,
            roomLocation: 6,
            initFlags: 7,
            collidingIconNum: 8,
            iconNum: 9,
            objectId: 10,
            skill: 1,
            mirrorX: 1,
            flags: 2,
            numberOfCollisionSegments: 3,
            textNum: 44,
        }],
    }))
    resource.decodeParsedObj(JSON.stringify({
        numObjectNodes: 1,
        objectNodesMap: [{
            lastObjNumber: 1,
            numObjects: 2,
            objects: [
                {
                    type: 7,
                    dx: 1,
                    dy: -2,
                    initObjType: 8,
                    opcode1: 1,
                    opcode2: 2,
                    flags: 3,
                    opcode3: 4,
                    initObjNumber: 5,
                    opcodeArg1: 6,
                    opcodeArg2: 7,
                    opcodeArg3: 8,
                },
                {
                    type: 8,
                    dx: 0,
                    dy: 0,
                    initObjType: 8,
                    opcode1: 0,
                    opcode2: 0,
                    flags: 0,
                    opcode3: 0,
                    initObjNumber: 0,
                    opcodeArg1: 0,
                    opcodeArg2: 0,
                    opcodeArg3: 0,
                },
            ],
        }],
    }))
    resource.decodeParsedTbn(JSON.stringify({
        texts: ['HELLO', 'WORLD'],
    }))

    assert.equal(resource.level.pgeTotalNumInFile, 1)
    assert.equal(resource.level.pgeAllInitialStateFromFile[0].scriptNodeIndex, 3)
    assert.deepEqual(resource.level.pgeAllInitialStateFromFile[0].counterValues, [1, 2, 3, 4])
    assert.equal(resource.level.objectNodesMap[0].objects[0].opcodeArg3, 8)
    assert.deepEqual(Array.from(resource.level.tbn[0]), [72, 69, 76, 76, 79, 0])
})

test('resource string and animation lookups return the expected views', () => {
    const resource = createResource()
    resource.level.ani = Uint8Array.from([
        0, 0,
        4, 0,
        0, 0, 0xAA, 0xBB,
    ])
    resource.level.tbn = [Uint8Array.from([65, 0]), Uint8Array.from([66, 0])]
    resource.text.stringsTable = Uint8Array.from([
        4, 0,
        8, 0,
        72, 73, 0,
        66, 89, 69, 0,
    ])
    resource.text.textsTable = ['A', 'B', 'C']

    assert.deepEqual(Array.from(resource.getAniData(0)), [0xAA, 0xBB])
    assert.deepEqual(Array.from(resource.getTextString(0, 1)), [66, 0])
    assert.deepEqual(Array.from(resource.getGameString(1).slice(0, 3)), [89, 69, 0])
    assert.equal(resource.getMenuString(1), 'B')
    assert.equal(resource.getMenuString(LocaleData.Id.liNum), '')
})

test('resource initializes Conrad visuals from the shared resolved sprite set', () => {
    const resource = createResource()
    resource.sprites.resolvedSpriteSet = {
        spritesByIndex: [Uint8Array.from([1, 2, 3])],
    }

    resource.initializeConradVisuals()

    assert.equal(resource.sprites.loadedConradVisualsByVariantId.size, 2)
    const variant = resource.sprites.loadedConradVisualsByVariantId.get(1)
    assert.equal(variant.paletteSlot, 4)
    assert.equal(variant.resolvedSpriteSet, resource.sprites.resolvedSpriteSet)
})

test('resource clears bank data bookkeeping and can find loaded bank entries', () => {
    const resource = createResource()
    resource.bank.bankBuffersCount = 2
    resource.bank.bankBuffers[0].entryNum = 4
    resource.bank.bankBuffers[0].ptr = Uint8Array.from([1, 2])
    resource.bank.bankBuffers[1].entryNum = 8
    resource.bank.bankBuffers[1].ptr = Uint8Array.from([3, 4])

    assert.deepEqual(Array.from(resource.findBankData(8)), [3, 4])

    resource.clearBankData()

    assert.equal(resource.bank.bankBuffersCount, 0)
    assert.equal(resource.bank.bankDataHead, resource.bank.bankData)
    assert.equal(resource.findBankData(8), null)
})

test('resource clears level-scoped assets and frees object nodes', () => {
    const resource = createResource()
    const sharedNode = {
        lastObjNumber: 0,
        numObjects: 1,
        objects: [{}],
    }
    resource.level.numObjectNodes = 2
    resource.level.objectNodesMap = [sharedNode, sharedNode]
    resource.level.tbn = [Uint8Array.from([1])]
    resource.level.mbk = Uint8Array.from([1])
    resource.level.pal = Uint8Array.from([2])
    resource.level.bnq = Uint8Array.from([3])
    resource.level.ani = Uint8Array.from([4])

    resource.clearLevelAllResources()

    assert.deepEqual(resource.level.tbn, [])
    assert.equal(resource.level.mbk, null)
    assert.equal(resource.level.pal, null)
    assert.equal(resource.level.bnq, null)
    assert.equal(resource.level.ani, null)
    assert.equal(sharedNode.objects.length, 0)
    assert.deepEqual(resource.level.objectNodesMap, [null, null])
})

test('resource loads monster sprite offsets into resolved sprite views', async () => {
    const resource = createResource()
    const spritePayload = Uint8Array.from([
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        9, 8, 7,
        6, 5, 4,
    ])
    const offPayload = Uint8Array.from([
        0, 0, 0, 0, 0, 0,
        1, 0, 3, 0, 0, 0,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
    ])
    const restoreFetch = installFetch({
        'monster.SPR': spritePayload,
        'monster.OFF': offPayload,
    })

    try {
        const resolved = await resource.loadMonsterResolvedSpriteSet('monster')

        assert.equal(resolved.spritesByIndex.length, numSprites)
        assert.deepEqual(Array.from(resolved.spritesByIndex[0].slice(0, 3)), [9, 8, 7])
        assert.deepEqual(Array.from(resolved.spritesByIndex[1].slice(0, 3)), [6, 5, 4])
        assert.equal(resolved.spritesByIndex[2], null)
    } finally {
        restoreFetch()
    }
})

test('resource loads sound effects from the exported manifest and pcm files', async () => {
    const resource = createResource()
    const manifest = Buffer.from(JSON.stringify({
        source: 'global.fib',
        numSfx: 3,
        soundEffects: [
            {
                index: 0,
                offset: 123,
                encodedLength: 4,
                decodedLength: 7,
                freq: 6000,
                peak: 127,
                file: 'sound_effects/pcm_s8_files/output_0.pcm_u8',
            },
            {
                index: 1,
                offset: 456,
                encodedLength: 0,
                decodedLength: 0,
                freq: 6000,
                peak: 0,
                file: null,
            },
            {
                index: 2,
                offset: 789,
                encodedLength: 3,
                decodedLength: 5,
                freq: 6000,
                peak: 42,
                file: 'sound_effects/pcm_s8_files/output_2.pcm_u8',
            },
        ],
    }))
    const restoreFetch = installFetch({
        'sound_effects/global.fib.json': manifest,
        'sound_effects/pcm_s8_files/output_0.pcm_u8': Uint8Array.from([0x80, 0x81, 0x7F, 0x00, 0x01, 0xFE, 0x02]),
        'sound_effects/pcm_s8_files/output_2.pcm_u8': Uint8Array.from([1, 2, 3, 4, 5]),
    })

    try {
        await resource.loadSoundEffects('GLOBAL')

        assert.equal(resource.audio.numSfx, 3)
        assert.equal(resource.audio.sfxList[0].offset, 123)
        assert.equal(resource.audio.sfxList[0].len, 7)
        assert.equal(resource.audio.sfxList[0].freq, 6000)
        assert.equal(resource.audio.sfxList[0].peak, 127)
        assert.deepEqual(Array.from(resource.audio.sfxList[0].data), [0x80, 0x81, 0x7F, 0x00, 0x01, 0xFE, 0x02])
        assert.equal(resource.audio.sfxList[1].data, null)
        assert.equal(resource.audio.sfxList[1].len, 0)
        assert.deepEqual(Array.from(resource.audio.sfxList[2].data), [1, 2, 3, 4, 5])
    } finally {
        restoreFetch()
    }
})
