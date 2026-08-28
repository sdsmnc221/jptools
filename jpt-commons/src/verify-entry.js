// generic "read entry from installed .rga, diff against fresh"
import { GameTree } from "./game-tree.js";
import { AmbigousError, UnsupportedError, ShimError } from "./errors.js";
import { getDefaultPatchDir, DEFAULT_PATCH_FILENAME } from "./rga.js";
import path from "node:path";
import { existsSync } from "node:fs";
import AdmZip from "adm-zip";

function stringifyForVerify(obj) {
  return JSON.stringify(obj, null, 2);
}

function normalizeInstalledContent(installed, freshContent) {
  if (typeof freshContent === "string") return installed;

  try {
    return JSON.parse(installed);
  } catch {
    return installed;
  }
}

export function verifyInstalledEntry(
  stagingDir,
  entryName,
  freshContent,
  patchFilename = DEFAULT_PATCH_FILENAME,
) {
  const rgaPath = path.join(stagingDir, patchFilename);
  if (!existsSync(rgaPath)) return "not-installed";
  const installed = new AdmZip(rgaPath).readAsText(entryName);
  const normalizedInstalled = normalizeInstalledContent(installed, freshContent);
  return stringifyForVerify(normalizedInstalled) === stringifyForVerify(freshContent)
    ? "ok"
    : installed === ""
      ? "not-installed"
      : "stale";
}
