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
};

// TODO: This is the third time this exact failure has appeared : evidence prose and the keyword list
//   drifting apart. Earlier it was "Data directory" colliding with Unity's "*_Data directory"; now it's
//   a rename on one side only. Substring-matching prose is doing structural work, and it fails
//   silently every time. Exporting the strings themselves as constants, pushed and matched from the
//   same symbol — removes the whole class:
export const EVIDENCES = {
  RPGM_DATA_FILES: "RGSS Data Files",
};
export const KNOWN_ENGINES_EVIDENCES = {
  [KNOWN_ENGINES.UNREAL]: ["Engine directory", "*-Shipping.exe"],
  [KNOWN_ENGINES.UNITY]: ["UnityPlayer.dll", "*_Data"],
  [KNOWN_ENGINES.GM]: ["data.win"],
  [KNOWN_ENGINES.RPGM]: [
    "rgss*.dll",
    "game.ini",
    EVIDENCES.RPGM_DATA_FILES,
    "RPG Maker archive",
  ],
  [KNOWN_ENGINES.NWJS]: ["nw.dll", "package.nw", "index.html", "package.json"],
  [KNOWN_ENGINES.CUSTOM]: ["executable file", "DLL file", "SDL3.dll"],
};
