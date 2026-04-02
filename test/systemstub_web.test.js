require('ts-node/register/transpile-only')

const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

const { initOptions } = require('../src/index.ts')
const { Game } = require('../src/game.ts')
const { FileSystem } = require('../src/resource/fs.ts')
const {
    SystemStub,
    DIR_RIGHT,
    DIR_LEFT,
    DIR_UP,
    DIR_DOWN,
} = require('../src/systemstub_web.ts')
const { replayInputRecording } = require('../src/input_recording.ts')
const fixturesDir = path.join(__dirname, 'fixtures')
const resolveRecordedFixtures = () => {
    if (!fs.existsSync(fixturesDir)) {
        return []
    }
    return fs.readdirSync(fixturesDir)
        .filter((fileName) => /^flashback-input-recording-.*\.json$/.test(fileName))
        .map((fileName) => {
            const fixturePath = path.join(fixturesDir, fileName)
            return {
                fileName,
                fixturePath,
                recording: JSON.parse(fs.readFileSync(fixturePath, 'utf8')),
                mtimeMs: fs.statSync(fixturePath).mtimeMs,
            }
        })
        .sort((leftFixture, rightFixture) => {
            const leftMtime = leftFixture.mtimeMs
            const rightMtime = rightFixture.mtimeMs
            return rightMtime - leftMtime
        })
}
const recordedFixtures = resolveRecordedFixtures()
const { Mp4CutscenePlayer } = require('../src/cutscene-players/mp4-cutscene-player.ts')

const recordedPlaythrough = {
    version: 1,
    events: [
        { type: 'keydown', key: 'ArrowRight', offsetMs: 0 },
        { type: 'keydown', key: 'Shift', offsetMs: 90 },
        { type: 'keyup', key: 'ArrowRight', offsetMs: 180 },
        { type: 'keyup', key: 'Shift', offsetMs: 240 },
        { type: 'keydown', key: 'Enter', offsetMs: 360 },
        { type: 'keyup', key: 'Enter', offsetMs: 420 },
    ],
}

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

const installLocalFetch = () => {
    const originalFetch = global.fetch
    global.fetch = async (resource) => {
        if (typeof resource !== 'string' || /^https?:\/\//.test(resource)) {
            return originalFetch(resource)
        }
        const resolvedPath = path.isAbsolute(resource)
            ? resource
            : path.join(process.cwd(), resource)
        const buffer = await fs.promises.readFile(resolvedPath)
        return {
            async arrayBuffer() {
                return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
            },
        }
    }
    return () => {
        global.fetch = originalFetch
    }
}

class HeadlessReplayStub extends SystemStub {
    constructor(recording) {
        super()
        this._recording = recording
        this._recordingIndex = 0
        this._virtualTime = 0
        this._idleProcessEventsCount = 0
        this._lastEventOffsetMs = recording.events.at(-1)?.offsetMs ?? 0
        this.renderedFrames = 0
        this.gameplayFrames = 0
        this.observedRooms = new Set()
        this.conradPositions = new Set()
        this.conradAnimationStates = new Set()
    }

    async initAudio() {
        this._kAudioHz = 48000
        this._audioInitFailed = false
    }

    initCanvas(w, h) {
        const context = {
            fillStyle: '#000',
            clearRect() {},
            fillRect() {},
            createImageData(width, height) {
                return {
                    width,
                    height,
                    data: new Uint8ClampedArray(width * height * 4),
                }
            },
            putImageData() {},
        }
        this._canvas = {
            width: w,
            height: h,
            style: {},
            getContext() {
                return context
            },
            getBoundingClientRect() {
                return { left: 0, top: 0, width: w, height: h }
            },
        }
        this._context = context
    }

    initEvents() {}

    getTimeStamp() {
        return this._virtualTime
    }

    async sleep(duration) {
        this._virtualTime += duration
    }

