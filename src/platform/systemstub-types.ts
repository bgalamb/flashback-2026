import { ScalerType, _internalScaler } from '../core/scaler'

interface ScalerParameters {
    type: ScalerType
    name: string
    factor: number
}

const defaultScaleParameters: ScalerParameters = {
    type: ScalerType.kScalerTypeInternal,
    name: '',
    factor: _internalScaler.factorMin + (_internalScaler.factorMax - _internalScaler.factorMin) / 2,
}

const DIR_UP = 1 << 0
const DIR_DOWN = 1 << 1
const DIR_LEFT = 1 << 2
const DIR_RIGHT = 1 << 3
const DF_FASTMODE = 1 << 0
const DF_DBLOCKS = 1 << 1
const DF_SETLIFE = 1 << 2

interface PlayerInput {
    dirMask: number
    enter: boolean
    space: boolean
    shift: boolean
    backspace: boolean
    escape: boolean
    lastChar: string
    save: boolean
    load: boolean
    stateSlot: number
    rewind: boolean
    dbgMask: number
    quit: boolean
}

function createPlayerInput(): PlayerInput {
    return {
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
    }
}

export {
    createPlayerInput,
    defaultScaleParameters,
    DF_DBLOCKS,
    DF_FASTMODE,
    DF_SETLIFE,
    DIR_DOWN,
    DIR_LEFT,
    DIR_RIGHT,
    DIR_UP,
}
export type { PlayerInput, ScalerParameters }
