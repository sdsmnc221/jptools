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
