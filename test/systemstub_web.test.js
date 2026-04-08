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
    stub.processEvent({ type: 'keydown', key: 'Shift' })
    stub.processEvent({ type: 'keydown', key: 'Enter' })

    assert.equal(stub._pi.dirMask & dirLeft, dirLeft)
    assert.equal(stub._pi.shift, true)
    assert.equal(stub._pi.enter, true)

    stub.processEvent({ type: 'keyup', key: 'ArrowLeft' })
    stub.processEvent({ type: 'keyup', key: 'Shift' })
    stub.processEvent({ type: 'keyup', key: 'Enter' })

    assert.equal(stub._pi.dirMask & dirLeft, 0)
    assert.equal(stub._pi.shift, false)
    assert.equal(stub._pi.enter, false)
})
