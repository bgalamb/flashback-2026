import { _stringsTableEN, _textsTableEN } from '../core/staticres'

const LocaleData = {
    Id: {
        LI_01_CONTINUE_OR_ABORT: 0,
        LI_02_TIME: 1,
        LI_03_CONTINUE: 2,
        LI_04_ABORT: 3,
        LI_05_COMPLETED: 4,
        LI_06_LEVEL: 5,
        LI_07_START: 6,
        LI_08_SKILL: 7,
        LI_09_PASSWORD: 8,
        LI_10_INFO: 9,
        LI_11_QUIT: 10,
        LI_12_SKILL_LEVEL: 11,
        LI_13_EASY: 12,
        LI_14_NORMAL: 13,
        LI_15_EXPERT: 14,
        LI_16_ENTER_PASSWORD1: 15,
        LI_17_ENTER_PASSWORD2: 16,
        LI_18_RESUME_GAME: 17,
        LI_19_ABORT_GAME: 18,
        LI_20_LOAD_GAME: 19,
        LI_21_SAVE_GAME: 20,
        LI_22_SAVE_SLOT: 21,
        LI_23_DEMO: 22,
        LI_NUM: 23
    },

    _textsTableEN: _textsTableEN,
    _stringsTableEN: _stringsTableEN,
}

enum ObjectType {
    OT_MBK,
    OT_PGE,
    OT_PAL,
    OT_CT,
    OT_MAP,
    OT_SPC,
    OT_RP,
    OT_RPC,
    OT_DEMO,
    OT_ANI,
    OT_OBJ,
    OT_TBN,
    OT_SPR,
    OT_TAB,
    OT_ICN,
    OT_FNT,
    OT_TXTBIN,
    OT_CMD,
    OT_POL,
    OT_SPRM,
    OT_OFF,
    OT_CMP,
    OT_OBC,
    OT_SPL,
    OT_BNQ,
    OT_SPM,
    OT_LEV
}

const NUM_SFXS = 66
const NUM_BANK_BUFFERS = 50
const NUM_CUTSCENE_TEXTS = 117
const NUM_SPRITES = 1287

const kPaulaFreq = 3546897

export {
    LocaleData,
    ObjectType,
    NUM_SFXS,
    NUM_BANK_BUFFERS,
    NUM_CUTSCENE_TEXTS,
    NUM_SPRITES,
    kPaulaFreq
}
