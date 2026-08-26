#!/usr/bin/env node

// joiplay-rg-input list                       show built-in profiles
// joiplay-input install <game-dir> [--profile rg-rotate] [--dry-run]
// joiplay-input verify  <game-dir>              are the shim files present and consistent, render the resulting keymap.json
// joiplay-input remove  <game-dir>              delete only files this tool created

import { mkdirSync, existsSync } from "fs";
import path from "path";
import { createShimFile, packGame, getDefaultPatchDir } from "jpt-commons/rga";
import { ShimError, AmbigousError } from "jpt-commons/errors";
import { verifyInstalledEntry } from "jpt-commons/verify-entry";
import { GameTree } from "jpt-commons/game-tree";
import { buildKeymap } from "../src/keymap.js";
import { buildGamepad } from "../src/gamepad.js";
import {
  ELDERFIELD,
  GLOBAL_DEFAULT,
  MOONSTONE,
  MONSTEREST_WASD_PROFILE,
  mergeProfile,
} from "../src/profiles.js";

const PROFILES = {
  "rg-rotate": GLOBAL_DEFAULT,
  monsterest: MONSTEREST_WASD_PROFILE,
  elderfield: ELDERFIELD,
  moonstone: MOONSTONE,
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
      `Dry run: would create gamepad.json in ${stagingDir}. Actually sorry gamepad isn't implemented yet.`,
    );
    console.log(gamepad);
  }

  return "ok";
};

const verify = async (gameDir, { profile = "rg-rotate" }) => {
  const tree = new GameTree(gameDir);
  const stagingDir = getDefaultPatchDir(tree.root, tree.gameName);

  const resolvedProfile = mergeProfile(PROFILES[profile] || {});
  const expectedKeymap = buildKeymap(resolvedProfile);

  console.log(
    `Verify: would create keymap.json in ${stagingDir} for device profile ${profile}`,
  );
  console.log(expectedKeymap);
  console.log(`----------`);
  console.log(
    `Would also create gamepad.json in ${stagingDir}. Actually sorry gamepad isn't implemented yet.`,
  );

  // Compare like-for-like:
  const installedRgaPath = path.join(stagingDir, "patch_input.rga");

  if (!existsSync(installedRgaPath)) {
    console.log("Not installed — run `install` first.");
    throw new AmbigousError(
      `Verified finished. Not installed — run \`install\` first.`,
    );
  }

  const verificationsResults = verifyInstalledEntry(
    stagingDir,
    "keymap.json",
    expectedKeymap,
  );

  console.log("keymap.json is:", verificationsResults);

  return "ok";
};

const remove = async (gameDir, { dryRun } = {}) => {
  return "stubbed";
};

const args = process.argv.slice(2);

const main = async () => {
  const [command, gameDir, ...options] = args;

  if (command !== "list" && args.length < 2) {
    console.error("Usage: joiplay-input <command> <game-dir> [options]");
    process.exit(1);
  }

  const isDryRun = options.includes("--dry-run");
  const profileIndex = options.indexOf("--profile");
  const profile =
    profileIndex !== -1 && options[profileIndex + 1]
      ? options[profileIndex + 1]
      : "rg-rotate";

  let result;

  switch (command) {
    case "list":
      console.log("Available profiles:");
      Object.keys(PROFILES).forEach((key) => {
        console.log(`- ${key}`, `${key === "rg-rotate" ? "(default)" : ""}`);
      });

      console.log(
        `Use --profile <profile-name> to select a profile when installing.`,
      );

      console.log(
        `Use verify --profile <profile-name> to check the keymap.json that would be generated for that profile`,
      );
      return 0;
    case "install":
      result = await install(gameDir, { dryRun: isDryRun, profile });
      break;
    case "verify":
      result = await verify(gameDir, { profile });
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
