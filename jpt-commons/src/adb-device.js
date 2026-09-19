import { spawnSync, execFileSync } from "child_process";

export class AdbDevice {
  constructor(serial) {
    this.serial = serial;
  }

  #run(args) {
    const { status, signal, output, pid, stdout, stderr } = spawnSync(
      "adb",
      ["-s", this.serial, ...args],
      {
        encoding: "utf-8",
      },
    );

    return { status, signal, output, pid, stdout, stderr };
  }

  state() {
    const { stdout } = this.#run(["get-state"]);
    return stdout.trim();
  }

  isAppRunning(packageName) {
    const { status } = this.#run(["shell", "pidof", packageName]);
    return status === 0;
  }

  exists(remotePath) {
    const { status } = this.#run(["shell", "ls", remotePath]);
    return status === 0;
  }

  mkdirp(remotePath) {
    try {
      this.#run(["shell", "mkdir", "-p", remotePath]);
    } catch (error) {
      console.log(`Failed to create directory ${remotePath}:`, error);
      throw error;
    }
  }

  push(localPath, remotePath) {
    return this.#run(["push", localPath, remotePath]);
  }

  static list() {
    const devices = execFileSync("adb", ["devices"])
      .toString()
      .split("\n")
      .slice(1)
      .filter((line) => line.trim() !== "")
      .map((line) => line.split("\t")[0]);

    return devices;
  }

  static isDevicePlugged() {
    try {
      execFileSync("adb", ["wait-for-device"], {
        timeout: 10_000,
      });
    } catch (error) {
      if (error.code === "ETIMEDOUT") {
        return new Error("Device not detected within the timeout period.");
      } else if (error.code === "ENOENT") {
        return new Error(
          "ADB not found. Please ensure adb is installed and in your PATH.",
        );
      } else {
        throw error;
      }
    }
  }
}
