const patchProcess = () => {
  if (typeof process !== "object" || !process) return; // not there yet — a later pass will get it
  [
    "on",
    "once",
    "off",
    "addListener",
    "removeListener",
    "removeAllListeners",
    "emit",
  ].forEach((m) => {
    if (typeof process[m] !== "function") process[m] = () => {};
  });
};

const diagnosticsForVideo = () => {
  const scope = typeof globalThis === "object" ? globalThis : window;
  const installKey =
    typeof Symbol === "function"
      ? Symbol.for("rg-retro.video-diagnostics")
      : "__rgRetroVideoDiagnosticsInstalled";

  if (scope[installKey]) return;
  scope[installKey] = true;

  const prefix = "[rg-video-diag]";
  const videoStates = new WeakMap();
  let nextVideoId = 1;

  const log = (event, details) => {
    try {
      console.info(`${prefix} ${event} ${JSON.stringify(details || {})}`);
    } catch (_) {
      console.info(`${prefix} ${event}`);
    }
  };

  const cleanUrl = (value) => {
    if (!value) return "";
    try {
      const parsed = new URL(value, document.baseURI);
      return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
    } catch (_) {
      return String(value).split(/[?#]/, 1)[0];
    }
  };

  const mediaError = (error) => {
    if (!error) return null;
    const names = {
      1: "MEDIA_ERR_ABORTED",
      2: "MEDIA_ERR_NETWORK",
      3: "MEDIA_ERR_DECODE",
      4: "MEDIA_ERR_SRC_NOT_SUPPORTED",
    };
    return {
      code: error.code,
      name: names[error.code] || "MEDIA_ERR_UNKNOWN",
      message: error.message || "",
    };
  };

  const playbackQuality = (video) => {
    try {
      if (typeof video.getVideoPlaybackQuality === "function") {
        const quality = video.getVideoPlaybackQuality();
        return {
          totalVideoFrames: quality.totalVideoFrames,
          droppedVideoFrames: quality.droppedVideoFrames,
          corruptedVideoFrames: quality.corruptedVideoFrames,
        };
      }
    } catch (_) {
      // Some WebViews expose this method but throw when no decoder is active.
    }

    return {
      decodedVideoFrames: video.webkitDecodedFrameCount,
      droppedVideoFrames: video.webkitDroppedFrameCount,
    };
  };

  const forceBitmapPolling = (video) => {
    const rvfcWasAvailable =
      typeof video.requestVideoFrameCallback === "function";

    if (!rvfcWasAvailable) {
      return { rvfcWasAvailable, rvfcDisabled: false, error: null };
    }

    try {
      // JoiPlay reports a desktop/NW.js user agent, so Construct does not
      // identify this as Android WebView and otherwise selects rVFC. On the
      // affected WebView the callback never fires, leaving worker rendering
      // with audio but no video frames. Shadowing the method on each video
      // makes Construct use its createImageBitmap polling fallback instead.
      Object.defineProperty(video, "requestVideoFrameCallback", {
        configurable: true,
        value: undefined,
      });

      return {
        rvfcWasAvailable,
        rvfcDisabled: typeof video.requestVideoFrameCallback !== "function",
        error: null,
      };
    } catch (error) {
      return {
        rvfcWasAvailable,
        rvfcDisabled: false,
        error: { name: error.name, message: error.message },
      };
    }
  };

  const snapshot = (video, state) => ({
    id: state.id,
    src: cleanUrl(video.currentSrc || video.src),
    currentTime: Number.isFinite(video.currentTime)
      ? Number(video.currentTime.toFixed(3))
      : null,
    duration: Number.isFinite(video.duration)
      ? Number(video.duration.toFixed(3))
      : null,
    readyState: video.readyState,
    networkState: video.networkState,
    videoWidth: video.videoWidth,
    videoHeight: video.videoHeight,
    paused: video.paused,
    ended: video.ended,
    muted: video.muted,
    autoplay: video.autoplay,
    preload: video.preload,
    error: mediaError(video.error),
    playbackQuality: playbackQuality(video),
  });

  const stopSampling = (state) => {
    if (!state.timer) return;
    scope.clearInterval(state.timer);
    state.timer = 0;
  };

  const startSampling = (video, state) => {
    if (state.timer) return;
    state.samples = 0;
    state.timer = scope.setInterval(() => {
      state.samples += 1;
      log("sample", snapshot(video, state));
      if (state.samples >= 15 || video.ended || video.error)
        stopSampling(state);
    }, 2000);
  };

  const attachVideo = (video) => {
    if (!video || videoStates.has(video)) return video;

    const bitmapPolling = forceBitmapPolling(video);
    const state = {
      id: nextVideoId++,
      timer: 0,
      samples: 0,
      bitmapCalls: 0,
      bitmapSuccesses: 0,
      bitmapFailures: 0,
      rvfcWasAvailable: bitmapPolling.rvfcWasAvailable,
      rvfcDisabled: bitmapPolling.rvfcDisabled,
    };
    videoStates.set(video, state);
    log("video-created", snapshot(video, state));
    if (bitmapPolling.rvfcWasAvailable) {
      log(
        bitmapPolling.rvfcDisabled ? "rvfc-disabled" : "rvfc-disable-failed",
        {
          id: state.id,
          error: bitmapPolling.error,
        },
      );
    }

    [
      "loadstart",
      "loadedmetadata",
      "loadeddata",
      "canplay",
      "canplaythrough",
      "play",
      "playing",
      "waiting",
      "stalled",
      "suspend",
      "pause",
      "ended",
      "abort",
      "emptied",
      "error",
      "resize",
    ].forEach((eventName) => {
      video.addEventListener(eventName, () => {
        log(`video-${eventName}`, snapshot(video, state));
        if (eventName === "play" || eventName === "playing")
          startSampling(video, state);
        if (
          eventName === "ended" ||
          eventName === "error" ||
          eventName === "emptied"
        ) {
          stopSampling(state);
        }
      });
    });

    return video;
  };

  const originalCreateElement = document.createElement;
  try {
    const probe = originalCreateElement.call(document, "video");
    const formats = [
      "video/webm",
      'video/webm; codecs="vp9"',
      'video/webm; codecs="vp09.00.10.08"',
      "video/mp4",
      'video/mp4; codecs="avc1.42E01E"',
    ];
    log("capabilities", {
      userAgent: navigator.userAgent,
      requestVideoFrameCallback:
        typeof probe.requestVideoFrameCallback === "function",
      forceBitmapPolling: true,
      createImageBitmap: typeof scope.createImageBitmap === "function",
      formats: formats.reduce((result, format) => {
        result[format] = probe.canPlayType(format);
        return result;
      }, {}),
    });
  } catch (error) {
    log("capabilities-error", { name: error.name, message: error.message });
  }

  document.createElement = function createElementWithVideoDiagnostics(tagName) {
    const element = originalCreateElement.apply(this, arguments);
    if (String(tagName).toLowerCase() === "video") attachVideo(element);
    return element;
  };

  const attachExistingVideos = () => {
    document.querySelectorAll("video").forEach(attachVideo);
  };
  attachExistingVideos();
  document.addEventListener("DOMContentLoaded", attachExistingVideos, {
    once: true,
  });

  if (typeof scope.createImageBitmap !== "function") {
    log("createImageBitmap-unavailable", {});
    return;
  }

  const originalCreateImageBitmap = scope.createImageBitmap;
  scope.createImageBitmap = function createImageBitmapWithVideoDiagnostics(
    source,
  ) {
    const args = arguments;
    const isVideo =
      typeof HTMLVideoElement !== "undefined" &&
      source instanceof HTMLVideoElement;
    const state = isVideo
      ? videoStates.get(source) ||
        (attachVideo(source), videoStates.get(source))
      : null;
    let bitmapCall = 0;

    if (state) {
      state.bitmapCalls += 1;
      bitmapCall = state.bitmapCalls;
      if (bitmapCall === 1 || bitmapCall % 300 === 0) {
        log("bitmap-request", {
          ...snapshot(source, state),
          bitmapCalls: bitmapCall,
        });
      }
    }

    const startedAt =
      typeof performance === "object" ? performance.now() : Date.now();
    let result;
    try {
      result = originalCreateImageBitmap.apply(scope, args);
    } catch (error) {
      if (state) {
        state.bitmapFailures += 1;
        log("bitmap-throw", {
          ...snapshot(source, state),
          bitmapCalls: bitmapCall,
          name: error.name,
          message: error.message,
        });
      }
      throw error;
    }

    if (!state || !result || typeof result.then !== "function") return result;

    return result.then(
      (bitmap) => {
        state.bitmapSuccesses += 1;
        if (state.bitmapSuccesses === 1 || bitmapCall % 300 === 0) {
          log("bitmap-success", {
            id: state.id,
            bitmapCalls: bitmapCall,
            bitmapSuccesses: state.bitmapSuccesses,
            width: bitmap.width,
            height: bitmap.height,
            elapsedMs: Math.round(
              (typeof performance === "object"
                ? performance.now()
                : Date.now()) - startedAt,
            ),
          });
        }
        return bitmap;
      },
      (error) => {
        state.bitmapFailures += 1;
        if (state.bitmapFailures <= 5) {
          log("bitmap-rejection", {
            ...snapshot(source, state),
            bitmapCalls: bitmapCall,
            bitmapFailures: state.bitmapFailures,
            name: error && error.name,
            message: error && error.message,
          });
        } else if (state.bitmapFailures === 6) {
          log("bitmap-rejection-suppressed", {
            id: state.id,
            bitmapFailures: state.bitmapFailures,
          });
        }
        throw error;
      },
    );
  };

  log("installed", { forceBitmapPolling: true });
};

const runner = (engine) => {
  if (engine === "rpgmmz") {
    patchProcess();
    document.addEventListener("DOMContentLoaded", patchProcess);
    window.addEventListener("load", patchProcess);
  }

  if (engine === "construct") {
    try {
      diagnosticsForVideo();
    } catch (error) {
      // Diagnostics must never prevent the game itself from starting.
      console.warn("[rg-video-diag] install-error", error);
    }
  }
};

runner("{{ENGINE}}");
