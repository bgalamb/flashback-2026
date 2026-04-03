import type { SystemStub } from '../platform/systemstub_web'
import { screenblockH, screenblockW } from '../core/game_constants'
import type { VideoLayerState, VideoScreenState } from './video-state'

function markScreenBlockAsDirty(layers: VideoLayerState, screen: VideoScreenState, x: number, y: number, w: number, h: number, scale: number) {
    let bx1 = (scale * x / screenblockW) >> 0
    let by1 = (scale * y / screenblockH) >> 0
    let bx2 = (scale * (x + w - 1) / screenblockW) >> 0
    let by2 = (scale * (y + h - 1) / screenblockH) >> 0
    if (bx1 < 0) {
        bx1 = 0
    }
    if (bx2 > ((layers.w / screenblockW) >> 0) - 1) {
        bx2 = ((layers.w / screenblockW) >> 0) - 1
    }
    if (by1 < 0) {
        by1 = 0
    }
    if (by2 > ((layers.h / screenblockH) >> 0) - 1) {
        by2 = (((layers.h / screenblockH) >> 0) - 1) >> 0
    }
    for (; by1 <= by2; ++by1) {
        for (let i = bx1; i <= bx2; ++i) {
            screen.screenBlocks[by1 * ((layers.w / screenblockW) >> 0) + i] = 2
        }
    }
}

function requestFullRefresh(screen: VideoScreenState, layers: VideoLayerState) {
    screen.fullRefresh = true
    screen.screenBlocks.fill(0, (layers.w / screenblockW) * (layers.h / screenblockH))
}

async function updateVideoScreen(stub: SystemStub, layers: VideoLayerState, screen: VideoScreenState) {
    if (screen.fullRefresh) {
        stub.copyRect(0, 0, layers.w, layers.h, layers.frontLayer, layers.w)
        await stub.updateScreen(screen.shakeOffset)
        screen.fullRefresh = false
    } else {
        let i, j: number
        let count = 0
        const p = screen.screenBlocks
        let index = 0
        for (j = 0; j < layers.h / screenblockH; ++j) {
            let nh = 0
            for (i = 0; i < layers.w / screenblockW; ++i) {
                if (p[i + index] !== 0) {
                    --p[i + index]
                    ++nh
                } else if (nh !== 0) {
                    const x = (i - nh) * screenblockW
                    stub.copyRect(x, j * screenblockH, nh * screenblockW, screenblockH, layers.frontLayer, layers.w)
                    nh = 0
                    ++count
                }
            }
            if (nh !== 0) {
                const x = (i - nh) * screenblockW
                stub.copyRect(x, j * screenblockH, nh * screenblockW, screenblockH, layers.frontLayer, layers.w)
                ++count
            }
            index += layers.w / screenblockW
        }
        if (count !== 0) {
            await stub.updateScreen(screen.shakeOffset)
        }
    }
    if (screen.shakeOffset !== 0) {
        screen.shakeOffset = 0
        screen.fullRefresh = true
    }
}

export {
    markScreenBlockAsDirty,
    requestFullRefresh,
    updateVideoScreen,
}
