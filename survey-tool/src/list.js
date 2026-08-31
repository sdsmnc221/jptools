import { readdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { GameTree } from "jpt-commons/game-tree";
import {
  KNOWN_ENGINES,
  KNOWN_ENGINES_BRANDS,
} from "jpt-commons/utils/constants";

const checkIfEvidenceExists = (evidences, keyword) => {
  return evidences.some((evidence) => evidence.includes(keyword));
};

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
  // | 5 | Godot | any `.pck` with a verified `GDPC` header, **or** an `.exe` with a pack glued on (milestone 5) |

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
    const unityPlayerDll = await gameDirTree.fileExists("UnityPlayer.dll");
    if (unityPlayerDll) {
      result.evidences.push("Found UnityPlayer.dll");
    }
    const dataDir = await gameDirTree.fileExists("_Data");
    if (dataDir) {
      result.evidences.push("Found *_Data directory");
    }

    // GameMaker detection logic
    const dataWin = await gameDirTree.fileExists("data.win");
    if (dataWin) {
      result.evidences.push("Found data.win");
    }

    // RPG Maker detection logic
    const rgssDll = await gameDirTree.fileExists("RGSS");
    if (rgssDll) {
      result.evidences.push("Found RGSS*.dll");
    }

    // Godot detection logic
    // TODO

    // NW.js detection logic
    const nwDll = await gameDirTree.fileExists("nw.dll");
    if (nwDll) {
      result.evidences.push("Found nw.dll");
    }
    const packageNw = await gameDirTree.fileExists("package.nw");
    if (packageNw) {
      result.evidences.push("Found package.nw");
    }
    const indexHtml = await gameDirTree.fileExists("index.html");
    if (indexHtml) {
      result.evidences.push("Found index.html");
    }
    const packageJson = await gameDirTree.fileExists("package.json");
    if (packageJson) {
      result.evidences.push("Found package.json");
    }

    break;
  }

  if (result.evidences.length > 0) {
    if (
      checkIfEvidenceExists(result.evidences, "Engine directory") &&
      checkIfEvidenceExists(result.evidences, "-Shipping.exe")
    ) {
      result.engine = KNOWN_ENGINES_BRANDS[KNOWN_ENGINES.UNREAL];
      return result;
    }

    if (
      checkIfEvidenceExists(result.evidences, "UnityPlayer.dll") ||
      checkIfEvidenceExists(result.evidences, "*_Data")
    ) {
      result.engine = KNOWN_ENGINES_BRANDS[KNOWN_ENGINES.UNITY];
      return result;
    }

    if (checkIfEvidenceExists(result.evidences, "data.win")) {
      result.engine = KNOWN_ENGINES_BRANDS[KNOWN_ENGINES.GM];
      return result;
    }

    if (checkIfEvidenceExists(result.evidences, "RGSS*.dll")) {
      result.engine = KNOWN_ENGINES_BRANDS[KNOWN_ENGINES.RPGM];
      return result;
    }

    if (
      checkIfEvidenceExists(result.evidences, "nw.dll") ||
      checkIfEvidenceExists(result.evidences, "package.nw") ||
      (checkIfEvidenceExists(result.evidences, "index.html") &&
        checkIfEvidenceExists(result.evidences, "package.json"))
    ) {
      result.engine = KNOWN_ENGINES_BRANDS[KNOWN_ENGINES.NWJS];
      return result;
    }
  }

  return result;
};

export { listGames };