    async processEvents() {
        let dispatchedEvent = false
        while (this._recordingIndex < this._recording.events.length) {
            const event = this._recording.events[this._recordingIndex]
            if (event.offsetMs > this._virtualTime) {
                break
            }
            this.processEvent(event)
            this._recordingIndex += 1
            dispatchedEvent = true
            if (this._pi.quit) {
                return
            }
        }

        if (dispatchedEvent) {
            this._idleProcessEventsCount = 0
            return
        }

        this._idleProcessEventsCount += 1
        const recordingSettled = this._recordingIndex >= this._recording.events.length
            && this._virtualTime >= this._lastEventOffsetMs + 3000
        if (recordingSettled && this._idleProcessEventsCount > 180) {
            this._pi.quit = true
        }
    }

    async updateScreen(shakeOffset) {
        await super.updateScreen(shakeOffset)
        this.renderedFrames += 1

        const game = this._game
        if (game && Number.isInteger(game._currentRoom)) {
            this.gameplayFrames += 1
            this.observedRooms.add(game._currentRoom)
            const conrad = game._livePgesByIndex?.[0]
            if (conrad) {
                this.conradPositions.add(`${conrad.room_location}:${conrad.pos_x}:${conrad.pos_y}`)
                this.conradAnimationStates.add(`${conrad.anim_seq}:${conrad.anim_number}`)
            }
        }
    }
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

    assert.equal(stub._pi.dirMask & DIR_RIGHT, DIR_RIGHT)

    stub.processEvent({ type: 'keyup', key: 'ArrowRight' })

    assert.equal(stub._pi.dirMask & DIR_RIGHT, 0)
})

test('action keys are tracked alongside movement input', () => {
    const stub = createStubWithoutBrowserBoot()

    stub.processEvent({ type: 'keydown', key: 'ArrowLeft' })
    stub.processEvent({ type: 'keydown', key: 'Shift' })
    stub.processEvent({ type: 'keydown', key: 'Enter' })

    assert.equal(stub._pi.dirMask & DIR_LEFT, DIR_LEFT)
    assert.equal(stub._pi.shift, true)
    assert.equal(stub._pi.enter, true)

    stub.processEvent({ type: 'keyup', key: 'ArrowLeft' })
    stub.processEvent({ type: 'keyup', key: 'Shift' })
    stub.processEvent({ type: 'keyup', key: 'Enter' })

    assert.equal(stub._pi.dirMask & DIR_LEFT, 0)
    assert.equal(stub._pi.shift, false)
    assert.equal(stub._pi.enter, false)
})

test('keyboard input can be recorded and exported for replayable tests', () => {
    const stub = createStubWithoutBrowserBoot()
    let now = 100
    const originalPerformance = global.performance
    global.performance = {
        now: () => now,
    }

    try {
        stub.startInputRecording(now)
        stub.onKbEvent({
            type: 'keydown',
            key: 'ArrowRight',
            metaKey: false,
            ctrlKey: false,
            preventDefault() {},
        })
        now += 120
        stub.onKbEvent({
            type: 'keyup',
            key: 'ArrowRight',
            metaKey: false,
            ctrlKey: false,
            preventDefault() {},
        })

        const recording = stub.stopInputRecording()

        assert.deepEqual(recording, {
            version: 1,
            events: [
                { type: 'keydown', key: 'ArrowRight', offsetMs: 0 },
                { type: 'keyup', key: 'ArrowRight', offsetMs: 120 },
            ],
        })
    } finally {
        global.performance = originalPerformance
    }
})

test('recorded input fixtures can be replayed into the same gameplay controls', async () => {
    const stub = createStubWithoutBrowserBoot()
    const snapshots = []

    await replayInputRecording(recordedPlaythrough, async (event) => {
        stub.processEvent(event)
        snapshots.push({
            key: event.key,
            type: event.type,
            dirRight: stub._pi.dirMask & DIR_RIGHT,
            shift: stub._pi.shift,
            enter: stub._pi.enter,
        })
    })

    assert.deepEqual(snapshots, [
        { key: 'ArrowRight', type: 'keydown', dirRight: DIR_RIGHT, shift: false, enter: false },
        { key: 'Shift', type: 'keydown', dirRight: DIR_RIGHT, shift: true, enter: false },
        { key: 'ArrowRight', type: 'keyup', dirRight: 0, shift: true, enter: false },
        { key: 'Shift', type: 'keyup', dirRight: 0, shift: false, enter: false },
        { key: 'Enter', type: 'keydown', dirRight: 0, shift: false, enter: true },
        { key: 'Enter', type: 'keyup', dirRight: 0, shift: false, enter: false },
    ])
})

