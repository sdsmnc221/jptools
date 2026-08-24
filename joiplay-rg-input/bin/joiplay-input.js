#!/usr/bin/env node

import { createShimFile, packGame, getDefaultPatchDir } from "jpt-commons/rga";
import { ShimError } from "jpt-commons/errors";
import { mkdirSync } from "fs";
import { GameTree } from "jpt-commons/game-tree";
import { buildKeymap } from "../src/keymap.js";
import { buildGamepad } from "../src/gamepad.js";
import {
  GLOBAL_DEFAULT,
  MONSTEREST_WASD_PROFILE,
  ELDERFIELD,
  mergeProfile,
} from "../src/profiles.js";

const PROFILES = {
  "rg-rotate": GLOBAL_DEFAULT,
  monsterest: MONSTEREST_WASD_PROFILE,
  elderfield: ELDERFIELD,
};

const install = async (gameDir, { profile = "rg-rotate", dryRun } = {}) => {
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
        JSON.stringify(keymap, null, 2),
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
    console.log(`----------`);
    console.log(
      `Dry run: would create gamepad.json in ${stagingDir}. Actually sorry gamepad isnt implemented yet.`,
    );
    console.log(gamepad);
  }

  return "ok";
};

const verify = async (gameDir) => {
  return "stubbed";
};

const remove = async (gameDir, { dryRun } = {}) => {
  return "stubbed";
};

// joiplay-input install <game-dir> [--profile rg-rotate] [--dry-run]
// joiplay-input verify  <game-dir>              are the shim files present and consistent
// joiplay-input remove  <game-dir>              delete only files this tool created

const args = process.argv.slice(2);

const main = async () => {
  if (args.length < 2) {
    console.error("Usage: joiplay-input <command> <game-dir> [options]");
    process.exit(1);
  }

  const [command, gameDir, ...options] = args;

  const isDryRun = options.includes("--dry-run");
  const profileIndex = options.indexOf("--profile");
  const profile =
    profileIndex !== -1 && options[profileIndex + 1]
      ? options[profileIndex + 1]
      : "rg-rotate";

  let result;

  switch (command) {
    case "install":
      result = await install(gameDir, { dryRun: isDryRun, profile });
      break;
    case "verify":
      result = await verify(gameDir);
      break;
    case "remove":
      result = await remove(gameDir, { dryRun: isDryRun });
      break;
    default:
      console.error(`Unknown command: ${command}`);
      return 1;
  }

  if (result === "ok") {
    console.log(`Command ${command} complete.`);
  }

  return 0;
};

try {
  process.exitCode = await main();
} catch (error) {
  if (error instanceof ShimError) {
    console.error(`Error: ${error.message}`);
    process.exitCode = error.exitCode;
  } else {
    console.error(`Unexpected error": ${error.message}`, error);
    process.exitCode = 10;
  }
}
