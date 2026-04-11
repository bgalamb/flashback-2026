require('ts-node/register/transpile-only')

const test = require('node:test')
const assert = require('node:assert/strict')

const {
    SystemStub,
    dirRight,
    dirLeft,
} = require('../src/platform/systemstub_web.ts')

const createPlayerInput = () => ({
    dirMask: 0,
    enter: false,
    space: false,
    shift: false,
    backspace: false,
    escape: false,
    lastChar: '',
    save: false,
    load: false,
    stateSlot: 0,
    rewind: false,
    dbgMask: 0,
    quit: false,
})

const createStubWithoutBrowserBoot = () => {
    class FakeAudioContext {
        constructor() {
            this.sampleRate = 48000
            this.state = 'running'
            this.audioWorklet = {
                addModule: async () => {},
            }
            this.destination = {}
        }

        resume() {}
    }

    global.window = { AudioContext: FakeAudioContext }

    const stub = new SystemStub()
    stub._events = []
    stub._pi = createPlayerInput()
    return stub
}

test('queued keyboard events update movement input so the game can be played', async () => {
    const stub = createStubWithoutBrowserBoot()
    let prevented = false

    stub.onKbEvent({
        type: 'keydown',
        key: 'ArrowRight',
        metaKey: false,
        ctrlKey: false,
        preventDefault() {
            prevented = true
        },
    })

    assert.equal(prevented, true)
    assert.equal(stub._events.length, 1)

    await stub.processEvents()

    assert.equal(stub._pi.dirMask & dirRight, dirRight)

    stub.processEvent({ type: 'keyup', key: 'ArrowRight' })

    assert.equal(stub._pi.dirMask & dirRight, 0)
})

test('action keys are tracked alongside movement input', () => {
    const stub = createStubWithoutBrowserBoot()

    stub.processEvent({ type: 'keydown', key: 'ArrowLeft' })
    stub.processEvent({ type: 'keydown', key: ' ' })
    stub.processEvent({ type: 'keydown', key: 'Shift' })
    stub.processEvent({ type: 'keydown', key: 'Enter' })

    assert.equal(stub._pi.dirMask & dirLeft, dirLeft)
    assert.equal(stub._pi.space, true)
    assert.equal(stub._pi.shift, true)
    assert.equal(stub._pi.enter, true)

    stub.processEvent({ type: 'keyup', key: 'ArrowLeft' })
    stub.processEvent({ type: 'keyup', key: ' ' })
    stub.processEvent({ type: 'keyup', key: 'Shift' })
    stub.processEvent({ type: 'keyup', key: 'Enter' })

    assert.equal(stub._pi.dirMask & dirLeft, 0)
    assert.equal(stub._pi.space, false)
    assert.equal(stub._pi.shift, false)
    assert.equal(stub._pi.enter, false)
})

test('space input accepts alternate browser key names', () => {
    const stub = createStubWithoutBrowserBoot()

    stub.processEvent({ type: 'keydown', key: 'Space' })
    assert.equal(stub._pi.space, true)

    stub.processEvent({ type: 'keyup', key: 'Space' })
    assert.equal(stub._pi.space, false)

    stub.processEvent({ type: 'keydown', key: 'Spacebar' })
    assert.equal(stub._pi.space, true)

    stub.processEvent({ type: 'keyup', key: 'Spacebar' })
    assert.equal(stub._pi.space, false)
})

test('control shortcuts map to rewind and save-state actions', () => {
    const stub = createStubWithoutBrowserBoot()

    stub.processEvent({ type: 'keydown', key: 'r', ctrlKey: true })
    stub.processEvent({ type: 'keydown', key: 's', ctrlKey: true })
    stub.processEvent({ type: 'keydown', key: 'l', ctrlKey: true })
    stub.processEvent({ type: 'keydown', key: 'PageUp', ctrlKey: true })

    assert.equal(stub._pi.rewind, true)
    assert.equal(stub._pi.save, true)
    assert.equal(stub._pi.load, true)
    assert.equal(stub._pi.stateSlot, 1)
    assert.equal(stub._pi.dirMask & dirLeft, 0)
})

test('queued Ctrl+R is prevented from reaching the browser and sets rewind', async () => {
    const stub = createStubWithoutBrowserBoot()
    let prevented = false

    stub.onKbEvent({
        type: 'keydown',
        key: 'r',
        metaKey: false,
        ctrlKey: true,
        preventDefault() {
            prevented = true
        },
    })

    assert.equal(prevented, true)

    await stub.processEvents()

    assert.equal(stub._pi.rewind, true)
})

test('Ctrl+R also works when the browser reports code=KeyR', () => {
    const stub = createStubWithoutBrowserBoot()

    stub.processEvent({ type: 'keydown', key: 'Dead', code: 'KeyR', ctrlKey: true })

    assert.equal(stub._pi.rewind, true)
})

test('plain R also triggers rewind as a fallback', () => {
    const stub = createStubWithoutBrowserBoot()

    stub.processEvent({ type: 'keydown', key: 'r' })

    assert.equal(stub._pi.rewind, true)
})
