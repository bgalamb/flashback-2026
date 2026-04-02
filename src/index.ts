import { ScalerParameters, defaultScaleParameters, SystemStub } from './systemstub_web'
import { FileSystem } from './resource/fs'
import { Game } from './game'
import { DEFAULT_CONFIG, global_game_options } from './game_constants'

const g_caption = "REminiscence"

//By default the structure has everything false, so here we change some values
const initOptions = async () => {
    global_game_options.use_white_tshirt = false
    global_game_options.play_asc_cutscene = true
    global_game_options.play_caillou_cutscene = true
    global_game_options.play_metro_cutscene = false
    global_game_options.play_serrure_cutscene = false
    global_game_options.play_carte_cutscene = false
    global_game_options.play_gamesaved_sound = false

}

const parseScaler = (name: string, scalerParameters: ScalerParameters) => {
    const split = name.split('@')
    if (split.length > 1) {
        scalerParameters.factor = Number(split[1])
    }
    scalerParameters.name = name
}

type MainDependencies = {
    SystemStub: typeof SystemStub
    FileSystem: typeof FileSystem
    Game: typeof Game
}

const defaultMainDependencies: MainDependencies = {
    SystemStub,
    FileSystem,
    Game,
}

type InputRecordingApi = {
    start: () => void
    stop: () => unknown
    get: () => unknown
}

const getInputRecordingApi = (win: Window & typeof globalThis = window) => {
    return (win as any).__flashbackInputRecording as InputRecordingApi | undefined
}

const updateRecordingStatus = (statusElement: HTMLElement | null, isRecording: boolean, message?: string) => {
    if (!statusElement) {
        return
    }
    const status = isRecording ? 'Recording' : 'Idle'
    statusElement.textContent = message ? `Recording Status: ${status} - ${message}` : `Recording Status: ${status}`
    statusElement.setAttribute('data-recording', isRecording ? 'true' : 'false')
}

const downloadInputRecording = (
    recording: unknown,
    win: Window & typeof globalThis = window,
    doc: Document = document
) => {
    const blob = new win.Blob([JSON.stringify(recording, null, 2)], { type: 'application/json' })
    const url = win.URL.createObjectURL(blob)
    const link = doc.createElement('a')
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    link.href = url
    link.download = `flashback-input-recording-${timestamp}.json`
    if (typeof link.click === 'function') {
        link.click()
    }
    win.URL.revokeObjectURL(url)
}

const exposeInputRecordingControls = (stub: SystemStub) => {
    if (typeof window === 'undefined') {
        return
    }
    ;(window as any).__flashbackInputRecording = {
        start: () => stub.startInputRecording(),
        stop: () => stub.stopInputRecording(),
        get: () => stub.getInputRecording(),
    }
}

const bindRecordingControls = (
    doc: Pick<Document, 'getElementById' | 'createElement'> = document,
    getApi: () => InputRecordingApi | undefined = () => getInputRecordingApi(),
    downloadRecording = (recording: unknown) => downloadInputRecording(recording)
) => {
    const recordButton = doc.getElementById('record-input') as HTMLElement | null
    const recordStatus = doc.getElementById('recording-status') as HTMLElement | null
    if (!recordButton) {
        return
    }

    let isRecording = false
    updateRecordingStatus(recordStatus, false, 'Ready')

    recordButton.addEventListener('click', () => {
        const api = getApi()
        if (!api) {
            updateRecordingStatus(recordStatus, false, 'Game not started')
            return
        }

        if (!isRecording) {
            api.start()
            isRecording = true
            recordButton.textContent = 'Stop Recording'
            updateRecordingStatus(recordStatus, true, 'Capturing input')
            return
        }

        const recording = api.stop()
        isRecording = false
        recordButton.textContent = 'Start Recording'
        updateRecordingStatus(recordStatus, false, 'Saved')
        if (recording) {
            downloadRecording(recording)
        }
    })
}

const createMain = (dependencies: MainDependencies = defaultMainDependencies) => async (config = DEFAULT_CONFIG ) => {
    let scalerParameters:ScalerParameters = { ...defaultScaleParameters }
    parseScaler(config.scaler, scalerParameters)
    console.log({ scalerParameters })
    console.log({ config })

    //configurations for the game
    const dataPath = config.datapath
    let savePath = config.savepath
    const levelNum = config.levelnum
    const fullscreen = config.fullscreen
    const autoSave = config.autosave

    //the framework (currently browser) where the game is embedded
    const stub = new dependencies.SystemStub()

    await initOptions()
    const fs = new dependencies.FileSystem()
    await fs.setRootDirectory(dataPath)

    const game = new dependencies.Game(stub, fs, savePath, levelNum, autoSave)
    await stub.init(g_caption, game._vid._w, game._vid._h, fullscreen, scalerParameters)
    exposeInputRecordingControls(stub)
    await game.run()
}

const main = createMain()

const bindPlayButton = (doc: Pick<Document, 'getElementById' | 'querySelector'> = document, startGame = main) => {
    const playButton = doc.getElementById('play')
    if (!playButton) {
        return
    }

    playButton.addEventListener('click', () => {
        const intro = doc.querySelector('.intro') as HTMLElement | null
        const mainContainer = doc.querySelector('.main') as HTMLElement | null
        if (intro) {
            intro.style.display = 'none'
        }
        if (mainContainer) {
            mainContainer.classList.add('visible')
        }
        startGame()
    })
}

if (typeof document !== 'undefined') {
    bindPlayButton()
    bindRecordingControls()
}

export { bindPlayButton, bindRecordingControls, createMain, downloadInputRecording, getInputRecordingApi, initOptions, main, parseScaler, updateRecordingStatus }
