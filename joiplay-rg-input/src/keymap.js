import { RG_ROTATE_BUTTONS, KEY_CODES, mergeProfile } from "./profiles.js";

/**
 * keymap.json's `keycode` must be a NUMBER. Profiles are allowed to write the
 * readable name instead ("W"), so resolve it here.
 *
 * An unknown name throws rather than passing through: a profile emitting
 * `"keycode": "W"` produced a keymap JoiPlay silently could not use, and the
 * only thing worse than that is emitting `undefined` and not knowing.
 */
function resolveKeycode(control, value) {
  if (typeof value === "number") return value;

  const resolved = KEY_CODES[value];
  if (resolved === undefined) {
    throw new Error(
      `Profile control "${control}" has keycode "${value}", which is not a ` +
        `known key name. Add it to KEY_CODES in profiles.js, or use the ` +
        `Android constant directly.`,
    );
  }
  return resolved;
}

export function buildKeymap(profile, buttonTable = RG_ROTATE_BUTTONS) {
  return (
    Object.entries(profile)
      .filter(([, keycode]) => keycode !== undefined)
      // Drop controls this device does not have. Measurement showed the RG Rotate
      // has no C or Z, so a profile naming them would otherwise emit
      // `"button": undefined` -> invalid JSON for a button that cannot be pressed.
      .filter(([name]) => buttonTable[name] !== undefined)
      .map(([name, keycode]) => ({
        button: buttonTable[name], // 96, what the device reports for "A"
        keycode: resolveKeycode(name, keycode), // 66, what the game receives
        device: "retrogame_joypad",
      }))
  );
}