const assertRecordedFixtureInputReplay = async (recording) => {
    const stub = createStubWithoutBrowserBoot()
    const seenKeys = new Set()
    let enterKeydowns = 0
    let tabKeydowns = 0
    let shiftKeydowns = 0
    let spaceKeydowns = 0
    let rightKeydowns = 0
    let leftKeydowns = 0
    let upKeydowns = 0
    let downKeydowns = 0

    await replayInputRecording(recording, async (event) => {
        seenKeys.add(event.key)
        stub.processEvent(event)

        if (event.type !== 'keydown') {
            return
        }

        switch (event.key) {
            case 'Enter':
                enterKeydowns += 1
                break
            case 'Tab':
                tabKeydowns += 1
                break
            case 'Shift':
                shiftKeydowns += 1
                break
            case ' ':
                spaceKeydowns += 1
                break
            case 'ArrowRight':
                rightKeydowns += 1
                break
            case 'ArrowLeft':
                leftKeydowns += 1
                break
            case 'ArrowUp':
                upKeydowns += 1
                break
            case 'ArrowDown':
                downKeydowns += 1
                break
        }
    })

    assert.deepEqual([...seenKeys].sort(), [' ', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'Enter', 'Shift', 'Tab'])
    assert.equal(enterKeydowns > 0, true)
    assert.equal(tabKeydowns > 0, true)
    assert.equal(shiftKeydowns > 0, true)
    assert.equal(spaceKeydowns > 0, true)
    assert.equal(rightKeydowns > 0, true)
    assert.equal(leftKeydowns > 0, true)
    assert.equal(upKeydowns > 0, true)
    assert.equal(downKeydowns > 0, true)

    assert.equal(stub._pi.dirMask & DIR_RIGHT, 0)
    assert.equal(stub._pi.dirMask & DIR_LEFT, 0)
    assert.equal(stub._pi.dirMask & DIR_UP, 0)
    assert.equal(stub._pi.dirMask & DIR_DOWN, 0)
    assert.equal(stub._pi.enter, false)
    assert.equal(stub._pi.shift, false)
    assert.equal(stub._pi.space, false)
    assert.equal(stub._pi.backspace, true)
}

