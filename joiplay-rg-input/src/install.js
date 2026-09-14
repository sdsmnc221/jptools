// heck i don't want onscreen controls
import path from "node:path";
import readline from "node:readline/promises";
import { execFileSync, spawnSync } from "node:child_process";
import { JP_NAMESPACE, JP_GAME_BASE } from "jpt-commons/utils/constants";
import { mkdirSync, statSync } from "fs";
import { stdin as input, stdout as output } from "node:process";
import { GameTree } from "jpt-commons/game-tree";
import { createShimFile, packGame, getDefaultPatchDir } from "jpt-commons/rga";
import { gameId } from "jpt-commons/utils";

import { buildKeymap } from "./keymap.js";
import { buildGamepad } from "./gamepad.js";
import { PROFILES, mergeProfile } from "../src/profiles.js";

const deviceState = (device) =>
  execFileSync("adb", ["-s", device, "get-state"]).toString().trim();

const installWhilePlugged = async (gameDir) => {
  const rl = readline.createInterface({ input, output });
  try {
    console.log("Entering interactive plug mode installation.");
    console.log("Plug your device into the computer.");

    // Check if the device is plugged via adb
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

    console.log("Device detected via adb.");

    const devices = execFileSync("adb", ["devices"])
      .toString()
      .split("\n")
      .slice(1)
      .filter((line) => line.trim() !== "")
      .map((line) => line.split("\t")[0]);
    for (let i = 0; i < devices.length; i++) {
      console.log(
        `     [${i + 1}] ${devices[i]}: (${deviceState(devices[i])})`,
      );
    }

    const deviceAnswer = await rl.question("Which device? ");
    const deviceIndex =
      deviceAnswer.trim() === "" ? 0 : parseInt(deviceAnswer, 10) - 1;
    if (
      !Number.isInteger(deviceIndex) ||
      deviceIndex < 0 ||
      deviceIndex >= devices.length
    ) {
      console.log("No device selected or wrong choice. Aborting installation.");
      return;
    } else if (deviceState(devices[deviceIndex]) !== "device") {
      console.log(
        `Selected device is not in a ready state. Current state: ${deviceState(
          devices[deviceIndex],
        )}. Aborting installation.`,
      );
      return;
    }

    const selectedDevice = devices[deviceIndex]; // pin --serial ?
    console.log(`Selected device: ${selectedDevice}`);

    console.log(`Game folder: ${gameDir}`);
    const gameFolderAnswer = await rl.question("Is this correct? [Y/n] ");

    if (gameFolderAnswer.toLowerCase().match(/^n/i)) {
      console.log("Aborting installation.");
      return;
    }

    console.log("Title as it appears in JoiPlay: ", path.basename(gameDir));
    const titleAnswer = await rl.question(
      `   Confirm or enter the correct title. This is important, as a typo in this title may cause stale mapping.`,
    );

    let jpGameId, jpGameDir;
    const maxRetry = 3;
    let tryCount = 0;
    let correctAnswer =
      titleAnswer.trim() === "" ? path.basename(gameDir) : titleAnswer.trim();
    while (correctAnswer.trim() !== "" && tryCount < maxRetry) {
      jpGameId = gameId(correctAnswer.trim());
      jpGameDir = path.join(JP_GAME_BASE, jpGameId);
      console.log(`
        JoiPlay game ID        -> ${jpGameId}
        JoiPlay game directory -> ${jpGameDir}
      `);
      tryCount++;
      if (tryCount < maxRetry) {
        correctAnswer = await rl.question(
          "Correct? Enter to agree, else type the correct gameId. ",
        );
      } else {
        correctAnswer = await rl.question(
          "Maximum retries reached. Should we proceed with your last attempt? The correct game id is...?",
        );

        jpGameId = gameId(correctAnswer.trim());
        jpGameDir = path.join(JP_GAME_BASE, jpGameId);
        console.log(`
          JoiPlay game ID        -> ${jpGameId}
          JoiPlay game directory -> ${jpGameDir}
        `);

        const proceedWithLastAttempt = await rl.question(
          "Proceed with your last attempt? [y/N] ",
        );
        if (!proceedWithLastAttempt.toLowerCase().match(/^y/i)) {
          console.log("Aborting installation.");
          return;
        }

        break;
      }
    }

    if (jpGameId.trim() === "") {
      console.log("Invalid game ID, it can't be empty. Aborting installation.");
      return;
    }

    console.log("Verifying...");
    const { status: deviceReachable } = spawnSync("adb", [
      "-s",
      selectedDevice,
      "get-state",
    ]);
    const { status: jpRunning } = spawnSync("adb", [
      "-s",
      selectedDevice, // serial
      "shell",
      "pidof",
      JP_NAMESPACE,
    ]);
    const { status: targetDirExists } = spawnSync("adb", [
      "-s",
      selectedDevice,
      "shell",
      "ls",
      jpGameDir,
    ]);
    const { status: gamepadExisting } = spawnSync("adb", [
      "-s",
      selectedDevice,
      "shell",
      "ls",
      path.join(jpGameDir, "gamepad.json"),
    ]);
    const { status: keymapExisting } = spawnSync("adb", [
      "-s",
      selectedDevice,
      "shell",
      "ls",
      path.join(jpGameDir, "keymap.json"),
    ]);

    console.log(`
        Device reachable:         ${deviceReachable === 0}
        JoiPlay not running:      ${jpRunning !== 0}
        Target directory exists:  ${targetDirExists === 0 ? "yes" : "does not exist, will create"}
        Will write gamepad.json and keymap.json to
          ${jpGameDir}
            gamepad.json   ${gamepadExisting === 0 ? "exists -> will be overwritten" : "does not exist"}
            keymap.json    ${keymapExisting === 0 ? "exists -> will be overwritten" : "does not exist"}   
      `);

    console.log("Verification complete");

    if (deviceReachable !== 0 || jpRunning === 0) {
      console.log(
        "Device not reachable or JoiPlay is still running. Aborting installation.",
      );
      return;
    }

    const proceedConsent = await rl.question(
      "Proceed with installation? [y/N] ", // Default is NO
    );

    // Check if the user consented to proceed
    if (!proceedConsent.toLowerCase().match(/^y/i)) {
      console.log("Installation aborted by user.");
      return;
    }

    return Promise.resolve({
      selectedDevice,
      jpGameId,
      jpGameDir,
      targetDirExists,
      gamepadExisting,
      keymapExisting,
    });
  } finally {
    rl.close();
  }
};

