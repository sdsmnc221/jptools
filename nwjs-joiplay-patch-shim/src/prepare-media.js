import { MEDIA_EXTENSIONS, KNOWN_ENGINES } from "jpt-commons/utils/constants";
import { GameTree } from "jpt-commons/game-tree";
import { MediaPrepareError } from "jpt-commons/errors";
import { getDefaultPatchDir } from "jpt-commons/rga";
import { detectGameEngine } from "./detect.js";
import { VERDICTS } from "./scan-media.js";
import path from "node:path";
import { existsSync, readFileSync, createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import ffprobePath from "@derhuerst/ffprobe-static";

const execFileAsync = promisify(execFile);

async function hashFile(filePath) {
  const hash = createHash("sha256");

  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
  }

  return hash.digest("hex");
}

function compatibilityArchivePath(sourceArchivePath, inputHash) {
  const extension = path.posix.extname(sourceArchivePath);
  const basename = sourceArchivePath.slice(0, -extension.length);

  return `${basename}.rg-compat-${inputHash.slice(0, 12)}.mp4`;
}

function parseFrameRate(value) {
  if (!value) return null;

  const [numerator, denominator = "1"] = value.split("/").map(Number);

  if (
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    denominator === 0
  ) {
    return null;
  }

  return numerator / denominator;
}

async function probeMedia(filePath) {
  let stdout;

  try {
    const result = await execFileAsync(
      ffprobePath,
      [
        "-v",
        "error",
        "-show_entries",
        [
          "stream=index,codec_type,codec_name,profile,level,pix_fmt",
          "width,height,avg_frame_rate,r_frame_rate",
          "format=format_name,duration,size",
        ].join(":"),
        "-of",
        "json",
        filePath,
      ],
      {
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
      },
    );

    stdout = result.stdout;
  } catch (error) {
    throw new MediaPrepareError(
      `ffprobe failed for ${filePath}: ${error.message}`,
    );
  }

  let parsed;

  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    throw new MediaPrepareError(
      `ffprobe returned invalid JSON for ${filePath}: ${error.message}`,
    );
  }

  const streams = parsed.streams ?? [];

  return {
    filePath,
    videoStream: streams.find((stream) => stream.codec_type === "video"),
    audioStream: streams.find((stream) => stream.codec_type === "audio"),
    format: parsed.format ?? {},
  };
}

async function validateTemOutputResult(probe, { sourceHadAudio } = {}) {
  // After FFmpeg succeeds, run the bundled ffprobePath against temporaryOutput.
  //   Reject the output unless:
  //   file size > 0
  //   video stream exists
  //   video codec = h264
  //   pixel format = yuv420p
  //   width <= 1280
  //   height <= 720
  //   frame rate <= 30
  //   audio codec = aac, when the input had audio

  const errors = [];
  const video = probe.videoStream;
  const audio = probe.audioStream;
  const byteSize = Number(probe.format.size ?? 0);

  if (byteSize <= 0) {
    errors.push("Output is empty");
  }

  if (!video) {
    errors.push("Output has no video stream");
  } else {
    if (video.codec_name !== "h264") {
      errors.push(`Video codec is not h264 (found ${video.codec_name})`);
    }
    if (video.pix_fmt !== "yuv420p") {
      errors.push(`Video pixel format is not yuv420p (found ${video.pix_fmt})`);
    }
    if (Number(video.width) > 1280 || Number(video.height) > 720) {
      errors.push(
        `Video resolution exceeds 1280x720 (found ${video.width}x${video.height})`,
      );
    }

    const frameRate = parseFrameRate(
      video.avg_frame_rate || video.r_frame_rate,
    );
    if (frameRate === null) {
      errors.push("Video frame rate is invalid or missing");
    } else if (frameRate > 30.001) {
      errors.push(
        `Video frame rate exceeds 30 fps (found ${frameRate.toFixed(2)} fps)`,
      );
    }
  }

  if (sourceHadAudio && !audio) {
    errors.push("Output has no audio stream, but the input had audio");
  } else if (sourceHadAudio && audio.codec_name !== "aac") {
    errors.push(`Audio codec is not aac (found ${audio.codec_name})`);
  }

  if (errors.length > 0) {
    throw new MediaPrepareError(`Validation failed:\n- ${errors.join("\n- ")}`);
  }

  return {
    byteSize,
    videoCodec: video.codec_name,
    audioCodec: audio?.codec_name ?? null,
    profile: video.profile,
    level: video.level,
    pixelFormat: video.pix_fmt,
    width: Number(video.width),
    height: Number(video.height),
    frameRate: parseFrameRate(video.avg_frame_rate || video.r_frame_rate),
    formatName: probe.format.format_name,
  };
}

