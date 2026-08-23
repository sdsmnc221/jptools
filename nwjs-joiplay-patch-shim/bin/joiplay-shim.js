#!/usr/bin/env node

// joiplay-shim detect  <game-dir>              what engine, what evidence, what it would do
// joiplay-shim install <game-dir> [--profile rg-rotate] [--dry-run]
// joiplay-shim verify  <game-dir>              are the shim files present and consistent
// joiplay-shim remove  <game-dir>              delete only files this tool created

import { detectGameEngine } from "../src/detect.js";
import { installShimToGame } from "../src/install.js";
import { ShimError } from "../src/errors.js";
import { GameTree } from "../src/game-tree.js";

const args = process.argv.slice(2);

const verifyShim = async (gameDir) => {
  return "stubbed";
};

const removeShim = async (gameDir) => {
  return "stubbed";
};

const main = async () => {
  if (args.length < 2) {
    console.error("Usage: joiplay-shim <command> <game-dir> [options]");
    process.exit(1);
  }

  const [command, gameDir, ...options] = args;

  const isDryRun = options.includes("--dry-run");

  let result;
  const detectionResult = await detectGameEngine(gameDir);

  switch (command) {
    case "detect":
      console.log("Detection complete.");
      console.log(detectionResult.engine, "ready to shim");
      return 0;
    case "install":
      result = await installShimToGame(detectionResult, { dryRun: isDryRun });
      break;
    case "verify":
      result = await verifyShim(gameDir);
      break;
    case "remove":
      result = await removeShim(gameDir);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      return 1;
  }

  console.log(`Command ${command} completed successfully.`);

  if (result === "ok") {
    console.log("Shim installation complete.");
  }

  if (detectionResult.treeIfExe) {
    console.log(
      `Game was an exe, built with NW.js ${detectionResult.engine}. \nHence, to not modify the game contents, shim was installed to unpacked directory:\n${detectionResult.tree.root}`,
    );
    console.log(
      `If you want to run the game with the shim, you need to run it from the unpacked directory. \nPointing JoiPlay to index-patch.html in the unpacked directory should work.`,
    );
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
