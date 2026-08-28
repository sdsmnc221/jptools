// packGame + createShimFile + the <gameName>_patch/ convention

import path from "node:path";
import { rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { GameTreeError } from "./errors.js";
import AdmZip from "adm-zip";

export async function createShimFile(shimFileName, content, dir) {
  console.log(`Creating shim file ${shimFileName} in ${dir}`);
  const filePath = path.join(dir, shimFileName);

  try {
    await writeFile(filePath, content, "utf-8");
  } catch (error) {
    throw new GameTreeError(
      `Failed to write shim file ${filePath}: ${error.message}`,
    );
  }

  return filePath;
}

const DEFAULT_PACK_EXT = ".rga";
export const DEFAULT_PATCH_FILENAME = "patch" + DEFAULT_PACK_EXT;
const DEFAULT_PATCH_DIRNAME = "_patch";

export function getDefaultPatchDir(gameDir, gameName) {
  return path.join(gameDir, "..", gameName + DEFAULT_PATCH_DIRNAME);
}

export async function packGame(
  gameDir,
  gameName,
  files,
  options = { defaultPatchFilename: DEFAULT_PATCH_FILENAME },
) {
  const outputPatchDir = getDefaultPatchDir(gameDir, gameName);

  // if game content already packed, overwrite it
  const outputFilePath = path.join(
    outputPatchDir,
    options.defaultPatchFilename ?? DEFAULT_PATCH_FILENAME,
  );

  console.log(`Game content already packed, overwriting ${outputFilePath}`);
  rmSync(outputFilePath, { force: true });

  // DEPRECATED, zip not available on all platforms
  // Using adm-zip instead
  const zip = new AdmZip();
  for (const file of files) {
    zip.addLocalFile(file, "", path.basename(file));
  }
  zip.writeZip(outputFilePath);

  const result = {
    outputFilePath,
    files: files,
  };

  // clean up the temporary files
  for (const file of files) {
    rmSync(file, { force: true });
  }

  return result;
}
