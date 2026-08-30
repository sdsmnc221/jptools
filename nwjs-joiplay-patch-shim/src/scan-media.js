import { GameTree } from "jpt-commons/game-tree";
import {
  AmbigousError,
  UnsupportedError,
  ShimError,
  MediaScanError,
} from "jpt-commons/errors";
import { getDefaultPatchDir } from "jpt-commons/rga";
import { detectGameEngine } from "./detect.js";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { MEDIA_EXTENSIONS } from "jpt-commons/utils/constants";

const execFileAsync = promisify(execFile);

async function probeVideoStream(filePath) {
  let stdout;

  try {
    const result = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=codec_type,codec_name",
      "-of",
      "json",
      filePath,
    ]);

    stdout = result.stdout;
  } catch (error) {
    throw new MediaScanError(
      `ffprobe failed for ${filePath}: ${error.message}`,
    );
  }

  const parsed = JSON.parse(stdout);
  const stream = parsed.streams?.[0];

  if (!stream) {
    return {
      hasVideo: false,
      reason: "audio_only",
    };
  }

  return {
    hasVideo: stream.codec_type === "video",
    codec: stream.codec_name,
  };
}

async function scanForVideoFiles(tree) {
  let report = {
    videoFiles: [],
    audioOnlyFiles: [],
    unreadableFiles: [],
  };

  const files = await tree.files();

  const mediaCandidates = files.filter((file) =>
    MEDIA_EXTENSIONS.includes(path.extname(file)),
  );

  // run `ffprobe -select_streams v:0` before calling anything video.
  // A `.webm` with only Vorbis or Opus is audio and must leave the
  // report as `audio_only`, not `risky`.
  for (const file of mediaCandidates) {
    const fullPath = tree.resolve(file);
    try {
      const probe = await probeVideoStream(fullPath);
      if (probe.hasVideo) {
        report.videoFiles.push({
          file,
          codec: probe.codec,
        });
      } else {
        report.audioOnlyFiles.push({
          file,
          reason: probe.reason,
        });
      }
    } catch (error) {
      report.unreadableFiles.push({
        file,
        reason: error.message,
      });
    }
  }
  return report;
}

export async function scanMedia(gameDir) {
  const tree = new GameTree(gameDir);

  const gameContent = await tree.whereIsTheContent();
  if (!gameContent?.where) {
    throw new MediaScanError(
      `Could not find game content in ${tree.root}. Please ensure the game is installed correctly.`,
    );
  }

  // The shape of the game content:
  //   let content = {
  //       where: null,
  //       unpackedNeeded: false,
  //       hasNwPackage: false,
  //       hasExe: false,
  //     };

  //   Scan these containers:
  // - loose directories;
  // - `package.nw` when it is a ZIP;
  // - an unpacked `app.nw` directory;
  // - appended-ZIP NW.js executables already understood by `GameTree`;
  // - engine-specific packs only when a safe reader already exists. Do not unpack a
  //   multi-gigabyte Godot or Unity data file merely to search for movie names

  if (gameContent.unpackNeededForScanMedia) {
    if (gameContent.hasExe) {
      console.log("need to scan the unpacked content of the exe");
    } else if (gameContent.hasNwPackage) {
      console.log("need to scan the unpacked content of package.nw");
      const unpackedDir = await tree.unpackGame({
        ...gameContent,
        unpackOnlyMedia: true,
      });
      console.log(`Unpacked content to ${unpackedDir}`);
      return await scanForVideoFiles(new GameTree(unpackedDir));
    }
  } else if (gameContent.unpackedNeeded) {
    console.log("No unpacked content needed.");
  }
}
