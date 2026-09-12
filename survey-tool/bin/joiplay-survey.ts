#!/usr/bin/env node

// joiplay-survey list <games-dir>
// joiplay-survey scan <games-dir>

import { ShimError } from "jpt-commons/errors";
import { listGames } from "../src/list.ts";

const args = process.argv.slice(2);

const main = async () => {
  const [command, gameDir, ...options] = args;

  if (command !== "list" && args.length < 2) {
    console.error("Usage: joiplay-survey <command> <games-dir> [options]");
    process.exit(1);
  }

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

  return 0;
};

try {
  process.exitCode = await main();
} catch (error: unknown) {
  if (error instanceof ShimError) {
    console.error(`Error: ${error.message}`);
    process.exitCode = error.exitCode;
  } else {
    console.error(`Unexpected error": ${(error as Error).message}`, error);
    process.exitCode = 10;
  }
}
