// This carries the one thing that took real device measurement to get right: the sixteen RG Rotate
// button constants (confirmed to be Android's own standard KEYCODE_BUTTON_*/KEYCODE_DPAD_* values
export const RG_ROTATE_BUTTONS = {
  DPAD_UP: 19,
  DPAD_DOWN: 20,
  DPAD_LEFT: 21,
  DPAD_RIGHT: 22,
  A: 96,
  B: 97,
  C: 98,
  X: 99,
  Y: 100,
  Z: 101,
  L1: 102,
  R1: 103,
  L2: 104,
  R2: 105,
  START: 108,
  SELECT: 109,
};

// This is from Monsterest→WASD, since the game only binds movement to the left stick
// D-pad -> W/A/S/D     A -> ENTER    B -> ESCAPE   X -> E     Y -> SPACE
// L1 -> 1   R1 -> 3    L2 -> SHIFT   R2 -> C       Start -> ESCAPE  Select -> I

export const MONSTEREST_WASD_PROFILE = {
  DPAD_UP: "W",
  DPAD_DOWN: "S",
  DPAD_LEFT: "A",
  DPAD_RIGHT: "D",
  A: "ENTER",
  B: "ESCAPE",
  X: "E",
  Y: "SPACE",
  L1: "1",
  R1: "3",
  L2: "SHIFT",
  R2: "C",
  START: "ESCAPE",
  SELECT: "I",
};

export const GLOBAL_DEFAULT = {
  DPAD_UP: 19,
  DPAD_DOWN: 20,
  DPAD_LEFT: 21,
  DPAD_RIGHT: 22, // identity - keep arrows
  A: 66, // ENTER - confirm
  B: 111, // ESCAPE - cancel
  X: 33, // E - interact
  Y: 62, // SPACE - secondary
  START: 111, // ESCAPE - pause
  SELECT: 37, // I - inventory
  // C, Z, L1, R1, L2, R2 intentionally absent - tier 3, raw passthrough
};

export function mergeProfile(overrides = {}) {
  return { ...GLOBAL_DEFAULT, ...overrides };
}
