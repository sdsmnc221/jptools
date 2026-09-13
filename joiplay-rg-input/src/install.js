import { GameTree } from "jpt-commons/game-tree";
import { createShimFile, packGame, getDefaultPatchDir } from "jpt-commons/rga";
import { mkdirSync } from "fs";
import { buildKeymap } from "./keymap.js";
import { buildGamepad } from "./gamepad.js";
import { PROFILES, mergeProfile } from "../src/profiles.js";

const install = async (
  gameDir,
  { profile = "rg-rotate", dryRun, plugMode } = {},
) => {
  const tree = new GameTree(gameDir);
  const stagingDir = getDefaultPatchDir(tree.root, tree.gameName);
  mkdirSync(stagingDir, { recursive: true });

  const resolvedProfile = mergeProfile(PROFILES[profile] || {});

  const keymap = buildKeymap(resolvedProfile);
  const gamepad = buildGamepad(resolvedProfile);

  if (!dryRun) {
    const files = [
      await createShimFile(
        "keymap.json",
        `${JSON.stringify(keymap, null, 2)}\n`,
        stagingDir,
      ),
      ...(gamepad
        ? [
            await createShimFile(
              "gamepad.json",
              JSON.stringify(gamepad, null, 2),
              stagingDir,
            ),
          ]
        : []),
    ];

    await packGame(tree.root, tree.gameName, files, {
      defaultPatchFilename: "patch_input.rga",
    });
  } else {
    console.log(
      `Dry run: would create keymap.json in ${stagingDir} for device profile ${profile}`,
    );
    console.log(keymap);
    if (gamepad) {
      console.log(`----------`);
      console.log(`Dry run: would create gamepad.json in ${stagingDir}.`);
      console.log(gamepad);
    }
  }

  return "ok";
};

export { install };
