import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const template = readFileSync(
  new URL("../src/adapters/utils/shim.js", import.meta.url),
  "utf8",
);

function createHarness(createBitmap) {
  const messages = [];
  const bitmapSources = [];

  class FakeVideo {
    constructor() {
      this.listeners = new Map();
      this.src = "media/intro.webm?cache=1";
      this.currentSrc = "";
      this.currentTime = 0;
      this.duration = 16;
      this.readyState = 0;
      this.networkState = 0;
      this.videoWidth = 0;
      this.videoHeight = 0;
      this.paused = true;
      this.ended = false;
      this.muted = false;
      this.autoplay = false;
      this.preload = "auto";
      this.error = null;
    }

    addEventListener(name, listener) {
      const listeners = this.listeners.get(name) || [];
      listeners.push(listener);
      this.listeners.set(name, listeners);
    }

    dispatch(name) {
      for (const listener of this.listeners.get(name) || []) listener();
    }

    canPlayType(type) {
      return type.includes("vp9") ? "probably" : "maybe";
    }

    requestVideoFrameCallback() {
      throw new Error("the forced bitmap-polling path must not call rVFC");
    }

    getVideoPlaybackQuality() {
      return {
        totalVideoFrames: 12,
        droppedVideoFrames: 1,
        corruptedVideoFrames: 0,
      };
    }
  }

  const document = {
    baseURI: "file:///game/index.html",
    createElement(tagName) {
      return String(tagName).toLowerCase() === "video" ? new FakeVideo() : {};
    },
    querySelectorAll() {
      return [];
    },
    addEventListener() {},
  };

  const context = {
    console: {
      info(...args) {
        messages.push(args.join(" "));
      },
      warn(...args) {
        messages.push(args.join(" "));
      },
    },
    document,
    navigator: { userAgent: "Video diagnostics test WebView" },
    HTMLVideoElement: FakeVideo,
    URL,
    performance,
    setInterval() {
      return 1;
    },
    clearInterval() {},
    createImageBitmap(source) {
      bitmapSources.push(source);
      return createBitmap(source);
    },
  };

  vm.runInNewContext(template.replaceAll("{{ENGINE}}", "construct"), context);
  return { context, document, messages, bitmapSources };
}

test("records video lifecycle and preserves a successful bitmap result", async () => {
  const bitmap = { width: 2560, height: 1440 };
  const harness = createHarness(() => Promise.resolve(bitmap));
  const video = harness.document.createElement("video");

  video.currentSrc = "file:///game/media/intro.webm?cache=1";
  video.readyState = 2;
  video.videoWidth = 2560;
  video.videoHeight = 1440;
  video.dispatch("loadeddata");

  assert.equal(await harness.context.createImageBitmap(video), bitmap);
  assert.equal(video.requestVideoFrameCallback, undefined);
  assert.deepEqual(harness.bitmapSources, [video]);
  assert.ok(harness.messages.some((line) => line.includes("rvfc-disabled")));
  assert.ok(harness.messages.some((line) => line.includes("video-loadeddata")));
  assert.ok(harness.messages.some((line) => line.includes("bitmap-success")));
  assert.ok(
    harness.messages.some((line) => line.includes('"totalVideoFrames":12')),
  );
  assert.ok(harness.messages.every((line) => !line.includes("?cache=1")));
});

test("logs and preserves a rejected bitmap promise", async () => {
  const harness = createHarness(() =>
    Promise.reject(new Error("decode failed")),
  );
  const video = harness.document.createElement("video");

  await assert.rejects(
    harness.context.createImageBitmap(video),
    /decode failed/,
  );
  assert.ok(harness.messages.some((line) => line.includes("bitmap-rejection")));
  assert.ok(harness.messages.some((line) => line.includes("decode failed")));
});

test("does not wrap non-video bitmap promises", () => {
  const bitmapPromise = Promise.resolve({ width: 8, height: 8 });
  const harness = createHarness(() => bitmapPromise);

  assert.equal(harness.context.createImageBitmap({}), bitmapPromise);
});
