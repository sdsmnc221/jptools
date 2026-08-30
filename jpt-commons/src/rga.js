// packGame + createShimFile + the <gameName>_patch/ convention

import path from "node:path";
import { rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { writeFile, readdir, lstat } from "node:fs/promises";
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

async function listPayloadFiles(root) {
  const files = [];

  async function walk(directory) {
    for (const entry of await readdir(directory, {
      withFileTypes: true,
    })) {
      const absolutePath = path.join(directory, entry.name);

      if (entry.isSymbolicLink()) {
        throw new GameTreeError(
          `Refusing symbolic link in RGA payload: ${absolutePath}`,
        );
      }

      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }

      if (!entry.isFile()) {
        throw new GameTreeError(`Unsupported payload entry: ${absolutePath}`);
      }

      files.push(path.relative(root, absolutePath));
    }
  }

  await walk(root);
  return files.sort();
}

export async function writeRgaFromDirectory(payloadDir, outputFilePath) {
  const resolvedPayloadDir = path.resolve(payloadDir);
  const relativeFiles = await listPayloadFiles(resolvedPayloadDir);

  if (relativeFiles.length === 0) {
    throw new GameTreeError(
      `Cannot create an empty RGA from ${resolvedPayloadDir}`,
    );
  }

  const zip = new AdmZip();
  const archiveEntries = [];

  for (const relativeFile of relativeFiles) {
    const archivePath = relativeFile.split(path.sep).join("/");

    const normalized = path.posix.normalize(archivePath);

    if (
      !normalized ||
      normalized.startsWith("/") ||
      normalized === ".." ||
      normalized.startsWith("../") ||
      normalized !== archivePath
    ) {
      throw new GameTreeError(`Unsafe RGA archive path: ${relativeFile}`);
    }

    const sourcePath = path.join(resolvedPayloadDir, relativeFile);

    const sourceStat = await lstat(sourcePath);

    if (!sourceStat.isFile()) {
      throw new GameTreeError(
        `RGA source is not a regular file: ${sourcePath}`,
      );
    }

    const archiveDirectory = path.posix.dirname(archivePath);

    zip.addLocalFile(
      sourcePath,
      archiveDirectory === "." ? "" : archiveDirectory,
      path.posix.basename(archivePath),
    );

    archiveEntries.push(archivePath);
  }

  zip.writeZip(outputFilePath);

  return {
    outputFilePath,
    archiveEntries,
  };
}

function hashBuffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export function verifyRgaArchive(
  outputFilePath,
  { expectedEntries, requiredEntries = [], hashedEntries = [] },
) {
  const writtenZip = new AdmZip(outputFilePath);

  const writtenEntries = writtenZip
    .getEntries()
    .filter((entry) => !entry.isDirectory)
    .map((entry) => entry.entryName)
    .sort();

  const expected = [...expectedEntries].sort();

  if (JSON.stringify(writtenEntries) !== JSON.stringify(expected)) {
    throw new GameTreeError(
      `RGA entries do not match the payload:\n` +
        `Expected: ${JSON.stringify(expected)}\n` +
        `Actual: ${JSON.stringify(writtenEntries)}`,
    );
  }

  for (const requiredEntry of requiredEntries) {
    if (!writtenEntries.includes(requiredEntry)) {
      throw new GameTreeError(
        `RGA is missing required entry: ${requiredEntry}`,
      );
    }
  }

  for (const { archivePath, sha256 } of hashedEntries) {
    const entry = writtenZip.getEntry(archivePath);

    if (!entry) {
      throw new GameTreeError(`RGA is missing hashed entry: ${archivePath}`);
    }

    const actualHash = hashBuffer(entry.getData());

    if (actualHash !== sha256) {
      throw new GameTreeError(
        `RGA hash mismatch for ${archivePath}: ` +
          `expected ${sha256}, got ${actualHash}`,
      );
    }
  }

  return {
    archiveEntries: writtenEntries,
  };
}
