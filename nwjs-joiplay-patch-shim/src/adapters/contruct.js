import { ShimError } from "jpt-commons/errors";
import { getDefaultPatchDir, createShimFile, packGame } from "jpt-commons/rga";
import {
  readTemplate,
  fill,
  replaceScriptTag,
  injectAfter,
} from "../render.js";
import {
  verifyPatches,
  reportVerification,
  assertPatchesMatch,
  serializePatches,
} from "../verify-patches.js";
import path from "path";
import { mkdirSync } from "fs";

export async function detectContruct3(tree) {
  const evidence = [];

  const hasPackageNw = await tree.exists("package.nw");

  if (hasPackageNw) {
    evidence.push("package.nw found, game content is packed in a single file");
  }

  let mainPath = null;
  let exportMatches = [],
    unsafeModuleFeatures = [];
  if (await tree.exists("index.html")) {
    const index = await tree.readText("index.html");
    if (
      /<meta[^>]+name=["']generator["'][^>]+content=["'][^"']*Scirra Construct/i.test(
        index,
      )
    ) {
      evidence.push(
        "index.html generator meta tag indicates Scirra Construct ",
      );
    }

    mainPath = (await tree.exists("scripts/main.js"))
      ? "scripts/main.js"
      : null;
    if (mainPath) {
      if (await tree.exists("scripts/supportcheck.js")) {
        evidence.push("scripts/supportcheck.js present");
      }

      const main = await tree.readText(mainPath);

      exportMatches = [...main.matchAll(/exportType\s*:\s*["']nwjs["']/g)];

      const unsafeModuleFeatures = [];
      if (/\bimport\s+/.test(main)) unsafeModuleFeatures.push("static import");
      if (/\bimport\s*\(/.test(main))
        unsafeModuleFeatures.push("dynamic import");
      if (/\bimport\.meta\b/.test(main))
        unsafeModuleFeatures.push("import.meta");
    }
  }

  return {
    engine: "construct",
    adapter: "construct3-html5",
    decisive: evidence.some(
      (e) => e.includes("generator meta") || e.includes("package.nw"),
    ),
    status:
      hasPackageNw ||
      (exportMatches.length === 1 && unsafeModuleFeatures.length === 0)
        ? "supported"
        : "unsupported",
    evidence,
    warnings: [
      ...(exportMatches.length && exportMatches.length !== 1
        ? [
            `Expected exactly one exportType: "nwjs" declaration, found ${exportMatches.length}`,
          ]
        : []),
      ...(unsafeModuleFeatures.length
        ? [`Found unsafe module features: ${unsafeModuleFeatures.join(", ")}`]
        : []),
      ...(hasPackageNw
        ? [
            "package.nw is present, but Construct 3 games should be exported as a folder, let me test with the .rga patch",
          ]
        : []),
    ],
    metadata: {
      entryPoint: hasPackageNw ? "package.nw" : "index.html",
      mainPath,
      exportMatchCount: exportMatches.length,
      unsafeModuleFeatures,
    },
  };
}

// DEPRECATED
async function patchIndexHtml(tree, detectionResult, options = {}) {
  // Start from the GAME's index.html and swap out only the boot script.
  // The template is a replacement for one <script> tag.
  const template = await readTemplate("./adapters/construct3-html5.html");

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

  const mainPath = "scripts/main.js";

  // Refuses on zero or multiple matches rather than guessing.
  let patchedIndex = fill(template, {
    MAIN_PATH: mainPath,
    CONTROLLER_SCRIPT: controllerScript,
    GAME_NAME: tree.gameName || "Unknown Game",
  });

  return {
    entryPoint,
    files: [{ path: entryPoint, content: patchedIndex }],
    createdFiles: [entryPoint],
    modifiedFiles: [],
    removedFiles: [],
  };
}

// TODO: Mutualize with packPatchRpgMakerMz, packPatchImpact, etc. to reduce duplication
export async function packConstruct3(
  tree,
  detectionResult,
  options = { debug: true, addPatchedSuffix: true },
) {
  // game.cfg        required by the format
  // patches.json    the engine fix + any injection anchors
  // shim.js         only when new code is needed
  // keymap.json     only with an input profile
  // gamepad.json    only with an input profile

  const isDryRun = options.dryRun || false;

  const patchDir = getDefaultPatchDir(tree.root, tree.gameName);
  if (!isDryRun) mkdirSync(patchDir, { recursive: true });

  // this is the game.cfg
  const baseName = tree.gameName || "Unknown Game";
  const gameTitle = baseName + (options.addPatchedSuffix ? " PATCHED" : "");
  const gameId = baseName.replace(/[^a-zA-Z0-9]/g, "") || "UnknownGame";
  const gameType = detectionResult.engine || "html";
  const gameCfgContent = `title=${gameTitle}\nid=${gameId}\nexecFile=index.html\ntype=${gameType}`;

  // this is the shim.js
  const shimJsContentTemplate = await readTemplate("./adapters/utils/shim.js");
  const shimJsContent = fill(shimJsContentTemplate, {
    ENGINE: detectionResult.engine,
  });

  // this is patches.json
  const patchesJsonContent = {};
  patchesJsonContent[`${gameType}`] = [
    {
      file: "scripts/main.js",
      key: 'exportType:"nwjs"',
      value:
        'exportType:(await(globalThis.__rgMediaMapReady||Promise.resolve()),"html5")',
    },
    {
      file: "index.html",
      ...injectAfter(
        '<script src="scripts/supportcheck.js"></script>',
        '<script src="shim.js"></script>',
      ),
    },
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
    gameCfg = await createShimFile("game.cfg", gameCfgContent, patchDir);
    shimJs = await createShimFile("shim.js", shimJsContent, patchDir);
    patchesJson = await createShimFile(
      "patches.json",
      serializePatches(patchesJsonContent),
      patchDir,
    );

    const gameContent = {
      where: patchDir,
      files: [gameCfg, shimJs, patchesJson],
    };

    packPatch = await packGame(
      gameContent.where,
      tree.gameName,
      gameContent.files,
      options,
    );
  }

  return {
    packPatch: isDryRun ? null : packPatch,
    files: [gameCfg, shimJs, isDryRun ? null : patchesJson].filter(Boolean),
    patchesJsonContent,
  };
}

export async function shimContruct3(tree, detectionResult, options = {}) {
  const { packPatch, files } = await packConstruct3(
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
