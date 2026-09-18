// heck i don't want onscreen controls
import path from "node:path";
import readline from "node:readline/promises";
import { execFileSync, spawnSync } from "node:child_process";
import { JP_NAMESPACE, JP_GAME_BASE } from "jpt-commons/utils/constants";
import { mkdirSync, statSync } from "fs";
import { stdin as input, stdout as output } from "node:process";
import {
  isDevicePlugged,
  listDevices,
  AdbDevice,
} from "jpt-commons/adb-device";
import { GameTree } from "jpt-commons/game-tree";
import { createShimFile, packGame, getDefaultPatchDir } from "jpt-commons/rga";
import { gameId } from "jpt-commons/utils";

import { buildKeymap } from "./keymap.js";
import { buildGamepad } from "./gamepad.js";
import { PROFILES, mergeProfile } from "../src/profiles.js";

import { confirm, choose, ask } from "./utils/prompts.js";
import { checkPreconditions, formatChecks } from "./utils/installHelpers.js";

const writeInputPair = async ({
  targetDirExists,
  selectedDevice,
  jpGameDir,
  gameDir,
  profile,
  dryRun,
}) => {
  if (targetDirExists === 0) {
    console.log("Target directory exists.");
  } else {
    console.log("Target directory does not exist, will create.");
    selectedDevice.mkdir(jpGameDir);
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
      selectedDevice.push(file, jpGameDir);
      console.log(`Pushed file: ${file} to device: ${selectedDevice}`);
    }

    return "ok, installation completed";
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

    return "ok, dry run completed";
  }
};

const gatherInteractively = async (gameDir) => {
  const rl = readline.createInterface({ input, output });
  try {
    console.log("Entering interactive plug mode installation.");
    console.log("Plug your device into the computer.");

    // Check if the device is plugged via adb
    await isDevicePlugged();

    console.log("Device detected via adb.");

    // List all connected devices via adb
    const devices = await listDevices();
    for (let i = 0; i < devices.length; i++) {
      console.log(`     [${i + 1}] ${devices[i]})`);
    }

    // Ask the user to choose a device from the list of connected devices
    const deviceAnswer = await choose(rl, "Which device? ", devices);
    console.log(`Selected device answer: ${deviceAnswer}`);
    if (!deviceAnswer) {
      console.log("No device selected or wrong choice. Aborting installation.");
      return;
    }

    // Initialize the selected device using the AdbDevice class
    // Check for if device is in a ready state
    const selectedDevice = new AdbDevice(deviceAnswer); // pin --serial ?
    if (selectedDevice.state().status !== 0) {
      console.log(
        `Selected device is not in a ready state. Current state: ${selectedDevice.state().status}. Aborting installation.`,
      );
      return;
    }

    // Begin the gathering
    // Confirm the game folder with the user
    const confirmGameFolderAnswer = await confirm(
      rl,
      `Is this the correct game folder? (${gameDir})`,
      true,
    );
    if (!confirmGameFolderAnswer.toLowerCase().match(/^y/i)) {
      console.log("Aborting installation.");
      return;
    }

    // Confirm the title with the user
    console.log("Title as it appears in JoiPlay: ", path.basename(gameDir));
    const titleAnswer = await ask(
      rl,
      `   Confirm or enter the correct title. This is important, as a typo in this title may cause stale mapping.`,
      { default: path.basename(gameDir) },
    );

    // Confirm the game ID and directory with the user (IMPORTANT)
    let jpGameId, jpGameDir;
    let supposedCorrectAnswer =
      titleAnswer.trim() === "" ? path.basename(gameDir) : titleAnswer.trim();

    jpGameId = gameId(supposedCorrectAnswer.trim());
    jpGameDir = path.join(JP_GAME_BASE, jpGameId);

    const letTheUserTryAnswer = await ask(
      rl,
      "Correct? Enter to agree, else type the correct gameId. ",
      {
        default: jpGameId,
        maxRetries: 3,
        validate: (input) => input.trim() !== "" || "Game ID cannot be empty.",
        bounceLog: (answer) => `
          JoiPlay game ID        -> ${gameId(answer.trim())}
          JoiPlay game directory -> ${path.join(JP_GAME_BASE, gameId(answer.trim()))}
        `,
      },
    );

    jpGameId = gameId(letTheUserTryAnswer.trim());
    jpGameDir = path.join(JP_GAME_BASE, jpGameId);
    console.log(`
          JoiPlay game ID        -> ${jpGameId}
          JoiPlay game directory -> ${jpGameDir}
        `);

    const proceedWithLastAttempt = await confirm(
      rl,
      "Proceed with your last attempt? ",
      false,
    );
    if (!proceedWithLastAttempt.toLowerCase().match(/^y/i)) {
      console.log("Aborting installation.");
      return;
    }

    if (jpGameId.trim() === "") {
      console.log("Invalid game ID, it can't be empty. Aborting installation.");
      return;
    }

    const {
      deviceReachable,
      jpRunning,
      targetDirExists,
      gamepadExisting,
      keymapExisting,
    } = checkPreconditions(selectedDevice, jpGameDir);

    formatChecks({
      deviceReachable,
      jpRunning,
      targetDirExists,
      gamepadExisting,
      keymapExisting,
      jpGameDir,
    });

    if (deviceReachable !== 0) {
      console.log("Device not reachable. Aborting installation.");
      return;
    }

    if (jpRunning === 0) {
      console.log("JoiPlay is still running. Aborting installation.");
      return;
    }

    const proceedConsent = await confirm(
      rl,
      "Proceed with installation? ",
      false,
    );

    // Check if the user consented to proceed
    if (!proceedConsent.toLowerCase().match(/^y/i)) {
      console.log("Installation aborted by user.");
      return;
    }

    return Promise.resolve({
      selectedDevice: device,
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
    result = await gatherInteractively(gameDir, { profile });
  }

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

    return await writeInputPair({
      selectedDevice,
      jpGameDir,
      gamepad,
      keymap,
      dryRun,
      targetDirExists,
    });
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
