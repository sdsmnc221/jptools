import { GameTree } from "jpt-commons/game-tree";
import { getDefaultPatchDir } from "jpt-commons/rga";
import { existsSync } from "fs";
import path from "path";
import { AmbigousError } from "jpt-commons/errors";
import { verifyInstalledEntry } from "jpt-commons/verify-entry";

import { buildKeymap } from "./keymap.js";
import { mergeProfile, PROFILES } from "./profiles.js";

const verify = async (gameDir, { profile = "rg-rotate" }) => {
  const tree = new GameTree(gameDir);
  const stagingDir = getDefaultPatchDir(tree.root, tree.gameName);

  const resolvedProfile = mergeProfile(PROFILES[profile] || {});
  const expectedKeymap = buildKeymap(resolvedProfile);

  console.log(
    `Verify: would create keymap.json in ${stagingDir} for device profile ${profile}`,
  );
  console.log(expectedKeymap);
  // Compare like-for-like:
  const installedRgaPath = path.join(stagingDir, "patch_input.rga");

  if (!existsSync(installedRgaPath)) {
    console.log("Not installed — run `install` first.");
    throw new AmbigousError(
      `Verified finished. Not installed — run \`install\` first.`,
    );
  }

  const verificationsResults = verifyInstalledEntry(
    stagingDir,
    "keymap.json",
    expectedKeymap,
    "patch_input.rga",
  );

  console.log("keymap.json is:", verificationsResults);

  return "ok";
};

export { verify };
