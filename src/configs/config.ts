const DEFAULT_CONFIG = {
    // 'https://warpdesign.github.io/flashback-web/demo-data'
    datapath: 'http://localhost:4445/DATA',
    savepath: '',
    levelnum: 0,
    fullscreen: false,
    scaler: '',
    language: 'EN',
    widescreen: 'none',
    autosave: false,
}

//size related constants
const SCREENBLOCK_W = 8
const SCREENBLOCK_H = 8
const GAMESCREEN_W = 256
const GAMESCREEN_H = 224

const CHAR_W = 8
const CHAR_H = 8

export { DEFAULT_CONFIG, SCREENBLOCK_W, SCREENBLOCK_H, GAMESCREEN_W, GAMESCREEN_H, CHAR_W, CHAR_H }
