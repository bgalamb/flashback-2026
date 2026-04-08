import { createPlayerInput, dirDown, dirLeft, dirRight, dirUp } from './systemstub-types'
import type { PlayerInput } from './systemstub-types'

function applyKeyDown(playerInput: PlayerInput, key: string) {
    switch (key) {
        case ' ':
            playerInput.space = true
            break
        case 'o':
        case 'O':
        case 'Escape':
            playerInput.escape = true
            break
        case 'Enter':
            playerInput.enter = true
            break
        case 'ArrowLeft':
            playerInput.dirMask |= dirLeft
            break
        case 'ArrowRight':
            playerInput.dirMask |= dirRight
            break
        case 'ArrowUp':
            playerInput.dirMask |= dirUp
            break
        case 'ArrowDown':
            playerInput.dirMask |= dirDown
            break
        case 'Shift':
            playerInput.shift = true
            break
        case 'Tab':
        case 'Backspace':
            playerInput.backspace = true
            break
    }
}

function applyKeyUp(playerInput: PlayerInput, key: string) {
    switch (key) {
        case ' ':
            playerInput.space = false
            break
        case 'Escape':
        case 'o':
        case 'O':
            playerInput.escape = false
            break
        case 'Enter':
            playerInput.enter = false
            break
        case 'ArrowLeft':
            playerInput.dirMask &= ~dirLeft
            break
        case 'ArrowRight':
            playerInput.dirMask &= ~dirRight
            break
        case 'ArrowUp':
            playerInput.dirMask &= ~dirUp
            break
        case 'ArrowDown':
            playerInput.dirMask &= ~dirDown
            break
        case 'Shift':
            playerInput.shift = false
            break
    }
}

function queueBrowserEvent(events: Event[], event: Event) {
    const keyboardEvent = event as KeyboardEvent
    if (!keyboardEvent.metaKey && !keyboardEvent.ctrlKey) {
        keyboardEvent.preventDefault()
    }
    events.push(event)
}

function resetPlayerInput(): PlayerInput {
    return createPlayerInput()
}

export { applyKeyDown, applyKeyUp, queueBrowserEvent, resetPlayerInput }
