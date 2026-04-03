interface InitializedAudioNodes {
    audioContext: AudioContext
    audioPlayer: AudioWorkletNode
    sfxPlayer: AudioWorkletNode
    outputSampleRate: number
}

async function loadAudioWorkletModule(audioContext: AudioContext) {
    const candidates = [
        'js/processors.js',
        './js/processors.js',
        'src/audio/audio-processors.js',
        './src/audio/audio-processors.js',
    ]
    let lastError: unknown = null
    for (const modulePath of candidates) {
        try {
            await audioContext.audioWorklet.addModule(modulePath)
            return
        } catch (error) {
            lastError = error
        }
    }
    throw lastError || new Error('Unable to load audio worklet module')
}

function createAudioContext() {
    return new window.AudioContext()
}

async function initializeAudioNodes(
    audioContext: AudioContext,
    onSoundProcessorMessage: (event: MessageEvent) => void,
    onSfxProcessorMessage: (event: MessageEvent) => void
): Promise<InitializedAudioNodes> {
    if (!audioContext.audioWorklet) {
        throw new Error('AudioWorklet is not available in this browser')
    }

    await loadAudioWorkletModule(audioContext)
    const filterNode = audioContext.createBiquadFilter()
    filterNode.frequency.value = 22050

    const sfxPlayer = new AudioWorkletNode(audioContext, 'sfx-processor', {
        outputChannelCount: [1],
        numberOfInputs: 0,
        numberOfOutputs: 1,
    })
    sfxPlayer.port.onmessage = onSfxProcessorMessage
    sfxPlayer.port.start()

    const audioPlayer = new AudioWorkletNode(audioContext, 'sound-processor', {
        outputChannelCount: [1],
        numberOfInputs: 1,
        numberOfOutputs: 1,
    })
    audioPlayer.port.onmessage = onSoundProcessorMessage
    audioPlayer.port.start()

    sfxPlayer.connect(audioPlayer)
    audioPlayer.connect(filterNode)
    filterNode.connect(audioContext.destination)

    const outputSampleRate = audioContext.sampleRate
    postWorkletMessage(audioPlayer, {
        message: 'init',
        mixingRate: outputSampleRate,
    })
    postWorkletMessage(sfxPlayer, {
        message: 'init',
        mixingRate: outputSampleRate,
    })

    return {
        audioContext,
        audioPlayer,
        sfxPlayer,
        outputSampleRate,
    }
}

function postWorkletMessage(workletNode: AudioWorkletNode | null | undefined, message: unknown) {
    if (workletNode) {
        workletNode.port.postMessage(message)
        return true
    }
    return false
}

async function resumeAudioContext(audioContext: AudioContext) {
    if (audioContext && audioContext.state === 'suspended') {
        await audioContext.resume()
    }
}

export { createAudioContext, initializeAudioNodes, postWorkletMessage, resumeAudioContext }
export type { InitializedAudioNodes }
