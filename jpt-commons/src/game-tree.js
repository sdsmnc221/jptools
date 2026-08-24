import { readdir, readFile, stat, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { GameTreeError } from "jpt-commons/errors";
import { rmSync } from "node:fs";
import AdmZip from "adm-zip";

export class GameTree {
  constructor(root) {
    this.root = path.resolve(root);
    this.gameName = path.basename(this.root);
    this.admZip = AdmZip;
  }

  resolve(relativePath) {
    const resolved = path.resolve(this.root, relativePath);
    if (resolved !== this.root && !resolved.startsWith(this.root)) {
      throw new GameTreeError(
        `Resolved path ${resolved} is outside of root ${this.root}`,
      );
    }
    return resolved;
  }

  async exists(relativePath) {
    try {
      return (await stat(this.resolve(relativePath))).isFile();
    } catch {
      return false;
    }
  }

  async readText(relativePath) {
    return await readFile(this.resolve(relativePath), "utf-8");
  }

  async readBytes(relativePath) {
    return await readFile(this.resolve(relativePath));
  }

  async files() {
    const out = [];

    const walk = async (dir) => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.isFile()) {
          out.push(path.relative(this.root, fullPath));
        }
      }
    };

    await walk(this.root);
    return out.sort();
  }

  // FIXED: Ask where is the game content, rather than ask where is the exe
  // CHECK whereIsTheContent() for more details
  async gameIsExe() {
    try {
      const files = await this.files();
      return files.some((file) => file.toLowerCase().endsWith(".exe"));
    } catch (error) {
      throw new GameTreeError(
        `Failed to check if game is an exe: ${error.message}`,
      );
    }
  }

  async whereIsTheContent() {
    let content = {
      where: null,
      unpackedNeeded: false,
      hasNwPackage: false,
      hasExe: false,
    };
    try {
      const filesAtRoot = await readdir(this.root);

      const hasIndex = filesAtRoot.find(
        (file) => file.toLowerCase() === "index.html",
      );
      const hasPackageJson = filesAtRoot.find(
        (file) => file.toLowerCase() === "package.json",
      );
      if (hasIndex && hasPackageJson) {
        content.where = this.root;
        content.unpackedNeeded = false;
        return content;
      }

      // if package.nw exists,
      // if it is a directory, then the game content is in there
      const packageNwPath = filesAtRoot.find(
        (file) => file.toLowerCase() === "package.nw",
      );
      if (packageNwPath) {
        const packageNwStat = await stat(this.resolve(packageNwPath));
        if (packageNwStat.isDirectory()) {
          content.where = this.resolve(packageNwPath);
          content.unpackedNeeded = false;
          return content;
        }
      }
      // if it is a file, then the game content is in the same directory as package.nw
      // extraction not needed
      if (packageNwPath) {
        content.where = this.root;
        content.unpackedNeeded = false;
        content.hasNwPackage = true;
        return content;
      }

      // lastly, is it an exe? then the game content is in the same directory as the exe
      const exePath = filesAtRoot.find((file) =>
        file.toLowerCase().endsWith(".exe"),
      );
      if (exePath) {
        content.where = this.root;
        content.unpackedNeeded = true;
        content.hasExe = true;
        return content;
      }

      return content;
    } catch (error) {
      throw new GameTreeError(
        `Failed to determine where the game content is: ${error.message}`,
      );
    }
  }

  // sbug exists
  // and would surface the moment Impact support is un-stubbed, but it's currently dead code for
  // everything the tool actually ships
  async unpackGame(options) {
    if (options.unpackedNeeded === false) {
      console.log("Game is already unpacked, no need to unpack.");
      return false;
    }

    // if the game is an exe and have package.nw
    // unpack the package.nw to a temporary directory
    if (options.unpackedNeeded && options.hasNwPackage) {
      if (!(await this.exists("package.nw"))) {
        throw new GameTreeError("package.nw not found in the game directory");
      }

      const packageNwPath = path.join(options.where, "package.nw");

      try {
        const packageNwStat = await stat(packageNwPath);
        if (packageNwStat.isFile()) {
          // Unpack the package.nw to a temporary directory
          // TODO: should i use options.where or should i use root?
          const unpackedGameDir = path.join(
            this.root,
            "..",
            `${this.gameName}_unpacked`,
          );
          await mkdir(unpackedGameDir, { recursive: true });

          // DEPRECATED, unzip not available on all platforms
          // Using adm-zip instead
          // execFileSync(
          //   "unzip",
          //   ["-o", path.join(this.root, "package.nw"), "-d", unpackedGameDir],
          //   {
          //     stdio: "inherit",
          //   },
          // );
          const zip = new this.admZip(packageNwPath);
          zip.extractAllTo(unpackedGameDir, true);

          return unpackedGameDir;
        } else {
          throw new GameTreeError("package.nw is not a file");
        }
      } catch (error) {
        throw new GameTreeError(`Failed to unpack game: ${error.message}`);
      }
    }
  }
}
