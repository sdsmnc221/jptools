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

  #runOrThrow(args, description) {
    const { status, stdout, stderr } = this.#run(args);
    if (status !== 0) {
      throw new Error(`${description} failed: ${stderr.trim()}`);
    }

    return stdout;
  }

  state() {
    const { stdout } = this.#run(["get-state"]);
    return stdout.trim();
  }

  reachable() {
    return this.state() === "device";
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
    return this.#runOrThrow(
      ["shell", "mkdir", "-p", remotePath],
      `create directory ${remotePath}`,
    );
  }

  push(localPath, remotePath) {
    return this.#runOrThrow(
      ["push", localPath, remotePath],
      `push ${localPath} to ${remotePath}`,
    );
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

      return true;
    } catch (error) {
      if (error.code === "ETIMEDOUT") {
        throw new Error("Device not detected within the timeout period.");
      } else if (error.code === "ENOENT") {
        throw new Error(
          "ADB not found. Please ensure adb is installed and in your PATH.",
        );
      } else {
        throw error;
      }
    }
  }
}
