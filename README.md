[RELEASES](https://github.com/sdsmnc221/jptools/releases)


```text
joiplay.tools/
    pnpm-workspace.yaml
    jpt-commons/                    # shared package
      package.json                    # name: "jpt-commons"
      src/
        errors.js                     # ShimError, GameTreeError, UnsupportedError, AmbigousError
        game-tree.js                  # file-IO primitives only
        rga.js                        # packGame + createShimFile + the <gameName>_patch/ convention
        verify-entry.js               # generic "read entry from installed .rga, diff against fresh"
    nwjs-joiplay-patch-shim/
      package.json                    # "jpt-commons": "workspace:*"
      src/
        adapters/…
        render.js                     # HTML templating, nothing else needs it
        verify-patches.js             # patches.json key-matching is its own domain
    joiplay-rg-input/
      package.json                    # "jpt-commons": "workspace:*"
      src/
        profiles.js                   # global default + per-game button overrides
        keymap.js, gamepad.js         # generation from a profile
        capture.js                    # the button-capture page
    survey-tool/
      package.json                    # "jpt-commons": "workspace:*"
    wifi-ddebug/
      capture-log.sh
    pck-converter/                    # well look at this python project
```
