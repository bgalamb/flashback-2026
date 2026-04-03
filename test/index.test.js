require('ts-node/register/transpile-only')

const test = require('node:test')
const assert = require('node:assert/strict')

const {
    bindPlayButton,
    createMain,
    getDebugConfigFromDocument,
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
            this._vid = { layers: { w: 320, h: 200 } }
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

test('debug controls are parsed from the document', () => {
    const fakeDocument = {
        querySelectorAll(selector) {
            assert.equal(selector, '[data-debug-flag]')
            return [
                { checked: true, dataset: { debugFlag: 'pge' } },
                { checked: false, dataset: { debugFlag: 'runtime' } },
                { checked: true, dataset: { debugFlag: 'storyText' } },
            ]
        },
        getElementById(id) {
            assert.equal(id, 'debug-start-frame')
            return { value: '12' }
        },
    }

    const result = getDebugConfigFromDocument(fakeDocument)

    assert.deepEqual(result, {
        debugFlags: {
            pge: true,
            storyText: true,
        },
        debugStartFrame: 12,
    })
})
