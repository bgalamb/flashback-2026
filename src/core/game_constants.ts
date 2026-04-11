const uint8Max = 0xFF
const uint16Max = 0xFFFF
const screenblockW = 8
const screenblockH = 8
const gamescreenW = 256
const gamescreenH = 224
const charW = 8
const charH = 8
const kIngameSaveSlot = 0
const kRewindSize = 120 // 10mins (~2MB)
const kAutoSaveSlot = uint8Max
const kAutoSaveIntervalMs = 5 * 1000

const ctRoomSize = 0x40
const ctUpRoom = 0x00
const ctDownRoom = 0x40
const ctRightRoom = 0x80
const ctLeftRoom = 0xC0
const ctHeaderSize = 0x100
const ctGridWidth = 16
const ctGridHeight = 7
const ctGridStride = ctGridWidth * ctGridHeight
const ctDataSize = ctHeaderSize + ctRoomSize * ctGridStride

const pgeNum = 256
const room47ElevatorPgeIndex = 15
const pgeFlagMirrored = 0x01
const pgeFlagFlipX = 0x02
const pgeFlagActive = 0x04
const pgeFlagSpecialAnim = 0x08
const pgeFlagForeground = 0x10   // PGE renders to foreground anim buffer (layer 2)
const pgeFlagAutoActivate = 0x80 // PGE auto-activates when it enters a collision slot

const xorRandSeedPolynomial = 0x1D872B41 // LFSR polynomial used by gameGetRandomNumber

const initPgeFlagHasCollision = 0x01
const initPgeFlagUnknownBit1 = 0x02
const initPgeFlagInCurrentRoomList = 0x04
const initPgeInitFlagsHasFlag3 = 0x08

const objFlagToggleMirror = 0x01
const objFlagDecLife = 0x02
const objFlagIncLife = 0x04
const objFlagSetDead = 0x08

const configDefaults = {
  // 'https://warpdesign.github.io/flashback-web/demo-data'
  datapath: "http://localhost:4445/DATA",
  savepath: "",
  levelnum: 7,
  fullscreen: false,
  scaler: "point@4",
  language: "EN",
  widescreen: "none",
  autosave: false
}

const globalGameOptionDefaults = {
  dumpFrontLayerImage: false,
  dumpFrontLayerPixelData: false,
  loadFrontLayerPixelData: false,
  dumpUnpackedLevelData: false,
  useTileData: false,
  useWhiteTshirt: false,
  playAscCutscene: false,
  playCaillouCutscene: false,
  playMetroCutscene: false,
  playSerrureCutscene: false,
  playCarteCutscene: false,
  playGamesavedSound: false
}

type GameOptions = typeof globalGameOptionDefaults

const defaultConfig = { ...configDefaults }

export {
  uint8Max,
  uint16Max,
  screenblockW,
  screenblockH,
  gamescreenW,
  gamescreenH,
  charW,
  charH,
  kIngameSaveSlot,
  kRewindSize,
  kAutoSaveSlot,
  kAutoSaveIntervalMs,
  ctRoomSize,
  ctUpRoom,
  ctDownRoom,
  ctRightRoom,
  ctLeftRoom,
  ctHeaderSize,
  ctGridWidth,
  ctGridHeight,
  ctGridStride,
  ctDataSize,
  pgeNum,
  room47ElevatorPgeIndex,
  pgeFlagMirrored,
  pgeFlagFlipX,
  pgeFlagActive,
  pgeFlagSpecialAnim,
  pgeFlagForeground,
  pgeFlagAutoActivate,
  xorRandSeedPolynomial,
  initPgeFlagHasCollision,
  initPgeFlagUnknownBit1,
  initPgeFlagInCurrentRoomList,
  initPgeInitFlagsHasFlag3,
  objFlagToggleMirror,
  objFlagDecLife,
  objFlagIncLife,
  objFlagSetDead,
  configDefaults,
  globalGameOptionDefaults,
  defaultConfig,
}
export type { GameOptions }
