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
    stub._game = game
    await stub.init(g_caption, game._vid.layers.w, game._vid.layers.h, fullscreen, scalerParameters)
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
}

export { bindPlayButton, createMain, initOptions, main, parseScaler }
