import { RG_ROTATE_BUTTONS, mergeProfile } from "./profiles.js";

export function buildKeymap(profile, buttonTable = RG_ROTATE_BUTTONS) {
  return Object.entries(profile)
    .filter(([, keycode]) => keycode !== undefined)
    .map(([name, keycode]) => ({
      button: buttonTable[name], // e.g. 96, what the device reports for "A"
      keycode, // e.g. 66, what the game should receive instead
      device: "retrogame_joypad",
    }));
}
