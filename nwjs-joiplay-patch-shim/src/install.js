import { GameTree } from "./game-tree.js";
import { AmbigousError, UnsupportedError, ShimError } from "./errors.js";
import { detectGameEngine } from "./detect.js";
import { shimContruct3 } from "./adapters/contruct.js";
import { shimRpgMakerMz } from "./adapters/mz.js";

const SHIMMERS = {
  construct: shimContruct3,
  rpgmmz: shimRpgMakerMz,
};

export async function installShimToGame(detectionResult, options = {}) {
  const results = [];

  console.log(`Installing shim for ${detectionResult.engine}...`);

  const shim = SHIMMERS[detectionResult.engine];
  if (!shim) {
    throw new UnsupportedError(
      `No shim available for engine ${detectionResult.engine}`,
    );
  }

  const contentTree = detectionResult.tree;
  const result = await shim(contentTree, detectionResult, options);

  if (result) {
    return "ok";
  } else {
    throw new AmbigousError(
      `Shim for engine ${detectionResult.engine} returned no result`,
    );
  }
}
