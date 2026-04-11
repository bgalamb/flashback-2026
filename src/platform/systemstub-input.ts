import { createPlayerInput, dfDblocks, dfFastmode, dfSetlife, dirDown, dirLeft, dirRight, dirUp } from './systemstub-types'
import type { PlayerInput } from './systemstub-types'

type KeyboardLike = {
    key: string
    code?: string
    ctrlKey?: boolean
}

function isRewindKey(keyboardEvent: Pick<KeyboardLike, 'key' | 'code' | 'ctrlKey'>) {
    return isShortcutMatch(keyboardEvent, 'r', 'KeyR')
}

function isShortcutMatch(keyboardEvent: Pick<KeyboardLike, 'key' | 'code'>, key: string, code?: string) {
    if (keyboardEvent.key === key || keyboardEvent.key === key.toUpperCase()) {
        return true
    }
    return typeof code === 'string' && keyboardEvent.code === code
}

function isHandledCtrlShortcut(keyboardEvent: Pick<KeyboardLike, 'key' | 'code'>) {
    return isShortcutMatch(keyboardEvent, 'r', 'KeyR') ||
        isShortcutMatch(keyboardEvent, 'f', 'KeyF') ||
        isShortcutMatch(keyboardEvent, 'b', 'KeyB') ||
        isShortcutMatch(keyboardEvent, 'i', 'KeyI') ||
        isShortcutMatch(keyboardEvent, 's', 'KeyS') ||
        isShortcutMatch(keyboardEvent, 'l', 'KeyL') ||
        keyboardEvent.key === 'PageUp' ||
        keyboardEvent.key === 'PageDown'
}

function applyKeyDown(playerInput: PlayerInput, keyOrEvent: string | KeyboardLike) {
    const keyboardEvent = typeof keyOrEvent === 'string' ? { key: keyOrEvent, ctrlKey: false } : keyOrEvent
    const { key } = keyboardEvent
    if (keyboardEvent.ctrlKey) {
        if (isShortcutMatch(keyboardEvent, 'r', 'KeyR')) {
            playerInput.rewind = true
            console.log(`[rewind-input] mapped ctrl shortcut key=${keyboardEvent.key} code=${keyboardEvent.code ?? ''}`)
        } else if (isShortcutMatch(keyboardEvent, 'f', 'KeyF')) {
            playerInput.dbgMask ^= dfFastmode
        } else if (isShortcutMatch(keyboardEvent, 'b', 'KeyB')) {
            playerInput.dbgMask ^= dfDblocks
        } else if (isShortcutMatch(keyboardEvent, 'i', 'KeyI')) {
            playerInput.dbgMask ^= dfSetlife
        } else if (isShortcutMatch(keyboardEvent, 's', 'KeyS')) {
            playerInput.save = true
        } else if (isShortcutMatch(keyboardEvent, 'l', 'KeyL')) {
            playerInput.load = true
        } else if (key === 'PageUp') {
            playerInput.stateSlot = 1
        } else if (key === 'PageDown') {
            playerInput.stateSlot = -1
        }
        return
    }

    switch (key) {
        case 'r':
        case 'R':
            playerInput.rewind = true
            console.log(`[rewind-input] mapped plain key key=${keyboardEvent.key} code=${keyboardEvent.code ?? ''}`)
            break
        case ' ':
        case 'Space':
        case 'Spacebar':
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
        case 'Space':
        case 'Spacebar':
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
    const shouldPreventDefault = (!keyboardEvent.metaKey && !keyboardEvent.ctrlKey) || (keyboardEvent.ctrlKey && isHandledCtrlShortcut(keyboardEvent))
    if (shouldPreventDefault) {
        keyboardEvent.preventDefault()
    }
    if (event.type === 'keydown' && isRewindKey(keyboardEvent)) {
        console.log(`[rewind-input] queued event type=${event.type} key=${keyboardEvent.key} code=${keyboardEvent.code ?? ''} ctrl=${keyboardEvent.ctrlKey ? 1 : 0} prevented=${shouldPreventDefault ? 1 : 0}`)
    }
    events.push(event)
}

function resetPlayerInput(): PlayerInput {
    return createPlayerInput()
}

export { applyKeyDown, applyKeyUp, isHandledCtrlShortcut, queueBrowserEvent, resetPlayerInput }
