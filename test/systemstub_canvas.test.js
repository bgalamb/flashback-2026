require('ts-node/register/transpile-only')

const test = require('node:test')
const assert = require('node:assert/strict')

const { getCanvasDisplaySize } = require('../src/platform/systemstub-canvas.ts')

test('getCanvasDisplaySize keeps the original size when the viewport has enough room', () => {
    assert.deepEqual(getCanvasDisplaySize(1024, 896, 2000, 1600), {
        width: 1024,
        height: 896,
    })
})

test('getCanvasDisplaySize scales large hi-res rooms down to fit the viewport', () => {
    assert.deepEqual(getCanvasDisplaySize(1024, 896, 1280, 800), {
        width: 658,
        height: 576,
    })
})

test('getCanvasDisplaySize falls back to render dimensions when viewport metrics are unavailable', () => {
    assert.deepEqual(getCanvasDisplaySize(1024, 896, 0, 0), {
        width: 1024,
        height: 896,
    })
})
