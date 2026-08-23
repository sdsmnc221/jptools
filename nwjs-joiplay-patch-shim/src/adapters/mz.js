import { ShimError } from "../errors.js";
import {
  readTemplate,
  fill,
  replaceScriptTag,
  injectBefore,
} from "../render.js";
import {
  verifyPatches,
  reportVerification,
  assertPatchesMatch,
  serializePatches,
} from "../verify-patches.js";
import path from "path";
import { mkdirSync } from "fs";

const PLUGIN_RE =
  /^\s*\{"name":"(?<name>[^"]+)","status":(?<status>true|false)/gm;

const MZ_RULES = [
  {
    plugin: "SimpleMusicPlayer",
    why: "isSongFileExists() does a Node fs existence check",
    patches: () => [
      {
        file: "js/plugins/SimpleMusicPlayer.js",
        key: "isSongFileExists(filePath) {",
        value:
          'isSongFileExists(filePath) { if (typeof require !== "function") return true;',
      },
    ],
  },
  // { plugin: "SomeOtherPlugin", patches: (n) => [disablePlugin(n)] },
];

function activePlugins(pluginsJs) {
  return [...pluginsJs.matchAll(PLUGIN_RE)]
    .filter((match) => match.groups.status === "true")
    .map((match) => match.groups.name);
}

function disablePlugin(name) {
  return {
    key: `{"name":"${name}","status":true`,
    value: `{"name":"${name}","status":false`,
  };
}

export async function detectRgpMakerMz(tree) {
  const requiredFiles = [
    "index.html",
    "js/main.js",
    "js/rmmz_core.js",
    "js/rmmz_managers.js",
    "js/plugins.js",
  ];

  for (const file of requiredFiles) {
    if (!(await tree.exists(file))) return null;
  }

  const core = await tree.readText("js/rmmz_core.js");
  if (!core.includes("MZ") || !core.includes("RPGMAKER_NAME")) return null;

  const pluginsJs = await tree.readText("js/plugins.js");
  const plugins = activePlugins(pluginsJs);

  return {
    engine: "rpgmmz",
    adapter: "rpgmaker-mz-html5",
    decisive: true,
    status: "supported",
    evidence: [
      `required files present`,
      `js/rmmz_core.js contains MZ and RPGMAKER_NAME`,
    ],
    warnings: [
      ...(plugins.includes("FOSSIL")
        ? ["FOSSIL will be booted directly thru index-patch.html"]
        : []),
      ...(plugins.includes("WTE_BootDiagnostic")
        ? [
            "WTE_BootDiagnostic will be disabled in memory //TODO: i dont have the fix for this now besides disabling",
          ]
        : []),
      ...(plugins.includes("SimpleMusicPlayer")
        ? [
            "SimpleMusicPlayer will be transformed through PluginManager.loadScript //TODO: im not sure as of now how many plugin needs to be tranformed via this path",
          ]
        : []),
    ],
    metadata: {
      entryPoint: "index.html",
      activePlugins: plugins,
      fossilEnabled: plugins.includes("FOSSIL"),
      diagnosticEnabled: plugins.includes("WTE_BootDiagnostic"),
      musicEnabled: plugins.includes("SimpleMusicPlayer"),
    },
  };
}

// DEPRECATED
async function patchIndexHtml(tree, detectionResult, options = {}) {
  // Start from the GAME's index.html and swap out only the boot script.
  // The template is a replacement for one <script> tag.
  const index = await tree.readText("index.html");
  const template = await readTemplate("./adapters/rpgmaker-mz-html5.html");

  // Where the entry file lands, relative to the game root. A subdirectory keeps
  // every shim file in one place and makes `remove` a single rmdir, but then
  // all inherited relative URLs need re-basing
  const dir = "";
  const entryPoint = dir ? `${dir}/index-patch.html` : "index-patch.html";

  // The controller bridge ships with the shim, so it sits beside the entry file
  const shimHref = dir ? `${dir}/shim` : "shim";
  const controllerScript = options.profile
    ? `<script src="${shimHref}/rg-rotate-input.js"></script>\n  `
    : "";

  // If fossilEnabled is false, there's nothing to swap: a
  // stock MZ game boots js/main.js normally and the entry file
  // is a plain copy plus the shim tag.
  const mainScript = detectionResult?.metadata?.fossilEnabled
    ? `<script src="js/plugins/FOSSIL.js"></script>`
    : `<script src="js/main.js"></script>\n  `;

  const fragment = fill(template, {
    CONTROLLER_SCRIPT: controllerScript,
    MAIN_SCRIPT: mainScript,
  });

  let patchedIndex;

  patchedIndex = replaceScriptTag(index, "main.js", fragment);

  const files = [{ path: entryPoint, content: patchedIndex }];

  return {
    entryPoint,
    files,
    createdFiles: files.map((f) => f.path),
    modifiedFiles: [],
    removedFiles: [],
  };
}

