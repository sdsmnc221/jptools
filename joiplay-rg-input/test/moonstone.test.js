import assert from "node:assert/strict";
import test from "node:test";

import { buildKeymap } from "../src/keymap.js";
import { MOONSTONE, mergeProfile } from "../src/profiles.js";

test("Moonstone full-release profile exposes every core RG Rotate action", () => {
  const entries = buildKeymap(mergeProfile(MOONSTONE));
  const outputByButton = Object.fromEntries(
    entries.map(({ button, keycode }) => [button, keycode]),
  );

  assert.deepEqual(outputByButton, {
    19: 51, // D-pad up -> W
    20: 47, // D-pad down -> S
    21: 29, // D-pad left -> A
    22: 32, // D-pad right -> D
    96: 62, // A -> Space (confirm)
    97: 111, // B -> Escape (cancel)
    99: 33, // X -> E (use)
    100: 37, // Y -> I (inventory)
    102: 21, // L1 -> Left (previous menu tab)
    103: 22, // R1 -> Right (next menu tab)
    104: 45, // L2 -> Q (quick wheel)
    105: 59, // R2 -> Shift
    108: 46, // Start -> R (special action)
    109: 41, // Select -> M (map)
  });
});

test("Moonstone profile contains only controls present on RG Rotate", () => {
  const entries = buildKeymap(mergeProfile(MOONSTONE));

  assert.equal(entries.length, 14);
  assert.equal(new Set(entries.map(({ button }) => button)).size, 14);
  assert.ok(entries.every(({ button, keycode }) =>
    Number.isInteger(button) && Number.isInteger(keycode),
  ));
});
