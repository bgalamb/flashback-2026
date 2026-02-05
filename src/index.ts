import { WidescreenMode } from './enums/common_enums'
import { Language, ResourceType } from './enums/common_enums'
import { global_game_options } from './configs/global_game_options'
import { ScalerParameters, defaultScaleParameters, SystemStub } from './systemstub_web'
import { FileSystem } from './fs'
import { Game } from './game'
import { DEFAULT_CONFIG,  } from './configs/config'

const g_caption = "REminiscence"

//By default the structure has everything false, so here we change some values
const initOptions = async () => {
    global_game_options.bypass_protection = true
    global_game_options.enable_password_menu = false
    global_game_options.enable_language_selection = true
    global_game_options.fade_out_palette = false
    global_game_options.use_text_cutscenes = false
    global_game_options.use_seq_cutscenes = true
    global_game_options.use_words_protection = false
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

const main = async (config = DEFAULT_CONFIG ) => {
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
    const version = ResourceType.kResourceTypeDOS
    const language = Language.LANG_EN
    const widescreen = WidescreenMode.kWidescreenNone

    //the framework (currently browser) where the game is embedded
    const stub = new SystemStub()

    await initOptions()
    const fs = new FileSystem()
    await fs.setRootDirectory(dataPath)

    const game = new Game(stub, fs, savePath, levelNum, version, language, widescreen, autoSave)
    await stub.init(g_caption, game._vid._w, game._vid._h, fullscreen, widescreen, scalerParameters)
    await game.run()
}

document.getElementById('play').addEventListener('click', () => {
    document.querySelector('.intro').style.display = 'none'
    document.querySelector('.main').classList.add('visible')
    main()
})
