// remove — delete the staging directory this tool creates (<gameName>_patch/,
// a sibling of the game folder, never a location inside it). Everything the
// tool ever writes lives there, so removing the whole directory is both
// sufficient and safe by construction: a sibling directory can never reach
// into the game folder, so there is no filename-collision risk the way a
// per-file resolve-against-the-game-root loop would have.

import path from "node:path";
import { rmSync, existsSync } from "node:fs";
import { GameTree } from "jpt-commons/game-tree";
import { GameTreeError } from "jpt-commons/errors";
import { getDefaultPatchDir } from "jpt-commons/rga";

export async function removeShim(gameDir, { dryRun = false } = {}) {
  if (dryRun) {
    console.log("Dry run mode: no files will be deleted.");
  }

  const tree = new GameTree(gameDir);
  const patchDir = getDefaultPatchDir(tree.root, tree.gameName);

  if (!existsSync(patchDir)) {
    console.log(`Nothing to remove — ${patchDir} does not exist.`);
    return "ok";
  }

  console.log(`Removing patch directory ${patchDir}`);
  try {
    if (!dryRun) {
      rmSync(patchDir, { recursive: true, force: true });
    }
  } catch (error) {
    throw new GameTreeError(
      `Failed to remove patch directory ${patchDir}: ${error.message}`,
    );
  }
  console.log(
    dryRun ? "Would remove patch directory" : "Patch directory removed",
  );

  return "ok";
}
