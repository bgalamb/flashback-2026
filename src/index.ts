import { ScalerParameters, defaultScaleParameters, SystemStub } from './platform/systemstub_web'
import { FileSystem } from './resource/fs'
import { Game } from './game/game'
import { defaultConfig, globalGameOptions } from './core/game_constants'

const gCaption = "REminiscence"

//By default the structure has everything false, so here we change some values
const initOptions = async () => {
    globalGameOptions.useWhiteTshirt = false
    globalGameOptions.playAscCutscene = true
    globalGameOptions.playCaillouCutscene = true
    globalGameOptions.playMetroCutscene = false
    globalGameOptions.playSerrureCutscene = false
    globalGameOptions.playCarteCutscene = false
    globalGameOptions.playGamesavedSound = false

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

const createMain = (dependencies: MainDependencies = defaultMainDependencies) => async (config = defaultConfig ) => {
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
    await stub.init(gCaption, game._vid.layers.w, game._vid.layers.h, fullscreen, scalerParameters)
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
