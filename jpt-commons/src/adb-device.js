import { spawnSync, execFileSync } from "child_process";

export async function isDevicePlugged() {
  try {
    execFileSync("adb", ["wait-for-device"], {
      timeout: 10_000,
    });
  } catch (error) {
    if (error.code === "ETIMEDOUT") {
      console.log(
        "Device not detected within the timeout period. Aborting installation.",
      );
      return;
    } else if (error.code === "ENOENT") {
      console.log(
        "ADB not found. Please ensure adb is installed and in your PATH.",
      );
      return;
    } else {
      throw error;
    }
  }
}

export async function listDevices() {
  const devices = execFileSync("adb", ["devices"])
    .toString()
    .split("\n")
    .slice(1)
    .filter((line) => line.trim() !== "")
    .map((line) => line.split("\t")[0]);

  return devices;
}

export class AdbDevice {
  constructor(serial) {
    this.serial = serial;
  }

  #run(args) {
    return spawnSync("adb", ["-s", this.serial, ...args], {
      encoding: "utf-8",
    });
  }

  state() {
    return this.#run(["get-state"]);
  }

  isAppRunning(packageName) {
    return this.#run(["shell", "pidof", packageName]);
  }

  exists(remotePath) {
    return this.#run(["shell", "ls", remotePath]);
  }

  mkdirp(remotePath) {
    return this.#run(["shell", "mkdir", "-p", remotePath]);
  }

  push(localPath, remotePath) {
    return this.#run(["push", localPath, remotePath]);
  }

  static list() {}

  static waitFor(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
