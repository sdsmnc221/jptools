#!/usr/bin/env node

// joiplay-rg-input list                       show built-in profiles
// joiplay-input install <game-dir> [--profile rg-rotate] [--dry-run]
// joiplay-input verify  <game-dir>              are the shim files present and consistent, render the resulting keymap.json
// joiplay-input remove  <game-dir>              delete only files this tool created
// joiplay-input install --plug-mode             install with plug mode enabled (e.g. ab enabled)

import { ShimError } from "jpt-commons/errors";
import { install } from "../src/install.js";
import { verify } from "../src/verify.js";
import {
  ELDERFIELD,
  GLOBAL_DEFAULT,
  MOONSTONE,
  MONSTEREST_WASD_PROFILE,
  POKEMON_INSURGENCE,
  mergeProfile,
} from "../src/profiles.js";

const PROFILES = {
  "rg-rotate": GLOBAL_DEFAULT,
  monsterest: MONSTEREST_WASD_PROFILE,
  elderfield: ELDERFIELD,
  moonstone: MOONSTONE,
  "pokemon-insurgence": POKEMON_INSURGENCE,
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
  const plugMode = options.includes("--plug-mode");
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
      result = await install(gameDir, { dryRun: isDryRun, profile, plugMode });
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

  if (result.includes("ok")) {
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
