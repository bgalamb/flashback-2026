require('ts-node/register/transpile-only')

const test = require('node:test')
const assert = require('node:assert/strict')

const {
    bindPlayButton,
    bindRecordingControls,
    createMain,
    downloadInputRecording,
    updateRecordingStatus,
} = require('../src/index.ts')

test('main loads the game with the configured boot sequence', async () => {
    const calls = {
        setRootDirectory: [],
        gameConstructor: null,
        stubInit: null,
        runCount: 0,
    }

    class FakeStub {
        async init(...args) {
            calls.stubInit = args
        }
    }

    class FakeFileSystem {
        async setRootDirectory(path) {
            calls.setRootDirectory.push(path)
        }
    }

    class FakeGame {
        constructor(stub, fs, savePath, levelNum, autoSave) {
            this._vid = { _w: 320, _h: 200 }
            calls.gameConstructor = { stub, fs, savePath, levelNum, autoSave }
        }

        async run() {
            calls.runCount += 1
        }
    }

    const main = createMain({
        SystemStub: FakeStub,
        FileSystem: FakeFileSystem,
        Game: FakeGame,
    })

    await main({
        scaler: 'scale@4',
        datapath: '/tmp/game-data',
        savepath: '/tmp/save-data',
        levelnum: 2,
        fullscreen: true,
        autosave: true,
    })

    assert.deepEqual(calls.setRootDirectory, ['/tmp/game-data'])
    assert.equal(calls.gameConstructor.savePath, '/tmp/save-data')
    assert.equal(calls.gameConstructor.levelNum, 2)
    assert.equal(calls.gameConstructor.autoSave, true)
    assert.equal(calls.runCount, 1)
    assert.deepEqual(calls.stubInit, [
        'REminiscence',
        320,
        200,
        true,
        {
            name: 'scale@4',
            factor: 4,
            type: 2,
        },
    ])
})

test('clicking play reveals the game and starts boot', async () => {
    let clickHandler = null
    let startCount = 0

    const intro = { style: { display: '' } }
    const main = {
        classList: {
            added: [],
            add(value) {
                this.added.push(value)
            },
        },
    }

    const fakeDocument = {
        getElementById(id) {
            assert.equal(id, 'play')
            return {
                addEventListener(eventName, handler) {
                    assert.equal(eventName, 'click')
                    clickHandler = handler
                },
            }
        },
        querySelector(selector) {
            if (selector === '.intro') {
                return intro
            }
            if (selector === '.main') {
                return main
            }
            return null
        },
    }

    bindPlayButton(fakeDocument, async () => {
        startCount += 1
    })

    assert.ok(clickHandler, 'expected play button click handler to be registered')

    await clickHandler()

    assert.equal(intro.style.display, 'none')
    assert.deepEqual(main.classList.added, ['visible'])
    assert.equal(startCount, 1)
})

test('recording controls toggle status and download JSON when stopped', () => {
    let clickHandler = null
    let startCount = 0
    let stopCount = 0
    let downloadedRecording = null

    const recordButton = {
        textContent: 'Start Recording',
        addEventListener(eventName, handler) {
            assert.equal(eventName, 'click')
            clickHandler = handler
        },
    }
    const recordStatus = {
        textContent: '',
        attributes: {},
        setAttribute(name, value) {
            this.attributes[name] = value
        },
    }

    const fakeDocument = {
        getElementById(id) {
            if (id === 'record-input') {
                return recordButton
            }
            if (id === 'recording-status') {
                return recordStatus
            }
            return null
        },
        createElement() {
            return null
        },
    }

    bindRecordingControls(
        fakeDocument,
        () => ({
            start() {
                startCount += 1
            },
            stop() {
                stopCount += 1
                return {
                    version: 1,
                    events: [{ type: 'keydown', key: 'ArrowRight', offsetMs: 0 }],
                }
            },
            get() {
                return null
            },
        }),
        (recording) => {
            downloadedRecording = recording
        }
    )

    assert.ok(clickHandler, 'expected record button click handler to be registered')
    assert.equal(recordStatus.textContent, 'Recording Status: Idle - Ready')

    clickHandler()

    assert.equal(startCount, 1)
    assert.equal(recordButton.textContent, 'Stop Recording')
    assert.equal(recordStatus.textContent, 'Recording Status: Recording - Capturing input')
    assert.equal(recordStatus.attributes['data-recording'], 'true')

    clickHandler()

    assert.equal(stopCount, 1)
    assert.equal(recordButton.textContent, 'Start Recording')
    assert.equal(recordStatus.textContent, 'Recording Status: Idle - Saved')
    assert.equal(recordStatus.attributes['data-recording'], 'false')
    assert.deepEqual(downloadedRecording, {
        version: 1,
        events: [{ type: 'keydown', key: 'ArrowRight', offsetMs: 0 }],
    })
})

test('downloadInputRecording writes a JSON blob to a downloadable link', () => {
    let clicked = false
    let createdBlob = null
    let revokedUrl = null
    const link = {
        href: '',
        download: '',
        click() {
            clicked = true
        },
    }

    const fakeWindow = {
        Blob: class {
            constructor(parts, options) {
                createdBlob = { parts, options }
            }
        },
        URL: {
            createObjectURL() {
                return 'blob:test-url'
            },
            revokeObjectURL(url) {
                revokedUrl = url
            },
        },
    }

    const fakeDocument = {
        createElement(tagName) {
            assert.equal(tagName, 'a')
            return link
        },
    }

    downloadInputRecording({ version: 1, events: [] }, fakeWindow, fakeDocument)

    assert.equal(link.href, 'blob:test-url')
    assert.match(link.download, /^flashback-input-recording-.*\.json$/)
    assert.equal(clicked, true)
    assert.equal(revokedUrl, 'blob:test-url')
    assert.deepEqual(createdBlob, {
        parts: ['{\n  "version": 1,\n  "events": []\n}'],
        options: { type: 'application/json' },
    })
})

test('updateRecordingStatus reflects the current state in the label', () => {
    const statusElement = {
        textContent: '',
        attributes: {},
        setAttribute(name, value) {
            this.attributes[name] = value
        },
    }

    updateRecordingStatus(statusElement, true, 'Capturing input')
    assert.equal(statusElement.textContent, 'Recording Status: Recording - Capturing input')
    assert.equal(statusElement.attributes['data-recording'], 'true')

    updateRecordingStatus(statusElement, false, 'Saved')
    assert.equal(statusElement.textContent, 'Recording Status: Idle - Saved')
    assert.equal(statusElement.attributes['data-recording'], 'false')
})
