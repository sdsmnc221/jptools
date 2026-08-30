import { GameTree } from "jpt-commons/game-tree";
import { MediaPrepareError } from "jpt-commons/errors";
import { getDefaultPatchDir } from "jpt-commons/rga";
import { detectGameEngine } from "./detect.js";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import ffprobePath from "@derhuerst/ffprobe-static";
import { MEDIA_EXTENSIONS, KNOWN_ENGINES } from "jpt-commons/utils/constants";
import { VERDICTS } from "./scan-media.js";

export async function transcodeVideo(inputPath, outputPath) {
  // VP8, VP9, AV1, HEVC, non-`yuv420p`, 10-bit color, dimensions above 1280×720,
  // or rates above 30 fps therefore select a conservative alternative for the
  // Construct worker path. They remain warnings—not automatic transcoding
  // orders—for RPG Maker DOM video or out-of-scope native engines.

  const ffmpegArgs = [
    "-hide_banner",
    "-nostdin",
    "-y",
    "-i",
    inputPath,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
    "-vf",
    "scale=w='min(1280,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos,fps=30",
    "-c:v",
    "libx264",
    "-profile:v",
    "main",
    "-level:v",
    "3.1",
    "-pix_fmt",
    "yuv420p",
    "-preset",
    "medium",
    "-crf",
    "22",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-ar",
    "48000",
    "-ac",
    "2",
    "-sn",
    "-dn",
    "-movflags",
    "+faststart",
    outputPath,
  ];

  const childProcess = spawn(ffmpegPath, ffmpegArgs, {
    stdio: ["ignore", "ignore", "pipe"],
  });

  return new Promise((resolve, reject) => {
    childProcess.on("close", (code) => {
      if (code === 0) {
        resolve({ inputPath, outputPath });
      } else {
        reject(
          new MediaPrepareError(
            `FFmpeg exited with code ${code} while transcoding ${inputPath}`,
          ),
        );
      }
    });

    childProcess.on("error", (err) => {
      reject(
        new MediaPrepareError(
          `Failed to start FFmpeg process for transcoding ${inputPath}: ${err.message}`,
        ),
      );
    });
  });
}

export async function processMediaFiles(
  tree,
  audioFilesToPrepare,
  videoFilesWithShippedAlternatives,
  videoFilesToTranscode,
) {
  // Audio file, technically audio passed through
  console.log(
    `Audio files to prepare: 0 / ${audioFilesToPrepare.length} files`,
  );

  // Prepare exact URL mapping if Construct would otherwise prefer the riskier source.
  // I will implement this when the time comes

  // Prepare built-time transcode for video files
  console.log(
    `Video files to transcode: ${videoFilesToTranscode.length} files`,
  );

  let transcodedFiles = [];
  for (const fileReport of videoFilesToTranscode) {
    const inputPath = tree.resolve(fileReport.archivePath);
    const outputPath = tree.resolve(
      fileReport.archivePath.replace(/\.[^/.]+$/, ".mp4"),
    );
    const transcodingResult = await transcodeVideo(inputPath, outputPath);
    transcodedFiles.push(transcodingResult);
  }

  return {
    transcodedFiles,
  };
}

export async function prepareMedia(gameDir, reportPath, engine) {
  const mediaDir = path.resolve(path.dirname(reportPath));
  const tree = new GameTree(mediaDir);

  const reportContent = await tree.readText(reportPath);

  let report;
  try {
    report = JSON.parse(reportContent);

    const { mediaScan, engine } = report;

    // We only care about the media files that need to be prepared,
    // so we filter the report accordingly

    console.log("Preparing media files based on the report...");
    // 1. If the file is audio-only, use `audio_only` regardless of its extension.
    const audioFilesToPrepare = mediaScan.audioOnlyFiles.filter(
      (fileReport) => fileReport.verdict !== VERDICTS.audio_only.verdict,
    );

    // 2.If the playback route is native or belongs to another engine, use
    // `out_of_scope_engine`; do not make this NW.js tool rewrite it.
    if (engine !== KNOWN_ENGINES.CONSTRUCT) {
      throw new MediaPrepareError(
        `Unsupported engine: ${engine}. Only Construct engine is supported.`,
      );
    }

    // 3. If the selected source already fits, use `pass_through`.
    // No action is needed for these files

    // Then, video files
    const videoFilesToPrepare = mediaScan.videoFiles.filter(
      (fileReport) => fileReport.verdict !== VERDICTS.pass_through.verdict,
    );

    console.log("Video files to prepare:", videoFilesToPrepare);
    //     4. If a declared, physically present sibling fits, use
    //    `use_shipped_alternative` and prepare the exact URL mapping if Construct
    //    would otherwise prefer the riskier source.
    const videoFilesWithShippedAlternatives = videoFilesToPrepare.filter(
      (fileReport) =>
        fileReport.verdict === VERDICTS.use_shipped_alternative.verdict,
    );
    // 5. Otherwise use `prepare_compatibility_override` and schedule a build-time transcode.
    const videoFilesToTranscode = videoFilesToPrepare.filter(
      (fileReport) =>
        fileReport.verdict === VERDICTS.prepare_compatibility_override.verdict,
    );

    const processResult = await processMediaFiles(
      tree,
      audioFilesToPrepare,
      videoFilesWithShippedAlternatives,
      videoFilesToTranscode,
    );

    return processResult;
  } catch (error) {
    throw new MediaPrepareError(
      `Failed to parse report file at ${reportPath}: ${error.message}`,
    );
  }
}
