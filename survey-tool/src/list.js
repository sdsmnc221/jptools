import { existsSync } from "fs";
import path from "path";
import { GameTree } from "jpt-commons/game-tree";
import {
  KNOWN_ENGINES,
  KNOWN_ENGINES_BRANDS,
} from "jpt-commons/utils/constants";
import { metadataRPGMaker } from "./metadata/rpgmaker.js";
import {
  RefinedDetectionResult,
  Metadata,
} from "./metadata/RefinedDetectionResult.js";

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
    detectionResults[child] = await coreDetection(path.join(gamesDir, child));
  }
  return detectionResults;
};

const coreDetection = async (gameDir) => {
  // | # | Engine | Marker |
  // | --- | --- | --- |
  // | 5 | Godot | any `.pck` with a verified `GDPC` header, **or** an `.exe` with a pack glued on (milestone 5) |

  const gameDirTree = new GameTree(gameDir);
  const result = {
    engine: null,
    evidences: [],
    metadata: null,
  };

  // Gather evidences
  const { files, dirs } = await gameDirTree.finder.rootIndex();
  // Unreal detection logic
  if (dirs.has("engine")) {
    result.evidences.push("Engine directory exists");
  }
  // exist sync of *-Shipping.exe inside folder or sub-folders
  //   for each top-level directory d:
  //     <d>/Binaries/<platform>/*-Shipping.exe exists  ->  d IS the project
  const topLevelDirectories = await gameDirTree.directChildren();
  if (topLevelDirectories.length > 0) {
    for (const dir of topLevelDirectories) {
      const binariesDir = path.join(gameDir, dir, "Binaries");
      if (!existsSync(binariesDir)) continue;

      const shippingExeExists = await gameDirTree.finder.fileNameMatches(
        /-Shipping\.exe$/,
        binariesDir,
      );
      if (shippingExeExists) {
        result.evidences.push(`Found -Shipping.exe in ${dir}`);
      }
    }
  }

  // Unity detection logic
  if (files.has("unityplayer.dll")) {
    result.evidences.push("Found UnityPlayer.dll");
  }
  if ([...dirs].some((d) => d.endsWith("_data"))) {
    result.evidences.push("Found *_Data directory");
  }

  // GameMaker detection logic
  if (files.has("data.win")) {
    result.evidences.push("Found data.win");
  }

  // RPG Maker detection logic
  if ([...files].some((f) => /^rgss.*\.dll$/.test(f))) {
    result.evidences.push("Found rgss*.dll");
  }

  // Godot detection logic
  // TODO

  // NW.js detection logic
  if (files.has("nw.dll")) {
    result.evidences.push("Found nw.dll");
  }
  if (files.has("package.nw")) {
    result.evidences.push("Found package.nw");
  }
  if (files.has("index.html")) {
    result.evidences.push("Found index.html");
  }
  if (files.has("package.json")) {
    result.evidences.push("Found package.json");
  }

  if (result.evidences.length > 0) {
    if (
      checkIfEvidenceExists(result.evidences, "Engine directory") &&
      checkIfEvidenceExists(result.evidences, "-Shipping.exe")
    ) {
      result.engine = KNOWN_ENGINES_BRANDS[KNOWN_ENGINES.UNREAL];
    }

    if (
      checkIfEvidenceExists(result.evidences, "UnityPlayer.dll") ||
      checkIfEvidenceExists(result.evidences, "*_Data")
    ) {
      result.engine = KNOWN_ENGINES_BRANDS[KNOWN_ENGINES.UNITY];
    }

    if (checkIfEvidenceExists(result.evidences, "data.win")) {
      result.engine = KNOWN_ENGINES_BRANDS[KNOWN_ENGINES.GM];
    }

    if (checkIfEvidenceExists(result.evidences, "rgss*.dll")) {
      result.engine = KNOWN_ENGINES_BRANDS[KNOWN_ENGINES.RPGM];
    }

    if (
      checkIfEvidenceExists(result.evidences, "nw.dll") ||
      checkIfEvidenceExists(result.evidences, "package.nw") ||
      (checkIfEvidenceExists(result.evidences, "index.html") &&
        checkIfEvidenceExists(result.evidences, "package.json"))
    ) {
      result.engine = KNOWN_ENGINES_BRANDS[KNOWN_ENGINES.NWJS];
    }
  } else {
    // not-a-game or unknown/custom engine
    if ([...files].some((f) => f.endsWith(".exe"))) {
      result.evidences.push("Found executable file");
    }
    if ([...files].some((f) => f.endsWith(".dll"))) {
      result.evidences.push("Found DLL file");
    }
    if (files.has("SDL3.dll")) {
      result.evidences.push("Found SDL3.dll");
    }

    if (result.evidences.length === 0) {
      result.evidences.push("No significant evidence found");
    } else {
      result.engine = KNOWN_ENGINES_BRANDS[KNOWN_ENGINES.CUSTOM];
    }
  }

  const { metadata, confidentGeneration, hasConflictingGeneration } =
    await refinedDetection({ files, dirs, gameDirTree }, result.engine);

  return { ...result, confidentGeneration, metadata, hasConflictingGeneration };
};

const refinedDetection = async (
  { files, dirs, gameDirTree },
  possibleEngine,
) => {
  let result = new RefinedDetectionResult();
  switch (possibleEngine) {
    case KNOWN_ENGINES_BRANDS[KNOWN_ENGINES.UNREAL]:
      // Add Unreal-specific metadata refinement here
      break;
    case KNOWN_ENGINES_BRANDS[KNOWN_ENGINES.UNITY]:
      // Add Unity-specific metadata refinement here
      break;
    case KNOWN_ENGINES_BRANDS[KNOWN_ENGINES.GM]:
      // Add GameMaker-specific metadata refinement here
      break;
    case KNOWN_ENGINES_BRANDS[KNOWN_ENGINES.RPGM]:
      result = await metadataRPGMaker(files, dirs, gameDirTree);
      break;
    case KNOWN_ENGINES_BRANDS[KNOWN_ENGINES.NWJS]:
      // Add NW.js-specific metadata refinement here
      break;
    case KNOWN_ENGINES_BRANDS[KNOWN_ENGINES.CUSTOM]:
      result = new RefinedDetectionResult(
        [
          new Metadata(null, null, {
            engine: "custom",
            reason: "Custom or unknown engine",
            details: "Real game detected, but the engine is custom or unknown.",
          }),
        ],
        null,
        false,
      );
      break;
    default:
      result = new RefinedDetectionResult(
        [
          new Metadata(null, null, {
            engine: "not-a-game",
            reason: "Not a game",
            details:
              "No significant evidence of a known game engine was found.",
          }),
        ],
        null,
        false,
      );
      break;
  }
  return result;
};

export { listGames };
