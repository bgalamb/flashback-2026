type RecordedInputEventType = 'keydown' | 'keyup'

type RecordedInputEvent = {
    type: RecordedInputEventType
    key: string
    offsetMs: number
}

type InputRecording = {
    version: 1
    events: RecordedInputEvent[]
}

class InputRecorder {
    private _startedAt: number
    private _events: RecordedInputEvent[]

    constructor(now = defaultNow()) {
        this._startedAt = now
        this._events = []
    }

    record(event: Pick<KeyboardEvent, 'type' | 'key'>, now = defaultNow()) {
        if (event.type !== 'keydown' && event.type !== 'keyup') {
            return
        }
        this._events.push({
            type: event.type,
            key: event.key,
            offsetMs: Math.max(0, now - this._startedAt),
        })
    }

    export(): InputRecording {
        return {
            version: 1,
            events: this._events.map((event) => ({ ...event })),
        }
    }

    reset(now = defaultNow()) {
        this._startedAt = now
        this._events = []
    }
}

const defaultNow = () => {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
        return performance.now()
    }
    return Date.now()
}

const replayInputRecording = async (
    recording: InputRecording,
    handleEvent: (event: RecordedInputEvent) => void | Promise<void>,
    sleep: (duration: number) => Promise<void> = async () => {},
    preserveTiming = false
) => {
    let previousOffset = 0
    for (const event of recording.events) {
        if (preserveTiming) {
            const delay = Math.max(0, event.offsetMs - previousOffset)
            if (delay > 0) {
                await sleep(delay)
            }
            previousOffset = event.offsetMs
        }
        await handleEvent(event)
    }
}

export {
    InputRecorder,
    InputRecording,
    RecordedInputEvent,
    RecordedInputEventType,
    replayInputRecording,
}
