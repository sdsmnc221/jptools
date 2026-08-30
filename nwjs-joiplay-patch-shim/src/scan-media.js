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
import { MEDIA_EXTENSIONS, KNOWN_ENGINES } from "jpt-commons/utils/constants";

// | Verdict | Meaning |
// | --- | --- |
// | `pass_through` | The physically present asset already fits the conservative target for this playback route. |
// | `use_shipped_alternative` | A conservative alternative is declared and physically present; package only the exact URL mapping when needed. |
// | `prepare_compatibility_override` | The Construct worker route needs a conservative alternative and none is shipped. Prepare it before building the RGA; no device failure report is required. |
// | `audio_only` | Media extension contains no video stream. |
// | `out_of_scope_engine` | Asset exists, but this NW.js/JoiPlay tool must not patch that engine. |

const VERDICTS = {
  pass_through: {
    verdict: "pass_through",
    recommendedAction: "none",
    reason:
      "The media asset is already compatible with the target playback route.",
    warnings: [],
  },
  use_shipped_alternative: {
    verdict: "use_shipped_alternative",
    recommendedAction: "use_alternative",
    reason:
      "Prepare the exact URL mapping if Construct would otherwise prefer the riskier source.",
    warnings: [],
  },
  prepare_compatibility_override: {
    verdict: "prepare_compatibility_override",
    recommendedAction: "prepare_override",
    reason:
      "Schedule a build-time transcode via ffmpeg using `joiplay-shim prepare-media`.",
    warnings: [],
  },
  audio_only: {
    verdict: "audio_only",
    recommendedAction: "none",
    reason: "Media extension contains no video stream.",
    warnings: [],
  },
  out_of_scope_engine: {
    verdict: "out_of_scope_engine",
    recommendedAction: "none",
    reason:
      "Asset exists, but this NW.js/JoiPlay tool must not patch that engine. I only support Construct3",
    warnings: [],
  },
};

function determineVerdict(probeResult, engine) {
  const {
    probe,
    format,
    hasH264Mp4AlternativeDeclared,
    h264Mp4AlternativeExists,
  } = probeResult;

  if (engine !== KNOWN_ENGINES.CONSTRUCT) {
    return VERDICTS.out_of_scope_engine;
  }

  if (probe.codec_type === "audio") {
    return VERDICTS.audio_only;
  }

  if (probe.codec_type === "video") {
    if (hasH264Mp4AlternativeDeclared && h264Mp4AlternativeExists) {
      return VERDICTS.use_shipped_alternative;
    } else {
      return VERDICTS.prepare_compatibility_override;
    }
  }

  return VERDICTS.pass_through;
}

const execFileAsync = promisify(execFile);

