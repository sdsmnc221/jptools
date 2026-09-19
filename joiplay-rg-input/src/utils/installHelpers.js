import path from "node:path";
import { AdbDevice } from "jpt-commons/adb-device";
import { JP_NAMESPACE } from "jpt-commons/utils/constants";

const checkPreconditions = (adbDevice, jpGameDir) => {
  const deviceReachable = adbDevice.reachable();
  const jpRunning = adbDevice.isAppRunning(JP_NAMESPACE);
  const targetDirExists = adbDevice.exists(jpGameDir);
  const gamepadExisting = adbDevice.exists(
    path.join(jpGameDir, "gamepad.json"),
  );
  const keymapExisting = adbDevice.exists(path.join(jpGameDir, "keymap.json"));

  return {
    jpGameDir,
    deviceReachable,
    jpRunning,
    targetDirExists,
    gamepadExisting,
    keymapExisting,
  };
};

const formatChecks = ({
  deviceReachable,
  jpRunning,
  targetDirExists,
  gamepadExisting,
  keymapExisting,
  jpGameDir,
}) => {
  console.log("Verifying...");
  console.log(`
        Device reachable:         ${deviceReachable}
        JoiPlay not running:      ${jpRunning}
        Target directory exists:  ${targetDirExists ? "yes" : "does not exist, will create"}
        Will write gamepad.json and keymap.json to
          ${jpGameDir}
            gamepad.json   ${gamepadExisting ? "exists -> will be overwritten" : "does not exist"}
            keymap.json    ${keymapExisting ? "exists -> will be overwritten" : "does not exist"}   
      `);

  console.log("Verification complete");
};

export { checkPreconditions, formatChecks };
