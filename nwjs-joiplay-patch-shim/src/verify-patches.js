import { execFileSync } from "node:child_process";
import path from "node:path";
import { ShimError } from "./errors.js";

/**
 * A patches.json `key` is a blind string match. If it is absent from the game,
 * JoiPlay replaces nothing and reports nothing -> the patch silently does
 * nothing, and the only symptom is the bug still being there on device.
 *
 * So every key is counted against the file it targets before the patch ships.
 *
 *   0 matches  the anchor is wrong (typo, or a different build of the game)
 *   1 match    good
 *   2+ matches the replacement lands in places that were not intended
 *
 * Content is read from the game folder when the game is loose, and straight out
 * of package.nw when it is packed -< JoiPlay serves from the archive, so that is
 * what its patcher will actually see.
 */

/** Read one file from the game, whether it is loose on disk or inside package.nw. */
export async function readGameFile(tree, relativePath) {
  if (await tree.exists(relativePath)) {
    return tree.readText(relativePath);
  }
  if (await tree.exists("package.nw")) {
    try {
      return execFileSync(
        "unzip",
        ["-p", path.join(tree.root, "package.nw"), relativePath],
        { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
      );
    } catch {
      return null; // not in the archive either
    }
  }
  return null;
}

/**
 * Count each patch key in its target file.
 *
 * Patches carry an optional `file`. Without one the patch cannot be verified,
 * which is reported rather than silently passed.
 */
export async function verifyPatches(tree, patchesBySection) {
  const results = [];
  const cache = new Map();

  for (const [section, patches] of Object.entries(patchesBySection)) {
    for (const patch of patches) {
      const target = patch.file;
      if (!target) {
        results.push({ section, patch, file: null, count: null, ok: null });
        continue;
      }
      if (!cache.has(target))
        cache.set(target, await readGameFile(tree, target));
      const content = cache.get(target);
      if (content === null) {
        results.push({
          section,
          patch,
          file: target,
          count: null,
          ok: false,
          missing: true,
        });
        continue;
      }
      const count = content.split(patch.key).length - 1;
      results.push({ section, patch, file: target, count, ok: count === 1 });
    }
  }
  return results;
}

/** Human-readable report. Returns true if every verifiable patch matched once. */
export function reportVerification(results) {
  let allOk = true;
  for (const r of results) {
    const key =
      r.patch.key.length > 58 ? r.patch.key.slice(0, 55) + "..." : r.patch.key;
    if (r.count === null && r.missing) {
      console.log(`  ✗ ${r.file} not found in the game — ${key}`);
      allOk = false;
    } else if (r.count === null) {
      console.log(`  ? no target file declared — ${key}`);
    } else {
      const mark = r.ok ? "✓" : "✗";
      console.log(
        `  ${mark} ${String(r.count).padStart(2)}  ${r.file}  ${key}`,
      );
      if (!r.ok) allOk = false;
    }
  }
  return allOk;
}

/** Throw unless every verifiable patch matched exactly once. */
export function assertPatchesMatch(results) {
  const bad = results.filter((r) => r.ok === false);
  if (bad.length) {
    const lines = bad.map(
      (r) =>
        `  ${r.missing ? "missing file" : r.count + " matches"}: ${r.file ?? "?"} — ${r.patch.key}`,
    );
    throw new ShimError(
      `${bad.length} patch key(s) did not match exactly once:\n${lines.join("\n")}`,
    );
  }
}

/**
 * Serialise patchesBySection for JoiPlay, dropping the `file` field.
 *
 * `file` is verification metadata this tool uses to check a key matched
 * before shipping -< JoiPlay's own patcher reads only `key` and `value`, so
 * `file` has no purpose on the device.
 */
export function serializePatches(patchesBySection) {
  const clean = Object.fromEntries(
    Object.entries(patchesBySection).map(([section, patches]) => [
      section,
      patches.map(({ key, value }) => ({ key, value })),
    ]),
  );
  return JSON.stringify(clean, null, 2);
}