const install = async (
  gameDir,
  { profile = "rg-rotate", dryRun, plugMode } = {},
) => {
  let result;
  if (plugMode) {
    result = await installWhilePlugged(gameDir, { profile });
  }

  console.log(result);

  if (!result && plugMode) {
    console.log(
      "Installation failed while in interactive device-plugged mode.",
    );
    return;
  } else if (result && plugMode) {
    const {
      selectedDevice,
      jpGameId,
      jpGameDir,
      targetDirExists,
      gamepadExisting,
      keymapExisting,
    } = result;

    if (targetDirExists === 0) {
      console.log("Target directory exists.");
    } else {
      console.log("Target directory does not exist, will create.");
      execFileSync("adb", [
        "-s",
        selectedDevice,
        "shell",
        "mkdir",
        "-p",
        jpGameDir,
      ]);
    }

    console.log("Proceeding with installation in the target directory.");
    const tree = new GameTree(gameDir);
    const stagingDir = getDefaultPatchDir(tree.root, tree.gameName);
    mkdirSync(stagingDir, { recursive: true });
    const resolvedProfile = mergeProfile(PROFILES[profile] || {});
    const keymap = buildKeymap(resolvedProfile);
    const gamepad = buildGamepad(resolvedProfile);

    if (!dryRun) {
      const files = [
        await createShimFile(
          "keymap.json",
          `${JSON.stringify(keymap, null, 2)}\n`,
          stagingDir,
        ),

        await createShimFile(
          "gamepad.json",
          JSON.stringify(gamepad, null, 2),
          stagingDir,
        ),
      ];

      for (const file of files) {
        console.log(`Created file: ${file}`);
        execFileSync("adb", ["-s", selectedDevice, "push", file, jpGameDir]);
        console.log(`Pushed file: ${file} to device: ${selectedDevice}`);
      }
    } else {
      console.log(
        `Dry run: would create keymap.json in ${jpGameDir} for device profile ${profile}`,
      );
      console.log(keymap);

      console.log(`----------`);
      console.log(
        `Dry run: would create gamepad.json in ${jpGameDir} for device profile ${profile}.`,
      );
      console.log(gamepad);
    }

    return "ok";
  }

  const tree = new GameTree(gameDir);
  const stagingDir = getDefaultPatchDir(tree.root, tree.gameName);
  mkdirSync(stagingDir, { recursive: true });

  const resolvedProfile = mergeProfile(PROFILES[profile] || {});

  const keymap = buildKeymap(resolvedProfile);
  const gamepad = buildGamepad(resolvedProfile);

  if (!dryRun) {
    const files = [
      await createShimFile(
        "keymap.json",
        `${JSON.stringify(keymap, null, 2)}\n`,
        stagingDir,
      ),
      await createShimFile(
        "gamepad.json",
        JSON.stringify(gamepad, null, 2),
        stagingDir,
      ),
    ];

    await packGame(tree.root, tree.gameName, files, {
      defaultPatchFilename: "patch_input.rga",
    });
  } else {
    console.log(
      `Dry run: would create keymap.json in ${stagingDir} for device profile ${profile}`,
    );
    console.log(keymap);
    console.log(`----------`);
    console.log(`Dry run: would create gamepad.json in ${stagingDir}.`);
    console.log(gamepad);
  }

  return "ok";
};

export { install };