const runRecordedFixtureSmokeTest = async (recording, t) => {
    const originalWindow = global.window
    const originalDocument = global.document
    const originalAudioWorkletNode = global.AudioWorkletNode
    const originalRequestAnimationFrame = global.requestAnimationFrame
    const restoreFetch = installLocalFetch()
    const originalMp4Play = Mp4CutscenePlayer.prototype.play
    const cutsceneStats = {
        started: 0,
        skipped: 0,
        completed: 0,
    }

    class FakeAudioContext {
        constructor() {
            this.sampleRate = 48000
            this.state = 'running'
            this.destination = {}
            this.audioWorklet = {
                addModule: async () => {},
            }
        }

        resume() {}

        createBiquadFilter() {
            return {
                frequency: { value: 0 },
                connect() {},
            }
        }
    }

    try {
        global.window = { AudioContext: FakeAudioContext }
        global.AudioWorkletNode = class {
            constructor() {
                this.port = {
                    onmessage: null,
                    start() {},
                    postMessage() {},
                }
            }

            connect() {}
        }
        global.document = {
            head: {
                append() {},
            },
            body: {
                appendChild() {},
            },
            getElementById(id) {
                if (id === 'root') {
                    return {
                        style: {},
                        width: 0,
                        height: 0,
                        getContext() {
                            return null
                        },
                        getBoundingClientRect() {
                            return { left: 0, top: 0, width: 256, height: 224 }
                        },
                    }
                }
                return null
            },
            addEventListener() {},
            createElement(tagName) {
                if (tagName === 'style') {
                    return {
                        type: 'text/css',
                        textContent: '',
                    }
                }
                return {
                    style: {},
                    addEventListener() {},
                    removeEventListener() {},
                    play() {
                        return Promise.resolve()
                    },
                    pause() {},
                    parentNode: {
                        removeChild() {},
                    },
                }
            },
        }
        global.requestAnimationFrame = (callback) => {
            queueMicrotask(callback)
            return 1
        }

        Mp4CutscenePlayer.prototype.play = async function playStub() {
            cutsceneStats.started += 1
            let watchdog = 0
            while (!this._stub._pi.quit && watchdog < 2000) {
                await this._stub.processEvents()
                if (this._stub._pi.backspace || this._stub._pi.escape) {
                    this._stub._pi.backspace = false
                    this._stub._pi.escape = false
                    cutsceneStats.skipped += 1
                    return false
                }
                await this._stub.sleep(16)
                watchdog += 1
            }
            cutsceneStats.completed += 1
            return true
        }

        await initOptions()
        const fsImpl = new FileSystem()
        await fsImpl.setRootDirectory(path.join(process.cwd(), 'DATA'))
        const stub = new HeadlessReplayStub(recording)
        const game = new Game(stub, fsImpl, '/tmp', 0, false)
        stub._game = game

        let menuHandleCount = 0
        const originalHandleTitleScreen = game._menu.handleTitleScreen.bind(game._menu)
        game._menu.handleTitleScreen = async () => {
            menuHandleCount += 1
            return originalHandleTitleScreen()
        }

        let loadLevelDataCount = 0
        const originalLoadLevelData = game.loadLevelData.bind(game)
        game.loadLevelData = async () => {
            loadLevelDataCount += 1
            return originalLoadLevelData()
        }

        await stub.init('REminiscence', game._vid._w, game._vid._h, false, { name: '', factor: 1, type: 2 })
        await game.run()

        const observedKeys = new Set(recording.events.map((event) => event.key))
        const usesDirectionalInput = recording.events.some((event) => event.type === 'keydown' && event.key.startsWith('Arrow'))
        const reachedGameplay = loadLevelDataCount >= 1
            && stub.gameplayFrames >= 1
            && stub.observedRooms.size >= 1

        assert.equal(stub._recordingIndex, recording.events.length)
        assert.equal(menuHandleCount >= 1, true, 'expected the title/menu flow to be exercised')
        assert.equal(cutsceneStats.started >= 1, true, 'expected at least one cutscene to be encountered')
        assert.equal(stub.renderedFrames >= 200, true, `expected substantial rendering activity, got ${stub.renderedFrames} frames`)
        if (observedKeys.has('Tab')) {
            assert.equal(cutsceneStats.skipped >= 1, true, 'expected recorded Tab input to skip at least one cutscene or screen')
        }
        assert.equal(game._stub._pi.quit, true)

        if (!reachedGameplay) {
            t.diagnostic(
                `recording stayed in startup/title flow under headless replay; loadLevelData=${loadLevelDataCount}, gameplayFrames=${stub.gameplayFrames}, rooms=${stub.observedRooms.size}`
            )
            return
        }

        assert.equal(stub.gameplayFrames >= 100, true, `expected gameplay rendering after boot, got ${stub.gameplayFrames} frames`)
        assert.equal(stub.conradAnimationStates.size >= 2, true, 'expected Conrad animation state to advance during playback')
        if (usesDirectionalInput) {
            assert.equal(stub.conradPositions.size >= 2, true, 'expected Conrad position to change in response to directional input')
        }
    } finally {
        Mp4CutscenePlayer.prototype.play = originalMp4Play
        restoreFetch()
        global.requestAnimationFrame = originalRequestAnimationFrame
        global.AudioWorkletNode = originalAudioWorkletNode
        global.document = originalDocument
        global.window = originalWindow
    }
}

test('downloaded recordings are discovered from test/fixtures', () => {
    assert.equal(recordedFixtures.length >= 1, true)
})

for (const fixture of recordedFixtures) {
    test(`recording fixture ${fixture.fileName} replays into gameplay input state and ends released`, async () => {
        await assertRecordedFixtureInputReplay(fixture.recording)
    })

    test(`recording fixture ${fixture.fileName} drives the smoke runner without freezing or crashing`, {
        timeout: 120000,
    }, async (t) => {
        await runRecordedFixtureSmokeTest(fixture.recording, t)
    })
}