async function probeVideoStream(filePath) {
  let stdout;

  try {
    const result = await execFileAsync("ffprobe", [
      "-v",
      "error",
      //   "-select_streams", // i want audio codec also, so I drop this
      //   "v:0",             // even thoug this is proble for video stream
      "-show_entries",
      "stream=index,codec_type,codec_name,profile,level,pix_fmt," +
        "bits_per_raw_sample,width,height,r_frame_rate:format=duration,size",
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
  const format = parsed.format;

  const isVideo = stream.codec_type === "video";
  const isAudio = stream.codec_type === "audio";

  return {
    isVideo,
    isAudio,
    probe: stream,
    format,
  };
}

function videoHasH264Mp4Alternative(dataJsonContent, tree, file) {
  // find this declaration in data.json
  //       ```json
  // ["Filename.webm", "Filename.mp4"]
  // ```

  if (!dataJsonContent) {
    return {
      hasH264Mp4AlternativeDeclared: false,
      h264Mp4AlternativeExists: false,
    };
  }

  const rx =
    /\["([^"]+\.(?:webm|mp4|ogv|m4v|mov|mkv|avi))","([^"]+\.(?:webm|mp4|ogv|m4v|mov|mkv|avi))"/gi;
  const alternatives = new Map();
  for (const [, a, b] of dataJsonContent.matchAll(rx)) {
    alternatives.set(a.toLowerCase(), b);
  }

  const declared = alternatives.get(path.basename(file).toLowerCase());
  const hasH264Mp4AlternativeDeclared =
    Boolean(declared) && declared.toLowerCase().endsWith(".mp4");
  const h264Mp4AlternativeExists = hasH264Mp4AlternativeDeclared
    ? existsSync(tree.resolve(path.join(path.dirname(file), declared)))
    : false;

  return {
    hasH264Mp4AlternativeDeclared,
    h264Mp4AlternativeExists,
  };
}

async function scanForVideoFiles(tree, engine) {
  let report = {
    videoFiles: [],
    audioOnlyFiles: [],
    unreadableFiles: [],
  };

  const files = await tree.files();

  const mediaCandidates = files.filter((file) =>
    MEDIA_EXTENSIONS.includes(path.extname(file).toLowerCase()),
  );

  const dataJson = path.join(tree.root, "data.json");

  let dataJsonContent = null;
  if (existsSync(dataJson)) {
    dataJsonContent = readFileSync(dataJson, "utf-8");
  }

  console.log("data.json exist? ", existsSync(dataJson));

  console.log(
    `Found ${mediaCandidates.length} media candidates in ${tree.root}`,
  );
  console.log(`Probing each candidate with ffprobe...`);
  // run `ffprobe -select_streams v:0` before calling anything video.
  // A `.webm` with only Vorbis or Opus is audio and must leave the
  // report as `audio_only`, not `risky`.
  for (const file of mediaCandidates) {
    const fullPath = tree.resolve(file);
    try {
      const probeResult = await probeVideoStream(fullPath);

      const { isVideo, isAudio, probe, format } = probeResult;

      let hasH264Mp4AlternativeDeclared = false;
      let h264Mp4AlternativeExists = false;
      if (isVideo) {
        const {
          hasH264Mp4AlternativeDeclared: hasH264Mp4AlternativeDeclaredFromData,
          h264Mp4AlternativeExists: h264Mp4AlternativeExistsFromData,
        } = videoHasH264Mp4Alternative(dataJsonContent, tree, file);
        hasH264Mp4AlternativeDeclared = hasH264Mp4AlternativeDeclaredFromData;
        h264Mp4AlternativeExists = h264Mp4AlternativeExistsFromData;
      }

      const verdict = determineVerdict(probeResult, engine);

      const record = {
        archivePath: file,
        file,
        byteSize: format.size,

        ...(probe.videoCodec ? { videoCodec: probe.videoCodec } : {}),
        ...(probe.audioCodec ? { audioCodec: probe.audioCodec } : {}),
        ...(probe.profile ? { profile: probe.profile } : {}),
        ...(probe.width ? { width: probe.width } : {}),
        ...(probe.height ? { height: probe.height } : {}),
        ...(probe.pix_fmt ? { pix_fmt: probe.pix_fmt } : {}),
        ...(probe.level ? { level: probe.level } : {}),
        ...(probe.r_frame_rate ? { r_frame_rate: probe.r_frame_rate } : {}),

        duration: format.duration ?? null,

        hasH264Mp4AlternativeDeclared: hasH264Mp4AlternativeDeclared,
        h264Mp4AlternativeExists: h264Mp4AlternativeExists,

        contentHash: null, // not needed for now, but could be useful for future deduplication or integrity checks
        evidenceLevel: probe.evidenceLevel,
        verdict: verdict.verdict,
        recommendedAction: verdict.recommendedAction,
        reason: verdict.reason,
        warnings: verdict.warnings,
      };
      if (isVideo) {
        report.videoFiles.push(record);
      } else if (isAudio) {
        report.audioOnlyFiles.push(record);
      }
    } catch (error) {
      console.log(error);
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

  const detectionResult = await detectGameEngine(tree.root);

  const report = {
    game: tree.gameName,
    gameDir: tree.root,
    engine: detectionResult.engine,
    contentDir: gameContent.where,
    mediaScan: null,
  };

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
        unpackDataJson: true,
      });
      console.log(`Unpacked content to ${unpackedDir}`);
      report.mediaScan = await scanForVideoFiles(
        new GameTree(unpackedDir),
        detectionResult.engine,
      );
      report.result = Object.values(report.mediaScan)
        .flat()
        .find((result) => result.verdict !== VERDICTS.pass_through.verdict);
    }
  } else if (gameContent.unpackedNeeded) {
    console.log("No unpacked content needed.");
  }

  return report;
}
