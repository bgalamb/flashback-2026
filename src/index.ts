import { WidescreenMode } from './intern'
import { Language, ResourceType } from './enums/common_enums'
import { global_game_options } from './configs/global_game_options'
import { ScalerParameters, defaultScaleParameters, SystemStub } from './systemstub_web'
import { FileSystem } from './fs'
import { Game } from './game'
import { DEFAULT_CONFIG,  } from './config'

const g_caption = "REminiscence"

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

const parseWidescreen = (mode: string):WidescreenMode => {
    const modes:{
        name: string
        mode: WidescreenMode
    }[] = [
        { name: "adjacent", mode: WidescreenMode.kWidescreenAdjacentRooms },
        { name: "mirror", mode: WidescreenMode.kWidescreenMirrorRoom },
        { name: "blur", mode: WidescreenMode.kWidescreenBlur },
        { name: "none", mode: WidescreenMode.kWidescreenNone },
    ]
    for (let i = 0; modes[i].name; ++i) {
        if (modes[i].name === mode) {
            return modes[i].mode
        }
    }
    console.warn(`Unhandled widecreen mode '${mode}', defaults to 16:9 blur`)
    return WidescreenMode.kWidescreenBlur
}

const main = async (config = DEFAULT_CONFIG ) => {
    let savePath = "."

    let widescreen:WidescreenMode = WidescreenMode.kWidescreenNone
    let scalerParameters:ScalerParameters = { ...defaultScaleParameters }
    console.log({ scalerParameters })
    console.log({ config })

    let dataPath = config.datapath
    let levelNum = config.levelnum
    let fullscreen = config.fullscreen
    let autoSave = config.autosave

    // param 5
    parseScaler(config.scaler, scalerParameters)

    // param 7
    widescreen = parseWidescreen(config.widescreen)
    const stub = new SystemStub()

    await initOptions()
    const fs = new FileSystem()
    await fs.setRootDirectory(dataPath)
    const version = ResourceType.kResourceTypeDOS

    const language = Language.LANG_EN
    const g = new Game(stub, fs, savePath, levelNum, version, language, widescreen, autoSave)
    await stub.init(g_caption, g._vid._w, g._vid._h, fullscreen, widescreen, scalerParameters)
    await g.run()
}

document.getElementById('play').addEventListener('click', () => {
    document.querySelector('.intro').style.display = 'none'
    document.querySelector('.main').classList.add('visible')
    main()
})
