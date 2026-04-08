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

const dirUp = 1 << 0
const dirDown = 1 << 1
const dirLeft = 1 << 2
const dirRight = 1 << 3
const dfFastmode = 1 << 0
const dfDblocks = 1 << 1
const dfSetlife = 1 << 2

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
    dfDblocks,
    dfFastmode,
    dfSetlife,
    dirDown,
    dirLeft,
    dirRight,
    dirUp,
}
export type { PlayerInput, ScalerParameters }
