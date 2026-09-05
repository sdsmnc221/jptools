import { existsSync } from "fs";
import path from "path";
import { GameTree } from "jpt-commons/game-tree";
import {
  KNOWN_ENGINES,
  KNOWN_ENGINES_BRANDS,
  KNOWN_ENGINES_EVIDENCES,
  EVIDENCES,
} from "jpt-commons/utils/constants";
import {
  metadataRPGMaker,
  RGSS_REGEXP,
  RGSS_ARCHIVE_REGEXP,
  RDATA_REGEXP,
} from "./metadata/rpgmaker.js";
import {
  RefinedDetectionResult,
  Metadata,
} from "./metadata/RefinedDetectionResult.js";

const checkIfEvidenceExists = (evidences, keywords) => {
  return keywords.some((keyword) => evidences.includes(keyword));
};

const listGames = async (gamesDir) => {
  const gamesTree = new GameTree(gamesDir);

  if (!(await gamesTree.directoryExists("."))) {
    throw new Error(`Games directory does not exist: ${gamesTree.root}`);
  }

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
    result.evidences.push(EVIDENCES.ENGINE_DIRECTORY);
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
        result.evidences.push(EVIDENCES.SHIPPING_EXE);
      }
    }
  }

  // Unity detection logic
  if (files.has("unityplayer.dll")) {
    result.evidences.push(EVIDENCES.UNITY_PLAYER_DLL);
  }
  if ([...dirs].some((d) => /_data$/i.test(d))) {
    result.evidences.push(EVIDENCES.UNITY_DATA_DIRECTORY);
  }

  // GameMaker detection logic
  if (files.has("data.win")) {
    result.evidences.push(EVIDENCES.DATA_WIN);
  }

  // RPG Maker detection logic
  if ([...files].some((f) => RGSS_REGEXP.test(f))) {
    result.evidences.push(EVIDENCES.RGSS_DATA_FILES);
  }
  if (files.has("game.ini")) {
    result.evidences.push(EVIDENCES.GAME_INI);
  }
  if ([...dirs].some((d) => d === "data")) {
    const dataDirTree = new GameTree(
      path.join(
        gameDirTree.root,
        gameDirTree.finder.lookupOriginalByName("data", {
          file: false,
        }),
      ),
    );
    const { files: dataFiles } = await dataDirTree.finder.rootIndex();

    if ([...dataFiles].some((f) => RDATA_REGEXP.test(f))) {
      result.evidences.push(EVIDENCES.RPGM_DATA_FILES);
    }
  }
  if ([...files].some((f) => RGSS_ARCHIVE_REGEXP.test(f))) {
    result.evidences.push(EVIDENCES.RPG_MAKER_ARCHIVE);
  }

  // Godot detection logic
  // TODO

  // NW.js detection logic
  if (files.has("nw.dll")) {
    result.evidences.push(EVIDENCES.NW_DLL);
  }
  if (files.has("package.nw")) {
    result.evidences.push(EVIDENCES.PACKAGE_NW);
  }
  if (files.has("index.html")) {
    result.evidences.push(EVIDENCES.INDEX_HTML);
  }
  if (files.has("package.json")) {
    result.evidences.push(EVIDENCES.PACKAGE_JSON);
  }

  // Custom/Unknown engine detection logic
  if ([...files].some((f) => f.endsWith(".exe"))) {
    result.evidences.push(EVIDENCES.EXE_FOUND);
  }
  if ([...files].some((f) => f.endsWith(".dll"))) {
    result.evidences.push(EVIDENCES.DLL_FILE);
  }
  if (files.has("SDL3.dll")) {
    result.evidences.push(EVIDENCES.SDL3_DLL);
  }

  // engine: null,  reason: "not-a-game"     no exe, no engine marker
  // engine: null,  reason: "unsupported"    real game, unrecognised engine
  // Decide "is this a game at all" independently of "did an engine match":
  // always gather the generic evidence, then classify.
  // engine matched, else any executable evidence means unsupported, else not-a-game.

  if (result.evidences.length === 0) {
    result.evidences.push(EVIDENCES.NOT_A_GAME);
    result.engine = null;
  } else {
    if (
      checkIfEvidenceExists(result.evidences, KNOWN_ENGINES_EVIDENCES.IS_A_GAME)
    ) {
      result.engine = KNOWN_ENGINES_BRANDS[KNOWN_ENGINES.UNSUPPORTED];
    }

    if (
      checkIfEvidenceExists(
        result.evidences,
        KNOWN_ENGINES_EVIDENCES[KNOWN_ENGINES.UNREAL],
      )
    ) {
      result.engine = KNOWN_ENGINES_BRANDS[KNOWN_ENGINES.UNREAL];
    }

    if (
      checkIfEvidenceExists(
        result.evidences,
        KNOWN_ENGINES_EVIDENCES[KNOWN_ENGINES.UNITY],
      )
    ) {
      result.engine = KNOWN_ENGINES_BRANDS[KNOWN_ENGINES.UNITY];
    }

    if (
      checkIfEvidenceExists(
        result.evidences,
        KNOWN_ENGINES_EVIDENCES[KNOWN_ENGINES.GM],
      )
    ) {
      result.engine = KNOWN_ENGINES_BRANDS[KNOWN_ENGINES.GM];
    }

    if (
      checkIfEvidenceExists(
        result.evidences,
        KNOWN_ENGINES_EVIDENCES[KNOWN_ENGINES.RPGM],
      )
    ) {
      result.engine = KNOWN_ENGINES_BRANDS[KNOWN_ENGINES.RPGM];
    }

    if (
      checkIfEvidenceExists(
        result.evidences,
        KNOWN_ENGINES_EVIDENCES[KNOWN_ENGINES.NWJS],
      )
    ) {
      result.engine = KNOWN_ENGINES_BRANDS[KNOWN_ENGINES.NWJS];
    }
  }

  result.reason = result.engine
    ? EVIDENCES.ENGINE_DETECTED
    : checkIfEvidenceExists(result.evidences, KNOWN_ENGINES_EVIDENCES.IS_A_GAME)
      ? EVIDENCES.UNSUPPORTED
      : EVIDENCES.NOT_A_GAME;

  const { metadata, reason, confidentGeneration, hasConflictingGeneration } =
    await refinedDetection(
      { files, dirs, gameDirTree },
      result.engine,
      result.reason,
    );

  return {
    ...result,
    ...(reason ? { reason } : {}),
    confidentGeneration,
    metadata,
    hasConflictingGeneration,
  };
};

const refinedDetection = async (
  { files, dirs, gameDirTree },
  possibleEngine,
  classificationReason,
) => {
  let result;
  switch (classificationReason) {
    case EVIDENCES.NOT_A_GAME:
      return new RefinedDetectionResult({
        metadata: [
          new Metadata(null, null, {
            engine: possibleEngine,
            reason: classificationReason,
          }),
        ],
        confidentGeneration: null,
        hasConflictingGeneration: false,
        reason: "No significant evidence of a known game engine was found.",
      });
    case EVIDENCES.UNSUPPORTED:
      return new RefinedDetectionResult({
        metadata: [
          new Metadata(null, null, {
            engine: possibleEngine,
            reason: classificationReason,
          }),
        ],
        confidentGeneration: null,
        hasConflictingGeneration: false,
        reason: "Unsupported game engine.",
      });
    default:
      result = new RefinedDetectionResult();
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
          return await metadataRPGMaker(files, dirs, gameDirTree);
          break;
        case KNOWN_ENGINES_BRANDS[KNOWN_ENGINES.NWJS]:
          // Add NW.js-specific metadata refinement here
          break;
      }
      break;
  }
  return result;
};

export { listGames };
