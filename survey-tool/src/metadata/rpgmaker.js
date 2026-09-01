import path from "path";
import { GameTree } from "jpt-commons/game-tree";
import { Metadata, RefinedDetectionResult } from "./RefinedDetectionResult.js";

const rgssGenerationFromDll = (filename) => {
  const match = /^rgss([123])\d{2}[a-z]?\.dll$/.exec(filename);
  if (!match) return null;

  const generations = {
    1: "XP",
    2: "VX",
    3: "VX Ace",
  };

  return {
    rgss: filename,
    generation: generations[match[1]],
  };
};

const metadataRPGMaker = async (files, dirs, gameDirTree) => {
  const metadata = [];

  await gameDirTree.finder.rootIndex();

  const rgssDll = [...files]
    .map((file) => rgssGenerationFromDll(file))
    .find(Boolean);

  if (rgssDll) {
    metadata.push(
      new Metadata(rgssDll.generation, "dll", {
        rgss: gameDirTree.finder.lookupOriginalByName(rgssDll.rgss, {
          file: true,
        }),
      }),
    );
  }

  if (files.has("game.ini")) {
    // Game.ini carries a Library= line naming the same DLL,
    const gameIniContent = await gameDirTree.readText(
      gameDirTree.finder.lookupOriginalByName("Game.ini", {
        file: true,
      }),
    );
    const libraryLine = gameIniContent
      .split("\n")
      .find((line) => line.startsWith("Library="));
    if (libraryLine) {
      const libraryFile = libraryLine.split("=")[1].trim();
      const runtime = rgssGenerationFromDll(libraryFile.toLowerCase());

      if (runtime) {
        metadata.push(
          new Metadata(runtime.generation, "ini", { rgss: libraryFile }),
        );
      }
    }
  }

  if ([...dirs].find((d) => d === "data")) {
    // If a Data directory is found, it might indicate the presence of rgss archives
    // loose under Data/ as .rxdata / .rvdata / .rvdata2
    const dataDirTree = new GameTree(
      path.join(
        gameDirTree.root,
        gameDirTree.finder.lookupOriginalByName("data", {
          file: false,
        }),
      ),
    );
    const { files: dataFiles } = await dataDirTree.finder.rootIndex();
    if ([...dataFiles].some((f) => f.endsWith(".rxdata"))) {
      metadata.push(new Metadata("XP", "Data/", { rgss: ".rxdata" }));
    } else if ([...dataFiles].some((f) => f.endsWith(".rvdata"))) {
      metadata.push(new Metadata("VX", "Data/", { rgss: ".rvdata" }));
    } else if ([...dataFiles].some((f) => f.endsWith(".rvdata2"))) {
      metadata.push(new Metadata("VX Ace", "Data/", { rgss: ".rvdata2" }));
    }
  }

  if ([...files].some((f) => f.endsWith(".rgssad"))) {
    metadata.push(new Metadata("XP", "archive", { rgss: ".rgssad" }));
  } else if ([...files].some((f) => f.endsWith(".rgss2a"))) {
    metadata.push(new Metadata("VX", "archive", { rgss: ".rgss2a" }));
  } else if ([...files].some((f) => f.endsWith(".rgss3a"))) {
    metadata.push(new Metadata("VX Ace", "archive", { rgss: ".rgss3a" }));
  }

  const hasConflictingGeneration = metadata.length
    ? metadata.some((m) => m.generation !== metadata[0].generation)
    : false;
  const confidentGeneration = hasConflictingGeneration
    ? null
    : metadata[0]?.generation;

  return new RefinedDetectionResult(
    metadata,
    confidentGeneration,
    hasConflictingGeneration,
  );
};

export { metadataRPGMaker };
