import { GameTree } from "jpt-commons/game-tree";
import { AmbigousError, UnsupportedError, ShimError } from "jpt-commons/errors";
import { getDefaultPatchDir } from "jpt-commons/rga";
import { verifyInstalledEntry } from "jpt-commons/verify-entry";
import { detectGameEngine } from "./detect.js";
import { packConstruct3 } from "./adapters/contruct.js";
import { packPatchRpgMakerMz } from "./adapters/mz.js";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { serializePatches } from "./verify-patches.js";

const VERIFIERS = {
  construct: packConstruct3,
  rpgmmz: packPatchRpgMakerMz,
};

export async function verifyShim(gameDir) {
  const results = [];
  const tree = new GameTree(gameDir);

  console.log(`Verifying shim for ${path.basename(gameDir)}...`);

  const detectionResult = await detectGameEngine(gameDir);

  console.log("Detection complete.");
  console.log(detectionResult.engine, "ready to shim");

  const verified = VERIFIERS[detectionResult.engine];
  if (!verified) {
    throw new UnsupportedError(
      `No shim available for engine ${detectionResult.engine}`,
    );
  }

  const contentTree = detectionResult.tree;
  const result = await verified(contentTree, detectionResult, { dryRun: true });

  const stagingDir = getDefaultPatchDir(tree.root, tree.gameName);
  const installedRgaPath = path.join(stagingDir, "patch.rga");

  if (!existsSync(installedRgaPath)) {
    console.log("Not installed — run `install` first.");
    throw new AmbigousError(
      `Verified finished. Not installed — run \`install\` first.`,
    );
  }

  // Compare like-for-like: `installed` was written through serializePatches
  // (which drops the `file` verification field), so `fresh` must be too,
  // or this reports STALE on every install, always, regardless of content.
  const fresh = serializePatches(result.patchesJsonContent);
  const verificationsResults = verifyInstalledEntry(
    stagingDir,
    "patches.json",
    fresh,
  );

  console.log("patches.json is:", verificationsResults);

  if (verificationsResults !== "ok") {
    throw new AmbigousError(
      `patches.json is ${verificationsResults} — re-run install.`,
    );
  }
  return "ok";
}
