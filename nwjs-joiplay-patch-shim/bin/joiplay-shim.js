#!/usr/bin/env node

// joiplay-shim detect  <game-dir>              what engine, what evidence, what it would do
// joiplay-shim install <game-dir> [--profile rg-rotate] [--dry-run]
// joiplay-shim verify  <game-dir>              are the shim files present and consistent
// joiplay-shim remove  <game-dir>              delete only files this tool created

import { detectGameEngine } from "../src/detect.js";
import { installShimToGame } from "../src/install.js";
import { verifyShim } from "../src/verify.js";
import { removeShim } from "../src/remove.js";
import { scanMedia } from "../src/scan-media.js";
import { ShimError } from "jpt-commons/errors";
import { GameTree } from "jpt-commons/game-tree";

const args = process.argv.slice(2);

const main = async () => {
  if (args.length < 2) {
    console.error("Usage: joiplay-shim <command> <game-dir> [options]");
    process.exit(1);
  }

  const [command, gameDir, ...options] = args;

  const isDryRun = options.includes("--dry-run");

  let result;

  switch (command) {
    case "detect":
      const detectionResult = await detectGameEngine(gameDir);
      console.log(detectionResult.engine, "ready to shim");
      return 0;
    case "install":
      result = await installShimToGame(gameDir, { dryRun: isDryRun });
      break;
    case "verify":
      result = await verifyShim(gameDir);
      break;
    case "remove":
      result = await removeShim(gameDir, { dryRun: isDryRun });
      break;
    case "scan-media":
      result = await scanMedia(gameDir);
      console.log("Media scan result:", result);
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
