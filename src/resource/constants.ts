import { _stringsTableEN, _textsTableEN } from '../core/staticres'

const LocaleData = {
    Id: {
        li01ContinueOrAbort: 0,
        li02Time: 1,
        li03Continue: 2,
        li04Abort: 3,
        li05Completed: 4,
        li06Level: 5,
        li07Start: 6,
        li08Skill: 7,
        li09Password: 8,
        li10Info: 9,
        li11Quit: 10,
        li12SkillLevel: 11,
        li13Easy: 12,
        li14Normal: 13,
        li15Expert: 14,
        li16EnterPassword1: 15,
        li17EnterPassword2: 16,
        li18ResumeGame: 17,
        li19AbortGame: 18,
        li20LoadGame: 19,
        li21SaveGame: 20,
        li22SaveSlot: 21,
        li23Demo: 22,
        liNum: 23
    },

    _textsTableEN: _textsTableEN,
    _stringsTableEN: _stringsTableEN,
}

enum ObjectType {
    otMbk,
    otPge,
    otPal,
    otCt,
    otMap,
    otSpc,
    otRp,
    otRpc,
    otDemo,
    otAni,
    otObj,
    otTbn,
    otSpr,
    otTab,
    otIcn,
    otFnt,
    otTxtbin,
    otCmd,
    otPol,
    otSprm,
    otOff,
    otCmp,
    otObc,
    otSpl,
    otBnq,
    otSpm,
    otLev
}

const numSfxs = 66
const numBankBuffers = 50
const numCutsceneTexts = 117
const numSprites = 1287

const kPaulaFreq = 3546897

export {
    LocaleData,
    ObjectType,
    numSfxs,
    numBankBuffers,
    numCutsceneTexts,
    numSprites,
    kPaulaFreq
}
