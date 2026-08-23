import { GameTree } from "./game-tree.js";
import { AmbigousError, UnsupportedError, ShimError } from "./errors.js";

import { detectContruct3 } from "./adapters/contruct.js";
import { detectRgpMakerMz } from "./adapters/mz.js";
import { detectImpact } from "./adapters/impact.js";

const DETECTORS = [detectContruct3, detectRgpMakerMz, detectImpact];

async function unpackGameIfNeeded(tree, gameEngine) {
  const theContent = await tree.whereIsTheContent();
  if (theContent.unpackedNeeded) {
    console.log("Game is an exe, or has package.nw, needs unpacking...");

    const unpackedDir = await tree.unpackGame(theContent.where);
    return {
      contentTree: new GameTree(unpackedDir),
      isExe: true,
      ...theContent,
    };
  }
  return {
    contentTree: tree,
    isExe: false,
    ...theContent,
  };
}

export async function detectGameEngine(gameDir) {
  const results = [];
  const output = {
    engine: null,
    tree: null,
    treeIfExe: false,
    metadata: {},
  };

  console.log(`Detecting game engine in ${gameDir}...`);

  let tree = new GameTree(gameDir);
  const unpacked = await unpackGameIfNeeded(tree);
  tree = unpacked.contentTree;

  if (await tree.exists("js/rpg_core.js")) {
    throw new UnsupportedError("RPG Maker MV is not supported by this tool.");
  }

  for (const detect of DETECTORS) {
    const result = await detect(tree);
    if (result) {
      results.push(result);
    }
  }

  const decisive = results.filter((r) => r.decisive);
  const decisiveEngines = new Set(decisive.map((r) => r.engine));

  if (decisiveEngines.size > 1) {
    throw new AmbigousError(
      `Multiple engines detected: ${[...decisiveEngines].join(", ")}`,
    );
  }

  console.log(`Supported engines: ${DETECTORS.map((d) => d.name).join(", ")}`);
  console.log(`Detected engines: ${[...decisiveEngines].join(", ")}`);

  if (decisiveEngines.size === 1) {
    output.engine = [...decisiveEngines][0];
    output.tree = tree;
    output.treeIfExe = unpacked.isExe;
    output.metadata = decisive[0].metadata || {};
    return output;
  }

  console.log(`No supported NW.js game engine detected in ${gameDir}`);
  throw new UnsupportedError("No supported NW.js game engine detected.");
}
