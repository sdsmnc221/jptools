import { readdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { GameTree } from "jpt-commons/game-tree";
import {
  KNOWN_ENGINES,
  KNOWN_ENGINES_BRANDS,
} from "jpt-commons/utils/constants";

const listGames = async (gamesDir) => {
  const gamesTree = new GameTree(gamesDir);

  let detectionResults = {};
  // Return the list of direct child directories
  const directChildren = await gamesTree.directChildren();
  console.log(
    `This directory contains ${directChildren.length} direct child directories.`,
  );

  for (const child of directChildren) {
    detectionResults[child] = await cheapDetection(path.join(gamesDir, child));
  }
  return detectionResults;
};

const cheapDetection = async (gameDir) => {
  // | # | Engine | Marker |
  // | --- | --- | --- |
  // | 2 | Unity | `UnityPlayer.dll`, or a `*_Data` directory |
  // | 3 | GameMaker | a file named `data.win` |
  // | 4 | RPG Maker XP/VX/VXAce | a file matching `RGSS*.dll` |
  // | 5 | Godot | any `.pck` with a verified `GDPC` header, **or** an `.exe` with a pack glued on (milestone 5) |
  // | 6 | nw.js family | `nw.dll`, or `package.nw`, or `index.html` + `package.json` |

  const gameDirTree = new GameTree(gameDir);
  const result = {
    engine: null,
    evidences: [],
    metadata: null,
  };

  for (const entry of await readdir(gameDir, { withFileTypes: true })) {
    // Unreal detection logic
    const engineDir = path.join(gameDir, "Engine");
    if (existsSync(engineDir)) {
      result.evidences.push("Engine directory exists");

      // exist sync of *-Shipping.exe inside folder or sub-folders
      if (await gameDirTree.fileExists("-Shipping.exe")) {
        result.evidences.push("Found -Shipping.exe in Content/Paks");
      }
      break;
    }

    // Unity detection logic
  }

  if (result.evidences.length > 0) {
    if (
      result.evidences.includes("Engine directory exists") &&
      result.evidences.some((evidence) => evidence.includes("-Shipping.exe"))
    ) {
      result.engine = KNOWN_ENGINES_BRANDS[KNOWN_ENGINES.UNREAL];
    }
  }

  return result;
};

export { listGames };
