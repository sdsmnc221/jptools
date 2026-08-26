// The RG Rotate button constants
// Android's own standard KEYCODE_BUTTON_*/KEYCODE_DPAD_* values.
//
// MEASURED on device 2026-08-25 with the native capturer (custom apk "RG Input Capture");
// raw result in ../../rg-input-capture.json. Two findings:
//
//   * C (98) and Z (101) are GONE. The RG Rotate has no such buttons, there is
//     nothing to press. Monsterest's keymap listed them anyway (duplicating X
//     and Y), which was harmless but meaningless. A keymap entry for a button
//     the device does not have is noise.
//   * The D-pad is physically a HAT (AXIS_HAT_X/AXIS_HAT_Y), not four keys.
//     19-22 are still correct here, because Android synthesises KEYCODE_DPAD_*
//     from HAT motion for any app that does not consume the joystick event,which
//     is why these entries work in practice. The capturer only sees the
//     raw axes because it consumes the MotionEvent itself.
//
// Everything below was confirmed by direct KeyEvent.getKeyCode() measurement,
// and the device reports itself as "retrogame_joypad".
export const RG_ROTATE_BUTTONS = {
  DPAD_UP: 19,
  DPAD_DOWN: 20,
  DPAD_LEFT: 21,
  DPAD_RIGHT: 22,
  A: 96,
  B: 97,
  X: 99,
  Y: 100,
  L1: 102, // also reports analog AXIS_LTRIGGER / AXIS_BRAKE
  R1: 103,
  L2: 104, // also reports analog AXIS_RTRIGGER / AXIS_GAS
  R2: 105,
  START: 108,
  SELECT: 109,
};

// Android KeyEvent constants for the OUTPUT side of a keymap entry,
// what the game receives. Profiles may name a key ("W") or give the number (51); both
// resolve through here. keymap.json requires the number, so a profile that
// emitted "W" produced a file JoiPlay could not read.
//
// Note the arrows: Android has no separate arrow keys, they ARE the D-pad
// constants. That is not a shortcut: the capture confirmed the chain, with
// DPAD_LEFT (21) arriving in a WebView as DOM ArrowLeft (37).
export const KEY_CODES = {
  // letters, KEYCODE_A = 29 .. KEYCODE_Z = 54
  A: 29,
  B: 30,
  C: 31,
  D: 32,
  E: 33,
  F: 34,
  G: 35,
  H: 36,
  I: 37,
  J: 38,
  K: 39,
  L: 40,
  M: 41,
  N: 42,
  O: 43,
  P: 44,
  Q: 45,
  R: 46,
  S: 47,
  T: 48,
  U: 49,
  V: 50,
  W: 51,
  X: 52,
  Y: 53,
  Z: 54,

  // digits, KEYCODE_0 = 7 .. KEYCODE_9 = 16
  0: 7,
  1: 8,
  2: 9,
  3: 10,
  4: 11,
  5: 12,
  6: 13,
  7: 14,
  8: 15,
  9: 16,

  ENTER: 66,
  ESCAPE: 111,
  SPACE: 62,
  TAB: 61,
  BACKSPACE: 67,
  SHIFT: 59, // KEYCODE_SHIFT_LEFT
  SHIFT_LEFT: 59,
  SHIFT_RIGHT: 60,
  CTRL: 113, // KEYCODE_CTRL_LEFT
  CTRL_LEFT: 113,
  ALT: 57, // KEYCODE_ALT_LEFT
  ALT_LEFT: 57,

  ARROW_UP: 19,
  ARROW_DOWN: 20,
  ARROW_LEFT: 21,
  ARROW_RIGHT: 22,
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

export const ELDERFIELD = {
  X: 59, // Android KEYCODE_SHIFT_LEFT -> WebView translates to DOM Shift(16) -> RPG Maker "shift"/dash
};

// Moonstone (Construct 3): same D-pad-to-WASD idea, but A -> SPACE, Y/Z -> I,
// and L1/R1 -> arrow left/right for menu tabs. Same sixteen inputs, different
// outputs, which is why separating device constants from per-game bindings.
export const MOONSTONE = {
  DPAD_UP: "W",
  DPAD_DOWN: "S",
  DPAD_LEFT: "A",
  DPAD_RIGHT: "D",
  A: "SPACE",
  B: "ESCAPE",
  X: "E",
  Y: "I",
  Z: "I",
  L1: "ARROW_LEFT",
  R1: "ARROW_RIGHT",
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
