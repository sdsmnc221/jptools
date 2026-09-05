export const MEDIA_EXTENSIONS = [
  `.mp4`,
  `.m4v`,
  `.webm`,
  `.ogv`,
  `.mov`,
  `.mkv`,
  `.avi`,
];

export const KNOWN_ENGINES = {
  UNREAL: "unreal",
  CONSTRUCT: `construct`,
  MZ: "rgpmmz",
  GD: "godot",
  UNITY: "unity",
  GM: "gamemaker",
  RPGM: "rpgmaker",
  NWJS: "nwjs",
  CUSTOM: "custom",
  UNSUPPORTED: "unsupported",
};

export const KNOWN_ENGINES_BRANDS = {
  [KNOWN_ENGINES.UNREAL]: "Unreal Engine",
  [KNOWN_ENGINES.CONSTRUCT]: "Construct",
  [KNOWN_ENGINES.MZ]: "RPG Maker MZ",
  [KNOWN_ENGINES.GD]: "Godot",
  [KNOWN_ENGINES.UNITY]: "Unity",
  [KNOWN_ENGINES.GM]: "GameMaker",
  [KNOWN_ENGINES.RPGM]: "RPG Maker",
  [KNOWN_ENGINES.NWJS]: "NW.js family",
  [KNOWN_ENGINES.CUSTOM]: "Custom/Unknown Engine",
  [KNOWN_ENGINES.UNSUPPORTED]: null,
};

// TODO: This is the third time this exact failure has appeared : evidence prose and the keyword list
//   drifting apart. Earlier it was "Data directory" colliding with Unity's "*_Data directory"; now it's
//   a rename on one side only. Substring-matching prose is doing structural work, and it fails
//   silently every time. Exporting the strings themselves as constants, pushed and matched from the
//   same symbol — removes the whole class:
export const EVIDENCES = {
  ENGINE_DIRECTORY: "Engine directory exists",
  SHIPPING_EXE: "*-Shipping.exe exists",
  UNITY_PLAYER_DLL: "Found UnityPlayer.dll",
  UNITY_DATA_DIRECTORY: "Found *_Data directory",
  DATA_WIN: "Found data.win",
  RPGM_DATA_FILES: "RGSS Data Files",
  RGSS_DATA_FILES: "Found RGSS Data Files",
  RPG_MAKER_ARCHIVE: "Found RPG Maker archive",
  GAME_INI: "Found game.ini",
  DLL_FILE: "Found DLL file",
  SDL3_DLL: "Found SDL3.dll",
  NW_DLL: "Found nw.dll",
  PACKAGE_NW: "Found package.nw",
  INDEX_HTML: "Found index.html",
  PACKAGE_JSON: "Found package.json",
  EXE_FOUND: "Found executable file",
  NOT_A_GAME: "No significant evidence found",
  UNSUPPORTED: "Unsupported game engine",
  ENGINE_DETECTED: "Engine detected",
};
export const KNOWN_ENGINES_EVIDENCES = {
  IS_A_GAME: [EVIDENCES.EXE_FOUND],
  [KNOWN_ENGINES.UNREAL]: [EVIDENCES.ENGINE_DIRECTORY, EVIDENCES.SHIPPING_EXE],
  [KNOWN_ENGINES.UNITY]: [
    EVIDENCES.UNITY_PLAYER_DLL,
    EVIDENCES.UNITY_DATA_DIRECTORY,
  ],
  [KNOWN_ENGINES.GM]: [EVIDENCES.DATA_WIN],
  [KNOWN_ENGINES.RPGM]: [
    EVIDENCES.RGSS_DATA_FILES,
    EVIDENCES.GAME_INI,
    EVIDENCES.RPGM_DATA_FILES,
    EVIDENCES.RPG_MAKER_ARCHIVE,
  ],
  [KNOWN_ENGINES.NWJS]: [
    EVIDENCES.NW_DLL,
    EVIDENCES.PACKAGE_NW,
    EVIDENCES.INDEX_HTML,
    EVIDENCES.PACKAGE_JSON,
  ],
  [KNOWN_ENGINES.CUSTOM]: [
    EVIDENCES.EXE_FOUND,
    EVIDENCES.DLL_FILE,
    EVIDENCES.SDL3_DLL,
  ],
};
