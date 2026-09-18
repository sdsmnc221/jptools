import path from "node:path";
import { AdbDevice } from "jpt-commons/adb-device";
import { JP_NAMESPACE } from "jpt-commons/utils/constants";

const checkPreconditions = (device, jpGameDir) => {
  console.log("Verifying...");
  const adbDevice = new AdbDevice(device);
  const { status: deviceReachable } = adbDevice.state();
  const { status: jpRunning } = adbDevice.isAppRunning(JP_NAMESPACE);
  const { status: targetDirExists } = adbDevice.exists(jpGameDir);
  const { status: gamepadExisting } = adbDevice.exists(
    path.join(jpGameDir, "gamepad.json"),
  );
  const { status: keymapExisting } = adbDevice.exists(
    path.join(jpGameDir, "keymap.json"),
  );

  return {
    device,
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
};

export { checkPreconditions, formatChecks };