export async function packPatchRpgMakerMz(
  tree,
  detectionResult,
  options = { debug: true, addPatchedSuffix: true },
) {
  const isDryRun = options.dryRun || false;
  // game.cfg        required by the format
  // patches.json    the engine fix + any injection anchors
  // shim.js         only when new code is needed
  // keymap.json     only with an input profile
  // gamepad.json    only with an input profile

  const patchDir = path.join(tree.root, "..", tree.gameName + "_patch");
  if (!isDryRun) mkdirSync(patchDir, { recursive: true });

  // this is the game.cfg
  const baseName = tree.gameName || "Unknown Game";
  const gameTitle = baseName + (options.addPatchedSuffix ? " PATCHED" : "");
  const gameId = baseName.replace(/[^a-zA-Z0-9]/g, "") || "UnknownGame";
  const gameType = detectionResult.engine || "html";
  const gameCfgContent = `title=${gameTitle}\nid=${gameId}\nexecFile=index.html\ntype=${gameType}`;

  // this is the shim.js
  const shimJsContentTemplate = await readTemplate(
    "./adapters/utils/shim.js.txt",
  );
  const shimJsContent = fill(shimJsContentTemplate, {
    ENGINE: detectionResult.engine,
  });

  // this is patches.json
  const patchesJsonContent = {};
  const patches = MZ_RULES.filter((r) =>
    detectionResult?.metadata?.activePlugins?.includes(r.plugin),
  ).flatMap((r) => r.patches(r.plugin));
  patchesJsonContent[`${gameType}`] = [
    {
      file: "index.html",
      ...injectBefore(
        '<script type="text/javascript" src="js/main.js"></script>',
        '<script src="shim.js"></script>',
      ),
    },
    ...patches,
  ];

  const verification = await verifyPatches(tree, patchesJsonContent);

  let gameCfg, shimJs, patchesJson, packPatch;
  if (isDryRun) {
    console.log("Dry run: not writing  anything to disk");
    console.log("Dry run: content of game.cfg would be:");
    console.log(gameCfgContent);
    console.log("Dry run: content of shim.js would be:");
    console.log(shimJsContent);
    console.log("Dry run: patches.json content would be:");
    console.log(JSON.stringify(patchesJsonContent, null, 2));
    console.log("Patch key verification (matches in the game):");
    reportVerification(verification);
  } else {
    assertPatchesMatch(verification);
    gameCfg = await tree.createShimFile("game.cfg", gameCfgContent, patchDir);

    shimJs = await tree.createShimFile("shim.js", shimJsContent, patchDir);

    patchesJson = await tree.createShimFile(
      "patches.json",
      serializePatches(patchesJsonContent),
      patchDir,
    );

    const gameContent = {
      where: patchDir,
      files: [gameCfg, shimJs, patchesJson],
    };

    packPatch = await tree.packGame(gameContent, {
      ext: ".rga",
    });
  }

  return {
    packPatch: isDryRun ? null : packPatch,
    files: [gameCfg, shimJs, isDryRun ? null : patchesJson].filter(Boolean),
  };
}

export async function shimRpgMakerMz(tree, detectionResult, options = {}) {
  const { packPatch, files } = await packPatchRpgMakerMz(
    tree,
    detectionResult,
    options,
  );

  return {
    entryPoint: "game.cfg",
    files: [],
    createdFiles: files,
    modifiedFiles: [],
    removedFiles: [],
  };
}
