#!/usr/bin/env node

// joiplay-survey list <games-dir>
// joiplay-survey scan <games-dir>

import { createShimFile, packGame, getDefaultPatchDir } from "jpt-commons/rga";
import { ShimError, AmbigousError } from "jpt-commons/errors";
import { verifyInstalledEntry } from "jpt-commons/verify-entry";
import { GameTree } from "jpt-commons/game-tree";
import { listGames } from "../src/list.js";

const args = process.argv.slice(2);

const main = async () => {
  const [command, gameDir, ...options] = args;

  if (command !== "list" && args.length < 2) {
    console.error("Usage: joiplay-survey <command> <games-dir> [options]");
    process.exit(1);
  }

  const isDryRun = options.includes("--dry-run");

  let result;

  switch (command) {
    case "list":
      result = await listGames(gameDir);
      console.log(result);
      return 0;
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
