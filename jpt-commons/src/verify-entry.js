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

export function verifyInstalledEntry(stagingDir, entryName, freshContent) {
  const rgaPath = path.join(stagingDir, DEFAULT_PATCH_FILENAME);
  if (!existsSync(rgaPath)) return "not-installed";
  const installed = new AdmZip(rgaPath).readAsText(entryName);
  return stringifyForVerify(installed) === stringifyForVerify(freshContent)
    ? "ok"
    : installed === ""
      ? "not-installed"
      : "stale";
}