async function transcodeVideo(inputPath, outputPath) {
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

  const MAX_STDERR = 64 * 1024;
  let stderrTail = "";

  const childProcess = spawn(ffmpegPath, ffmpegArgs, {
    stdio: ["ignore", "ignore", "pipe"],
  });

  childProcess.stderr.setEncoding("utf8");

  childProcess.stderr.on("data", (chunk) => {
    stderrTail += chunk;

    if (stderrTail.length > MAX_STDERR) {
      stderrTail = stderrTail.slice(-MAX_STDERR);
    }
  });

  return new Promise((resolve, reject) => {
    childProcess.on("close", (code) => {
      if (code === 0) {
        resolve({
          inputPath,
          outputPath,
          ffmpegPath,
          ffmpegArgs,
          stderrTail,
        });
      } else {
        reject(
          new MediaPrepareError(
            `FFmpeg exited with code ${code} while transcoding ${inputPath}\n` +
              stderrTail.trim(),
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
  inputTree,
  stageDir,
  payloadDir,
  payloadTree,
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

  // produce a safe intermediate asset:
  await mkdir(path.join(stageDir, ".tmp"), { recursive: true });

  let transcodedFiles = [];
  for (const fileReport of videoFilesToTranscode) {
    const temporaryDir = await mkdtemp(
      path.join(stageDir, ".tmp", "transcode-"),
    );
    const temporaryOutput = path.join(temporaryDir, "output.mp4");

    const inputPath = inputTree.resolve(fileReport.archivePath);
    const inputHash = await hashFile(inputPath);

    const targetArchivePath = compatibilityArchivePath(
      fileReport.archivePath,
      inputHash,
    );
    const destination = payloadTree.resolve(targetArchivePath);

    try {
      // Probe the input before transcoding and the temporary output afterward, one file per file
      const inputProbe = await probeMedia(inputPath);
      const transcodingResult = await transcodeVideo(
        inputPath,
        temporaryOutput,
      );

      const outputProbe = await probeMedia(temporaryOutput);
    } catch (error) {
      throw new MediaPrepareError(
        `Failed to process media file ${inputPath}: ${error.message}`,
      );
    } finally {
      await rm(temporaryDir, {
        recursive: true,
        force: true,
      });
      const validation = validateTemporaryOutput(outputProbe, {
        sourceHadAudio: Boolean(inputProbe.audioStream),
      });
      transcodedFiles.push({
        sourceArchivePath: fileReport.archivePath,
        targetArchivePath,
        inputHash,
        outputHash,
        validation,
        ffmpegArguments: transcodingResult.ffmpegArgs,
      });
    }
  }

  return {
    transcodedFiles,
  };
}

export async function prepareMedia(gameDir, reportPath, engine) {
  //     <Game>_patch/
  //   └── _decoded_assets.stage/
  //       ├── payload/
  //       │   ├── media/
  //       │   │   └── Video.rg-compat-<hash>.mp4
  //       │   └── rg-media-map.json
  //       └── preparation-report.json

  const gameName = path.basename(path.resolve(gameDir));
  const patchDir = getDefaultPatchDir(gameDir, gameName);
  const stageDir = path.join(patchDir, "_decoded_assets.stage");
  const payloadDir = path.join(stageDir, "payload");

  const inputTree = new GameTree(path.dirname(reportPath));
  const payloadTree = new GameTree(payloadDir);

  const reportContent = await inputTree.readText(reportPath);

  let report;
  try {
    report = JSON.parse(reportContent);
  } catch (error) {
    throw new MediaPrepareError(
      `Failed to parse report file at ${reportPath}: ${error.message}`,
    );
  }

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
    inputTree,
    stageDir,
    payloadDir,
    payloadTree,
    videoFilesWithShippedAlternatives,
    videoFilesToTranscode,
  );

  return {
    stageDir,
    payloadDir,
    mappingPath,
    preparationReportPath,
    preparedFiles,
  };

  // now we can safely:
  //   1. Hash the output.
  //   2. Publish it into the staging payload.
  //   3. Add its source/target entry to rg-media-map.json.
  //   4. Record the probe results in preparation-report.json.
}
