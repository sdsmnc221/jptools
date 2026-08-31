import { readdir } from "node:fs/promises";

const isMacMetaFile = (filename) =>
  filename.startsWith("._") || filename == ".DS_Store";

export class Finder {
  constructor(root) {
    this.root = root;
  }

  async rootIndex() {
    //  one readdir, returns { files, dirs }
    // files: Set of lowercase names that are files
    // dirs:  Set of lowercase names that are directories
    const entries = await readdir(this.root, { withFileTypes: true });
    const files = [];
    const dirs = [];
    for (const entry of entries) {
      if (isMacMetaFile(entry.name)) continue;
      if (entry.isFile()) files.push(entry.name);
      if (entry.isDirectory()) dirs.push(entry.name);
    }
    return {
      files: new Set(files.map((f) => f.toLowerCase())),
      dirs: new Set(dirs.map((d) => d.toLowerCase())),
    };
  }

  async findEntry(matcher, dir = this.root) {
    const entries = await readdir(dir, {
      withFileTypes: true,
      recursive: true,
    });

    return entries.some((entry) => {
      if (isMacMetaFile(entry.name)) return false;
      return matcher(entry);
    });
  }

  async fileExists(filename, dir = this.root) {
    return this.findEntry(
      (entry) => entry.isFile() && entry.name === filename,
      dir,
    );
  }

  async directoryExists(dirname, dir = this.root) {
    return this.findEntry(
      (entry) => entry.isDirectory() && entry.name === dirname,
      dir,
    );
  }

  async fileNameMatches(pattern, dir = this.root) {
    return this.findEntry(
      (entry) => entry.isFile() && pattern.test(entry.name),
      dir,
    );
  }

  async directoryNameMatches(pattern, dir = this.root) {
    return this.findEntry(
      (entry) => entry.isDirectory() && pattern.test(entry.name),
      dir,
    );
  }
}
