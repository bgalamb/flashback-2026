const UINT8_MAX = 0xFF
const UINT16_MAX = 0xFFFF
const SCREENBLOCK_W = 8
const SCREENBLOCK_H = 8
const GAMESCREEN_W = 256
const GAMESCREEN_H = 224
const CHAR_W = 8
const CHAR_H = 8
const kIngameSaveSlot = 0
const kRewindSize = 120 // 10mins (~2MB)
const kAutoSaveSlot = UINT8_MAX
const kAutoSaveIntervalMs = 5 * 1000

const CT_ROOM_SIZE = 0x40
const CT_UP_ROOM = 0x00
const CT_DOWN_ROOM = 0x40
const CT_RIGHT_ROOM = 0x80
const CT_LEFT_ROOM = 0xC0
const CT_HEADER_SIZE = 0x100
const CT_GRID_WIDTH = 16
const CT_GRID_HEIGHT = 7
const CT_GRID_STRIDE = CT_GRID_WIDTH * CT_GRID_HEIGHT
const CT_DATA_SIZE = CT_HEADER_SIZE + CT_ROOM_SIZE * CT_GRID_STRIDE

const PGE_NUM = 256
const ROOM_47_ELEVATOR_PGE_INDEX = 15
const PGE_FLAG_MIRRORED = 0x01
const PGE_FLAG_FLIP_X = 0x02
const PGE_FLAG_ACTIVE = 0x04
const PGE_FLAG_SPECIAL_ANIM = 0x08

const INIT_PGE_FLAG_HAS_COLLISION = 0x01
const INIT_PGE_FLAG_UNKNOWN_BIT_1 = 0x02
const INIT_PGE_FLAG_IN_CURRENT_ROOM_LIST = 0x04
const INIT_PGE_INIT_FLAGS_HAS_FLAG_3 = 0x08

const OBJ_FLAG_TOGGLE_MIRROR = 0x01
const OBJ_FLAG_DEC_LIFE = 0x02
const OBJ_FLAG_INC_LIFE = 0x04
const OBJ_FLAG_SET_DEAD = 0x08

const CONFIG_DEFAULTS = {
  // 'https://warpdesign.github.io/flashback-web/demo-data'
  datapath: "http://localhost:4445/DATA",
  savepath: "",
  levelnum: 7,
  fullscreen: false,
  scaler: "",
  language: "EN",
  widescreen: "none",
  autosave: false
}

const GLOBAL_GAME_OPTION_DEFAULTS = {
  dump_front_layer_image: false,
  dump_front_layer_pixel_data: false,
  load_front_layer_pixel_data: false,
  dump_unpacked_level_data: false,
  use_tile_data: false,
  use_white_tshirt: false,
  play_asc_cutscene: false,
  play_caillou_cutscene: false,
  play_metro_cutscene: false,
  play_serrure_cutscene: false,
  play_carte_cutscene: false,
  play_gamesaved_sound: false
}

const DEFAULT_CONFIG = { ...CONFIG_DEFAULTS }
const global_game_options = { ...GLOBAL_GAME_OPTION_DEFAULTS }

export {
  UINT8_MAX,
  UINT16_MAX,
  SCREENBLOCK_W,
  SCREENBLOCK_H,
  GAMESCREEN_W,
  GAMESCREEN_H,
  CHAR_W,
  CHAR_H,
  kIngameSaveSlot,
  kRewindSize,
  kAutoSaveSlot,
  kAutoSaveIntervalMs,
  CT_ROOM_SIZE,
  CT_UP_ROOM,
  CT_DOWN_ROOM,
  CT_RIGHT_ROOM,
  CT_LEFT_ROOM,
  CT_HEADER_SIZE,
  CT_GRID_WIDTH,
  CT_GRID_HEIGHT,
  CT_GRID_STRIDE,
  CT_DATA_SIZE,
  PGE_NUM,
  ROOM_47_ELEVATOR_PGE_INDEX,
  PGE_FLAG_MIRRORED,
  PGE_FLAG_FLIP_X,
  PGE_FLAG_ACTIVE,
  PGE_FLAG_SPECIAL_ANIM,
  INIT_PGE_FLAG_HAS_COLLISION,
  INIT_PGE_FLAG_UNKNOWN_BIT_1,
  INIT_PGE_FLAG_IN_CURRENT_ROOM_LIST,
  INIT_PGE_INIT_FLAGS_HAS_FLAG_3,
  OBJ_FLAG_TOGGLE_MIRROR,
  OBJ_FLAG_DEC_LIFE,
  OBJ_FLAG_INC_LIFE,
  OBJ_FLAG_SET_DEAD,
  CONFIG_DEFAULTS,
  GLOBAL_GAME_OPTION_DEFAULTS,
  DEFAULT_CONFIG,
  global_game_options,
}
